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

## AC-18 — Feature `/logs` (stream logs par blob, opt-in)

> **Ref specs** : `docs/specs.md` §14. **Ref ADR** : `docs/adr/0007-logs-stream-in-memory-opt-in.md`.
>
> **Convention** : toutes les reponses d'erreur des routes `/logs*` suivent la shape FGP `{error, message}` avec `X-FGP-Source: proxy` (cf. AC-17).

### AC-18.1 Kill switch off — route `/logs` renvoie 404

**Given** la variable d'environnement `FGP_LOGS_ENABLED` est absente ou egale a `0`
**When** un client fait `GET /logs`
**Then** le serveur repond `404` avec `{"error": "not_found", "message": "Endpoint not found"}` et header `X-FGP-Source: proxy`

### AC-18.2 Kill switch off — route `/logs/stream` renvoie 404

**Given** `FGP_LOGS_ENABLED` absente ou `0`
**When** un client fait `GET /logs/stream` avec des headers `X-FGP-Blob` et `X-FGP-Key` valides
**Then** le serveur repond `404` sans tenter le dechiffrement du blob, header `X-FGP-Source: proxy`

### AC-18.3 Kill switch off — aucune capture ni allocation buffer

**Given** `FGP_LOGS_ENABLED` absente ou `0` et un blob avec `logs.enabled: true`
**When** une requete proxy passe par FGP
**Then** aucune entry network ni detailed n'est capturee, aucun ring buffer n'est cree pour ce blob (verifiable via inspection de la Map interne)

### AC-18.4 Kill switch on + blob sans champ `logs` — pas de capture

**Given** `FGP_LOGS_ENABLED=1` et un blob v2 ou v3 sans champ `logs`
**When** une requete proxy passe par FGP
**Then** aucune entry n'est capturee, aucun buffer n'est alloue pour ce blob

### AC-18.5 Kill switch on + `logs.enabled: true` — capture network

**Given** `FGP_LOGS_ENABLED=1` et un blob avec `logs: { enabled: true, detailed: false }`
**When** une requete proxy `GET /v1/apps/my-app` passe par FGP
**Then** une entry network est ajoutee au ring buffer du `blobId` correspondant

### AC-18.6 `detailed: true` sans `enabled: true` — traite comme logs off

**Given** `FGP_LOGS_ENABLED=1` et un blob avec `logs: { enabled: false, detailed: true }`
**When** une requete proxy POST JSON passe par FGP
**Then** aucune entry (ni network ni detailed) n'est capturee (defensive : `detailed` requiert `enabled: true`)

### AC-18.7 Blob v3 existant sans `logs` — pas de regression proxy

**Given** un blob v3 existant genere avant la feature, sans champ `logs`
**When** une requete proxy passe par FGP (scopes ok)
**Then** la requete est forwardee normalement, la reponse upstream est renvoyee telle quelle, et aucune capture n'a lieu

### AC-18.8 Blob v2 sans `logs` — pas de regression proxy

**Given** un blob v2 genere avant la feature
**When** une requete proxy passe par FGP
**Then** meme comportement qu'AC-18.7 : forward transparent, aucune capture

---

## AC-19 — Capture network

### AC-19.1 Schema strict network entry

**Given** `FGP_LOGS_ENABLED=1` et `logs.enabled: true`
**When** une requete proxy est capturee
**Then** l'entry network publiee contient exactement les champs `{type: "network", ts, method, path, status, durationMs, ipPrefix}` et aucun autre champ

### AC-19.2 Target upstream absent des entries network

**Given** un blob avec `target: "https://api.upstream.internal"` et `logs.enabled: true`
**When** une requete est capturee
**Then** ni le `target`, ni aucun fragment de l'URL upstream, n'apparaissent dans l'entry network (ni en clair, ni en header, ni dans un champ supplementaire)

### AC-19.3 Headers de la requete absents de l'entry network

**Given** une requete proxy avec headers `Authorization`, `Cookie`, `X-API-Key-Client`
**When** l'entry network est construite
**Then** aucun de ces headers ni leurs valeurs n'apparaissent dans l'entry

### AC-19.4 IP client IPv4 tronquee /24

**Given** une requete cliente depuis `203.0.113.42`
**When** l'entry network est emise
**Then** `ipPrefix` vaut `"203.0.113.0/24"` (dernier octet zerote, suffixe `/24`)

### AC-19.5 IP client IPv6 tronquee /48

**Given** une requete cliente depuis `2001:db8:abcd:1234::1`
**When** l'entry network est emise
**Then** `ipPrefix` vaut `"2001:db8:abcd::/48"` (seuls les 3 premiers groupes preserves, suffixe `/48`)

