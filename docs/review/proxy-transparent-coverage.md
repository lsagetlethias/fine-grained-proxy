# Matrice de couverture — Proxy transparent (AC-17)

**Date** : 2026-04-22
**Ref AC** : `docs/acceptance-criteria.md` — section AC-17
**Ref ADR** : `docs/adr/0006-proxy-transparent-erreurs-upstream.md`
**Statut** : **LIVRE** — `deno task verify` vert, 338 tests passed, tous AC-17.x couverts.

## Legende

- **OK** : test present et passe
- **OK (renamed)** : test existant conserve et renomme (ancien AC-10.x → AC-17.x)
- **OK (rewritten)** : test existant reecrit pour coller au nouveau modele
- **OK (new)** : nouveau test ajoute

---

## Matrice AC-17 → tests

| AC | Description | Fichier test | Statut |
|----|-------------|--------------|--------|
| AC-17.1 | Forward 2xx + `X-FGP-Source: upstream` | tests/testi/proxy-transparent.test.ts:68 | OK (new) |
| AC-17.2 | Forward upstream 401 transparent | tests/testi/proxy.test.ts:513 | OK (rewritten) |
| AC-17.3 | Forward upstream 403 transparent | tests/testi/proxy-transparent.test.ts:92 | OK (new) |
| AC-17.4 | Forward upstream 404 transparent | tests/testi/proxy-transparent.test.ts:120 | OK (new) |
| AC-17.5 | Forward upstream 429 + Retry-After | tests/testi/proxy.test.ts:551 | OK (rewritten) |
| AC-17.6 | Forward upstream 429 sans Retry-After | tests/testi/headers.test.ts:95 | OK (rewritten) |
| AC-17.7 | Forward upstream 500 transparent | tests/testi/proxy.test.ts:574 | OK (rewritten) |
| AC-17.8 | Forward upstream 502 transparent | tests/testi/proxy-transparent.test.ts:144 | OK (new) |
| AC-17.9 | Forward upstream 503 transparent | tests/testi/proxy-edge-cases.test.ts:259 | OK (rewritten) |
| AC-17.10 | Forward upstream 504 transparent | tests/testi/proxy-transparent.test.ts:167 | OK (new) |
| AC-17.11 | Status atypique (418, 507, 451, 226) | tests/testi/proxy-transparent.test.ts:189 | OK (new) |
| AC-17.12 | Body upstream preserve byte-exact | tests/testi/proxy-transparent.test.ts:213 | OK (new) |
| AC-17.13 | Body upstream vide preserve | tests/testi/proxy-transparent.test.ts:239 | OK (new) |
| AC-17.13 bis | 204 No Content forwarde sans body | tests/testi/proxy-transparent.test.ts:648 | OK (new) |
| AC-17.14 | Content-Type text/html preserve | tests/testi/headers.test.ts:135 | OK (renamed) |
| AC-17.15 | Content-Type application/xml preserve | tests/testi/proxy-transparent.test.ts:263 | OK (new) |
| AC-17.16 | Content-Type application/octet-stream preserve | tests/testi/proxy-transparent.test.ts:288 | OK (new) |
| AC-17.17 | Redirect 302 non suivi, Location preserve | tests/testi/proxy-transparent.test.ts:317 | OK (new) |
| AC-17.18 | Set-Cookie strippe (single) + `X-FGP-Source: upstream` | tests/testi/proxy.test.ts:629 | OK (renamed) |
| AC-17.19 | Set-Cookie strippe (multiples) | tests/testi/proxy-transparent.test.ts:351 | OK (new) |
| AC-17.20 | X-FGP-Source overwrite si present upstream | tests/testi/proxy-transparent.test.ts:380 | OK (new) |
| AC-17.21 | X-FGP-Source: proxy sur missing_key | tests/testi/proxy-transparent.test.ts:405 | OK (new) |
| AC-17.22 | X-FGP-Source: proxy sur blob_too_large | tests/testi/proxy-transparent.test.ts:426 | OK (new) |
| AC-17.23 | X-FGP-Source: proxy sur invalid_credentials | tests/testi/proxy-transparent.test.ts:447 | OK (new) |
| AC-17.24 | X-FGP-Source: proxy sur token_expired | tests/testi/proxy-transparent.test.ts:470 | OK (new) |
| AC-17.25 | X-FGP-Source: proxy sur invalid_auth_mode | tests/testi/proxy-transparent.test.ts:491 | OK (new) |
| AC-17.26 | X-FGP-Source: proxy sur invalid_body | tests/testi/proxy-transparent.test.ts:514 | OK (new) |
| AC-17.27 | X-FGP-Source: proxy sur scope_denied | tests/testi/proxy-transparent.test.ts:559 | OK (new) |
| AC-17.28 | X-FGP-Source: proxy sur invalid_request | tests/testi/proxy-transparent.test.ts:582 | OK (new) |
| AC-17.29 | Fetch throw → 502 upstream_unreachable + X-FGP-Source: proxy | tests/testi/proxy-edge-cases.test.ts:115 | OK (rewritten) |
| AC-17.30 | Fetch throw — tous modes reseau (connexion refusee, DNS, timeout, TLS) | tests/testi/proxy-transparent.test.ts:616 | OK (new) |
| AC-17.31 | app.onError → 500 internal_error + X-FGP-Source: proxy | tests/testi/onerror.test.ts:31 | OK (new) |
| AC-17.32 | app.onError — pas de leak du message original/stack | tests/testi/onerror.test.ts:59 | OK (new) |
| AC-17.33 | /api/list-apps — upstream non-ok → 502 upstream_list_apps_failed + X-FGP-Source: proxy | tests/testi/api-edge-cases.test.ts:111 | OK (rewritten) |
| AC-17.34 | /api/list-apps — fetch throw → 502 upstream_unreachable | tests/testi/api-edge-cases.test.ts:150 | OK (rewritten) |
| AC-17.35 | /api/list-apps — exchange fail → 401 token_exchange_failed + X-FGP-Source: proxy | tests/testi/api-edge-cases.test.ts:185 | OK (new) |

