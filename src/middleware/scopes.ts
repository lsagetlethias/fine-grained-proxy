import { compileAnchored } from "../crypto/regex-policy.ts";

export const MAX_REGEX_INPUT = 128;

export type JsonValue = string | number | boolean | null | JsonValue[] | {
  [key: string]: JsonValue;
};

export type ObjectValue =
  | { type: "any"; value: JsonValue }
  | { type: "wildcard" }
  | { type: "stringwildcard"; value: string }
  | { type: "regex"; value: string }
  | { type: "and"; value: ObjectValue[] }
  | { type: "not"; value: ObjectValue };

export interface BodyFilter {
  objectPath: string;
  objectValue: ObjectValue[];
}

export interface QueryFilter {
  param: string;
  values: ObjectValue[];
  required?: boolean;
}

export interface ScopeEntry {
  methods: string[];
  pattern: string;
  bodyFilters?: BodyFilter[];
  queryFilters?: QueryFilter[];
}

export const MAX_QUERY_FILTERS_PER_SCOPE = 8;
export const MAX_QUERY_VALUES_PER_FILTER = 16;

// Deux paliers plutot qu'un seul : une occurrence repetee est a la charge de l'appelant, pas
// de l'auteur du blob, donc les plafonds structurels de l'ADR-0010 ne la bornent pas. Calibrer
// le palier unique sur le cout d'une regex interdisait le filtrage par liste, qui est l'usage
// courant sur les API a dominante GET (ADR-0010 D2, specs §19.4).
export const QUERY_OCCURRENCE_CAP_WITH_REGEX = 4;
export const QUERY_OCCURRENCE_CAP_DEFAULT = 64;

export type Scope = string | ScopeEntry;

interface ParsedScope {
  methods: string[];
  pattern: string;
}

export function parseScope(scope: string): ParsedScope {
  const colonIdx = scope.indexOf(":");
  if (colonIdx === -1) {
    return { methods: ["*"], pattern: scope };
  }
  const methodPart = scope.slice(0, colonIdx);
  const pattern = scope.slice(colonIdx + 1);
  const methods = (methodPart.includes("|") ? methodPart.split("|") : [methodPart]).map((m) =>
    m.toUpperCase()
  );
  return { methods, pattern };
}

export function matchPath(pattern: string, path: string): boolean {
  if (pattern === "*") return true;
  if (!pattern.includes("*")) return pattern === path;

  const segments = pattern.split("*");
  let cursor = 0;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];

    if (i === 0) {
      if (!path.startsWith(seg)) return false;
      cursor = seg.length;
      continue;
    }

    const remaining = path.slice(cursor);
    if (remaining.length === 0) return false;

    if (i === segments.length - 1 && seg === "") {
      return true;
    }

    const idx = remaining.indexOf(seg);
    if (idx < 1) return false;

    cursor += idx + seg.length;
  }

  if (segments[segments.length - 1] !== "") {
    return cursor === path.length;
  }

  return true;
}

function resolveObjectPath(body: unknown, dotPath: string): { found: boolean; value: unknown } {
  const keys = dotPath.split(".");
  let current: unknown = body;

  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== "object") {
      return { found: false, value: undefined };
    }
    if (!Object.prototype.hasOwnProperty.call(current, key)) {
      return { found: false, value: undefined };
    }
    current = (current as Record<string, unknown>)[key];
  }

  return { found: true, value: current };
}

function matchObjectValue(ov: ObjectValue, bodyValue: unknown): boolean {
  switch (ov.type) {
    case "any":
      return JSON.stringify(ov.value) === JSON.stringify(bodyValue);
    case "wildcard":
      return true;
    case "stringwildcard":
      return typeof bodyValue === "string" && matchPath(ov.value, bodyValue);
    case "regex":
      if (typeof bodyValue !== "string") return false;
      // Plafond de la valeur testee : le backtracking est exponentiel ou polynomial en la
      // longueur de l'entree. Le meme motif coute 181,9 ms sur 1000 caracteres et 2,54 ms
      // sur 128. C'est la couche porteuse, elle ne depend d'aucune analyse du motif.
      if (bodyValue.length > MAX_REGEX_INPUT) return false;
      try {
        return compileAnchored(ov.value).test(bodyValue);
      } catch {
        return false;
      }
    case "and":
      return ov.value.every((sub) => matchObjectValue(sub, bodyValue));
    case "not":
      return !matchObjectValue(ov.value, bodyValue);
    default:
      return false;
  }
}

