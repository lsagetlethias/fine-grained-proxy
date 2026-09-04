import { Context } from "hono";
import { swaggerUI } from "@hono/swagger-ui";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

import { decryptBlob, encryptBlob } from "../crypto/blob.ts";
import { decodePublicConfig, encodePublicConfig } from "../crypto/share.ts";
import {
  CLIENT_KEY_MAX_LENGTH,
  CLIENT_KEY_MIN_LENGTH,
  validateClientKey,
} from "../crypto/client-key.ts";
import { exchangeToken, normalizeAddons, resolveScalingoApiUrl } from "../auth/client.ts";
import {
  type Auth,
  type AuthSpec,
  isAuthSpec,
  isHeadersSpec,
  validateAuthSpecLimits,
  validateAuthSpecShape,
} from "../auth/spec.ts";
import { obtainAddonToken } from "../auth/credentials.ts";
import { renderLlmsTxt } from "./llms.ts";
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
import { FGP_SOURCE_HEADER, FGP_SOURCE_PROXY } from "../constants.ts";

let commitHash = "dev";
try {
  commitHash = Deno.readTextFileSync("static/version.txt").trim();
} catch {
  // no version.txt, run deno task build to generate it
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

const LLMS_TXT_PATH = "/llms.txt";
const LLMS_LINK_HEADER = `<${LLMS_TXT_PATH}>; rel="describedby"; type="text/markdown"`;

function errorSchema<const T extends readonly [string, ...string[]]>(
  codes: T,
  name: string,
) {
  return z.object({
    error: z.enum(codes),
    message: z.string(),
  }).openapi(name);
}

const DecodeError400Schema = errorSchema(["invalid_body"], "DecodeError400");
const DecodeError401Schema = errorSchema(["invalid_credentials"], "DecodeError401");
const DecodeError500Schema = errorSchema(["server_error"], "DecodeError500");

const ShareEncodeError400Schema = errorSchema(["invalid_body"], "ShareEncodeError400");

const ShareDecodeError400Schema = errorSchema(
  ["invalid_body", "invalid_encoded"],
  "ShareDecodeError400",
);

const GenerateError400Schema = errorSchema(
  ["invalid_body", "blob_too_large", "scope_limit_exceeded", "auth_limit_exceeded", "invalid_key"],
  "GenerateError400",
);
const GenerateError500Schema = errorSchema(["server_error"], "GenerateError500");

const ListAppsError400Schema = errorSchema(["invalid_body"], "ListAppsError400");
const ListAppsError401Schema = errorSchema(["token_exchange_failed"], "ListAppsError401");
const ListAppsError502Schema = errorSchema(
  ["upstream_unreachable", "upstream_list_apps_failed"],
  "ListAppsError502",
);

const ListAddonsError400Schema = errorSchema(["invalid_body"], "ListAddonsError400");
const ListAddonsError401Schema = errorSchema(["token_exchange_failed"], "ListAddonsError401");
const ListAddonsError404Schema = errorSchema(["app_not_found"], "ListAddonsError404");
const ListAddonsError502Schema = errorSchema(
  ["upstream_unreachable", "upstream_list_addons_failed"],
  "ListAddonsError502",
);

const TestScopeError400Schema = errorSchema(["invalid_body"], "TestScopeError400");
const TestProxyError400Schema = errorSchema(["invalid_body"], "TestProxyError400");

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

const AuthHeaderEntrySchema = z.object({
  name: z.string().min(1).openapi({ example: "X-API-Key" }),
  value: z.string().min(1).openapi({ example: "sk-live-xxxxxxxxxxxx" }),
});

const ScalingoAddonFields = {
  app: z.string().min(1).openapi({ example: "my-app" }),
  addonId: z.string().min(1).openapi({ example: "ad-1111-2222-3333" }),
  apiUrl: z.string().optional().openapi({ example: "https://api.osc-fr1.scalingo.com" }),
};

const AuthSpecSchema = z.union([
  z.object({
    type: z.literal("headers"),
    headers: z.array(AuthHeaderEntrySchema).min(1),
  }),
  z.object({ type: z.literal("scalingo-addon"), ...ScalingoAddonFields }),
]).openapi("AuthSpec");

const AuthSchema = z.union([z.string().min(1), AuthSpecSchema]);

const RedactedAuthSpecSchema = z.union([
  z.object({
    type: z.literal("headers"),
    headers: z.array(z.object({ name: z.string(), valueRedacted: z.string() })),
  }),
  z.object({ type: z.literal("scalingo-addon"), ...ScalingoAddonFields }),
]).openapi("RedactedAuthSpec");

// Une URL de partage ne transporte ni secret ni topologie de compte : le mode et la region
// suffisent au destinataire, il ressaisit ou recharge l'application et la base.
const ShareAuthSpecSchema = z.union([
  z.object({
    type: z.literal("headers"),
    headers: z.array(z.object({ name: z.string().min(1), value: z.string() })),
  }),
  z.object({
    type: z.literal("scalingo-addon"),
    app: z.string(),
    addonId: z.string(),
    apiUrl: z.string().optional(),
  }),
]).openapi("ShareAuthSpec");

const ShareAuthSchema = z.union([z.string().min(1), ShareAuthSpecSchema]);

const LogsConfigSchema = z.object({
  enabled: z.boolean(),
  detailed: z.boolean(),
}).openapi("LogsConfig");

const GenerateBodySchema = z.object({
  token: z.string().min(1).optional().openapi({
    example: "tk-us-xxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    description: "Upstream secret. Required for every auth mode except the headers AuthSpec.",
  }),
  target: z.string().min(1).openapi({ example: "https://api.osc-fr1.scalingo.com" }),
  auth: AuthSchema.openapi({
    example: "scalingo-exchange",
    description:
      "Auth mode: bearer, basic, scalingo-exchange, header:{name}, or a structured AuthSpec",
  }),
  key: z.string().optional().openapi({
    example: "K7x_qP2mVz9-tRbN4wYsH1jGcE8aLdFu",
    description:
      `Client key to use instead of a server-generated one. ${CLIENT_KEY_MIN_LENGTH} to ${CLIENT_KEY_MAX_LENGTH} printable ASCII characters, no space.`,
  }),
  scopes: z.array(ScopeSchema).openapi({
    example: ["GET:/v1/apps/*", "POST:/v1/apps/my-app/scale"],
    description: "List of scopes: string patterns or structured ScopeEntry objects",
  }),
  ttl: z.number().openapi({
    example: 3600,
    description: "Validity duration in seconds. 0 = no expiration",
  }),
  name: z.string().optional().openapi({
    example: "Production Scalingo",
    description: "Human-readable configuration name stored in the blob (optional)",
  }),
  logs: LogsConfigSchema.optional().openapi({
    description: "Enable in-memory logs capture for this blob (optional)",
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

const ListAddonsBodySchema = z.object({
  token: z.string().min(1).openapi({
    example: "tk-us-xxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    description: "Scalingo API token (tk-us-...)",
  }),
  app: z.string().min(1).openapi({
    example: "my-app",
    description: "Scalingo application name",
  }),
  target: z.string().optional().openapi({
    example: "https://api.osc-fr1.scalingo.com",
    description: "Scalingo API URL of the region (defaults to osc-fr1 if omitted)",
  }),
}).openapi("ListAddonsBody");

const ListAddonsResponseSchema = z.object({
  addons: z.array(z.object({
    id: z.string().openapi({
      example: "ad-1111-2222-3333",
      description: "Addon identifier. The only field stored in a blob, as addonId.",
    }),
    resourceId: z.string().openapi({
      example: "my-db-123",
      description: "Display-only readable name. Never stored in a blob.",
    }),
    provider: z.string().openapi({
      example: "PostgreSQL",
      description: "Display-only. Never stored in a blob.",
    }),
    plan: z.string().openapi({
      example: "postgresql-starter-512",
      description: "Display-only. Never stored in a blob.",
    }),
  })).openapi({
    description:
      "Addons of the application. Only id reaches a blob: resourceId, provider and plan are display-only.",
  }),
}).openapi("ListAddonsResponse");

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
  token: z.string().min(1).optional().openapi({
    example: "tk-us-xxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  }),
  target: z.string().min(1).openapi({ example: "https://api.osc-fr1.scalingo.com" }),
  auth: AuthSchema.openapi({ example: "scalingo-exchange" }),
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
  auth: z.union([z.string(), RedactedAuthSpecSchema]).openapi({
    description:
      "Auth mode. Structured AuthSpec are returned with every secret redacted (header values).",
  }),
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
  auth: ShareAuthSchema.openapi({ example: "scalingo-exchange" }),
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
  auth: ShareAuthSchema,
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
      description: "Invalid body (missing or malformed fields)",
      content: { "application/json": { schema: DecodeError400Schema } },
    },
    401: {
      description: "Unable to decrypt blob (wrong key or corrupted blob)",
      content: { "application/json": { schema: DecodeError401Schema } },
    },
    500: {
      description: "Server misconfigured (FGP_SALT missing)",
      content: { "application/json": { schema: DecodeError500Schema } },
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
      description: "Invalid body (missing or malformed fields)",
      content: { "application/json": { schema: ShareEncodeError400Schema } },
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
      description: "Invalid body or unable to decode the shared config string",
      content: { "application/json": { schema: ShareDecodeError400Schema } },
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
      description:
        "Invalid body, generated blob exceeds 4KB, or scope limits violated (body filters, depth, etc.)",
      content: { "application/json": { schema: GenerateError400Schema } },
    },
    500: {
      description: "Server misconfigured (FGP_SALT missing)",
      content: { "application/json": { schema: GenerateError500Schema } },
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
      description: "Invalid body (missing or malformed fields)",
      content: { "application/json": { schema: ListAppsError400Schema } },
    },
    401: {
      description: "Scalingo token exchange failed (token invalid or unauthorized)",
      content: { "application/json": { schema: ListAppsError401Schema } },
    },
    502: {
      description:
        "Scalingo API unreachable (fetch throw) or returned a non-ok status when listing apps",
      content: { "application/json": { schema: ListAppsError502Schema } },
    },
  },
});

const listAddonsRoute = createRoute({
  method: "post",
  path: "/api/list-addons",
  tags: ["Scalingo"],
  summary: "List the addons of a Scalingo app",
  description:
    "Scalingo helper: lists the addons of an application via token exchange. Returns both addon identifiers (id and resource_id) plus display-only provider and plan.",
  request: {
    body: {
      required: true as const,
      content: { "application/json": { schema: ListAddonsBodySchema } },
    },
  },
  responses: {
    200: {
      description: "Addons of the application",
      content: { "application/json": { schema: ListAddonsResponseSchema } },
    },
    400: {
      description: "Invalid body (missing or malformed fields)",
      content: { "application/json": { schema: ListAddonsError400Schema } },
    },
    401: {
      description: "Scalingo token exchange failed (token invalid or unauthorized)",
      content: { "application/json": { schema: ListAddonsError401Schema } },
    },
    404: {
      description: "The application does not exist on this Scalingo account",
      content: { "application/json": { schema: ListAddonsError404Schema } },
    },
    502: {
      description:
        "Scalingo API unreachable (fetch throw) or returned a non-ok status when listing addons",
      content: { "application/json": { schema: ListAddonsError502Schema } },
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
      description: "Invalid body (missing or malformed fields)",
      content: { "application/json": { schema: TestScopeError400Schema } },
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
      description: "Invalid body (missing or malformed fields)",
      content: { "application/json": { schema: TestProxyError400Schema } },
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

function redactSecret(secret: string): string {
  return secret.length > 4
    ? secret.slice(0, secret.length - 4).replace(/./g, "*") + secret.slice(-4)
    : "****";
}

type RedactedAuth = string | z.infer<typeof RedactedAuthSpecSchema>;

function redactAuth(auth: Auth): RedactedAuth {
  if (!isAuthSpec(auth)) return auth;
  if (auth.type === "headers") {
    return {
      type: "headers" as const,
      headers: auth.headers.map((h) => ({ name: h.name, valueRedacted: redactSecret(h.value) })),
    };
  }
  return {
    type: "scalingo-addon" as const,
    app: auth.app,
    addonId: auth.addonId,
    apiUrl: auth.apiUrl,
  };
}

type ShareAuth = z.infer<typeof ShareAuthSchema>;

function shareableAuth(auth: ShareAuth): ShareAuth {
  if (typeof auth === "string") return auth;
  if (auth.type === "headers") {
    return {
      type: "headers" as const,
      headers: auth.headers.map((h) => ({ name: h.name, value: "" })),
    };
  }
  return { type: "scalingo-addon" as const, app: "", addonId: "", apiUrl: auth.apiUrl };
}

// Un AuthSpec headers a une seule entree est la forme canonique header:{name} : blob plus
// petit, version inchangee, et un seul chemin de code pour le cas le plus courant.
function normalizeAuthForBlob(
  auth: Auth,
  token: string | undefined,
): { auth: Auth; token?: string } {
  if (isHeadersSpec(auth) && auth.headers.length === 1) {
    const entry = auth.headers[0];
    return { auth: `header:${entry.name}`, token: entry.value };
  }
  if (isHeadersSpec(auth)) return { auth };
  return { auth, token };
}

export const uiRoutes = new OpenAPIHono({
  defaultHook: (result, c) => {
    if (!result.success) {
      return c.json({ error: "invalid_body", message: "Missing or invalid fields" }, 400);
    }
  },
});

uiRoutes.get("/", (c) => {
  c.header("Link", LLMS_LINK_HEADER);
  return c.html(<ConfigPage commitHash={commitHash} />);
});

uiRoutes.get(LLMS_TXT_PATH, (c) => {
  return c.body(renderLlmsTxt(getRequestOrigin(c)), 200, {
    "Content-Type": "text/markdown; charset=utf-8",
    "Cache-Control": "public, max-age=3600",
  });
});

uiRoutes.openapi(saltRoute, (c) => {
  const salt = Deno.env.get("FGP_SALT") ?? "";
  c.header("Cache-Control", "no-store");
  return c.json({ salt }, 200);
});

uiRoutes.openapi(decodeRoute, async (c) => {
  const { blob, key } = c.req.valid("json");
  c.header("Cache-Control", "no-store");

  const serverSalt = Deno.env.get("FGP_SALT");
  if (!serverSalt) {
    return c.json({ error: "server_error" as const, message: "Server misconfigured" }, 500);
  }

  let config;
  try {
    config = await decryptBlob(blob, key, serverSalt);
  } catch {
    return c.json(
      { error: "invalid_credentials" as const, message: "Unable to decrypt blob" },
      401,
    );
  }

  return c.json({
    target: config.target,
    auth: redactAuth(config.auth),
    scopes: config.scopes,
    ttl: config.ttl,
    createdAt: config.createdAt,
    version: config.v,
    tokenRedacted: config.token ? redactSecret(config.token) : "****",
  }, 200);
});

uiRoutes.openapi(shareEncodeRoute, async (c) => {
  const body = c.req.valid("json");
  const encoded = await encodePublicConfig({ ...body, auth: shareableAuth(body.auth) });
  const origin = getRequestOrigin(c);
  return c.json({ encoded, url: `${origin}/?c=${encoded}` }, 200);
});

uiRoutes.openapi(shareDecodeRoute, async (c) => {
  const { encoded } = c.req.valid("json");
  try {
    const config = await decodePublicConfig(encoded);
    return c.json({ ...config, auth: shareableAuth(config.auth as ShareAuth) }, 200);
  } catch {
    return c.json(
      { error: "invalid_encoded" as const, message: "Unable to decode config" },
      400,
    );
  }
});

uiRoutes.openapi(generateRoute, async (c) => {
  const body = c.req.valid("json");
  c.header("Cache-Control", "no-store");

  const serverSalt = Deno.env.get("FGP_SALT");
  if (!serverSalt) {
    return c.json({ error: "server_error" as const, message: "Server misconfigured" }, 500);
  }

  let clientKey: string = crypto.randomUUID();
  if (body.key !== undefined) {
    clientKey = body.key.trim();
    const keyError = validateClientKey(clientKey);
    if (keyError) {
      return c.json({ error: "invalid_key" as const, message: keyError }, 400);
    }
  }

  const scopes = body.scopes as Scope[];

  const limitError = validateScopeLimits(scopes);
  if (limitError) {
    return c.json({ error: "scope_limit_exceeded" as const, message: limitError }, 400);
  }

  const requestedAuth = body.auth as Auth;
  if (isAuthSpec(requestedAuth)) {
    const shapeError = validateAuthSpecShape(requestedAuth);
    if (shapeError) {
      return c.json({ error: "invalid_body" as const, message: shapeError }, 400);
    }
    const authLimitError = validateAuthSpecLimits(requestedAuth);
    if (authLimitError) {
      return c.json({ error: "auth_limit_exceeded" as const, message: authLimitError }, 400);
    }
  }

  const normalized = normalizeAuthForBlob(requestedAuth, body.token);
  const usesHeadersSpec = isHeadersSpec(normalized.auth);
  if (!usesHeadersSpec && !normalized.token) {
    return c.json(
      { error: "invalid_body" as const, message: "Token is required for this auth mode" },
      400,
    );
  }

  const hasStructuredScope = scopes.some((s) => typeof s !== "string");
  const config: {
    v: number;
    token?: string;
    target: string;
    auth: Auth;
    scopes: Scope[];
    ttl: number;
    createdAt: number;
    name?: string;
    logs?: { enabled: boolean; detailed: boolean };
  } = {
    v: isAuthSpec(normalized.auth) ? 4 : (hasStructuredScope ? 3 : 2),
    target: body.target,
    auth: normalized.auth,
    scopes,
    ttl: body.ttl,
    createdAt: Math.floor(Date.now() / 1000),
  };
  if (normalized.token) config.token = normalized.token;
  if (body.name && body.name.trim().length > 0) config.name = body.name.trim();
  if (body.logs && body.logs.enabled === true) {
    config.logs = { enabled: true, detailed: body.logs.detailed === true };
  }

  const blob = await encryptBlob(config, clientKey, serverSalt);

  if (blob.length > 4096) {
    return c.json(
      {
        error: "blob_too_large" as const,
        message: isHeadersSpec(requestedAuth)
          ? "Generated blob exceeds 4KB limit. Auth header values are incompressible: shorten them, then reduce scopes."
          : "Generated blob exceeds 4KB limit. Reduce scopes.",
      },
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
    c.header(FGP_SOURCE_HEADER, FGP_SOURCE_PROXY);
    return c.json(
      { error: "token_exchange_failed", message: "Failed to exchange Scalingo token" },
      401,
    );
  }

  const apiUrl = resolveScalingoApiUrl(body.target);
  let appsResponse: Response;
  try {
    appsResponse = await fetch(`${apiUrl}/v1/apps`, {
      headers: { "Authorization": `Bearer ${bearer}` },
    });
  } catch {
    c.header(FGP_SOURCE_HEADER, FGP_SOURCE_PROXY);
    return c.json(
      { error: "upstream_unreachable", message: "Scalingo API unreachable" },
      502,
    );
  }

  if (!appsResponse.ok) {
    c.header(FGP_SOURCE_HEADER, FGP_SOURCE_PROXY);
    return c.json(
      {
        error: "upstream_list_apps_failed",
        message: `Scalingo returned ${appsResponse.status}`,
      },
      502,
    );
  }

  const data = await appsResponse.json();
  const apps = (data.apps || []).map((a: { name: string }) => a.name).sort();
  return c.json({ apps }, 200);
});

uiRoutes.openapi(listAddonsRoute, async (c) => {
  const body = c.req.valid("json");

  let bearer: string;
  try {
    bearer = await exchangeToken(body.token);
  } catch {
    c.header(FGP_SOURCE_HEADER, FGP_SOURCE_PROXY);
    return c.json(
      { error: "token_exchange_failed", message: "Failed to exchange Scalingo token" },
      401,
    );
  }

  const apiUrl = resolveScalingoApiUrl(body.target);
  let addonsResponse: Response;
  try {
    addonsResponse = await fetch(
      `${apiUrl}/v1/apps/${encodeURIComponent(body.app)}/addons`,
      { headers: { "Authorization": `Bearer ${bearer}` } },
    );
  } catch {
    c.header(FGP_SOURCE_HEADER, FGP_SOURCE_PROXY);
    return c.json(
      { error: "upstream_unreachable", message: "Scalingo API unreachable" },
      502,
    );
  }

  // Une app inexistante n'est pas une panne amont : sans ce cas, une faute de casse sur le
  // nom de l'application est indiscernable d'un incident Scalingo cote UI.
  if (addonsResponse.status === 404) {
    c.header(FGP_SOURCE_HEADER, FGP_SOURCE_PROXY);
    return c.json(
      { error: "app_not_found", message: "Application not found on this Scalingo account" },
      404,
    );
  }

  if (!addonsResponse.ok) {
    c.header(FGP_SOURCE_HEADER, FGP_SOURCE_PROXY);
    return c.json(
      {
        error: "upstream_list_addons_failed",
        message: `Scalingo returned ${addonsResponse.status}`,
      },
      502,
    );
  }

  const data = await addonsResponse.json();
  return c.json({ addons: normalizeAddons(data?.addons) }, 200);
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
  const secret = token ?? "";
  if (isAuthSpec(auth as Auth)) {
    const spec = auth as AuthSpec;
    if (spec.type === "headers") {
      for (const entry of spec.headers) {
        headers.set(entry.name, entry.value);
      }
    } else {
      try {
        const addonToken = await obtainAddonToken(secret, spec.app, spec.addonId, spec.apiUrl);
        headers.set("Authorization", `Bearer ${addonToken}`);
      } catch {
        return c.json({ allowed: true, reason: "auth_addon_failed" }, 200);
      }
    }
  } else if (auth === "scalingo-exchange") {
    try {
      const bearer = await exchangeToken(secret);
      headers.set("Authorization", `Bearer ${bearer}`);
    } catch {
      return c.json({ allowed: true, reason: "auth_exchange_failed" }, 200);
    }
  } else if (auth === "bearer") {
    headers.set("Authorization", `Bearer ${secret}`);
  } else if (auth === "basic") {
    headers.set("Authorization", `Basic ${btoa(":" + secret)}`);
  } else if (typeof auth === "string" && auth.startsWith("header:")) {
    headers.set(auth.slice("header:".length), secret);
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
