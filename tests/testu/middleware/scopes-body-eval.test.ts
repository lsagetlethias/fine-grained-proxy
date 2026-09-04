import { assertEquals } from "@std/assert";
import { checkRequestAccess, type Scope } from "../../../src/middleware/scopes.ts";

// Le corps expose ses champs par des accesseurs : une lecture vaut une evaluation de filtre.
// C'est la seule facon d'observer le cout depuis l'exterieur sans instrumenter le code teste.
function countingBody(values: Record<string, string>): { body: unknown; reads: () => number } {
  let reads = 0;
  const body: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    Object.defineProperty(body, key, {
      enumerable: true,
      get() {
        reads++;
        return value;
      },
    });
  }
  return { body, reads: () => reads };
}

function filtered(pattern: string, key: string, expected: string): Scope {
  return {
    methods: ["POST"],
    pattern,
    bodyFilters: [{ objectPath: key, objectValue: [{ type: "any", value: expected }] }],
  };
}

Deno.test("T4: un scope autorise sur les deux formes n'evalue son corps qu'une fois", () => {
  const { body, reads } = countingBody({ branch: "main" });

  const v = checkRequestAccess([filtered("/v1/*", "branch", "main")], "POST", "/v1/./items", body);

  assertEquals(v.allowed, true);
  assertEquals(reads(), 1);
});

Deno.test("T4: un scope ecarte par son corps n'est pas reevalue a la seconde passe", () => {
  const { body, reads } = countingBody({ branch: "dev" });
  const scopes: Scope[] = [filtered("/v1/*", "branch", "main"), "POST:/v1/*"];

  const v = checkRequestAccess(scopes, "POST", "/v1/./items", body);

  assertEquals(v.allowed, true);
  assertEquals(reads(), 1);
});

Deno.test("T4: le budget est d'une evaluation par scope, pas d'une par passe", () => {
  const { body, reads } = countingBody({ a: "1", b: "2" });
  const scopes: Scope[] = [filtered("/v1/*", "a", "autre"), filtered("/v1/*", "b", "2")];

  const v = checkRequestAccess(scopes, "POST", "/v1/./items", body);

  assertEquals(v.allowed, true);
  assertEquals(reads(), 2);
});

Deno.test("T4: le refus par filtre de corps reste un refus, cause inchangee", () => {
  const { body, reads } = countingBody({ branch: "dev" });

  const v = checkRequestAccess([filtered("/v1/*", "branch", "main")], "POST", "/v1/./items", body);

  assertEquals(v.allowed, false);
  assertEquals(v.denialReason, "path");
  assertEquals(reads(), 1);
});

Deno.test("T4: un scope filtre autorise en forme brute reste refuse sur la forme canonique", () => {
  const { body, reads } = countingBody({ branch: "main" });

  const v = checkRequestAccess(
    [filtered("/v1/public/*", "branch", "main")],
    "POST",
    "/v1/public/..%2f..%2fadmin",
    body,
  );

  assertEquals(v.allowed, false);
  assertEquals(v.denialReason, "path_encoded");
  assertEquals(reads(), 1);
});

Deno.test("T4: un scope filtre sans corps refuse immediatement, forme brute non canonique", () => {
  const v = checkRequestAccess([filtered("/v1/*", "branch", "main")], "POST", "/v1/./items");

  assertEquals(v.allowed, false);
  assertEquals(v.denialReason, "path");
});
