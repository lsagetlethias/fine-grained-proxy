import { assertEquals } from "@std/assert";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

import { fgpErrorHandler } from "../../src/main.ts";
import { FGP_SOURCE_HEADER, FGP_SOURCE_PROXY } from "../../src/constants.ts";

// Le projet ne leve jamais d'HTTPException lui-meme, c'est une regle de CLAUDE.md. Une
// dependance le fait : @hono/zod-openapi 1.6.3 leve un 415 sur un Content-Type non JSON.
// Aplatir ce refus de contrat en 500 faisait repondre « panne serveur » a une requete
// simplement mal formee, sur toutes les routes /api/*.
function probe(thrown: unknown): Hono {
  const app = new Hono();
  app.onError(fgpErrorHandler);
  app.get("/boom", () => {
    throw thrown;
  });
  return app;
}

Deno.test("AC-41.12: un HTTPException garde son status au lieu de devenir un 500", async () => {
  const res = await probe(new HTTPException(415, { message: "Unsupported Media Type" }))
    .request("/boom");

  assertEquals(res.status, 415);
  const body = await res.json();
  assertEquals(body.error, "unsupported_media_type");
  assertEquals(res.headers.get(FGP_SOURCE_HEADER), FGP_SOURCE_PROXY);
});

Deno.test("AC-41.12 bis: un status sans code connu reste nomme, pas internal_error", async () => {
  const res = await probe(new HTTPException(418, { message: "teapot" })).request("/boom");

  assertEquals(res.status, 418);
  assertEquals((await res.json()).error, "invalid_request");
});

Deno.test("AC-41.12 ter: une erreur quelconque reste un 500 internal_error", async () => {
  const res = await probe(new Error("boom")).request("/boom");

  assertEquals(res.status, 500);
  const body = await res.json();
  assertEquals(body.error, "internal_error");
  // Le message d'une erreur non prevue ne doit pas fuiter vers l'appelant.
  assertEquals(body.message, "Internal server error");
});

Deno.test("AC-41.12 quater: un HTTPException 500 reste traite comme une anomalie", async () => {
  const res = await probe(new HTTPException(500, { message: "detail interne" })).request("/boom");

  assertEquals(res.status, 500);
  assertEquals((await res.json()).message, "Internal server error");
});
