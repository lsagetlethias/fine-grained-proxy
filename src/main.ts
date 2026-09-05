import { Hono, type MiddlewareHandler } from "hono";
import { serveStatic } from "hono/deno";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { bodyLimit } from "hono/body-limit";

import { blobHeaderProxy, proxyMiddleware } from "./middleware/proxy.ts";
import { uiRoutes } from "./routes/ui.tsx";
import { logsRoutes } from "./routes/logs.tsx";
import { logsEnabled } from "./logs/config.ts";
import { purge } from "./logs/store.ts";
import { purgeExpiredKeys } from "./crypto/key-cache.ts";
import {
  FGP_OWNED_PATHS,
  FGP_SECURITY_HEADERS,
  FGP_SOURCE_HEADER,
  FGP_SOURCE_PROXY,
  SWAGGER_DOCS_PATH,
  SWAGGER_UI_CDN,
} from "./constants.ts";

const app = new Hono();

const baseSecurityOptions = {
  crossOriginOpenerPolicy: "same-origin",
  crossOriginResourcePolicy: "same-origin",
  // Le blob chiffre peut voyager dans l'URL (/{blob}/path) : aucun Referer ne doit fuir.
  referrerPolicy: "no-referrer",
  strictTransportSecurity: "max-age=31536000; includeSubDomains",
  xFrameOptions: "DENY",
  permissionsPolicy: {
    accelerometer: [],
    ambientLightSensor: [],
    autoplay: [],
    battery: [],
    bluetooth: [],
    camera: [],
    displayCapture: [],
    geolocation: [],
    gyroscope: [],
    hid: [],
    idleDetection: [],
    magnetometer: [],
    microphone: [],
    midi: [],
    payment: [],
    publickeyCredentialsGet: [],
    screenWakeLock: [],
    serial: [],
    usb: [],
    xrSpatialTracking: [],
  },
};

const uiSecurityHeaders = secureHeaders({
  ...baseSecurityOptions,
  contentSecurityPolicy: {
    defaultSrc: ["'none'"],
    baseUri: ["'none'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'"],
    imgSrc: ["'self'", "data:"],
    fontSrc: ["'self'"],
    connectSrc: ["'self'"],
    formAction: ["'self'"],
    frameAncestors: ["'none'"],
    objectSrc: ["'none'"],
    manifestSrc: ["'self'"],
  },
});

// Swagger UI charge ses assets depuis jsDelivr et pose un <script> inline non nonce-able.
const swaggerSecurityHeaders = secureHeaders({
  ...baseSecurityOptions,
  contentSecurityPolicy: {
    defaultSrc: ["'none'"],
    baseUri: ["'none'"],
    scriptSrc: ["'self'", "'unsafe-inline'", SWAGGER_UI_CDN],
    styleSrc: ["'self'", "'unsafe-inline'", SWAGGER_UI_CDN],
    imgSrc: ["'self'", "data:", SWAGGER_UI_CDN],
    fontSrc: ["'self'", "data:", SWAGGER_UI_CDN],
    connectSrc: ["'self'"],
    formAction: ["'self'"],
    frameAncestors: ["'none'"],
    objectSrc: ["'none'"],
  },
});

const securityHeaders: MiddlewareHandler = (c, next) =>
  c.req.path === SWAGGER_DOCS_PATH ? swaggerSecurityHeaders(c, next) : uiSecurityHeaders(c, next);

// Sur la route proxy, les erreurs generees par FGP (401 missing_key, 403 scope_denied,
// 410 token_expired) sont des reponses FGP et doivent porter les en-tetes ; les reponses
// forwardees portent X-FGP-Source: upstream et restent intouchees (ADR-0006).
function withProxyErrorSecurity(inner: MiddlewareHandler): MiddlewareHandler {
  return async (c, next) => {
    // next() ne resout pas vers une Response : ne retenir que ce que inner a vraiment produit.
    const returned = await inner(c, next);
    const res = returned instanceof Response ? returned : c.res;

    // Le test sur la CSP evite de re-estampiller une reponse deja traitee par
    // securityHeaders, ce qui ecraserait la CSP permissive de /api/docs.
    if (
      res.headers.get(FGP_SOURCE_HEADER) === FGP_SOURCE_PROXY &&
      !res.headers.has("Content-Security-Policy")
    ) {
      for (const [name, value] of FGP_SECURITY_HEADERS) {
        res.headers.set(name, value);
      }
    }
    return res;
  };
}

