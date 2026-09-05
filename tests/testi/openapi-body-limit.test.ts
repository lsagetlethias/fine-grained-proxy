import { assertEquals, assertNotEquals } from "@std/assert";

import { app } from "../../src/main.ts";
import { FGP_SOURCE_HEADER, FGP_SOURCE_PROXY } from "../../src/constants.ts";

const HTTP_METHODS = ["get", "post", "put", "patch", "delete"];

// Trois fois le plus haut plafond monte dans src/main.ts. Un plafond releve au-dela de cette
// taille ferait echouer la sonde et le test crierait a la sur-declaration : la marge se releve
// en meme temps que le plafond.
const OVERSIZED_BODY = JSON.stringify({ padding: "a".repeat(200 * 1024) });

type ErrorSchema = { $ref?: string; properties?: { error?: { enum?: string[] } } };

type Operation = {
  requestBody?: unknown;
  responses: Record<string, { content?: Record<string, { schema?: ErrorSchema }> }>;
};

type Spec = {
  paths: Record<string, Record<string, Operation>>;
  components: { schemas: Record<string, ErrorSchema> };
};

const originalFetch = globalThis.fetch;

function setup() {
  Deno.env.set("FGP_SALT", "openapi-body-limit-test-salt");
  Deno.env.set("FGP_EGRESS_ALLOW_PRIVATE", "1");
  Deno.env.set("SCALINGO_AUTH_URL", "https://auth.mock.local");
  // Une parite cassee laisse la requete atteindre le handler : sans ce garde-fou, la sonde
  // partirait reellement sur le reseau au lieu d'echouer proprement sur l'assertion.
  globalThis.fetch = (): Promise<Response> => Promise.resolve(new Response("{}", { status: 200 }));
}

function teardown() {
  globalThis.fetch = originalFetch;
  Deno.env.delete("FGP_SALT");
  Deno.env.delete("FGP_EGRESS_ALLOW_PRIVATE");
  Deno.env.delete("SCALINGO_AUTH_URL");
}

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

async function servesPayloadTooLarge(path: string, method: string): Promise<boolean> {
  const res = await app.request(path, {
    method: method.toUpperCase(),
    headers: { "Content-Type": "application/json" },
    body: OVERSIZED_BODY,
  });
  const raw = await res.text();
  if (res.status !== 413) return false;
  try {
    return (JSON.parse(raw) as { error?: string }).error === "payload_too_large";
  } catch {
    return false;
  }
}

Deno.test({
  name:
    "AC-47.4: PARITE, une operation OpenAPI declare 413 payload_too_large si et seulement si elle le sert",
  fn: async () => {
    setup();
    try {
      const spec = await loadSpec();
      const operations = operationsOf(spec);
      assertNotEquals(operations.length, 0, "aucune operation enumeree, le test ne verifie rien");

      const undeclared: string[] = [];
      const overdeclared: string[] = [];
      let probed = 0;

      for (const { path, method, operation } of operations) {
        const declares = declaredErrorCodes(spec, operation, "413").includes("payload_too_large");

        // Une operation sans corps documente ne peut pas depasser un plafond de corps : Deno
        // n'expose aucun body sur un GET, bodyLimit passe la main et la route repond 200.
        // La declarer en 413 documenterait une reponse que rien ne peut atteindre.
        if (!operation.requestBody) {
          if (declares) overdeclared.push(`${method.toUpperCase()} ${path} (sans corps)`);
          continue;
        }

        probed++;
        const serves = await servesPayloadTooLarge(path, method);
        if (serves && !declares) undeclared.push(`${method.toUpperCase()} ${path}`);
        if (!serves && declares) overdeclared.push(`${method.toUpperCase()} ${path}`);
      }

      assertNotEquals(probed, 0, "aucune operation sondee, le test ne verifie rien");

      assertEquals(
        undeclared,
        [],
        `413 payload_too_large servi mais absent de l'enum OpenAPI : ${undeclared.join(", ")}`,
      );
      assertEquals(
        overdeclared,
        [],
        `413 payload_too_large declare mais jamais servi : ${overdeclared.join(", ")}`,
      );
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-47.5: INVARIANT structurel, le plafond de corps n'est monte que sous /api/",
  fn: () => {
    // Monte sur un pattern fourre-tout, le plafond couvrirait la route proxy : le corps
    // transmis en flux passerait en tampon et les uploads volumineux legitimes casseraient
    // (ADR-0010 D6). La source de verite est le montage reel, pas une liste ecrite ici.
    const mounts = app.routes.filter((route) => route.handler.name.startsWith("bodyLimit"));

    assertNotEquals(
      mounts.length,
      0,
      "aucun montage de plafond reconnu sur l'app, le test ne verifie plus rien",
    );

    for (const mount of mounts) {
      assertEquals(
        mount.path.startsWith("/api/"),
        true,
        `plafond de corps monte hors /api/ sur ${mount.path}`,
      );
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// --- AC-47.10 : la provenance est uniforme sur /api/*, pas seulement sur les codes
// que les handlers estampillaient un par un ---

Deno.test({
  name: "AC-47.10: toute reponse d'une route /api/* porte X-FGP-Source: proxy",
  fn: async () => {
    const json = { "Content-Type": "application/json" };
    const cases: [string, RequestInit][] = [
      ["/api/salt", {}],
      ["/api/openapi.json", {}],
      ["/api/generate", { method: "POST", headers: json, body: "{}" }],
      ["/api/decode", { method: "POST", headers: json, body: "{}" }],
      ["/api/share/decode", {
        method: "POST",
        headers: json,
        body: JSON.stringify({ encoded: "x".repeat(9000) }),
      }],
      ["/api/list-apps", { method: "POST", headers: json, body: "{}" }],
      ["/api/test-proxy", { method: "POST", headers: json, body: "{}" }],
      ["/api/generate", {
        method: "POST",
        headers: json,
        body: JSON.stringify({ p: "x".repeat(70000) }),
      }],
    ];

    for (const [path, init] of cases) {
      const res = await app.request(path, init);
      assertEquals(
        res.headers.get(FGP_SOURCE_HEADER),
        FGP_SOURCE_PROXY,
        `${path} (${res.status}) ne porte pas la provenance`,
      );
      await res.body?.cancel();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});
