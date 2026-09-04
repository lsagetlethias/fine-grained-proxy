export function truncateIp(ip: string): string {
  if (!ip) return "";
  const trimmed = ip.trim();
  if (trimmed.length === 0) return "";

  if (trimmed.includes(".") && !trimmed.includes(":")) {
    const parts = trimmed.split(".");
    if (parts.length !== 4) return "";
    if (!parts.every((p) => /^\d+$/.test(p))) return "";
    return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
  }

  if (trimmed.includes(":")) {
    const bare = trimmed.replace(/^\[|\]$/g, "").split("%")[0];
    const groups = expandIpv6(bare);
    if (!groups) return "";
    return `${groups[0]}:${groups[1]}:${groups[2]}::/48`;
  }

  return "";
}

function expandIpv6(addr: string): string[] | null {
  if (addr.includes(".")) {
    const lastColon = addr.lastIndexOf(":");
    if (lastColon === -1) return null;
    const head = addr.slice(0, lastColon);
    const ipv4 = addr.slice(lastColon + 1);
    const ipv4Parts = ipv4.split(".");
    if (ipv4Parts.length !== 4) return null;
    const hi = (Number(ipv4Parts[0]) * 256 + Number(ipv4Parts[1])).toString(16);
    const lo = (Number(ipv4Parts[2]) * 256 + Number(ipv4Parts[3])).toString(16);
    return expandIpv6(`${head}:${hi}:${lo}`);
  }

  const doubleIdx = addr.indexOf("::");
  let groups: string[];
  if (doubleIdx === -1) {
    groups = addr.split(":");
    if (groups.length !== 8) return null;
  } else {
    const leftStr = addr.slice(0, doubleIdx);
    const rightStr = addr.slice(doubleIdx + 2);
    const left = leftStr === "" ? [] : leftStr.split(":");
    const right = rightStr === "" ? [] : rightStr.split(":");
    const missing = 8 - left.length - right.length;
    if (missing < 0) return null;
    groups = [...left, ...Array(missing).fill("0"), ...right];
  }

  if (groups.length !== 8) return null;
  return groups.map((g) => {
    const lower = g.toLowerCase();
    return lower.replace(/^0+/, "") || "0";
  });
}

// Ne jamais faire confiance a un en-tete de provenance sans savoir combien de sauts amont
// sont dignes de confiance. Une IP fausse dans un journal est pire qu'une IP absente :
// elle sera lue comme une preuve (ADR-0009 §5).
export function trustedProxyHops(): number {
  const raw = Deno.env.get("FGP_TRUSTED_PROXY_HOPS");
  const n = raw === undefined ? 0 : Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

export function extractClientIp(
  headers: { get(name: string): string | null },
  remoteAddr: string,
): string {
  const hops = trustedProxyHops();
  if (hops <= 0) return remoteAddr;

  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const list = forwarded.split(",").map((p) => p.trim()).filter(Boolean);
    // La n-ieme en partant de la droite : la partie gauche est ecrite par l'appelant,
    // la partie droite par l'infrastructure.
    const idx = list.length - hops;
    if (idx >= 0 && idx < list.length) return list[idx];
    return remoteAddr;
  }

  const real = headers.get("x-real-ip");
  if (real && real.trim()) return real.trim();
  return remoteAddr;
}
