import { assertEquals } from "@std/assert";

import { extractClientIp, truncateIp } from "../../src/logs/ip.ts";

Deno.test({
  name: "AC-19.4: IPv4 is truncated to /24 by zeroing the last octet",
  fn: () => {
    assertEquals(truncateIp("203.0.113.42"), "203.0.113.0/24");
    assertEquals(truncateIp("10.0.0.1"), "10.0.0.0/24");
  },
});

Deno.test({
  name: "AC-19.5: IPv6 is truncated to /48 keeping only the first 3 groups",
  fn: () => {
    assertEquals(truncateIp("2001:db8:abcd:1234::1"), "2001:db8:abcd::/48");
    assertEquals(truncateIp("2001:0db8:abcd:1234::1"), "2001:db8:abcd::/48");
    assertEquals(truncateIp("fe80::1"), "fe80:0:0::/48");
  },
});

Deno.test({
  name: "AC-19.4: invalid or empty IP returns empty string",
  fn: () => {
    assertEquals(truncateIp(""), "");
    assertEquals(truncateIp("not-an-ip"), "");
    assertEquals(truncateIp("1.2.3"), "");
  },
});

// --- ADR-0009 §5 : provenance de l'IP ---

function hdrs(map: Record<string, string>) {
  return { get: (n: string) => map[n.toLowerCase()] ?? null };
}

Deno.test("AC-45.8: a 0 saut, X-Forwarded-For est ignore au profit de remoteAddr", () => {
  Deno.env.delete("FGP_TRUSTED_PROXY_HOPS");
  assertEquals(
    extractClientIp(hdrs({ "x-forwarded-for": "1.2.3.4" }), "198.51.100.7"),
    "198.51.100.7",
  );
});

Deno.test("AC-45.9: a 1 saut, la n-ieme en partant de la droite est retenue", () => {
  Deno.env.set("FGP_TRUSTED_PROXY_HOPS", "1");
  assertEquals(
    extractClientIp(hdrs({ "x-forwarded-for": "1.2.3.4, 203.0.113.7" }), "10.0.0.1"),
    "203.0.113.7",
  );
  Deno.env.delete("FGP_TRUSTED_PROXY_HOPS");
});

Deno.test("AC-45.10: a 1 saut avec une liste d'un seul element forge, retombe sur remoteAddr", () => {
  Deno.env.set("FGP_TRUSTED_PROXY_HOPS", "1");
  assertEquals(extractClientIp(hdrs({ "x-forwarded-for": "1.2.3.4" }), "198.51.100.7"), "1.2.3.4");
  assertEquals(
    extractClientIp(hdrs({ "x-forwarded-for": "" }), "198.51.100.7"),
    "198.51.100.7",
  );
  Deno.env.delete("FGP_TRUSTED_PROXY_HOPS");
});
