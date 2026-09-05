import { assertEquals } from "@std/assert";

import {
  checkRequestAccess,
  decideQueryFilters,
  QUERY_OCCURRENCE_CAP_DEFAULT,
  QUERY_OCCURRENCE_CAP_WITH_REGEX,
  queryOccurrenceCap,
} from "../../../src/middleware/scopes.ts";
import type {
  ObjectValue,
  QueryFilter,
  Scope,
  ScopeEntry,
} from "../../../src/middleware/scopes.ts";

function entry(queryFilters: QueryFilter[], over = {}): ScopeEntry {
  return { methods: ["GET"], pattern: "/v1/items", queryFilters, ...over };
}

function verdict(scopes: Scope[], pathWithQuery: string, method = "GET", body?: unknown) {
  return checkRequestAccess(scopes, method, pathWithQuery, body);
}

function allowed(scopes: Scope[], pathWithQuery: string, method = "GET", body?: unknown): boolean {
  return verdict(scopes, pathWithQuery, method, body).allowed;
}

const OPEN_OR_PENDING: ObjectValue[] = [
  { type: "any", value: "open" },
  { type: "any", value: "pending" },
];

const ANY_VALUE: ObjectValue[] = [{ type: "wildcard" }];

// --- AC-51 : semantique de l'axe query ---

Deno.test("AC-51.1: NON-REGRESSION, un scope sans queryFilters ne contraint aucun parametre", () => {
  for (
    const scope of [
      "GET:/v1/items",
      { methods: ["GET"], pattern: "/v1/items" } as ScopeEntry,
    ]
  ) {
    assertEquals(allowed([scope], "/v1/items?action=delete&scope=all"), true);
  }
});

Deno.test("AC-51.2: un ScopeEntry a bodyFilters sans queryFilters est inchange", () => {
  const scope: ScopeEntry = {
    methods: ["POST"],
    pattern: "/deploy",
    bodyFilters: [{ objectPath: "ref", objectValue: [{ type: "any", value: "main" }] }],
  };
  assertEquals(allowed([scope], "/deploy?whatever=1", "POST", { ref: "main" }), true);
});

Deno.test("AC-51.3: parametre declare, valeur couverte", () => {
  const scope = entry([{ param: "status", values: OPEN_OR_PENDING }]);
  assertEquals(allowed([scope], "/v1/items?status=open"), true);
  assertEquals(allowed([scope], "/v1/items?status=pending"), true);
});

Deno.test("AC-51.4: parametre declare, valeur non couverte", () => {
  const scope = entry([{ param: "status", values: OPEN_OR_PENDING }]);
  const v = verdict([scope], "/v1/items?status=closed");
  assertEquals(v.allowed, false);
  assertEquals(v.denial?.axis, "query");
  assertEquals(v.denial?.query?.reason, "value");
  assertEquals(v.denial?.query?.param, "status");
});

Deno.test("AC-51.5: deni par defaut, un parametre non declare fait echouer le scope", () => {
  const scope = entry([{ param: "status", values: OPEN_OR_PENDING }]);
  const v = verdict([scope], "/v1/items?status=open&sort=asc");
  assertEquals(v.allowed, false);
  assertEquals(v.denial?.query?.reason, "undeclared");
  assertEquals(v.denial?.query?.param, "sort");
});

Deno.test("AC-51.6: le deni par defaut ne se desactive pas filtre par filtre", () => {
  const scope = entry([{ param: "page", values: ANY_VALUE, required: false }]);
  const v = verdict([scope], "/v1/items?page=2&debug=1");
  assertEquals(v.allowed, false);
  assertEquals(v.denial?.query?.reason, "undeclared");
  assertEquals(v.denial?.query?.param, "debug");
});

Deno.test("AC-51.7: required true et parametre absent", () => {
  const scope = entry([{ param: "status", values: OPEN_OR_PENDING, required: true }]);
  const v = verdict([scope], "/v1/items");
  assertEquals(v.allowed, false);
  assertEquals(v.denial?.query?.reason, "required_missing");
  assertEquals(v.denial?.query?.param, "status");
});

Deno.test("AC-51.8: required false et parametre absent, le filtre est trivialement satisfait", () => {
  const scope = entry([{ param: "page", values: ANY_VALUE }]);
  assertEquals(allowed([scope], "/v1/items"), true);
});

