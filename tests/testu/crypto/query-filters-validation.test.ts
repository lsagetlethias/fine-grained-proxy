import { assertEquals } from "@std/assert";

import { BlobConfig, decryptBlob, encryptBlob } from "../../../src/crypto/blob.ts";
import { matchBodyFilter } from "../../../src/middleware/scopes.ts";
import type { ObjectValue, QueryFilter, Scope } from "../../../src/middleware/scopes.ts";

const CLIENT_KEY = "query-filters-validation-key";
const SERVER_SALT = "query-filters-validation-salt";

// Le salt est public par conception, donc un blob se forge hors ligne : ces criteres
// passent deliberement par encryptBlob et jamais par /api/generate, sans quoi ils ne
// testeraient que la validation decorative (§19.5, ADR-0010).
function forge(scopes: Scope[], overrides?: Partial<BlobConfig>): Promise<string> {
  const config = {
    v: 5,
    token: "tk-us-abcdef1234567890",
    target: "https://api.example.com",
    auth: "bearer",
    scopes,
    ttl: 3600,
    createdAt: Math.floor(Date.now() / 1000),
    ...overrides,
  } as BlobConfig;
  return encryptBlob(config, CLIENT_KEY, SERVER_SALT);
}

function scopeWith(filters: unknown): Scope {
  return { methods: ["GET"], pattern: "/v1/items", queryFilters: filters } as unknown as Scope;
}

async function rejected(scopes: Scope[], overrides?: Partial<BlobConfig>): Promise<boolean> {
  const blob = await forge(scopes, overrides);
  try {
    await decryptBlob(blob, CLIENT_KEY, SERVER_SALT);
    return false;
  } catch {
    return true;
  }
}

async function accepted(scopes: Scope[], overrides?: Partial<BlobConfig>): Promise<BlobConfig> {
  const blob = await forge(scopes, overrides);
  return await decryptBlob(blob, CLIENT_KEY, SERVER_SALT);
}

const STRING_ANY: ObjectValue = { type: "any", value: "open" };

// --- AC-53 : validation du blob ---

Deno.test("AC-53.1: any de type string est accepte sur un query filter", async () => {
  const config = await accepted([scopeWith([{ param: "status", values: [STRING_ANY] }])]);
  assertEquals(config.v, 5);
});

Deno.test("AC-53.2: any non-string est refuse au dechiffrement", async () => {
  for (const value of [1, true, null]) {
    assertEquals(
      await rejected([scopeWith([{ param: "page", values: [{ type: "any", value }] }])]),
      true,
      `any avec ${JSON.stringify(value)} doit etre refuse`,
    );
  }
});

Deno.test("AC-53.4: la restriction descend dans un and", async () => {
  const nested = {
    type: "and",
    value: [{ type: "any", value: 1 }, { type: "wildcard" }],
  };
  assertEquals(await rejected([scopeWith([{ param: "page", values: [nested] }])]), true);
});

Deno.test("AC-53.5: FAIL-OPEN, la restriction descend dans un not", async () => {
  const nested = { type: "not", value: { type: "any", value: 1 } };
  assertEquals(await rejected([scopeWith([{ param: "page", values: [nested] }])]), true);
});

Deno.test("AC-53.6: FAIL-OPEN, demonstration, not sur un any non-string est toujours vrai", () => {
  // Ce test documente la NATURE du risque, pas le comportement du produit : il doit
  // survivre a la validation d'AC-53.5. matchObjectValue compare par JSON.stringify, et
  // JSON.stringify(1) ne vaut jamais JSON.stringify("1") : la condition interne est
  // toujours fausse, donc sa negation est toujours vraie. L'auteur ecrit « exclure la
  // page 1 » et obtient « accepter tout », sur un axe fait pour bloquer ?force=true.
  const permissif: ObjectValue = { type: "not", value: { type: "any", value: 1 } };
  const filter = { objectPath: "v", objectValue: [permissif] };
  for (const value of ["1", "deploy", ""]) {
    assertEquals(
      matchBodyFilter(filter, { v: value }),
      true,
      `not(any:1) doit matcher ${JSON.stringify(value)}, ce qui est le fail-open`,
    );
  }

  // Le meme not sur un any de type string, lui, discrimine reellement.
  const sain = {
    objectPath: "v",
    objectValue: [{ type: "not", value: STRING_ANY }] as ObjectValue[],
  };
  assertEquals(matchBodyFilter(sain, { v: "open" }), false);
  assertEquals(matchBodyFilter(sain, { v: "closed" }), true);
});

