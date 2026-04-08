import { Hono } from "hono";
import { logger } from "hono/logger";

import { proxyMiddleware } from "./middleware/proxy.ts";
import { uiRoutes } from "./routes/ui.tsx";

const app = new Hono();

app.use("*", logger());

app.get("/healthz", (c) => c.json({ status: "ok" }));

app.route("/", uiRoutes);

app.all("/api/*", (c) => c.json({ error: "not_found", message: "Endpoint not found" }, 404));

app.use("/:blob/*", proxyMiddleware());

export default app;

if (import.meta.main) {
  Deno.serve({ port: Number(Deno.env.get("PORT") ?? 8000) }, app.fetch);
}
