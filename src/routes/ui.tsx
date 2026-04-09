import { Context } from "hono";
import { swaggerUI } from "@hono/swagger-ui";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

import { encryptBlob } from "../crypto/blob.ts";
import { exchangeToken } from "../auth/client.ts";
import { ConfigPage } from "../ui/config-page.tsx";
import type { Scope, ScopeEntry } from "../middleware/scopes.ts";

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
}).openapi("GenerateResponse");

const SaltResponseSchema = z.object({
  salt: z.string(),
}).openapi("SaltResponse");

const ListAppsBodySchema = z.object({
  token: z.string().min(1).openapi({
    example: "tk-us-xxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    description: "Scalingo API token (tk-us-...)",
  }),
}).openapi("ListAppsBody");

const ListAppsResponseSchema = z.object({
  apps: z.array(z.string()).openapi({
    example: ["my-app", "other-app", "staging-app"],
  }),
}).openapi("ListAppsResponse");

// --- Route definitions ---

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
  return c.html(<ConfigPage />);
});

uiRoutes.openapi(saltRoute, (c) => {
  const salt = Deno.env.get("FGP_SALT") ?? "";
  return c.json({ salt }, 200);
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
  return c.json({ url: `${origin}/${blob}/`, key: clientKey }, 200);
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

  const apiUrl = Deno.env.get("SCALINGO_API_URL") ?? DEFAULT_API_URL;
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