---

## Recap chiffre

- **Total AC-17** : 35 AC + 1 AC bis (17.13 bis 204 No Content) = **36 tests**.
- **OK (new)** : 26 nouveaux tests ajoutes.
- **OK (rewritten)** : 7 tests reecrits (anciens AC-10.x).
- **OK (renamed)** : 3 tests renommes (AC-9.5 → AC-17.18, AC-9.6 → AC-17.14, Set-Cookie single).
- **Verify** : `deno task verify` vert, **338 tests passed**.

---

## Points de vigilance consignes (post-livraison)

### AC-17.17 (redirect 302) — entorse documentee

Le test mock directement un upstream qui renvoie `302 + Location`. Il ne couvre pas le flow reel `fetch` default-follow. Le lead a tranche **option A** : on garde `fetch` en follow automatique, pas de `redirect: "manual"`. Entorse consignee dans l'ADR 0006 et ce document. Consequence : si un upstream renvoie un `302` vers une URL dans le meme domaine, `fetch` va le suivre et le client recevra la reponse finale, pas le `302`. Comportement acceptable compte tenu du cas d'usage (proxy API, pas proxy web). Re-ouvrir si un consommateur signale un besoin de voir les redirects.

### AC-17.33 — nuance par rapport au brief initial

Le brief initial parlait de "forward transparent" pour `/api/list-apps` upstream non-ok. Le dev a livre une variante : `502 upstream_list_apps_failed` avec shape FGP + `X-FGP-Source: proxy`. Difference de modele : l'endpoint `/api/list-apps` n'est pas un proxy, c'est un **helper UI** qui appelle Scalingo pour une UX de selection d'apps. Il n'y a pas de client qui attend une reponse Scalingo brute ici — c'est un call cote serveur FGP pour alimenter l'UI. Le choix de shape FGP est coherent avec la nature de l'endpoint. **OK valide**, cette variante est plus juste que le forward transparent initialement ecrit dans l'AC. Le libelle de l'AC-17.33 dans `docs/acceptance-criteria.md` a ete ecrit AVANT cet arbitrage — a reharmoniser avec le PO si desire, mais le comportement livre est le bon.

### AC-17.34/17.35 — pas de distinction fetch throw vs 401 upstream sur l'exchange

`exchangeToken` ne distingue pas "fetch throw reseau" vs "401 upstream auth" — les deux tombent dans le meme catch cote endpoint `/api/list-apps`. Le test AC-17.35 valide que toute erreur d'exchange tombe en `401 token_exchange_failed`. Pas de refactor pour distinguer : YAGNI tant qu'aucun consommateur UI n'a besoin de differencier les deux cas. A re-ouvrir si l'UI demande un message distinct "Scalingo auth down" vs "token invalide".

---

## Follow-up tickets (remontes au user par le lead)

Cas de durcissement regression **non bloquants** pour cette PR, a traiter en ticket dedie :

1. **Body binaire + Content-Length** — verifier explicitement que `Content-Length` upstream est preserve et que les bytes ne sont pas corrompus sur image/pdf/blob.
2. **Chunked transfer-encoding** — test de regression pour preserver le streaming upstream (pas de bufferisation excessive).
3. **Retry-After en date HTTP** (`Wed, 21 Oct 2015 07:28:00 GMT`) — verifier preservation quand l'upstream utilise le format date plutot que seconds.
4. **Regression AC-15.1 log token** — regression test explicite que le token interne du blob ne fuit pas dans stdout meme en forward transparent.

Ces 4 points ne creent pas de regression connue dans le code livre ; ils durciraient la couverture contre des regressions futures. Prioriser en backlog.
