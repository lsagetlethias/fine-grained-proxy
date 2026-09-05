import { assertEquals } from "@std/assert";

import {
  extractQueryParamNames,
  MAX_QUERY_PARAM_NAME_LENGTH,
  MAX_QUERY_PARAM_NAMES,
} from "../../src/logs/capture.ts";

const SECRET = "sk-live-51H9xQ2eZvKYlo8";

function names(search: string): string[] {
  return extractQueryParamNames(search)?.names ?? [];
}

// L'entry network vit en clair dans le ring buffer, contrairement au body detailed qui est
// chiffre (§14.6, §19.8). Une valeur qui y entre est une fuite, quel que soit le chemin par
// lequel elle y entre.
Deno.test("aucune valeur n'entre dans les noms quand l'appelant encode le separateur", () => {
  // URLSearchParams decoupe sur le premier « = » LITTERAL puis decode : sans « = » a
  // decouper, la paire entiere ressortait comme un seul nom, secret compris.
  assertEquals(names(`?api_key%3D${SECRET}`), ["api_key"]);
  assertEquals(names(`?a=1&api%5Fkey%3D${SECRET}`), ["a", "api_key"]);
  // Meme chose en minuscules, le decodage percent est insensible a la casse.
  assertEquals(names(`?token%3d${SECRET}`), ["token"]);
});

Deno.test("un nom entierement mange par la coupe n'entre pas non plus", () => {
  assertEquals(extractQueryParamNames(`?%3D${SECRET}`), null);
  assertEquals(names(`?a=1&%3D${SECRET}`), ["a"]);
});

Deno.test("la coupe d'une valeur est signalee comme une troncature", () => {
  const extracted = extractQueryParamNames(`?api_key%3D${SECRET}`);
  assertEquals(extracted?.truncated, true);
});

Deno.test("une valeur ordinaire n'a jamais eu besoin d'etre coupee", () => {
  const extracted = extractQueryParamNames(`?api_key=${SECRET}`);
  assertEquals(extracted?.names, ["api_key"]);
  assertEquals(extracted?.truncated, false);
});

Deno.test("un « = » dans la valeur ne deplace pas la coupe du nom", () => {
  // Le decoupage sur le PREMIER « = » litteral appartient a URLSearchParams : la valeur
  // « x=y » reste une valeur, elle n'a jamais approche la liste des noms.
  const extracted = extractQueryParamNames("?a=x=y");
  assertEquals(extracted?.names, ["a"]);
  assertEquals(extracted?.truncated, false);
});

Deno.test("§19.10 : un parametre sans « = » reste un nom, comme le meme avec un « = » vide", () => {
  // La spec fige l'equivalence entre « ?flag » et « ?flag= » : les traiter differemment
  // ici ferait disparaitre du diagnostic la forme la plus courante des drapeaux (?force).
  assertEquals(names("?flag"), ["flag"]);
  assertEquals(names("?flag="), ["flag"]);
});

Deno.test("AC-57.4: le nombre de noms retenus est plafonne et la troncature est signalee", () => {
  const search = "?" +
    Array.from({ length: MAX_QUERY_PARAM_NAMES + 20 }, (_, i) => `p${i}=v`).join("&");
  const extracted = extractQueryParamNames(search);
  // Le ring buffer est dimensionne par FGP_LOGS_BUFFER_NETWORK : sans plafond, une requete
  // unique en consomme la totalite et evince tout l'historique de diagnostic.
  assertEquals(extracted?.names.length, MAX_QUERY_PARAM_NAMES);
  assertEquals(extracted?.truncated, true);
  assertEquals(extracted?.names[0], "p0");
});

Deno.test("AC-57.4 bis: le plafond n'interrompt pas le comptage d'un nom deja retenu", () => {
  // Sortir de la boucle sur le plafond sous-compterait « ids » : ses occurrences tardives
  // sont precisement ce qui explique un refus par plafond d'occurrences (AC-52.2).
  const filler = Array.from({ length: MAX_QUERY_PARAM_NAMES + 5 }, (_, i) => `p${i}=v`);
  const search = "?ids=a&" + filler.join("&") + "&ids=b&ids=c";
  const extracted = extractQueryParamNames(search);
  assertEquals(extracted?.names.length, MAX_QUERY_PARAM_NAMES);
  assertEquals(extracted?.repeats, [["ids", 3]]);
  assertEquals(extracted?.truncated, true);
});

Deno.test("le plafond de longueur s'applique apres la coupe, jamais avant", () => {
  const long = "n".repeat(MAX_QUERY_PARAM_NAME_LENGTH + 20);
  const extracted = extractQueryParamNames(`?${long}%3D${SECRET}`);
  assertEquals(extracted?.names, ["n".repeat(MAX_QUERY_PARAM_NAME_LENGTH)]);
  assertEquals(extracted?.truncated, true);
});

Deno.test("deux valeurs encodees sur le meme parametre comptent comme deux occurrences", () => {
  const extracted = extractQueryParamNames("?ids%3Da&ids%3Db");
  assertEquals(extracted?.names, ["ids"]);
  assertEquals(extracted?.repeats, [["ids", 2]]);
});

Deno.test("recensement : aucune valeur de parametre ne survit dans la sortie", () => {
  const search = `?api_key%3D${SECRET}&token%3D${SECRET}&plain=${SECRET}&opts%3Da%3D${SECRET}`;
  const extracted = extractQueryParamNames(search);
  const serialized = JSON.stringify(extracted);
  assertEquals(serialized.includes(SECRET), false, serialized);
  assertEquals(extracted?.names, ["api_key", "token", "plain", "opts"]);
});

// Limite residuelle, ecrite plutot que decouverte : ce qui precede le premier « = » EST le
// nom du parametre, par definition de la query string et par la table de §19.10 qui fige
// l'equivalence entre « ?flag » et « ?flag= ». Un appelant qui ecrit son secret en position
// de nom le voit donc journalise comme un nom. Le refuser reviendrait a effacer « ?force »
// du diagnostic, c'est-a-dire la forme meme que la feature existe pour expliquer.
Deno.test("limite : un secret ecrit en position de nom reste un nom", () => {
  assertEquals(names(`?${SECRET}`), [SECRET]);
  assertEquals(names(`?${SECRET}=`), [SECRET]);
});
