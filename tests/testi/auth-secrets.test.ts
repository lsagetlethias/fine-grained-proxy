import { assertEquals, assertStringIncludes } from "@std/assert";

import { app } from "../../src/main.ts";
import { decryptBlob } from "../../src/crypto/blob.ts";
import { decodePublicConfig } from "../../src/crypto/share.ts";

const SERVER_SALT = "auth-secrets-test-salt";

// Secrets reconnaissables : toute occurrence dans une reponse ou une URL est une fuite.
const HEADER_SECRET_A = "SECRET-AAA-1111-value";
const HEADER_SECRET_B = "SECRET-BBB-2222-value";
const ACCOUNT_TOKEN = "tk-us-SECRET-COMPTE-9999";
const CLIENT_KEY = "cle-de-ci-reconnaissable-42-xyz";

function setup() {
  Deno.env.set("FGP_SALT", SERVER_SALT);
}

function teardown() {
  Deno.env.delete("FGP_SALT");
}

async function generate(body: Record<string, unknown>): Promise<Response> {
  return await app.request("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const BASE = {
  target: "https://api.example.com",
  scopes: ["GET:/v2/resources"],
  ttl: 3600,
};

// --- AC-37.1 a AC-37.4 : redaction cote /api/decode ---

Deno.test({
  name:
    "AC-37.1: decode d'un blob headers, chaque valeur est redactee et aucune cle value ne subsiste",
  fn: async () => {
    setup();
    try {
      const gen = await generate({
        ...BASE,
        auth: {
          type: "headers",
          headers: [
            { name: "X-API-Key", value: HEADER_SECRET_A },
            { name: "X-Client-Id", value: HEADER_SECRET_B },
          ],
        },
      });
      const { blob, key } = await gen.json();
      assertEquals(gen.status, 200);

      const res = await app.request("/api/decode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blob, key }),
      });
      const decoded = await res.json();

      assertEquals(res.status, 200);
      assertEquals(decoded.auth.type, "headers");
      assertEquals(decoded.auth.headers.length, 2);

      for (const entry of decoded.auth.headers) {
        assertEquals(
          Object.hasOwn(entry, "value"),
          false,
          "une cle value subsiste dans la reponse",
        );
        assertEquals(typeof entry.valueRedacted, "string");
        assertStringIncludes(entry.valueRedacted, "*");
      }
      // Les noms de headers ne sont pas des secrets, ils restent lisibles.
      assertEquals(decoded.auth.headers[0].name, "X-API-Key");
      assertEquals(decoded.auth.headers[1].name, "X-Client-Id");
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-37.2: decode, aucune valeur de header en clair dans la reponse serialisee entiere",
  fn: async () => {
    setup();
    try {
      const gen = await generate({
        ...BASE,
        auth: {
          type: "headers",
          headers: [
            { name: "X-API-Key", value: HEADER_SECRET_A },
            { name: "X-Client-Id", value: HEADER_SECRET_B },
          ],
        },
      });
      const { blob, key } = await gen.json();

      const res = await app.request("/api/decode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blob, key }),
      });
      const raw = await res.text();

      for (const secret of [HEADER_SECRET_A, HEADER_SECRET_B]) {
        assertEquals(raw.includes(secret), false, `secret en clair dans /api/decode : ${secret}`);
        // Un prefixe suffisamment long fuiterait tout autant qu'une valeur complete.
        assertEquals(raw.includes(secret.slice(0, 12)), false, "prefixe de secret expose");
      }
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-37.3: decode d'un blob scalingo-addon, identifiants lisibles et token de compte masque",
  fn: async () => {
    setup();
    try {
      const gen = await generate({
        ...BASE,
        token: ACCOUNT_TOKEN,
        target: "https://db-api.osc-fr1.scalingo.com",
        auth: { type: "scalingo-addon", app: "mon-app", addonId: "ad-1111-2222" },
      });
      const { blob, key } = await gen.json();
      assertEquals(gen.status, 200);

      const res = await app.request("/api/decode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blob, key }),
      });
      const raw = await res.text();
      const decoded = JSON.parse(raw);

      // Identifiants d'infrastructure : necessaires pour re-editer la configuration.
      assertEquals(decoded.auth.app, "mon-app");
      assertEquals(decoded.auth.addonId, "ad-1111-2222");
      assertStringIncludes(decoded.tokenRedacted, "*");
      assertEquals(raw.includes(ACCOUNT_TOKEN), false, "token de compte en clair dans decode");
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-37.4: decode d'un blob v2, la shape de reponse reste inchangee",
  fn: async () => {
    setup();
    try {
      const gen = await generate({ ...BASE, token: "tk-legacy-1234", auth: "bearer" });
      const { blob, key } = await gen.json();

      const res = await app.request("/api/decode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blob, key }),
      });
      const decoded = await res.json();

      assertEquals(res.status, 200);
      assertEquals(decoded.auth, "bearer", "auth doit rester une string sur un blob v2");
      assertEquals(decoded.version, 2);
      assertStringIncludes(decoded.tokenRedacted, "1234");
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// --- AC-37.5 a AC-37.8, AC-37.12 : partage de configuration ---

Deno.test({
  name: "AC-37.5: share encode, les noms de headers survivent et les valeurs sont videes",
  fn: async () => {
    setup();
    try {
      const res = await app.request("/api/share/encode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...BASE,
          auth: {
            type: "headers",
            headers: [
              { name: "X-API-Key", value: "" },
              { name: "X-Client-Id", value: "" },
            ],
          },
        }),
      });
      const { encoded } = await res.json();
      assertEquals(res.status, 200);

      const config = await decodePublicConfig(encoded);
      const auth = config.auth as { type: string; headers: { name: string; value: string }[] };

      assertEquals(auth.type, "headers");
      assertEquals(auth.headers.map((h) => h.name), ["X-API-Key", "X-Client-Id"]);
      // Chaine vide et non cle absente : le destinataire voit un champ a ressaisir.
      assertEquals(auth.headers.map((h) => h.value), ["", ""]);
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-37.6: share encode, aucun secret ne survit dans la chaine encodee ni dans l'URL",
  fn: async () => {
    setup();
    try {
      // Cas hostile : un appelant qui poste des valeurs remplies malgre la regle.
      const res = await app.request("/api/share/encode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...BASE,
          auth: {
            type: "headers",
            headers: [
              { name: "X-API-Key", value: HEADER_SECRET_A },
              { name: "X-Client-Id", value: HEADER_SECRET_B },
            ],
          },
        }),
      });
      const body = await res.json();

      if (res.status === 200) {
        const config = await decodePublicConfig(body.encoded);
        const serialised = JSON.stringify(config);
        for (const secret of [HEADER_SECRET_A, HEADER_SECRET_B]) {
          assertEquals(
            serialised.includes(secret),
            false,
            `secret transporte par le partage : ${secret}`,
          );
          assertEquals(body.encoded.includes(secret), false, "secret lisible dans l'encode");
          assertEquals(body.url.includes(secret), false, "secret lisible dans l'URL de partage");
        }
      } else {
        // Refuser la configuration est une reponse valide, tant que rien ne fuite.
        assertEquals(res.status, 400);
      }
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-37.7: la cle client n'est jamais serialisee dans une URL de partage",
  fn: async () => {
    setup();
    try {
      const res = await app.request("/api/share/encode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...BASE, auth: "bearer", key: CLIENT_KEY }),
      });
      const body = await res.json();
      assertEquals(res.status, 200);

      const config = await decodePublicConfig(body.encoded);
      assertEquals(
        JSON.stringify(config).includes(CLIENT_KEY),
        false,
        "la cle client a ete embarquee dans le payload de partage",
      );
      assertEquals(body.encoded.includes(CLIENT_KEY), false);
      assertEquals(body.url.includes(CLIENT_KEY), false);
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-37.8: l'URL FGP generee ne contient aucun secret en clair",
  fn: async () => {
    setup();
    try {
      const gen = await generate({
        ...BASE,
        key: CLIENT_KEY,
        auth: {
          type: "headers",
          headers: [
            { name: "X-API-Key", value: HEADER_SECRET_A },
            { name: "X-Client-Id", value: HEADER_SECRET_B },
          ],
        },
      });
      const { url } = await gen.json();

      for (const secret of [HEADER_SECRET_A, HEADER_SECRET_B, CLIENT_KEY]) {
        assertEquals(url.includes(secret), false, `secret present dans l'URL FGP : ${secret}`);
      }
      assertEquals(url.includes("?"), false, "aucune query string ne doit porter de donnee");
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-37.12: le partage en mode addon ne transporte ni application ni identifiant de base",
  fn: async () => {
    setup();
    try {
      const res = await app.request("/api/share/encode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...BASE,
          target: "https://db-api.osc-fr1.scalingo.com",
          auth: {
            type: "scalingo-addon",
            app: "",
            addonId: "",
            apiUrl: "https://api.osc-fr1.scalingo.com",
          },
        }),
      });
      const { encoded } = await res.json();
      assertEquals(res.status, 200);

      const config = await decodePublicConfig(encoded);
      const auth = config.auth as { type: string; app: string; addonId: string; apiUrl?: string };

      // La region est utile au destinataire, la topologie du compte ne l'est pas.
      assertEquals(auth.type, "scalingo-addon");
      assertEquals(auth.apiUrl, "https://api.osc-fr1.scalingo.com");
      assertEquals(auth.app, "");
      assertEquals(auth.addonId, "");
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-37.11: la reponse de /api/generate ne renvoie que url, key et blob",
  fn: async () => {
    setup();
    try {
      const gen = await generate({
        ...BASE,
        auth: {
          type: "headers",
          headers: [
            { name: "X-API-Key", value: HEADER_SECRET_A },
            { name: "X-Client-Id", value: HEADER_SECRET_B },
          ],
        },
      });
      const raw = await gen.text();
      const body = JSON.parse(raw);

      assertEquals(Object.keys(body).sort(), ["blob", "key", "url"]);
      for (const secret of [HEADER_SECRET_A, HEADER_SECRET_B]) {
        assertEquals(raw.includes(secret), false, "secret renvoye par /api/generate");
      }
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// --- AC-35.24 : resourceId ne franchit jamais la frontiere navigateur ---

Deno.test({
  name: "AC-35.24: resourceId poste a /api/generate n'atteint jamais le blob",
  fn: async () => {
    setup();
    try {
      const gen = await generate({
        ...BASE,
        token: ACCOUNT_TOKEN,
        target: "https://db-api.osc-fr1.scalingo.com",
        auth: {
          type: "scalingo-addon",
          app: "mon-app",
          addonId: "ad-1111-2222",
          resourceId: "my-db-123",
        },
      });
      const { blob, key } = await gen.json();
      assertEquals(gen.status, 200);

      const config = await decryptBlob(blob, key, SERVER_SALT);
      const serialised = JSON.stringify(config);

      assertEquals(
        serialised.includes("my-db-123"),
        false,
        "resourceId a franchi la frontiere navigateur et vit dans le blob",
      );
      const auth = config.auth as Record<string, unknown>;
      assertEquals(Object.hasOwn(auth, "resourceId"), false);
      assertEquals(Object.hasOwn(auth, "addons"), false, "vestige de l'ancien format multi-addon");
      assertEquals(auth.app, "mon-app");
      assertEquals(auth.addonId, "ad-1111-2222");
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});
