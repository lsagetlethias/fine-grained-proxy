import { assertEquals } from "@std/assert";

import { MAX_REGEX_VALUES_PER_BLOB } from "../../../src/crypto/blob.ts";
import {
  matchBodyFilter,
  MAX_REGEX_INPUT,
  QUERY_OCCURRENCE_CAP_DEFAULT,
  QUERY_OCCURRENCE_CAP_WITH_REGEX,
} from "../../../src/middleware/scopes.ts";
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

const SAMPLES = 5;

// Le minimum de plusieurs echantillons, jamais la moyenne ni une mesure unique. Une
// preemption de l'ordonnanceur ou un passage du GC ne peut qu'AJOUTER du temps : le
// minimum est donc le seul estimateur que la charge de la machine ne degrade pas. La
// premiere version de ce test ne l'appliquait qu'a la calibration, et rougissait quand la
// mesure comparee, elle, prenait une preemption. Un test de politique de securite qui
// rougit au hasard finit ignore, ce qui est pire que son absence.
function bestOf(objectValue: ObjectValue, value: string, evaluations: number): number {
  measure(objectValue, value, evaluations);
  let best = Infinity;
  for (let i = 0; i < SAMPLES; i++) {
    best = Math.min(best, measure(objectValue, value, evaluations));
  }
  return best;
}

function costOfOneRegexEvaluation(): number {
  return bestOf(REGEX_VALUE, WORST_CASE_VALUE, 8) / 8;
}

// Le minimum ne suffit pas des que le rapport porte sur deux echantillons de DUREES
// differentes, et c'est ce qui faisait rougir AC-52.11 par intermittence. Deux biais s'y
// ajoutent, tous les deux asymetriques :
//   1. l'exposition. Un echantillon quatre fois plus long a quatre fois plus d'occasions
//      d'attraper une preemption, donc une chance bien plus faible qu'un de ses tirages soit
//      propre. Le minimum nettoie le bruit ponctuel, pas un biais qui croit avec la duree.
//   2. l'ordre. Mesure faite sur cette machine : le cout unitaire du MEME travail passe de
//      3,88 ms a 4,57 ms entre la premiere mesure du processus et la suivante, soit 20 pour
//      cent, le thread restant CPU-bound. Le terme mesure en premier est donc structurellement
//      avantage, et c'est le denominateur du rapport.
// Le remede vaut pour les deux : un seul protocole, des segments de MEME taille, entrelaces
// dans la MEME boucle, minimum pris position par position. Les deux cotes du rapport subissent
// alors la meme exposition et la meme derive, et ce que le rapport mesure redevient le seul
// cout du code.
function segmentCosts(segment: number, count: number): number[] {
  const best = new Array<number>(count).fill(Infinity);
  // Un passage complet a blanc, pas un seul segment : la derive du point 2 se produit sur les
  // premieres secondes de travail continu, donc une chauffe plus courte que la mesure la laisse
  // tomber DANS la mesure, ou elle frappe les segments dans l'ordre et gonfle le rapport. Sur la
  // derive injectee qui fait echouer le protocole precedent, la chauffe courte laisse le rapport
  // a 7,7 et des segments echelonnes, le passage complet le ramene a 4,0 et les egalise.
  for (let warmup = 0; warmup < count; warmup++) {
    measure(REGEX_VALUE, WORST_CASE_VALUE, segment);
  }
  for (let sample = 0; sample < SAMPLES; sample++) {
    for (let index = 0; index < count; index++) {
      best[index] = Math.min(
        best[index],
        measure(REGEX_VALUE, WORST_CASE_VALUE, segment),
      );
    }
  }
  return best;
}

// Le pire cas du palier haut applique par erreur a un filtre regex, tel qu'il a ete chiffre :
// 64 occurrences fois les 4 valeurs regex du budget global du blob. L'ancre est ecrite en dur
// parce que la mesure, elle, suit les constantes : remonter le 64 sans rien d'autre ferait
// mesurer un pire cas plus lourd a ce test, qui continuerait de passer en silence.
const ARBITRATED_HIGH_TIER_EVALUATIONS = 256;