Deno.test("AC-53.6 bis: FAIL-OPEN, le not imbrique profondement est couvert aussi", async () => {
  const deep = {
    type: "and",
    value: [{ type: "not", value: { type: "any", value: true } }, { type: "wildcard" }],
  };
  assertEquals(await rejected([scopeWith([{ param: "page", values: [deep] }])]), true);
});

Deno.test("AC-53.7: plus de 8 queryFilters sur un ScopeEntry", async () => {
  const many = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ param: `p${i}`, values: [{ type: "wildcard" }] }));
  assertEquals(await rejected([scopeWith(many(9))]), true);
  assertEquals(await rejected([scopeWith(many(8))]), false);
});

Deno.test("AC-53.8: plus de 16 valeurs OR sur un queryFilter", async () => {
  const values = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ type: "any", value: `v${i}` }));
  assertEquals(await rejected([scopeWith([{ param: "status", values: values(17) }])]), true);
  assertEquals(await rejected([scopeWith([{ param: "status", values: values(16) }])]), false);
});

Deno.test("AC-53.9: deux queryFilters du meme scope sur le meme parametre", async () => {
  const dup = [
    { param: "status", values: [STRING_ANY] },
    { param: "status", values: [{ type: "any", value: "closed" }] },
  ];
  assertEquals(await rejected([scopeWith(dup)]), true);
});

Deno.test("AC-53.10: le budget de 4 valeurs regex est partage avec les bodyFilters", async () => {
  const regexValue = (v: string) => ({ type: "regex", value: v });
  const mixed = (bodyCount: number, queryCount: number): Scope[] => [{
    methods: ["POST"],
    pattern: "/v1/items",
    bodyFilters: [{
      objectPath: "ref",
      objectValue: Array.from({ length: bodyCount }, (_, i) => regexValue(`b${i}[a-z]`)),
    }],
    queryFilters: [{
      param: "q",
      values: Array.from({ length: queryCount }, (_, i) => regexValue(`q${i}[a-z]`)),
    }],
  } as unknown as Scope];

  // 3 + 2 = 5 depasse le budget global, 2 + 2 = 4 tient exactement dedans.
  assertEquals(await rejected(mixed(3, 2)), true);
  assertEquals(await rejected(mixed(2, 2)), false);
});

Deno.test("AC-53.11: le budget de 256 ObjectValue est partage", async () => {
  // 8 filtres de 16 valeurs par scope, sur assez de scopes pour depasser 256 au total.
  const filters = Array.from({ length: 8 }, (_, f) => ({
    param: `p${f}`,
    values: Array.from({ length: 16 }, (_, i) => ({ type: "any", value: `v${f}-${i}` })),
  }));
  const scope = (n: number) =>
    ({ methods: ["GET"], pattern: `/v${n}/items`, queryFilters: filters }) as unknown as Scope;

  // 2 scopes = 256 ObjectValue exactement, 3 scopes = 384 et depassent.
  assertEquals(await rejected([scope(1), scope(2)]), false);
  assertEquals(await rejected([scope(1), scope(2), scope(3)]), true);
});

Deno.test("AC-53.12: la profondeur and/not reste plafonnee a 4", async () => {
  const deep = {
    type: "and",
    value: [
      {
        type: "and",
        value: [
          {
            type: "and",
            value: [
              {
                type: "and",
                value: [
                  { type: "and", value: [{ type: "wildcard" }, { type: "wildcard" }] },
                  { type: "wildcard" },
                ],
              },
              { type: "wildcard" },
            ],
          },
          { type: "wildcard" },
        ],
      },
      { type: "wildcard" },
    ],
  };
  assertEquals(await rejected([scopeWith([{ param: "q", values: [deep] }])]), true);
});

Deno.test("AC-53.13: les combinaisons interdites sont heritees", async () => {
  const forbidden: unknown[] = [
    { type: "not", value: { type: "wildcard" } },
    { type: "not", value: { type: "not", value: STRING_ANY } },
    { type: "and", value: [] },
    { type: "and", value: [STRING_ANY] },
  ];
  for (const value of forbidden) {
    assertEquals(
      await rejected([scopeWith([{ param: "q", values: [value] }])]),
      true,
      `combinaison interdite acceptee : ${JSON.stringify(value)}`,
    );
  }
});

Deno.test("AC-53.17: param vide, absent ou non-string", async () => {
  const bad: unknown[] = [
    { values: [STRING_ANY] },
    { param: "", values: [STRING_ANY] },
    { param: 42, values: [STRING_ANY] },
  ];
  for (const filter of bad) {
    assertEquals(
      await rejected([scopeWith([filter])]),
      true,
      `param invalide accepte : ${JSON.stringify(filter)}`,
    );
  }
  // Et « values » vide ou absent est refuse au meme titre.
  assertEquals(await rejected([scopeWith([{ param: "q", values: [] }])]), true);
  assertEquals(await rejected([scopeWith([{ param: "q" }])]), true);
});

