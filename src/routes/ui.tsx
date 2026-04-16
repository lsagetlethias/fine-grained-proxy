import { Context } from "hono";
import { swaggerUI } from "@hono/swagger-ui";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

import { decryptBlob, encryptBlob } from "../crypto/blob.ts";
import { decodePublicConfig, encodePublicConfig } from "../crypto/share.ts";
import { exchangeToken } from "../auth/client.ts";
import { ConfigPage } from "../ui/config-page.tsx";
import {
  type BodyFilter,
  checkAccess,
  matchBodyFilter,
  matchPath,
  parseScope,
  type Scope,
  type ScopeEntry,
} from "../middleware/scopes.ts";

let commitHash = "dev";
try {
  commitHash = Deno.readTextFileSync("static/version.txt").trim();
} catch {
  // no version.txt — run deno task build to generate it
}

function getRequestOrigin(c: Context): string {
  const forwardedProto = c.req.header("X-Forwarded-Proto");
  const forwardedHost = c.req.header("X-Forwarded-Host");

  if (forwardedHost) {
    const proto = forwardedProto ?? "https";
    return `${proto}://${forwardedHost}`;
  }

  return new URL(c.req.url).origin;
}

const DEFAULT_API_URL = "https://api.osc-fr1.scalingo.com";

const ErrorSchema = z.object({
  error: z.string(),
  message: z.string(),
}).openapi("Error");

const ObjectValueSchema = z.union([
  z.object({ type: z.literal("any"), value: z.unknown() }),
  z.object({ type: z.literal("wildcard") }),
  z.object({ type: z.literal("stringwildcard"), value: z.string() }),
  z.object({ type: z.literal("regex"), value: z.string() }),
  z.object({ type: z.literal("and"), value: z.array(z.unknown()) }),
  z.object({ type: z.literal("not"), value: z.unknown() }),
]);

const BodyFilterSchema = z.object({
  objectPath: z.string().min(1),
  objectValue: z.array(ObjectValueSchema).min(1),
});

const ScopeEntrySchema = z.object({
  methods: z.array(z.string().min(1)).min(1),
  pattern: z.string(),
  bodyFilters: z.array(BodyFilterSchema).optional(),
});

const ScopeSchema = z.union([z.string(), ScopeEntrySchema]);

const GenerateBodySchema = z.object({
  token: z.string().min(1).openapi({ example: "tk-us-xxxxxxxxxxxxxxxxxxxxxxxxxxxx" }),
  target: z.string().min(1).openapi({ example: "https://api.osc-fr1.scalingo.com" }),
  auth: z.string().min(1).openapi({
    example: "scalingo-exchange",
    description: "Auth mode: bearer, basic, scalingo-exchange, or header:{name}",
  }),
  scopes: z.array(ScopeSchema).openapi({
    example: ["GET:/v1/apps/*", "POST:/v1/apps/my-app/scale"],
    description: "List of scopes: string patterns or structured ScopeEntry objects",
  }),
  ttl: z.number().openapi({
    example: 3600,
    description: "Validity duration in seconds. 0 = no expiration",
  }),
}).openapi("GenerateBody");

const GenerateResponseSchema = z.object({
  url: z.string().openapi({ example: "https://fgp.example.com/eyJhbGci.../" }),
  key: z.string().openapi({ example: "a7f2c9d4-1234-5678-abcd-ef0123456789" }),
  blob: z.string().openapi({
    example: "eyJhbGci...",
    description: "Raw encrypted blob, for use with X-FGP-Blob header mode",
  }),
}).openapi("GenerateResponse");

const SaltResponseSchema = z.object({
  salt: z.string(),
}).openapi("SaltResponse");

const ListAppsBodySchema = z.object({
  token: z.string().min(1).openapi({
    example: "tk-us-xxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    description: "Scalingo API token (tk-us-...)",
  }),
  target: z.string().optional().openapi({
    example: "https://api.osc-fr1.scalingo.com",
    description: "Scalingo API URL (defaults to osc-fr1 if omitted)",
  }),
}).openapi("ListAppsBody");

const ListAppsResponseSchema = z.object({
  apps: z.array(z.string()).openapi({
    example: ["my-app", "other-app", "staging-app"],
  }),
}).openapi("ListAppsResponse");

const TestScopeBodySchema = z.object({
  method: z.string().min(1).openapi({ example: "GET" }),
  path: z.string().min(1).openapi({ example: "/v1/apps/my-app" }),
  scopes: z.array(ScopeSchema).min(1).openapi({
    example: ["GET:/v1/apps/*", "POST:/v1/apps/my-app/scale"],
  }),
  body: z.unknown().optional().openapi({
    description: "Optional JSON body for body filter testing",
  }),
}).openapi("TestScopeBody");

