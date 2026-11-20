import { test } from "node:test";

import { assertEquals } from "../../_assert.ts";
import { checkAccess, matchPath, parseScope } from "../../../src/middleware/scopes.ts";

// --- parseScope edge cases ---

test("parseScope: scope with only colon defaults to empty method and empty pattern", () => {
  const result = parseScope(":");
  assertEquals(result, { methods: [""], pattern: "" });
});

test("parseScope: lowercase methods are uppercased", () => {
  assertEquals(parseScope("get:/v1/apps/*"), { methods: ["GET"], pattern: "/v1/apps/*" });
});

test("parseScope: mixed case multi-method is uppercased", () => {
  assertEquals(parseScope("get|Post|DELETE:/v1/apps/*"), {
    methods: ["GET", "POST", "DELETE"],
    pattern: "/v1/apps/*",
  });
});

test("parseScope: method with pipes produces array including empty strings", () => {
  const result = parseScope("GET||POST:/v1/apps");
  assertEquals(result, { methods: ["GET", "", "POST"], pattern: "/v1/apps" });
});

test("parseScope: pattern with multiple colons keeps everything after first colon", () => {
  const result = parseScope("GET:http://example.com/path");
  assertEquals(result, { methods: ["GET"], pattern: "http://example.com/path" });
});

test("parseScope: empty string scope defaults to wildcard method", () => {
  const result = parseScope("");
  assertEquals(result, { methods: ["*"], pattern: "" });
});

// --- matchPath edge cases ---

test("matchPath: empty pattern matches only empty path", () => {
  assertEquals(matchPath("", ""), true);
  assertEquals(matchPath("", "/v1/apps"), false);
});

test("matchPath: trailing slash exact mismatch", () => {
  assertEquals(matchPath("/v1/apps", "/v1/apps/"), false);
  assertEquals(matchPath("/v1/apps/", "/v1/apps"), false);
});

test("matchPath: wildcard at end with trailing slash in path", () => {
  assertEquals(matchPath("/v1/apps/*", "/v1/apps/"), false);
  assertEquals(matchPath("/v1/apps/*", "/v1/apps/my-app/"), true);
});

test("matchPath: wildcard mid-pattern requires segments on both sides", () => {
  assertEquals(matchPath("/v1/*/containers", "/v1/apps/containers"), true);
  assertEquals(matchPath("/v1/*/containers", "/v1/anything-goes-here"), false);
  assertEquals(matchPath("/v1/*/containers", "/v2/apps/containers"), false);
});

test("matchPath: pattern is just a wildcard star", () => {
  assertEquals(matchPath("*", ""), true);
  assertEquals(matchPath("*", "/"), true);
  assertEquals(matchPath("*", "/deeply/nested/path"), true);
});

test("matchPath: pattern with wildcard at position 0", () => {
  assertEquals(matchPath("*/foo", "x/foo"), true);
  assertEquals(matchPath("*/foo", "/bar/foo"), true);
  assertEquals(matchPath("*/foo", ""), false);
  assertEquals(matchPath("*/foo", "/bar"), false);
  assertEquals(matchPath("*/foo", "/foo"), false);
});

// --- checkAccess edge cases ---

test("checkAccess: path with query string is matched as-is", () => {
  assertEquals(checkAccess(["GET:/v1/apps/*"], "GET", "/v1/apps/my-app?page=1"), true);
  assertEquals(checkAccess(["GET:/v1/apps/my-app"], "GET", "/v1/apps/my-app?page=1"), false);
});

test("checkAccess: HEAD method not matched by GET scope", () => {
  assertEquals(checkAccess(["GET:/v1/apps/*"], "HEAD", "/v1/apps/my-app"), false);
});

test("checkAccess: method matching is case-insensitive for lowercase scope", () => {
  assertEquals(checkAccess(["get:/v1/apps/*"], "GET", "/v1/apps/my-app"), true);
});

test("checkAccess: multiple scopes, first denies, second allows", () => {
  const scopes = ["POST:/v1/apps/other", "GET:/v1/apps/my-app"];
  assertEquals(checkAccess(scopes, "GET", "/v1/apps/my-app"), true);
});

test("checkAccess: overlapping scopes (narrow + broad)", () => {
  const scopes = ["GET:/v1/apps/my-app", "*:*"];
  assertEquals(checkAccess(scopes, "DELETE", "/v1/apps/my-app"), true);
  assertEquals(checkAccess(scopes, "GET", "/v1/apps/my-app"), true);
});

test("checkAccess: three-pipe method scope", () => {
  assertEquals(checkAccess(["GET|POST|PUT|DELETE:/v1/apps/*"], "PUT", "/v1/apps/my-app"), true);
  assertEquals(checkAccess(["GET|POST|PUT|DELETE:/v1/apps/*"], "PATCH", "/v1/apps/my-app"), false);
});
