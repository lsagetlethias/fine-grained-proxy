// Mock upstream pour la demo FGP : zero dependance reseau.
// Simule une API type "apps" protegee par une cle API bidon.
// Lancer : tsx presentation/demo-upstream/server.ts
// Port par defaut 9000 (override via UPSTREAM_PORT).

import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";

const PORT = Number(process.env.UPSTREAM_PORT ?? 9000);
const API_KEY = process.env.UPSTREAM_KEY ?? "demo-secret-1234";

const APPS = [
  { id: "app-001", name: "my-app", region: "osc-fr1", status: "running" },
  { id: "app-002", name: "billing-api", region: "osc-fr1", status: "running" },
  { id: "app-003", name: "worker-batch", region: "osc-fr1", status: "stopped" },
];

function json(res: ServerResponse, body: unknown, status = 200): void {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function authorized(req: IncomingMessage): boolean {
  return req.headers.authorization === `Bearer ${API_KEY}`;
}

async function readJson(req: IncomingMessage): Promise<Record<string, any>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

createServer(async (req, res) => {
  const { pathname } = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const method = req.method;

  if (!authorized(req)) {
    return json(res, {
      error: "unauthorized",
      message: "missing or invalid API key",
    }, 401);
  }

  if (method === "GET" && pathname === "/v1/apps") {
    return json(res, APPS);
  }

  const appMatch = pathname.match(/^\/v1\/apps\/([^/]+)$/);
  if (method === "GET" && appMatch) {
    const app = APPS.find((a) => a.name === appMatch[1] || a.id === appMatch[1]);
    return app ? json(res, app) : json(res, { error: "not_found" }, 404);
  }

  if (method === "POST" && pathname === "/v1/apps/my-app/deployments") {
    const body = await readJson(req).catch(() => ({}) as Record<string, any>);
    const gitRef = body?.deployment?.git_ref ?? "unknown";
    return json(res, {
      id: "dep-" + gitRef,
      app: "my-app",
      git_ref: gitRef,
      status: "queued",
    }, 201);
  }

  if (method === "POST" && pathname === "/v1/apps/my-app/scale") {
    return json(res, { app: "my-app", status: "scaling" });
  }

  if (method === "DELETE" && appMatch) {
    return json(res, { id: appMatch[1], deleted: true });
  }

  return json(res, { error: "not_found", path: pathname, method }, 404);
}).listen(PORT);

console.log(`mock upstream up on http://localhost:${PORT} (key: ${API_KEY})`);
