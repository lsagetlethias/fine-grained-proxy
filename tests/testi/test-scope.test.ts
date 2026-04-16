import { assertEquals } from "@std/assert";

import { app } from "../../src/main.ts";

function setup() {
  Deno.env.set("FGP_SALT", "test-salt");
}

function teardown() {
  Deno.env.delete("FGP_SALT");
}

function postTestScope(body: unknown) {
  return app.request("/api/test-scope", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// --- POST /api/test-scope ---

Deno.test({
  name: "AC-15.1: Test scope — string scope matche GET",
  fn: async () => {
    setup();
    try {
      const res = await postTestScope({
        method: "GET",
        path: "/v1/apps/my-app",
        scopes: ["GET:/v1/apps/*"],
      });
      const body = await res.json();

      assertEquals(res.status, 200);
      assertEquals(body.allowed, true);
      assertEquals(body.results.length, 1);
      assertEquals(body.results[0].index, 0);
      assertEquals(body.results[0].matched, true);
      assertEquals(body.results[0].methodMatch, true);
      assertEquals(body.results[0].pathMatch, true);
      assertEquals(body.results[0].bodyMatch, null);
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-15.2: Test scope — method mismatch",
  fn: async () => {
    setup();
    try {
      const res = await postTestScope({
        method: "POST",
        path: "/v1/apps/my-app",
        scopes: ["GET:/v1/apps/*"],
      });
      const body = await res.json();

      assertEquals(res.status, 200);
      assertEquals(body.allowed, false);
      assertEquals(body.results[0].matched, false);
      assertEquals(body.results[0].methodMatch, false);
      assertEquals(body.results[0].pathMatch, true);
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-15.3: Test scope — path mismatch",
  fn: async () => {
    setup();
    try {
      const res = await postTestScope({
        method: "GET",
        path: "/v2/other",
        scopes: ["GET:/v1/apps/*"],
      });
      const body = await res.json();

      assertEquals(res.status, 200);
      assertEquals(body.allowed, false);
      assertEquals(body.results[0].matched, false);
      assertEquals(body.results[0].methodMatch, true);
      assertEquals(body.results[0].pathMatch, false);
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-15.4: Test scope — pipe methods (GET|POST)",
  fn: async () => {
    setup();
    try {
      const res = await postTestScope({
        method: "POST",
        path: "/v1/apps/my-app",
        scopes: ["GET|POST:/v1/apps/*"],
      });
      const body = await res.json();

      assertEquals(res.status, 200);
      assertEquals(body.allowed, true);
      assertEquals(body.results[0].matched, true);
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-15.5: Test scope — multiple scopes, un seul matche",
  fn: async () => {
    setup();
    try {
      const res = await postTestScope({
        method: "GET",
        path: "/v1/apps/my-app",
        scopes: ["DELETE:/v1/apps/*", "GET:/v1/apps/*"],
      });
      const body = await res.json();

      assertEquals(res.status, 200);
      assertEquals(body.allowed, true);
      assertEquals(body.results[0].matched, false);
      assertEquals(body.results[1].matched, true);
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-15.6: Test scope — wildcard min 1 char",
  fn: async () => {
    setup();
    try {
      const res = await postTestScope({
        method: "GET",
        path: "/v1/apps/",
        scopes: ["GET:/v1/apps/*"],
      });
      const body = await res.json();

      assertEquals(res.status, 200);
      assertEquals(body.allowed, false);
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-15.7: Test scope — body filter matche",
  fn: async () => {
    setup();
    try {
      const res = await postTestScope({
        method: "POST",
        path: "/v1/apps/my-app/deployments",
        scopes: [{
          methods: ["POST"],
          pattern: "/v1/apps/*/deployments",
          bodyFilters: [{
            objectPath: "deployment.git_ref",
            objectValue: [{ type: "any", value: "main" }],
          }],
        }],
        body: { deployment: { git_ref: "main" } },
      });
      const body = await res.json();

      assertEquals(res.status, 200);
      assertEquals(body.allowed, true);
      assertEquals(body.results[0].matched, true);
      assertEquals(body.results[0].bodyMatch, true);
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-15.8: Test scope — body filter mismatch",
  fn: async () => {
    setup();
    try {
      const res = await postTestScope({
        method: "POST",
        path: "/v1/apps/my-app/deployments",
        scopes: [{
          methods: ["POST"],
          pattern: "/v1/apps/*/deployments",
          bodyFilters: [{
            objectPath: "deployment.git_ref",
            objectValue: [{ type: "any", value: "main" }],
          }],
        }],
        body: { deployment: { git_ref: "develop" } },
      });
      const body = await res.json();

      assertEquals(res.status, 200);
      assertEquals(body.allowed, false);
      assertEquals(body.results[0].matched, false);
      assertEquals(body.results[0].bodyMatch, false);
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-15.9: Test scope — validation rejects missing method",
  fn: async () => {
    setup();
    try {
      const res = await postTestScope({
        path: "/v1/apps/my-app",
        scopes: ["GET:/v1/apps/*"],
      });
      const body = await res.json();

      assertEquals(res.status, 400);
      assertEquals(body.error, "invalid_body");
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-15.9: Test scope — validation rejects empty scopes",
  fn: async () => {
    setup();
    try {
      const res = await postTestScope({
        method: "GET",
        path: "/v1/apps/my-app",
        scopes: [],
      });
      const body = await res.json();

      assertEquals(res.status, 400);
      assertEquals(body.error, "invalid_body");
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});