export function matchBodyFilter(filter: BodyFilter, body: unknown): boolean {
  const { found, value } = resolveObjectPath(body, filter.objectPath);
  if (!found) return false;
  return filter.objectValue.some((ov) => matchObjectValue(ov, value));
}

type BodyDecision = "allow" | "skip" | "deny";

function decideBodyFilters(scope: ScopeEntry, body: unknown): BodyDecision {
  if (!scope.bodyFilters || scope.bodyFilters.length === 0) return "allow";
  if (body === undefined) return "deny";
  return scope.bodyFilters.every((f) => matchBodyFilter(f, body)) ? "allow" : "skip";
}

// --- Axe query (v5, specs §19) ---

export type QueryDenialReason =
  | "undeclared"
  | "required_missing"
  | "too_many_occurrences"
  | "value";

export interface QueryDenial {
  reason: QueryDenialReason;
  param: string;
  // Renseigne pour « too_many_occurrences » seulement : le plafond depend du filtre, pas
  // de la requete, et le diagnostic doit pouvoir le nommer sans le recalculer.
  cap?: number;
}

function containsRegexValue(ov: ObjectValue): boolean {
  switch (ov.type) {
    case "regex":
      return true;
    case "and":
      return ov.value.some(containsRegexValue);
    case "not":
      return containsRegexValue(ov.value);
    default:
      return false;
  }
}

// Le palier ne depend que du blob, jamais de la requete : lire un discriminant sur une union
// fermee et deja validee ne peut pas se tromper, contrairement a l'analyse d'un motif de regex
// que l'ADR-0010 refuse explicitement de faire.
export function queryOccurrenceCap(filter: QueryFilter): number {
  return filter.values.some(containsRegexValue)
    ? QUERY_OCCURRENCE_CAP_WITH_REGEX
    : QUERY_OCCURRENCE_CAP_DEFAULT;
}

export function scopeQueryFilters(scope: Scope): QueryFilter[] | undefined {
  if (typeof scope === "string") return undefined;
  const filters = scope.queryFilters;
  if (!Array.isArray(filters) || filters.length === 0) return undefined;
  return filters;
}

export function scopeConstrainsQuery(scope: Scope): boolean {
  return scopeQueryFilters(scope) !== undefined;
}

// Les occurrences sont indexees par nom, dans l'ordre d'apparition. L'ordre sert au seul
// diagnostic : il rend le nom du premier parametre non declare independant du parcours des
// filtres, donc reproductible.
interface ParsedQuery {
  occurrences: Map<string, string[]>;
  order: string[];
}

function parseQuery(search: string): ParsedQuery {
  const occurrences = new Map<string, string[]>();
  const order: string[] = [];
  for (const [name, value] of new URLSearchParams(search)) {
    const existing = occurrences.get(name);
    if (existing) {
      existing.push(value);
    } else {
      occurrences.set(name, [value]);
      order.push(name);
    }
  }
  return { occurrences, order };
}

function decideParsedQuery(filters: QueryFilter[], parsed: ParsedQuery): QueryDenial | null {
  const { occurrences, order } = parsed;

  // Les quatre causes sont evaluees par phases, dans l'ordre de §12.5. Le comptage precede
  // l'examen des valeurs : sans cet ordre, une requete dont le seul probleme est le nombre
  // d'occurrences se verrait reprocher une valeur qui est pourtant correcte (§19.2, regle 3).
  const declared = new Set(filters.map((f) => f.param));
  for (const name of order) {
    if (!declared.has(name)) return { reason: "undeclared", param: name };
  }

  for (const filter of filters) {
    if (!occurrences.has(filter.param) && filter.required === true) {
      return { reason: "required_missing", param: filter.param };
    }
  }

  for (const filter of filters) {
    const values = occurrences.get(filter.param);
    if (!values) continue;
    const cap = queryOccurrenceCap(filter);
    if (values.length > cap) {
      return { reason: "too_many_occurrences", param: filter.param, cap };
    }
  }

  for (const filter of filters) {
    const values = occurrences.get(filter.param);
    if (!values) continue;
    const allMatch = values.every((v) => filter.values.some((ov) => matchObjectValue(ov, v)));
    if (!allMatch) return { reason: "value", param: filter.param };
  }

  return null;
}

export function decideQueryFilters(scope: ScopeEntry, search: string): QueryDenial | null {
  const filters = scopeQueryFilters(scope);
  if (!filters) return null;
  return decideParsedQuery(filters, parseQuery(search));
}

