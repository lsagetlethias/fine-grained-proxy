import { assertEquals } from "@std/assert";

import {
  checkAccess,
  checkRequestAccess,
  matchBodyFilter,
  MAX_REGEX_INPUT,
  type ObjectValue,
  type Scope,
} from "../../../src/middleware/scopes.ts";

// Motif de la review adverse : « la valeur contient force, quelque part ». Il tient dans le
// dialecte (deux quantificateurs, bornes a 100) et il matche reellement la valeur longue :
// ce n'est donc pas le motif qui cesse de mordre, c'est le plafond de la valeur testee.
const EXCLUDE_FORCE = "[\\s\\S]{0,100}force[\\s\\S]{0,100}";

// Le « ; » n'est pas un separateur pour URLSearchParams (§19.10) : la valeur reste entiere,
// c'est bien elle qui est testee, et le refus porte sur la valeur, pas sur un second parametre.
const SHORT_VALUE = "a=1;force=true";
const LONG_VALUE = "x".repeat(90) + "force" + "y".repeat(100);

function notRegex(): ObjectValue {
  return { type: "not", value: { type: "regex", value: EXCLUDE_FORCE } };
}

function queryScope(values: ObjectValue[], required = false): Scope {
  return {
    methods: ["GET"],
    pattern: "/v1/items",
    queryFilters: [{ param: "opts", values, required }],
  };
}

Deno.test("la valeur longue reste bien couverte par le motif, seul son test est plafonne", () => {
  assertEquals(SHORT_VALUE.length <= MAX_REGEX_INPUT, true);
  assertEquals(LONG_VALUE.length > MAX_REGEX_INPUT, true);
  assertEquals(new RegExp(`^(?:${EXCLUDE_FORCE})$`).test(LONG_VALUE), true);
});

Deno.test("not(regex) sur un corps : une valeur trop longue ne s'inverse pas en acces", () => {
  const filter = { objectPath: "opts", objectValue: [notRegex()] };
  assertEquals(matchBodyFilter(filter, { opts: SHORT_VALUE }), false);
  // Sans la remontee de l'indecidable, ce meme filtre renvoyait true : « trop long pour
  // etre teste » devenait « ne matche pas », que le not transformait en « autorise ».
  assertEquals(matchBodyFilter(filter, { opts: LONG_VALUE }), false);
});

Deno.test("not(regex) sur la query : la valeur allongee est refusee comme la courte", () => {
  const scopes = [queryScope([notRegex()])];
  const short = checkRequestAccess(scopes, "GET", `/v1/items?opts=${SHORT_VALUE}`);
  assertEquals(short.allowed, false);
  assertEquals(short.denial?.query?.reason, "value");

  const long = checkRequestAccess(scopes, "GET", `/v1/items?opts=${LONG_VALUE}`);
  assertEquals(long.allowed, false, "une exclusion ne cesse pas d'exclure sur 195 caracteres");
  assertEquals(long.denial?.query?.reason, "value");
});

Deno.test("and(not(regex), wildcard) : l'indecidable ne se dilue pas dans une conjonction", () => {
  const scopes = [queryScope([{
    type: "and",
    value: [notRegex(), { type: "wildcard" }],
  }])];
  assertEquals(checkRequestAccess(scopes, "GET", `/v1/items?opts=${LONG_VALUE}`).allowed, false);
});

Deno.test("une conjonction tranchee par une condition fausse reste decidable", () => {
  // Un « and » dont une branche est definitivement fausse vaut faux dans les deux mondes :
  // fermer sur l'indecidable ne doit pas transformer ce refus en autre chose.
  const filter = {
    objectPath: "opts",
    objectValue: [{
      type: "and" as const,
      value: [
        { type: "regex" as const, value: EXCLUDE_FORCE },
        { type: "any" as const, value: "jamais-egal" },
      ],
    }],
  };
  assertEquals(matchBodyFilter(filter, { opts: LONG_VALUE }), false);
});

Deno.test("regex sur une valeur non-string reste une decision, pas une abstention", () => {
  // Une valeur non textuelle ne matche aucun motif de chaine : son exclusion doit donc
  // continuer d'accorder l'acces, sans quoi la fermeture sur l'indecidable ferait du zele.
  const filter = { objectPath: "count", objectValue: [notRegex()] };
  assertEquals(matchBodyFilter(filter, { count: 42 }), true);
});

Deno.test("checkAccess ignore l'axe query, y compris un filtre required", () => {
  // Cet helper est documente comme purement methode, chemin et corps, et une soixantaine de
  // tests l'appellent ainsi. Evalue avec une query vide, un filtre required echouait en
  // « required_missing » sur une requete dont personne n'avait demande la query.
  const scopes = [queryScope([{ type: "any", value: "1" }], true)];
  assertEquals(checkAccess(scopes, "GET", "/v1/items"), true);
  assertEquals(checkAccess(scopes, "GET", "/v1/other"), false);
  assertEquals(checkAccess(scopes, "POST", "/v1/items"), false);

  // La vraie porte, elle, continue de l'exiger.
  assertEquals(checkRequestAccess(scopes, "GET", "/v1/items").allowed, false);
  assertEquals(checkRequestAccess(scopes, "GET", "/v1/items?opts=1").allowed, true);
});
