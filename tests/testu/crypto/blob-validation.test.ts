import { assertEquals, assertRejects } from "@std/assert";
import {
  BlobConfig,
  BlobPolicyError,
  decryptBlob,
  encryptBlob,
  isExpired,
} from "../../../src/crypto/blob.ts";

const CLIENT_KEY = "validation-test-key-padding-";
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

Deno.test("AC-1.6: decrypt accepts blob with v: 3 and string scopes", async () => {
  const raw = makeConfig({ v: 3 });
  const blob = await encryptRaw(raw);

  const config = await decryptBlob(blob, CLIENT_KEY, SERVER_SALT);
  assertEquals(config.v, 3);
});

Deno.test("AC-1.6: decrypt accepts blob with v: 3 and ScopeEntry scopes", async () => {
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

Deno.test("AC-5.17: decrypt accepts blob with valid regex ObjectValue", async () => {
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

Deno.test("decrypt rejects blob with regex exceeding 200 chars (code dedie)", async () => {
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
  const err = await assertRejects(() => decryptBlob(blob, CLIENT_KEY, SERVER_SALT));
  assertEquals(err instanceof BlobPolicyError, true);
});

Deno.test("AC-5.19: decrypt rejects blob with invalid regex pattern", async () => {
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

  const err = await assertRejects(() => decryptBlob(blob, CLIENT_KEY, SERVER_SALT));
  assertEquals(err instanceof BlobPolicyError, true);
});

Deno.test("AC-6.1: decrypt rejects blob with deeply nested and exceeding depth limit", async () => {
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

Deno.test("decrypt rejects blob with v: 5", async () => {
  const raw = makeConfig({ v: 5 });
  const blob = await encryptRaw(raw);

  await assertRejects(
    () => decryptBlob(blob, CLIENT_KEY, SERVER_SALT),
    Error,
    "malformed BlobConfig",
  );
});

Deno.test("decrypt accepts a v4 blob with a string auth", async () => {
  const blob = await encryptRaw(makeConfig({ v: 4 }));
  const config = await decryptBlob(blob, CLIENT_KEY, SERVER_SALT);
  assertEquals(config.v, 4);
  assertEquals(config.auth, "bearer");
});

// --- isExpired boundary ---

Deno.test("AC-2.4: isExpired at exact boundary (now === createdAt + ttl) returns false", () => {
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

Deno.test("AC-6.1: decrypt rejects blob with nesting depth > 4 (not chain)", async () => {
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

Deno.test("AC-6.6: decrypt rejects not(wildcard)", async () => {
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

Deno.test("AC-6.7: decrypt rejects not(not(...))", async () => {
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

Deno.test("AC-6.8: decrypt rejects and with empty array", async () => {
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

Deno.test("AC-6.9: decrypt rejects and with single element", async () => {
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

Deno.test("AC-6.2: decrypt rejects scope with more than 8 body filters", async () => {
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

Deno.test("AC-6.3: decrypt rejects filter with more than 16 OR values", async () => {
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

Deno.test("AC-6.5: decrypt rejects dot-path with more than 6 segments", async () => {
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

Deno.test("AC-6.4: decrypt rejects blob with more than 10 structured scopes", async () => {
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

// --- ADR-0009 etape 2 : forme du target verifiee au dechiffrement ---

Deno.test("AC-43.9: blob avec un target portant un fragment est rejete", async () => {
  const blob = await encryptRaw(makeConfig({ target: "https://api.example.com/#" }));
  await assertRejects(
    () => decryptBlob(blob, CLIENT_KEY, SERVER_SALT),
    Error,
    "malformed BlobConfig",
  );
});

Deno.test("AC-43.10: blob avec un target file:// est rejete", async () => {
  const blob = await encryptRaw(makeConfig({ target: "file:///etc/passwd" }));
  await assertRejects(
    () => decryptBlob(blob, CLIENT_KEY, SERVER_SALT),
    Error,
    "malformed BlobConfig",
  );
});

Deno.test("AC-43.11: blob avec un target portant un userinfo est rejete", async () => {
  const blob = await encryptRaw(makeConfig({ target: "https://user:pw@api.example.com" }));
  await assertRejects(
    () => decryptBlob(blob, CLIENT_KEY, SERVER_SALT),
    Error,
    "malformed BlobConfig",
  );
});

Deno.test("AC-43.12: un target avec chemin de base legitime reste accepte", async () => {
  const blob = await encryptRaw(makeConfig({ target: "https://api.example.com/base" }));
  const config = await decryptBlob(blob, CLIENT_KEY, SERVER_SALT);
  assertEquals(config.target, "https://api.example.com/base");
});

// --- ADR-0010 lot 2 : plafonds verifies au dechiffrement, pas seulement a la generation.
// Les blobs sont forges directement avec encryptBlob : le salt etant public, c'est ainsi
// qu'un attaquant procede, et c'est donc le seul chemin qui protege reellement.

function scopeWith(objectValue: unknown[]) {
  return [{
    methods: ["POST"],
    pattern: "/v1/x",
    bodyFilters: [{ objectPath: "a", objectValue }],
  }];
}

Deno.test("AC-48.11: un blob avec 5 valeurs regex est refuse, 4 passe", async () => {
  const four = scopeWith(Array.from({ length: 4 }, () => ({ type: "regex", value: "^a$" })));
  const okBlob = await encryptRaw(makeConfig({ v: 3, scopes: four as never }));
  assertEquals((await decryptBlob(okBlob, CLIENT_KEY, SERVER_SALT)).v, 3);

  const five = scopeWith(Array.from({ length: 5 }, () => ({ type: "regex", value: "^a$" })));
  const koBlob = await encryptRaw(makeConfig({ v: 3, scopes: five as never }));
  await assertRejects(
    () => decryptBlob(koBlob, CLIENT_KEY, SERVER_SALT),
    Error,
    "malformed BlobConfig",
  );
});

Deno.test("AC-48.12: un 'and' de 9 elements est refuse", async () => {
  const wide = scopeWith([{
    type: "and",
    value: Array.from({ length: 9 }, (_, i) => ({ type: "any", value: `v${i}` })),
  }]);
  const blob = await encryptRaw(makeConfig({ v: 3, scopes: wide as never }));
  await assertRejects(
    () => decryptBlob(blob, CLIENT_KEY, SERVER_SALT),
    Error,
    "malformed BlobConfig",
  );
});

Deno.test("AC-48.13: un blob de plus de 256 ObjectValue est refuse", async () => {
  const many = scopeWith(Array.from({ length: 257 }, (_, i) => ({ type: "any", value: `v${i}` })));
  const blob = await encryptRaw(makeConfig({ v: 3, scopes: many as never }));
  await assertRejects(
    () => decryptBlob(blob, CLIENT_KEY, SERVER_SALT),
    Error,
    "malformed BlobConfig",
  );
});

Deno.test("AC-48.14: un 'any' sur objet ou tableau est refuse au dechiffrement", async () => {
  for (const value of [{ a: 1 }, [1, 2]]) {
    const blob = await encryptRaw(
      makeConfig({ v: 3, scopes: scopeWith([{ type: "any", value }]) as never }),
    );
    await assertRejects(
      () => decryptBlob(blob, CLIENT_KEY, SERVER_SALT),
      Error,
      "malformed BlobConfig",
    );
  }
  // les scalaires restent acceptes
  for (const value of ["s", 1, true, null]) {
    const blob = await encryptRaw(
      makeConfig({ v: 3, scopes: scopeWith([{ type: "any", value }]) as never }),
    );
    assertEquals((await decryptBlob(blob, CLIENT_KEY, SERVER_SALT)).v, 3);
  }
});

Deno.test("AC-48.15: une regex hors dialecte est refusee avec un code dedie", async () => {
  const blob = await encryptRaw(
    makeConfig({ v: 3, scopes: scopeWith([{ type: "regex", value: "^(a+)+$" }]) as never }),
  );
  // Pas « malformed BlobConfig » : un 401 invalid_credentials enverrait le porteur
  // verifier sa cle alors que le probleme est dans son motif.
  const err = await assertRejects(() => decryptBlob(blob, CLIENT_KEY, SERVER_SALT));
  assertEquals(err instanceof BlobPolicyError, true);
  assertEquals((err as BlobPolicyError).code, "unsupported_regex");
});
