import { assertEquals, assertRejects } from "@std/assert";
import { exchangeToken, fetchAddonToken, isScalingoHost } from "../../../src/auth/client.ts";

function stubFetch(
  status: number,
  body: unknown,
  check?: (input: string | URL | Request, init?: RequestInit) => void,
): void {
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    check?.(input, init);
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
    );
  }) as typeof globalThis.fetch;
}

const originalFetch = globalThis.fetch;

Deno.test({
  name: "exchangeToken sends Basic Auth and returns bearer",
  fn: async () => {
    Deno.env.set("SCALINGO_AUTH_URL", "https://auth.test.local");
    Deno.env.set("FGP_EGRESS_ALLOW_PRIVATE", "1");

    stubFetch(200, { token: "bearer-abc-123" }, (input, init) => {
      assertEquals(String(input), "https://auth.test.local/v1/tokens/exchange");
      assertEquals(init?.method, "POST");
      const authHeader = (init?.headers as Record<string, string>)?.["Authorization"];
      assertEquals(authHeader, `Basic ${btoa(":tk-us-my-token")}`);
    });

    const bearer = await exchangeToken("tk-us-my-token");
    assertEquals(bearer, "bearer-abc-123");
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "exchangeToken throws on non-200 response",
  fn: async () => {
    Deno.env.set("SCALINGO_AUTH_URL", "https://auth.test.local");
    Deno.env.set("FGP_EGRESS_ALLOW_PRIVATE", "1");
    stubFetch(401, { error: "unauthorized" });

    await assertRejects(
      () => exchangeToken("bad-token"),
      Error,
      "Token exchange failed: 401",
    );
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "exchangeToken throws on unexpected response format",
  fn: async () => {
    Deno.env.set("SCALINGO_AUTH_URL", "https://auth.test.local");
    Deno.env.set("FGP_EGRESS_ALLOW_PRIVATE", "1");
    stubFetch(200, { unexpected: "data" });

    await assertRejects(
      () => exchangeToken("tk-us-my-token"),
      Error,
      "unexpected response format",
    );
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "exchangeToken uses default auth URL when env not set",
  fn: async () => {
    Deno.env.delete("SCALINGO_AUTH_URL");
    Deno.env.delete("FGP_EGRESS_ALLOW_PRIVATE");

    stubFetch(200, { token: "bearer-xyz" }, (input) => {
      assertEquals(
        String(input),
        "https://auth.scalingo.com/v1/tokens/exchange",
      );
    });

    const bearer = await exchangeToken("tk-us-my-token");
    assertEquals(bearer, "bearer-xyz");
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-43.18 bis: fetchAddonToken n'emet rien vers un apiUrl hors domaine Scalingo",
  fn: async () => {
    Deno.env.delete("SCALINGO_API_URL");
    Deno.env.delete("SCALINGO_AUTH_URL");
    Deno.env.set("FGP_EGRESS_ALLOW_PRIVATE", "1");

    let calls = 0;
    globalThis.fetch = (() => {
      calls++;
      return Promise.resolve(new Response("{}", { status: 200 }));
    }) as typeof globalThis.fetch;

    await assertRejects(
      () => fetchAddonToken("bearer-du-compte", "https://collecteur.example", "app", "ad-1"),
      Error,
      "apiUrl host is not a Scalingo host",
    );

    // La garde vaut par le fetch qui n'a pas lieu : le bearer est deja en main a cet
    // instant, un refus posterieur a l'emission ne protegerait plus rien.
    assertEquals(calls, 0, "un appel est parti vers l'hote non Scalingo");
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test("AC-43.18 ter: table des hotes acceptes et des faux amis", () => {
  const cas: [string, boolean][] = [
    ["https://api.osc-fr1.scalingo.com", true],
    ["https://scalingo.com", true],
    ["https://api.osc-secnum-fr1.scalingo.com/", true],
    ["https://collecteur.example", false],
    // Le suffixe se lit sur le hostname, pas sur la chaine : ces trois formes contiennent
    // toutes « scalingo.com » et aucune n'est un hote Scalingo.
    ["https://scalingo.com.collecteur.example", false],
    ["https://evil-scalingo.com", false],
    ["https://collecteur.example/api.osc-fr1.scalingo.com", false],
    ["https://collecteur.example?h=scalingo.com", false],
    ["scalingo.com", false],
    ["file:///etc/passwd", false],
  ];
  for (const [url, attendu] of cas) {
    assertEquals(isScalingoHost(url), attendu, url);
  }
});

globalThis.addEventListener("unload", () => {
  globalThis.fetch = originalFetch;
  Deno.env.delete("SCALINGO_AUTH_URL");
  Deno.env.delete("SCALINGO_API_URL");
  Deno.env.delete("FGP_EGRESS_ALLOW_PRIVATE");
});