Deno.test("AC-52.10: le palier bas borne le cout du pire cas regex", () => {
  // Pire cas atteignable : les 4 valeurs regex du budget global du blob (ADR-0010 D2)
  // concentrees sur un seul filtre, applique a un parametre repete jusqu'au palier bas.
  const lowTierEvaluations = QUERY_OCCURRENCE_CAP_WITH_REGEX * MAX_REGEX_VALUES_PER_BLOB;

  // Meme protocole qu'AC-52.11, et pour la meme raison : ce test comparait un bloc de 8
  // evaluations mesure le premier du processus a un bloc de 16 mesure ensuite, et il rougissait
  // plus souvent encore que son voisin, l'ecart de fraicheur y etant maximal (releve sous charge
  // intermittente : 72,3 ms pour 16 evaluations contre 16,2 ms attendus, soit un cout unitaire
  // de reference sous-estime d'un facteur 4,5). Les deux cotes sortent desormais de la meme
  // boucle, en segments de meme taille.
  const halves = segmentCosts(lowTierEvaluations / 2, 2);
  const measured = halves[0] + halves[1];
  const unitCost = halves[0] / (lowTierEvaluations / 2);

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
  // Le test ne s'interdit pas de mesurer un pire cas plus lourd, il refuse de le faire sans
  // qu'on l'ait dit. La version precedente comparait deux constantes entre elles et etait vraie
  // quelle que soit la mesure, donc ne mordait sur rien.
  const worstCaseEvaluations = QUERY_OCCURRENCE_CAP_DEFAULT * MAX_REGEX_VALUES_PER_BLOB;
  assertEquals(
    worstCaseEvaluations,
    ARBITRATED_HIGH_TIER_EVALUATIONS,
    `le pire cas du palier haut vaut desormais ${worstCaseEvaluations} evaluations regex contre ` +
      `${ARBITRATED_HIGH_TIER_EVALUATIONS} chiffrees : reevalue ce cout (docs/specs.md §19.4) ` +
      `avant de deplacer l'ancre`,
  );

  // Croissance lineaire : quadrupler les evaluations quadruple le cout, pas davantage. Les
  // deux cotes sortent de la meme boucle, en segments d'une taille unique, pour que le rapport
  // ne mesure que le cout du code (voir segmentCosts).
  //
  // Ce que ce rapport attrape, et ce qu'il n'attrape pas, mesure a l'appui. Decouper en segments
  // fait mesurer la PENTE et non la courbure cumulee : sous une croissance quadratique injectee
  // assez forte pour porter le cout d'une evaluation de 40 a 51 ms entre le premier segment et
  // le dernier, le rapport ne monte qu'a 4,8, soit la valeur haute de sa propre dispersion sous
  // charge (3,3 a 4,8 releves). Aucun seuil ne separe donc ces deux regimes, et c'est le prix
  // assume du determinisme. La garde qui mord sur le cout, ici, est l'ancre ci-dessus, et sur
  // l'explosion de backtracking c'est le filet absolu d'AC-52.10. Le rapport reste un filet
  // large contre un effondrement massif, pas un detecteur de non-linearite fine.
  const costs = segmentCosts(QUERY_OCCURRENCE_CAP_DEFAULT, MAX_REGEX_VALUES_PER_BLOB);
  const atLowSegment = costs[0];
  const atWorstCase = costs.reduce((total, cost) => total + cost, 0);

  assertEquals(
    atWorstCase < atLowSegment * 12,
    true,
    `croissance superlineaire detectee : ${atLowSegment.toFixed(1)} ms pour ` +
      `${QUERY_OCCURRENCE_CAP_DEFAULT} evaluations, ${atWorstCase.toFixed(1)} ms pour les ` +
      `${worstCaseEvaluations} du pire cas, segments mesures a ` +
      `[${costs.map((cost) => cost.toFixed(1)).join(", ")}] ms`,
  );
});

Deno.test("AC-52.12: les types non-regex ne portent pas le cout, ce qui justifie le palier haut", () => {
  const unitRegexCost = costOfOneRegexEvaluation();
  const plainValue = "x".repeat(120);
  const evaluations = 1024;

  const anyCost = bestOf({ type: "any", value: "nomatch" }, plainValue, evaluations);
  const globCost = bestOf({ type: "stringwildcard", value: "y*z" }, plainValue, evaluations);

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

  let parseCost = Infinity;
  let seen = 0;
  for (let i = 0; i < SAMPLES; i++) {
    const start = performance.now();
    seen = new URLSearchParams(query).getAll("tag").length;
    parseCost = Math.min(parseCost, performance.now() - start);
  }

  assertEquals(seen, occurrences);

  // Le vecteur est le nombre d'evaluations, jamais la taille de la query : analyser 48 Ko
  // doit couter moins que le budget d'evaluation du palier bas lui-meme.
  assertEquals(
    parseCost < unitCost * 16,
    true,
    `analyser ${query.length} octets coute ${parseCost.toFixed(2)} ms, ` +
      `contre ${(unitCost * 16).toFixed(2)} ms pour le budget du palier bas`,
  );
});
