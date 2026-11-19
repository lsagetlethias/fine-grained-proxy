import { test } from "node:test";

import { assertEquals, assertStringIncludes } from "../../_assert.ts";

// L'avertissement est a un coup par instance de module : une fois pose, le drapeau interne
// ne se remet pas a zero. Deux cles de module distinctes donnent donc deux instances
// neuves, une pour le cas actif et une pour le temoin, sans quoi le premier des deux tests
// deciderait du resultat du second.
//
// Le specifier est calcule et non litteral : tsc ne resout pas un chemin relatif portant un
// suffixe de query, et il renonce a verifier un import() dont l'argument n'est pas litteral.
// Le type vient donc du module lui-meme, par typeof import, qui ne charge rien.
type EgressModule = typeof import("../../../src/net/egress.ts");
const EGRESS = "../../../src/net/egress.ts";

const { classifyLiteralHost: classifyActif } = (await import(
  `${EGRESS}?warn-actif`
)) as EgressModule;
const { classifyLiteralHost: classifyTemoin } = (await import(
  `${EGRESS}?warn-temoin`
)) as EgressModule;

function captureWarnings(fn: () => void): string[] {
  const messages: string[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => {
    messages.push(args.map(String).join(" "));
  };
  try {
    fn();
  } finally {
    console.warn = original;
  }
  return messages;
}

test("AC-43.21 (registre v5): FGP_EGRESS_ALLOW_PRIVATE actif est signale bruyamment", () => {
  process.env.FGP_EGRESS_ALLOW_PRIVATE = "1";
  try {
    const messages = captureWarnings(() => {
      classifyActif("10.0.0.1");
      classifyActif("192.168.0.1");
    });

    // Un seul avertissement pour deux controles : c'est un signal, pas un flot qui noierait
    // les journaux et finirait filtre.
    assertEquals(messages.length, 1, `avertissements emis : ${messages.length}`);
    assertStringIncludes(messages[0], "FGP_EGRESS_ALLOW_PRIVATE");
    // Le message doit dire ce qui tombe, pas seulement qu'une variable est posee : active
    // en production, l'instance redevient la SSRF non authentifiee que l'ADR-0009 corrige.
    assertStringIncludes(messages[0], "G1");
  } finally {
    delete process.env.FGP_EGRESS_ALLOW_PRIVATE;
  }
});

test("AC-43.21 (registre v5) bis: sans la variable, aucune ligne n'est ecrite", () => {
  delete process.env.FGP_EGRESS_ALLOW_PRIVATE;
  const messages = captureWarnings(() => {
    // Une destination refusee, pour que le silence ne vienne pas d'un chemin non emprunte.
    assertEquals(classifyTemoin("10.0.0.1")?.code, "target_forbidden");
  });
  assertEquals(messages, []);
});
