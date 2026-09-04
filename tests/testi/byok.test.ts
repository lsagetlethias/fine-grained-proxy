import { assertEquals, assertNotEquals, assertStringIncludes } from "@std/assert";

import { app } from "../../src/main.ts";
import { decryptBlob } from "../../src/crypto/blob.ts";

const SERVER_SALT = "byok-test-salt";
const VALID_KEY = "cle-de-ci-tres-longue-et-aleatoire-42";

function setup() {
  Deno.env.set("FGP_SALT", SERVER_SALT);
}

function teardown() {
  Deno.env.delete("FGP_SALT");
}

const BASE = {
  token: "tk-us-test-token",
  target: "https://api.example.com",
  auth: "bearer",
  scopes: ["GET:/v2/resources"],
  ttl: 3600,
};

async function generate(overrides: Record<string, unknown> = {}): Promise<Response> {
  return await app.request("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...BASE, ...overrides }),
  });
}

Deno.test({
  name: "AC-38.1: sans champ key, le serveur genere la cle, comportement inchange",
  fn: async () => {
    setup();
    try {
      const res = await generate();
      const body = await res.json();

      assertEquals(res.status, 200);
      assertEquals(typeof body.key, "string");
      assertEquals(body.key.length, 36, "la cle generee reste un randomUUID");

      const config = await decryptBlob(body.blob, body.key, SERVER_SALT);
      assertEquals(config.target, BASE.target);
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-38.2: une cle conforme est utilisee pour la derivation et renvoyee a l'identique",
  fn: async () => {
    setup();
    try {
      const res = await generate({ key: VALID_KEY });
      const body = await res.json();

      assertEquals(res.status, 200);
      assertEquals(body.key, VALID_KEY);

      const config = await decryptBlob(body.blob, VALID_KEY, SERVER_SALT);
      assertEquals(config.target, BASE.target);
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-38.3: le blob n'est pas dechiffrable avec une autre cle",
  fn: async () => {
    setup();
    try {
      const res = await generate({ key: VALID_KEY });
      const { blob } = await res.json();

      let threw = false;
      try {
        await decryptBlob(blob, "une-autre-cle-tout-aussi-longue-42", SERVER_SALT);
      } catch {
        threw = true;
      }
      assertEquals(threw, true, "le blob s'est dechiffre avec une cle qui n'est pas la sienne");
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-38.4: bornes exactes de la longueur minimale, 23 refuse et 24 accepte",
  fn: async () => {
    setup();
    try {
      const tooShort = await generate({ key: "a".repeat(23) });
      const shortBody = await tooShort.json();
      assertEquals(tooShort.status, 400);
      assertEquals(shortBody.error, "invalid_key");

      const exact = await generate({ key: "a".repeat(24) });
      await exact.body?.cancel();
      assertEquals(exact.status, 200);
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-38.5: bornes exactes de la longueur maximale, 256 accepte et 257 refuse",
  fn: async () => {
    setup();
    try {
      const max = await generate({ key: "a".repeat(256) });
      await max.body?.cancel();
      assertEquals(max.status, 200, "256 caracteres doivent passer, la spec fait foi sur 256");

      const over = await generate({ key: "a".repeat(257) });
      const overBody = await over.json();
      assertEquals(over.status, 400);
      assertEquals(overBody.error, "invalid_key");
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-38.6: un espace interne est refuse",
  fn: async () => {
    setup();
    try {
      const res = await generate({ key: "cle-de-ci avec-un-espace-au-milieu" });
      const body = await res.json();
      assertEquals(res.status, 400);
      assertEquals(body.error, "invalid_key");
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-38.7: un caractere non ASCII est refuse",
  fn: async () => {
    setup();
    try {
      for (const key of ["cle-de-ci-avec-accent-éééé", "cle-de-ci-avec-emoji-aaaa\u{1F511}"]) {
        const res = await generate({ key });
        const body = await res.json();
        assertEquals(res.status, 400, `acceptee a tort : ${key}`);
        assertEquals(body.error, "invalid_key");
      }
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-38.8: un caractere de controle interieur est refuse",
  fn: async () => {
    setup();
    try {
      // C'est le cas de securite : la cle transite dans le header X-FGP-Key, un CR ou un LF
      // interieur serait une injection d'en-tete. Le trim de bord ne peut rien contre celui-la.
      for (
        const key of [
          "cle-de-ci-avec\ttab-au-milieu-42",
          "cle-de-ci-avec\nlf-au-milieu-42",
          "cle-de-ci-avec\rcr-au-milieu-42",
          "cle-de-ci-avec\0nul-au-milieu-42",
        ]
      ) {
        const res = await generate({ key });
        const body = await res.json();
        assertEquals(res.status, 400, `acceptee a tort : ${JSON.stringify(key)}`);
        assertEquals(body.error, "invalid_key");
      }
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-38.18: un retour a la ligne de fin est trimme, pas refuse",
  fn: async () => {
    setup();
    try {
      // Comportement voulu par les specs 15.3 : un copier-coller depuis un gestionnaire de
      // secrets ramene souvent un saut de ligne final, et HTTP le retirerait de toute facon.
      const res = await generate({ key: `${VALID_KEY}\n` });
      const body = await res.json();

      assertEquals(res.status, 200);
      assertEquals(body.key, VALID_KEY);
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-38.9: les espaces de bord sont trimmes, et c'est la cle trimmee qui dechiffre",
  fn: async () => {
    setup();
    try {
      const padded = `  ${VALID_KEY}  `;
      const res = await generate({ key: padded });
      const body = await res.json();

      assertEquals(res.status, 200);
      assertEquals(body.key, VALID_KEY, "la cle renvoyee doit etre la version trimmee");

      const config = await decryptBlob(body.blob, VALID_KEY, SERVER_SALT);
      assertEquals(config.target, BASE.target);
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-38.10: le trim ne sauve pas une cle trop courte",
  fn: async () => {
    setup();
    try {
      const res = await generate({ key: "   court-20-caracter   " });
      const body = await res.json();
      assertEquals(res.status, 400);
      assertEquals(body.error, "invalid_key");
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-38.11: la validation vit cote serveur, un appel direct avec key=a est refuse",
  fn: async () => {
    setup();
    try {
      // Ce chemin ne passe par aucun code UI : une validation client seule ne protegerait rien.
      const res = await generate({ key: "a" });
      const body = await res.json();
      assertEquals(res.status, 400);
      assertEquals(body.error, "invalid_key");
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-38.12: le message d'erreur ne renvoie aucun fragment de la cle soumise",
  fn: async () => {
    setup();
    try {
      const secretish = "cle-refusee-avec-un-espace ici-SECRET";
      const res = await generate({ key: secretish });
      const raw = await res.text();

      assertEquals(res.status, 400);
      assertEquals(raw.includes("SECRET"), false, "la cle refusee est renvoyee en echo");
      assertEquals(raw.includes(secretish), false);
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-38.13: mutualiser une cle ne mutualise pas les droits",
  fn: async () => {
    setup();
    try {
      const readOnly = await generate({ key: VALID_KEY, scopes: ["GET:/v1/apps"], ttl: 3600 });
      const readWrite = await generate({ key: VALID_KEY, scopes: ["POST:/v1/apps"], ttl: 60 });
      const ro = await readOnly.json();
      const rw = await readWrite.json();

      assertEquals(readOnly.status, 200);
      assertEquals(readWrite.status, 200);
      assertEquals(ro.key, rw.key, "les deux blobs partagent bien la meme cle");
      assertNotEquals(ro.blob, rw.blob);

      const roConfig = await decryptBlob(ro.blob, VALID_KEY, SERVER_SALT);
      const rwConfig = await decryptBlob(rw.blob, VALID_KEY, SERVER_SALT);

      // La mutualisation porte sur la confidentialite, jamais sur les autorisations.
      assertEquals(roConfig.scopes, ["GET:/v1/apps"]);
      assertEquals(rwConfig.scopes, ["POST:/v1/apps"]);
      assertEquals(roConfig.ttl, 3600);
      assertEquals(rwConfig.ttl, 60);
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-38.14: key vide est refusee, avec un message qui indique la sortie",
  fn: async () => {
    setup();
    try {
      const res = await generate({ key: "" });
      const body = await res.json();

      assertEquals(res.status, 400);
      assertEquals(body.error, "invalid_key");
      // Une variable CI non definie vaut "" : traiter ce cas comme une absence produirait un
      // blob chiffre avec une cle serveur que le pipeline ignore, et un echec sans piste.
      assertStringIncludes(body.message, "Omit the field");
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-38.16: key vide et key trop courte produisent deux messages distincts",
  fn: async () => {
    setup();
    try {
      const empty = await (await generate({ key: "" })).json();
      const short = await (await generate({ key: "trop-court" })).json();

      assertEquals(empty.error, "invalid_key");
      assertEquals(short.error, "invalid_key");
      assertNotEquals(empty.message, short.message);
      assertStringIncludes(short.message, "24");
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-39.19: NON-REGRESSION, une cle de plus de 300 caracteres est refusee, jamais tronquee",
  fn: async () => {
    setup();
    try {
      // Le bug elimine : maxlength=256 tronquait le collage en silence cote navigateur.
      // Le blob partait chiffre avec les 256 premiers caracteres, l'utilisateur gardait les
      // 310 qu'il croyait avoir, et l'echec ne se voyait qu'au premier appel proxyfie.
      const pasted = "P".repeat(310);
      const res = await generate({ key: pasted });
      const body = await res.json();

      assertEquals(res.status, 400, "une cle de 310 caracteres doit etre refusee, pas tronquee");
      assertEquals(body.error, "invalid_key");
      assertStringIncludes(body.message, "256");

      // Le point qui compte : le serveur ne doit surtout pas avoir genere un blob sur un
      // prefixe silencieusement tronque.
      assertEquals(body.blob, undefined);
      assertEquals(body.key, undefined);

      // Contre-epreuve : la meme chaine ramenee a 256 passe, donc le refus vient bien de
      // la longueur et non du contenu.
      const trimmed = await generate({ key: "P".repeat(256) });
      await trimmed.body?.cancel();
      assertEquals(trimmed.status, 200);
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-38.15: l'enum OpenAPI de /api/generate porte invalid_key et auth_limit_exceeded",
  fn: async () => {
    setup();
    try {
      const res = await app.request("/api/openapi.json");
      const spec = await res.json();

      const ref: string = spec.paths["/api/generate"].post.responses["400"]
        .content["application/json"].schema.$ref;
      const schema = spec.components.schemas[ref.split("/").pop() as string];
      const codes: string[] = schema.properties.error.enum;

      assertEquals(codes.includes("invalid_key"), true);
      assertEquals(codes.includes("auth_limit_exceeded"), true);
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});
