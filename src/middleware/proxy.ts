import { Context, MiddlewareHandler } from "hono";

import { BlobConfig, BlobPolicyError, decryptBlobWithKey, isExpired } from "../crypto/blob.ts";
import { checkClientKey } from "../crypto/client-key.ts";
import { obtainAddonToken, obtainBearerViaExchange } from "../auth/credentials.ts";
import { isAuthSpec, isScalingoAddonSpec } from "../auth/spec.ts";
import { assertPublicHost, buildUpstreamUrl, egressFetch, parseTargetUrl } from "../net/egress.ts";
import { checkRequestAccess, type Scope } from "./scopes.ts";
import { FGP_SOURCE_HEADER, FGP_SOURCE_PROXY, FGP_SOURCE_UPSTREAM } from "../constants.ts";
import { logsEnabled, readLogsConfig } from "../logs/config.ts";
import { computeBlobId } from "../logs/blob-id.ts";
import { captureDetailed, captureNetwork } from "../logs/capture.ts";
import { extractClientIp, truncateIp } from "../logs/ip.ts";

const MAX_BLOB_LENGTH = 4096;

// Plafond de la lecture bufferisee du corps (ADR-0010 D7). JSON.parse de 337 Ko coute
// 0,92 ms, donc 512 Ko environ 1,4 ms, un ordre de grandeur sous les 11,60 ms de la
// derivation obligatoire. Ne s'applique QUE quand un body filter ou la capture detailed
// a besoin du corps : sans eux le corps reste en flux et n'est jamais bufferise.
const MAX_BUFFERED_BODY = 512 * 1024;

async function readBodyBounded(
  stream: ReadableStream<Uint8Array>,
  limit: number,
): Promise<Uint8Array | null> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

function jsonError(c: Context, status: number, error: string, message: string): Response {
  const response = c.json({ error, message }, status as 401);
  response.headers.set(FGP_SOURCE_HEADER, FGP_SOURCE_PROXY);
  return response;
}

function getServerSalt(): string {
  const salt = Deno.env.get("FGP_SALT");
  if (!salt) throw new Error("Server misconfigured: FGP_SALT missing");
  return salt;
}

async function buildAuthHeaders(config: BlobConfig): Promise<Headers> {
  const headers = new Headers();
  const auth = config.auth;
  const token = config.token ?? "";

  if (isAuthSpec(auth)) {
    if (auth.type === "headers") {
      for (const entry of auth.headers) {
        headers.set(entry.name, entry.value);
      }
      return headers;
    }
    const addonToken = await obtainAddonToken(token, auth.app, auth.addonId, auth.apiUrl);
    headers.set("Authorization", `Bearer ${addonToken}`);
    return headers;
  }

  if (auth === "bearer") {
    headers.set("Authorization", `Bearer ${token}`);
  } else if (auth === "basic") {
    headers.set("Authorization", `Basic ${btoa(":" + token)}`);
  } else if (auth === "scalingo-exchange") {
    const bearer = await obtainBearerViaExchange(token);
    headers.set("Authorization", `Bearer ${bearer}`);
  } else if (auth.startsWith("header:")) {
    headers.set(auth.slice("header:".length), token);
  }
  return headers;
}

// Denylist par classe (ADR-0009 §5). Une allowlist casserait l'agnosticisme : Accept,
// Range, If-None-Match et l'infini des en-tetes proprietaires doivent passer.
const DENIED_HEADERS = new Set([
  // hop-by-hop, RFC 9110 §7.6.1, et matiere premiere du request smuggling
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "proxy-connection",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  // authentification de l'appelant : la promesse du produit est qu'il ne detient pas
  // le credential de la cible, la laisser passer contourne le modele de scopes
  "authorization",
  "cookie",
  // provenance : FGP n'en pose aucun et n'en relaie aucun
  "forwarded",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-real-ip",
  "host",
]);

// Applique a ce que fournit l'appelant, avant que les en-tetes d'auth du blob ne soient
// poses : sinon cette passe supprimerait l'Authorization legitime issu du blob.
function stripCallerHeaders(headers: Headers): void {
  // Connection nomme lui-meme des en-tetes a ne pas relayer.
  const named = headers.get("connection");
  if (named) {
    for (const name of named.split(",")) headers.delete(name.trim());
  }
  for (const name of [...headers.keys()]) {
    const lower = name.toLowerCase();
    if (DENIED_HEADERS.has(lower) || lower.startsWith("x-fgp-")) {
      headers.delete(name);
    }
  }
}

// Passe finale, apres les en-tetes d'auth : le protocole du proxy et le Host ne doivent
// jamais partir, meme si un AuthSpec tentait de les poser.
function stripTransportHeaders(headers: Headers): void {
  headers.delete("host");
  for (const name of [...headers.keys()]) {
    if (name.toLowerCase().startsWith("x-fgp-")) headers.delete(name);
  }
}

