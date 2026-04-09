import { extendZodWithOpenApi, OpenApiGeneratorV3, OpenAPIRegistry } from "zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

const registry = new OpenAPIRegistry();

const ErrorSchema = z.object({
  error: z.string(),
  message: z.string(),
}).openapi("Error");

const GenerateBodySchema = z.object({
  token: z.string().min(1).openapi({ example: "tk-us-xxxxxxxxxxxxxxxxxxxxxxxxxxxx" }),
  target: z.string().min(1).openapi({ example: "https://api.osc-fr1.scalingo.com" }),
  auth: z.string().min(1).openapi({
    example: "scalingo-exchange",
    description: "Auth mode: bearer, basic, scalingo-exchange, or header:{name}",
  }),
  scopes: z.array(z.string()).openapi({
    example: ["GET:/v1/apps/*", "POST:/v1/apps/my-app/scale"],
    description: "List of METHOD:PATH patterns",
  }),
  ttl: z.number().openapi({
    example: 3600,
    description: "Validity duration in seconds. 0 = no expiration",
  }),
}).openapi("GenerateBody");

const GenerateResponseSchema = z.object({
  url: z.string().openapi({ example: "https://fgp.example.com/eyJhbGci.../" }),
  key: z.string().openapi({ example: "a7f2c9d4-1234-5678-abcd-ef0123456789" }),
}).openapi("GenerateResponse");

const SaltResponseSchema = z.object({
  salt: z.string(),
}).openapi("SaltResponse");

const ListAppsBodySchema = z.object({
  token: z.string().min(1).openapi({
    example: "tk-us-xxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    description: "Scalingo API token (tk-us-...)",
  }),
}).openapi("ListAppsBody");

const ListAppsResponseSchema = z.object({
  apps: z.array(z.string()).openapi({
    example: ["my-app", "other-app", "staging-app"],
  }),
}).openapi("ListAppsResponse");

export { GenerateBodySchema, ListAppsBodySchema };

registry.registerPath({
  method: "get",
  path: "/api/salt",
  tags: ["Configuration"],
  summary: "Get server salt",
  description: "Returns the server salt used for PBKDF2 key derivation.",
  responses: {
    200: {
      description: "Server salt",
      content: { "application/json": { schema: SaltResponseSchema } },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/generate",
  tags: ["Configuration"],
  summary: "Generate an FGP URL",
  description:
    "Server-side encrypted URL generation. Creates a client key, encrypts the blob, returns URL + key.",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: GenerateBodySchema } },
    },
  },
  responses: {
    200: {
      description: "Generated URL and client key",
      content: { "application/json": { schema: GenerateResponseSchema } },
    },
    400: {
      description: "Invalid JSON body or missing fields",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/list-apps",
  tags: ["Scalingo"],
  summary: "List Scalingo apps",
  description: "Scalingo helper: lists apps accessible with the provided token via token exchange.",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: ListAppsBodySchema } },
    },
  },
  responses: {
    200: {
      description: "Sorted list of app names",
      content: { "application/json": { schema: ListAppsResponseSchema } },
    },
    401: {
      description: "Token exchange failed",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/{blob}/{path}",
  tags: ["Proxy"],
  summary: "Proxy request to target API",
  description:
    "Decrypts the blob, verifies TTL and scopes, then forwards to the target API. Supports all HTTP methods.",
  request: {
    params: z.object({
      blob: z.string().openapi({ description: "Encrypted blob (base64url, max 4KB)" }),
      path: z.string().openapi({ description: "API path forwarded to the target" }),
    }),
    headers: z.object({
      "X-FGP-Key": z.string().openapi({ description: "Client key for blob decryption" }),
    }),
  },
  responses: {
    200: { description: "Response from the target API (pass-through)" },
    401: { description: "Missing key or decryption failed" },
    403: { description: "Scope denied for this method/path" },
    410: { description: "Token expired (TTL exceeded)" },
    414: { description: "Blob too large (> 4KB)" },
    429: { description: "Rate limited by target API" },
    502: { description: "Target API error or auth rejected" },
  },
});

const generator = new OpenApiGeneratorV3(registry.definitions);

export const openApiSpec = generator.generateDocument({
  openapi: "3.0.0",
  info: {
    version: "2.0.0",
    title: "Fine-Grained Proxy (FGP) API",
    description:
      "Stateless HTTP proxy that adds fine-grained token scoping on top of any API. Zero storage: the token and permission config are encrypted in the URL itself.",
  },
});