Deno.test("AC-51.9: required false n'assouplit pas l'evaluation d'une valeur presente", () => {
  const scope = entry([{
    param: "status",
    values: [{ type: "any", value: "open" }],
    required: false,
  }]);
  assertEquals(allowed([scope], "/v1/items?status=closed"), false);
  assertEquals(allowed([scope], "/v1/items?status=open"), true);
});

Deno.test("AC-51.10: occurrences multiples, AND entre occurrences et OR entre valeurs", () => {
  const scope = entry([{
    param: "tag",
    values: [{ type: "any", value: "feature" }, { type: "any", value: "bugfix" }],
  }]);
  assertEquals(allowed([scope], "/v1/items?tag=feature&tag=bugfix"), true);
});

Deno.test("AC-51.11: une seule occurrence non conforme fait echouer le filtre", () => {
  const scope = entry([{
    param: "tag",
    values: [{ type: "any", value: "feature" }, { type: "any", value: "bugfix" }],
  }]);
  const v = verdict([scope], "/v1/items?tag=feature&tag=urgent");
  assertEquals(v.allowed, false);
  assertEquals(v.denial?.query?.reason, "value");
  assertEquals(v.denial?.query?.param, "tag");
});

Deno.test("AC-51.12: l'ordre des parametres est sans effet", () => {
  const scope = entry([
    { param: "status", values: OPEN_OR_PENDING },
    { param: "page", values: ANY_VALUE },
  ]);
  assertEquals(allowed([scope], "/v1/items?status=open&page=2"), true);
  assertEquals(allowed([scope], "/v1/items?page=2&status=open"), true);

  // Et sur un refus, la cause reste la meme dans les deux sens.
  const a = verdict([scope], "/v1/items?status=bad&page=2");
  const b = verdict([scope], "/v1/items?page=2&status=bad");
  assertEquals(a.denial?.query?.reason, b.denial?.query?.reason);
  assertEquals(a.denial?.query?.param, b.denial?.query?.param);
});

Deno.test("AC-51.13: l'axe query est en AND avec methode, chemin et body", () => {
  const scope: ScopeEntry = {
    methods: ["POST"],
    pattern: "/deploy",
    bodyFilters: [{ objectPath: "ref", objectValue: [{ type: "any", value: "main" }] }],
    queryFilters: [{ param: "env", values: [{ type: "any", value: "prod" }] }],
  };
  assertEquals(allowed([scope], "/deploy?env=prod", "POST", { ref: "main" }), true);
  // body conforme, query non conforme
  assertEquals(allowed([scope], "/deploy?env=staging", "POST", { ref: "main" }), false);
  // query conforme, body non conforme
  assertEquals(allowed([scope], "/deploy?env=prod", "POST", { ref: "dev" }), false);
  // methode non conforme
  assertEquals(allowed([scope], "/deploy?env=prod", "GET", { ref: "main" }), false);
});

Deno.test("AC-51.14: requete sans query sur un scope a filtres tous optionnels", () => {
  const scope = entry([
    { param: "page", values: ANY_VALUE },
    { param: "sort", values: ANY_VALUE },
  ]);
  assertEquals(allowed([scope], "/v1/items"), true);
});

Deno.test("AC-51.15: additivite, un scope non contraignant autorise malgre le scope contraignant", () => {
  const scopes: Scope[] = [
    "GET:/v1/items",
    entry([{ param: "status", values: [{ type: "any", value: "open" }] }]),
  ];
  const v = verdict(scopes, "/v1/items?force=true");
  assertEquals(v.allowed, true);
  // C'est le scope string qui accorde, pas celui qui contraint.
  assertEquals(v.grantedBy, 0);
  assertEquals(v.queryConstrained, false);
});

