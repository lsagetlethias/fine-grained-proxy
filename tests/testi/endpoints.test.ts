import { assertEquals } from "@std/assert";
import { app } from "../../src/main.ts";

Deno.test({
  name: "AC-10.1: GET /healthz returns 200 ok",
  fn: async () => {
    const res = await app.request("/healthz");
    const body = await res.json();

    assertEquals(res.status, 200);
    assertEquals(body.status, "ok");
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-10.2: GET /api/salt returns salt from env",
  fn: async () => {
    Deno.env.set("FGP_SALT", "test-salt-value");
    const res = await app.request("/api/salt");
    const body = await res.json();

    assertEquals(res.status, 200);
    assertEquals(body.salt, "test-salt-value");

    Deno.env.delete("FGP_SALT");
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-10.3: GET / returns HTML page",
  fn: async () => {
    const res = await app.request("/");

    assertEquals(res.status, 200);
    const ct = res.headers.get("Content-Type");
    assertEquals(ct?.includes("text/html"), true);
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: 'AC-10.3.1: GET / contains <script defer src="/static/client.js"',
  fn: async () => {
    const res = await app.request("/");
    const body = await res.text();

    assertEquals(res.status, 200);
    assertEquals(
      body.includes('<script defer src="/static/client.js"'),
      true,
    );
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-10.5: GET /static/client.js returns 200 with JS content",
  fn: async () => {
    const res = await app.request("/static/client.js");

    assertEquals(res.status, 200);
    const ct = res.headers.get("Content-Type") ?? "";
    assertEquals(ct.includes("javascript"), true);
    const body = await res.text();
    assertEquals(body.length > 0, true);
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-10.6: GET /static/nonexistent.js falls through to blob proxy (401)",
  fn: async () => {
    const res = await app.request("/static/nonexistent.js");

    assertEquals(res.status, 401);
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-10.4: POST /api/generate with no body returns 400",
  fn: async () => {
    const res = await app.request("/api/generate", { method: "POST" });
    assertEquals(res.status, 400);
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-10.4: POST /api/list-apps with no body returns 400",
  fn: async () => {
    const res = await app.request("/api/list-apps", { method: "POST" });
    assertEquals(res.status, 400);
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-10.4: GET /api/unknown returns 404",
  fn: async () => {
    const res = await app.request("/api/anything");
    assertEquals(res.status, 404);
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// --- OpenAPI spec & Swagger UI ---

Deno.test({
  name: "GET /api/openapi.json returns valid OpenAPI spec",
  fn: async () => {
    const res = await app.request("/api/openapi.json");
    const body = await res.json();

    assertEquals(res.status, 200);
    assertEquals(body.openapi, "3.0.0");
    assertEquals(typeof body.info, "object");
    assertEquals(body.info.title, "Fine-Grained Proxy (FGP) API");
    assertEquals(typeof body.paths, "object");
    assertEquals(typeof body.paths["/api/salt"], "object");
    assertEquals(typeof body.paths["/api/generate"], "object");
    assertEquals(typeof body.paths["/api/list-apps"], "object");
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "GET /api/docs returns HTML (Swagger UI)",
  fn: async () => {
    const res = await app.request("/api/docs");

    assertEquals(res.status, 200);
    const ct = res.headers.get("Content-Type");
    assertEquals(ct?.includes("text/html"), true);
  },
  sanitizeOps: false,
  sanitizeResources: false,
});
