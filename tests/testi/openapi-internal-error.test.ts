import { assertEquals, assertNotEquals } from "@std/assert";
import { Hono } from "hono";

import { app, fgpErrorHandler } from "../../src/main.ts";

const HTTP_METHODS = ["get", "post", "put", "patch", "delete"];

type ErrorSchema = { $ref?: string; properties?: { error?: { enum?: string[] } } };

type Operation = {
  responses: Record<string, { content?: Record<string, { schema?: ErrorSchema }> }>;
};

type Spec = {
  paths: Record<string, Record<string, Operation>>;
  components: { schemas: Record<string, ErrorSchema> };
};

async function loadSpec(): Promise<Spec> {
  const res = await app.request("/api/openapi.json");
  return await res.json() as Spec;
}

function operationsOf(spec: Spec): { path: string; method: string; operation: Operation }[] {
  const out: { path: string; method: string; operation: Operation }[] = [];
  for (const [path, item] of Object.entries(spec.paths)) {
    for (const [method, operation] of Object.entries(item)) {
      if (HTTP_METHODS.includes(method)) out.push({ path, method, operation });
    }
  }
  return out;
}

function declaredErrorCodes(spec: Spec, operation: Operation, status: string): string[] {
  const schema = operation.responses[status]?.content?.["application/json"]?.schema;
  if (!schema) return [];
  const resolved = schema.$ref
    ? spec.components.schemas[schema.$ref.replace("#/components/schemas/", "")]
    : schema;
  return resolved?.properties?.error?.enum ?? [];
}

// Le couple (status, code) n'est pas recopie ici, il est mesure sur le handler global
// reellement monte par src/main.ts. Ecrire « 500 internal_error » a la main serait refaire
// l'erreur que ce test corrige : une liste de codes qui se perime en silence quand le
// comportement bouge.
async function observedUnhandledFailure(): Promise<{ status: string; code: string }> {
  const probe = new Hono();
  probe.onError(fgpErrorHandler);
  probe.get("/boom", () => {
    throw new Error("boom");
  });

  const original = console.error;
  console.error = () => {};
  try {
    const res = await probe.request("/boom");
    const body = await res.json() as { error?: string };
    if (typeof body.error !== "string" || body.error.length === 0) {
      throw new Error("le handler global ne rend aucun code d'erreur, le test ne derive rien");
    }
    return { status: String(res.status), code: body.error };
  } finally {
    console.error = original;
  }
}

Deno.test({
  name:
    "AC-59.6: PARITE, toute operation OpenAPI declare le code que le handler global rend sur un throw",
  fn: async () => {
    const { status, code } = await observedUnhandledFailure();
    const spec = await loadSpec();
    const operations = operationsOf(spec);
    assertNotEquals(operations.length, 0, "aucune operation enumeree, le test ne verifie rien");

    // Aucune exclusion possible, contrairement au 413 : app.onError ne regarde ni le chemin
    // ni la presence d'un corps. GET /api/salt echappe au plafond de corps parce que Deno
    // n'expose aucun body sur un GET ; rien d'equivalent ne le met a l'abri d'un throw.
    const undeclared: string[] = [];
    for (const { path, method, operation } of operations) {
      if (!declaredErrorCodes(spec, operation, status).includes(code)) {
        undeclared.push(`${method.toUpperCase()} ${path}`);
      }
    }

    assertEquals(
      undeclared,
      [],
      `${status} ${code} rendu par app.onError mais absent de l'enum OpenAPI : ${
        undeclared.join(", ")
      }`,
    );
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-59.7: le code derive est bien celui qu'une route documentee sert vraiment",
  fn: async () => {
    // Le probe ci-dessus monte son propre Hono : il prouve ce que rend le handler, pas qu'il
    // est branche sur l'app reelle. Cette route documentee, elle, traverse toute la pile.
    const { status, code } = await observedUnhandledFailure();

    const originalEnvGet = Deno.env.get;
    const originalConsoleError = console.error;
    console.error = () => {};
    Deno.env.get = ((name: string): string | undefined => {
      if (name === "SCALINGO_API_URL") throw new TypeError("env read broken");
      return originalEnvGet(name);
    }) as typeof Deno.env.get;

    try {
      const res = await app.request("/api/list-apps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "tk-us-test" }),
      });
      const body = await res.json();

      assertEquals(String(res.status), status);
      assertEquals(body.error, code);
    } finally {
      Deno.env.get = originalEnvGet;
      console.error = originalConsoleError;
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});
