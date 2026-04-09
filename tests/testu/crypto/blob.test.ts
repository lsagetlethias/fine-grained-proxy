import { assertEquals, assertRejects } from "@std/assert";
import { BlobConfig, decryptBlob, encryptBlob, isExpired } from "../../../src/crypto/blob.ts";

const CLIENT_KEY = "test-client-key-2024";
const SERVER_SALT = "test-server-salt-xyz";

function makeConfig(overrides?: Partial<BlobConfig>): BlobConfig {
  return {
    v: 2,
    token: "tk-us-abcdef1234567890",
    target: "https://api.example.com",
    auth: "bearer",
    scopes: ["GET:/v1/apps/*", "POST:/v1/apps/my-app/scale"],
    ttl: 3600,
    createdAt: Math.floor(Date.now() / 1000),
    ...overrides,
  };
}

Deno.test("AC-14.1: encrypt then decrypt returns the same object", async () => {
  const config = makeConfig();
  const blob = await encryptBlob(config, CLIENT_KEY, SERVER_SALT);
  const result = await decryptBlob(blob, CLIENT_KEY, SERVER_SALT);

  assertEquals(result.v, 2);
  assertEquals(result.token, config.token);
  assertEquals(result.target, config.target);
  assertEquals(result.auth, config.auth);
  assertEquals(result.scopes, config.scopes);
  assertEquals(result.ttl, config.ttl);
  assertEquals(result.createdAt, config.createdAt);
});

Deno.test("AC-14.2: decrypt with wrong key throws", async () => {
  const config = makeConfig();
  const blob = await encryptBlob(config, CLIENT_KEY, SERVER_SALT);

  await assertRejects(
    () => decryptBlob(blob, "wrong-key", SERVER_SALT),
    Error,
    "Decryption failed",
  );
});

Deno.test("AC-1.3: decrypt with corrupted blob throws", async () => {
  await assertRejects(
    () => decryptBlob("not-a-valid-blob!!!", CLIENT_KEY, SERVER_SALT),
    Error,
  );
});

Deno.test("AC-1.3: decrypt with truncated blob throws", async () => {
  const config = makeConfig();
  const blob = await encryptBlob(config, CLIENT_KEY, SERVER_SALT);
  const truncated = blob.slice(0, 10);

  await assertRejects(
    () => decryptBlob(truncated, CLIENT_KEY, SERVER_SALT),
    Error,
  );
});

Deno.test("AC-2.2: isExpired returns true when TTL has passed", () => {
  const config = makeConfig({
    createdAt: Math.floor(Date.now() / 1000) - 7200,
    ttl: 3600,
  });
  assertEquals(isExpired(config), true);
});

Deno.test("AC-2.1: isExpired returns false when TTL is still valid", () => {
  const config = makeConfig({
    createdAt: Math.floor(Date.now() / 1000),
    ttl: 3600,
  });
  assertEquals(isExpired(config), false);
});

Deno.test("AC-2.3: isExpired returns false when TTL is 0 (no expiration)", () => {
  const config = makeConfig({
    createdAt: Math.floor(Date.now() / 1000) - 999999,
    ttl: 0,
  });
  assertEquals(isExpired(config), false);
});

Deno.test("round-trip with varied scopes and long token", async () => {
  const config = makeConfig({
    token: "tk-us-" + "x".repeat(500),
    scopes: ["*:*", "GET:/v1/apps/*", "POST:/v1/apps/my-app/scale"],
    ttl: 86400,
  });

  const blob = await encryptBlob(config, CLIENT_KEY, SERVER_SALT);
  const result = await decryptBlob(blob, CLIENT_KEY, SERVER_SALT);

  assertEquals(result.token, config.token);
  assertEquals(result.scopes, config.scopes);
  assertEquals(result.ttl, config.ttl);
});

Deno.test("round-trip with empty scopes array", async () => {
  const config = makeConfig({ scopes: [] });

  const blob = await encryptBlob(config, CLIENT_KEY, SERVER_SALT);
  const result = await decryptBlob(blob, CLIENT_KEY, SERVER_SALT);

  assertEquals(result.scopes, []);
});

Deno.test("AC-14.3: decrypt with wrong salt throws", async () => {
  const config = makeConfig();
  const blob = await encryptBlob(config, CLIENT_KEY, SERVER_SALT);

  await assertRejects(
    () => decryptBlob(blob, CLIENT_KEY, "wrong-salt"),
    Error,
    "Decryption failed",
  );
});

Deno.test("AC-14.4: two encryptions of same config produce different blobs (unique IV)", async () => {
  const config = makeConfig();
  const blob1 = await encryptBlob(config, CLIENT_KEY, SERVER_SALT);
  const blob2 = await encryptBlob(config, CLIENT_KEY, SERVER_SALT);

  assertEquals(blob1 !== blob2, true);

  const result1 = await decryptBlob(blob1, CLIENT_KEY, SERVER_SALT);
  const result2 = await decryptBlob(blob2, CLIENT_KEY, SERVER_SALT);
  assertEquals(result1.token, result2.token);
  assertEquals(result1.scopes, result2.scopes);
});

Deno.test("decrypt rejects blob with v !== 2", async () => {
  const config = makeConfig({ v: 1 });
  const blob = await encryptBlob(config as BlobConfig, CLIENT_KEY, SERVER_SALT);

  await assertRejects(
    () => decryptBlob(blob, CLIENT_KEY, SERVER_SALT),
    Error,
    "malformed BlobConfig",
  );
});

Deno.test("decrypt rejects blob with empty target", async () => {
  const config = makeConfig({ target: "" });
  const blob = await encryptBlob(config, CLIENT_KEY, SERVER_SALT);

  await assertRejects(
    () => decryptBlob(blob, CLIENT_KEY, SERVER_SALT),
    Error,
    "malformed BlobConfig",
  );
});

Deno.test("decrypt rejects blob with empty auth", async () => {
  const config = makeConfig({ auth: "" });
  const blob = await encryptBlob(config, CLIENT_KEY, SERVER_SALT);

  await assertRejects(
    () => decryptBlob(blob, CLIENT_KEY, SERVER_SALT),
    Error,
    "malformed BlobConfig",
  );
});

Deno.test("round-trip with all auth modes", async () => {
  for (const auth of ["bearer", "basic", "scalingo-exchange", "header:X-API-Key"]) {
    const config = makeConfig({ auth });
    const blob = await encryptBlob(config, CLIENT_KEY, SERVER_SALT);
    const result = await decryptBlob(blob, CLIENT_KEY, SERVER_SALT);
    assertEquals(result.auth, auth);
  }
});
