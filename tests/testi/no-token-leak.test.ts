import { assertEquals } from "@std/assert";

import { app } from "../../src/main.ts";
import { encryptBlob } from "../../src/crypto/blob.ts";
import { _resetStoreForTests } from "../../src/auth/cache.ts";

const CLIENT_KEY = "no-leak-test-key";
const SERVER_SALT = "no-leak-test-salt";
const SECRET_TOKEN = "SECRET_TOKEN_ABCDEF";

function nowUnix(): number {
  return Math.floor(Date.now() / 1000);
}

Deno.test({
  name: "AC-15.1 bis: token jamais loggé en forward transparent",
  fn: async () => {
    _resetStoreForTests();
    Deno.env.set("FGP_SALT", SERVER_SALT);
    const originalFetch = globalThis.fetch;

    const blob = await encryptBlob(
      {
        v: 2,
        token: SECRET_TOKEN,
        target: "https://api.mock.local",
        auth: "bearer",
        scopes: ["*:*"],
        ttl: 3600,
        createdAt: nowUnix(),
      },
      CLIENT_KEY,
      SERVER_SALT,
    );

    globalThis.fetch = (() =>
      Promise.resolve(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "X-Echo-Auth": `Bearer ${SECRET_TOKEN}`,
          },
        }),
      )) as typeof globalThis.fetch;

    const captured: string[] = [];
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;
    const originalInfo = console.info;
    const originalDebug = console.debug;
    const spy = (...args: unknown[]) => {
      captured.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
    };
    console.log = spy;
    console.error = spy;
    console.warn = spy;
    console.info = spy;
    console.debug = spy;

    try {
      const res = await app.request(`/${blob}/v1/apps/my-app`, {
        headers: { "X-FGP-Key": CLIENT_KEY },
      });

      assertEquals(res.status, 200);
      assertEquals(res.headers.get("X-FGP-Source"), "upstream");

      const bodyText = await res.text();
      assertEquals(bodyText.includes(SECRET_TOKEN), false);

      for (const line of captured) {
        assertEquals(
          line.includes(SECRET_TOKEN),
          false,
          `Token leaked in log: ${line}`,
        );
      }
    } finally {
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
      console.info = originalInfo;
      console.debug = originalDebug;
      globalThis.fetch = originalFetch;
      Deno.env.delete("FGP_SALT");
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});
