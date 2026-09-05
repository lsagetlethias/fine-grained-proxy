import { assertEquals } from "@std/assert";

import { buildScopes } from "../../../src/ui/client/build-scopes.ts";
import { pruneOrphanScopeFilters } from "../../../src/ui/client/scopes.ts";
import type {
  QueryFilterData,
  ScopeFiltersData,
  ScopeWithFilters,
} from "../../../src/ui/client/types.ts";

const SCOPE = "GET:/v1/items";

function emptyData(): ScopeFiltersData {
  return { bodyFiltersData: {}, queryFiltersData: {} };
}

function queryFilter(partial: Partial<QueryFilterData>): QueryFilterData {
  return {
    id: 1,
    param: "status",
    required: false,
    filterType: "any",
    values: [],
    ...partial,
  };
}

function withQueryFilter(filter: QueryFilterData): ScopeFiltersData {
  const data = emptyData();
  data.queryFiltersData[SCOPE] = [filter];
  return data;
}

function entries(scopes: unknown[]): ScopeWithFilters[] {
  return scopes.filter((s): s is ScopeWithFilters => typeof s !== "string");
}

Deno.test("un filtre query complet produit bien une entree structuree", () => {
  const data = withQueryFilter(queryFilter({ values: ["open"] }));
  const built = buildScopes(SCOPE, data);
  assertEquals(built.errors, []);
  assertEquals(built.scopes.length, 1);
  assertEquals(entries(built.scopes)[0].queryFilters, [{
    param: "status",
    values: [{ type: "any", value: "open" }],
  }]);
});

// Les quatre formes de vide. Chacune produisait un blob SANS contrainte de query, en v3 au
// lieu de v5, pendant que l'alerte de deni par defaut et la chip du scope affirmaient le
// contraire a l'ecran, sans message, sans champ en erreur et avec le bouton actif.
const EMPTY_FORMS: [string, QueryFilterData][] = [
  ["parametre vide", queryFilter({ param: "  ", values: ["open"] })],
  ["valeur vide", queryFilter({ values: [""] })],
  ["liste de valeurs vide", queryFilter({ values: [] })],
  ["not vide", queryFilter({ filterType: "not", notInnerType: "any", notInnerValue: "" })],
  ["and sans condition", queryFilter({ filterType: "and", andConditions: [] })],
];

for (const [label, filter] of EMPTY_FORMS) {
  Deno.test(`saisie incomplete bloquante : ${label}`, () => {
    const built = buildScopes(SCOPE, withQueryFilter(filter));
    assertEquals(built.errors.length, 1, label);
    // L'invariant : jamais de retombee en scope chaine, qui serait une autorisation large.
    assertEquals(built.scopes, [], label);
  });
}

Deno.test("le message nomme le scope et le filtre fautif", () => {
  const built = buildScopes(SCOPE, withQueryFilter(queryFilter({ param: "page", values: [""] })));
  assertEquals(built.errors[0].includes("page"), true, built.errors[0]);
  assertEquals(built.errors[0].includes(SCOPE), true, built.errors[0]);

  const anonymous = buildScopes(SCOPE, withQueryFilter(queryFilter({ param: "", values: [""] })));
  assertEquals(anonymous.errors[0].includes("n° 1"), true, anonymous.errors[0]);
});

Deno.test("un ET dont une condition est vide ne se replie pas sur l'autre", () => {
  // Cas derive : l'aplatissement RELACHAIT la contrainte au lieu de la supprimer. L'auteur
  // ecrivait « status=open ET version=2 », oubliait la seconde, et obtenait « status=open ».
  const built = buildScopes(
    SCOPE,
    withQueryFilter(queryFilter({
      filterType: "and",
      andConditions: [
        { id: 1, conditionType: "any", value: "open", notInnerType: null, notInnerValue: null },
        { id: 2, conditionType: "any", value: "", notInnerType: null, notInnerValue: null },
      ],
    })),
  );
  assertEquals(built.errors.length, 1);
  assertEquals(built.scopes, []);
});

Deno.test("un ET a une seule condition reellement ecrite reste aplati", () => {
  // L'aplatissement existe parce que « and » a une condition est refuse a la generation :
  // le fermer sur la saisie incomplete ne doit pas casser la saisie complete.
  const built = buildScopes(
    SCOPE,
    withQueryFilter(queryFilter({
      filterType: "and",
      andConditions: [
        { id: 1, conditionType: "any", value: "open", notInnerType: null, notInnerValue: null },
      ],
    })),
  );
  assertEquals(built.errors, []);
  assertEquals(entries(built.scopes)[0].queryFilters?.[0].values, [{
    type: "any",
    value: "open",
  }]);
});

Deno.test("un filtre incomplet n'empeche pas les autres scopes de sortir", () => {
  const data = emptyData();
  data.queryFiltersData[SCOPE] = [queryFilter({ values: [""] })];
  const built = buildScopes(`${SCOPE}\nGET:/v1/other`, data);
  assertEquals(built.errors.length, 1);
  assertEquals(built.scopes, ["GET:/v1/other"]);
});

// --- Purge des scopes orphelins ---

Deno.test("une cle de query filter que le textarea ne declare plus est purgee", () => {
  // buildScopes itere l'union des cles des deux maps sans consulter le textarea : sans purge,
  // un scope retire par son auteur reste dans le blob et continue d'accorder l'acces.
  const data = withQueryFilter(queryFilter({ values: ["open"] }));
  data.bodyFiltersData["POST:/v1/deploys"] = [{
    id: 2,
    objectPath: "ref",
    filterType: "any",
    values: ["main"],
    valueSubTypes: ["text"],
  }];

  // buildScopes ne depend d'aucun rafraichissement de l'interface : un scope absent du
  // textarea ne sort pas, purge ou pas.
  assertEquals(buildScopes("", data).scopes, []);
  assertEquals(buildScopes(`${SCOPE}\nPOST:/v1/deploys`, data).scopes.length, 2);

  pruneOrphanScopeFilters([], data);
  assertEquals(Object.keys(data.queryFiltersData), []);
  assertEquals(Object.keys(data.bodyFiltersData), []);
  assertEquals(buildScopes("", data).scopes, []);
});

Deno.test("la purge ne touche pas les cles encore declarees", () => {
  const data = withQueryFilter(queryFilter({ values: ["open"] }));
  data.queryFiltersData["GET:/v1/other"] = [queryFilter({ id: 3, values: ["x"] })];
  pruneOrphanScopeFilters([SCOPE], data);
  assertEquals(Object.keys(data.queryFiltersData), [SCOPE]);
});
