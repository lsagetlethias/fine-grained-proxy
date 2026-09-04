// Point de sortie unique du processus (ADR-0009 §6). Tout fetch sortant passe par ici :
// la revue d'une PR n'a plus a se demander si un appel reseau est sur, seulement s'il
// emprunte ce module.

export interface EgressDenial {
  code: "invalid_target" | "target_forbidden";
  message: string;
}

const PRIVATE_SUFFIXES = [".internal", ".local", ".localhost", ".home.arpa"];

let warnedAllowPrivate = false;

function allowPrivate(): boolean {
  const on = Deno.env.get("FGP_EGRESS_ALLOW_PRIVATE") === "1";
  if (on && !warnedAllowPrivate) {
    warnedAllowPrivate = true;
    console.warn(
      "[fgp] FGP_EGRESS_ALLOW_PRIVATE=1 : la classification des destinations est desactivee. " +
        "G1 ne s'applique plus, l'instance accepte de joindre le reseau prive de son hote.",
    );
  }
  return on;
}

// Etape 1 de la politique : forme, purement syntaxique, sans reseau.
export function parseTargetUrl(raw: string): { url: URL } | { error: EgressDenial } {
  // Controle sur la chaine brute avant parsing : un « # » final ne produit aucun hash et
  // un « ? » nu aucune search, les deux seraient donc invisibles apres normalisation.
  if (raw.includes("#")) {
    return { error: { code: "invalid_target", message: "Target must not carry a fragment" } };
  }
  if (raw.includes("?")) {
    return { error: { code: "invalid_target", message: "Target must not carry a query string" } };
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { error: { code: "invalid_target", message: "Target must be an absolute URL" } };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { error: { code: "invalid_target", message: "Target scheme must be http or https" } };
  }
  if (url.username || url.password) {
    return { error: { code: "invalid_target", message: "Target must not carry userinfo" } };
  }
  if (url.search) {
    return { error: { code: "invalid_target", message: "Target must not carry a query string" } };
  }
  if (url.hash) {
    return { error: { code: "invalid_target", message: "Target must not carry a fragment" } };
  }
  if (!url.hostname) {
    return { error: { code: "invalid_target", message: "Target must carry a host" } };
  }
  // Le parseur resout deja les segments « .. » : on inspecte donc aussi la forme brute,
  // sinon un target qui en porte passerait le controle apres normalisation.
  const base = url.pathname;
  const rawPath = raw.slice(raw.indexOf(url.host) + url.host.length);
  if (
    /%2f/i.test(base) || /%5c/i.test(base) || /%2e/i.test(rawPath) ||
    base.includes("..") || rawPath.includes("..") ||
    base.includes("\\") || rawPath.includes("\\")
  ) {
    return {
      error: { code: "invalid_target", message: "Target base path must not contain .., %2f or \\" },
    };
  }
  return { url };
}

function ipv4Blocked(a: number, b: number, c: number, d: number): boolean {
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10/8
  if (a === 127) return true; // 127/8
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64/10
  if (a === 169 && b === 254) return true; // 169.254/16
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
  if (a === 192 && b === 0 && c === 0) return true; // 192.0.0/24
  if (a === 192 && b === 168) return true; // 192.168/16
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18/15
  if (a >= 224) return true; // 224/4 multicast, 240/4 reserve, 255.255.255.255
  return d < 0; // jamais vrai : d participe seulement a la forme
}

function parseIpv4(host: string): [number, number, number, number] | null {
  const parts = host.split(".");
  if (parts.length !== 4) return null;
  const nums: number[] = [];
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const n = Number(p);
    if (n > 255) return null;
    nums.push(n);
  }
  return [nums[0], nums[1], nums[2], nums[3]];
}

function parseGroups(list: string[], out: number[]): boolean {
  for (const g of list) {
    // Un groupe final en notation pointee (::ffff:127.0.0.1) vaut deux groupes de 16 bits.
    const v4 = parseIpv4(g);
    if (v4) {
      out.push((v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]);
      continue;
    }
    if (!/^[0-9a-f]{1,4}$/i.test(g)) return false;
    out.push(parseInt(g, 16));
  }
  return true;
}

function expandIpv6(host: string): number[] | null {
  const raw = host.replace(/^\[|\]$/g, "");
  if (!raw.includes(":")) return null;
  if (raw.split("::").length > 2) return null;

  const split = (s: string): string[] => (s.length === 0 ? [] : s.split(":"));
  const hasGap = raw.includes("::");
  const [headRaw, tailRaw] = hasGap ? raw.split("::") : [raw, ""];

  const head: number[] = [];
  const tail: number[] = [];
  if (!parseGroups(split(headRaw), head)) return null;
  if (!parseGroups(split(tailRaw), tail)) return null;

  if (!hasGap) return head.length === 8 ? head : null;

  const fill = 8 - head.length - tail.length;
  if (fill < 0) return null;
  return [...head, ...new Array(fill).fill(0), ...tail];
}

