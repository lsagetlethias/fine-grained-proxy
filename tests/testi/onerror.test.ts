import { test } from "node:test";

import { assertEquals } from "../_assert.ts";
import { app } from "../../src/main.ts";
import { encryptBlob } from "../../src/crypto/blob.ts";

const CLIENT_KEY = "onerror-test-key-padding-012";
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

test("AC-17.31: missing FGP_SALT triggers app.onError → 500 internal_error + X-FGP-Source: proxy", async () => {
  process.env.FGP_SALT = SERVER_SALT;
  process.env.FGP_EGRESS_ALLOW_PRIVATE = "1";
  const blob = await makeBlob();
  delete process.env.FGP_SALT;
  delete process.env.FGP_EGRESS_ALLOW_PRIVATE;

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
});

test("AC-17.32: app.onError does not leak original error message or stack", async () => {
  process.env.FGP_SALT = SERVER_SALT;
  const blob = await makeBlob();
  delete process.env.FGP_SALT;

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
});
