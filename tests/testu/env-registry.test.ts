import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

import { assertEquals } from "../_assert.ts";
import { ENV_NAMES } from "../../src/env.ts";

// Resolu depuis le module et non depuis le cwd : le fichier est lu pour lui-meme, pas pour
// le repertoire d'ou la commande de test est lancee.
const envExample = readFileSync(resolve(import.meta.dirname, "../../.env.example"), "utf8");

// FGP_GITHUB_REPO est documentee pour le build, pas pour le processus serveur : scripts/
// version.ts la lit hors du serveur, elle n'a donc rien a faire dans le registre. Exclusion
// nommee et non silencieuse, pour qu'une disparition du fichier fasse echouer le test.
const NON_SERVER_ENV_EXAMPLE = ["FGP_GITHUB_REPO"];

function sorted(names: readonly string[]): string[] {
  return [...new Set(names)].sort();
}

const EXPECTED = sorted(ENV_NAMES);

test("AC-58.9: .env.example documente exactement le registre", () => {
  const names: string[] = [];
  for (const line of envExample.split("\n")) {
    const match = line.match(/^#?\s*([A-Z][A-Z0-9_]*)=/);
    if (match) names.push(match[1]);
  }
  if (names.length === 0) throw new Error(".env.example: aucune variable extraite");

  assertEquals(sorted(names.filter((n) => !NON_SERVER_ENV_EXAMPLE.includes(n))), EXPECTED);
  assertEquals(
    NON_SERVER_ENV_EXAMPLE.filter((n) => names.includes(n)),
    NON_SERVER_ENV_EXAMPLE,
    "une variable exclue par nom a disparu de .env.example",
  );
});

test("AC-58.10: seul FGP_SALT est documente comme requis, le reste est commente", () => {
  const uncommented: string[] = [];
  for (const line of envExample.split("\n")) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=/);
    if (match) uncommented.push(match[1]);
  }
  // Une optionnelle non commentee est toujours posee sous --env-file : le developpement
  // cesse alors de ressembler a la production, ou elle est absente.
  assertEquals(uncommented, ["FGP_SALT"]);
});