async function forwardRequest(
  c: Context,
  config: BlobConfig,
  proxyPath: string,
  authHeaders: Headers,
): Promise<{ response: Response; decodingDisabled: boolean }> {
  const url = new URL(c.req.url);
  const parsed = parseTargetUrl(config.target);
  if ("error" in parsed) throw new Error("Invalid target");
  const targetUrl = buildUpstreamUrl(parsed.url, proxyPath, url.search);

  const headers = new Headers(c.req.raw.headers);
  stripCallerHeaders(headers);

  // Ordre impose : les headers d'auth ecrasent ceux de l'appelant (§11.1), puis le strip
  // transport ecrase tout le reste (§11.2). Sans cet ordre, un header d'auth nomme Host
  // ou X-FGP-Key aurait un comportement dependant de l'implementation.
  for (const [key, value] of authHeaders) {
    headers.set(key, value);
  }
  stripTransportHeaders(headers);

  const init: RequestInit = {
    method: c.req.method,
    headers,
  };

  if (!["GET", "HEAD"].includes(c.req.method)) {
    init.body = c.req.raw.body;
  }

  // Se lit sur les en-tetes reellement partis, apres toutes les passes : un Range comme
  // un Accept-Encoding peut venir de l'appelant comme d'un AuthSpec.
  const decodingDisabled = runtimeDecodingDisabled(headers);

  return { response: await egressFetch(targetUrl, init), decodingDisabled };
}

// Mesure sur Deno 2.9.5 : deflate, zstd et tout encodage inconnu ressortent bruts.
const RUNTIME_DECODED_ENCODINGS = new Set(["gzip", "br"]);

// Deux en-tetes de la requete sortante suffisent a desactiver le decodage automatique du
// runtime, auquel cas le corps revient compresse. Mesure sur Deno 2.9.5 : un Range, quelle
// que soit sa valeur et meme si la reponse finit en 200, parce que la reponse peut etre un
// fragment indecodable ; et un Accept-Encoding valant exactement identity, "identity, gzip"
// ou "identity;q=0" laissant au contraire le decodage actif.
function runtimeDecodingDisabled(sentHeaders: Headers): boolean {
  if (sentHeaders.has("Range")) return true;
  return (sentHeaders.get("Accept-Encoding") ?? "").trim().toLowerCase() === "identity";
}

function runtimeDecodedBody(response: Response, decodingDisabled: boolean): boolean {
  // Sans corps (HEAD, 304) rien n'a ete decode, et le Content-Length amont decrit alors
  // l'entite, pas ce qu'on transmet : il doit survivre.
  if (response.body === null || decodingDisabled) return false;
  const encoding = response.headers.get("Content-Encoding");
  return encoding !== null && RUNTIME_DECODED_ENCODINGS.has(encoding.trim().toLowerCase());
}

