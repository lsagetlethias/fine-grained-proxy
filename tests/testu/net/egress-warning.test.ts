import { assertEquals, assertStringIncludes } from "@std/assert";

// L'avertissement est a un coup par instance de module : une fois pose, le drapeau interne
// ne se remet pas a zero. Deux cles de module distinctes donnent donc deux instances
// neuves, une pour le cas actif et une pour le temoin, sans quoi l'ordre des fichiers de
// test du processus deciderait du resultat.
import { classifyLiteralHost as classifyActif } from "../../../src/net/egress.ts?warn-actif";
import { classifyLiteralHost as classifyTemoin } from "../../../src/net/egress.ts?warn-temoin";

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

Deno.test("AC-43.21 (registre v5): FGP_EGRESS_ALLOW_PRIVATE actif est signale bruyamment", () => {
  Deno.env.set("FGP_EGRESS_ALLOW_PRIVATE", "1");
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
    Deno.env.delete("FGP_EGRESS_ALLOW_PRIVATE");
  }
});

Deno.test("AC-43.21 (registre v5) bis: sans la variable, aucune ligne n'est ecrite", () => {
  Deno.env.delete("FGP_EGRESS_ALLOW_PRIVATE");
  const messages = captureWarnings(() => {
    // Une destination refusee, pour que le silence ne vienne pas d'un chemin non emprunte.
    assertEquals(classifyTemoin("10.0.0.1")?.code, "target_forbidden");
  });
  assertEquals(messages, []);
});
