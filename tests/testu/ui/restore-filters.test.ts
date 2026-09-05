import { assertEquals } from "@std/assert";

import { restoreQueryFilter, restoreScopeFilters } from "../../../src/ui/client/restore-filters.ts";
import { buildScopes } from "../../../src/ui/client/build-scopes.ts";
import type {
  ScopeFiltersData,
  ScopeWithFilters,
  SerializedQueryFilter,
} from "../../../src/ui/client/types.ts";

const SCOPE = "GET:/v1/items";

function emptyData(): ScopeFiltersData {
  return { bodyFiltersData: {}, queryFiltersData: {} };
}

function scopeWith(queryFilters: SerializedQueryFilter[]): unknown {
  return { methods: ["GET"], pattern: "/v1/items", queryFilters };
}

function roundTrip(queryFilters: SerializedQueryFilter[]): SerializedQueryFilter[] | undefined {
  const data = emptyData();
  const report = restoreScopeFilters([scopeWith(queryFilters)], data);
  assertEquals(report.unsupported, []);
  const built = buildScopes(SCOPE, data);
  assertEquals(built.errors, []);
  const entry = built.scopes.find((s): s is ScopeWithFilters => typeof s !== "string");
  return entry?.queryFilters;
}

// L'aller-retour est le seul critere qui compte : ce que le formulaire regenere doit etre ce
// que le blob importe contenait. Une restauration partielle produit un token plus large sous
// le meme bandeau vert qu'une restauration fidele.
Deno.test("aller-retour : liste OR de plusieurs valeurs", () => {
  const filters: SerializedQueryFilter[] = [{
    param: "status",
    values: [
      { type: "any", value: "open" },
      { type: "any", value: "closed" },
    ],
  }];
  assertEquals(roundTrip(filters), filters);
});

Deno.test("aller-retour : exclusion", () => {
  const filters: SerializedQueryFilter[] = [{
    param: "force",
    values: [{ type: "not", value: { type: "any", value: "true" } }],
    required: true,
  }];
  assertEquals(roundTrip(filters), filters);
});

Deno.test("aller-retour : conjonction, y compris une exclusion imbriquee", () => {
  const filters: SerializedQueryFilter[] = [{
    param: "opts",
    values: [{
      type: "and",
      value: [
        { type: "stringwildcard", value: "v*" },
        { type: "not", value: { type: "regex", value: "beta" } },
      ],
    }],
  }];
  assertEquals(roundTrip(filters), filters);
});

Deno.test("aller-retour : wildcard et required", () => {
  const filters: SerializedQueryFilter[] = [{
    param: "trace",
    values: [{ type: "wildcard", value: "*" }],
    required: true,
  }];
  assertEquals(roundTrip(filters), filters);
});

// Les formes que le modele du formulaire ne porte pas. Lues sur values[0], elles revenaient
// amputees et silencieuses ; elles doivent desormais etre nommees.
Deno.test("non representable : une exclusion combinee a d'autres valeurs OR", () => {
  const result = restoreQueryFilter({
    param: "status",
    values: [
      { type: "not", value: { type: "any", value: "deleted" } },
      { type: "any", value: "open" },
    ],
  });
  assertEquals(result.ok, false);
});

Deno.test("non representable : des types melanges dans la liste OR", () => {
  const result = restoreQueryFilter({
    param: "status",
    values: [
      { type: "any", value: "open" },
      { type: "regex", value: "clo.*" },
    ],
  });
  assertEquals(result.ok, false);
});

Deno.test("non representable : une conjonction imbriquee dans une conjonction", () => {
  const result = restoreQueryFilter({
    param: "opts",
    values: [{
      type: "and",
      value: [
        { type: "any", value: "a" },
        { type: "and", value: [{ type: "any", value: "b" }] },
      ],
    }],
  });
  assertEquals(result.ok, false);
});

Deno.test("le rapport nomme le scope et le parametre non representables", () => {
  const data = emptyData();
  const report = restoreScopeFilters([scopeWith([{
    param: "status",
    values: [
      { type: "any", value: "open" },
      { type: "regex", value: "clo.*" },
    ],
  }])], data);
  assertEquals(report.unsupported.length, 1);
  assertEquals(report.unsupported[0].includes("status"), true, report.unsupported[0]);
  assertEquals(report.unsupported[0].includes(SCOPE), true, report.unsupported[0]);
  // Rien n'est ecrit a moitie : le scope n'a pas de filtre restaure du tout.
  assertEquals(data.queryFiltersData[SCOPE], undefined);
});

Deno.test("un scope v5 importe garde ses queryFilters au lieu de les perdre", () => {
  // L'import ne restaurait aucun filtre : l'auteur croyait reconduire son token et obtenait
  // un blob strictement plus large, pendant que l'interface affirmait la query libre.
  const data = emptyData();
  restoreScopeFilters([scopeWith([{
    param: "status",
    values: [{ type: "any", value: "open" }],
  }])], data);
  assertEquals(data.queryFiltersData[SCOPE]?.length, 1);
  assertEquals(data.queryFiltersData[SCOPE][0].param, "status");
});
