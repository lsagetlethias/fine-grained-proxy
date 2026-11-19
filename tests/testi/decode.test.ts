import { test } from "node:test";

import { assertEquals } from "../_assert.ts";
import { encryptBlob } from "../../src/crypto/blob.ts";
import { app } from "../../src/main.ts";
import type { ScopeEntry } from "../../src/middleware/scopes.ts";

const SERVER_SALT = "test-decode-salt";
const CLIENT_KEY = "test-client-key-decode-paddi";

function setup() {
  process.env.FGP_SALT = SERVER_SALT;
  process.env.FGP_EGRESS_ALLOW_PRIVATE = "1";
}

function teardown() {
  delete process.env.FGP_SALT;
  delete process.env.FGP_EGRESS_ALLOW_PRIVATE;
}

function postDecode(body: unknown) {
  return app.request("/api/decode", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("AC-16.1: Decode, config complète avec token redacté", async () => {
  setup();
  try {
    const blob = await encryptBlob(
      {
        v: 2,
        token: "tk-us-abcdefghijklmnop",
        target: "https://api.mock.local",
        auth: "bearer",
        scopes: ["GET:/v1/apps/*"],
        ttl: 3600,
        createdAt: Math.floor(Date.now() / 1000),
      },
      CLIENT_KEY,
      SERVER_SALT,
    );

    const res = await postDecode({ blob, key: CLIENT_KEY });
    const body = await res.json();

    assertEquals(res.status, 200);
    assertEquals(body.target, "https://api.mock.local");
    assertEquals(body.auth, "bearer");
    assertEquals(body.scopes, ["GET:/v1/apps/*"]);
    assertEquals(body.ttl, 3600);
    assertEquals(body.version, 2);
    assertEquals(body.tokenRedacted.slice(-4), "mnop");
    assertEquals(body.tokenRedacted.includes("*"), true);
    assertEquals(body.tokenRedacted.length, "tk-us-abcdefghijklmnop".length);
  } finally {
    teardown();
  }
});

test("AC-16.2: Decode, mauvaise clé retourne 401", async () => {
  setup();
  try {
    const blob = await encryptBlob(
      {
        v: 2,
        token: "tk-us-abcdefghijklmnop",
        target: "https://api.mock.local",
        auth: "bearer",
        scopes: ["GET:/v1/apps/*"],
        ttl: 3600,
        createdAt: Math.floor(Date.now() / 1000),
      },
      CLIENT_KEY,
      SERVER_SALT,
    );

    const res = await postDecode({ blob, key: "wrong-key" });
    const body = await res.json();

    assertEquals(res.status, 401);
    assertEquals(body.error, "invalid_credentials");
  } finally {
    teardown();
  }
});

test("AC-16.3: Decode, blob corrompu retourne 401", async () => {
  setup();
  try {
    const res = await postDecode({ blob: "invalid-garbage", key: "any-key" });
    const body = await res.json();

    assertEquals(res.status, 401);
    assertEquals(body.error, "invalid_credentials");
  } finally {
    teardown();
  }
});

test("AC-16.4: Decode, body invalide retourne 400 (blob manquant)", async () => {
  setup();
  try {
    const res = await postDecode({ key: "some-key" });
    const body = await res.json();

    assertEquals(res.status, 400);
    assertEquals(body.error, "invalid_body");
  } finally {
    teardown();
  }
});

test("AC-16.4: Decode, body invalide retourne 400 (key manquant)", async () => {
  setup();
  try {
    const res = await postDecode({ blob: "some-blob" });
    const body = await res.json();

    assertEquals(res.status, 400);
    assertEquals(body.error, "invalid_body");
  } finally {
    teardown();
  }
});

test("AC-16.5: Decode, blob v3 avec scopes structurés", async () => {
  setup();
  try {
    const scopeEntry: ScopeEntry = {
      methods: ["POST"],
      pattern: "/v1/apps/*/deployments",
      bodyFilters: [
        {
          objectPath: "deployment.git_ref",
          objectValue: [{ type: "any", value: "main" }],
        },
      ],
    };

    const blob = await encryptBlob(
      {
        v: 3,
        token: "tk-us-structured-scope-token",
        target: "https://api.mock.local",
        auth: "bearer",
        scopes: [scopeEntry],
        ttl: 7200,
        createdAt: Math.floor(Date.now() / 1000),
      },
      CLIENT_KEY,
      SERVER_SALT,
    );

    const res = await postDecode({ blob, key: CLIENT_KEY });
    const body = await res.json();

    assertEquals(res.status, 200);
    assertEquals(body.version, 3);
    assertEquals(body.scopes.length, 1);
    assertEquals(body.scopes[0].methods, ["POST"]);
    assertEquals(body.scopes[0].pattern, "/v1/apps/*/deployments");
    assertEquals(body.scopes[0].bodyFilters.length, 1);
    assertEquals(body.scopes[0].bodyFilters[0].objectPath, "deployment.git_ref");
    assertEquals(body.ttl, 7200);
  } finally {
    teardown();
  }
});

test('AC-16.6: Decode, token court (< 4 chars) retourne "****"', async () => {
  setup();
  try {
    const blob = await encryptBlob(
      {
        v: 2,
        token: "abc",
        target: "https://api.mock.local",
        auth: "bearer",
        scopes: ["GET:/v1/apps/*"],
        ttl: 3600,
        createdAt: Math.floor(Date.now() / 1000),
      },
      CLIENT_KEY,
      SERVER_SALT,
    );

    const res = await postDecode({ blob, key: CLIENT_KEY });
    const body = await res.json();

    assertEquals(res.status, 200);
    assertEquals(body.tokenRedacted, "****");
  } finally {
    teardown();
  }
});