### AC-19.6 Path normalise — mode URL

**Given** une requete `GET /{blob}/v1/apps/my-app?page=2` (mode blob URL)
**When** l'entry network est capturee
**Then** `path` vaut `/v1/apps/my-app` (segment blob retire, query string retiree de `path`)

### AC-19.7 Path normalise — mode header

**Given** une requete `GET /v1/apps/my-app` avec header `X-FGP-Blob`
**When** l'entry network est capturee
**Then** `path` vaut `/v1/apps/my-app`

### AC-19.8 Status reflete la reponse effective au client

**Given** un forward upstream qui renvoie `401` (AC-17.2)
**When** l'entry network est emise
**Then** `status: 401`, identique au status renvoye au client par FGP

### AC-19.9 Status FGP capture

**Given** une requete rejetee par FGP avec `403 scope_denied`
**When** l'entry network est emise
**Then** `status: 403` (status FGP, pas upstream)

### AC-19.10 `durationMs` >= 0

**Given** une requete proxy quelconque
**When** l'entry network est emise
**Then** `durationMs` est un entier >= 0 representant la duree totale de traitement (entree request → envoi response)

### AC-19.11 Token upstream jamais dans l'entry

**Given** un blob avec `auth: "bearer"`, `token: "secret-upstream-xyz"` et capture activee
**When** la requete est forwardee et l'entry network publiee
**Then** la chaine `"secret-upstream-xyz"` n'apparait nulle part dans l'entry (aucun champ, ni metadata interne)

### AC-19.12 Cle client jamais dans l'entry

**Given** une requete avec `X-FGP-Key: client-key-abc`
**When** l'entry network est emise
**Then** la chaine `"client-key-abc"` n'apparait nulle part dans l'entry

---

## AC-20 — Capture detailed

### AC-20.1 POST JSON avec `detailed: true` — entry emise

**Given** `FGP_LOGS_ENABLED=1`, `logs: { enabled: true, detailed: true }`
**When** une requete `POST /deploy` avec `Content-Type: application/json` et body `{"branch":"main"}`
**Then** une entry detailed est ajoutee au ring buffer detailed en plus de l'entry network

### AC-20.2 PUT JSON — entry emise

**Given** meme config qu'AC-20.1
**When** une requete `PUT /v1/apps/my-app/env` avec body JSON
**Then** une entry detailed est emise

### AC-20.3 PATCH JSON — entry emise

**Given** meme config qu'AC-20.1
**When** une requete `PATCH /v1/apps/my-app` avec body JSON
**Then** une entry detailed est emise

### AC-20.4 GET — jamais de detailed

**Given** meme config qu'AC-20.1
**When** une requete `GET /v1/apps/my-app` arrive
**Then** l'entry network est emise mais aucune entry detailed n'est produite

### AC-20.5 DELETE — jamais de detailed

**Given** meme config qu'AC-20.1
**When** une requete `DELETE /v1/apps/my-app`
**Then** aucune entry detailed n'est produite

### AC-20.6 HEAD — jamais de detailed

**Given** meme config qu'AC-20.1
**When** une requete `HEAD /v1/apps/my-app`
**Then** aucune entry detailed n'est produite

### AC-20.7 Content-Type multipart — detailed skippe

**Given** meme config qu'AC-20.1
**When** une requete `POST /upload` avec `Content-Type: multipart/form-data; boundary=xxx`
**Then** l'entry network est emise mais aucune entry detailed (multipart exclu)

### AC-20.8 Schema strict detailed entry

**Given** une capture detailed reussie
**When** l'entry est publiee
**Then** elle contient exactement `{type: "detailed", ts, method, path, bodyEncrypted, truncated}` et aucun autre champ

### AC-20.9 Body chiffre AES-256-GCM avec cle derivee