const TestScopeResultSchema = z.object({
  index: z.number(),
  matched: z.boolean(),
  methodMatch: z.boolean(),
  pathMatch: z.boolean(),
  bodyMatch: z.boolean().nullable(),
}).openapi("TestScopeResult");

const TestScopeResponseSchema = z.object({
  allowed: z.boolean(),
  results: z.array(TestScopeResultSchema),
}).openapi("TestScopeResponse");

const TestProxyBodySchema = z.object({
  method: z.string().min(1).openapi({ example: "GET" }),
  path: z.string().min(1).openapi({ example: "/v1/apps/my-app" }),
  token: z.string().min(1).openapi({ example: "tk-us-xxxxxxxxxxxxxxxxxxxxxxxxxxxx" }),
  target: z.string().min(1).openapi({ example: "https://api.osc-fr1.scalingo.com" }),
  auth: z.string().min(1).openapi({ example: "scalingo-exchange" }),
  scopes: z.array(ScopeSchema).min(1),
  body: z.unknown().optional(),
}).openapi("TestProxyBody");

const UpstreamResponseSchema = z.object({
  status: z.number(),
  body: z.unknown(),
}).openapi("UpstreamResponse");

const TestProxyResponseSchema = z.object({
  allowed: z.boolean(),
  reason: z.string().optional(),
  upstream: UpstreamResponseSchema.optional(),
}).openapi("TestProxyResponse");

const DecodeBodySchema = z.object({
  blob: z.string().min(1).openapi({ example: "eyJhbGci..." }),
  key: z.string().min(1).openapi({ example: "a7f2c9d4-1234-5678-abcd-ef0123456789" }),
}).openapi("DecodeBody");

const DecodeResponseSchema = z.object({
  target: z.string(),
  auth: z.string(),
  scopes: z.array(z.unknown()),
  ttl: z.number(),
  createdAt: z.number(),
  version: z.number(),
  tokenRedacted: z.string().openapi({
    example: "tk-us-****xxxx",
    description: "Token with only last 4 chars visible",
  }),
}).openapi("DecodeResponse");

const ShareEncodeBodySchema = z.object({
  target: z.string().min(1).openapi({ example: "https://api.osc-fr1.scalingo.com" }),
  auth: z.string().min(1).openapi({ example: "scalingo-exchange" }),
  scopes: z.array(ScopeSchema).min(1).openapi({ example: ["GET:/v1/apps/*"] }),
  ttl: z.number().openapi({ example: 3600 }),
  test: z.object({
    method: z.string(),
    path: z.string(),
    body: z.string().optional(),
  }).optional(),
}).openapi("ShareEncodeBody");

const ShareEncodeResponseSchema = z.object({
  encoded: z.string(),
  url: z.string(),
}).openapi("ShareEncodeResponse");

const ShareDecodeBodySchema = z.object({
  encoded: z.string().min(1),
}).openapi("ShareDecodeBody");

const ShareDecodeResponseSchema = z.object({
  target: z.string(),
  auth: z.string(),
  scopes: z.array(z.unknown()),
  ttl: z.number(),
  test: z.object({
    method: z.string(),
    path: z.string(),
    body: z.string().optional(),
  }).optional(),
}).openapi("ShareDecodeResponse");

// --- Route definitions ---

