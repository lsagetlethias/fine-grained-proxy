import { assertEquals, assertRejects } from "@std/assert";
import { exchangeToken } from "../../../src/auth/client.ts";

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

globalThis.addEventListener("unload", () => {
  globalThis.fetch = originalFetch;
  Deno.env.delete("SCALINGO_AUTH_URL");
});