export type DenialAxis = "invalid_path" | "method" | "path" | "path_encoded" | "body" | "query";

export interface Denial {
  axis: DenialAxis;
  // Renseigne pour l'axe query uniquement, et consomme par le seul testeur de scopes :
  // en production le refus reste generique (§8.2).
  query?: QueryDenial;
}

interface MatchOutcome {
  // Index du scope qui accorde l'acces, -1 si aucun. Les scopes sont en OR et le premier
  // qui matche tranche : c'est lui, et lui seul, qui a reellement filtre la requete (§12.5).
  grantedBy: number;
  denial?: Denial;
}

const DENIAL_RANK: Record<DenialAxis, number> = {
  invalid_path: 0,
  method: 1,
  path: 2,
  path_encoded: 2,
  body: 3,
  query: 4,
};

type PathMatcher = (method: string, path: string) => MatchOutcome;

// Ce qui ne depend pas de la forme du chemin, les filtres de corps et l'axe query, est decide
// une fois par scope et partage entre les passes de checkRequestAccess. Sans ce partage,
// l'appelant declenche la seconde passe en envoyant un chemin non canonique et fait payer
// deux fois le budget d'evaluation calibre par l'ADR-0010 D2 et par §19.4.
function createPathMatcher(scopes: Scope[], body: unknown, search: string): PathMatcher {
  const bodyDecisions: (BodyDecision | undefined)[] = [];
  const queryDecisions: (QueryDenial | null | undefined)[] = [];
  // Une seule analyse par requete, partagee par tous les scopes et par les deux passes de
  // chemin. Analysee par scope, une query de 48 Ko serait relue autant de fois qu'il y a de
  // scopes contraints, pour un resultat strictement identique. Paresseuse : un blob sans
  // queryFilters, le cas majoritaire, ne paie rien.
  let parsedQuery: ParsedQuery | undefined;
  const query = (): ParsedQuery => (parsedQuery ??= parseQuery(search));

  return (method, path) => {
    const upperMethod = method.toUpperCase();
    let deepest: Denial | undefined;

    const record = (denial: Denial): void => {
      if (!deepest || DENIAL_RANK[denial.axis] > DENIAL_RANK[deepest.axis]) deepest = denial;
    };

    for (let i = 0; i < scopes.length; i++) {
      const scope = scopes[i];

      if (typeof scope === "string") {
        const parsed = parseScope(scope);
        const methodMatch = parsed.methods.includes("*") || parsed.methods.includes(upperMethod);
        if (!methodMatch) {
          record({ axis: "method" });
          continue;
        }
        if (!matchPath(parsed.pattern, path)) {
          record({ axis: "path" });
          continue;
        }
        return { grantedBy: i };
      }

      const methodMatch = scope.methods.some((m) => m === "*" || m.toUpperCase() === upperMethod);
      if (!methodMatch) {
        record({ axis: "method" });
        continue;
      }
      if (!matchPath(scope.pattern, path)) {
        record({ axis: "path" });
        continue;
      }

      let decision = bodyDecisions[i];
      if (decision === undefined) {
        decision = decideBodyFilters(scope, body);
        bodyDecisions[i] = decision;
      }
      if (decision === "deny") return { grantedBy: -1, denial: { axis: "body" } };
      if (decision === "skip") {
        record({ axis: "body" });
        continue;
      }

      let queryDenial = queryDecisions[i];
      if (queryDenial === undefined) {
        const filters = scopeQueryFilters(scope);
        queryDenial = filters ? decideParsedQuery(filters, query()) : null;
        queryDecisions[i] = queryDenial;
      }
      if (queryDenial) {
        record({ axis: "query", query: queryDenial });
        continue;
      }

      return { grantedBy: i };
    }

    return { grantedBy: -1, denial: deepest };
  };
}

export function checkAccess(
  scopes: Scope[],
  method: string,
  path: string,
  body?: unknown,
): boolean {
  // Le chemin est compare tel quel, query comprise : c'est checkRequestAccess qui separe les
  // deux axes. Un appelant de bas niveau qui passe « /v1/items?page=1 » demande bien ce
  // chemin-la, il ne demande pas une evaluation de sa query.
  return createPathMatcher(scopes, body, "")(method, path).grantedBy >= 0;
}

// --- ADR-0009 §3 et §4 : forme unique d'autorisation ---
// Ce fichier est bundle cote navigateur : aucune API Deno ici.

