import { createServer } from "node:http";
import { test } from "node:test";
import { serve } from "@hono/node-server";

import { encryptBlob } from "../../src/crypto/blob.ts";
import { app } from "../../src/main.ts";
import { assertEquals } from "../_assert.ts";

// Le seul test de la suite qui laisse sortir un vrai fetch vers un vrai socket. Tous les
// autres remplacent globalThis.fetch, ce qui rend le chemin de forward invisible : un corps
// de requete ne passe jamais par undici, ni par la requete que @hono/node-server fabrique.
// C'est ce trou qui a laisse passer un 502 sur toute methode autre que GET et HEAD.

const CLIENT_KEY = "e2e-forward-key-0123456789abcdef";
const SERVER_SALT = "e2e-forward-salt";

interface Seen {
  method: string;
  bytes: number;
  auth: string | null;
}

interface Listening {
  port: number;
  close: () => Promise<void>;
}

function startUpstream(seen: Seen[]): Promise<Listening> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      let bytes = 0;
      req.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
      });
      req.on("end", () => {
        seen.push({
          method: req.method ?? "",
          bytes,
          auth: req.headers.authorization ?? null,
        });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, bytes }));
      });
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      resolve({
        port: typeof addr === "object" && addr !== null ? addr.port : 0,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}

function startProxy(): Promise<Listening> {
  return new Promise((resolve) => {
    const server = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" }, (info) => {
      resolve({
        port: info.port,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}

test("AC-60.1: une requete a corps traverse reellement le proxy, pas seulement un GET", async () => {
  process.env.FGP_SALT = SERVER_SALT;
  process.env.FGP_EGRESS_ALLOW_PRIVATE = "1";

  const seen: Seen[] = [];
  const upstream = await startUpstream(seen);
  const proxy = await startProxy();

  try {
    const blob = await encryptBlob(
      {
        v: 2,
        token: "tk-e2e",
        target: `http://127.0.0.1:${upstream.port}`,
        auth: "bearer",
        scopes: ["GET:/echo", "POST:/echo", "PUT:/echo", "PATCH:/echo", "DELETE:/echo"],
        ttl: 3600,
        createdAt: Math.floor(Date.now() / 1000),
      },
      CLIENT_KEY,
      SERVER_SALT,
    );

    const call = (method: string, body?: string) =>
      fetch(`http://127.0.0.1:${proxy.port}/${blob}/echo`, {
        method,
        headers: body
          ? { "X-FGP-Key": CLIENT_KEY, "Content-Type": "application/json" }
          : { "X-FGP-Key": CLIENT_KEY },
        body,
      });

    const get = await call("GET");
    assertEquals(get.status, 200, "un GET doit traverser");
    await get.body?.cancel();

    const payload = JSON.stringify({ hello: "upstream" });
    for (const method of ["POST", "PUT", "PATCH"]) {
      const res = await call(method, payload);
      assertEquals(res.status, 200, `${method} doit traverser le proxy`);
      const seenBody = (await res.json()) as { bytes: number };
      assertEquals(
        seenBody.bytes,
        payload.length,
        `l'amont doit recevoir le corps entier d'un ${method}`,
      );
    }

    // Une methode sans corps compte autant : @hono/node-server fabrique un flux vide plutot
    // que null, donc elle emprunte le meme chemin que celles qui portent un corps.
    const del = await call("DELETE");
    assertEquals(del.status, 200, "un DELETE sans corps doit traverser");
    await del.body?.cancel();

    assertEquals(
      seen.map((s) => s.method),
      ["GET", "POST", "PUT", "PATCH", "DELETE"],
      "l'amont doit avoir vu les cinq methodes",
    );
    assertEquals(
      seen.every((s) => s.auth === "Bearer tk-e2e"),
      true,
      "l'authentification du blob doit arriver a l'amont sur chaque methode",
    );
  } finally {
    await proxy.close();
    await upstream.close();
    delete process.env.FGP_SALT;
    delete process.env.FGP_EGRESS_ALLOW_PRIVATE;
  }
});
