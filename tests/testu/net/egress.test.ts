import { assertEquals } from "@std/assert";
import {
  _setResolverForTests,
  assertPublicHost,
  buildUpstreamUrl,
  isBlockedAddress,
  parseTargetUrl,
} from "../../../src/net/egress.ts";

function denialCode(r: ReturnType<typeof parseTargetUrl>): string | null {
  return "error" in r ? r.error.code : null;
}

Deno.test("AC-43.1 schema : file, data, ftp et javascript sont refuses", () => {
  for (
    const raw of [
      "file:///etc/passwd",
      "data:text/plain,hello",
      "ftp://x.example/",
      "javascript:alert(1)",
    ]
  ) {
    assertEquals(denialCode(parseTargetUrl(raw)), "invalid_target", raw);
  }
  assertEquals(denialCode(parseTargetUrl("https://api.example.com")), null);
  assertEquals(denialCode(parseTargetUrl("http://api.example.com")), null);
});

Deno.test("AC-43.2 forme : userinfo, query, fragment et chemin de base pieges refuses", () => {
  const refuses = [
    "https://user:pw@api.example.com",
    "https://user@api.example.com",
    "https://api.example.com/?x=",
    "https://api.example.com/#",
    "https://api.example.com/a/../b",
    "https://api.example.com/a%2fb",
  ];
  for (const raw of refuses) {
    assertEquals(denialCode(parseTargetUrl(raw)), "invalid_target", raw);
  }
  assertEquals(denialCode(parseTargetUrl("https://api.example.com/base")), null);
});

Deno.test("AC-43.3 IP litterales : toutes les plages non publiques sont refusees", () => {
  const bloquees = [
    "0.0.0.0",
    "0.1.2.3",
    "10.0.0.5",
    "100.64.0.1",
    "127.0.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "172.31.255.255",
    "192.0.0.1",
    "192.168.1.1",
    "198.18.0.1",
    "224.0.0.1",
    "240.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "fc00::1",
    "fd12::1",
    "fe80::1",
    "ff02::1",
    "::ffff:127.0.0.1",
    "::ffff:169.254.169.254",
    "::127.0.0.1",
  ];
  for (const ip of bloquees) assertEquals(isBlockedAddress(ip), true, ip);

  const publiques = [
    "93.184.216.34",
    "1.1.1.1",
    "172.32.0.1",
    "192.0.2.1",
    "2606:2800::1",
    "::ffff:93.184.216.34",
  ];
  for (const ip of publiques) assertEquals(isBlockedAddress(ip), false, ip);
});

Deno.test("AC-43.3 bis : les notations alternatives sont normalisees par WHATWG", () => {
  // new URL ramene 2130706433 et 0x7f.0.0.1 a 127.0.0.1 avant toute classification.
  assertEquals(new URL("http://2130706433").hostname, "127.0.0.1");
  assertEquals(new URL("http://0x7f.0.0.1").hostname, "127.0.0.1");
  assertEquals(new URL("http://[::1]").hostname, "[::1]");
});

Deno.test("AC-43.4 noms : toutes les reponses DNS doivent etre publiques", async () => {
  _setResolverForTests((_h, kind) => Promise.resolve(kind === "A" ? ["10.0.0.5"] : []));
  assertEquals((await assertPublicHost("interne.example.com"))?.code, "target_forbidden");

  _setResolverForTests((_h, kind) => Promise.resolve(kind === "A" ? ["93.184.216.34"] : []));
  assertEquals(await assertPublicHost("api.example.com"), null);

  // une publique ET une privee : la regle porte sur toutes les reponses
  _setResolverForTests((_h, kind) =>
    Promise.resolve(kind === "A" ? ["93.184.216.34", "169.254.169.254"] : [])
  );
  assertEquals((await assertPublicHost("mixte.example.com"))?.code, "target_forbidden");
  _setResolverForTests(null);
});

Deno.test("AC-43.5 suffixes : refuses sans meme resoudre", async () => {
  let resolutions = 0;
  _setResolverForTests(() => {
    resolutions++;
    return Promise.resolve(["93.184.216.34"]);
  });
  for (
    const host of ["metadata.google.internal", "db.local", "x.localhost", "y.home.arpa", "redis"]
  ) {
    assertEquals((await assertPublicHost(host))?.code, "target_forbidden", host);
  }
  assertEquals(resolutions, 0);
  _setResolverForTests(null);
});

Deno.test("AC-43.6 echec de resolution : ne produit pas de refus", async () => {
  _setResolverForTests(() => Promise.reject(new Error("NXDOMAIN")));
  assertEquals(await assertPublicHost("absent.example.com"), null);
  _setResolverForTests(null);
});

Deno.test("AC-43.7 FGP_EGRESS_ALLOW_PRIVATE desactive l'etape 2, jamais l'etape 1", async () => {
  Deno.env.set("FGP_EGRESS_ALLOW_PRIVATE", "1");
  assertEquals(await assertPublicHost("127.0.0.1"), null);
  assertEquals(await assertPublicHost("api.mock.local"), null);
  // l'etape 1 reste appliquee
  assertEquals(denialCode(parseTargetUrl("file:///etc/passwd")), "invalid_target");
  Deno.env.delete("FGP_EGRESS_ALLOW_PRIVATE");
});

Deno.test("AC-43.8 buildUpstreamUrl : le chemin proxy ne peut pas etre avale", () => {
  const t = (raw: string) => {
    const r = parseTargetUrl(raw);
    if ("error" in r) throw new Error("target refuse : " + raw);
    return r.url;
  };
  assertEquals(
    buildUpstreamUrl(t("https://api.example.com"), "/v1/items", "?a=1").toString(),
    "https://api.example.com/v1/items?a=1",
  );
  assertEquals(
    buildUpstreamUrl(t("https://api.example.com/base"), "/v1/items", "").toString(),
    "https://api.example.com/base/v1/items",
  );
  assertEquals(
    buildUpstreamUrl(t("https://api.example.com/base/"), "/v1/items", "").toString(),
    "https://api.example.com/base/v1/items",
  );
  // le percent-encoding du chemin proxy part tel quel, ADR-0006
  assertEquals(
    buildUpstreamUrl(t("https://api.example.com"), "/projects/groupe%2Fprojet", "").toString(),
    "https://api.example.com/projects/groupe%2Fprojet",
  );
});
