import { assertEquals } from "@std/assert";

import { app } from "../../src/main.ts";
import { encryptBlob } from "../../src/crypto/blob.ts";

const CLIENT_KEY = "onerror-test-key";
const SERVER_SALT = "onerror-test-salt";

function nowUnix(): number {
  return Math.floor(Date.now() / 1000);
}

async function makeBlob(): Promise<string> {
  return await encryptBlob(
    {
      v: 2,
      token: "tk-us-secret-internal-token",
      target: "https://api.mock.local",
      auth: "bearer",
      scopes: ["*:*"],
      ttl: 3600,
      createdAt: nowUnix(),
    },
    CLIENT_KEY,
    SERVER_SALT,
  );
}

Deno.test({
  name:
    "AC-17.31: missing FGP_SALT triggers app.onError → 500 internal_error + X-FGP-Source: proxy",
  fn: async () => {
    Deno.env.set("FGP_SALT", SERVER_SALT);
    const blob = await makeBlob();
    Deno.env.delete("FGP_SALT");

    const originalConsoleError = console.error;
    console.error = () => {};

    try {
      const res = await app.request(`/${blob}/v1/x`, {
        headers: { "X-FGP-Key": CLIENT_KEY },
      });

      assertEquals(res.status, 500);
      const body = await res.json();
      assertEquals(body.error, "internal_error");
      assertEquals(body.message, "Internal server error");
      assertEquals(res.headers.get("X-FGP-Source"), "proxy");
    } finally {
      console.error = originalConsoleError;
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-17.32: app.onError does not leak original error message or stack",
  fn: async () => {
    Deno.env.set("FGP_SALT", SERVER_SALT);
    const blob = await makeBlob();
    Deno.env.delete("FGP_SALT");

    const originalConsoleError = console.error;
    console.error = () => {};

    try {
      const res = await app.request(`/${blob}/v1/x`, {
        headers: { "X-FGP-Key": CLIENT_KEY },
      });

      const bodyText = await res.text();
      assertEquals(bodyText.includes("FGP_SALT"), false);
      assertEquals(bodyText.includes("Server misconfigured"), false);
      assertEquals(bodyText.includes("at "), false);
      assertEquals(bodyText.includes("Error:"), false);

      for (const [, value] of res.headers) {
        assertEquals(value.includes("FGP_SALT"), false);
        assertEquals(value.includes("Server misconfigured"), false);
      }
    } finally {
      console.error = originalConsoleError;
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});
