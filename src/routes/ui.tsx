import { Context, Hono } from "hono";
import { swaggerUI } from "@hono/swagger-ui";
import { z } from "zod";

import { encryptBlob } from "../crypto/blob.ts";
import { exchangeToken } from "../auth/client.ts";
import { ConfigPage } from "../ui/config-page.tsx";

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

const GenerateBodySchema = z.object({
  token: z.string().min(1),
  target: z.string().min(1),
  auth: z.string().min(1),
  scopes: z.array(z.string()),
  ttl: z.number(),
});

const ListAppsBodySchema = z.object({
  token: z.string().min(1),
});

const openApiSpec = {
  openapi: "3.0.0",
  info: {
    version: "2.0.0",
    title: "Fine-Grained Proxy (FGP) API",
    description:
      "Stateless HTTP proxy that adds fine-grained token scoping on top of any API. Zero storage: the token and permission config are encrypted in the URL itself.",
  },
  paths: {
    "/api/salt": {
      get: {
        tags: ["Configuration"],
        summary: "Get server salt",
        description: "Returns the server salt used for PBKDF2 key derivation.",
        responses: {
          "200": {
            description: "Server salt",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { salt: { type: "string" } },
                },
              },
            },
          },
        },
      },
    },
    "/api/generate": {
      post: {
        tags: ["Configuration"],
        summary: "Generate an FGP URL",
        description:
          "Server-side encrypted URL generation. Creates a client key, encrypts the blob, returns URL + key.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["token", "target", "auth", "scopes", "ttl"],
                properties: {
                  token: {
                    type: "string",
                    description: "API token or secret for the target API",
                    example: "tk-us-xxxxxxxxxxxxxxxxxxxxxxxxxxxx",
                  },
                  target: {
                    type: "string",
                    description: "Base URL of the target API",
                    example: "https://api.osc-fr1.scalingo.com",
                  },
                  auth: {
                    type: "string",
                    description: "Auth mode: bearer, basic, scalingo-exchange, or header:{name}",
                    example: "scalingo-exchange",
                  },
                  scopes: {
                    type: "array",
                    items: { type: "string" },
                    description: "List of METHOD:PATH patterns",
                    example: [
                      "GET:/v1/apps/*",
                      "POST:/v1/apps/my-app/scale",
                    ],
                  },
                  ttl: {
                    type: "number",
                    description: "Validity duration in seconds. 0 = no expiration",
                    example: 3600,
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Generated URL and client key",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    url: {
                      type: "string",
                      example: "https://fgp.example.com/eyJhbGci.../",
                    },
                    key: {
                      type: "string",
                      example: "a7f2c9d4-1234-5678-abcd-ef0123456789",
                    },
                  },
                },
              },
            },
          },
          "400": {
            description: "Invalid JSON body or missing fields",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    error: { type: "string" },
                    message: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/list-apps": {
      post: {
        tags: ["Scalingo"],
        summary: "List Scalingo apps",
        description:
          "Scalingo helper: lists apps accessible with the provided token via token exchange.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["token"],
                properties: {
                  token: {
                    type: "string",
                    description: "Scalingo API token (tk-us-...)",
                    example: "tk-us-xxxxxxxxxxxxxxxxxxxxxxxxxxxx",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Sorted list of app names",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    apps: {
                      type: "array",
                      items: { type: "string" },
                      example: ["my-app", "other-app", "staging-app"],
                    },
                  },
                },
              },
            },
          },
          "401": {
            description: "Token exchange failed",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    error: { type: "string" },
                    message: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/{blob}/{path}": {
      get: {
        tags: ["Proxy"],
        summary: "Proxy request to target API",
        description:
          "Decrypts the blob, verifies TTL and scopes, then forwards to the target API. Supports all HTTP methods.",
        parameters: [
          {
            name: "blob",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Encrypted blob (base64url, max 4KB)",
          },
          {
            name: "path",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "API path forwarded to the target",
          },
          {
            name: "X-FGP-Key",
            in: "header",
            required: true,
            schema: { type: "string" },
            description: "Client key for blob decryption",
          },
        ],
        responses: {
          "200": { description: "Response from the target API (pass-through)" },
          "401": { description: "Missing key or decryption failed" },
          "403": { description: "Scope denied for this method/path" },
          "410": { description: "Token expired (TTL exceeded)" },
          "414": { description: "Blob too large (> 4KB)" },
          "429": { description: "Rate limited by target API" },
          "502": { description: "Target API error or auth rejected" },
        },
      },
    },
  },
};

export const uiRoutes = new Hono();

uiRoutes.get("/", (c) => {
  return c.html(<ConfigPage />);
});

uiRoutes.get("/api/salt", (c) => {
  const salt = Deno.env.get("FGP_SALT") ?? "";
  return c.json({ salt });
});

uiRoutes.get("/api/openapi.json", (c) => {
  return c.json(openApiSpec);
});

uiRoutes.get("/api/docs", swaggerUI({ url: "/api/openapi.json" }));

uiRoutes.post("/api/generate", async (c) => {
  let rawBody: unknown;
  try {
    rawBody = await c.req.json();
  } catch {
    return c.json({ error: "invalid_body", message: "Invalid JSON body" }, 400);
  }

  const parsed = GenerateBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return c.json({ error: "invalid_body", message: "Missing or invalid fields" }, 400);
  }
  const body = parsed.data;

  const serverSalt = Deno.env.get("FGP_SALT");
  if (!serverSalt) {
    return c.json({ error: "server_error", message: "Server misconfigured" }, 500);
  }

  const clientKey = crypto.randomUUID();
  const config = {
    v: 2,
    token: body.token,
    target: body.target,
    auth: body.auth,
    scopes: body.scopes,
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
  return c.json({ url: `${origin}/${blob}/`, key: clientKey });
});

uiRoutes.post("/api/list-apps", async (c) => {
  let rawBody: unknown;
  try {
    rawBody = await c.req.json();
  } catch {
    return c.json({ error: "invalid_body", message: "Invalid JSON body" }, 400);
  }

  const parsed = ListAppsBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return c.json({ error: "invalid_body", message: "Missing or invalid fields" }, 400);
  }
  const body = parsed.data;

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
  return c.json({ apps });
});
