import { assertEquals, assertNotEquals } from "@std/assert";

import {
  checkClientKey,
  CLIENT_KEY_MAX_LENGTH,
  CLIENT_KEY_MIN_LENGTH,
  validateClientKey,
} from "../../../src/crypto/client-key.ts";

const VALID = "cle-de-ci-tres-longue-ok";

Deno.test("AC-38.4: bornes exactes de la longueur minimale", () => {
  assertEquals(CLIENT_KEY_MIN_LENGTH, 24);
  assertEquals(checkClientKey("a".repeat(23)), "too-short");
  assertEquals(checkClientKey("a".repeat(24)), null);
  assertEquals(VALID.length, 24);
  assertEquals(checkClientKey(VALID), null);
});

Deno.test("AC-38.5: bornes exactes de la longueur maximale", () => {
  assertEquals(CLIENT_KEY_MAX_LENGTH, 256);
  assertEquals(checkClientKey("a".repeat(256)), null);
  assertEquals(checkClientKey("a".repeat(257)), "too-long");
});

Deno.test("AC-38.6: un espace interne est refuse", () => {
  assertEquals(checkClientKey("cle-de-ci avec-un-espace-42"), "invalid-charset");
});

Deno.test("AC-38.7: un caractere non ASCII est refuse", () => {
  assertEquals(checkClientKey("cle-de-ci-avec-accent-éééé"), "invalid-charset");
  assertEquals(checkClientKey("cle-de-ci-avec-emoji-aaaa\u{1F511}"), "invalid-charset");
});

Deno.test("AC-38.8: un caractere de controle est refuse", () => {
  assertEquals(checkClientKey("cle-de-ci-avec-tab-aaaa\t"), "invalid-charset");
  assertEquals(checkClientKey("cle-de-ci-avec-lf-aaaaa\n"), "invalid-charset");
  assertEquals(checkClientKey("cle-de-ci-avec-nul-aaaa\0"), "invalid-charset");
});

Deno.test("AC-38.16: empty et too-short sont deux cas distincts, avec deux messages distincts", () => {
  assertEquals(checkClientKey(""), "empty");
  assertEquals(checkClientKey("trop-court"), "too-short");

  const emptyMessage = validateClientKey("");
  const shortMessage = validateClientKey("trop-court");

  assertNotEquals(emptyMessage, shortMessage);
  // Le message de la chaine vide doit dire quoi faire, pas seulement que c'est refuse :
  // une variable CI non definie vaut "", et rallonger une cle qu'on n'a pas saisie n'a pas de sens.
  assertEquals(emptyMessage?.includes("Omit the field"), true);
  assertEquals(shortMessage?.includes("24"), true);
});

Deno.test("AC-38.19: les bornes acceptent tout le charset ASCII imprimable", () => {
  // 0x21 a 0x7E, soit tout sauf l'espace et les caracteres de controle.
  const full = Array.from({ length: 0x7e - 0x21 + 1 }, (_, i) => String.fromCharCode(0x21 + i))
    .join("");
  assertEquals(full.length, 94);
  assertEquals(checkClientKey(full), null);
  // L'espace, juste sous la borne basse, est le seul caractere imprimable exclu.
  assertEquals(checkClientKey(" ".repeat(30)), "invalid-charset");
});