Deno.test("AC-51.15 bis: additivite entre deux scopes contraints, dans les deux ordres", () => {
  // AC-51.15 met un scope string en premier, et un scope string sort de la boucle avant que
  // l'axe query soit atteint : cette forme ne peut pas exercer le partage des decisions de
  // query entre scopes. Deux ScopeEntry contraints, si. Le refus du premier ne doit jamais
  // etre resservi au second, sans quoi l'additivite tombe des que l'auteur declare deux
  // scopes contraints sur le meme chemin, ce qui est le cas d'usage normal de la feature.
  const byStatus = entry([{ param: "status", values: [{ type: "any", value: "open" }] }]);
  const bySort = entry([{ param: "sort", values: [{ type: "any", value: "asc" }] }]);

  for (
    const [label, scopes] of [
      ["contraignant d'abord", [byStatus, bySort]],
      ["contraignant ensuite", [bySort, byStatus]],
    ] as [string, Scope[]][]
  ) {
    const onSort = verdict(scopes, "/v1/items?sort=asc");
    assertEquals(onSort.allowed, true, `${label} : ?sort=asc doit etre autorise`);
    const onStatus = verdict(scopes, "/v1/items?status=open");
    assertEquals(onStatus.allowed, true, `${label} : ?status=open doit etre autorise`);
    // Et l'additivite n'ouvre rien : un parametre qu'aucun des deux ne declare reste refuse.
    assertEquals(allowed(scopes, "/v1/items?force=true"), false, label);
  }
});

Deno.test("AC-51.15 ter: additivite quand le scope contraignant precede le scope string", () => {
  const scopes: Scope[] = [
    entry([{ param: "status", values: [{ type: "any", value: "open" }] }]),
    "GET:/v1/items",
  ];
  const v = verdict(scopes, "/v1/items?force=true");
  assertEquals(v.allowed, true);
  assertEquals(v.grantedBy, 1);
  assertEquals(v.queryConstrained, false);
});

Deno.test("AC-56.9 bis: le troisieme etat ne se declenche pas a tort", () => {
  const constrained = entry([{ param: "status", values: [{ type: "any", value: "open" }] }]);

  // Cas de l'enonce : le seul scope couvrant le chemin de test porte les filtres. La note
  // due est celle de l'etat 2, et le troisieme etat n'a pas lieu d'etre.
  const only = verdict([constrained], "/v1/items?status=open");
  assertEquals(only.allowed, true);
  assertEquals(only.queryConstrained, true);

  // Cas que le troisieme etat ne doit PAS revendiquer : le scope contraignant vit ailleurs
  // dans le blob, sur un autre chemin. Une note qui apparaitrait ici alarmerait sur un
  // chemin que rien ne contraint, et serait ignoree en deux jours.
  const elsewherePath: Scope[] = [
    "GET:/v1/other",
    { ...constrained, pattern: "/v1/items" } as ScopeEntry,
  ];
  const other = verdict(elsewherePath, "/v1/other?force=true");
  assertEquals(other.allowed, true);
  assertEquals(other.queryConstrained, false);
  assertEquals(other.queryConstrainedElsewhere, false);

  // Meme chemin, autre methode : le scope contraignant ne couvre pas cette requete non plus.
  const elsewhereMethod: Scope[] = [
    "POST:/v1/items",
    { ...constrained, methods: ["GET"] } as ScopeEntry,
  ];
  const post = verdict(elsewhereMethod, "/v1/items?force=true", "POST");
  assertEquals(post.allowed, true);
  assertEquals(post.queryConstrainedElsewhere, false);

  // Temoin : sur le chemin et la methode reellement couverts, le drapeau se leve bien.
  assertEquals(
    verdict(["GET:/v1/items", constrained], "/v1/items?force=true").queryConstrainedElsewhere,
    true,
  );
});

Deno.test("AC-54.6 bis: un queryFilters vide ne contraint rien a l'evaluation", () => {
  // Le pendant matching d'AC-54.6, qui ne verifie que l'absence de bump de version. Un
  // tableau vide traite comme un axe present declencherait le deni par defaut sur tous les
  // parametres, alors qu'il est semantiquement identique a l'absence de l'axe.
  const empty: ScopeEntry = { methods: ["GET"], pattern: "/v1/items", queryFilters: [] };
  assertEquals(allowed([empty], "/v1/items?force=true&sort=asc"), true);
  assertEquals(allowed([empty], "/v1/items"), true);
  const v = verdict([empty], "/v1/items?force=true");
  assertEquals(v.queryConstrained, false);
});

