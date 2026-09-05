import { assertEquals, assertNotEquals, assertRejects } from "@std/assert";
import { Hono } from "hono";

import { app as uiApp } from "../../src/main.ts";
import { encryptBlob } from "../../src/crypto/blob.ts";
import { proxyMiddleware } from "../../src/middleware/proxy.ts";
import { _setResolverForTests } from "../../src/net/egress.ts";
import { exchangeToken, fetchAddonToken } from "../../src/auth/client.ts";
import { _resetStoreForTests } from "../../src/auth/cache.ts";

const CLIENT_KEY = "egress-census-test-key-0123456789";
const SERVER_SALT = "egress-census-salt";
// Un hote Scalingo pour que la contrainte de domaine des helpers ne masque pas la question
// posee ici, qui est celle de la classification d'adresse.
const SCALINGO_HOST = "https://api.osc-fr1.scalingo.com";

const originalFetch = globalThis.fetch;
let sorties: string[] = [];

function setup() {
  _resetStoreForTests();
  sorties = [];
  Deno.env.set("FGP_SALT", SERVER_SALT);
  Deno.env.delete("FGP_EGRESS_ALLOW_PRIVATE");
  Deno.env.delete("SCALINGO_API_URL");
  Deno.env.delete("SCALINGO_AUTH_URL");
  // Tout hote resout vers une adresse privee : la seule chose qui peut empecher la sortie
  // est la politique, et le mouchard ci-dessous voit passer ce qui lui echappe.
  _setResolverForTests((_h, kind) => Promise.resolve(kind === "A" ? ["10.0.0.7"] : []));
  globalThis.fetch = ((input: string | URL | Request) => {
    sorties.push(input instanceof Request ? input.url : String(input));
    return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  }) as typeof globalThis.fetch;
}

function teardown() {
  globalThis.fetch = originalFetch;
  _setResolverForTests(null);
  Deno.env.delete("FGP_SALT");
  Deno.env.delete("SCALINGO_API_URL");
  Deno.env.delete("SCALINGO_AUTH_URL");
}

function createProxyApp(): Hono {
  const app = new Hono();
  app.use("/:blob{.+}/*", proxyMiddleware());
  return app;
}

async function post(path: string, body: unknown): Promise<Response> {
  return await uiApp.request(`http://localhost:8000${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

Deno.test({
  name: "AC-43.17: RECENSEMENT, aucun des appelants reseau ne sort sans passer par la politique",
  fn: async () => {
    setup();
    try {
      // Un appelant par entree du recensement de l'ADR-0009 §6. Le critere n'est pas le code
      // de retour de chacun, c'est qu'aucun n'ait touche le reseau : un fetch nu ajoute
      // demain quelque part dans src/ ferait grossir « sorties » et casserait ce test, ce
      // qu'une somme de tests par route ne garantit pas.
      const appelants: [string, () => Promise<unknown>][] = [
        ["forward du proxy", async () => {
          const blob = await encryptBlob(
            {
              v: 2,
              token: "tok",
              target: SCALINGO_HOST,
              auth: "bearer",
              scopes: ["*:*"],
              ttl: 3600,
              createdAt: Math.floor(Date.now() / 1000),
            },
            CLIENT_KEY,
            SERVER_SALT,
          );
          const res = await createProxyApp().request(`/${blob}/v1/apps`, {
            headers: { "X-FGP-Key": CLIENT_KEY },
          });
          await res.body?.cancel();
          assertEquals(res.status, 403);
        }],
        ["/api/test-proxy", async () => {
          const res = await post("/api/test-proxy", {
            method: "GET",
            path: "/v1/apps",
            token: "tk-us-test",
            target: SCALINGO_HOST,
            auth: "bearer",
            scopes: ["GET:/v1/apps"],
          });
          await res.body?.cancel();
        }],
        ["/api/list-apps", async () => {
          const res = await post("/api/list-apps", {
            token: "tk-us-test",
            target: SCALINGO_HOST,
          });
          await res.body?.cancel();
        }],
        ["/api/list-addons", async () => {
          const res = await post("/api/list-addons", {
            token: "tk-us-test",
            app: "mon-app",
            target: SCALINGO_HOST,
          });
          await res.body?.cancel();
        }],
        ["token d'addon", async () => {
          await assertRejects(() =>
            fetchAddonToken("bearer-du-compte", SCALINGO_HOST, "a", "ad-1")
          );
        }],
        ["echange de token", async () => {
          Deno.env.set("SCALINGO_AUTH_URL", "https://auth.scalingo.com");
          await assertRejects(() => exchangeToken("tk-us-test"));
          Deno.env.delete("SCALINGO_AUTH_URL");
        }],
      ];

      for (const [nom, appelant] of appelants) {
        sorties = [];
        await appelant();
        assertEquals(
          sorties,
          [],
          `${nom} a joint le reseau malgre une destination classee non publique`,
        );
      }
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-43.17 bis: TEMOIN, les memes appelants sortent bien quand la destination est publique",
  fn: async () => {
    setup();
    try {
      // Sans ce temoin, le recensement ci-dessus serait vert sur un stub de fetch mal
      // branche, ou sur des routes qui echouent avant meme d'envisager de sortir.
      _setResolverForTests((_h, kind) => Promise.resolve(kind === "A" ? ["93.184.216.34"] : []));
      sorties = [];
      const res = await post("/api/list-apps", { token: "tk-us-test", target: SCALINGO_HOST });
      await res.body?.cancel();
      assertNotEquals(sorties.length, 0, "aucune sortie observee sur une destination publique");
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name:
    "AC-43.22 (registre v5): une valeur d'origine operateur echappe a la contrainte d'hote, pas au classement d'adresse",
  fn: async () => {
    setup();
    try {
      // Moitie vraie du critere : SCALINGO_API_URL vient de l'operateur, qui a deja le
      // controle du processus. Elle n'a donc pas a etre un hote Scalingo.
      Deno.env.set("SCALINGO_API_URL", "https://mock.operateur.example");
      _setResolverForTests((_h, kind) => Promise.resolve(kind === "A" ? ["93.184.216.34"] : []));
      globalThis.fetch = ((input: string | URL | Request) => {
        sorties.push(input instanceof Request ? input.url : String(input));
        return Promise.resolve(
          new Response(JSON.stringify({ addon: { token: "addon-tok" } }), { status: 200 }),
        );
      }) as typeof globalThis.fetch;
      sorties = [];
      const token = await fetchAddonToken("bearer", "https://mock.operateur.example", "a", "ad-1");
      assertEquals(typeof token, "string");
      assertEquals(sorties.length, 1);

      // Moitie que l'implementation refuse, et elle a raison : l'exemption porte sur la
      // contrainte de domaine Scalingo, jamais sur la classification d'adresse. Une valeur
      // d'operateur qui pointerait le reseau prive resterait une sortie non publique, et
      // egressFetch est le seul point de sortie, sans derogation par provenance.
      _setResolverForTests((_h, kind) => Promise.resolve(kind === "A" ? ["10.0.0.7"] : []));
      sorties = [];
      await assertRejects(
        () => fetchAddonToken("bearer", "https://mock.operateur.example", "a", "ad-1"),
        Error,
        "Target host resolves to a non-public address",
      );
      assertEquals(sorties, []);
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});