const decodeRoute = createRoute({
  method: "post",
  path: "/api/decode",
  tags: ["Configuration"],
  summary: "Decode an FGP blob",
  description:
    "Decrypts a blob with the provided client key and returns the config with redacted token.",
  request: {
    body: {
      required: true as const,
      content: { "application/json": { schema: DecodeBodySchema } },
    },
  },
  responses: {
    200: {
      description: "Decoded config with redacted token",
      content: { "application/json": { schema: DecodeResponseSchema } },
    },
    400: {
      description: "Invalid body",
      content: { "application/json": { schema: ErrorSchema } },
    },
    401: {
      description: "Unable to decrypt",
      content: { "application/json": { schema: ErrorSchema } },
    },
    500: {
      description: "Server misconfigured",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

const shareEncodeRoute = createRoute({
  method: "post",
  path: "/api/share/encode",
  tags: ["Configuration"],
  summary: "Encode a public config URL",
  description:
    "Compresses a config (without token) into a gzip+base64url string for sharing via ?c= parameter.",
  request: {
    body: {
      required: true as const,
      content: { "application/json": { schema: ShareEncodeBodySchema } },
    },
  },
  responses: {
    200: {
      description: "Encoded config and full URL",
      content: { "application/json": { schema: ShareEncodeResponseSchema } },
    },
    400: {
      description: "Invalid body",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

const shareDecodeRoute = createRoute({
  method: "post",
  path: "/api/share/decode",
  tags: ["Configuration"],
  summary: "Decode a public config URL",
  description: "Decompresses a gzip+base64url encoded config string back to its components.",
  request: {
    body: {
      required: true as const,
      content: { "application/json": { schema: ShareDecodeBodySchema } },
    },
  },
  responses: {
    200: {
      description: "Decoded public config",
      content: { "application/json": { schema: ShareDecodeResponseSchema } },
    },
    400: {
      description: "Invalid body or unable to decode",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

const saltRoute = createRoute({
  method: "get",
  path: "/api/salt",
  tags: ["Configuration"],
  summary: "Get server salt",
  description: "Returns the server salt used for PBKDF2 key derivation.",
  responses: {
    200: {
      description: "Server salt",
      content: { "application/json": { schema: SaltResponseSchema } },
    },
  },
});

const generateRoute = createRoute({
  method: "post",
  path: "/api/generate",
  tags: ["Configuration"],
  summary: "Generate an FGP URL",
  description:
    "Server-side encrypted URL generation. Creates a client key, encrypts the blob, returns URL + key.",
  request: {
    body: {
      required: true as const,
      content: { "application/json": { schema: GenerateBodySchema } },
    },
  },
  responses: {
    200: {
      description: "Generated URL and client key",
      content: { "application/json": { schema: GenerateResponseSchema } },
    },
    400: {
      description: "Invalid JSON body or missing fields",
      content: { "application/json": { schema: ErrorSchema } },
    },
    500: {
      description: "Server misconfigured",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

const listAppsRoute = createRoute({
  method: "post",
  path: "/api/list-apps",
  tags: ["Scalingo"],
  summary: "List Scalingo apps",
  description: "Scalingo helper: lists apps accessible with the provided token via token exchange.",
  request: {
    body: {
      required: true as const,
      content: { "application/json": { schema: ListAppsBodySchema } },
    },
  },
  responses: {
    200: {
      description: "Sorted list of app names",
      content: { "application/json": { schema: ListAppsResponseSchema } },
    },
    400: {
      description: "Invalid JSON body or missing fields",
      content: { "application/json": { schema: ErrorSchema } },
    },
    401: {
      description: "Token exchange failed",
      content: { "application/json": { schema: ErrorSchema } },
    },
    502: {
      description: "Upstream error",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

const testScopeRoute = createRoute({
  method: "post",
  path: "/api/test-scope",
  tags: ["Configuration"],
  summary: "Test scope matching",
  description:
    "Tests whether a method + path + optional body would be allowed by the given scopes.",
  request: {
    body: {
      required: true as const,
      content: { "application/json": { schema: TestScopeBodySchema } },
    },
  },
  responses: {
    200: {
      description: "Test results per scope",
      content: { "application/json": { schema: TestScopeResponseSchema } },
    },
    400: {
      description: "Invalid body",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

const testProxyRoute = createRoute({
  method: "post",
  path: "/api/test-proxy",
  tags: ["Configuration"],
  summary: "Test proxy end-to-end",
  description:
    "Checks scopes, authenticates, and forwards a real request to the target API. Returns the upstream response.",
  request: {
    body: {
      required: true as const,
      content: { "application/json": { schema: TestProxyBodySchema } },
    },
  },
  responses: {
    200: {
      description: "Proxy test result with upstream response",
      content: { "application/json": { schema: TestProxyResponseSchema } },
    },
    400: {
      description: "Invalid body",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

function validateObjectValue(ov: Record<string, unknown>, depth: number): string | null {
  if (depth > 4) return "Object value nesting exceeds maximum depth of 4";
  if (ov.type === "not") {
    const inner = ov.value as Record<string, unknown>;
    if (inner.type === "wildcard") return "not(wildcard) is forbidden";
    if (inner.type === "not") return "not(not(...)) is forbidden";
    return validateObjectValue(inner, depth + 1);
  }
  if (ov.type === "and") {
    const subs = ov.value as Record<string, unknown>[];
    if (subs.length === 0) return "and() with empty conditions is forbidden";
    if (subs.length === 1) {
      return "and() with a single condition is forbidden, use the condition directly";
    }
    for (const sub of subs) {
      const err = validateObjectValue(sub, depth + 1);
      if (err) return err;
    }
  }
  return null;
}

function validateScopeLimits(scopes: Scope[]): string | null {
  const structured = scopes.filter((s): s is ScopeEntry => typeof s !== "string");
  if (structured.length > 10) {
    return "Maximum 10 structured scopes allowed, got " + structured.length;
  }
  for (const entry of structured) {
    if (!entry.bodyFilters) continue;
    if (entry.bodyFilters.length > 8) {
      return "Maximum 8 body filters per scope, got " + entry.bodyFilters.length + " on " +
        entry.pattern;
    }
    for (const bf of entry.bodyFilters) {
      if (bf.objectPath.split(".").length > 6) {
        return "Dot-path '" + bf.objectPath + "' exceeds maximum of 6 segments";
      }
      if (bf.objectValue.length > 16) {
        return "Maximum 16 OR values per filter, got " + bf.objectValue.length + " on " +
          bf.objectPath;
      }
      for (const ov of bf.objectValue) {
        const err = validateObjectValue(ov as unknown as Record<string, unknown>, 0);
        if (err) return err + " (field: " + bf.objectPath + ")";
      }
    }
  }
  return null;
}

export const uiRoutes = new OpenAPIHono({
  defaultHook: (result, c) => {
    if (!result.success) {
      return c.json({ error: "invalid_body", message: "Missing or invalid fields" }, 400);
    }
  },
});

uiRoutes.get("/", (c) => {
  return c.html(<ConfigPage commitHash={commitHash} />);
});

uiRoutes.openapi(saltRoute, (c) => {
  const salt = Deno.env.get("FGP_SALT") ?? "";
  return c.json({ salt }, 200);
});

uiRoutes.openapi(decodeRoute, async (c) => {
  const { blob, key } = c.req.valid("json");

  const serverSalt = Deno.env.get("FGP_SALT");
  if (!serverSalt) {
    return c.json({ error: "server_error", message: "Server misconfigured" }, 500);
  }

  let config;
  try {
    config = await decryptBlob(blob, key, serverSalt);
  } catch {
    return c.json({ error: "invalid_credentials", message: "Unable to decrypt blob" }, 401);
  }

  const token = config.token;
  const redacted = token.length > 4
    ? token.slice(0, token.length - 4).replace(/./g, "*") + token.slice(-4)
    : "****";

  return c.json({
    target: config.target,
    auth: config.auth,
    scopes: config.scopes,
    ttl: config.ttl,
    createdAt: config.createdAt,
    version: config.v,
    tokenRedacted: redacted,
  }, 200);
});

uiRoutes.openapi(shareEncodeRoute, async (c) => {
  const body = c.req.valid("json");
  const encoded = await encodePublicConfig(body);
  const origin = getRequestOrigin(c);
  return c.json({ encoded, url: `${origin}/?c=${encoded}` }, 200);
});

uiRoutes.openapi(shareDecodeRoute, async (c) => {
  const { encoded } = c.req.valid("json");
  try {
    const config = await decodePublicConfig(encoded);
    return c.json(config, 200);
  } catch {
    return c.json({ error: "invalid_encoded", message: "Unable to decode config" }, 400);
  }
});

uiRoutes.openapi(generateRoute, async (c) => {
  const body = c.req.valid("json");

  const serverSalt = Deno.env.get("FGP_SALT");
  if (!serverSalt) {
    return c.json({ error: "server_error", message: "Server misconfigured" }, 500);
  }

  const clientKey = crypto.randomUUID();
  const scopes = body.scopes as Scope[];

  const limitError = validateScopeLimits(scopes);
  if (limitError) {
    return c.json({ error: "scope_limit_exceeded", message: limitError }, 400);
  }

  const hasStructuredScope = scopes.some((s) => typeof s !== "string");
  const config = {
    v: hasStructuredScope ? 3 : 2,
    token: body.token,
    target: body.target,
    auth: body.auth,
    scopes,
    ttl: body.ttl,
    createdAt: Math.floor(Date.now() / 1000),
  };

  const blob = await encryptBlob(config, clientKey, serverSalt);

  if (blob.length > 4096) {
    return c.json(
      { error: "blob_too_large", message: "Generated blob exceeds 4KB limit. Reduce scopes." },
      400,
    );
  }

  const origin = getRequestOrigin(c);
  return c.json({ url: `${origin}/${blob}/`, key: clientKey, blob }, 200);
});

uiRoutes.openapi(listAppsRoute, async (c) => {
  const body = c.req.valid("json");

  let bearer: string;
  try {
    bearer = await exchangeToken(body.token);
  } catch {
    return c.json(
      { error: "token_exchange_failed", message: "Failed to exchange token" },
      401,
    );
  }

  const apiUrl = body.target || Deno.env.get("SCALINGO_API_URL") || DEFAULT_API_URL;
  let appsResponse: Response;
  try {
    appsResponse = await fetch(`${apiUrl}/v1/apps`, {
      headers: { "Authorization": `Bearer ${bearer}` },
    });
  } catch {
    return c.json({ error: "upstream_error", message: "Failed to fetch apps" }, 502);
  }

  if (!appsResponse.ok) {
    return c.json({ error: "upstream_error", message: "Failed to fetch apps" }, 502);
  }

  const data = await appsResponse.json();
  const apps = (data.apps || []).map((a: { name: string }) => a.name).sort();
  return c.json({ apps }, 200);
});

uiRoutes.openapi(testScopeRoute, (c) => {
  const { method, path, scopes, body } = c.req.valid("json");
  const upperMethod = method.toUpperCase();

  const results = scopes.map((scope, index) => {
    if (typeof scope === "string") {
      const parsed = parseScope(scope);
      const methodMatch = parsed.methods.includes("*") ||
        parsed.methods.includes(upperMethod);
      const pathMatch = matchPath(parsed.pattern, path);
      return {
        index,
        matched: methodMatch && pathMatch,
        methodMatch,
        pathMatch,
        bodyMatch: null,
      };
    }

    const methodMatch = scope.methods.some((m: string) =>
      m === "*" || m.toUpperCase() === upperMethod
    );
    const pathMatch = matchPath(scope.pattern, path);

    if (!methodMatch || !pathMatch) {
      return { index, matched: false, methodMatch, pathMatch, bodyMatch: null };
    }

    if (!scope.bodyFilters || scope.bodyFilters.length === 0) {
      return { index, matched: true, methodMatch, pathMatch, bodyMatch: null };
    }

    if (body === undefined) {
      return {
        index,
        matched: false,
        methodMatch,
        pathMatch,
        bodyMatch: false,
      };
    }

    const bodyMatch = scope.bodyFilters.every((f) =>
      matchBodyFilter(f as unknown as BodyFilter, body)
    );
    return { index, matched: bodyMatch, methodMatch, pathMatch, bodyMatch };
  });

  const allowed = results.some((r) => r.matched);
  return c.json({ allowed, results }, 200);
});

uiRoutes.openapi(testProxyRoute, async (c) => {
  const { method, path, token, target, auth, scopes, body } = c.req.valid("json");
  const upperMethod = method.toUpperCase();

  if (!checkAccess(scopes as Scope[], upperMethod, path, body)) {
    return c.json({ allowed: false, reason: "scope_denied" }, 200);
  }

  const headers = new Headers();
  if (auth === "scalingo-exchange") {
    try {
      const bearer = await exchangeToken(token);
      headers.set("Authorization", `Bearer ${bearer}`);
    } catch {
      return c.json({ allowed: true, reason: "auth_exchange_failed" }, 200);
    }
  } else if (auth === "bearer") {
    headers.set("Authorization", `Bearer ${token}`);
  } else if (auth === "basic") {
    headers.set("Authorization", `Basic ${btoa(":" + token)}`);
  } else if (auth.startsWith("header:")) {
    headers.set(auth.slice("header:".length), token);
  }

  const targetUrl = `${target.replace(/\/+$/, "")}${path}`;
  const init: RequestInit = { method: upperMethod, headers };

  if (body !== undefined && !["GET", "HEAD"].includes(upperMethod)) {
    headers.set("Content-Type", "application/json");
    init.body = JSON.stringify(body);
  }

  try {
    const res = await fetch(targetUrl, init);
    const contentType = res.headers.get("content-type") ?? "";
    const responseBody = contentType.includes("application/json")
      ? await res.json()
      : await res.text();
    return c.json({ allowed: true, upstream: { status: res.status, body: responseBody } }, 200);
  } catch {
    return c.json({ allowed: true, reason: "upstream_unreachable" }, 200);
  }
});

uiRoutes.doc("/api/openapi.json", {
  openapi: "3.0.0",
  info: {
    version: "2.0.0",
    title: "Fine-Grained Proxy (FGP) API",
    description:
      "Stateless HTTP proxy that adds fine-grained token scoping on top of any API. Zero storage: the token and permission config are encrypted in the URL itself.",
  },
});

uiRoutes.get("/api/docs", swaggerUI({ url: "/api/openapi.json" }));
