import { assertEquals } from "@std/assert";
import { checkAccess, matchPath, parseScope } from "../../../src/middleware/scopes.ts";

// --- parseScope edge cases ---

Deno.test("parseScope: scope with only colon defaults to empty method and empty pattern", () => {
  const result = parseScope(":");
  assertEquals(result, { methods: [""], pattern: "" });
});

Deno.test("parseScope: lowercase methods are uppercased", () => {
  assertEquals(parseScope("get:/v1/apps/*"), { methods: ["GET"], pattern: "/v1/apps/*" });
});

Deno.test("parseScope: mixed case multi-method is uppercased", () => {
  assertEquals(parseScope("get|Post|DELETE:/v1/apps/*"), {
    methods: ["GET", "POST", "DELETE"],
    pattern: "/v1/apps/*",
  });
});

Deno.test("parseScope: method with pipes produces array including empty strings", () => {
  const result = parseScope("GET||POST:/v1/apps");
  assertEquals(result, { methods: ["GET", "", "POST"], pattern: "/v1/apps" });
});

Deno.test("parseScope: pattern with multiple colons keeps everything after first colon", () => {
  const result = parseScope("GET:http://example.com/path");
  assertEquals(result, { methods: ["GET"], pattern: "http://example.com/path" });
});

Deno.test("parseScope: empty string scope defaults to wildcard method", () => {
  const result = parseScope("");
  assertEquals(result, { methods: ["*"], pattern: "" });
});

// --- matchPath edge cases ---

Deno.test("matchPath: empty pattern matches only empty path", () => {
  assertEquals(matchPath("", ""), true);
  assertEquals(matchPath("", "/v1/apps"), false);
});

Deno.test("matchPath: trailing slash exact mismatch", () => {
  assertEquals(matchPath("/v1/apps", "/v1/apps/"), false);
  assertEquals(matchPath("/v1/apps/", "/v1/apps"), false);
});

Deno.test("matchPath: wildcard at end with trailing slash in path", () => {
  assertEquals(matchPath("/v1/apps/*", "/v1/apps/"), true);
  assertEquals(matchPath("/v1/apps/*", "/v1/apps/my-app/"), true);
});

Deno.test("matchPath: wildcard mid-pattern treats as prefix match up to wildcard", () => {
  assertEquals(matchPath("/v1/*/containers", "/v1/apps/containers"), true);
  assertEquals(matchPath("/v1/*/containers", "/v1/anything-goes-here"), true);
  assertEquals(matchPath("/v1/*/containers", "/v2/apps/containers"), false);
});

Deno.test("matchPath: pattern is just a wildcard star", () => {
  assertEquals(matchPath("*", ""), true);
  assertEquals(matchPath("*", "/"), true);
  assertEquals(matchPath("*", "/deeply/nested/path"), true);
});

Deno.test("matchPath: pattern with wildcard at position 0", () => {
  assertEquals(matchPath("*/foo", ""), true);
  assertEquals(matchPath("*/foo", "/bar"), true);
  assertEquals(matchPath("*/foo", "anything"), true);
});

// --- checkAccess edge cases ---

Deno.test("checkAccess: path with query string is matched as-is", () => {
  assertEquals(checkAccess(["GET:/v1/apps/*"], "GET", "/v1/apps/my-app?page=1"), true);
  assertEquals(checkAccess(["GET:/v1/apps/my-app"], "GET", "/v1/apps/my-app?page=1"), false);
});

Deno.test("checkAccess: HEAD method not matched by GET scope", () => {
  assertEquals(checkAccess(["GET:/v1/apps/*"], "HEAD", "/v1/apps/my-app"), false);
});

Deno.test("checkAccess: method matching is case-insensitive for lowercase scope", () => {
  assertEquals(checkAccess(["get:/v1/apps/*"], "GET", "/v1/apps/my-app"), true);
});

Deno.test("checkAccess: multiple scopes, first denies, second allows", () => {
  const scopes = ["POST:/v1/apps/other", "GET:/v1/apps/my-app"];
  assertEquals(checkAccess(scopes, "GET", "/v1/apps/my-app"), true);
});

Deno.test("checkAccess: overlapping scopes (narrow + broad)", () => {
  const scopes = ["GET:/v1/apps/my-app", "*:*"];
  assertEquals(checkAccess(scopes, "DELETE", "/v1/apps/my-app"), true);
  assertEquals(checkAccess(scopes, "GET", "/v1/apps/my-app"), true);
});

Deno.test("checkAccess: three-pipe method scope", () => {
  assertEquals(
    checkAccess(["GET|POST|PUT|DELETE:/v1/apps/*"], "PUT", "/v1/apps/my-app"),
    true,
  );
  assertEquals(
    checkAccess(["GET|POST|PUT|DELETE:/v1/apps/*"], "PATCH", "/v1/apps/my-app"),
    false,
  );
});