export function splitPathAndQuery(rawPathWithQuery: string): [string, string] {
  const i = rawPathWithQuery.indexOf("?");
  if (i === -1) return [rawPathWithQuery, ""];
  return [rawPathWithQuery.slice(0, i), rawPathWithQuery.slice(i)];
}

// deno-lint-ignore no-control-regex
const CONTROL_OR_NUL = /[\x00-\x1F\x7F]/;

export function canonicalizePath(rawPath: string): string {
  let path = rawPath;
  // Decodage repete jusqu'au point fixe : %252f devient %2f puis /, sinon un double
  // encodage suffirait a echapper au controle. Trois tours suffisent en pratique.
  for (let i = 0; i < 3; i++) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(path);
    } catch {
      break;
    }
    if (decoded === path) break;
    path = decoded;
  }
  path = path.replace(/\\/g, "/");
  path = path.replace(/\/{2,}/g, "/");

  const segments = path.split("/");
  const out: string[] = [];
  for (const seg of segments) {
    if (seg === ".") continue;
    if (seg === "..") {
      out.pop();
      continue;
    }
    out.push(seg);
  }
  let result = out.join("/");
  if (!result.startsWith("/")) result = "/" + result;
  return result.replace(/\/{2,}/g, "/");
}

export interface AccessVerdict {
  allowed: boolean;
  denial?: Denial;
  // Index dans « scopes » du scope qui accorde l'acces, absent si refus. Les scopes sont en
  // OR : nommer celui qui a reellement tranche est la seule facon de ne pas laisser croire
  // qu'une contrainte portee par un autre scope a joue (§12.5, challenge testeur T2).
  grantedBy?: number;
  // Le scope qui accorde l'acces porte des queryFilters : la query a reellement ete filtree.
  queryConstrained: boolean;
  // Un scope couvrant cette methode et ce chemin porte des queryFilters, qu'il ait accorde
  // l'acces ou non. Distingue « aucune contrainte nulle part » de « contrainte contournee ».
  queryConstrainedElsewhere: boolean;
}

function coversPathWithQueryFilters(
  scopes: Scope[],
  method: string,
  rawPath: string,
  canonical: string,
): boolean {
  const upperMethod = method.toUpperCase();
  for (const scope of scopes) {
    if (!scopeConstrainsQuery(scope)) continue;
    const entry = scope as ScopeEntry;
    const methodMatch = entry.methods.some((m) => m === "*" || m.toUpperCase() === upperMethod);
    if (!methodMatch) continue;
    if (matchPath(entry.pattern, rawPath)) return true;
    if (canonical !== rawPath && matchPath(entry.pattern, canonical)) return true;
  }
  return false;
}

export function checkRequestAccess(
  scopes: Scope[],
  method: string,
  rawPathWithQuery: string,
  body?: unknown,
): AccessVerdict {
  const [rawPath, search] = splitPathAndQuery(rawPathWithQuery);
  const canonical = canonicalizePath(rawPath);

  if (CONTROL_OR_NUL.test(canonical)) {
    return {
      allowed: false,
      denial: { axis: "invalid_path" },
      queryConstrained: false,
      queryConstrainedElsewhere: false,
    };
  }

  const matchesPath = createPathMatcher(scopes, body, search);

  const denied = (denial: Denial | undefined): AccessVerdict => ({
    allowed: false,
    denial,
    queryConstrained: false,
    queryConstrainedElsewhere: coversPathWithQueryFilters(scopes, method, rawPath, canonical),
  });

  const raw = matchesPath(method, rawPath);
  if (raw.grantedBy < 0) return denied(raw.denial ?? { axis: "path" });

  // Le controle porte sur toutes les formes plausibles, l'emission sur la forme brute :
  // ajouter une forme ne peut que reduire l'ensemble autorise (ADR-0009 §3). Les decisions
  // de corps et de query sont memoisees : seule la forme du chemin est reevaluee ici.
  if (canonical !== rawPath && matchesPath(method, canonical).grantedBy < 0) {
    return denied({ axis: "path_encoded" });
  }

  const constrained = scopeConstrainsQuery(scopes[raw.grantedBy]);
  return {
    allowed: true,
    grantedBy: raw.grantedBy,
    queryConstrained: constrained,
    queryConstrainedElsewhere: constrained ||
      coversPathWithQueryFilters(scopes, method, rawPath, canonical),
  };
}
