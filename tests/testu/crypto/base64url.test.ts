import { test } from "node:test";

import { assertEquals } from "../../_assert.ts";
import { decodeBase64Url, encodeBase64Url } from "../../../src/crypto/base64url.ts";

// Le decodeur de Buffer n'echoue jamais : il ignore les caracteres hors alphabet et rend un
// buffer tronque. Le blob du proxy venant de l'appelant, le refus franc est la seule chose
// qui empeche une forgerie de poursuivre le dechiffrement avec des octets qui ne sont pas
// les siens. Les verdicts fixes ici sont ceux, mesures, du decodeur de reference : aucun ne
// se deduit de la specification base64url, pas meme l'acceptation d'un padding excedentaire.

const SAMPLES: number[][] = [
  [],
  [0],
  [255],
  [0, 0],
  [1, 2, 3],
  [251, 239, 190],
  [72, 101, 108, 108, 111, 32, 70, 71, 80],
  Array.from({ length: 64 }, (_, i) => (i * 7) % 256),
];

function refuses(value: string): boolean {
  try {
    decodeBase64Url(value);
    return false;
  } catch {
    return true;
  }
}

test("encodeBase64Url puis decodeBase64Url rendent les octets d'origine", () => {
  for (const sample of SAMPLES) {
    assertEquals(Array.from(decodeBase64Url(encodeBase64Url(new Uint8Array(sample)))), sample);
  }
});

test("encodeBase64Url n'emet ni padding ni caractere hors alphabet base64url", () => {
  for (const sample of SAMPLES) {
    const encoded = encodeBase64Url(new Uint8Array(sample));
    assertEquals(/^[0-9A-Za-z_-]*$/.test(encoded), true, encoded);
  }
});

test("decodeBase64Url accepte la forme sans padding et la forme paddee", () => {
  assertEquals(Array.from(decodeBase64Url("")), []);
  assertEquals(Array.from(decodeBase64Url("Zg")), [102]);
  assertEquals(Array.from(decodeBase64Url("Zg==")), [102]);
  assertEquals(Array.from(decodeBase64Url("Zm8")), [102, 111]);
  assertEquals(Array.from(decodeBase64Url("Zm8=")), [102, 111]);
  assertEquals(Array.from(decodeBase64Url("Zm9v")), [102, 111, 111]);
  assertEquals(Array.from(decodeBase64Url("-_-_")), [251, 255, 191]);
});

// Padding de trop sur une longueur par ailleurs valide : accepte, et decode comme la forme
// nue. Un blob n'en porte jamais, FGP n'en emet pas, mais le refuser durcirait le contrat
// au-dela de la reference et ferait echouer un appelant que le proxy servait hier.
test("decodeBase64Url accepte un padding excedentaire sur une longueur valide", () => {
  assertEquals(Array.from(decodeBase64Url("=")), []);
  assertEquals(Array.from(decodeBase64Url("==")), []);
  assertEquals(Array.from(decodeBase64Url("AAAA=")), [0, 0, 0]);
  assertEquals(Array.from(decodeBase64Url("AAAA==")), [0, 0, 0]);
  assertEquals(Array.from(decodeBase64Url("Zm9vYmFy=")), [102, 111, 111, 98, 97, 114]);
});

test("decodeBase64Url refuse un caractere hors alphabet base64url", () => {
  for (const invalid of ["A+A=", "A/AA", "AA A", "AA\n", "AAAA%3D", "AAAAé", "=A"]) {
    assertEquals(refuses(invalid), true, invalid);
  }
});

test("decodeBase64Url refuse une longueur ou un padding impossible", () => {
  for (const invalid of ["A", "AAAAA", "A=", "A==", "A===", "AA===", "aaaa=aaaa"]) {
    assertEquals(refuses(invalid), true, invalid);
  }
});