**Given** un blob dont la cle derivee est `K = PBKDF2(client_key, server_salt)`
**When** un body est capture en detailed
**Then** `bodyEncrypted` est le resultat base64url de `IV (12 bytes) || AES-GCM_K(gzip(body))` (incluant le tag d'authentification GCM)

### AC-20.10 Round-trip chiffrement/dechiffrement body

**Given** un body request `{"branch":"main","env":"prod"}` capture en detailed
**When** le client UI `/logs` dechiffre `bodyEncrypted` avec `PBKDF2(client_key, server_salt)` + gunzip
**Then** le JSON obtenu est byte-identique au body envoye par le client initial

### AC-20.11 Body > `FGP_LOGS_DETAILED_MAX_KB` compresse — truncated

**Given** `FGP_LOGS_DETAILED_MAX_KB=32` et un body dont la version gzippee fait 40 KB
**When** l'entry detailed est construite
**Then** l'entry est emise avec `truncated: true` et le champ `bodyEncrypted` **absent** du JSON (pas de chaine vide, pas de troncature partielle)

### AC-20.12 Body juste sous la limite — non truncated

**Given** `FGP_LOGS_DETAILED_MAX_KB=32` et un body gzippe de 31 KB
**When** l'entry detailed est construite
**Then** l'entry contient `truncated: false` et `bodyEncrypted` non vide

### AC-20.13 Body juste au-dessus de la limite — truncated

**Given** `FGP_LOGS_DETAILED_MAX_KB=32` et un body gzippe de 33 KB
**When** l'entry detailed est construite
**Then** `truncated: true`, body omis integralement

### AC-20.14 `ts` partage entre network et detailed

**Given** une requete POST JSON qui declenche les deux captures
**When** les entries network et detailed sont emises
**Then** les deux entries portent le meme `ts` (timestamp unique pour la requete)

### AC-20.15 `method` et `path` coherents entre network et detailed

**Given** meme requete qu'AC-20.14
**When** les deux entries sont emises
**Then** `method` et `path` sont identiques entre les deux entries

### AC-20.16 IV unique par entry detailed

**Given** deux requetes identiques avec meme body capturees en detailed
**When** on compare les `bodyEncrypted` des deux entries
**Then** les ciphertexts sont differents (IV aleatoire 12 bytes a chaque chiffrement)

### AC-20.17 Body plain text libere apres chiffrement

**Given** une requete POST JSON capturee en detailed
**When** la capture est terminee
**Then** aucune reference au body en clair n'est conservee dans la struct de l'entry ou du ring buffer (verifiable par inspection memoire : seul `bodyEncrypted` subsiste)

---

## AC-21 — Ring buffer

### AC-21.1 Cap network par defaut

**Given** `FGP_LOGS_BUFFER_NETWORK=50` (defaut) et un blob en capture active
**When** 60 requetes consecutives sont capturees
**Then** le ring buffer network ne contient que les 50 entries les plus recentes (FIFO, eviction des 10 plus anciennes)

### AC-21.2 Cap detailed par defaut

**Given** `FGP_LOGS_BUFFER_DETAILED=10` (defaut) et un blob avec `detailed: true`
**When** 15 requetes POST JSON sont capturees
**Then** le ring buffer detailed ne contient que les 10 entries les plus recentes

### AC-21.3 Cap network configurable

**Given** `FGP_LOGS_BUFFER_NETWORK=5`
**When** 10 requetes sont capturees
**Then** le ring buffer ne contient que 5 entries

### AC-21.4 Cap detailed configurable

**Given** `FGP_LOGS_BUFFER_DETAILED=3`
**When** 5 entries detailed sont produites
**Then** le ring buffer detailed ne contient que 3 entries

### AC-21.5 Isolation stricte entre deux blobs

**Given** deux blobs A et B avec `logs.enabled: true`
**When** des requetes sont capturees en parallele sur les deux blobs
**Then** les entries du blob A ne se retrouvent jamais dans le ring buffer du blob B, et inversement (verification par `blobId` distinct)

### AC-21.6 Isolation — stream A ne voit que les logs A

**Given** deux blobs A et B actifs, stream SSE ouvert pour A
**When** une requete sur B est capturee
**Then** aucun event n'est publie sur le stream A

### AC-21.7 FIFO ordre preserve

**Given** un ring buffer network de taille 3, avec 3 entries (t1 < t2 < t3)
**When** une 4e entry t4 arrive
**Then** le buffer contient `[t2, t3, t4]` dans cet ordre (t1 evincee, plus ancienne en tete)

---

## AC-22 — Purge sur inactivite

### AC-22.1 Buffer libere apres inactivite

**Given** `FGP_LOGS_INACTIVITY_MIN=10` et un blob dont le dernier event date de 11 minutes
**When** le timer de purge (ou un acces paresseux) s'execute
**Then** le ring buffer et le topic pub/sub du blob sont liberes (Map interne ne contient plus le `blobId`)

### AC-22.2 Stream actif empeche la purge

**Given** un blob avec buffer actif et une connexion SSE ouverte, aucun event nouveau depuis 15 minutes
**When** la purge d'inactivite s'execute
**Then** le buffer et le topic restent alloues tant que le stream SSE est connecte

### AC-22.3 Nouvel event reset le timer

**Given** un blob avec buffer actif, dernier event il y a 9 minutes (`FGP_LOGS_INACTIVITY_MIN=10`)
**When** une nouvelle requete est capturee et ajoutee au buffer
**Then** le compteur d'inactivite redemarre depuis le nouvel event, le buffer n'est pas purge

### AC-22.4 Reconnect apres purge — buffer vide

**Given** un blob dont le buffer vient d'etre purge pour inactivite
**When** un nouveau stream SSE est ouvert sans `since`
**Then** le stream ouvre avec un buffer vide (pas d'historique), puis bascule en live des qu'une nouvelle requete est capturee

---

## AC-23 — Stream SSE

### AC-23.1 Headers manquants — 401

**Given** `FGP_LOGS_ENABLED=1`
**When** `GET /logs/stream` sans header `X-FGP-Blob` ni `X-FGP-Key`
**Then** le serveur repond `401` avec `{"error": "missing_key", ...}` et `X-FGP-Source: proxy`

### AC-23.2 Dechiffrement blob echoue — 401

**Given** `GET /logs/stream` avec `X-FGP-Blob` et `X-FGP-Key` mais la cle est incorrecte
**When** le serveur tente de dechiffrer
**Then** reponse `401` avec `{"error": "invalid_credentials", ...}` et `X-FGP-Source: proxy`

### AC-23.3 Blob valide sans `logs.enabled` — 403

**Given** `GET /logs/stream` avec blob valide dont `logs.enabled !== true` (absent, false, ou objet absent)
**When** le serveur inspecte la config
**Then** reponse `403` avec `{"error": "logs_not_enabled", ...}` et `X-FGP-Source: proxy`

### AC-23.4 Blob valide avec `logs.enabled` + kill switch off — 404

**Given** blob avec `logs.enabled: true` mais `FGP_LOGS_ENABLED=0`
**When** `GET /logs/stream`
**Then** reponse `404` (cf. AC-18.2), le kill switch court-circuite avant toute verification blob

### AC-23.5 Blob expire — 410

**Given** `GET /logs/stream` avec blob valide dont le TTL est expire
**When** le serveur verifie le TTL
**Then** reponse `410` avec `{"error": "token_expired", ...}` et `X-FGP-Source: proxy`

### AC-23.6 Deux connexions simultanees — 409 sur la seconde

**Given** un stream SSE deja ouvert pour le `blobId` X
**When** un second `GET /logs/stream` arrive avec le meme blob+cle
**Then** le second est refuse avec `409` et `{"error": "logs_stream_conflict", ...}`, `X-FGP-Source: proxy`, le premier reste actif

### AC-23.7 Cloture premiere connexion libere le slot

**Given** un stream SSE ouvert puis ferme cote client (abort/disconnect)
**When** un nouveau `GET /logs/stream` arrive pour le meme blob
**Then** la nouvelle connexion est acceptee (slot libere)

### AC-23.8 Flush initial du ring buffer

**Given** un ring buffer network contenant 3 entries (t1, t2, t3) et aucun `since` en query
**When** un client ouvre le stream
**Then** les 3 entries sont envoyees en events `log` dans l'ordre chronologique (t1, t2, t3) avant tout event live

### AC-23.9 Stream live apres flush

**Given** stream ouvert et flush initial termine
**When** une nouvelle requete est capturee
**Then** l'entry correspondante est publiee immediatement sur le stream en `event: log`

### AC-23.10 Heartbeat ping toutes les 15s

**Given** stream ouvert sans nouvel event
**When** 15 secondes s'ecoulent
**Then** le serveur emet `event: ping\ndata: {}\n\n` (heartbeat periodique, payload vide `{}`)

### AC-23.11 Format SSE strict — event log

**Given** une entry a publier
**When** le serveur l'ecrit sur le stream
**Then** le flux contient exactement `event: log\ndata: <json>\n\n` (double newline de terminaison, pas de champ `id` ni `retry`)

### AC-23.12 Format SSE strict — event ping

**Given** un heartbeat
**When** le serveur l'emet
**Then** le flux contient exactement `event: ping\ndata: {}\n\n`

### AC-23.13 Content-Type SSE

**Given** un stream SSE ouvert avec succes
**When** le client lit les headers de reponse
**Then** `Content-Type: text/event-stream` et `X-FGP-Source: proxy` sont presents

### AC-23.14 Blob trop volumineux — 414

**Given** `GET /logs/stream` avec `X-FGP-Blob` > 4 KB
**When** le serveur inspecte la taille
**Then** reponse `414` avec `{"error": "blob_too_large", ...}` et `X-FGP-Source: proxy`, cohérent avec §8 du proxy principal

---

## AC-24 — Cursor reconnect

### AC-24.1 Flush filtre par `since`

**Given** un ring buffer avec entries a ts=100, 200, 300, 400
**When** le client ouvre le stream avec `?since=250`
**Then** le flush initial n'envoie que les entries a ts=300 et ts=400 (strict `ts > since`)

### AC-24.2 Sans `since` — flush complet

**Given** un ring buffer non vide
**When** le client ouvre le stream sans query `since`
**Then** toutes les entries actuelles du buffer sont envoyees dans l'ordre chronologique

### AC-24.3 `since` > dernier ts — flush vide

**Given** un ring buffer avec dernier event ts=500
**When** client ouvre avec `?since=600`
**Then** aucune entry n'est envoyee au flush, le stream attend les events live

### AC-24.4 `since` non entier — ignore ou 400

**Given** `?since=foo` (non parsable en nombre)
**When** le serveur ouvre le stream
**Then** le serveur repond `400` avec `{"error": "invalid_request", ...}` et `X-FGP-Source: proxy` (cursor invalide)

### AC-24.5 Reconnect sans doublons

**Given** un client a recu les entries ts=100, 200, 300, puis deconnecte
**When** il reconnecte avec `?since=300`
**Then** le serveur n'envoie pas l'entry ts=300 (strict `>`), et envoie les entries posterieures eventuellement presentes

### AC-24.6 Reconnect sans perte tant que dans le buffer

**Given** un client a recu jusqu'a ts=300, ring buffer contient maintenant ts=300, 400, 500
**When** il reconnecte avec `?since=300`
**Then** les entries ts=400 et ts=500 sont envoyees au flush, aucune perte

### AC-24.7 Reconnect apres eviction — perte partielle acceptee

**Given** ring buffer de taille 50, le client avait recu jusqu'a ts=100 mais les 100 entries suivantes ont evince les entries <= 100
**When** client reconnecte avec `?since=100`
**Then** le flush envoie les 50 entries actuelles (toutes avec ts > 100), pas de garantie de completude au-dela de la capacite du ring buffer

---

## AC-25 — Schema JSON des events

### AC-25.1 Discriminator `type: "network"`

**Given** un event network parse en JSON par le client
**When** il lit le champ `type`
**Then** la valeur est strictement `"network"`, et les champs `{ts, method, path, status, durationMs, ipPrefix}` sont tous presents et typés (number/string)

### AC-25.2 Discriminator `type: "detailed"`

**Given** un event detailed parse en JSON par le client
**When** il lit `type`
**Then** la valeur est strictement `"detailed"`, et les champs `{ts, method, path, truncated}` sont presents. `bodyEncrypted` est present si et seulement si `truncated === false` (discriminated union secondaire)

### AC-25.3 Schema network — aucun champ supplementaire

**Given** un event network serialise
**When** on liste les cles du JSON
**Then** l'ensemble est exactement `{type, ts, method, path, status, durationMs, ipPrefix}` (pas de `target`, pas de `headers`, pas de `body`, pas d'`ip` complete)

### AC-25.4 Schema detailed — aucun champ supplementaire

**Given** un event detailed serialise
**When** on liste les cles du JSON
**Then** l'ensemble est `{type, ts, method, path, truncated}` + eventuellement `bodyEncrypted` (present uniquement si `truncated === false`). Aucune autre cle (pas de `headers`, pas de `target`, pas de `body`)

### AC-25.5 Types stricts

**Given** un event quelconque
**When** on type-check les valeurs
**Then** `ts: number`, `method: string`, `path: string`, `status: number`, `durationMs: number`, `ipPrefix: string`, `truncated: boolean`. `bodyEncrypted` quand present : `string` (base64url non vide)

---

## AC-26 — UI `/logs` et formulaire

### AC-26.1 Page `/logs` sans blob en sessionStorage — formulaire

**Given** `FGP_LOGS_ENABLED=1` et `sessionStorage` vide
**When** l'utilisateur charge `GET /logs`
**Then** la page affiche le formulaire d'auth (champ blob + champ cle + bouton « Connecter ») comme decrit en §14.13

### AC-26.2 Soumission blob+cle valides — stream ouvert

**Given** formulaire affiche avec `FGP_LOGS_ENABLED=1` et un blob+cle correspondant a un blob `logs.enabled: true`
**When** l'utilisateur clique « Connecter »
**Then** le JS client fait `fetch` streaming vers `/logs/stream` avec les headers, le stream s'ouvre et l'UI bascule sur la vue stream (statut « Connecte »)

### AC-26.3 Soumission blob invalide — message d'erreur

**Given** formulaire affiche, utilisateur saisit un blob corrompu ou une cle incorrecte
**When** il clique « Connecter »
**Then** l'UI affiche le message « Blob ou cle invalide — impossible de dechiffrer. » (cf. §14.13), reste sur le formulaire

### AC-26.4 Soumission blob sans `logs.enabled` — message 403

**Given** blob+cle valides mais blob dont `logs.enabled !== true`
**When** utilisateur se connecte
**Then** UI affiche « Les logs ne sont pas actives pour ce blob. Activez-les dans la configuration avant de reessayer. »

### AC-26.5 sessionStorage — pas localStorage

**Given** soumission reussie du formulaire
**When** le client persiste blob+cle
**Then** les valeurs sont dans `sessionStorage`, pas dans `localStorage` (verifiable via DevTools ou inspection explicite du code client)

### AC-26.6 F5 — re-ouvre le stream depuis sessionStorage

**Given** session stream ouverte, blob+cle en sessionStorage
**When** l'utilisateur rafraichit la page (F5)
**Then** la page lit le sessionStorage et re-ouvre automatiquement le stream sans re-saisie

### AC-26.7 Fermeture onglet — perte du contexte

**Given** session active, blob+cle en sessionStorage
**When** l'utilisateur ferme l'onglet puis rouvre `/logs`
**Then** sessionStorage est vide, le formulaire est affiche a nouveau

### AC-26.8 Bouton « Se deconnecter » — clear + close

**Given** stream ouvert
**When** utilisateur clique « Se deconnecter »
**Then** le stream SSE est ferme cote client, sessionStorage est vide, le formulaire est affiche

### AC-26.9 Kill switch off — page `/logs` renvoie 404

**Given** `FGP_LOGS_ENABLED=0`
**When** utilisateur charge `GET /logs`
**Then** reponse `404` (cf. AC-18.1), aucune page rendue

### AC-26.10 Detailed affiche le body dechiffre

**Given** stream ouvert avec blob `logs.detailed: true`, entry detailed recue
**When** le JS client dechiffre `bodyEncrypted` avec succes
**Then** la section « Bodies detailles » affiche le JSON dechiffre et decompresse

### AC-26.11 Detailed — echec dechiffrement affiche indicateur

**Given** stream ouvert, entry detailed recue dont le dechiffrement echoue cote client (par ex. cle incorrecte)
**When** l'UI traite l'event
**Then** l'entry est affichee avec l'indicateur « Dechiffrement impossible — verifiez votre cle » (§14.13), le stream continue sans bloquer

### AC-26.12 Detailed truncated — affichage dedie

**Given** un event detailed avec `truncated: true`
**When** l'UI rend l'entry
**Then** elle affiche « Body trop volumineux — non stocke » a la place du body

---

## AC-27 — Onglet « Logs » dans la page de configuration

### AC-27.1 Onglet visible quand kill switch on

**Given** `FGP_LOGS_ENABLED=1` et utilisateur sur la page `/` de generation
**When** la page rend les onglets
**Then** un onglet « Logs » est present a cote des onglets existants (Doc / Exemples / Changelog)

### AC-27.2 Onglet affiche message feature off quand kill switch off

**Given** `FGP_LOGS_ENABLED=0`
**When** utilisateur ouvre l'onglet « Logs » (si affiche)
**Then** le contenu affiche « Les logs sont desactives sur cette instance FGP. Contactez l'administrateur pour activer `FGP_LOGS_ENABLED`. »

### AC-27.3 Toggle principal pilote `logs.enabled`

**Given** onglet Logs ouvert, toggle « Activer les logs pour ce blob » decoche
**When** utilisateur coche puis genere le blob
**Then** le blob genere contient `logs: { enabled: true, detailed: false }`

### AC-27.4 Toggle detailed grise tant que enabled off

**Given** onglet Logs ouvert, toggle principal decoche
**When** utilisateur inspecte le toggle « Capturer aussi les bodies detailles »
**Then** ce toggle est disabled (grise) et ne peut pas etre coche

### AC-27.5 Toggle detailed actif quand enabled on

**Given** toggle principal coche
**When** utilisateur inspecte le toggle detailed
**Then** il devient interactif (pas grise)

### AC-27.6 Les deux toggles — blob contient `detailed: true`

**Given** les deux toggles coches
**When** utilisateur genere le blob
**Then** le blob contient `logs: { enabled: true, detailed: true }`

### AC-27.7 Aucun toggle coche — pas de champ `logs` dans le blob

**Given** onglet Logs ouvert avec aucun toggle coche
**When** utilisateur genere le blob
**Then** le blob genere est identique au comportement d'avant la feature : pas de champ `logs` (omis), pas de bump de version

### AC-27.8 Decocher detailed puis regenerer — detailed disparait

**Given** blob precedent avec detailed: true, utilisateur decoche `detailed`
**When** il regenere
**Then** le nouveau blob a `logs: { enabled: true, detailed: false }`

### AC-27.9 Warning visible sur detailed coche

**Given** toggle detailed coche
**When** utilisateur inspecte l'onglet
**Then** le warning « Activez uniquement si vous avez besoin d'inspecter les payloads... » (§14.13) est visible

### AC-27.10 Lien vers `/logs` present

**Given** onglet Logs ouvert, kill switch on
**When** utilisateur cherche comment consulter les logs
**Then** un lien « Ouvrir la console `/logs` » est affiche et pointe vers `/logs`

---

## AC-28 — Compatibilite blob et non-regression

### AC-28.1 Blob v3 sans `logs` — comportement identique a avant

**Given** un blob v3 existant (genere avant la feature, sans champ `logs`)
**When** il passe par le proxy FGP nouvelle version
**Then** la requete est forwardee, scopes verifies, auth appliquee, reponse renvoyee — comportement byte-identique a la version precedente

### AC-28.2 Blob v2 — comportement identique

**Given** un blob v2 existant
**When** il passe par le proxy
**Then** comportement identique, aucune capture, pas d'erreur de parsing

### AC-28.3 Blob avec `logs` present mais fausse valeur — gracieux

**Given** un blob avec `logs: { enabled: "true" }` (string au lieu de bool, malformation legere)
**When** le proxy lit la config
**Then** le proxy traite comme `logs.enabled !== true` (strict boolean check), pas de capture, pas d'erreur 500

### AC-28.4 Pas de bump de version — `v` reste 2 ou 3

**Given** un blob genere avec toggles logs coches
**When** on inspecte la version dans le blob dechiffre
**Then** `v` vaut 2 ou 3 selon la structure des scopes (cf. AC-13.5), jamais 4

### AC-28.5 Ancien proxy + blob recent avec `logs` — ignore gracieusement

**Given** un blob avec champ `logs` present, deploye sur une version du proxy qui ne connait pas la feature
**When** le proxy dechiffre et valide
**Then** la validation reussit (champ extra ignore par le parsing), le proxy fonctionne normalement sans capturer de logs

---

## AC-29 — Securite zero-trust

### AC-29.1 Dump memoire — aucun body en clair

**Given** un blob avec detailed actif et plusieurs entries capturees
**When** on inspecte le contenu du ring buffer (simulation de dump memoire via acces direct a la Map)
**Then** aucun body en clair n'est trouve ; seul du ciphertext `bodyEncrypted` est present

### AC-29.2 Dump memoire — pas de cle client

**Given** meme scenario qu'AC-29.1
**When** on inspecte les structures liees au blob
**Then** la cle client n'est trouvee nulle part dans le ring buffer, le topic, ou les entries (elle n'a jamais ete stockee)

