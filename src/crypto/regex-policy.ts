// Dialecte regex du blob (ADR-0010 D3). Analyse statique ecrite a la main : c'est le
// point faible assume de la politique. Elle n'est jamais seule, les couches 1 (valeur
// testee plafonnee a 128 caracteres) et 3 (4 regex par blob) tiennent si elle se trompe.
//
// Ce module est bundle cote navigateur via middleware/scopes.ts : aucune API Deno ici.

export const MAX_REGEX_SOURCE = 200;
export const MAX_QUANTIFIERS = 3;
export const MAX_REPEAT_BOUND = 100;

export type RegexIssue =
  | "too-long"
  | "group-quantifier"
  | "backreference"
  | "lookaround"
  | "repeat-bound-too-high"
  | "too-many-quantifiers"
  | "invalid";

const QUANT_CHARS = new Set(["*", "+", "?"]);

interface RepeatBound {
  end: number;
  max: number;
}

// Reconnait { n }, { n, } et { n, m } a partir d'une accolade ouvrante. Retourne null
// quand ce n'est pas un quantificateur, auquel cas l'accolade est un caractere litteral.
function parseRepeat(source: string, start: number): RepeatBound | null {
  let i = start + 1;
  let digits = "";
  while (i < source.length && source[i] >= "0" && source[i] <= "9") digits += source[i++];
  if (digits.length === 0) return null;

  if (source[i] === "}") return { end: i, max: Number(digits) };
  if (source[i] !== ",") return null;
  i++;

  let upper = "";
  while (i < source.length && source[i] >= "0" && source[i] <= "9") upper += source[i++];
  if (source[i] !== "}") return null;
  return { end: i, max: upper.length === 0 ? Infinity : Number(upper) };
}

export function checkRegexSource(source: string): RegexIssue | null {
  if (source.length > MAX_REGEX_SOURCE) return "too-long";

  let inClass = false;
  let quantifiers = 0;
  // Vrai uniquement quand le token qui precede immediatement est une fermeture de groupe :
  // c'est ce qui distingue (a+)+ , interdit, de \(a+\)+ ou [(]a+ , autorises.
  let afterGroupClose = false;

  for (let i = 0; i < source.length;) {
    const c = source[i];

    if (c === "\\") {
      const next = source[i + 1];
      if (next === undefined) return "invalid";
      if (next >= "1" && next <= "9") return "backreference";
      i += 2;
      afterGroupClose = false;
      continue;
    }

    if (inClass) {
      if (c === "]") inClass = false;
      i++;
      afterGroupClose = false;
      continue;
    }

    if (c === "[") {
      inClass = true;
      i++;
      afterGroupClose = false;
      continue;
    }

    if (c === "(") {
      if (
        source.startsWith("(?=", i) || source.startsWith("(?!", i) ||
        source.startsWith("(?<=", i) || source.startsWith("(?<!", i)
      ) {
        return "lookaround";
      }
      i++;
      afterGroupClose = false;
      continue;
    }

    if (c === ")") {
      i++;
      afterGroupClose = true;
      continue;
    }

    if (QUANT_CHARS.has(c)) {
      // Un « ? » qui suit immediatement un quantificateur est un marqueur paresseux,
      // pas un quantificateur de plus.
      const prev = source[i - 1];
      const lazy = c === "?" && (prev === "*" || prev === "+" || prev === "}" || prev === "?");
      if (!lazy) {
        if (afterGroupClose) return "group-quantifier";
        quantifiers++;
      }
      i++;
      afterGroupClose = false;
      continue;
    }

    if (c === "{") {
      const repeat = parseRepeat(source, i);
      if (repeat) {
        if (afterGroupClose) return "group-quantifier";
        if (repeat.max > MAX_REPEAT_BOUND) return "repeat-bound-too-high";
        quantifiers++;
        i = repeat.end + 1;
        afterGroupClose = false;
        continue;
      }
      i++;
      afterGroupClose = false;
      continue;
    }

    i++;
    afterGroupClose = false;
  }

  if (quantifiers > MAX_QUANTIFIERS) return "too-many-quantifiers";

  try {
    new RegExp(source);
  } catch {
    return "invalid";
  }
  return null;
}

export function regexIssueMessage(issue: RegexIssue): string {
  switch (issue) {
    case "too-long":
      return `Regex source exceeds ${MAX_REGEX_SOURCE} characters`;
    case "group-quantifier":
      return "Regex must not apply a quantifier to a group: (...)+ and (?:...)* are refused";
    case "backreference":
      return "Regex must not use a backreference";
    case "lookaround":
      return "Regex must not use a lookaround";
    case "repeat-bound-too-high":
      return `Regex repetition bound must be at most ${MAX_REPEAT_BOUND}`;
    case "too-many-quantifiers":
      return `Regex must not use more than ${MAX_QUANTIFIERS} quantifiers`;
    case "invalid":
      return "Regex is not a valid expression";
  }
}

// L'ancrage n'est pas une mesure de performance, c'est une correction de faille :
// RegExp.test fait du sous-chaine, donc {"type":"regex","value":"main"} autorisait
// « not-main-at-all ». L'enveloppement ne peut que resserrer, jamais ouvrir.
export function compileAnchored(source: string): RegExp {
  return new RegExp(`^(?:${source})$`);
}