Deno.test("AC-51.16: les autres types d'ObjectValue fonctionnent sur une valeur de query", () => {
  const cases: [string, ObjectValue, string, string][] = [
    ["wildcard", { type: "wildcard" }, "n-importe-quoi", ""],
    ["stringwildcard", { type: "stringwildcard", value: "release/*" }, "release/v2", "main"],
    ["regex", { type: "regex", value: "\\d+" }, "42", "abc"],
    [
      "and",
      {
        type: "and",
        value: [{ type: "stringwildcard", value: "rel*" }, { type: "regex", value: "[a-z]+\\d" }],
      },
      "release2",
      "release",
    ],
    ["not", { type: "not", value: { type: "any", value: "develop" } }, "main", "develop"],
  ];
  for (const [label, value, ok, ko] of cases) {
    const scope = entry([{ param: "q", values: [value] }]);
    assertEquals(allowed([scope], `/v1/items?q=${ok}`), true, `${label} devrait accepter ${ok}`);
    if (ko !== "") {
      assertEquals(allowed([scope], `/v1/items?q=${ko}`), false, `${label} devrait refuser ${ko}`);
    }
  }
});

// --- AC-52 : plafond d'occurrences a deux paliers (partie non mesuree) ---

function repeat(param: string, n: number, value = "v"): string {
  return "/v1/items?" + Array.from({ length: n }, () => `${param}=${value}`).join("&");
}

const REGEX_FILTER: QueryFilter = { param: "ids", values: [{ type: "regex", value: "[a-z0-9]+" }] };
const PLAIN_FILTER: QueryFilter = { param: "ids", values: [{ type: "wildcard" }] };

Deno.test("AC-52.1: palier haut, au plafond exact toutes occurrences conformes", () => {
  const scope = entry([PLAIN_FILTER]);
  assertEquals(allowed([scope], repeat("ids", QUERY_OCCURRENCE_CAP_DEFAULT)), true);
});

Deno.test("AC-52.2: palier haut, FAIL-CLOSED au-dela du plafond meme toutes conformes", () => {
  const scope = entry([PLAIN_FILTER]);
  const v = verdict([scope], repeat("ids", QUERY_OCCURRENCE_CAP_DEFAULT + 1));
  assertEquals(v.allowed, false);
  assertEquals(v.denial?.query?.reason, "too_many_occurrences");
  assertEquals(v.denial?.query?.param, "ids");
  assertEquals(v.denial?.query?.cap, QUERY_OCCURRENCE_CAP_DEFAULT);
});

Deno.test("AC-52.3: palier bas, un filtre portant une regex directe plafonne a 4", () => {
  const scope = entry([REGEX_FILTER]);
  assertEquals(allowed([scope], repeat("ids", QUERY_OCCURRENCE_CAP_WITH_REGEX)), true);
  const v = verdict([scope], repeat("ids", QUERY_OCCURRENCE_CAP_WITH_REGEX + 1));
  assertEquals(v.allowed, false);
  assertEquals(v.denial?.query?.reason, "too_many_occurrences");
  assertEquals(v.denial?.query?.cap, QUERY_OCCURRENCE_CAP_WITH_REGEX);
});

Deno.test("AC-52.4: palier bas, la regex imbriquee declasse aussi le filtre", () => {
  const nested: [string, ObjectValue][] = [
    ["and de premier niveau", {
      type: "and",
      value: [{ type: "regex", value: "[a-z]+" }, { type: "wildcard" }],
    }],
    ["not", { type: "not", value: { type: "regex", value: "\\d+" } }],
    ["not dans un and", {
      type: "and",
      value: [{ type: "wildcard" }, { type: "not", value: { type: "regex", value: "\\d+" } }],
    }],
  ];
  for (const [label, value] of nested) {
    assertEquals(
      queryOccurrenceCap({ param: "ids", values: [value] }),
      QUERY_OCCURRENCE_CAP_WITH_REGEX,
      `${label} doit declasser au palier bas`,
    );
    const scope = entry([{ param: "ids", values: [value] }]);
    const v = verdict([scope], repeat("ids", QUERY_OCCURRENCE_CAP_WITH_REGEX + 1, "abc"));
    assertEquals(v.denial?.query?.reason, "too_many_occurrences", label);
  }
});

