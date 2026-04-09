# Recette e2e — Deno Deploy live

**Date** : 2026-04-09
**Instance** : `https://fgp-proxy-k33qkz7bersy.lsagetlethias.deno.net`
**Methode** : script Deno + curl automatise, tests contre httpbin.org comme target proxy

---

## 1. Endpoints de base

| # | Test | Attendu | Resultat | Verdict |
|---|------|---------|----------|---------|
| 1 | `GET /healthz` | 200, `{"status":"ok"}` | 200, `{"status":"ok"}` | **OK** |
| 2 | `GET /api/openapi.json` | 200, spec OpenAPI valide | 200, spec JSON avec schemas (Error, GenerateBody, etc.) | **OK** |
| 3 | `GET /api/docs` | 200, Swagger UI HTML | 200, HTML avec SwaggerUI + ref `/api/openapi.json` | **OK** |
| 4 | `GET /static/client.js` | 200, JavaScript | 200, JS bundle minifie | **OK** |
| 5 | `GET /` | 200, page HTML FR | 200, HTML `lang="fr"`, Tailwind, formulaire config | **OK** |

## 2. Generation de token (POST /api/generate)

| # | Test | Payload | Attendu | Resultat | Verdict |
|---|------|---------|---------|----------|---------|
| 6 | Generate simple scopes | `token=test-fake-token, target=httpbin.org, scopes=[GET:/get, GET:/headers], ttl=300` | 200, `{url, key}` | 200, url (289 chars) + key retournes | **OK** |

## 3. Proxy e2e — scoping et auth

Token genere au step 6, target = httpbin.org.

| # | Test | Methode | Header X-FGP-Key | Attendu | Resultat | Verdict |
|---|------|---------|-------------------|---------|----------|---------|
| 7a | Proxy GET /get | GET | valide | 200 (httpbin echo) | 200 | **OK** |
| 7b | Proxy GET /headers (scope OK) | GET | valide | 200 | 200 | **OK** |
| 7c | Proxy POST /post (scope denied) | POST | valide | 403 scope_denied | 403 | **OK** |
| 7d | Proxy GET /get (missing key) | GET | absent | 401 missing_key | 401 | **OK** |
| 7e | Proxy GET /get (wrong key) | GET | `wrong-key-definitely-invalid` | 401 invalid_credentials | 401 | **OK** |

## 4. Body filters e2e

Token genere avec body filter : `objectPath=name, objectValue=[{type:any, value:allowed}]`, scope `POST:/post`.

| # | Test | Body | Attendu | Resultat | Verdict |
|---|------|------|---------|----------|---------|
| 8a | POST /post body autorise | `{"name":"allowed"}` | 200 | 200 | **OK** |
| 8b | POST /post body refuse | `{"name":"denied"}` | 403 | 403 | **OK** |

---

## Verdict global

**13/13 tests OK. Instance Deno Deploy pleinement operationnelle.**

Tous les mecanismes critiques sont valides en production :
- Chiffrement/dechiffrement du blob URL avec double cle (client key + server salt)
- Scoping par methode HTTP et pattern de route
- Body filters avec validation de contenu
- Auth : rejet sans cle, rejet avec mauvaise cle
- TTL encode dans le blob
- Proxy transparent vers la target (httpbin.org)
