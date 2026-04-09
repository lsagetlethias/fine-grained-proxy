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

Deno.test("decrypt accepts blob with v: 3 and string scopes", async () => {
  const raw = makeConfig({ v: 3 });
  const blob = await encryptRaw(raw);

  const config = await decryptBlob(blob, CLIENT_KEY, SERVER_SALT);
  assertEquals(config.v, 3);
});

Deno.test("decrypt accepts blob with v: 3 and ScopeEntry scopes", async () => {
  const raw = makeConfig({
    v: 3,
    scopes: [
      "GET:/v1/apps/*",
      { methods: ["POST"], pattern: "/v1/apps/my-app/deployments" },
    ],
  });
  const blob = await encryptRaw(raw);

  const config = await decryptBlob(blob, CLIENT_KEY, SERVER_SALT);
  assertEquals(config.v, 3);
  assertEquals(config.scopes.length, 2);
});

Deno.test("decrypt rejects blob with v: 3 and malformed bodyFilters content", async () => {
  const raw = makeConfig({
    v: 3,
    scopes: [
      { methods: ["POST"], pattern: "/v1/apps/*", bodyFilters: [42, "garbage"] as unknown[] },
    ] as unknown as BlobConfig["scopes"],
  });
  const blob = await encryptRaw(raw);

  await assertRejects(
    () => decryptBlob(blob, CLIENT_KEY, SERVER_SALT),
    Error,
    "malformed BlobConfig",
  );
});

Deno.test("decrypt rejects blob with v: 3 and bodyFilter missing objectPath", async () => {
  const raw = makeConfig({
    v: 3,
    scopes: [
      {
        methods: ["POST"],
        pattern: "/v1/apps/*",
        bodyFilters: [{ objectValue: [{ type: "wildcard" }] }] as unknown[],
      },
    ] as unknown as BlobConfig["scopes"],
  });
  const blob = await encryptRaw(raw);

  await assertRejects(
    () => decryptBlob(blob, CLIENT_KEY, SERVER_SALT),
    Error,
    "malformed BlobConfig",
  );
});

Deno.test("decrypt rejects blob with v: 3 and unknown ObjectValue type", async () => {
  const raw = makeConfig({
    v: 3,
    scopes: [
      {
        methods: ["POST"],
        pattern: "/v1/apps/*",
        bodyFilters: [{
          objectPath: "field",
          objectValue: [{ type: "unknown_type", value: ".*" }] as unknown[],
        }] as unknown[],
      },
    ] as unknown as BlobConfig["scopes"],
  });
  const blob = await encryptRaw(raw);

  await assertRejects(
    () => decryptBlob(blob, CLIENT_KEY, SERVER_SALT),
    Error,
    "malformed BlobConfig",
  );
});

Deno.test("decrypt accepts blob with valid regex ObjectValue", async () => {
  const raw = makeConfig({
    v: 3,
    scopes: [{
      methods: ["POST"],
      pattern: "/v1/test",
      bodyFilters: [{
        objectPath: "ref",
        objectValue: [{ type: "regex", value: "^release\\/v\\d+" }],
      }],
    }] as unknown as BlobConfig["scopes"],
  });
  const blob = await encryptRaw(raw);
  const config = await decryptBlob(blob, CLIENT_KEY, SERVER_SALT);
  assertEquals(config.v, 3);
});

Deno.test("decrypt rejects blob with regex exceeding 200 chars", async () => {
  const longRegex = "a".repeat(201);
  const raw = makeConfig({
    v: 3,
    scopes: [{
      methods: ["POST"],
      pattern: "/v1/test",
      bodyFilters: [{
        objectPath: "ref",
        objectValue: [{ type: "regex", value: longRegex }],
      }],
    }] as unknown as BlobConfig["scopes"],
  });
  const blob = await encryptRaw(raw);
  await assertRejects(
    () => decryptBlob(blob, CLIENT_KEY, SERVER_SALT),
    Error,
    "malformed BlobConfig",
  );
});

Deno.test("decrypt rejects blob with invalid regex pattern", async () => {
  const raw = makeConfig({
    v: 3,
    scopes: [{
      methods: ["POST"],
      pattern: "/v1/test",
      bodyFilters: [{
        objectPath: "ref",
        objectValue: [{ type: "regex", value: "[invalid(" }],
      }],
    }] as unknown as BlobConfig["scopes"],
  });
  const blob = await encryptRaw(raw);
  await assertRejects(
    () => decryptBlob(blob, CLIENT_KEY, SERVER_SALT),
    Error,
    "malformed BlobConfig",
  );
});