function handleUpstreamResponse(response: Response, decodingDisabled: boolean): Response {
  const headers = new Headers(response.headers);
  headers.delete("Set-Cookie");

  // Hop-by-hop (RFC 9110 §7.6.1) : decrit le framing du hop amont, pas celui qu'on emet,
  // et le serveur choisit le sien. Symetrique du strip deja fait sur la requete.
  headers.delete("Transfer-Encoding");

  // Deviation assumee a la transparence de l'ADR-0006, imposee par le runtime et non par
  // un choix produit : fetch a deja decode le corps a la reception, mais expose encore
  // les en-tetes amont qui le decrivaient compresse. Les relayer fait echouer tout client
  // qui les respecte (undici tente un gunzip sur du clair puis coupe sur "terminated"),
  // et le Content-Length perime tronque la reponse a la premiere lecture. Garder ces
  // en-tetes reviendrait a mentir sur ce qu'on envoie.
  // Le decodage n'etant ni universel ni garanti, la suppression est conditionnelle :
  // hors des cas couverts par runtimeDecodedBody, le corps ressort bel et bien compresse
  // et les en-tetes amont sont exacts, les supprimer casserait le client dans l'autre sens.
  if (runtimeDecodedBody(response, decodingDisabled)) {
    headers.delete("Content-Encoding");
    headers.delete("Content-Length");
  }

  headers.set(FGP_SOURCE_HEADER, FGP_SOURCE_UPSTREAM);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function handleProxy(c: Context, blobRaw: string, proxyPath: string): Promise<Response> {
  const startedAt = Date.now();

  if (blobRaw.length > MAX_BLOB_LENGTH) {
    return jsonError(c, 414, "blob_too_large", "Encrypted blob exceeds maximum size");
  }

  const clientKey = c.req.header("X-FGP-Key");
  if (!clientKey) {
    return jsonError(c, 401, "missing_key", "X-FGP-Key header is required");
  }

  // Pre-validation gratuite avant PBKDF2 : une cle hors format n'a jamais pu generer de
  // blob, et un blob sous le plancher structurel (IV 12 + tag GCM 16 + gzip minimal 20)
  // ne peut rien contenir. Filtre les sondes malformees, ne deplace pas le plafond d'un
  // attaquant delibere qui envoie une cle bien formee (ADR-0010 D8).
  if (checkClientKey(clientKey) !== null || blobRaw.length < 64) {
    return jsonError(c, 401, "invalid_credentials", "Unable to decrypt token");
  }

  const serverSalt = getServerSalt();

  let config;
  let derivedKey: CryptoKey;
  try {
    const decrypted = await decryptBlobWithKey(blobRaw, clientKey, serverSalt);
    config = decrypted.config;
    derivedKey = decrypted.derivedKey;
  } catch (err) {
    if (err instanceof BlobPolicyError) {
      return jsonError(c, 400, err.code, err.message);
    }
    return jsonError(c, 401, "invalid_credentials", "Unable to decrypt token");
  }

  if (isExpired(config)) {
    return jsonError(c, 410, "token_expired", "This token has expired");
  }

  const validAuthModes = ["bearer", "basic", "scalingo-exchange"];
  if (
    typeof config.auth === "string" &&
    !validAuthModes.includes(config.auth) && !config.auth.startsWith("header:")
  ) {
    return jsonError(c, 400, "invalid_auth_mode", "Unsupported auth mode: " + config.auth);
  }

  const logsActive = logsEnabled() && config.logs?.enabled === true;
  const detailedActive = logsActive && config.logs?.detailed === true;

  const methodsWithBody = ["POST", "PUT", "PATCH"];
  const hasBodyMethod = methodsWithBody.includes(c.req.method.toUpperCase());
  const rawContentType = c.req.header("content-type") ?? "";
  const isJsonContent = rawContentType.includes("application/json");
  const isMultipart = rawContentType.includes("multipart/");

  const scopesHaveBodyFilters = config.scopes.some(
    (s: Scope) => typeof s !== "string" && s.bodyFilters && s.bodyFilters.length > 0,
  );

  const shouldCaptureDetailed = detailedActive && hasBodyMethod && isJsonContent && !isMultipart;
  const needsRawBody = (hasBodyMethod && scopesHaveBodyFilters) || shouldCaptureDetailed;

  let parsedBody: unknown;
  let rawBodyBytes: Uint8Array | null = null;

  if (needsRawBody) {
    // Quand seule la capture detailed a besoin du corps, inutile de lire au-dela de ce
    // qui sera de toute facon tronque.
    const limit = (hasBodyMethod && scopesHaveBodyFilters)
      ? MAX_BUFFERED_BODY
      : readLogsConfig().detailedMaxKb * 1024 + 1;
    const cloned = c.req.raw.clone().body;
    rawBodyBytes = cloned ? await readBodyBounded(cloned, limit) : new Uint8Array(0);
    if (rawBodyBytes === null) {
      return jsonError(c, 413, "payload_too_large", "Request body is too large to inspect");
    }
    if (hasBodyMethod && scopesHaveBodyFilters) {
      if (isJsonContent) {
        try {
          parsedBody = JSON.parse(new TextDecoder().decode(rawBodyBytes));
        } catch {
          return await finishWithCapture(
            c,
            config,
            blobRaw,
            derivedKey,
            proxyPath,
            startedAt,
            logsActive,
            false,
            null,
            jsonError(c, 400, "invalid_body", "Request body is not valid JSON"),
          );
        }
      } else {
        return await finishWithCapture(
          c,
          config,
          blobRaw,
          derivedKey,
          proxyPath,
          startedAt,
          logsActive,
          false,
          null,
          jsonError(
            c,
            403,
            "scope_denied",
            "Body filters require application/json content type",
          ),
        );
      }
    }
  }

  const proxyPathWithQuery = proxyPath + new URL(c.req.url).search;
  const verdict = checkRequestAccess(config.scopes, c.req.method, proxyPathWithQuery, parsedBody);
  if (!verdict.allowed) {
    return await finishWithCapture(
      c,
      config,
      blobRaw,
      derivedKey,
      proxyPath,
      startedAt,
      logsActive,
      false,
      null,
      jsonError(c, 403, "scope_denied", "Insufficient permissions for this action"),
    );
  }

  // Apres la verification des scopes : un appelant hors scope ne doit ni declencher de
  // resolution DNS, ni apprendre quoi que ce soit sur la destination configuree.
  const parsedTarget = parseTargetUrl(config.target);
  if ("error" in parsedTarget) {
    return await finishWithCapture(
      c,
      config,
      blobRaw,
      derivedKey,
      proxyPath,
      startedAt,
      logsActive,
      false,
      null,
      jsonError(c, 403, "target_forbidden", "Target is not reachable by policy"),
    );
  }
  const hostDenial = await assertPublicHost(parsedTarget.url.hostname);
  if (hostDenial) {
    return await finishWithCapture(
      c,
      config,
      blobRaw,
      derivedKey,
      proxyPath,
      startedAt,
      logsActive,
      false,
      null,
      jsonError(c, 403, "target_forbidden", hostDenial.message),
    );
  }

  let authHeaders: Headers;
  try {
    authHeaders = await buildAuthHeaders(config);
  } catch (err) {
    const credentialsError = isScalingoAddonSpec(config.auth)
      ? { code: "auth_addon_failed", message: "Unable to obtain addon token" }
      : config.auth === "scalingo-exchange"
      ? { code: "auth_exchange_failed", message: "Unable to exchange Scalingo token" }
      : null;
    if (!credentialsError) throw err;
    return await finishWithCapture(
      c,
      config,
      blobRaw,
      derivedKey,
      proxyPath,
      startedAt,
      logsActive,
      false,
      null,
      jsonError(c, 502, credentialsError.code, credentialsError.message),
    );
  }

  let forwardResult;
  try {
    forwardResult = await forwardRequest(c, config, proxyPath, authHeaders);
  } catch {
    return await finishWithCapture(
      c,
      config,
      blobRaw,
      derivedKey,
      proxyPath,
      startedAt,
      logsActive,
      false,
      null,
      jsonError(c, 502, "upstream_unreachable", "Unable to reach target API"),
    );
  }

  const forwarded = handleUpstreamResponse(
    forwardResult.response,
    forwardResult.decodingDisabled,
  );
  return await finishWithCapture(
    c,
    config,
    blobRaw,
    derivedKey,
    proxyPath,
    startedAt,
    logsActive,
    shouldCaptureDetailed,
    rawBodyBytes,
    forwarded,
  );
}

async function finishWithCapture(
  c: Context,
  _config: BlobConfig,
  blobRaw: string,
  derivedKey: CryptoKey,
  proxyPath: string,
  startedAt: number,
  logsActive: boolean,
  shouldCaptureDetailed: boolean,
  rawBodyBytes: Uint8Array | null,
  response: Response,
): Promise<Response> {
  if (!logsActive) return response;

  const ts = Date.now();
  const durationMs = ts - startedAt;

  try {
    const blobId = await computeBlobId(blobRaw);
    const method = c.req.method.toUpperCase();
    const env = c.env as { info?: { remoteAddr?: { hostname?: string } } } | undefined;
    const ipPrefix = truncateIp(
      extractClientIp(c.req.raw.headers, env?.info?.remoteAddr?.hostname ?? ""),
    );

    captureNetwork({
      blobId,
      method,
      path: proxyPath,
      status: response.status,
      durationMs,
      ipPrefix,
      ts,
    });

    if (shouldCaptureDetailed && rawBodyBytes) {
      await captureDetailed({
        blobId,
        method,
        path: proxyPath,
        bodyRaw: rawBodyBytes,
        derivedKey,
        ts,
      });
    }
  } catch (err) {
    console.error("[fgp] logs capture failed:", err);
  }

  return response;
}

export function blobHeaderProxy(): MiddlewareHandler {
  return (c, next) => {
    const blobRaw = c.req.header("X-FGP-Blob");
    if (!blobRaw) return next();
    const url = new URL(c.req.url);
    const proxyPath = url.pathname;
    if (proxyPath === "/logs" || proxyPath.startsWith("/logs/")) return next();
    return handleProxy(c, blobRaw, proxyPath);
  };
}

export function proxyMiddleware(): MiddlewareHandler {
  return async (c) => {
    const url = new URL(c.req.url);
    const segments = url.pathname.split("/").filter(Boolean);

    if (segments.length < 2) {
      return jsonError(c, 400, "invalid_request", "Invalid proxy path");
    }

    // Decoupe du pathname brut apres le premier segment : reconstruire depuis les segments
    // filtres ecrasait les slashes repetes et le slash final, donnant au mode URL une
    // surface d'autorisation differente du mode header pour la meme requete.
    const blobRaw = segments[0];
    const blobStart = url.pathname.indexOf(blobRaw);
    const proxyPath = url.pathname.slice(blobStart + blobRaw.length) || "/";
    return await handleProxy(c, blobRaw, proxyPath);
  };
}
