# Criteres d'acceptation — Fine-Grained Proxy (FGP)

**Version** : 2.0
**Date** : 2026-04-09
**Ref specs** : `docs/specs.md` v3.0

---

## AC-1 — Dechiffrement et authentification

### AC-1.1 Header X-FGP-Key manquant

**Given** une requete vers `/{blob}/v1/apps`
**When** le header `X-FGP-Key` est absent
**Then** le proxy renvoie `401` avec `{"error": "missing_key", "message": "X-FGP-Key header is required"}`

### AC-1.2 Cle client invalide

**Given** une requete avec un blob valide et un header `X-FGP-Key` contenant une cle incorrecte
**When** le proxy tente de dechiffrer le blob
**Then** le proxy renvoie `401` avec `{"error": "invalid_credentials", "message": "Unable to decrypt token"}`

### AC-1.3 Blob corrompu

**Given** une requete avec un blob qui n'est pas du base64url valide ou dont le contenu est tronque
**When** le proxy tente de dechiffrer
**Then** le proxy renvoie `401` avec `{"error": "invalid_credentials", "message": "Unable to decrypt token"}`

### AC-1.4 Blob trop grand

**Given** une requete dont le premier segment de path (blob) depasse 4096 caracteres
**When** le proxy analyse la requete
**Then** le proxy renvoie `414` avec `{"error": "blob_too_large", "message": "Encrypted blob exceeds maximum size"}` avant toute tentative de dechiffrement

### AC-1.5 Dechiffrement reussi

**Given** une requete avec un blob valide et la bonne cle client dans `X-FGP-Key`
**When** le proxy dechiffre le blob
**Then** le proxy obtient le BlobConfig contenant `v`, `token`, `target`, `auth`, `scopes`, `createdAt`, `ttl` et poursuit la chaine de verification

### AC-1.6 Blob v2 et v3 supportes

**Given** un blob v2 (scopes string uniquement) ou un blob v3 (scopes mixtes string + ScopeEntry)
**When** le proxy dechiffre et valide le blob
**Then** les deux formats sont acceptes et traites correctement

### AC-1.7 Blob avec limites depassees

**Given** un blob v3 avec plus de 10 ScopeEntry, ou un body filter avec plus de 8 filtres, ou un dot-path a plus de 6 segments
**When** le proxy tente de valider le blob apres dechiffrement
**Then** le proxy renvoie `401` avec `{"error": "invalid_credentials", "message": "Unable to decrypt token"}` (malformed BlobConfig)

---

## AC-2 — Verification du TTL

### AC-2.1 Token non expire

**Given** un blob dechiffre avec `createdAt: 1712534400`, `ttl: 86400` et l'heure actuelle est `1712534400 + 43200` (12h apres creation)
**When** le proxy verifie le TTL
**Then** la requete est autorisee a continuer

### AC-2.2 Token expire

**Given** un blob dechiffre avec `createdAt: 1712534400`, `ttl: 86400` et l'heure actuelle est `1712534400 + 86401` (1 seconde apres expiration)
**When** le proxy verifie le TTL
**Then** le proxy renvoie `410` avec `{"error": "token_expired", "message": "This token has expired"}`

### AC-2.3 TTL zero (pas d'expiration)

