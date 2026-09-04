import { assertEquals } from "@std/assert";
import { checkRegexSource, compileAnchored } from "../../../src/crypto/regex-policy.ts";

Deno.test("AC-48.1: le corpus catastrophique connu est refuse", () => {
  const catastrophiques = [
    "^(a+)+$",
    "^(a|a)*$",
    "^(a*)*$",
    "^(?:a+)+$",
    "(x+x+)+y",
    "^(a+){10}$",
    "^([a-zA-Z]+)*$",
    "(a|aa)+",
    "^(.*)*$",
  ];
  for (const src of catastrophiques) {
    const issue = checkRegexSource(src);
    assertEquals(issue !== null, true, `devrait etre refuse : ${src}`);
  }
});

Deno.test("AC-48.2: le corpus legitime passe", () => {
  const legitimes = [
    "^v\\d+\\.\\d+\\.\\d+$",
    "^refs/heads/[a-z0-9._/-]+$",
    "^(main|develop)$",
    "^release/.*",
    "v\\d+",
    ".*-prod$",
    "^[a-f0-9]{40}$",
    "^feature-[a-z]+$",
  ];
  for (const src of legitimes) {
    assertEquals(checkRegexSource(src), null, `devrait passer : ${src}`);
  }
});

Deno.test("AC-48.3: PIEGE, parentheses echappees, ce n'est pas un groupe", () => {
  // \( et \) sont des caracteres litteraux : le + porte sur une parenthese, pas un groupe.
  assertEquals(checkRegexSource("\\(a+\\)+"), null);
  assertEquals(checkRegexSource("\\(abc\\)*"), null);
  // le vrai groupe reste refuse
  assertEquals(checkRegexSource("(a+)+"), "group-quantifier");
});

Deno.test("AC-48.4: PIEGE, parentheses en classe de caracteres", () => {
  assertEquals(checkRegexSource("[(]a+"), null);
  assertEquals(checkRegexSource("[()]+"), null);
  assertEquals(checkRegexSource("[)]+"), null);
  // une classe ne masque pas un groupe reel qui la suit
  assertEquals(checkRegexSource("[abc](x)+"), "group-quantifier");
});

Deno.test("AC-48.5: PIEGE, accolade litterale non quantificateur", () => {
  assertEquals(checkRegexSource("^\\{ok\\}$"), null);
  assertEquals(checkRegexSource("a{b}c"), null);
  assertEquals(checkRegexSource("a{,5}"), null);
  // un vrai quantificateur borne reste analyse
  assertEquals(checkRegexSource("a{2,200}"), "repeat-bound-too-high");
  assertEquals(checkRegexSource("a{2,50}"), null);
});

Deno.test("AC-48.6: backreferences et lookarounds refuses", () => {
  assertEquals(checkRegexSource("(a)\\1"), "backreference");
  assertEquals(checkRegexSource("^(?=a)b$"), "lookaround");
  assertEquals(checkRegexSource("^(?!a)b$"), "lookaround");
  assertEquals(checkRegexSource("^(?<=a)b$"), "lookaround");
  assertEquals(checkRegexSource("^(?<!a)b$"), "lookaround");
  // un groupe non capturant simple reste autorise
  assertEquals(checkRegexSource("^(?:main|dev)$"), null);
});

Deno.test("AC-48.7: le nombre de quantificateurs est plafonne a 3", () => {
  assertEquals(checkRegexSource("^a*b*c*$"), null);
  assertEquals(checkRegexSource("^a*b*c*d*$"), "too-many-quantifiers");
  assertEquals(checkRegexSource("^a*a*a*b$"), null);
  // le marqueur paresseux ne compte pas comme un quantificateur de plus
  assertEquals(checkRegexSource("^a*?b*?c*?$"), null);
});

Deno.test("AC-48.8: source trop longue et regex invalide", () => {
  assertEquals(checkRegexSource("a".repeat(201)), "too-long");
  assertEquals(checkRegexSource("("), "invalid");
  assertEquals(checkRegexSource("a\\"), "invalid");
});

Deno.test("AC-48.9: l'evaluation est ancree, plus de match en sous-chaine", () => {
  // c'etait un contournement de scope : « main » autorisait « not-main-at-all »
  assertEquals(compileAnchored("main").test("not-main-at-all"), false);
  assertEquals(compileAnchored("main").test("main"), true);
  // l'alternation reste correcte grace au groupe non capturant de l'enveloppe
  assertEquals(compileAnchored("main|dev").test("dev"), true);
  assertEquals(compileAnchored("main|dev").test("xdevx"), false);
  // une source deja ancree n'est pas cassee par l'enveloppement
  assertEquals(compileAnchored("^v\\d+$").test("v12"), true);
  assertEquals(compileAnchored("^v\\d+$").test("xv12"), false);
});

Deno.test("AC-48.10: budget de temps, un motif du corpus catastrophique refuse ne s'evalue jamais", () => {
  // Si l'analyse laissait passer ^(a+)+$ , l'evaluation sur 128 caracteres exploserait.
  const start = performance.now();
  for (const src of ["^(a+)+$", "^(a*)*$", "(x+x+)+y"]) {
    assertEquals(checkRegexSource(src) !== null, true);
  }
  assertEquals(performance.now() - start < 50, true);
});