app.onError((err, c) => {
  console.error("[fgp] unhandled error:", err);
  const response = c.json(
    { error: "internal_error", message: "Internal server error" },
    500,
  );
  response.headers.set(FGP_SOURCE_HEADER, FGP_SOURCE_PROXY);
  return response;
});

app.use("*", logger());
app.use("*", withProxyErrorSecurity(blobHeaderProxy()));

// JAMAIS sur "*" : la route proxy transmet le corps en streaming, un bodyLimit global le
// mettrait en tampon et casserait les uploads volumineux legitimes a travers le proxy
// (ADR-0010 D6). Montage sur liste explicite, comme FGP_OWNED_PATHS pour les en-tetes.
function apiBodyLimit(maxSize: number): MiddlewareHandler {
  return bodyLimit({
    maxSize,
    onError: (c) => {
      const res = c.json(
        { error: "payload_too_large", message: "Request body is too large" },
        413,
      );
      res.headers.set(FGP_SOURCE_HEADER, FGP_SOURCE_PROXY);
      return res;
    },
  });
}

// Le plus gros corps qui peut aboutir est celui de /api/generate : au-dela, la generation
// echouerait de toute facon en blob_too_large.
app.use("/api/decode", apiBodyLimit(8 * 1024));
app.use("/api/share/decode", apiBodyLimit(16 * 1024));
app.use("/api/list-apps", apiBodyLimit(4 * 1024));
app.use("/api/list-addons", apiBodyLimit(4 * 1024));
app.use("/api/*", apiBodyLimit(64 * 1024));

// Monte apres blobHeaderProxy et sur des chemins explicites : ADR-0006 impose qu'aucune
// reponse upstream forwardee (mode header ou mode URL /:blob/*) ne soit enrichie.
for (const path of FGP_OWNED_PATHS) {
  app.use(path, securityHeaders);
}

// Tout ce que servent les routes /api/* est produit par FGP, y compris l'enveloppe que
// /api/test-proxy met autour d'une reponse upstream : la provenance y vaut donc toujours
// proxy. Les 401, 413 et 502 la posaient deja, aucun 400 de validation ne le faisait, et
// un consommateur ne pouvait pas se fier a l'en-tete pour savoir qui a repondu. Pose ici
// plutot que dans chaque handler, sinon la prochaine route naitra avec le meme trou.
app.use("/api/*", async (c, next) => {
  await next();
  if (!c.res.headers.has(FGP_SOURCE_HEADER)) {
    c.res.headers.set(FGP_SOURCE_HEADER, FGP_SOURCE_PROXY);
  }
});

app.get("/healthz", (c) => c.json({ status: "ok" }));

app.get(
  "/static/*",
  serveStatic({
    root: "./",
    rewriteRequestPath: (path) => path,
    onFound: (_path, c) => {
      c.header("Cache-Control", "public, max-age=86400");
    },
  }),
);

app.get("/static/*", (c) => {
  const response = c.json({ error: "not_found", message: "Static file not found" }, 404);
  response.headers.set(FGP_SOURCE_HEADER, FGP_SOURCE_PROXY);
  return response;
});

app.route("/", logsRoutes);
app.route("/", uiRoutes);

app.all("/api/*", (c) => {
  const response = c.json({ error: "not_found", message: "Endpoint not found" }, 404);
  response.headers.set(FGP_SOURCE_HEADER, FGP_SOURCE_PROXY);
  return response;
});

// Le timer n'est plus conditionne a logsEnabled() : le cache de derivation a besoin de
// sa purge meme quand la feature logs est coupee (ADR-0010 D8).
setInterval(() => {
  try {
    if (logsEnabled()) purge();
    purgeExpiredKeys();
  } catch (err) {
    console.error("[fgp] purge failed:", err);
  }
}, 60_000);

app.use("/:blob/*", withProxyErrorSecurity(proxyMiddleware()));

export { app };

// Pas d'`export default { fetch }` : sous `deno serve` le champ `port` est ignore et PORT
// devient inoperant. L'ecoute explicite ci-dessous est le pattern Deno Deploy Classic.
if (import.meta.main) {
  Deno.serve(
    { port: Number(Deno.env.get("PORT") ?? 8000), hostname: "0.0.0.0" },
    (req: Request, info: Deno.ServeHandlerInfo) => app.fetch(req, { info }),
  );
}