Deno.test("AC-52.5: le palier ne depend que du filtre, jamais de la requete", () => {
  // La fonction ne prend que le filtre en entree : aucune donnee de requete ne peut
  // l'influencer, et deux appels sur des requetes differentes rendent le meme verdict.
  assertEquals(queryOccurrenceCap(PLAIN_FILTER), QUERY_OCCURRENCE_CAP_DEFAULT);
  assertEquals(queryOccurrenceCap(REGEX_FILTER), QUERY_OCCURRENCE_CAP_WITH_REGEX);

  const scope = entry([REGEX_FILTER]);
  const first = verdict([scope], repeat("ids", 5, "abc"));
  const second = verdict([scope], repeat("ids", 5, "abc"));
  assertEquals(first.allowed, second.allowed);
  assertEquals(first.denial?.query?.cap, second.denial?.query?.cap);
});

Deno.test("AC-52.6: jamais de troncage silencieux, sur les deux paliers", () => {
  const tiers: [string, QueryFilter, number][] = [
    ["palier bas", {
      param: "ids",
      values: [{ type: "regex", value: "feature" }],
    }, QUERY_OCCURRENCE_CAP_WITH_REGEX],
    ["palier haut", {
      param: "ids",
      values: [{ type: "any", value: "feature" }],
    }, QUERY_OCCURRENCE_CAP_DEFAULT],
  ];
  for (const [label, filter, cap] of tiers) {
    const scope = entry([filter]);
    const query = "/v1/items?" +
      Array.from({ length: cap }, () => "ids=feature").join("&") + "&ids=force";
    assertEquals(allowed([scope], query), false, `${label} : troncage silencieux detecte`);
  }
});

Deno.test("AC-52.7: le palier est local au filtre, pas au ScopeEntry", () => {
  const scope = entry([
    { param: "tag", values: [{ type: "regex", value: "[a-z]+" }] },
    { param: "ids", values: [{ type: "wildcard" }] },
  ]);
  // 5 occurrences de « ids » (palier haut) et 4 de « tag » (palier bas) : le scope matche.
  const query = "/v1/items?" +
    Array.from({ length: 5 }, () => "ids=x").join("&") + "&" +
    Array.from({ length: 4 }, () => "tag=abc").join("&");
  assertEquals(allowed([scope], query), true);
});

Deno.test("AC-52.8: le plafond se compte par parametre, pas globalement sur la requete", () => {
  const scope = entry([
    { param: "tag", values: [{ type: "wildcard" }] },
    { param: "label", values: [{ type: "wildcard" }] },
  ]);
  const query = "/v1/items?" +
    Array.from({ length: QUERY_OCCURRENCE_CAP_DEFAULT }, () => "tag=x").join("&") + "&" +
    Array.from({ length: QUERY_OCCURRENCE_CAP_DEFAULT }, () => "label=y").join("&");
  assertEquals(allowed([scope], query), true);
});

Deno.test("AC-52.9: l'axe query n'est evalue qu'une fois malgre la double passe de chemin", () => {
  // « values » est lu par le classement en palier et par la phase d'evaluation, tous deux
  // a l'interieur de la decision. Compter ses acces compte donc les decisions.
  let reads = 0;
  const real: ObjectValue[] = [{ type: "any", value: "open" }];
  const counting: QueryFilter = {
    param: "status",
    get values() {
      reads++;
      return real;
    },
  };
  // Pattern a wildcard : les deux formes du chemin matchent, donc la seconde passe a bien
  // lieu au lieu d'etre court-circuitee par un refus sur la forme brute.
  const scope: ScopeEntry = {
    methods: ["GET"],
    pattern: "/v1/*",
    queryFilters: [counting],
  };

  reads = 0;
  checkRequestAccess([scope], "GET", "/v1/items?status=open");
  const canonicalReads = reads;

  reads = 0;
  // « /v1/x/../items » se canonicalise en « /v1/items » : deux formes distinctes, donc
  // deux passes de chemin, mais un seul axe query a evaluer.
  const v = checkRequestAccess([scope], "GET", "/v1/x/../items?status=open");
  assertEquals(v.allowed, true, "la seconde passe doit rester autorisee");
  assertEquals(
    reads,
    canonicalReads,
    `l'axe query doit etre memoise entre les deux passes : ${reads} lectures contre ` +
      `${canonicalReads} sur un chemin deja canonique`,
  );
});