### AC-29.3 Dump memoire — pas de token upstream

**Given** meme scenario
**When** on inspecte
**Then** le token upstream (bearer, basic, etc.) n'apparait pas dans les entries ou les structures de logs (il n'est utilise qu'au forward, jamais stocke dans la surface logs)

### AC-29.4 Endpoint `/api/salt` public suffit au dechiffrement client

**Given** le salt serveur public, la cle client, et un `bodyEncrypted` recu par SSE
**When** le JS client fait `PBKDF2(client_key, salt)` puis AES-GCM decrypt + gunzip
**Then** le body en clair est obtenu (le salt public n'est pas un secret, la cle client l'est)

---

## AC-30 — Endpoint `/logs/health`

### AC-30.1 Health expose `{enabled: true}` quand kill switch on

**Given** `FGP_LOGS_ENABLED=1`
**When** `GET /logs/health`
**Then** status 200, body `{"enabled": true}`, `X-FGP-Source: proxy`

### AC-30.2 Health expose `{enabled: false}` quand kill switch off

**Given** `FGP_LOGS_ENABLED=0` ou absent
**When** `GET /logs/health`
**Then** status 200, body `{"enabled": false}`. La route reste disponible pour permettre a l'UI config d'informer l'utilisateur. Aucune autre route `/logs*` ne repond (toutes en 404).