// Etape 2 : classification d'une adresse litterale.
export function isBlockedAddress(ip: string): boolean {
  const v4 = parseIpv4(ip);
  if (v4) return ipv4Blocked(v4[0], v4[1], v4[2], v4[3]);

  const v6 = expandIpv6(ip);
  if (!v6) return false;

  const allZeroPrefix = v6.slice(0, 5).every((g) => g === 0);
  // IPv4-mapped (::ffff:a.b.c.d) et IPv4-compatible (::a.b.c.d) : la decision porte
  // sur l'adresse v4 encapsulee, sinon 169.254.169.254 passe sous forme v6.
  if (allZeroPrefix && (v6[5] === 0xffff || v6[5] === 0)) {
    const a = v6[6] >> 8, b = v6[6] & 0xff, c = v6[7] >> 8, d = v6[7] & 0xff;
    if (!(a === 0 && b === 0 && c === 0 && d === 0)) {
      return ipv4Blocked(a, b, c, d);
    }
  }
  if (v6.every((g) => g === 0)) return true; // ::
  if (v6.slice(0, 7).every((g) => g === 0) && v6[7] === 1) return true; // ::1
  if ((v6[0] & 0xfe00) === 0xfc00) return true; // fc00::/7
  if ((v6[0] & 0xffc0) === 0xfe80) return true; // fe80::/10
  if ((v6[0] & 0xff00) === 0xff00) return true; // ff00::/8
  return false;
}

function isLiteralIp(hostname: string): boolean {
  return parseIpv4(hostname) !== null || hostname.includes(":");
}

// Partie synchrone de l'etape 2 : ce qui se decide sur la chaine seule, IP litterale et
// suffixes conventionnels, sans reseau. Destinee aux chemins qui n'emettent aucune requete,
// la generation en particulier. Elle est incomplete par construction : un nom qui resout
// vers une adresse privee passe ici et n'est refuse qu'au point de sortie, par
// assertPublicHost, la ou la requete part vraiment.
export function classifyLiteralHost(hostname: string): EgressDenial | null {
  if (allowPrivate()) return null;

  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();

  if (isLiteralIp(host)) {
    return isBlockedAddress(host)
      ? { code: "target_forbidden", message: "Target address is not public" }
      : null;
  }
  if (!host.includes(".") || PRIVATE_SUFFIXES.some((s) => host.endsWith(s))) {
    return { code: "target_forbidden", message: "Target host is not public" };
  }
  return null;
}

// Etape 2 complete : ajoute la resolution DNS pour les noms. A n'appeler que sur un
// chemin qui va reellement emettre.
export async function assertPublicHost(hostname: string): Promise<EgressDenial | null> {
  const literal = classifyLiteralHost(hostname);
  if (literal) return literal;
  if (allowPrivate()) return null;

  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (isLiteralIp(host)) return null;

  let addresses: string[] = [];
  let resolved = false;
  for (const kind of ["A", "AAAA"] as const) {
    try {
      addresses = addresses.concat(await resolver()(host, kind));
      resolved = true;
    } catch {
      // Un echec de resolution n'est pas un refus de politique : un nom qui ne resout
      // pas ne joint rien, et fail-closed transformerait tout incident DNS en refus opaque.
    }
  }
  if (!resolved || addresses.length === 0) return null;

  // Toutes les reponses doivent etre publiques : une seule adresse privee suffit a refuser.
  for (const addr of addresses) {
    if (isBlockedAddress(addr)) {
      return { code: "target_forbidden", message: "Target host resolves to a non-public address" };
    }
  }
  return null;
}

type Resolver = (host: string, kind: "A" | "AAAA") => Promise<string[]>;

let injectedResolver: Resolver | null = null;

function resolver(): Resolver {
  if (injectedResolver) return injectedResolver;
  return (host, kind) => Deno.resolveDns(host, kind);
}

export function _setResolverForTests(fn: Resolver | null): void {
  injectedResolver = fn;
}

// Construction deterministe de l'URL sortante. Jamais par concatenation : un target
// finissant par # ou ? avalerait le chemin scope, qui ne partirait alors jamais.
export function buildUpstreamUrl(target: URL, proxyPath: string, search: string): URL {
  const url = new URL(target.toString());
  const base = url.pathname.replace(/\/+$/, "");
  url.pathname = base + proxyPath;
  url.search = search;
  url.hash = "";
  return url;
}

export async function egressFetch(url: URL, init: RequestInit = {}): Promise<Response> {
  const denial = await assertPublicHost(url.hostname);
  if (denial) throw new EgressError(denial);
  // redirect manual : sans cela la classification ne vaut rien, un hote public
  // autorise redirigerait vers l'adresse de metadonnees avec rejeu des en-tetes d'auth.
  return await fetch(url, { ...init, redirect: "manual" });
}

export class EgressError extends Error {
  readonly denial: EgressDenial;
  constructor(denial: EgressDenial) {
    super(denial.message);
    this.name = "EgressError";
    this.denial = denial;
  }
}