**Given** un blob dechiffre avec `ttl: 0`
**When** le proxy verifie le TTL, quelle que soit l'heure actuelle
**Then** la requete est autorisee a continuer (pas d'expiration)

### AC-2.4 Limite exacte du TTL

**Given** un blob dechiffre avec `createdAt: T`, `ttl: 86400` et l'heure actuelle est exactement `T + 86400`
**When** le proxy verifie le TTL
**Then** la requete est autorisee (l'expiration est strictement superieure : `now > createdAt + ttl`)

---

## AC-3 — Scopes string (METHOD:PATH)

### AC-3.1 Scope exact match

**Given** un blob avec `scopes: ["GET:/v1/apps/my-app"]`
**When** la requete est `GET /v1/apps/my-app`
**Then** la requete est autorisee

### AC-3.2 Scope exact mismatch

**Given** un blob avec `scopes: ["GET:/v1/apps/my-app"]`
**When** la requete est `GET /v1/apps/other-app`
**Then** le proxy renvoie `403` avec `{"error": "scope_denied", "message": "Insufficient permissions for this action"}`

### AC-3.3 Wildcard path

**Given** un blob avec `scopes: ["GET:/v1/apps/*"]`
**When** la requete est `GET /v1/apps/my-app/containers`
**Then** la requete est autorisee (le `*` matche tout sous le prefixe)

### AC-3.4 Wildcard methode

**Given** un blob avec `scopes: ["*:/v1/apps/*"]`
**When** la requete est `POST /v1/apps/my-app/scale`
**Then** la requete est autorisee (le `*` en methode matche toutes les methodes)

### AC-3.5 Multi-methodes

**Given** un blob avec `scopes: ["GET|POST:/v1/apps/*"]`
**When** la requete est `POST /v1/apps/my-app/scale`
**Then** la requete est autorisee

### AC-3.6 Multi-methodes — methode non listee

**Given** un blob avec `scopes: ["GET|POST:/v1/apps/*"]`
**When** la requete est `DELETE /v1/apps/my-app`
**Then** le proxy renvoie `403` (`scope_denied`)

### AC-3.7 Full wildcard

**Given** un blob avec `scopes: ["*:*"]`
**When** n'importe quelle requete arrive
**Then** la requete est autorisee (acces total)

### AC-3.8 Methode case-insensitive

**Given** un blob avec `scopes: ["get:/v1/apps/*"]`
**When** la requete est `GET /v1/apps/my-app`
**Then** la requete est autorisee (matching case-insensitive sur la methode)

### AC-3.9 Scope sans separateur

**Given** un blob avec `scopes: ["/v1/apps/*"]`
**When** la requete est `POST /v1/apps/my-app`
**Then** la requete est autorisee (interprete comme `*:/v1/apps/*`)

### AC-3.10 Scopes additifs

**Given** un blob avec `scopes: ["GET:/v1/apps/*", "POST:/v1/apps/my-app/scale"]`
**When** la requete est `GET /v1/apps/my-app` ou `POST /v1/apps/my-app/scale`
**Then** les deux requetes sont autorisees (union des scopes)

### AC-3.11 Deny-all par defaut

**Given** un blob avec `scopes: ["GET:/v1/apps/*"]`
**When** la requete est `POST /v1/apps/my-app/scale`
**Then** le proxy renvoie `403` (`scope_denied`)

---

## AC-4 — Scopes structures (ScopeEntry) sans body filters

### AC-4.1 ScopeEntry sans body filters — match

**Given** un blob v3 avec `scopes: [{ methods: ["GET"], pattern: "/v1/apps/*" }]`
**When** la requete est `GET /v1/apps/my-app`
**Then** la requete est autorisee (ScopeEntry sans bodyFilters = equivalent a un scope string)

### AC-4.2 ScopeEntry methode mismatch

**Given** un blob v3 avec `scopes: [{ methods: ["POST"], pattern: "/v1/apps/*" }]`
**When** la requete est `GET /v1/apps/my-app`
**Then** le proxy renvoie `403` (`scope_denied`)

### AC-4.3 ScopeEntry multi-methodes

**Given** un blob v3 avec `scopes: [{ methods: ["GET", "POST"], pattern: "/v1/apps/*" }]`
**When** la requete est `POST /v1/apps/my-app/scale`
**Then** la requete est autorisee

### AC-4.4 Mix string et ScopeEntry

**Given** un blob v3 avec `scopes: ["GET:/healthz", { methods: ["POST"], pattern: "/v1/apps/*" }]`
**When** la requete est `GET /healthz`
**Then** la requete est autorisee (le scope string matche)

---

## AC-5 — Body filters

### AC-5.1 Body filter exact match

**Given** un blob v3 avec un ScopeEntry `{ methods: ["POST"], pattern: "/deploy", bodyFilters: [{ objectPath: "branch", objectValue: [{ type: "any", value: "main" }] }] }`
**When** la requete est `POST /deploy` avec body `{ "branch": "main" }`
**Then** la requete est autorisee

### AC-5.2 Body filter exact mismatch

**Given** le meme blob que AC-5.1
**When** la requete est `POST /deploy` avec body `{ "branch": "develop" }`
**Then** le proxy renvoie `403` (`scope_denied`)

### AC-5.3 Body filter champ absent

**Given** le meme blob que AC-5.1
**When** la requete est `POST /deploy` avec body `{ "ref": "main" }`
**Then** le proxy renvoie `403` (`scope_denied`) (le champ `branch` n'existe pas dans le body)

### AC-5.4 Body filter wildcard

**Given** un ScopeEntry avec `bodyFilters: [{ objectPath: "branch", objectValue: [{ type: "wildcard" }] }]`
**When** la requete a un body avec `{ "branch": "anything" }`
**Then** la requete est autorisee (le champ existe, valeur quelconque)

### AC-5.5 Body filter stringwildcard

**Given** un ScopeEntry avec `bodyFilters: [{ objectPath: "branch", objectValue: [{ type: "stringwildcard", value: "release/*" }] }]`
**When** la requete a un body avec `{ "branch": "release/1.2.3" }`
**Then** la requete est autorisee

### AC-5.6 Body filter stringwildcard mismatch

**Given** le meme blob que AC-5.5
**When** la requete a un body avec `{ "branch": "hotfix/1.2.3" }`
**Then** le proxy renvoie `403` (`scope_denied`)

### AC-5.7 Body filter OR (valeurs multiples)

**Given** un ScopeEntry avec `objectValue: [{ type: "any", value: "main" }, { type: "any", value: "master" }]`
**When** la requete a un body avec `{ "branch": "master" }`
**Then** la requete est autorisee (OR : au moins un matche)

### AC-5.8 Body filters AND (filtres multiples)

**Given** un ScopeEntry avec deux body filters : `branch = main` ET `source = github`
**When** la requete a un body avec `{ "branch": "main", "source": "github" }`
**Then** la requete est autorisee (AND : tous matchent)

### AC-5.9 Body filters AND partial failure

**Given** le meme blob que AC-5.8
**When** la requete a un body avec `{ "branch": "main", "source": "gitlab" }`
**Then** le proxy renvoie `403` (`scope_denied`) (le filtre `source` echoue)

### AC-5.10 Body filter dot-path (nested)

**Given** un ScopeEntry avec `bodyFilters: [{ objectPath: "deployment.git_ref", objectValue: [{ type: "any", value: "main" }] }]`
**When** la requete a un body avec `{ "deployment": { "git_ref": "main" } }`
**Then** la requete est autorisee

### AC-5.11 Body filter — not (exclusion)

**Given** un ScopeEntry avec `objectValue: [{ type: "not", value: { type: "any", value: "develop" } }]`
**When** la requete a un body avec `{ "branch": "main" }`
**Then** la requete est autorisee (`main` n'est pas `develop`)

### AC-5.12 Body filter — not match

**Given** le meme blob que AC-5.11
**When** la requete a un body avec `{ "branch": "develop" }`
**Then** le proxy renvoie `403` (`scope_denied`) (`develop` est exclu)

### AC-5.13 Body filter — and (composition)

**Given** un ScopeEntry avec `objectValue: [{ type: "and", value: [{ type: "not", value: { type: "any", value: "develop" } }, { type: "stringwildcard", value: "release/*" }] }]`
**When** la requete a un body avec `{ "branch": "release/1.0" }`
**Then** la requete est autorisee (pas "develop" ET matche "release/*")

### AC-5.14 Body filter — and failure

**Given** le meme blob que AC-5.13
**When** la requete a un body avec `{ "branch": "develop" }`
**Then** le proxy renvoie `403` (`scope_denied`) (la condition `not` echoue)

### AC-5.15 Body non JSON avec body filters

**Given** un blob avec des body filters et la requete a un content-type non JSON
**When** le proxy analyse la requete
**Then** le proxy renvoie `403` avec `{"error": "scope_denied", "message": "Body filters require application/json content type"}`

### AC-5.16 Body JSON invalide avec body filters

**Given** un blob avec des body filters et la requete a un content-type JSON mais un body non parsable
**When** le proxy analyse le body
**Then** le proxy renvoie `400` avec `{"error": "invalid_body", "message": "Request body is not valid JSON"}`

### AC-5.17 Body filter regex match

**Given** un ScopeEntry avec `bodyFilters: [{ objectPath: "branch", objectValue: [{ type: "regex", value: "^release/\\d+\\.\\d+" }] }]`
**When** la requete est `POST /deploy` avec body `{ "branch": "release/1.2.3" }`
**Then** la requete est autorisee

### AC-5.18 Body filter regex mismatch

**Given** le meme blob que AC-5.17
**When** la requete est `POST /deploy` avec body `{ "branch": "hotfix/1.2.3" }`
**Then** le proxy renvoie `403` (`scope_denied`)

### AC-5.19 Body filter regex invalide dans le blob

**Given** un blob v3 avec `{ type: "regex", value: "[invalid" }` (regex non compilable)
**When** le proxy valide le blob apres dechiffrement
**Then** le blob est rejete (regex invalide = malformed BlobConfig)

### AC-5.20 Requete GET avec ScopeEntry + body filters

**Given** un blob v3 avec un ScopeEntry `POST:/deploy` avec body filters
**When** la requete est `GET /deploy`
**Then** le ScopeEntry ne matche pas (methode mismatch). Si un autre scope autorise GET, la requete passe.

### AC-5.21 ScopeEntry avec body filters — body absent

**Given** un ScopeEntry avec body filters et une requete POST sans body
**When** le proxy evalue les body filters
**Then** le proxy renvoie `403` (`scope_denied`) (body undefined)

---

## AC-6 — Limites body filters

### AC-6.1 Profondeur and/not depassee

**Given** un blob v3 avec un ObjectValue imbrique a 5 niveaux de `and`/`not`
**When** le proxy valide le blob
**Then** le blob est rejete (profondeur max 4)

### AC-6.2 Trop de body filters par scope

**Given** un blob v3 avec un ScopeEntry contenant 9 body filters
**When** le proxy valide le blob
**Then** le blob est rejete (max 8 body filters par scope)

### AC-6.3 Trop de valeurs OR

**Given** un blob v3 avec un body filter contenant 17 valeurs dans objectValue
**When** le proxy valide le blob
**Then** le blob est rejete (max 16 valeurs OR par filtre)

### AC-6.4 Trop de ScopeEntry

**Given** un blob v3 avec 11 ScopeEntry structures
**When** le proxy valide le blob
**Then** le blob est rejete (max 10 ScopeEntry)

### AC-6.5 Dot-path trop profond

**Given** un blob v3 avec un body filter dont le dot-path est `a.b.c.d.e.f.g` (7 segments)
**When** le proxy valide le blob
**Then** le blob est rejete (max 6 segments)

### AC-6.6 not(wildcard) interdit

**Given** un blob v3 avec `{ type: "not", value: { type: "wildcard" } }`
**When** le proxy valide le blob
**Then** le blob est rejete

### AC-6.7 not(not(...)) interdit

**Given** un blob v3 avec `{ type: "not", value: { type: "not", value: ... } }`
**When** le proxy valide le blob
**Then** le blob est rejete

### AC-6.8 and vide interdit

**Given** un blob v3 avec `{ type: "and", value: [] }`
**When** le proxy valide le blob
**Then** le blob est rejete

### AC-6.9 and a un seul element interdit

**Given** un blob v3 avec `{ type: "and", value: [{ type: "any", value: "x" }] }`
**When** le proxy valide le blob
**Then** le blob est rejete

---

## AC-7 — Modes d'authentification

### AC-7.1 Mode bearer

**Given** un blob avec `auth: "bearer"` et `token: "my-secret-token"`
**When** le proxy forward vers l'API cible
**Then** le header `Authorization: Bearer my-secret-token` est envoye

### AC-7.2 Mode basic

**Given** un blob avec `auth: "basic"` et `token: "my-secret-token"`
**When** le proxy forward vers l'API cible
**Then** le header `Authorization: Basic {base64(":my-secret-token")}` est envoye

### AC-7.3 Mode scalingo-exchange

**Given** un blob avec `auth: "scalingo-exchange"` et `token: "tk-us-xxxx"`, et pas de bearer en cache
**When** le proxy forward vers l'API cible
**Then** le proxy fait l'exchange (tk-us-... → bearer via SCALINGO_AUTH_URL), met le bearer en cache, et forward avec `Authorization: Bearer {bearer}`

### AC-7.4 Mode header custom

**Given** un blob avec `auth: "header:X-API-Key"` et `token: "my-api-key"`
**When** le proxy forward vers l'API cible
**Then** le header `X-API-Key: my-api-key` est envoye

### AC-7.5 Mode d'auth invalide

**Given** un blob avec `auth: "oauth2"` (non supporte)
**When** le proxy analyse la config
**Then** le proxy renvoie `400` avec `{"error": "invalid_auth_mode", "message": "Unsupported auth mode: oauth2"}`

---

## AC-8 — Bearer cache (scalingo-exchange)

### AC-8.1 Bearer cache hit

**Given** une requete valide avec auth=scalingo-exchange, et un bearer en cache pour le meme token (cache non expire)
**When** le proxy forward
**Then** le proxy utilise le bearer en cache sans refaire l'exchange

### AC-8.2 Bearer cache TTL

**Given** un bearer mis en cache il y a 56 minutes (TTL cache = 55 min)
**When** une requete arrive avec le meme token Scalingo
**Then** le proxy considere le cache expire, fait un nouvel exchange, et met a jour le cache

### AC-8.3 Singleflight — un seul exchange par token

**Given** 3 requetes simultanees avec le meme token Scalingo et le bearer en cache expire
**When** les 3 requetes tentent un exchange
**Then** un seul exchange HTTP est execute. Les 2 autres requetes attendent le resultat de la Promise partagee.

### AC-8.4 Singleflight — echec propage

**Given** 3 requetes simultanees, exchange en cours via singleflight
**When** l'exchange echoue (API auth down)
**Then** les 3 requetes recoivent l'erreur `502` (`upstream_error`)

---

## AC-9 — Forward et headers

### AC-9.1 Header X-FGP-Key non forwarde

**Given** une requete valide avec `X-FGP-Key: secret`
**When** le proxy forward vers l'API cible
**Then** le header `X-FGP-Key` n'est pas present dans la requete envoyee a la cible

### AC-9.2 Header Host supprime

**Given** une requete vers `fgp.example.com`
**When** le proxy forward vers l'API cible
**Then** le header `Host` est supprime (le runtime resout le bon host a partir de target)

### AC-9.3 Query string preservee

**Given** une requete `GET /{blob}/v1/apps?page=2&per_page=10`
**When** le proxy forward vers l'API cible
**Then** l'URL cible inclut `?page=2&per_page=10`

### AC-9.4 Propagation des headers de reponse

**Given** l'API cible repond avec des headers `Content-Type`, `X-Request-Id`
**When** le proxy construit la reponse
**Then** tous ces headers sont propages au client

### AC-9.5 Filtrage de Set-Cookie

**Given** l'API cible repond avec un header `Set-Cookie`
**When** le proxy construit la reponse
**Then** le header `Set-Cookie` est supprime de la reponse

### AC-9.6 Reponse non-JSON

**Given** l'API cible repond avec `Content-Type: text/html` et un body HTML
**When** le proxy construit la reponse
**Then** le proxy propage le body HTML et le `Content-Type: text/html` tels quels

---

## AC-10 — Gestion des erreurs upstream — **OBSOLETE (remplace par AC-17)**

> Cette section decrit l'ancien modele gateway (transformation des erreurs upstream). Elle est **remplacee par AC-17** (proxy transparent). Conservee ici pour historique uniquement. Les tests correspondants doivent etre reecrits selon AC-17.

### AC-10.1 ~~Token rejete par la cible~~ — **obsolete, voir AC-17.2**

### AC-10.2 ~~API cible indisponible~~ — **obsolete, voir AC-17.7/17.9 (forward) et AC-17.29 (fetch throw)**

### AC-10.3 ~~Rate limit upstream (429)~~ — **obsolete, voir AC-17.5**

### AC-10.4 ~~Rate limit sans Retry-After~~ — **obsolete, voir AC-17.6**

---

## AC-11 — Ordre de verification

### AC-11.1 Verification sequentielle

**Given** une requete avec un blob > 4KB, un header manquant, un TTL expire et un scope invalide
**When** le proxy traite la requete
**Then** le proxy renvoie `414` (premiere erreur dans l'ordre) et ne tente pas les verifications suivantes

### AC-11.2 TTL verifie avant les scopes

**Given** une requete valide (blob ok, cle ok) mais avec un TTL expire et un scope invalide
**When** le proxy traite la requete
**Then** le proxy renvoie `410` (TTL) et pas `403` (scope)

### AC-11.3 Auth mode verifie apres TTL

**Given** une requete avec un blob dechifffre contenant un auth mode invalide et un TTL expire
**When** le proxy traite la requete
**Then** le proxy renvoie `410` (TTL en premier dans l'ordre)

---

## AC-12 — Endpoints internes

### AC-12.1 Health check

**Given** une requete `GET /healthz`
**When** le serveur est en fonctionnement
**Then** le serveur repond `200` avec `{"status": "ok"}`

### AC-12.2 Salt public

**Given** une requete `GET /api/salt`
**When** la variable d'environnement `FGP_SALT` est configuree
**Then** le serveur repond `200` avec `{"salt": "<valeur_du_salt>"}`

### AC-12.3 UI de configuration

**Given** une requete `GET /`
**When** le serveur est en fonctionnement
**Then** le serveur repond `200` avec une page HTML contenant le formulaire de generation

### AC-12.4 OpenAPI spec

**Given** une requete `GET /api/openapi.json`
**When** le serveur est en fonctionnement
**Then** le serveur repond `200` avec la spec OpenAPI 3.0 au format JSON

### AC-12.5 Swagger UI

**Given** une requete `GET /api/docs`
**When** le serveur est en fonctionnement
**Then** le serveur repond `200` avec l'interface Swagger UI

### AC-12.6 API 404

**Given** une requete vers `/api/unknown`
**When** le serveur traite la requete
**Then** le serveur repond `404` avec `{"error": "not_found", "message": "Endpoint not found"}`

---

## AC-13 — Generation d'URL (POST /api/generate)

### AC-13.1 Generation reussie

**Given** un POST `/api/generate` avec `{ token, target, auth, scopes, ttl }` valides
**When** le serveur genere l'URL
**Then** le serveur repond `200` avec `{ url, key }` ou `url` contient le blob chiffre et `key` est une cle client UUID

### AC-13.2 Body invalide

**Given** un POST `/api/generate` avec des champs manquants ou invalides
**When** le serveur valide le body
**Then** le serveur repond `400` avec `{"error": "invalid_body", "message": "Missing or invalid fields"}`

### AC-13.3 Blob trop grand a la generation

**Given** un POST `/api/generate` dont le blob genere depasse 4096 caracteres
**When** le serveur verifie la taille
**Then** le serveur repond `400` avec `{"error": "blob_too_large", "message": "Generated blob exceeds 4KB limit. Reduce scopes."}`

### AC-13.4 Limites body filters a la generation

**Given** un POST `/api/generate` avec plus de 10 ScopeEntry, ou un body filter avec 17 valeurs OR
**When** le serveur valide les limites
**Then** le serveur repond `400` avec `{"error": "scope_limit_exceeded", "message": "..."}` (message descriptif)

### AC-13.5 Version automatique

**Given** un POST `/api/generate` avec uniquement des scopes string
**When** le serveur genere le blob
**Then** le blob contient `v: 2`

**Given** un POST `/api/generate` avec au moins un ScopeEntry
**When** le serveur genere le blob
**Then** le blob contient `v: 3`

### AC-13.6 Combinaisons interdites a la generation

**Given** un POST `/api/generate` avec un body filter contenant `not(wildcard)` ou `not(not(...))` ou `and([])` ou `and` a 1 element
**When** le serveur valide les limites
**Then** le serveur repond `400` avec un message descriptif

---

## AC-14 — Chiffrement / dechiffrement du blob

### AC-14.1 Round-trip chiffrement

**Given** un JSON blob valide, une cle client et un salt serveur
**When** le blob est chiffre (gzip + PBKDF2 + AES-256-GCM) puis dechiffre avec les memes parametres
**Then** le JSON obtenu est identique a l'original

### AC-14.2 Cle differente = echec

**Given** un blob chiffre avec la cle client A
**When** on tente de dechiffrer avec la cle client B
**Then** le dechiffrement echoue

### AC-14.3 Salt different = echec

**Given** un blob chiffre avec le salt S1
**When** on tente de dechiffrer avec le salt S2
**Then** le dechiffrement echoue

### AC-14.4 IV unique

**Given** deux chiffrements du meme blob avec les memes cle et salt
**When** on compare les deux blobs chiffres
**Then** les blobs sont differents (IV aleatoire a chaque chiffrement)

---

## AC-15 — Securite transversale

### AC-15.1 Token jamais expose

**Given** une requete proxy valide
**When** le proxy construit la reponse (succes ou erreur)
**Then** le token de l'API cible n'apparait jamais dans le body, les headers, ni les logs stdout

### AC-15.2 Cle client jamais forwardee

**Given** une requete avec `X-FGP-Key`
**When** le proxy forward vers l'API cible
**Then** le header `X-FGP-Key` n'est pas transmis

### AC-15.3 Messages d'erreur generiques

**Given** une erreur FGP (400, 401, 403, 410)
**When** le proxy construit la reponse d'erreur
**Then** le message ne contient aucun detail sur la configuration interne (pas de scopes configures, pas de TTL restant, pas de target)

---

## AC-16 — UI de configuration

### AC-16.1 Layout split

**Given** l'utilisateur accede a `/` sur un ecran large
**When** la page est rendue
**Then** le formulaire occupe 3/5 de la largeur a gauche, le guide d'utilisation 2/5 a droite

### AC-16.2 Presets

**Given** l'utilisateur clique sur le preset "Scalingo"
**When** le formulaire est pre-rempli
**Then** la cible est `https://api.osc-fr1.scalingo.com`, l'auth est `scalingo-exchange`

### AC-16.3 Chargement des apps Scalingo

**Given** l'utilisateur a saisi un token Scalingo valide et l'auth est `scalingo-exchange`
**When** l'utilisateur clique "Charger les apps"
**Then** le serveur FGP fait l'exchange + listing via `/api/list-apps` et affiche la liste

### AC-16.4 Body filters UI

**Given** l'utilisateur a defini un scope POST ou PUT
**When** le panel body filters est visible
**Then** l'utilisateur peut ajouter des body filters avec dot-path, type (exact, wildcard, glob, not, and) et valeurs

### AC-16.5 Dark mode

**Given** l'OS de l'utilisateur est en dark mode
**When** la page est rendue
**Then** l'UI utilise le theme sombre (dark mode via media query)

### AC-16.6 Warning TTL zero

**Given** l'utilisateur selectionne "Pas d'expiration"
**When** l'option est selectionnee
**Then** un warning explicite est affiche

### AC-16.7 Refus si blob trop grand

**Given** le blob genere depasse 4096 caracteres
**When** le serveur repond a la generation
**Then** l'UI affiche un message d'erreur

---

## AC-17 — Proxy transparent et provenance des erreurs

> **Contexte** : FGP est un proxy, pas une gateway. Toute reponse qui provient reellement de l'upstream est forwardee telle quelle (status, headers, body). Seules les erreurs que FGP genere lui-meme (avant ou apres le forward) portent une shape `{error, message}`. La provenance est explicite via le header `X-FGP-Source`.
>
> **Convention `X-FGP-Source`** :
> - `proxy` : la reponse est generee par FGP (erreur FGP ou 502 fetch throw ou 500 onError).
> - `upstream` : la reponse provient de l'API cible (status, headers et body forwardes sans transformation, sauf `Set-Cookie` strippe).
>
> **Liste exhaustive des erreurs FGP (shape `{error, message}` + `X-FGP-Source: proxy`)** : `missing_key` (401), `blob_too_large` (414), `invalid_credentials` (401), `token_expired` (410), `invalid_auth_mode` (400), `invalid_body` (400), `scope_denied` (403), `upstream_unreachable` (502), `invalid_request` (400), `internal_error` (500 via `app.onError`).

### AC-17.1 Forward transparent — status 2xx

**Given** une requete valide (blob ok, scopes ok) et l'API cible repond `200` avec un body JSON
**When** le proxy construit la reponse
**Then** le proxy renvoie `200` avec le body JSON de l'upstream tel quel, le header `X-FGP-Source: upstream`, et sans transformation

### AC-17.2 Forward transparent — upstream 401

**Given** une requete valide (blob ok, scopes ok)
**When** l'API cible renvoie `401` avec un body `{"error": "invalid_token"}` et un `Content-Type: application/json`
**Then** le proxy renvoie `401` (status original), le body `{"error": "invalid_token"}` exact, le `Content-Type: application/json` et le header `X-FGP-Source: upstream`

### AC-17.3 Forward transparent — upstream 403

**Given** une requete valide
**When** l'API cible renvoie `403` avec un body et des headers custom
**Then** le proxy renvoie `403`, body et headers forwardes tels quels, header `X-FGP-Source: upstream`

### AC-17.4 Forward transparent — upstream 404

**Given** une requete valide
**When** l'API cible renvoie `404`
**Then** le proxy renvoie `404`, body et headers forwardes tels quels, header `X-FGP-Source: upstream`

### AC-17.5 Forward transparent — upstream 429 avec Retry-After

**Given** une requete valide
**When** l'API cible renvoie `429` avec header `Retry-After: 30` et un body arbitraire
**Then** le proxy renvoie `429`, body upstream preserve, header `Retry-After: 30` preserve, header `X-FGP-Source: upstream`

### AC-17.6 Forward transparent — upstream 429 sans Retry-After

**Given** une requete valide
**When** l'API cible renvoie `429` sans header `Retry-After`
**Then** le proxy renvoie `429`, body upstream preserve, pas de header `Retry-After` ajoute, header `X-FGP-Source: upstream`

### AC-17.7 Forward transparent — upstream 500

**Given** une requete valide (blob ok, scopes ok, fetch a reussi)
**When** l'API cible renvoie `500` avec un body
**Then** le proxy renvoie `500`, body upstream preserve, header `X-FGP-Source: upstream` (pas de reecriture en `502 upstream_error`)

### AC-17.8 Forward transparent — upstream 502

**Given** une requete valide
**When** l'API cible renvoie `502`
**Then** le proxy renvoie `502` (status original de l'upstream), body upstream preserve, header `X-FGP-Source: upstream`

### AC-17.9 Forward transparent — upstream 503

**Given** une requete valide
**When** l'API cible renvoie `503`
**Then** le proxy renvoie `503`, body upstream preserve, header `X-FGP-Source: upstream`

### AC-17.10 Forward transparent — upstream 504

**Given** une requete valide
**When** l'API cible renvoie `504`
**Then** le proxy renvoie `504`, body upstream preserve, header `X-FGP-Source: upstream`

### AC-17.11 Forward transparent — status atypique

**Given** une requete valide
**When** l'API cible renvoie un status atypique (`418`, `507`, `451`, `226`)
**Then** le proxy renvoie le status original, body upstream preserve, header `X-FGP-Source: upstream`

### AC-17.12 Body upstream preserve exactement

**Given** une requete valide
**When** l'API cible renvoie un body arbitraire (JSON, bytes, multi-ligne, vide)
**Then** le body recu par le client est byte-identique a celui emis par l'upstream

### AC-17.13 Body upstream vide preserve

**Given** une requete valide
**When** l'API cible renvoie un status `500` (ou autre) avec un body vide
**Then** le proxy renvoie le status original avec un body vide (pas de JSON `{error, message}` injecte), header `X-FGP-Source: upstream`

### AC-17.14 Content-Type upstream preserve — text/html

**Given** une requete valide
**When** l'API cible renvoie `Content-Type: text/html` avec un body HTML
**Then** le proxy propage `Content-Type: text/html` tel quel et le body HTML sans forcer du JSON

### AC-17.15 Content-Type upstream preserve — application/xml

**Given** une requete valide
**When** l'API cible renvoie `Content-Type: application/xml` avec un body XML
**Then** le proxy propage le `Content-Type: application/xml` tel quel et le body XML

### AC-17.16 Content-Type upstream preserve — application/octet-stream

**Given** une requete valide
**When** l'API cible renvoie `Content-Type: application/octet-stream` avec un body binaire
**Then** le proxy propage `Content-Type: application/octet-stream` et les bytes sans corruption

### AC-17.17 Redirects upstream — non suivi

**Given** une requete valide
**When** l'API cible renvoie `302` avec `Location: /new-path`
**Then** le proxy renvoie `302`, header `Location` preserve, header `X-FGP-Source: upstream` (le proxy ne suit pas la redirection cote serveur, c'est au client de la suivre)

### AC-17.18 Set-Cookie upstream strippe — header unique

**Given** une requete valide
**When** l'API cible renvoie un header `Set-Cookie: session=abc`
**Then** le `Set-Cookie` est absent de la reponse FGP, les autres headers sont preserves, `X-FGP-Source: upstream` est present

### AC-17.19 Set-Cookie upstream strippe — headers multiples

**Given** une requete valide
**When** l'API cible renvoie plusieurs headers `Set-Cookie` (session, csrf, preferences)
**Then** aucun `Set-Cookie` n'est present dans la reponse FGP (tous strippes)

### AC-17.20 X-FGP-Source overwrite si present dans l'upstream

**Given** une requete valide
**When** l'API cible renvoie un header `X-FGP-Source: attacker-value` dans sa reponse
**Then** la reponse FGP contient `X-FGP-Source: upstream` (la valeur de l'upstream est ecrasee sans etat d'ame)

### AC-17.21 Header X-FGP-Source: proxy — missing_key

**Given** une requete sans `X-FGP-Key`
**When** le proxy repond `401 missing_key`
**Then** la reponse contient `X-FGP-Source: proxy` et la shape `{"error": "missing_key", "message": "..."}`

### AC-17.22 Header X-FGP-Source: proxy — blob_too_large

**Given** une requete avec un blob > 4096 chars
**When** le proxy repond `414 blob_too_large`
**Then** la reponse contient `X-FGP-Source: proxy` et la shape `{"error": "blob_too_large", ...}`

### AC-17.23 Header X-FGP-Source: proxy — invalid_credentials

**Given** une requete avec une cle client invalide ou blob corrompu
**When** le proxy repond `401 invalid_credentials`
**Then** la reponse contient `X-FGP-Source: proxy`

### AC-17.24 Header X-FGP-Source: proxy — token_expired

**Given** une requete avec un blob dont le TTL est expire
**When** le proxy repond `410 token_expired`
**Then** la reponse contient `X-FGP-Source: proxy`

### AC-17.25 Header X-FGP-Source: proxy — invalid_auth_mode

**Given** une requete avec un blob contenant un mode d'auth non supporte
**When** le proxy repond `400 invalid_auth_mode`
**Then** la reponse contient `X-FGP-Source: proxy`

### AC-17.26 Header X-FGP-Source: proxy — invalid_body

**Given** une requete POST avec body filters actifs et body JSON malforme
**When** le proxy repond `400 invalid_body`
**Then** la reponse contient `X-FGP-Source: proxy`

### AC-17.27 Header X-FGP-Source: proxy — scope_denied

**Given** une requete dont la methode ou le path ne matche aucun scope autorise
**When** le proxy repond `403 scope_denied`
**Then** la reponse contient `X-FGP-Source: proxy`

### AC-17.28 Header X-FGP-Source: proxy — invalid_request

**Given** une requete `/{blob}` sans path de proxy (segments.length < 2)
**When** le proxy repond `400 invalid_request`
**Then** la reponse contient `X-FGP-Source: proxy`

### AC-17.29 Fetch throw → 502 upstream_unreachable

**Given** une requete valide
**When** `fetch` throw (connexion refusee, DNS fail, timeout, network error)
**Then** le proxy renvoie `502` avec `{"error": "upstream_unreachable", "message": "Unable to reach target API"}` et header `X-FGP-Source: proxy`

### AC-17.30 Fetch throw — tous les modes reseau

**Given** une requete valide
**When** `fetch` rejette avec (a) connexion refusee, (b) DNS fail, (c) timeout, (d) TLS error
**Then** dans les 4 cas, le proxy repond `502 upstream_unreachable` + `X-FGP-Source: proxy`

### AC-17.31 Exception non catchee → 500 internal_error (app.onError)

**Given** une requete vers une route FGP et un code middleware qui throw (ex: `FGP_SALT` absent → `getServerSalt` throw)
**When** l'exception remonte sans etre catchee
**Then** `app.onError` renvoie `500` avec `{"error": "internal_error", "message": "Internal server error"}` et header `X-FGP-Source: proxy`

### AC-17.32 Exception non catchee — pas de leak

**Given** une exception non catchee avec un message sensible (ex: `"FGP_SALT missing"`, stack trace)
**When** `app.onError` construit la reponse
**Then** le message renvoye au client est generique (`"Internal server error"`), le message d'origine et la stack ne fuitent pas dans le body ni dans les headers

### AC-17.33 Harmonisation endpoint `/api/list-apps` — upstream non-ok

**Given** un POST `/api/list-apps` avec token valide, exchange ok
**When** l'API Scalingo `/v1/apps` renvoie un status non-2xx (ex: `500`, `403`)
**Then** la reponse FGP est `502` avec `{"error": "upstream_list_apps_failed", "message": "Scalingo returned {status}"}` et `X-FGP-Source: proxy` (l'endpoint n'est pas un proxy transparent : c'est un helper FGP avec shape dediee, le status upstream est seulement reporte dans le message pour le debug)

### AC-17.34 Harmonisation endpoint `/api/list-apps` — fetch throw

**Given** un POST `/api/list-apps` avec token valide, exchange ok
**When** le fetch vers `/v1/apps` throw (connexion refusee, timeout, etc.)
**Then** la reponse FGP est `502` avec `{"error": "upstream_unreachable", "message": "..."}` et `X-FGP-Source: proxy`

### AC-17.35 Harmonisation endpoint `/api/list-apps` — exchange failed

**Given** un POST `/api/list-apps` avec token Scalingo invalide
**When** l'exchange `exchangeToken` throw
**Then** la reponse FGP est `401` avec `{"error": "token_exchange_failed", "message": "..."}` et `X-FGP-Source: proxy` (erreur FGP, pas un forward upstream puisque c'est une etape interne)

---

## Remarques

- **Backward compat** : le proxy supporte les blobs v2 (scopes string uniquement) et v3 (scopes mixtes). Un blob v2 n'a jamais de body filters.

- **Deny-all** : toute requete qui ne matche aucun scope est refusee avec 403. Le proxy est une allowlist stricte.

- **Body parsing lazy** : le body n'est parse que si au moins un scope de la config contient des body filters ET que la methode est POST/PUT/PATCH. Les GET ne declenchent jamais le parsing du body.

- **Proxy transparent (AC-17)** : remplace le modele gateway precedent. Les anciens AC-10.1/10.2/10.3/10.4 (upstream 401 → 502 `upstream_auth_failed`, upstream 5xx → 502 `upstream_error`, 429 → 429 `rate_limited`) sont **obsoletes**. Les AC-15.3 (messages generiques sur erreurs FGP) restent valides pour les erreurs generees par le proxy uniquement ; les bodies forwardes depuis l'upstream peuvent contenir n'importe quoi, c'est la responsabilite du client et de la cible.
