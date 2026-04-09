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

Deno.test("AC-3.3: matchPath: prefix wildcard matches sub-paths", () => {
  assertEquals(matchPath("/v1/apps/*", "/v1/apps/my-app"), true);
  assertEquals(matchPath("/v1/apps/*", "/v1/apps/my-app/containers"), true);
  assertEquals(matchPath("/v1/apps/*", "/v1/apps/"), false);
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

// --- matchPath: multi-segment wildcards ---

Deno.test("matchPath: mid-pattern wildcard matches app + sub-resource", () => {
  assertEquals(matchPath("/v1/apps/*/collaborators/*", "/v1/apps/my-app/collaborators/john"), true);
  assertEquals(
    matchPath("/v1/apps/*/collaborators/*", "/v1/apps/my-app/collaborators/john/details"),
    true,
  );
});

Deno.test("matchPath: mid-pattern wildcard rejects path without sub-resource", () => {
  assertEquals(matchPath("/v1/apps/*/collaborators/*", "/v1/apps/my-app/scale"), false);
  assertEquals(matchPath("/v1/apps/*/collaborators/*", "/v1/apps/my-app/collaborators/"), false);
});

Deno.test("matchPath: mid-pattern wildcard requires at least one char per wildcard", () => {
  assertEquals(matchPath("/v1/*/containers", "/v1/apps/containers"), true);
  assertEquals(matchPath("/v1/*/containers", "/v1//containers"), false);
  assertEquals(matchPath("/v1/*/containers", "/v1/containers"), false);
});

Deno.test("matchPath: trailing wildcard still works with mid-pattern wildcards", () => {
  assertEquals(matchPath("/v1/apps/*", "/v1/apps/my-app"), true);
  assertEquals(matchPath("/v1/apps/*", "/v1/apps/my-app/anything"), true);
  assertEquals(matchPath("/v1/apps/*", "/v1/apps/"), false);
});

Deno.test("matchPath: multiple wildcards in sequence", () => {
  assertEquals(matchPath("/v1/*/ops/*/logs", "/v1/apps/ops/deploy/logs"), true);
  assertEquals(matchPath("/v1/*/ops/*/logs", "/v1/apps/ops/deploy/other"), false);
  assertEquals(matchPath("/v1/*/ops/*/logs", "/v1/x/ops/y/logs"), true);
});

// --- checkAccess ---

Deno.test("AC-3.1: checkAccess: single scope allows matching request", () => {
  assertEquals(checkAccess(["GET:/v1/apps/*"], "GET", "/v1/apps/my-app"), true);
});

Deno.test("AC-3.2: checkAccess: denies non-matching path", () => {
  assertEquals(checkAccess(["GET:/v1/apps/*"], "GET", "/v1/users/me"), false);
});

Deno.test("AC-3.11: checkAccess: denies non-matching method", () => {
  assertEquals(checkAccess(["GET:/v1/apps/*"], "POST", "/v1/apps/my-app"), false);
});

Deno.test("AC-3.4: checkAccess: wildcard method matches any method", () => {
  assertEquals(checkAccess(["*:/v1/apps/*"], "GET", "/v1/apps/my-app"), true);
  assertEquals(checkAccess(["*:/v1/apps/*"], "POST", "/v1/apps/my-app/scale"), true);
  assertEquals(checkAccess(["*:/v1/apps/*"], "DELETE", "/v1/apps/my-app"), true);
});

Deno.test("AC-3.7: checkAccess: full wildcard allows everything", () => {
  assertEquals(checkAccess(["*:*"], "GET", "/anything"), true);
  assertEquals(checkAccess(["*:*"], "POST", "/v1/apps/deploy"), true);
});

Deno.test("AC-3.5: checkAccess: multi-method scope", () => {
  assertEquals(checkAccess(["GET|POST:/v1/apps/*"], "GET", "/v1/apps/my-app"), true);
  assertEquals(checkAccess(["GET|POST:/v1/apps/*"], "POST", "/v1/apps/my-app/scale"), true);
  assertEquals(checkAccess(["GET|POST:/v1/apps/*"], "PUT", "/v1/apps/my-app"), false);
});

Deno.test("AC-3.10: checkAccess: multiple scopes — any match allows", () => {
  const scopes = ["GET:/v1/apps/*", "POST:/v1/apps/my-app/scale"];
  assertEquals(checkAccess(scopes, "GET", "/v1/apps/my-app"), true);
  assertEquals(checkAccess(scopes, "POST", "/v1/apps/my-app/scale"), true);
  assertEquals(checkAccess(scopes, "POST", "/v1/apps/other/scale"), false);
  assertEquals(checkAccess(scopes, "DELETE", "/v1/apps/my-app"), false);
});

Deno.test("AC-3.11: checkAccess: empty scopes denies everything (deny-all)", () => {
  assertEquals(checkAccess([], "GET", "/v1/apps"), false);
});

Deno.test("AC-3.8: checkAccess: case-insensitive method matching", () => {
  assertEquals(checkAccess(["GET:/v1/apps/*"], "get", "/v1/apps/my-app"), true);
  assertEquals(checkAccess(["GET:/v1/apps/*"], "Get", "/v1/apps/my-app"), true);
});

Deno.test("AC-3.2: checkAccess: exact path scope mismatch", () => {
  assertEquals(checkAccess(["POST:/v1/apps/my-app/scale"], "POST", "/v1/apps/my-app/scale"), true);
  assertEquals(
    checkAccess(["POST:/v1/apps/my-app/scale"], "POST", "/v1/apps/my-app/restart"),
    false,
  );
});

Deno.test("AC-3.6: checkAccess: multi-method scope denies unlisted method", () => {
  assertEquals(checkAccess(["GET|POST:/v1/apps/*"], "DELETE", "/v1/apps/my-app"), false);
});

Deno.test("AC-3.9: checkAccess: scope without colon defaults to wildcard method", () => {
  assertEquals(checkAccess(["/v1/apps/*"], "POST", "/v1/apps/my-app"), true);
  assertEquals(checkAccess(["/v1/apps/*"], "GET", "/v1/apps/my-app"), true);
  assertEquals(checkAccess(["/v1/apps/*"], "DELETE", "/v1/apps/my-app"), true);
});
