import { Hono } from "hono";
import { serveStatic } from "hono/deno";
import { logger } from "hono/logger";

import { blobHeaderProxy, proxyMiddleware } from "./middleware/proxy.ts";
import { uiRoutes } from "./routes/ui.tsx";

const app = new Hono();

app.use("*", logger());
app.use("*", blobHeaderProxy());

app.get("/healthz", (c) => c.json({ status: "ok" }));

app.get(
  "/static/*",
  serveStatic({
    root: "./",
    rewriteRequestPath: (path) => path,
    onFound: (_path, c) => {
      c.header("Cache-Control", "public, max-age=86400");
    },
  }),
);

app.get("/static/*", (c) => c.json({ error: "not_found", message: "Static file not found" }, 404));

app.route("/", uiRoutes);

app.all("/api/*", (c) => c.json({ error: "not_found", message: "Endpoint not found" }, 404));

app.use("/:blob/*", proxyMiddleware());

export { app };

export default {
  port: Number(Deno.env.get("PORT") ?? 8000),
  fetch: (req: Request, info: Deno.ServeHandlerInfo) => app.fetch(req, { info }),
};
