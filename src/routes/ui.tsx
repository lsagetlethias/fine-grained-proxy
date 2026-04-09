import { Context, Hono } from "hono";
import { swaggerUI } from "@hono/swagger-ui";

import { encryptBlob } from "../crypto/blob.ts";
import { exchangeToken } from "../auth/client.ts";
import { ConfigPage } from "../ui/config-page.tsx";
import { GenerateBodySchema, ListAppsBodySchema, openApiSpec } from "../openapi/spec.ts";

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
