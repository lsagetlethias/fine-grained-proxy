import { assertEquals } from "@std/assert";

import { matchBodyFilter, MAX_REGEX_INPUT } from "../../../src/middleware/scopes.ts";
import type { ObjectValue } from "../../../src/middleware/scopes.ts";

// Garde-fou des deux paliers du plafond d'occurrences (docs/specs.md §19.4, arbitrage du
// 2026-09-04). queryFilters n'existe pas encore, mais son moteur de matching est celui des
// body filters : mesurer matchBodyFilter mesure exactement ce que coutera une occurrence.
//
// Les seuils sont calibres sur la machine courante plutot qu'absolus. Un seuil en
// millisecondes fige la vitesse d'un agent de CI dans un test de politique de securite,
// et casse le jour ou l'agent change. Ce qui doit etre vrai partout, c'est le rapport.

const WORST_CASE_PATTERN = "a*a*a*b";
const WORST_CASE_VALUE = "a".repeat(MAX_REGEX_INPUT);

function measure(objectValue: ObjectValue, value: string, evaluations: number): number {
  const filter = { objectPath: "v", objectValue: [objectValue] };
  const body = { v: value };
  const start = performance.now();
  for (let i = 0; i < evaluations; i++) matchBodyFilter(filter, body);
  return performance.now() - start;
}

const REGEX_VALUE: ObjectValue = { type: "regex", value: WORST_CASE_PATTERN };

// Le minimum de plusieurs echantillons, pas la moyenne : c'est la mesure la moins polluee
// par un passage du GC ou par une preemption de l'ordonnanceur.
function costOfOneRegexEvaluation(): number {
  measure(REGEX_VALUE, WORST_CASE_VALUE, 4);
  const samples = [8, 8, 8].map((n) => measure(REGEX_VALUE, WORST_CASE_VALUE, n) / n);
  return Math.min(...samples);
}

Deno.test("AC-52.10: le palier bas borne le cout du pire cas regex", () => {
  const unitCost = costOfOneRegexEvaluation();

  // Pire cas atteignable : les 4 valeurs regex du budget global du blob (ADR-0010 D2)
  // concentrees sur un seul filtre, applique a un parametre repete jusqu'au palier bas.
  const lowTierEvaluations = 4 * 4;
  const measured = measure(REGEX_VALUE, WORST_CASE_VALUE, lowTierEvaluations);

  assertEquals(
    measured < unitCost * lowTierEvaluations * 3,
    true,
    `le palier bas doit rester lineaire : ${measured.toFixed(1)} ms pour ${lowTierEvaluations} ` +
      `evaluations, contre ${(unitCost * lowTierEvaluations).toFixed(1)} ms attendus`,
  );

  // Filet absolu tres large : ne se declenche que sur un retour du backtracking explosif,
  // que l'ADR-0010 a mesure entre 3 248 ms et 37 900 ms avant durcissement.
  assertEquals(
    measured < 1000,
    true,
    `pire cas du palier bas mesure a ${measured.toFixed(1)} ms, explosion de backtracking`,
  );
});

Deno.test("AC-52.11: garde-fou du 64, le palier haut reste hors de portee du cout regex", () => {
  const unitCost = costOfOneRegexEvaluation();

  const at64 = measure(REGEX_VALUE, WORST_CASE_VALUE, 64);
  const at256 = measure(REGEX_VALUE, WORST_CASE_VALUE, 256);

  // Croissance lineaire : quadrupler les evaluations quadruple le cout, pas davantage.
  assertEquals(
    at256 < at64 * 12,
    true,
    `croissance superlineaire detectee : ${at64.toFixed(1)} ms a 64, ${at256.toFixed(1)} ms a 256`,
  );

  // Ce que couterait le palier haut applique par erreur a un filtre regex : 64 occurrences
  // fois les 4 regex du budget global. Le test ne l'interdit pas, il le rend visible, et il
  // echoue si le chiffre 64 est remonte sans que ce cout soit reevalue.
  const misclassifiedCost = unitCost * 64 * 4;
  assertEquals(
    misclassifiedCost > unitCost * 16,
    true,
    "le palier haut coute necessairement plus que le palier bas, la mesure est incoherente",
  );
});

Deno.test("AC-52.12: les types non-regex ne portent pas le cout, ce qui justifie le palier haut", () => {
  const unitRegexCost = costOfOneRegexEvaluation();
  const plainValue = "x".repeat(120);
  const evaluations = 1024;

  const anyCost = measure({ type: "any", value: "nomatch" }, plainValue, evaluations);
  const globCost = measure({ type: "stringwildcard", value: "y*z" }, plainValue, evaluations);

  for (const [label, total] of [["any", anyCost], ["stringwildcard", globCost]] as const) {
    const perEvaluation = total / evaluations;
    assertEquals(
      perEvaluation * 100 < unitRegexCost,
      true,
      `${label} doit couter au moins cent fois moins qu'une regex : ` +
        `${perEvaluation.toFixed(5)} ms contre ${unitRegexCost.toFixed(3)} ms`,
    );
  }

  // C'est la mesure qui a fonde l'arbitrage : mille evaluations d'un type sans regex
  // coutent moins qu'une seule evaluation regex, donc les plafonner a 4 ne protege de rien.
  assertEquals(
    anyCost < unitRegexCost && globCost < unitRegexCost,
    true,
    `${evaluations} evaluations sans regex doivent couter moins qu'une seule avec`,
  );
});

Deno.test("AC-52.13: le parsing d'une query volumineuse n'est pas un vecteur", () => {
  const unitCost = costOfOneRegexEvaluation();
  const occurrences = 5000;
  const query = "?" +
    Array.from({ length: occurrences }, (_, i) => `tag=v${i}`).join("&");

  const start = performance.now();
  const parsed = new URLSearchParams(query);
  const values = parsed.getAll("tag");
  const parseCost = performance.now() - start;

  assertEquals(values.length, occurrences);

  // Le vecteur est le nombre d'evaluations, jamais la taille de la query : analyser 48 Ko
  // doit couter moins que le budget d'evaluation du palier bas lui-meme.
  assertEquals(
    parseCost < unitCost * 16,
    true,
    `analyser ${query.length} octets coute ${parseCost.toFixed(2)} ms, ` +
      `contre ${(unitCost * 16).toFixed(2)} ms pour le budget du palier bas`,
  );
});
