import { assertEquals } from "@std/assert";

import denoJson from "../../deno.json" with { type: "json" };
import dockerfile from "../../Dockerfile" with { type: "text" };
import envExample from "../../.env.example" with { type: "text" };
import procfile from "../../Procfile" with { type: "text" };
import { ENV_NAMES } from "../../src/env.ts";

// build:version ne lance pas le serveur mais scripts/version.ts, hors du processus serveur :
// sa seule variable, FGP_GITHUB_REPO, n'a rien a faire dans le registre. Exclusion nommee et
// non silencieuse, pour qu'une septieme liste qui apparaitrait un jour fasse echouer le test.
const NON_SERVER_TASKS = ["build:version"];

// Meme raison cote .env.example : la variable y est documentee pour le build, pas pour le
// processus serveur.
const NON_SERVER_ENV_EXAMPLE = ["FGP_GITHUB_REPO"];

function parseAllowEnv(source: string, label: string): string[] {
  const match = source.match(/--allow-env=([A-Za-z0-9_,]+)/);
  if (!match) throw new Error(`${label}: aucune liste --allow-env exploitable`);
  const names = match[1].split(",").filter((n) => n.length > 0);
  if (names.length === 0) throw new Error(`${label}: liste --allow-env vide`);
  return names;
}

function sorted(names: readonly string[]): string[] {
  return [...new Set(names)].sort();
}

const EXPECTED = sorted(ENV_NAMES);

function tasksCarryingAllowEnv(): [string, string][] {
  return Object.entries(denoJson.tasks).filter(([, cmd]) => cmd.includes("--allow-env"));
}

Deno.test("AC-58.6: les six listes --allow-env du serveur couvrent exactement le registre", () => {
  const carrying = tasksCarryingAllowEnv();
  const serverTasks = carrying.filter(([name]) => !NON_SERVER_TASKS.includes(name));

  assertEquals(
    carrying.length - serverTasks.length,
    NON_SERVER_TASKS.length,
    "une tache exclue par nom a disparu de deno.json",
  );
  assertEquals(
    serverTasks.map(([name]) => name).sort(),
    ["dev:server", "start", "test", "test:e2e", "test:integration", "test:unit"],
    "la liste des taches serveur portant --allow-env a change",
  );

  for (const [name, cmd] of serverTasks) {
    assertEquals(sorted(parseAllowEnv(cmd, `deno.json/${name}`)), EXPECTED, `deno.json/${name}`);
  }
});

Deno.test("AC-58.7: l'allow-list du Procfile couvre exactement le registre", () => {
  assertEquals(sorted(parseAllowEnv(procfile, "Procfile")), EXPECTED);
});

Deno.test("AC-58.8: l'allow-list du Dockerfile couvre exactement le registre", () => {
  assertEquals(sorted(parseAllowEnv(dockerfile, "Dockerfile")), EXPECTED);
});

Deno.test("AC-58.9: .env.example documente exactement le registre", () => {
  const names: string[] = [];
  for (const line of envExample.split("\n")) {
    const match = line.match(/^#?\s*([A-Z][A-Z0-9_]*)=/);
    if (match) names.push(match[1]);
  }
  if (names.length === 0) throw new Error(".env.example: aucune variable extraite");

  assertEquals(
    sorted(names.filter((n) => !NON_SERVER_ENV_EXAMPLE.includes(n))),
    EXPECTED,
  );
  assertEquals(
    NON_SERVER_ENV_EXAMPLE.filter((n) => names.includes(n)),
    NON_SERVER_ENV_EXAMPLE,
    "une variable exclue par nom a disparu de .env.example",
  );
});

Deno.test("AC-58.10: seul FGP_SALT est documente comme requis, le reste est commente", () => {
  const uncommented: string[] = [];
  for (const line of envExample.split("\n")) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=/);
    if (match) uncommented.push(match[1]);
  }
  // Une optionnelle non commentee est toujours posee sous --env-file : le developpement
  // cesse alors de ressembler a la production, ou elle est absente.
  assertEquals(uncommented, ["FGP_SALT"]);
});