### AC-30.3 Health ne demande aucun header

**Given** `FGP_LOGS_ENABLED=1`
**When** `GET /logs/health` sans `X-FGP-Blob` ni `X-FGP-Key`
**Then** status 200, body `{"enabled": true}`. Endpoint public, pas d'auth.

## AC-31 — Auto-reconnect UI avec sessionStorage

### AC-31.1 Page `/logs` charge avec sessionStorage vide → formulaire

**Given** sessionStorage ne contient ni blob ni cle
**When** l'utilisateur charge `/logs`
**Then** le formulaire d'auth est affiche, aucun fetch vers `/logs/stream` n'est tente

### AC-31.2 Page `/logs` charge avec sessionStorage valide → auto-connect

**Given** sessionStorage contient un blob et une cle valides
**When** l'utilisateur charge `/logs`
**Then** l'UI affiche un etat « Connexion en cours... », tente `fetch /logs/stream`, bascule sur la vue stream en cas de succes

### AC-31.3 Auto-connect echoue → retour formulaire pre-rempli

**Given** sessionStorage contient un blob expire (ou tout autre cas d'erreur)
**When** l'UI tente auto-connect
**Then** l'UI rebascule sur le formulaire avec les champs pre-remplis et le message d'erreur approprie affiche

### AC-31.4 sessionStorage uniquement (pas localStorage)

**Given** l'utilisateur se connecte, ferme l'onglet, reouvre `/logs` dans un nouvel onglet
**When** la page charge
**Then** le formulaire est affiche vierge (sessionStorage est par onglet, pas persiste entre onglets)

## AC-32 — Identification visuelle du blob dans la vue stream

### AC-32.1 Affichage `<Nom> · <blobId 8>` apres dechiffrement

**Given** un blob avec champ `name: "Production Scalingo"`, connexion reussie
**When** l'UI dechiffre le blob et bascule sur la vue stream
**Then** l'en-tete affiche « Production Scalingo · abcd1234 » (blobId tronque a 8 chars hex)

### AC-32.2 `title` attribute porte le blobId 16 chars

**Given** meme scenario
**When** l'utilisateur survole l'identifiant affiche
**Then** le `title` attribute contient les 16 chars hex complets du `blobId`

### AC-32.3 Blob sans `name` → fallback sur blobId seul

**Given** un blob sans champ `name` (ancien blob)
**When** l'UI bascule sur la vue stream
**Then** l'en-tete affiche uniquement « abcd1234 » (pas de prefixe ni de separateur)

## AC-33 — Bouton revelation cle sur formulaire

### AC-33.1 Bouton œil masque → revelation

**Given** le formulaire `/logs` avec une cle saisie (input type="password" par defaut)
**When** l'utilisateur clique sur l'icone œil
**Then** l'input passe en type="text", la cle est visible, l'icone change d'etat

### AC-33.2 Bouton œil revelation → masque

**Given** l'input en type="text" (cle revelee)
**When** l'utilisateur reclique sur l'icone
**Then** l'input repasse en type="password", la cle est masquee

---

## Assumptions — proprietes cryptographiques non directement testables

Les enonces suivants decrivent des proprietes valides **par construction cryptographique** et non par un test d'integration direct. Ils sont maintenus ici pour documenter l'intention de securite, sans polluer la matrice de couverture AC.

### Assumption AC-crypto.1 Serveur ne peut pas dechiffrer sans cle client

Le server_salt et le `bodyEncrypted` seuls ne permettent pas de retrouver le body en clair. PBKDF2 requiert `client_key + server_salt`. En pratique : impossible cote serveur sans exfiltration de la cle cliente, ce qui sort du modele de menace FGP. Valide par la robustesse du PBKDF2-AES-256-GCM standard.

### Assumption AC-crypto.2 `blobId` non reversible

Le `blobId` (SHA-256 tronque a 16 chars hex = 64 bits) ne permet pas de retrouver le blob chiffre, ni a fortiori son contenu. Valide par irreversibilite SHA-256. Collisions negligeables a l'echelle d'un blob actif (2^-32 sur 2^32 blobs actifs simultanes).

---

## Remarques

- **Backward compat** : le proxy supporte les blobs v2 (scopes string uniquement) et v3 (scopes mixtes). Un blob v2 n'a jamais de body filters.

- **Deny-all** : toute requete qui ne matche aucun scope est refusee avec 403. Le proxy est une allowlist stricte.

- **Body parsing lazy** : le body n'est parse que si au moins un scope de la config contient des body filters ET que la methode est POST/PUT/PATCH. Les GET ne declenchent jamais le parsing du body.

- **Proxy transparent (AC-17)** : remplace le modele gateway precedent. Les anciens AC-10.1/10.2/10.3/10.4 (upstream 401 → 502 `upstream_auth_failed`, upstream 5xx → 502 `upstream_error`, 429 → 429 `rate_limited`) sont **obsoletes**. Les AC-15.3 (messages generiques sur erreurs FGP) restent valides pour les erreurs generees par le proxy uniquement ; les bodies forwardes depuis l'upstream peuvent contenir n'importe quoi, c'est la responsabilite du client et de la cible.