// --- AC-54 : version du blob et retro-compatibilite ---

const QUERY_SCOPE = scopeWith([{ param: "status", values: [STRING_ANY] }]);

Deno.test("AC-54.2: un blob v5 peut n'avoir qu'une auth string", async () => {
  const config = await accepted([QUERY_SCOPE], { auth: "bearer" });
  assertEquals(config.v, 5);
  assertEquals(config.auth, "bearer");
});

Deno.test("AC-54.3: un blob v5 a auth structuree est dechiffrable", async () => {
  // Combinaison de deux features livrees : deux headers d'auth (v4) et des queryFilters
  // (v5). La regle « auth objet implique v === 4 » rejetait ce blob en invalid_credentials,
  // c'est-a-dire le message qui envoie son porteur verifier une cle qui est bonne.
  const config = await accepted([QUERY_SCOPE], {
    auth: {
      type: "headers",
      headers: [
        { name: "X-API-Key", value: "sk-live-000000" },
        { name: "X-Client-Id", value: "acme" },
      ],
    },
    token: undefined,
  });
  assertEquals(config.v, 5);
  assertEquals(typeof config.auth, "object");
});

Deno.test("AC-54.4: NON-REGRESSION, le controle de version reste exhaustif", async () => {
  for (const v of [1, 6, 0, "5", undefined]) {
    assertEquals(
      await rejected([QUERY_SCOPE], { v } as Partial<BlobConfig>),
      true,
      `version ${JSON.stringify(v)} devrait etre refusee`,
    );
  }
});

Deno.test("AC-54.5: les blobs v2, v3 et v4 restent lus a l'identique", async () => {
  const v2 = await accepted(["GET:/v1/apps/*"], { v: 2 });
  assertEquals(v2.v, 2);

  const v3 = await accepted([{
    methods: ["POST"],
    pattern: "/deploy",
    bodyFilters: [{ objectPath: "ref", objectValue: [{ type: "any", value: "main" }] }],
  } as unknown as Scope], { v: 3 });
  assertEquals(v3.v, 3);

  const v4 = await accepted(["GET:/v2/resources/*"], {
    v: 4,
    auth: {
      type: "headers",
      headers: [{ name: "X-A", value: "1" }, { name: "X-B", value: "2" }],
    },
    token: undefined,
  });
  assertEquals(v4.v, 4);
});

Deno.test("AC-54.6: un queryFilters vide n'induit pas de bump et ne contraint rien", async () => {
  // Un tableau vide est semantiquement identique a l'absence : il ne doit ni bumper la
  // version, ni declencher le deni par defaut.
  const config = await accepted([scopeWith([])], { v: 3 });
  assertEquals(config.v, 3);
});

Deno.test("AC-54.7: une version sous-declaree face a de vrais queryFilters est refusee", async () => {
  for (const v of [3, 4]) {
    assertEquals(
      await rejected([QUERY_SCOPE], { v } as Partial<BlobConfig>),
      true,
      `un blob v${v} portant des queryFilters devrait etre refuse`,
    );
  }
});

Deno.test("AC-54.8: la regle de version s'exprime en plancher, pas en egalite", async () => {
  const structuredAuth = {
    type: "headers" as const,
    headers: [{ name: "X-A", value: "1" }, { name: "X-B", value: "2" }],
  };
  // Les quatre combinaisons d'axes se dechiffrent, chacune a sa version plancher.
  assertEquals((await accepted(["GET:/v1/items"], { v: 2 })).v, 2);
  assertEquals(
    (await accepted(["GET:/v1/items"], { v: 4, auth: structuredAuth, token: undefined })).v,
    4,
  );
  assertEquals((await accepted([QUERY_SCOPE], { v: 5 })).v, 5);
  assertEquals(
    (await accepted([QUERY_SCOPE], { v: 5, auth: structuredAuth, token: undefined })).v,
    5,
  );
});

Deno.test("AC-54.9: un ScopeEntry portant a la fois bodyFilters et queryFilters", async () => {
  const both = {
    methods: ["POST"],
    pattern: "/deploy",
    bodyFilters: [{ objectPath: "ref", objectValue: [{ type: "any", value: "main" }] }],
    queryFilters: [{ param: "env", values: [{ type: "any", value: "prod" }] }],
  } as unknown as Scope;
  const config = await accepted([both]);
  assertEquals(config.v, 5);
  const entry = config.scopes[0] as { bodyFilters: unknown[]; queryFilters: QueryFilter[] };
  assertEquals(entry.bodyFilters.length, 1);
  assertEquals(entry.queryFilters.length, 1);
});