Deno.test("AC-52.14: le plafond ne s'applique qu'aux parametres couverts par un filtre", () => {
  const scope = entry([PLAIN_FILTER]);
  const v = verdict([scope], repeat("autre", 100));
  assertEquals(v.allowed, false);
  // Le refus doit etre attribue au deni par defaut, pas au depassement de plafond.
  assertEquals(v.denial?.query?.reason, "undeclared");
  assertEquals(v.denial?.query?.param, "autre");
});

// --- AC-55 : analyse de la query ---

function denial(filters: QueryFilter[], search: string) {
  return decideQueryFilters(
    { methods: ["GET"], pattern: "/v1/items", queryFilters: filters },
    search,
  );
}

Deno.test("AC-55.1: decodage percent standard", () => {
  assertEquals(denial([{ param: "q", values: [{ type: "any", value: "a b" }] }], "?q=a%20b"), null);
});

Deno.test("AC-55.2: pas de double decodage, contrairement au chemin", () => {
  // Le chemin decode jusqu'a trois fois, la query une seule : la cible ne decodera qu'une fois.
  assertEquals(
    denial([{ param: "q", values: [{ type: "any", value: "%2Fx" }] }], "?q=%252Fx"),
    null,
  );
  assertEquals(
    denial([{ param: "q", values: [{ type: "any", value: "/x" }] }], "?q=%252Fx")?.reason,
    "value",
  );
});

Deno.test("AC-55.3: le signe plus est decode en espace", () => {
  assertEquals(denial([{ param: "q", values: [{ type: "any", value: "a b" }] }], "?q=a+b"), null);
  // Corollaire : ecrire « a+b » dans le filtre produit un filtre qui ne matchera jamais.
  assertEquals(
    denial([{ param: "q", values: [{ type: "any", value: "a+b" }] }], "?q=a+b")?.reason,
    "value",
  );
});

Deno.test("AC-55.4: parametre sans valeur et parametre a valeur vide sont indistinguables", () => {
  const filters: QueryFilter[] = [{ param: "flag", values: [{ type: "any", value: "" }] }];
  assertEquals(denial(filters, "?flag"), null);
  assertEquals(denial(filters, "?flag="), null);
  // « null » litteral est une troisieme chaine, distincte des deux precedentes.
  assertEquals(denial(filters, "?flag=null")?.reason, "value");
});

Deno.test("AC-55.5: le nom du parametre est sensible a la casse", () => {
  const d = denial([{ param: "status", values: ANY_VALUE }], "?Status=open");
  assertEquals(d?.reason, "undeclared");
  assertEquals(d?.param, "Status");
});

Deno.test("AC-55.6: les crochets font partie du nom du parametre", () => {
  assertEquals(denial([{ param: "ids[]", values: ANY_VALUE }], "?ids[]=1&ids[]=2"), null);
  assertEquals(denial([{ param: "ids", values: ANY_VALUE }], "?ids[]=1")?.reason, "undeclared");
});

Deno.test("AC-55.7: une valeur encodant du JSON n'est pas re-analysee", () => {
  const filters: QueryFilter[] = [{
    param: "filter",
    values: [{ type: "any", value: '{"a":1}' }],
  }];
  assertEquals(denial(filters, "?filter=%7B%22a%22%3A1%7D"), null);
});

Deno.test("AC-55.9: le point-virgule n'est pas un separateur", () => {
  // Non-goal documente : certaines piles amont decoupent sur « ; » et verraient deux
  // parametres. FGP en voit un seul, et ne peut pas deviner le parseur de la cible.
  assertEquals(denial([{ param: "a", values: ANY_VALUE }], "?a=1;force=true"), null);
  assertEquals(
    denial([{ param: "a", values: [{ type: "any", value: "1" }] }], "?a=1;force=true")?.reason,
    "value",
  );
});

Deno.test("AC-55.10: un parametre au nom vide est un parametre non declare", () => {
  const d = denial([{ param: "status", values: ANY_VALUE }], "?=orphelin");
  assertEquals(d?.reason, "undeclared");
  assertEquals(d?.param, "");
});
