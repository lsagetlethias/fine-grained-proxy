import { assertEquals, assertRejects } from "@std/assert";
import { BlobConfig, decryptBlob, encryptBlob, isExpired } from "../../../src/crypto/blob.ts";

const CLIENT_KEY = "validation-test-key";
const SERVER_SALT = "validation-test-salt";

function makeConfig(overrides?: Partial<BlobConfig>): BlobConfig {
  return {
    v: 2,
    token: "tk-us-abcdef1234567890",
    target: "https://api.example.com",
    auth: "bearer",
    scopes: ["GET:/v1/apps/*"],
    ttl: 3600,
    createdAt: Math.floor(Date.now() / 1000),
    ...overrides,
  };
}

async function encryptRaw(data: unknown): Promise<string> {
  return await encryptBlob(data as BlobConfig, CLIENT_KEY, SERVER_SALT);
}

// --- BlobConfig validation in decryptBlob ---

Deno.test("decrypt rejects blob with missing token field", async () => {
  const config = makeConfig();
  const raw = { ...config, token: undefined };
  const blob = await encryptRaw(raw);

  await assertRejects(
    () => decryptBlob(blob, CLIENT_KEY, SERVER_SALT),
    Error,
    "malformed BlobConfig",
  );
});

Deno.test("decrypt rejects blob with missing scopes field", async () => {
  const config = makeConfig();
  const raw = { ...config, scopes: undefined };
  const blob = await encryptRaw(raw);

  await assertRejects(
    () => decryptBlob(blob, CLIENT_KEY, SERVER_SALT),
    Error,
    "malformed BlobConfig",
  );
});

Deno.test("decrypt rejects blob with non-string items in scopes", async () => {
  const config = makeConfig();
  const raw = { ...config, scopes: [123, true] };
  const blob = await encryptRaw(raw);

  await assertRejects(
    () => decryptBlob(blob, CLIENT_KEY, SERVER_SALT),
    Error,
    "malformed BlobConfig",
  );
});

Deno.test("decrypt rejects blob with missing target field", async () => {
  const config = makeConfig();
  const raw = { ...config, target: undefined };
  const blob = await encryptRaw(raw);

  await assertRejects(
    () => decryptBlob(blob, CLIENT_KEY, SERVER_SALT),
    Error,
    "malformed BlobConfig",
  );
});

Deno.test("decrypt rejects blob with non-number ttl", async () => {
  const config = makeConfig();
  const raw = { ...config, ttl: "3600" };
  const blob = await encryptRaw(raw);

  await assertRejects(
    () => decryptBlob(blob, CLIENT_KEY, SERVER_SALT),
    Error,
    "malformed BlobConfig",
  );
});

Deno.test("decrypt rejects blob with non-number createdAt", async () => {
  const config = makeConfig();
  const raw = { ...config, createdAt: "2024-01-01" };
  const blob = await encryptRaw(raw);

  await assertRejects(
    () => decryptBlob(blob, CLIENT_KEY, SERVER_SALT),
    Error,
    "malformed BlobConfig",
  );
});

Deno.test("decrypt rejects blob with v: 0", async () => {
  const raw = makeConfig({ v: 0 });
  const blob = await encryptRaw(raw);

  await assertRejects(
    () => decryptBlob(blob, CLIENT_KEY, SERVER_SALT),
    Error,
    "malformed BlobConfig",
  );
});

Deno.test("decrypt rejects blob with v: 3", async () => {
  const raw = makeConfig({ v: 3 });
  const blob = await encryptRaw(raw);

  await assertRejects(
    () => decryptBlob(blob, CLIENT_KEY, SERVER_SALT),
    Error,
    "malformed BlobConfig",
  );
});

// --- isExpired boundary ---

Deno.test("isExpired at exact boundary (now === createdAt + ttl) returns false", () => {
  const createdAt = 1712534400;
  const ttl = 86400;
  const origNow = Date.now;
  Date.now = () => (createdAt + ttl) * 1000;

  const config = makeConfig({ createdAt, ttl });
  assertEquals(isExpired(config), false);

  Date.now = origNow;
});

Deno.test("isExpired one ms after boundary returns true", () => {
  const createdAt = 1712534400;
  const ttl = 86400;
  const origNow = Date.now;
  Date.now = () => (createdAt + ttl) * 1000 + 1;

  const config = makeConfig({ createdAt, ttl });
  assertEquals(isExpired(config), true);

  Date.now = origNow;
});

// --- Round-trip with header:CustomName auth ---

Deno.test("round-trip preserves header: prefix with various header names", async () => {
  for (const headerName of ["header:Authorization", "header:X-Custom", "header:Api-Token"]) {
    const config = makeConfig({ auth: headerName });
    const blob = await encryptBlob(config, CLIENT_KEY, SERVER_SALT);
    const result = await decryptBlob(blob, CLIENT_KEY, SERVER_SALT);
    assertEquals(result.auth, headerName);
  }
});

// --- Blob with empty string token ---

Deno.test("decrypt rejects blob with empty string token", async () => {
  const config = makeConfig({ token: "" });
  const blob = await encryptBlob(config, CLIENT_KEY, SERVER_SALT);

  await assertRejects(
    () => decryptBlob(blob, CLIENT_KEY, SERVER_SALT),
    Error,
    "malformed BlobConfig",
  );
});
