import { assertEquals } from "@std/assert";
import { checkAccess, matchPath, parseScope } from "../../../src/middleware/scopes.ts";

// --- parseScope ---

Deno.test("parseScope: simple GET pattern", () => {
  assertEquals(parseScope("GET:/v1/apps/*"), { methods: ["GET"], pattern: "/v1/apps/*" });
});

Deno.test("parseScope: multi-method pattern", () => {
  assertEquals(parseScope("GET|POST:/v1/apps/*"), {
    methods: ["GET", "POST"],
    pattern: "/v1/apps/*",
  });
});

Deno.test("parseScope: wildcard method", () => {
  assertEquals(parseScope("*:/v1/apps/*"), { methods: ["*"], pattern: "/v1/apps/*" });
});

Deno.test("parseScope: full wildcard", () => {
  assertEquals(parseScope("*:*"), { methods: ["*"], pattern: "*" });
});

Deno.test("parseScope: no colon defaults to wildcard method", () => {
  assertEquals(parseScope("*"), { methods: ["*"], pattern: "*" });
});

Deno.test("parseScope: exact path", () => {
  assertEquals(parseScope("DELETE:/v1/apps/my-app"), {
    methods: ["DELETE"],
    pattern: "/v1/apps/my-app",
  });
});

// --- matchPath ---

Deno.test("matchPath: wildcard * matches everything", () => {
  assertEquals(matchPath("*", "/anything/at/all"), true);
});

Deno.test("matchPath: exact match", () => {
  assertEquals(matchPath("/v1/apps/my-app", "/v1/apps/my-app"), true);
  assertEquals(matchPath("/v1/apps/my-app", "/v1/apps/other"), false);
});

Deno.test("matchPath: prefix wildcard matches sub-paths", () => {
  assertEquals(matchPath("/v1/apps/*", "/v1/apps/my-app"), true);
  assertEquals(matchPath("/v1/apps/*", "/v1/apps/my-app/scale"), true);
  assertEquals(matchPath("/v1/apps/*", "/v1/apps/"), true);
  assertEquals(matchPath("/v1/apps/*", "/v1/users/me"), false);
});

Deno.test("matchPath: app-specific wildcard", () => {
  assertEquals(matchPath("/v1/apps/my-app/*", "/v1/apps/my-app/scale"), true);
  assertEquals(matchPath("/v1/apps/my-app/*", "/v1/apps/my-app/containers"), true);
  assertEquals(matchPath("/v1/apps/my-app/*", "/v1/apps/other/scale"), false);
});

Deno.test("matchPath: no wildcard requires exact match", () => {
  assertEquals(matchPath("/v1/apps", "/v1/apps"), true);
  assertEquals(matchPath("/v1/apps", "/v1/apps/my-app"), false);
});

// --- checkAccess ---

Deno.test("checkAccess: single scope allows matching request", () => {
  assertEquals(checkAccess(["GET:/v1/apps/*"], "GET", "/v1/apps/my-app"), true);
});

Deno.test("checkAccess: denies non-matching method", () => {
  assertEquals(checkAccess(["GET:/v1/apps/*"], "POST", "/v1/apps/my-app"), false);
});

Deno.test("checkAccess: denies non-matching path", () => {
  assertEquals(checkAccess(["GET:/v1/apps/*"], "GET", "/v1/users/me"), false);
});

Deno.test("checkAccess: wildcard method matches any method", () => {
  assertEquals(checkAccess(["*:/v1/apps/*"], "GET", "/v1/apps/my-app"), true);
  assertEquals(checkAccess(["*:/v1/apps/*"], "POST", "/v1/apps/my-app/scale"), true);
  assertEquals(checkAccess(["*:/v1/apps/*"], "DELETE", "/v1/apps/my-app"), true);
});

Deno.test("checkAccess: full wildcard allows everything", () => {
  assertEquals(checkAccess(["*:*"], "GET", "/anything"), true);
  assertEquals(checkAccess(["*:*"], "POST", "/v1/apps/deploy"), true);
});

Deno.test("checkAccess: multi-method scope", () => {
  assertEquals(checkAccess(["GET|POST:/v1/apps/*"], "GET", "/v1/apps/my-app"), true);
  assertEquals(checkAccess(["GET|POST:/v1/apps/*"], "POST", "/v1/apps/my-app/scale"), true);
  assertEquals(checkAccess(["GET|POST:/v1/apps/*"], "PUT", "/v1/apps/my-app"), false);
});

Deno.test("checkAccess: multiple scopes — any match allows", () => {
  const scopes = ["GET:/v1/apps/*", "POST:/v1/apps/my-app/scale"];
  assertEquals(checkAccess(scopes, "GET", "/v1/apps/my-app"), true);
  assertEquals(checkAccess(scopes, "POST", "/v1/apps/my-app/scale"), true);
  assertEquals(checkAccess(scopes, "POST", "/v1/apps/other/scale"), false);
  assertEquals(checkAccess(scopes, "DELETE", "/v1/apps/my-app"), false);
});

Deno.test("checkAccess: empty scopes denies everything", () => {
  assertEquals(checkAccess([], "GET", "/v1/apps"), false);
});

Deno.test("checkAccess: case-insensitive method matching", () => {
  assertEquals(checkAccess(["GET:/v1/apps/*"], "get", "/v1/apps/my-app"), true);
  assertEquals(checkAccess(["GET:/v1/apps/*"], "Get", "/v1/apps/my-app"), true);
});

Deno.test("checkAccess: exact path scope", () => {
  assertEquals(checkAccess(["POST:/v1/apps/my-app/scale"], "POST", "/v1/apps/my-app/scale"), true);
  assertEquals(
    checkAccess(["POST:/v1/apps/my-app/scale"], "POST", "/v1/apps/my-app/restart"),
    false,
  );
});