Deno.test("decrypt rejects blob with deeply nested and exceeding depth limit", async () => {
  let nested: unknown = { type: "wildcard" };
  for (let i = 0; i < 15; i++) {
    nested = { type: "and", value: [nested] };
  }
  const raw = makeConfig({
    v: 3,
    scopes: [
      {
        methods: ["POST"],
        pattern: "/v1/apps/*",
        bodyFilters: [{
          objectPath: "field",
          objectValue: [nested] as unknown[],
        }] as unknown[],
      },
    ] as unknown as BlobConfig["scopes"],
  });
  const blob = await encryptRaw(raw);

  await assertRejects(
    () => decryptBlob(blob, CLIENT_KEY, SERVER_SALT),
    Error,
    "malformed BlobConfig",
  );
});

Deno.test("decrypt rejects blob with v: 4", async () => {
  const raw = makeConfig({ v: 4 });
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

// --- Limits: depth max 4 ---

Deno.test("decrypt rejects blob with nesting depth > 4 (not chain)", async () => {
  let nested: unknown = { type: "any", value: "x" };
  for (let i = 0; i < 5; i++) {
    nested = { type: "and", value: [nested, { type: "any", value: "y" }] };
  }
  const raw = makeConfig({
    v: 3,
    scopes: [{
      methods: ["POST"],
      pattern: "/v1/test",
      bodyFilters: [{ objectPath: "f", objectValue: [nested] as unknown[] }] as unknown[],
    }] as unknown as BlobConfig["scopes"],
  });
  const blob = await encryptRaw(raw);
  await assertRejects(
    () => decryptBlob(blob, CLIENT_KEY, SERVER_SALT),
    Error,
    "malformed BlobConfig",
  );
});

Deno.test("decrypt accepts blob with nesting depth exactly 4", async () => {
  const nested = {
    type: "and",
    value: [
      {
        type: "and",
        value: [
          {
            type: "and",
            value: [
              { type: "any", value: "a" },
              { type: "any", value: "b" },
            ],
          },
          { type: "any", value: "c" },
        ],
      },
      { type: "any", value: "d" },
    ],
  };
  const raw = makeConfig({
    v: 3,
    scopes: [{
      methods: ["POST"],
      pattern: "/v1/test",
      bodyFilters: [{ objectPath: "f", objectValue: [nested] }],
    }] as unknown as BlobConfig["scopes"],
  });
  const blob = await encryptRaw(raw);
  const config = await decryptBlob(blob, CLIENT_KEY, SERVER_SALT);
  assertEquals(config.v, 3);
});

// --- Limits: forbidden combinations ---

Deno.test("decrypt rejects not(wildcard)", async () => {
  const raw = makeConfig({
    v: 3,
    scopes: [{
      methods: ["POST"],
      pattern: "/v1/test",
      bodyFilters: [{
        objectPath: "f",
        objectValue: [{ type: "not", value: { type: "wildcard" } }],
      }],
    }] as unknown as BlobConfig["scopes"],
  });
  const blob = await encryptRaw(raw);
  await assertRejects(
    () => decryptBlob(blob, CLIENT_KEY, SERVER_SALT),
    Error,
    "malformed BlobConfig",
  );
});

Deno.test("decrypt rejects not(not(...))", async () => {
  const raw = makeConfig({
    v: 3,
    scopes: [{
      methods: ["POST"],
      pattern: "/v1/test",
      bodyFilters: [{
        objectPath: "f",
        objectValue: [{ type: "not", value: { type: "not", value: { type: "any", value: "x" } } }],
      }],
    }] as unknown as BlobConfig["scopes"],
  });
  const blob = await encryptRaw(raw);
  await assertRejects(
    () => decryptBlob(blob, CLIENT_KEY, SERVER_SALT),
    Error,
    "malformed BlobConfig",
  );
});

Deno.test("decrypt rejects and with empty array", async () => {
  const raw = makeConfig({
    v: 3,
    scopes: [{
      methods: ["POST"],
      pattern: "/v1/test",
      bodyFilters: [{
        objectPath: "f",
        objectValue: [{ type: "and", value: [] }],
      }],
    }] as unknown as BlobConfig["scopes"],
  });
  const blob = await encryptRaw(raw);
  await assertRejects(
    () => decryptBlob(blob, CLIENT_KEY, SERVER_SALT),
    Error,
    "malformed BlobConfig",
  );
});

Deno.test("decrypt rejects and with single element", async () => {
  const raw = makeConfig({
    v: 3,
    scopes: [{
      methods: ["POST"],
      pattern: "/v1/test",
      bodyFilters: [{
        objectPath: "f",
        objectValue: [{ type: "and", value: [{ type: "any", value: "x" }] }],
      }],
    }] as unknown as BlobConfig["scopes"],
  });
  const blob = await encryptRaw(raw);
  await assertRejects(
    () => decryptBlob(blob, CLIENT_KEY, SERVER_SALT),
    Error,
    "malformed BlobConfig",
  );
});

// --- Limits: body filters per scope ---

Deno.test("decrypt rejects scope with more than 8 body filters", async () => {
  const filters = [];
  for (let i = 0; i < 9; i++) {
    filters.push({ objectPath: "field" + i, objectValue: [{ type: "wildcard" }] });
  }
  const raw = makeConfig({
    v: 3,
    scopes: [{
      methods: ["POST"],
      pattern: "/v1/test",
      bodyFilters: filters,
    }] as unknown as BlobConfig["scopes"],
  });
  const blob = await encryptRaw(raw);
  await assertRejects(
    () => decryptBlob(blob, CLIENT_KEY, SERVER_SALT),
    Error,
    "malformed BlobConfig",
  );
});

Deno.test("decrypt accepts scope with exactly 8 body filters", async () => {
  const filters = [];
  for (let i = 0; i < 8; i++) {
    filters.push({ objectPath: "field" + i, objectValue: [{ type: "wildcard" }] });
  }
  const raw = makeConfig({
    v: 3,
    scopes: [{
      methods: ["POST"],
      pattern: "/v1/test",
      bodyFilters: filters,
    }] as unknown as BlobConfig["scopes"],
  });
  const blob = await encryptRaw(raw);
  const config = await decryptBlob(blob, CLIENT_KEY, SERVER_SALT);
  assertEquals(config.v, 3);
});

// --- Limits: OR values per filter ---

Deno.test("decrypt rejects filter with more than 16 OR values", async () => {
  const values = [];
  for (let i = 0; i < 17; i++) {
    values.push({ type: "any", value: "val" + i });
  }
  const raw = makeConfig({
    v: 3,
    scopes: [{
      methods: ["POST"],
      pattern: "/v1/test",
      bodyFilters: [{ objectPath: "f", objectValue: values }],
    }] as unknown as BlobConfig["scopes"],
  });
  const blob = await encryptRaw(raw);
  await assertRejects(
    () => decryptBlob(blob, CLIENT_KEY, SERVER_SALT),
    Error,
    "malformed BlobConfig",
  );
});

Deno.test("decrypt accepts filter with exactly 16 OR values", async () => {
  const values = [];
  for (let i = 0; i < 16; i++) {
    values.push({ type: "any", value: "val" + i });
  }
  const raw = makeConfig({
    v: 3,
    scopes: [{
      methods: ["POST"],
      pattern: "/v1/test",
      bodyFilters: [{ objectPath: "f", objectValue: values }],
    }] as unknown as BlobConfig["scopes"],
  });
  const blob = await encryptRaw(raw);
  const config = await decryptBlob(blob, CLIENT_KEY, SERVER_SALT);
  assertEquals(config.v, 3);
});

// --- Limits: dot-path segments ---

Deno.test("decrypt rejects dot-path with more than 6 segments", async () => {
  const raw = makeConfig({
    v: 3,
    scopes: [{
      methods: ["POST"],
      pattern: "/v1/test",
      bodyFilters: [{
        objectPath: "a.b.c.d.e.f.g",
        objectValue: [{ type: "wildcard" }],
      }],
    }] as unknown as BlobConfig["scopes"],
  });
  const blob = await encryptRaw(raw);
  await assertRejects(
    () => decryptBlob(blob, CLIENT_KEY, SERVER_SALT),
    Error,
    "malformed BlobConfig",
  );
});

Deno.test("decrypt accepts dot-path with exactly 6 segments", async () => {
  const raw = makeConfig({
    v: 3,
    scopes: [{
      methods: ["POST"],
      pattern: "/v1/test",
      bodyFilters: [{
        objectPath: "a.b.c.d.e.f",
        objectValue: [{ type: "wildcard" }],
      }],
    }] as unknown as BlobConfig["scopes"],
  });
  const blob = await encryptRaw(raw);
  const config = await decryptBlob(blob, CLIENT_KEY, SERVER_SALT);
  assertEquals(config.v, 3);
});

// --- Limits: max 10 structured scopes ---

Deno.test("decrypt rejects blob with more than 10 structured scopes", async () => {
  const scopes = [];
  for (let i = 0; i < 11; i++) {
    scopes.push({ methods: ["GET"], pattern: "/v1/test/" + i });
  }
  const raw = makeConfig({ v: 3, scopes: scopes as unknown as BlobConfig["scopes"] });
  const blob = await encryptRaw(raw);
  await assertRejects(
    () => decryptBlob(blob, CLIENT_KEY, SERVER_SALT),
    Error,
    "malformed BlobConfig",
  );
});

Deno.test("decrypt accepts blob with exactly 10 structured scopes", async () => {
  const scopes = [];
  for (let i = 0; i < 10; i++) {
    scopes.push({ methods: ["GET"], pattern: "/v1/test/" + i });
  }
  const raw = makeConfig({ v: 3, scopes: scopes as unknown as BlobConfig["scopes"] });
  const blob = await encryptRaw(raw);
  const config = await decryptBlob(blob, CLIENT_KEY, SERVER_SALT);
  assertEquals(config.v, 3);
});
