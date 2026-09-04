import { assertEquals } from "@std/assert";
import { canonicalizePath, checkRequestAccess } from "../../../src/middleware/scopes.ts";

Deno.test("AC-44.1: le percent-encoding ne contourne pas le scope", () => {
  const v = checkRequestAccess(["GET:/v1/public/*"], "GET", "/v1/public/..%2f..%2fadmin");
  assertEquals(v.allowed, false);
  assertEquals(v.denialReason, "path_encoded");
});

Deno.test("AC-44.2: la contre-oblique encodee ne contourne pas non plus", () => {
  const v = checkRequestAccess(["GET:/v1/public/*"], "GET", "/v1/public/..%5c..%5cadmin");
  assertEquals(v.allowed, false);
  assertEquals(v.denialReason, "path_encoded");
});

Deno.test("AC-44.3: le double encodage est refuse", () => {
  const v = checkRequestAccess(["GET:/v1/public/*"], "GET", "/v1/public/..%252f..%252fadmin");
  assertEquals(v.allowed, false);
});

Deno.test("AC-44.4: cas GitLab, un identifiant contenant %2F reste autorise", () => {
  const v = checkRequestAccess(
    ["GET:/api/v4/projects/*"],
    "GET",
    "/api/v4/projects/groupe%2Fprojet",
  );
  assertEquals(v.allowed, true);
});

Deno.test("AC-44.5: table de canonicalisation", () => {
  const cas: [string, string][] = [
    ["/v1//a//b", "/v1/a/b"],
    ["/v1/./a/../b", "/v1/b"],
    ["/v1/public/..%2f..%2fadmin", "/admin"],
    ["/a%5cb", "/a/b"],
    ["/v1/items", "/v1/items"],
    ["/", "/"],
  ];
  for (const [entree, attendu] of cas) {
    assertEquals(canonicalizePath(entree), attendu, entree);
  }
});

Deno.test("AC-44.6: un caractere de controle apres decodage est refuse", () => {
  const v = checkRequestAccess(["*:*"], "GET", "/v1/items%00.json");
  assertEquals(v.allowed, false);
  assertEquals(v.denialReason, "invalid_path");
});

Deno.test("AC-44.7: un chemin sans encodage donne le meme verdict qu'avant", () => {
  assertEquals(checkRequestAccess(["GET:/v1/apps/*"], "GET", "/v1/apps/my-app").allowed, true);
  assertEquals(checkRequestAccess(["GET:/v1/apps/*"], "POST", "/v1/apps/my-app").allowed, false);
  assertEquals(checkRequestAccess(["GET:/v1/apps/*"], "GET", "/v2/apps/my-app").allowed, false);
});

Deno.test("AC-46.1: la query n'est pas contrainte et le verdict le dit", () => {
  const v = checkRequestAccess(["GET:/v1/items"], "GET", "/v1/items?action=delete&scope=all");
  assertEquals(v.allowed, true);
  assertEquals(v.queryConstrained, false);
});
