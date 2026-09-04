# Criteres d'acceptation : Fine-Grained Proxy (FGP)

**Version** : 3.1
**Date** : 2026-09-03
**Ref specs** : `docs/specs.md` v4.0
**Ref review** : `docs/review/challenge-v4-byok-llms.md` (challenge des specs), `docs/review/ac-coverage-v4.md` (matrice)

---

## AC-1 : Dechiffrement et authentification

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

## AC-2 : Verification du TTL

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

## AC-3 : Scopes string (METHOD:PATH)

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

### AC-3.6 Multi-methodes : methode non listee

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

## AC-4 : Scopes structures (ScopeEntry) sans body filters

### AC-4.1 ScopeEntry sans body filters : match

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

## AC-5 : Body filters

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

### AC-5.11 Body filter : not (exclusion)

**Given** un ScopeEntry avec `objectValue: [{ type: "not", value: { type: "any", value: "develop" } }]`
**When** la requete a un body avec `{ "branch": "main" }`
**Then** la requete est autorisee (`main` n'est pas `develop`)

### AC-5.12 Body filter : not match

**Given** le meme blob que AC-5.11
**When** la requete a un body avec `{ "branch": "develop" }`
**Then** le proxy renvoie `403` (`scope_denied`) (`develop` est exclu)

### AC-5.13 Body filter : and (composition)

**Given** un ScopeEntry avec `objectValue: [{ type: "and", value: [{ type: "not", value: { type: "any", value: "develop" } }, { type: "stringwildcard", value: "release/*" }] }]`
**When** la requete a un body avec `{ "branch": "release/1.0" }`
**Then** la requete est autorisee (pas "develop" ET matche "release/*")

### AC-5.14 Body filter : and failure

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

### AC-5.21 ScopeEntry avec body filters : body absent

**Given** un ScopeEntry avec body filters et une requete POST sans body
**When** le proxy evalue les body filters
**Then** le proxy renvoie `403` (`scope_denied`) (body undefined)

---

## AC-6 : Limites body filters

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

## AC-7 : Modes d'authentification

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

## AC-8 : Bearer cache (scalingo-exchange)

### AC-8.1 Bearer cache hit

**Given** une requete valide avec auth=scalingo-exchange, et un bearer en cache pour le meme token (cache non expire)
**When** le proxy forward
**Then** le proxy utilise le bearer en cache sans refaire l'exchange

### AC-8.2 Bearer cache TTL

**Given** un bearer mis en cache il y a 56 minutes (TTL cache = 55 min)
**When** une requete arrive avec le meme token Scalingo
**Then** le proxy considere le cache expire, fait un nouvel exchange, et met a jour le cache

### AC-8.3 Singleflight : un seul exchange par token

**Given** 3 requetes simultanees avec le meme token Scalingo et le bearer en cache expire
**When** les 3 requetes tentent un exchange
**Then** un seul exchange HTTP est execute. Les 2 autres requetes attendent le resultat de la Promise partagee.

### AC-8.4 Singleflight : echec propage

**Given** 3 requetes simultanees, exchange en cours via singleflight
**When** l'exchange echoue (API auth down)
**Then** les 3 requetes recoivent l'erreur `502` (`upstream_error`)

---

## AC-9 : Forward et headers

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

## AC-10 : Gestion des erreurs upstream (OBSOLETE, remplace par AC-17)

> Cette section decrit l'ancien modele gateway (transformation des erreurs upstream). Elle est **remplacee par AC-17** (proxy transparent). Conservee ici pour historique uniquement. Les tests correspondants doivent etre reecrits selon AC-17.

### AC-10.1 ~~Token rejete par la cible~~ (obsolete, voir AC-17.2)

### AC-10.2 ~~API cible indisponible~~ (obsolete, voir AC-17.7/17.9 (forward) et AC-17.29 (fetch throw))

### AC-10.3 ~~Rate limit upstream (429)~~ (obsolete, voir AC-17.5)

### AC-10.4 ~~Rate limit sans Retry-After~~ (obsolete, voir AC-17.6)

---

## AC-11 : Ordre de verification

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

## AC-12 : Endpoints internes

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

## AC-13 : Generation d'URL (POST /api/generate)

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

## AC-14 : Chiffrement / dechiffrement du blob

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

## AC-15 : Securite transversale

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

## AC-16 : UI de configuration

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

## AC-17 : Proxy transparent et provenance des erreurs

> **Contexte** : FGP est un proxy, pas une gateway. Toute reponse qui provient reellement de l'upstream est forwardee telle quelle (status, headers, body). Seules les erreurs que FGP genere lui-meme (avant ou apres le forward) portent une shape `{error, message}`. La provenance est explicite via le header `X-FGP-Source`.
>
> **Convention `X-FGP-Source`** :
> - `proxy` : la reponse est generee par FGP (erreur FGP ou 502 fetch throw ou 500 onError).
> - `upstream` : la reponse provient de l'API cible (status, headers et body forwardes sans transformation, sauf `Set-Cookie` strippe).
>
> **Liste exhaustive des erreurs FGP (shape `{error, message}` + `X-FGP-Source: proxy`)** : `missing_key` (401), `blob_too_large` (414), `invalid_credentials` (401), `token_expired` (410), `invalid_auth_mode` (400), `invalid_body` (400), `scope_denied` (403), `upstream_unreachable` (502), `invalid_request` (400), `internal_error` (500 via `app.onError`).

### AC-17.1 Forward transparent : status 2xx

**Given** une requete valide (blob ok, scopes ok) et l'API cible repond `200` avec un body JSON
**When** le proxy construit la reponse
**Then** le proxy renvoie `200` avec le body JSON de l'upstream tel quel, le header `X-FGP-Source: upstream`, et sans transformation

### AC-17.2 Forward transparent : upstream 401

**Given** une requete valide (blob ok, scopes ok)
**When** l'API cible renvoie `401` avec un body `{"error": "invalid_token"}` et un `Content-Type: application/json`
**Then** le proxy renvoie `401` (status original), le body `{"error": "invalid_token"}` exact, le `Content-Type: application/json` et le header `X-FGP-Source: upstream`

### AC-17.3 Forward transparent : upstream 403

**Given** une requete valide
**When** l'API cible renvoie `403` avec un body et des headers custom
**Then** le proxy renvoie `403`, body et headers forwardes tels quels, header `X-FGP-Source: upstream`

### AC-17.4 Forward transparent : upstream 404

**Given** une requete valide
**When** l'API cible renvoie `404`
**Then** le proxy renvoie `404`, body et headers forwardes tels quels, header `X-FGP-Source: upstream`

### AC-17.5 Forward transparent : upstream 429 avec Retry-After

**Given** une requete valide
**When** l'API cible renvoie `429` avec header `Retry-After: 30` et un body arbitraire
**Then** le proxy renvoie `429`, body upstream preserve, header `Retry-After: 30` preserve, header `X-FGP-Source: upstream`

### AC-17.6 Forward transparent : upstream 429 sans Retry-After

**Given** une requete valide
**When** l'API cible renvoie `429` sans header `Retry-After`
**Then** le proxy renvoie `429`, body upstream preserve, pas de header `Retry-After` ajoute, header `X-FGP-Source: upstream`

### AC-17.7 Forward transparent : upstream 500

**Given** une requete valide (blob ok, scopes ok, fetch a reussi)
**When** l'API cible renvoie `500` avec un body
**Then** le proxy renvoie `500`, body upstream preserve, header `X-FGP-Source: upstream` (pas de reecriture en `502 upstream_error`)

### AC-17.8 Forward transparent : upstream 502

**Given** une requete valide
**When** l'API cible renvoie `502`
**Then** le proxy renvoie `502` (status original de l'upstream), body upstream preserve, header `X-FGP-Source: upstream`

### AC-17.9 Forward transparent : upstream 503

**Given** une requete valide
**When** l'API cible renvoie `503`
**Then** le proxy renvoie `503`, body upstream preserve, header `X-FGP-Source: upstream`

### AC-17.10 Forward transparent : upstream 504

**Given** une requete valide
**When** l'API cible renvoie `504`
**Then** le proxy renvoie `504`, body upstream preserve, header `X-FGP-Source: upstream`

### AC-17.11 Forward transparent : status atypique

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

### AC-17.14 Content-Type upstream preserve : text/html

**Given** une requete valide
**When** l'API cible renvoie `Content-Type: text/html` avec un body HTML
**Then** le proxy propage `Content-Type: text/html` tel quel et le body HTML sans forcer du JSON

### AC-17.15 Content-Type upstream preserve : application/xml

**Given** une requete valide
**When** l'API cible renvoie `Content-Type: application/xml` avec un body XML
**Then** le proxy propage le `Content-Type: application/xml` tel quel et le body XML

### AC-17.16 Content-Type upstream preserve : application/octet-stream

**Given** une requete valide
**When** l'API cible renvoie `Content-Type: application/octet-stream` avec un body binaire
**Then** le proxy propage `Content-Type: application/octet-stream` et les bytes sans corruption

### AC-17.17 Redirects upstream : non suivi

**Given** une requete valide
**When** l'API cible renvoie `302` avec `Location: /new-path`
**Then** le proxy renvoie `302`, header `Location` preserve, header `X-FGP-Source: upstream` (le proxy ne suit pas la redirection cote serveur, c'est au client de la suivre)

### AC-17.18 Set-Cookie upstream strippe : header unique

**Given** une requete valide
**When** l'API cible renvoie un header `Set-Cookie: session=abc`
**Then** le `Set-Cookie` est absent de la reponse FGP, les autres headers sont preserves, `X-FGP-Source: upstream` est present

### AC-17.19 Set-Cookie upstream strippe : headers multiples

**Given** une requete valide
**When** l'API cible renvoie plusieurs headers `Set-Cookie` (session, csrf, preferences)
**Then** aucun `Set-Cookie` n'est present dans la reponse FGP (tous strippes)

### AC-17.20 X-FGP-Source overwrite si present dans l'upstream

**Given** une requete valide
**When** l'API cible renvoie un header `X-FGP-Source: attacker-value` dans sa reponse
**Then** la reponse FGP contient `X-FGP-Source: upstream` (la valeur de l'upstream est ecrasee sans etat d'ame)

### AC-17.21 Header X-FGP-Source: proxy, missing_key

**Given** une requete sans `X-FGP-Key`
**When** le proxy repond `401 missing_key`
**Then** la reponse contient `X-FGP-Source: proxy` et la shape `{"error": "missing_key", "message": "..."}`

### AC-17.22 Header X-FGP-Source: proxy, blob_too_large

**Given** une requete avec un blob > 4096 chars
**When** le proxy repond `414 blob_too_large`
**Then** la reponse contient `X-FGP-Source: proxy` et la shape `{"error": "blob_too_large", ...}`

### AC-17.23 Header X-FGP-Source: proxy, invalid_credentials

**Given** une requete avec une cle client invalide ou blob corrompu
**When** le proxy repond `401 invalid_credentials`
**Then** la reponse contient `X-FGP-Source: proxy`

### AC-17.24 Header X-FGP-Source: proxy, token_expired

**Given** une requete avec un blob dont le TTL est expire
**When** le proxy repond `410 token_expired`
**Then** la reponse contient `X-FGP-Source: proxy`

### AC-17.25 Header X-FGP-Source: proxy, invalid_auth_mode

**Given** une requete avec un blob contenant un mode d'auth non supporte
**When** le proxy repond `400 invalid_auth_mode`
**Then** la reponse contient `X-FGP-Source: proxy`

### AC-17.26 Header X-FGP-Source: proxy, invalid_body

**Given** une requete POST avec body filters actifs et body JSON malforme
**When** le proxy repond `400 invalid_body`
**Then** la reponse contient `X-FGP-Source: proxy`

### AC-17.27 Header X-FGP-Source: proxy, scope_denied

**Given** une requete dont la methode ou le path ne matche aucun scope autorise
**When** le proxy repond `403 scope_denied`
**Then** la reponse contient `X-FGP-Source: proxy`

### AC-17.28 Header X-FGP-Source: proxy, invalid_request

**Given** une requete `/{blob}` sans path de proxy (segments.length < 2)
**When** le proxy repond `400 invalid_request`
**Then** la reponse contient `X-FGP-Source: proxy`

### AC-17.29 Fetch throw → 502 upstream_unreachable

**Given** une requete valide
**When** `fetch` throw (connexion refusee, DNS fail, timeout, network error)
**Then** le proxy renvoie `502` avec `{"error": "upstream_unreachable", "message": "Unable to reach target API"}` et header `X-FGP-Source: proxy`

### AC-17.30 Fetch throw : tous les modes reseau

**Given** une requete valide
**When** `fetch` rejette avec (a) connexion refusee, (b) DNS fail, (c) timeout, (d) TLS error
**Then** dans les 4 cas, le proxy repond `502 upstream_unreachable` + `X-FGP-Source: proxy`

### AC-17.31 Exception non catchee → 500 internal_error (app.onError)

**Given** une requete vers une route FGP et un code middleware qui throw (ex: `FGP_SALT` absent → `getServerSalt` throw)
**When** l'exception remonte sans etre catchee
**Then** `app.onError` renvoie `500` avec `{"error": "internal_error", "message": "Internal server error"}` et header `X-FGP-Source: proxy`

### AC-17.32 Exception non catchee : pas de leak

**Given** une exception non catchee avec un message sensible (ex: `"FGP_SALT missing"`, stack trace)
**When** `app.onError` construit la reponse
**Then** le message renvoye au client est generique (`"Internal server error"`), le message d'origine et la stack ne fuitent pas dans le body ni dans les headers

### AC-17.33 Harmonisation endpoint `/api/list-apps` : upstream non-ok

**Given** un POST `/api/list-apps` avec token valide, exchange ok
**When** l'API Scalingo `/v1/apps` renvoie un status non-2xx (ex: `500`, `403`)
**Then** la reponse FGP est `502` avec `{"error": "upstream_list_apps_failed", "message": "Scalingo returned {status}"}` et `X-FGP-Source: proxy` (l'endpoint n'est pas un proxy transparent : c'est un helper FGP avec shape dediee, le status upstream est seulement reporte dans le message pour le debug)

### AC-17.34 Harmonisation endpoint `/api/list-apps` : fetch throw

**Given** un POST `/api/list-apps` avec token valide, exchange ok
**When** le fetch vers `/v1/apps` throw (connexion refusee, timeout, etc.)
**Then** la reponse FGP est `502` avec `{"error": "upstream_unreachable", "message": "..."}` et `X-FGP-Source: proxy`

### AC-17.35 Harmonisation endpoint `/api/list-apps` : exchange failed

**Given** un POST `/api/list-apps` avec token Scalingo invalide
**When** l'exchange `exchangeToken` throw
**Then** la reponse FGP est `401` avec `{"error": "token_exchange_failed", "message": "..."}` et `X-FGP-Source: proxy` (erreur FGP, pas un forward upstream puisque c'est une etape interne)

---

## AC-18 : Feature `/logs` (stream logs par blob, opt-in)

> **Ref specs** : `docs/specs.md` §14. **Ref ADR** : `docs/adr/0007-logs-stream-in-memory-opt-in.md`.
>
> **Convention** : toutes les reponses d'erreur des routes `/logs*` suivent la shape FGP `{error, message}` avec `X-FGP-Source: proxy` (cf. AC-17).

### AC-18.1 Kill switch off : route `/logs` renvoie 404

**Given** la variable d'environnement `FGP_LOGS_ENABLED` est absente ou egale a `0`
**When** un client fait `GET /logs`
**Then** le serveur repond `404` avec `{"error": "not_found", "message": "Endpoint not found"}` et header `X-FGP-Source: proxy`

### AC-18.2 Kill switch off : route `/logs/stream` renvoie 404

**Given** `FGP_LOGS_ENABLED` absente ou `0`
**When** un client fait `GET /logs/stream` avec des headers `X-FGP-Blob` et `X-FGP-Key` valides
**Then** le serveur repond `404` sans tenter le dechiffrement du blob, header `X-FGP-Source: proxy`

### AC-18.3 Kill switch off : aucune capture ni allocation buffer

**Given** `FGP_LOGS_ENABLED` absente ou `0` et un blob avec `logs.enabled: true`
**When** une requete proxy passe par FGP
**Then** aucune entry network ni detailed n'est capturee, aucun ring buffer n'est cree pour ce blob (verifiable via inspection de la Map interne)

### AC-18.4 Kill switch on + blob sans champ `logs` : pas de capture

**Given** `FGP_LOGS_ENABLED=1` et un blob v2 ou v3 sans champ `logs`
**When** une requete proxy passe par FGP
**Then** aucune entry n'est capturee, aucun buffer n'est alloue pour ce blob

### AC-18.5 Kill switch on + `logs.enabled: true`, capture network

**Given** `FGP_LOGS_ENABLED=1` et un blob avec `logs: { enabled: true, detailed: false }`
**When** une requete proxy `GET /v1/apps/my-app` passe par FGP
**Then** une entry network est ajoutee au ring buffer du `blobId` correspondant

### AC-18.6 `detailed: true` sans `enabled: true`, traite comme logs off

**Given** `FGP_LOGS_ENABLED=1` et un blob avec `logs: { enabled: false, detailed: true }`
**When** une requete proxy POST JSON passe par FGP
**Then** aucune entry (ni network ni detailed) n'est capturee (defensive : `detailed` requiert `enabled: true`)

### AC-18.7 Blob v3 existant sans `logs` : pas de regression proxy

**Given** un blob v3 existant genere avant la feature, sans champ `logs`
**When** une requete proxy passe par FGP (scopes ok)
**Then** la requete est forwardee normalement, la reponse upstream est renvoyee telle quelle, et aucune capture n'a lieu

### AC-18.8 Blob v2 sans `logs` : pas de regression proxy

**Given** un blob v2 genere avant la feature
**When** une requete proxy passe par FGP
**Then** meme comportement qu'AC-18.7 : forward transparent, aucune capture

---

## AC-19 : Capture network

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

### AC-19.6 Path normalise : mode URL

**Given** une requete `GET /{blob}/v1/apps/my-app?page=2` (mode blob URL)
**When** l'entry network est capturee
**Then** `path` vaut `/v1/apps/my-app` (segment blob retire, query string retiree de `path`)

### AC-19.7 Path normalise : mode header

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

## AC-20 : Capture detailed

### AC-20.1 POST JSON avec `detailed: true`, entry emise

**Given** `FGP_LOGS_ENABLED=1`, `logs: { enabled: true, detailed: true }`
**When** une requete `POST /deploy` avec `Content-Type: application/json` et body `{"branch":"main"}`
**Then** une entry detailed est ajoutee au ring buffer detailed en plus de l'entry network

### AC-20.2 PUT JSON : entry emise

**Given** meme config qu'AC-20.1
**When** une requete `PUT /v1/apps/my-app/env` avec body JSON
**Then** une entry detailed est emise

### AC-20.3 PATCH JSON : entry emise

**Given** meme config qu'AC-20.1
**When** une requete `PATCH /v1/apps/my-app` avec body JSON
**Then** une entry detailed est emise

### AC-20.4 GET : jamais de detailed

**Given** meme config qu'AC-20.1
**When** une requete `GET /v1/apps/my-app` arrive
**Then** l'entry network est emise mais aucune entry detailed n'est produite

### AC-20.5 DELETE : jamais de detailed

**Given** meme config qu'AC-20.1
**When** une requete `DELETE /v1/apps/my-app`
**Then** aucune entry detailed n'est produite

### AC-20.6 HEAD : jamais de detailed

**Given** meme config qu'AC-20.1
**When** une requete `HEAD /v1/apps/my-app`
**Then** aucune entry detailed n'est produite

### AC-20.7 Content-Type multipart : detailed skippe

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

### AC-20.11 Body > `FGP_LOGS_DETAILED_MAX_KB` compresse : truncated

**Given** `FGP_LOGS_DETAILED_MAX_KB=32` et un body dont la version gzippee fait 40 KB
**When** l'entry detailed est construite
**Then** l'entry est emise avec `truncated: true` et le champ `bodyEncrypted` **absent** du JSON (pas de chaine vide, pas de troncature partielle)

### AC-20.12 Body juste sous la limite : non truncated

**Given** `FGP_LOGS_DETAILED_MAX_KB=32` et un body gzippe de 31 KB
**When** l'entry detailed est construite
**Then** l'entry contient `truncated: false` et `bodyEncrypted` non vide

### AC-20.13 Body juste au-dessus de la limite : truncated

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

## AC-21 : Ring buffer

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

### AC-21.6 Isolation : stream A ne voit que les logs A

**Given** deux blobs A et B actifs, stream SSE ouvert pour A
**When** une requete sur B est capturee
**Then** aucun event n'est publie sur le stream A

### AC-21.7 FIFO ordre preserve

**Given** un ring buffer network de taille 3, avec 3 entries (t1 < t2 < t3)
**When** une 4e entry t4 arrive
**Then** le buffer contient `[t2, t3, t4]` dans cet ordre (t1 evincee, plus ancienne en tete)

---

## AC-22 : Purge sur inactivite

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

### AC-22.4 Reconnect apres purge : buffer vide

**Given** un blob dont le buffer vient d'etre purge pour inactivite
**When** un nouveau stream SSE est ouvert sans `since`
**Then** le stream ouvre avec un buffer vide (pas d'historique), puis bascule en live des qu'une nouvelle requete est capturee

---

## AC-23 : Stream SSE

### AC-23.1 Headers manquants : 401

**Given** `FGP_LOGS_ENABLED=1`
**When** `GET /logs/stream` sans header `X-FGP-Blob` ni `X-FGP-Key`
**Then** le serveur repond `401` avec `{"error": "missing_key", ...}` et `X-FGP-Source: proxy`

### AC-23.2 Dechiffrement blob echoue : 401

**Given** `GET /logs/stream` avec `X-FGP-Blob` et `X-FGP-Key` mais la cle est incorrecte
**When** le serveur tente de dechiffrer
**Then** reponse `401` avec `{"error": "invalid_credentials", ...}` et `X-FGP-Source: proxy`

### AC-23.3 Blob valide sans `logs.enabled` : 403

**Given** `GET /logs/stream` avec blob valide dont `logs.enabled !== true` (absent, false, ou objet absent)
**When** le serveur inspecte la config
**Then** reponse `403` avec `{"error": "logs_not_enabled", ...}` et `X-FGP-Source: proxy`

### AC-23.4 Blob valide avec `logs.enabled` + kill switch off : 404

**Given** blob avec `logs.enabled: true` mais `FGP_LOGS_ENABLED=0`
**When** `GET /logs/stream`
**Then** reponse `404` (cf. AC-18.2), le kill switch court-circuite avant toute verification blob

### AC-23.5 Blob expire : 410

**Given** `GET /logs/stream` avec blob valide dont le TTL est expire
**When** le serveur verifie le TTL
**Then** reponse `410` avec `{"error": "token_expired", ...}` et `X-FGP-Source: proxy`

### AC-23.6 Deux connexions simultanees : 409 sur la seconde

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

### AC-23.11 Format SSE strict : event log

**Given** une entry a publier
**When** le serveur l'ecrit sur le stream
**Then** le flux contient exactement `event: log\ndata: <json>\n\n` (double newline de terminaison, pas de champ `id` ni `retry`)

### AC-23.12 Format SSE strict : event ping

**Given** un heartbeat
**When** le serveur l'emet
**Then** le flux contient exactement `event: ping\ndata: {}\n\n`

### AC-23.13 Content-Type SSE

**Given** un stream SSE ouvert avec succes
**When** le client lit les headers de reponse
**Then** `Content-Type: text/event-stream` et `X-FGP-Source: proxy` sont presents

### AC-23.14 Blob trop volumineux : 414

**Given** `GET /logs/stream` avec `X-FGP-Blob` > 4 KB
**When** le serveur inspecte la taille
**Then** reponse `414` avec `{"error": "blob_too_large", ...}` et `X-FGP-Source: proxy`, cohérent avec §8 du proxy principal

---

## AC-24 : Cursor reconnect

### AC-24.1 Flush filtre par `since`

**Given** un ring buffer avec entries a ts=100, 200, 300, 400
**When** le client ouvre le stream avec `?since=250`
**Then** le flush initial n'envoie que les entries a ts=300 et ts=400 (strict `ts > since`)

### AC-24.2 Sans `since` : flush complet

**Given** un ring buffer non vide
**When** le client ouvre le stream sans query `since`
**Then** toutes les entries actuelles du buffer sont envoyees dans l'ordre chronologique

### AC-24.3 `since` > dernier ts : flush vide

**Given** un ring buffer avec dernier event ts=500
**When** client ouvre avec `?since=600`
**Then** aucune entry n'est envoyee au flush, le stream attend les events live

### AC-24.4 `since` non entier : ignore ou 400

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

### AC-24.7 Reconnect apres eviction : perte partielle acceptee

**Given** ring buffer de taille 50, le client avait recu jusqu'a ts=100 mais les 100 entries suivantes ont evince les entries <= 100
**When** client reconnecte avec `?since=100`
**Then** le flush envoie les 50 entries actuelles (toutes avec ts > 100), pas de garantie de completude au-dela de la capacite du ring buffer

---

## AC-25 : Schema JSON des events

### AC-25.1 Discriminator `type: "network"`

**Given** un event network parse en JSON par le client
**When** il lit le champ `type`
**Then** la valeur est strictement `"network"`, et les champs `{ts, method, path, status, durationMs, ipPrefix}` sont tous presents et typés (number/string)

### AC-25.2 Discriminator `type: "detailed"`

**Given** un event detailed parse en JSON par le client
**When** il lit `type`
**Then** la valeur est strictement `"detailed"`, et les champs `{ts, method, path, truncated}` sont presents. `bodyEncrypted` est present si et seulement si `truncated === false` (discriminated union secondaire)

### AC-25.3 Schema network : aucun champ supplementaire

**Given** un event network serialise
**When** on liste les cles du JSON
**Then** l'ensemble est exactement `{type, ts, method, path, status, durationMs, ipPrefix}` (pas de `target`, pas de `headers`, pas de `body`, pas d'`ip` complete)

### AC-25.4 Schema detailed : aucun champ supplementaire

**Given** un event detailed serialise
**When** on liste les cles du JSON
**Then** l'ensemble est `{type, ts, method, path, truncated}` + eventuellement `bodyEncrypted` (present uniquement si `truncated === false`). Aucune autre cle (pas de `headers`, pas de `target`, pas de `body`)

### AC-25.5 Types stricts

**Given** un event quelconque
**When** on type-check les valeurs
**Then** `ts: number`, `method: string`, `path: string`, `status: number`, `durationMs: number`, `ipPrefix: string`, `truncated: boolean`. `bodyEncrypted` quand present : `string` (base64url non vide)

---

## AC-26 : UI `/logs` et formulaire

### AC-26.1 Page `/logs` sans blob en sessionStorage : formulaire

**Given** `FGP_LOGS_ENABLED=1` et `sessionStorage` vide
**When** l'utilisateur charge `GET /logs`
**Then** la page affiche le formulaire d'auth (champ blob + champ cle + bouton « Connecter ») comme decrit en §14.13

### AC-26.2 Soumission blob+cle valides : stream ouvert

**Given** formulaire affiche avec `FGP_LOGS_ENABLED=1` et un blob+cle correspondant a un blob `logs.enabled: true`
**When** l'utilisateur clique « Connecter »
**Then** le JS client fait `fetch` streaming vers `/logs/stream` avec les headers, le stream s'ouvre et l'UI bascule sur la vue stream (statut « Connecte »)

### AC-26.3 Soumission blob invalide : message d'erreur

**Given** formulaire affiche, utilisateur saisit un blob corrompu ou une cle incorrecte
**When** il clique « Connecter »
**Then** l'UI affiche le message « Blob ou cle invalide : impossible de dechiffrer. » (cf. §14.13), reste sur le formulaire

### AC-26.4 Soumission blob sans `logs.enabled` : message 403

**Given** blob+cle valides mais blob dont `logs.enabled !== true`
**When** utilisateur se connecte
**Then** UI affiche « Les logs ne sont pas actives pour ce blob. Activez-les dans la configuration avant de reessayer. »

### AC-26.5 sessionStorage : pas localStorage

**Given** soumission reussie du formulaire
**When** le client persiste blob+cle
**Then** les valeurs sont dans `sessionStorage`, pas dans `localStorage` (verifiable via DevTools ou inspection explicite du code client)

### AC-26.6 F5 : re-ouvre le stream depuis sessionStorage

**Given** session stream ouverte, blob+cle en sessionStorage
**When** l'utilisateur rafraichit la page (F5)
**Then** la page lit le sessionStorage et re-ouvre automatiquement le stream sans re-saisie

### AC-26.7 Fermeture onglet : perte du contexte

**Given** session active, blob+cle en sessionStorage
**When** l'utilisateur ferme l'onglet puis rouvre `/logs`
**Then** sessionStorage est vide, le formulaire est affiche a nouveau

### AC-26.8 Bouton « Se deconnecter » : clear + close

**Given** stream ouvert
**When** utilisateur clique « Se deconnecter »
**Then** le stream SSE est ferme cote client, sessionStorage est vide, le formulaire est affiche

### AC-26.9 Kill switch off : page `/logs` renvoie 404

**Given** `FGP_LOGS_ENABLED=0`
**When** utilisateur charge `GET /logs`
**Then** reponse `404` (cf. AC-18.1), aucune page rendue

### AC-26.10 Detailed affiche le body dechiffre

**Given** stream ouvert avec blob `logs.detailed: true`, entry detailed recue
**When** le JS client dechiffre `bodyEncrypted` avec succes
**Then** la section « Bodies detailles » affiche le JSON dechiffre et decompresse

### AC-26.11 Detailed : echec dechiffrement affiche indicateur

**Given** stream ouvert, entry detailed recue dont le dechiffrement echoue cote client (par ex. cle incorrecte)
**When** l'UI traite l'event
**Then** l'entry est affichee avec l'indicateur « Dechiffrement impossible : verifiez votre cle » (§14.13), le stream continue sans bloquer

### AC-26.12 Detailed truncated : affichage dedie

**Given** un event detailed avec `truncated: true`
**When** l'UI rend l'entry
**Then** elle affiche « Body trop volumineux, non stocke » a la place du body

---

## AC-27 : Onglet « Logs » dans la page de configuration

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

### AC-27.6 Les deux toggles : blob contient `detailed: true`

**Given** les deux toggles coches
**When** utilisateur genere le blob
**Then** le blob contient `logs: { enabled: true, detailed: true }`

### AC-27.7 Aucun toggle coche : pas de champ `logs` dans le blob

**Given** onglet Logs ouvert avec aucun toggle coche
**When** utilisateur genere le blob
**Then** le blob genere est identique au comportement d'avant la feature : pas de champ `logs` (omis), pas de bump de version

### AC-27.8 Decocher detailed puis regenerer : detailed disparait

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

## AC-28 : Compatibilite blob et non-regression

### AC-28.1 Blob v3 sans `logs` : comportement identique a avant

**Given** un blob v3 existant (genere avant la feature, sans champ `logs`)
**When** il passe par le proxy FGP nouvelle version
**Then** la requete est forwardee, scopes verifies, auth appliquee, reponse renvoyee, comportement byte-identique a la version precedente

### AC-28.2 Blob v2 : comportement identique

**Given** un blob v2 existant
**When** il passe par le proxy
**Then** comportement identique, aucune capture, pas d'erreur de parsing

### AC-28.3 Blob avec `logs` present mais fausse valeur : gracieux

**Given** un blob avec `logs: { enabled: "true" }` (string au lieu de bool, malformation legere)
**When** le proxy lit la config
**Then** le proxy traite comme `logs.enabled !== true` (strict boolean check), pas de capture, pas d'erreur 500

### AC-28.4 Pas de bump de version : `v` reste 2 ou 3

**Given** un blob genere avec toggles logs coches
**When** on inspecte la version dans le blob dechiffre
**Then** `v` vaut 2 ou 3 selon la structure des scopes (cf. AC-13.5), jamais 4

### AC-28.5 Ancien proxy + blob recent avec `logs` : ignore gracieusement

**Given** un blob avec champ `logs` present, deploye sur une version du proxy qui ne connait pas la feature
**When** le proxy dechiffre et valide
**Then** la validation reussit (champ extra ignore par le parsing), le proxy fonctionne normalement sans capturer de logs

---

## AC-29 : Securite zero-trust

### AC-29.1 Dump memoire : aucun body en clair

**Given** un blob avec detailed actif et plusieurs entries capturees
**When** on inspecte le contenu du ring buffer (simulation de dump memoire via acces direct a la Map)
**Then** aucun body en clair n'est trouve ; seul du ciphertext `bodyEncrypted` est present

### AC-29.2 Dump memoire : pas de cle client

**Given** meme scenario qu'AC-29.1
**When** on inspecte les structures liees au blob
**Then** la cle client n'est trouvee nulle part dans le ring buffer, le topic, ou les entries (elle n'a jamais ete stockee)

### AC-29.3 Dump memoire : pas de token upstream

**Given** meme scenario
**When** on inspecte
**Then** le token upstream (bearer, basic, etc.) n'apparait pas dans les entries ou les structures de logs (il n'est utilise qu'au forward, jamais stocke dans la surface logs)

### AC-29.4 Endpoint `/api/salt` public suffit au dechiffrement client

**Given** le salt serveur public, la cle client, et un `bodyEncrypted` recu par SSE
**When** le JS client fait `PBKDF2(client_key, salt)` puis AES-GCM decrypt + gunzip
**Then** le body en clair est obtenu (le salt public n'est pas un secret, la cle client l'est)

---

## AC-30 : Endpoint `/logs/health`

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

## AC-31 : Auto-reconnect UI avec sessionStorage

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

## AC-32 : Identification visuelle du blob dans la vue stream

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

## AC-33 : Bouton revelation cle sur formulaire

### AC-33.1 Bouton œil masque → revelation

**Given** le formulaire `/logs` avec une cle saisie (input type="password" par defaut)
**When** l'utilisateur clique sur l'icone œil
**Then** l'input passe en type="text", la cle est visible, l'icone change d'etat

### AC-33.2 Bouton œil revelation → masque

**Given** l'input en type="text" (cle revelee)
**When** l'utilisateur reclique sur l'icone
**Then** l'input repasse en type="password", la cle est masquee

---

## AC-34 : Blob v4, AuthSpec `headers`

> **Ref specs** : §6.3, §11.1.1, §5 (limites auth), §12.7.
> **Rappel de serialisation** : un AuthSpec `headers` a une seule entree est serialise en forme legacy `auth: "header:{name}"` avec la valeur dans `token`, et le blob reste v2 ou v3. Le mode structure demarre a deux entrees.

### AC-34.1 Deux headers produisent un blob v4

**Given** une generation avec deux entrees `{name, value}` en mode headers
**When** le blob est genere puis dechiffre
**Then** `v` vaut `4`, `auth` est l'objet `{type: "headers", headers: [...]}` avec les deux entrees dans l'ordre saisi

### AC-34.2 Un seul header serialise en forme legacy

**Given** une generation avec une seule entree `{name: "X-API-Key", value: "sk-live-abc"}`
**When** le blob est genere puis dechiffre
**Then** `auth` vaut la string `"header:X-API-Key"`, `token` vaut `"sk-live-abc"`, et `v` vaut `2` (ou `3` si un ScopeEntry est present), jamais `4`

### AC-34.3 Forward : tous les headers sont poses

**Given** un blob v4 avec `headers: [{X-API-Key, sk-1}, {X-Client-Id, acme}]` et une requete dans le scope
**When** le proxy forwarde vers la cible
**Then** la requete sortante porte `X-API-Key: sk-1` et `X-Client-Id: acme`, et aucun header `Authorization` n'est ajoute

### AC-34.4 Un header d'auth ecrase le header homonyme du client

**Given** un blob v4 avec `headers: [{X-API-Key, sk-blob}]` en forme structuree (deux entrees dont celle-ci)
**When** l'appelant envoie lui-meme `X-API-Key: sk-attaquant`
**Then** la requete sortante porte `X-API-Key: sk-blob` et une seule occurrence du header

### AC-34.5 `token` omis a la generation en mode headers

**Given** une generation en mode headers a deux entrees
**When** on dechiffre le blob genere
**Then** le champ `token` est absent du JSON dechiffre (pas une string vide)

### AC-34.6 `token` orphelin dans un blob recu : ignore, jamais forwarde

**Given** un blob v4 en mode headers qui contient malgre tout un `token: "secret-orphelin"`
**When** une requete dans le scope est forwardee
**Then** le blob n'est pas rejete, la requete sortante ne contient `secret-orphelin` dans aucun header ni dans le body

### AC-34.7 Blob v4 en mode headers sans `token` : accepte

**Given** un blob v4 `{type: "headers"}` sans champ `token`
**When** le proxy dechiffre et valide
**Then** la validation reussit (le `token` non vide n'est pas requis dans ce mode)

### AC-34.8 Blob avec auth string et sans `token` : rejete

**Given** un blob dont `auth` vaut `"bearer"` et dont `token` est absent ou vide
**When** le proxy dechiffre
**Then** `401 invalid_credentials`, `X-FGP-Source: proxy`

### AC-34.9 `auth` objet avec `v` inferieur a 4 : rejete

**Given** un blob dont `auth` est un objet `{type: "headers", ...}` mais dont `v` vaut `3`
**When** le proxy dechiffre et valide
**Then** `401 invalid_credentials` (la version doit valoir `4` des que `auth` est un objet)

### AC-34.10 `auth.type` inconnu : 401 et non 400

**Given** un blob v4 dont `auth` vaut `{type: "oauth2", ...}`
**When** le proxy dechiffre et valide
**Then** `401 invalid_credentials`, jamais `400 invalid_auth_mode` (§11.1.3 : le proxy ne distingue pas un blob malforme d'un blob illisible)

### AC-34.11 `auth` string de forme correcte mais non supportee : 400

**Given** un blob v3 dont `auth` vaut `"oauth2"` (string non vide, mode inconnu)
**When** le proxy traite la requete
**Then** `400 invalid_auth_mode`, `X-FGP-Source: proxy` (la frontiere avec AC-34.10 est le type de `auth`, string vs objet)

### AC-34.12 `headers` tableau vide : rejete

**Given** un blob v4 avec `auth: {type: "headers", headers: []}`
**When** le proxy dechiffre et valide
**Then** `401 invalid_credentials`

### AC-34.13 Nom ou valeur de header vide : rejete

**Given** un blob v4 avec une entree `{name: "", value: "x"}`, puis un autre avec `{name: "X-A", value: ""}`
**When** le proxy dechiffre et valide
**Then** les deux blobs sont rejetes en `401 invalid_credentials`

### AC-34.14 Doublon de nom insensible a la casse : rejete

**Given** un blob v4 avec `headers: [{X-API-Key, a}, {x-api-key, b}]`
**When** le proxy dechiffre et valide
**Then** `401 invalid_credentials` (§9.3 de `limits.md` : le second ecraserait le premier au forward)

### AC-34.15 Limite de 8 headers, bornes exactes

**Given** un blob v4 avec 8 headers valides, puis un avec 9
**When** le proxy dechiffre et valide
**Then** le blob a 8 headers est accepte, le blob a 9 est rejete en `401 invalid_credentials`

### AC-34.16 Limite de 64 caracteres sur le nom, bornes exactes

**Given** un blob v4 avec un nom de header de 64 caracteres valides, puis un de 65
**When** le proxy dechiffre et valide
**Then** 64 est accepte, 65 est rejete en `401 invalid_credentials`

### AC-34.17 Limite de 1024 caracteres sur la valeur, bornes exactes

**Given** un blob v4 avec une valeur de 1024 caracteres, puis une de 1025
**When** le proxy dechiffre et valide
**Then** 1024 est accepte, 1025 est rejete en `401 invalid_credentials`

### AC-34.18 Nom de header hors charset : rejete

**Given** un blob v4 avec un nom `"X API Key"` (espace), puis `"X-Clé"` (non ASCII), puis `"X:Key"` (deux-points)
**When** le proxy dechiffre et valide
**Then** les trois blobs sont rejetes en `401 invalid_credentials` (le nom est rejete, jamais assaini)

> **Arbitrage rendu** : le charset de reference est le token RFC 7230, `^[A-Za-z0-9!#$%&'*+.^_\`|~-]+$`. C'est la seule definition qui garantit qu'aucun runtime HTTP ne rejettera le nom au forward, et elle est strictement plus large que la liste des specs, donc elle ne casse rien.

### AC-34.19 Valeur de header contenant CR ou LF : rejete

**Given** un blob v4 avec une valeur `"sk-live\r\nX-Admin: true"`
**When** le proxy dechiffre et valide
**Then** `401 invalid_credentials`, et en aucun cas la requete sortante ne porte un header `X-Admin`

> **Arbitrage rendu** : la contrainte est « aucun caractere de controle (`0x00` a `0x1F`, `0x7F`) dans la valeur », validee au dechiffrement cote serveur. Sans ce garde, un blob crafte fait throw `Headers.set()` au forward et remonte en `500 internal_error` au lieu d'un rejet propre : un bug FGP declenchable a distance.

### AC-34.20 Depassement de limite a la generation : 400 `auth_limit_exceeded`

**Given** un `POST /api/generate` avec 9 headers d'auth
**When** le serveur valide le body
**Then** `400 {"error": "auth_limit_exceeded", ...}`, `X-FGP-Source: proxy`, aucun blob genere

### AC-34.21 Mode headers : aucun appel reseau supplementaire

**Given** un blob v4 en mode headers et un compteur d'appels sortants vers toute origine autre que `target`
**When** deux requetes successives dans le scope sont forwardees
**Then** le compteur reste a zero, et exactement deux appels partent vers `target`

### AC-34.22 Nom de header reserve : refuse a la generation

**Given** un `POST /api/generate` avec un header d'auth nomme `X-FGP-Key`, puis `Host`, puis `Content-Length`
**When** le serveur valide le body
**Then** la generation est refusee en `400`, et un blob fabrique directement avec un de ces noms est rejete au dechiffrement en `401 invalid_credentials`

> **Arbitrage rendu** : la liste reservee vit cote serveur, pas seulement dans l'UI. Elle couvre les en-tetes de transport (`host`, `content-length`, `connection`, `transfer-encoding`, `upgrade`, `te`, `trailer`, `keep-alive`, `proxy-authorization`) et les en-tetes FGP (`x-fgp-key`, `x-fgp-blob`, `x-fgp-source`). `authorization` reste autorise, c'est un usage legitime du mode. Laisser un blob surcharger `Host` ou `Content-Length` permettrait de detourner le routage ou de corrompre le body forwarde.

---

## AC-35 : Blob v4, AuthSpec `scalingo-addon` (mono-addon)

> **Ref specs** : §11.1.2, §9.2, §5, §12.8.
> **Arbitrage du 2026-09-03** : le multi-addon est abandonne. L'AuthSpec est aplati en `{type: "scalingo-addon", app, addonId, apiUrl?}`, sans tableau. La resolution par extraction du path, le champ `resourceId` **dans le blob**, le code `addon_not_resolved` et la limite de 5 couples n'existent plus. Les AC-35.2 a AC-35.7, AC-35.18 et AC-35.19 sont marques obsoletes plutot que supprimes, pour ne pas decaler la numerotation.
> **Nuance sur `resourceId`** : il survit comme **donnee d'affichage**. `/api/list-addons` le renvoie, l'UI s'en sert pour le libelle d'option, il ne quitte jamais le navigateur. AC-35.24 verifie qu'il n'atteint jamais un blob.
> **Flow en trois temps** : (1) exchange du token de compte contre un bearer sur `POST {SCALINGO_AUTH_URL}/v1/tokens/exchange`, (2) obtention du token d'addon sur `POST {apiUrl}/v1/apps/{app}/addons/{addonId}/token`, (3) forward vers `target` avec `Authorization: Bearer {addon_token}`.

### AC-35.1 Flow nominal en trois temps

**Given** un blob v4 `auth: {type: "scalingo-addon", app: "mon-app", addonId: "ad-1"}` et une requete dans le scope
**When** le proxy traite la requete
**Then** un exchange est appele, puis `POST {apiUrl}/v1/apps/mon-app/addons/ad-1/token`, puis le forward vers `target` avec `Authorization: Bearer {addon_token}`, dans cet ordre, sans aucune inspection du path

### AC-35.2 ~~Resolution multi-addon par `addonId` present dans le path~~

**Obsolete** : multi-addon abandonne (arbitrage du 2026-09-03). Le blob ne porte qu'un addon, aucune resolution depuis le path n'a lieu.

### AC-35.3 ~~Resolution multi-addon par `resourceId` present dans le path~~

**Obsolete** : meme raison. Voir AC-35.24 pour la contrepartie encore utile, `resourceId` ne doit jamais atteindre un blob.

### AC-35.4 ~~`resourceId` absent, resolution sur `addonId` seul~~

**Obsolete** : meme raison.

### AC-35.5 ~~Aucune correspondance : 403 sans appel reseau~~

**Obsolete** : le code `addon_not_resolved` n'existe plus. Un blob mono-addon cible toujours son addon ; la protection contre un appel reseau declenche hors scope reste couverte par AC-36.1.

### AC-35.6 ~~Correspondance multiple : la premiere declaree gagne~~

**Obsolete** : meme raison.

### AC-35.7 ~~Match sur segment entier, pas sous-chaine~~

**Obsolete** : meme raison.

### AC-35.8 Echec de l'etape 1 : 502 `auth_addon_failed`

**Given** un blob `scalingo-addon` et un service d'exchange qui repond `401`
**When** le proxy tente d'obtenir les credentials
**Then** `502 {"error": "auth_addon_failed", "message": "Unable to obtain addon token"}`, `X-FGP-Source: proxy`, aucun appel vers `target`

### AC-35.9 Reponse non-2xx a l'etape 2 : 502 `auth_addon_failed`

**Given** un exchange qui reussit et un `POST /v1/apps/{app}/addons/{id}/token` qui repond `404`
**When** le proxy tente d'obtenir le token d'addon
**Then** `502 auth_addon_failed`, `X-FGP-Source: proxy`, aucun appel vers `target`, et le status upstream `404` n'est pas propage au client

### AC-35.10 API Scalingo injoignable a l'etape 2 : 502 `auth_addon_failed`

**Given** un exchange qui reussit et un `fetch` qui throw sur l'etape 2
**When** le proxy tente d'obtenir le token d'addon
**Then** `502 auth_addon_failed`, et surtout **pas** `upstream_unreachable` (qui reste reserve au fetch throw du forward)

### AC-35.11 Cache du token d'addon

**Given** un blob `scalingo-addon` et deux requetes successives
**When** les deux requetes sont traitees
**Then** exactement un exchange et un appel d'obtention de token d'addon ont eu lieu, et deux forwards vers `target`

### AC-35.12 Cache dedie par couple app/addon

**Given** deux blobs distincts partageant le meme token de compte mais ciblant deux addons differents, et une requete sur chacun
**When** les deux requetes sont traitees
**Then** deux appels d'obtention de token d'addon distincts ont eu lieu (cle de cache derivee de `token + app + addonId`), et les deux forwards portent des bearers differents

### AC-35.13 Chainage des caches : bearer reutilise

**Given** un bearer valide en cache et un token d'addon expire
**When** une requete arrive
**Then** aucun nouvel exchange n'est declenche, un seul appel d'obtention de token d'addon est fait, reutilisant le bearer en cache

### AC-35.14 Singleflight sur le token d'addon

**Given** dix requetes concurrentes sur le meme blob `scalingo-addon`, cache vide
**When** elles sont traitees en parallele
**Then** un seul exchange et un seul appel d'obtention de token d'addon sont emis, et les dix requetes aboutissent

### AC-35.15 Singleflight : echec propage a toutes les requetes

**Given** dix requetes concurrentes sur le meme blob et une etape 2 qui repond `500`
**When** elles sont traitees en parallele
**Then** un seul appel d'obtention de token est emis et les dix requetes recoivent `502 auth_addon_failed`

### AC-35.16 Resolution de `apiUrl`

**Given** trois configurations : `apiUrl` present dans le blob, absent avec `SCALINGO_API_URL` defini, absent sans variable d'environnement
**When** le proxy construit l'appel de l'etape 2
**Then** l'URL utilisee est respectivement celle du blob, celle de `SCALINGO_API_URL`, puis `https://api.osc-fr1.scalingo.com`

### AC-35.17 `apiUrl` non conforme : blob rejete

**Given** un blob `scalingo-addon` avec `apiUrl: "http://api.example.com"`, puis `apiUrl: "/v1"`, puis `apiUrl: ""`
**When** le proxy dechiffre et valide
**Then** les trois blobs sont rejetes en `401 invalid_credentials` (URL absolue en `https` requise)

### AC-35.18 ~~Limite de 5 addons, bornes exactes~~

**Obsolete** : il n'y a plus qu'un addon par blob, la limite n'a plus d'objet.

### AC-35.19 ~~Doublons d'addon refuses a la generation~~

**Obsolete** : meme raison, il n'y a plus de liste ou un doublon puisse exister.

### AC-35.20 `token` requis en mode `scalingo-addon`

**Given** un blob v4 `scalingo-addon` sans `token` ou avec `token: ""`
**When** le proxy dechiffre et valide
**Then** `401 invalid_credentials`

### AC-35.21 `app` ou `addonId` vide : rejete

**Given** un blob v4 avec `{type: "scalingo-addon", app: "", addonId: "ad-1"}`, puis `{app: "a", addonId: ""}`
**When** le proxy dechiffre et valide
**Then** les deux blobs sont rejetes en `401 invalid_credentials`

### AC-35.22 Limite de 64 caracteres sur `app` et `addonId`

**Given** un blob avec un `app` de 65 caracteres, puis un `addonId` de 65
**When** le proxy dechiffre et valide
**Then** les deux blobs sont rejetes ; les memes valeurs a 64 caracteres sont acceptees

### AC-35.23 Le token de compte n'atteint jamais la cible

**Given** un blob `scalingo-addon` avec `token: "tk-us-compte-secret"`
**When** une requete est forwardee vers `target`
**Then** aucun header ni le body de la requete sortante ne contient `tk-us-compte-secret` ; seul le token d'addon est present dans `Authorization`

### AC-35.24 `resourceId` n'atteint jamais le blob

**Given** un `POST /api/generate` en mode `scalingo-addon` dont le body contient, volontairement, un champ `resourceId: "my-db-123"` en plus de `app` et `addonId`
**When** on dechiffre le blob genere et qu'on serialise sa configuration complete en texte
**Then** la chaine `my-db-123` n'y apparait pas, et l'`AuthSpec` du blob ne contient que `type`, `app`, `addonId` et eventuellement `apiUrl`

> `resourceId` est une donnee d'affichage produite par `/api/list-addons` pour le libelle d'option. Il ne doit jamais quitter le navigateur. Cet AC est la contrepartie de l'abandon du multi-addon : le champ n'a plus aucune raison de traverser la frontiere client / serveur.

### AC-35.25 Le blob ne contient aucun vestige de l'ancien format

**Given** un blob v4 `scalingo-addon` genere par la version courante
**When** on inspecte son `AuthSpec`
**Then** il n'y a pas de champ `addons`, pas de tableau, et la forme est strictement plate
---

## AC-36 : Ordre de verification v4 et echecs d'auth upstream

> **Ref specs** : §8.2, §8.3, §8.4, §11.1.5.
> **Rappel** : `auth_exchange_failed` (502, mode `scalingo-exchange`) et `auth_addon_failed` (502, mode `scalingo-addon`) sont les noms definitifs. Ils ne se confondent ni avec `upstream_unreachable` (502, fetch throw du forward) ni avec `token_exchange_failed` (401, endpoints internes `/api/list-apps` et `/api/list-addons`).

### AC-36.1 Scope refuse en mode addon : aucun appel Scalingo

**Given** un blob `scalingo-addon` et une requete `DELETE /api/databases/ad-1/backups` hors scope
**When** le proxy traite la requete
**Then** `403 scope_denied` et **zero appel reseau** vers `SCALINGO_AUTH_URL`, `apiUrl` et `target`

### AC-36.2 TTL expire en mode addon : aucun appel Scalingo

**Given** un blob `scalingo-addon` expire
**When** le proxy traite la requete
**Then** `410 token_expired` et zero appel reseau sortant

### AC-36.3 ~~`addon_not_resolved` intervient apres la verification des scopes~~

**Obsolete** : le code `addon_not_resolved` n'existe plus (multi-addon abandonne, arbitrage du 2026-09-03). L'invariant qui comptait, « un appelant hors scope ne declenche aucun appel reseau vers Scalingo », reste couvert par AC-36.1 et AC-36.2.

### AC-36.4 Echec d'exchange en mode `scalingo-exchange` : `auth_exchange_failed`

**Given** un blob `scalingo-exchange` et un service d'exchange qui repond `401`
**When** le proxy tente d'obtenir le bearer
**Then** `502 {"error": "auth_exchange_failed", "message": "Unable to exchange Scalingo token"}`, `X-FGP-Source: proxy`, aucun appel vers `target`

> **Non-regression** : ce cas remontait auparavant en `502 upstream_unreachable`. Le status `502` et le header ne changent pas, seul le code `error` change. Remplace l'assertion de `tests/testi/proxy-edge-cases.test.ts` autour de la ligne 236.

### AC-36.5 Singleflight propage `auth_exchange_failed`

**Given** cinq requetes concurrentes avec le meme token `scalingo-exchange` et un exchange qui echoue
**When** elles sont traitees en parallele
**Then** un seul exchange est emis (compteur a 1) et les cinq requetes recoivent `502 auth_exchange_failed` avec `X-FGP-Source: proxy`

### AC-36.6 `upstream_unreachable` reste reserve au forward

**Given** un blob `scalingo-exchange` dont l'exchange reussit et dont le `fetch` vers `target` throw
**When** le proxy forwarde
**Then** `502 upstream_unreachable`, pas `auth_exchange_failed`

### AC-36.7 `token_exchange_failed` reste distinct sur les endpoints internes

**Given** un `POST /api/list-apps` puis un `POST /api/list-addons` avec un token refuse par Scalingo
**When** le serveur traite la requete
**Then** `401 {"error": "token_exchange_failed", ...}` dans les deux cas, `X-FGP-Source: proxy`, jamais `auth_exchange_failed`

### AC-36.8 `/api/list-addons` : API Scalingo joignable mais non-2xx

**Given** un `POST /api/list-addons` valide et une API Scalingo qui repond `500`
**When** le serveur traite la requete
**Then** `502 {"error": "upstream_list_addons_failed", ...}` avec le status upstream reporte dans `message`, `X-FGP-Source: proxy`

### AC-36.9 `/api/list-addons` : API Scalingo injoignable

**Given** un `POST /api/list-addons` valide et un `fetch` qui throw
**When** le serveur traite la requete
**Then** `502 upstream_unreachable`, `X-FGP-Source: proxy`

### AC-36.10 `/api/list-addons` : body invalide

**Given** un `POST /api/list-addons` sans `token`, puis sans `app`
**When** le serveur valide le body
**Then** `400 invalid_body` dans les deux cas

### AC-36.11 `/api/list-addons` : shape de reponse

**Given** un `POST /api/list-addons` nominal et une API Scalingo qui renvoie un addon avec `id`, `resource_id`, `provider` et `plan`
**When** le serveur repond
**Then** le body vaut `{"addons": [{"id": ..., "resourceId": ..., "provider": ..., "plan": ...}]}`, `id` et `resourceId` etant tous les deux presents et distincts

### AC-36.12 Enums OpenAPI a jour

**Given** la spec `GET /api/openapi.json`
**When** on inspecte les schemas de reponse d'erreur
**Then** la route proxy accepte `auth_exchange_failed` et `auth_addon_failed` dans son enum et **n'accepte pas** `addon_not_resolved` (code supprime), `/api/generate` accepte `invalid_key` et `auth_limit_exceeded`, `/api/list-addons` accepte `invalid_body`, `token_exchange_failed`, `app_not_found`, `upstream_unreachable` et `upstream_list_addons_failed`

### AC-36.13 Messages FGP generiques

**Given** les erreurs `auth_exchange_failed`, `auth_addon_failed`, `app_not_found` et `invalid_key`
**When** on inspecte les bodies renvoyes
**Then** aucun message ne contient de nom d'app, d'`addonId`, de `resourceId`, de valeur de header, de cle client ni de trace d'exception

### AC-36.14 `/api/list-addons` : application inexistante en 404 `app_not_found`

**Given** un `POST /api/list-addons` avec un token valide et une application qui n'existe pas sur le compte, et une API Scalingo qui repond `404`
**When** le serveur traite la requete
**Then** `404 {"error": "app_not_found", "message": "Application not found on this Scalingo account"}`, `X-FGP-Source: proxy`, et surtout **pas** `502 upstream_list_addons_failed`

### AC-36.15 `app_not_found` est une exception, pas une regle de traduction

**Given** une API Scalingo qui repond successivement `403`, `429` et `500` sur `/api/list-addons`
**When** le serveur traite chaque requete
**Then** les trois remontent en `502 upstream_list_addons_failed` avec le status upstream reporte dans `message` ; seul le `404` sur l'application beneficie d'un code dedie

> **Regle de cadrage** : un status upstream n'est traduit en code FGP dedie que s'il designe sans ambiguite une erreur de saisie corrigeable par l'utilisateur. Le `404` sur l'application en est une (le nom est faux, il se corrige) ; un `403` ou un `500` n'en sont pas. Cet AC est la pour qu'on ne derive pas vers une table de traduction generale, ce qui reintroduirait la logique de gateway que l'ADR-0006 a retiree.

### AC-36.16 `app_not_found` cote UI : champ marque et focus rendu

**Given** le formulaire en mode « Scalingo Database API » et un chargement de bases qui remonte `404 app_not_found`
**When** l'UI traite la reponse
**Then** l'input application recoit `aria-invalid="true"`, le focus lui est rendu, et le message affiche designe le nom de l'application comme la cause, pas le token ni le reseau

---

## AC-37 : Redaction des secrets d'auth

> **Ref specs** : §11.1.4, §12.6.
> Trois surfaces : `POST /api/decode`, le partage de configuration `?c=` (`POST /api/share/encode`), et toute URL produite par FGP.

### AC-37.1 `/api/decode` d'un blob `headers` : valeurs redactees

**Given** un blob v4 avec `headers: [{X-API-Key, sk-live-abcd1234}, {X-Client-Id, acme-prod-9876}]`
**When** on appelle `POST /api/decode` avec la bonne cle
**Then** la reponse contient, pour chaque entree, exactement `{name, valueRedacted}` : le `name` en clair, une `valueRedacted` ne laissant visibles que les 4 derniers caracteres (`************1234`), et **aucune cle `value`** dans l'objet

### AC-37.2 `/api/decode` : aucune valeur en clair dans la reponse entiere

**Given** le meme blob
**When** on serialise le body de reponse complet en texte
**Then** la chaine ne contient ni `sk-live-abcd1234` ni `acme-prod-9876`, ni aucune sous-chaine de plus de 4 caracteres de ces secrets

### AC-37.3 `/api/decode` d'un blob `scalingo-addon`

**Given** un blob v4 `scalingo-addon` avec `token: "tk-us-secret-compte"`
**When** on appelle `POST /api/decode`
**Then** `app`, `addonId` et `apiUrl` sont renvoyes en clair (identifiants d'infrastructure necessaires pour re-editer la configuration), `tokenRedacted` masque le token de compte, et la chaine `tk-us-secret-compte` n'apparait nulle part dans la reponse

### AC-37.4 `/api/decode` d'un blob v2/v3 : shape inchangee

**Given** un blob v3 avec `auth: "bearer"`
**When** on appelle `POST /api/decode`
**Then** `auth` est renvoye comme la string `"bearer"` (pas d'objet), et `tokenRedacted` fonctionne comme avant

### AC-37.5 `/api/share/encode` : valeurs de headers videes

**Given** une configuration en mode headers avec deux valeurs secretes
**When** on appelle `POST /api/share/encode` puis qu'on decode reellement le `encoded` retourne
**Then** les `name` sont presents et chaque `value` vaut la chaine vide, aucun secret n'apparait dans le payload decode, et le destinataire voit donc des champs a ressaisir plutot que des valeurs absentes

### AC-37.6 `/api/share/encode` : aucun secret dans la chaine encodee

**Given** la meme configuration
**When** on inspecte la chaine `encoded` et l'`url` retournees
**Then** ni les valeurs de headers, ni le token, ni la cle client n'y apparaissent, sous aucune forme (clair, base64 ou base64url)

### AC-37.7 La cle client n'est jamais serialisee dans une URL de partage

**Given** une generation avec une cle client fournie `ma-cle-de-ci-tres-longue-42`
**When** on produit une URL de partage `?c=` depuis la meme configuration
**Then** la cle n'apparait ni dans le payload de partage, ni dans la query string, ni dans aucun champ de la reponse de `/api/share/encode`

### AC-37.8 Aucun secret dans l'URL FGP generee

**Given** un `POST /api/generate` en mode headers
**When** on inspecte le champ `url` de la reponse
**Then** l'URL ne contient que l'origine et le blob chiffre : aucune valeur de header en clair, aucune cle client, aucune query string portant un secret

### AC-37.9 Import d'une configuration : champs redactes presentes vides

**Given** une reponse de `/api/decode` portant des `valueRedacted`
**When** l'UI reconstruit le formulaire depuis cette reponse
**Then** les champs de valeur de header sont vides et signales comme a ressaisir, jamais pre-remplis avec la valeur masquee

### AC-37.10 Une valeur redactee n'est jamais reutilisee pour regenerer

**Given** un formulaire importe dont une valeur de header est restee vide
**When** l'utilisateur soumet sans la ressaisir
**Then** la generation est refusee cote client, et un appel direct a `/api/generate` avec une valeur composee d'asterisques est refuse en `400`

### AC-37.11 Le body de `/api/generate` ne renvoie pas les secrets d'auth

**Given** un `POST /api/generate` en mode headers
**When** on inspecte la reponse
**Then** elle contient exactement `url`, `key` et `blob`, et aucune valeur de header en clair

### AC-37.12 Le partage `?c=` en mode addon ne transporte pas la topologie du compte

**Given** une configuration en mode « Scalingo Database API » avec `app: "mon-app"` et `addonId: "ad-1111-2222"`
**When** on produit une URL de partage et qu'on decode reellement le payload `?c=`
**Then** le payload contient le mode `scalingo-addon` et l'`apiUrl` de la region, mais `app` et `addonId` valent la chaine vide : ni le nom de l'application ni l'identifiant de la base n'y apparaissent

> Une URL de partage circule par nature, dans un ticket ou une conversation. Y laisser le nom des applications et l'inventaire des bases d'un compte Scalingo, ce n'est pas une fuite de secret d'authentification, mais c'est de la cartographie d'infrastructure. Le destinataire recharge ses propres bases.

### AC-37.13 Aller-retour de partage en mode addon : le destinataire doit ressaisir

**Given** un `?c=` produit en mode addon
**When** on l'applique a un formulaire vierge
**Then** le mode et la region sont restaures, les champs application et base sont vides et signales a renseigner, et une generation immediate sans ressaisie est refusee

---

## AC-38 : Cle client fournie (BYOK), contrat serveur

> **Ref specs** : §15, `limits.md` §10.
> Contraintes : 24 caracteres minimum, 256 maximum, ASCII imprimables `0x21` a `0x7E`, trim des espaces de bord avant validation.

### AC-38.1 Sans champ `key` : comportement inchange

**Given** un `POST /api/generate` sans champ `key`
**When** le serveur genere le blob
**Then** la reponse contient une `key` generee par le serveur (`crypto.randomUUID()`, 36 caracteres) et le blob se dechiffre avec elle

### AC-38.2 Avec une `key` conforme : utilisee et renvoyee a l'identique

**Given** un `POST /api/generate` avec `key: "cle-de-ci-tres-longue-et-ok"`
**When** le serveur genere le blob
**Then** la reponse renvoie exactement cette `key`, et `POST /api/decode` avec cette cle et ce blob reussit

### AC-38.3 La cle serveur n'est pas utilisee quand une cle est fournie

**Given** le meme appel
**When** on tente de dechiffrer le blob avec une autre cle
**Then** `401 invalid_credentials` (le blob n'est dechiffrable qu'avec la cle fournie)

### AC-38.4 Longueur minimale : bornes exactes

**Given** un `POST /api/generate` avec une `key` de 23 caracteres, puis une de 24
**When** le serveur valide le body
**Then** 23 est refuse en `400 {"error": "invalid_key", ...}`, 24 est accepte

### AC-38.5 Longueur maximale : bornes exactes

**Given** une `key` de 256 caracteres, puis une de 257
**When** le serveur valide le body
**Then** 256 est accepte, 257 est refuse en `400 invalid_key`

### AC-38.6 Espace interne : refuse

**Given** une `key` de 30 caracteres contenant un espace au milieu
**When** le serveur valide le body
**Then** `400 invalid_key`

### AC-38.7 Caractere non ASCII : refuse

**Given** une `key` de 30 caracteres contenant `é`, puis une contenant un emoji
**When** le serveur valide le body
**Then** `400 invalid_key` dans les deux cas

### AC-38.8 Caractere de controle : refuse

**Given** une `key` de 30 caracteres contenant `\t`, puis `\n`, puis ` `
**When** le serveur valide le body
**Then** `400 invalid_key` dans les trois cas

### AC-38.9 Trim des espaces de bord

**Given** une `key` valant `"  cle-de-ci-tres-longue-ok-42  "` dont le contenu utile fait 27 caracteres
**When** le serveur valide et genere
**Then** la generation reussit, la `key` renvoyee est la version trimmee, et c'est elle qui dechiffre le blob

### AC-38.10 Le trim ne sauve pas une cle trop courte

**Given** une `key` valant `"   court-20-caracteres   "` dont le contenu utile fait 20 caracteres
**When** le serveur valide le body
**Then** `400 invalid_key` (la validation s'applique apres le trim)

### AC-38.11 Validation cote serveur, pas seulement UI

**Given** un appel direct a `POST /api/generate` (hors navigateur, sans passer par le formulaire) avec `key: "a"`
**When** le serveur valide le body
**Then** `400 invalid_key`, avec le refus produit par le schema Zod de `GenerateBody` et non par du code UI

### AC-38.12 Message d'erreur sans echo de la cle

**Given** un `POST /api/generate` avec `key: "cle-refusee-avec-un-espace ici"`
**When** le serveur repond `400 invalid_key`
**Then** le `message` ne contient aucun fragment de la cle soumise

### AC-38.13 Mutualisation : les droits ne sont pas partages

**Given** deux blobs generes avec la meme cle client, l'un `GET:/v1/*` et l'autre `POST:/v1/*`, TTL differents
**When** on utilise chaque blob avec cette cle
**Then** chaque blob applique ses propres scopes et son propre TTL ; le blob read-only refuse toujours un `POST` en `403 scope_denied`

### AC-38.14 `key: ""` est refuse, avec un message qui indique la sortie

**Given** un `POST /api/generate` avec `key: ""`
**When** le serveur valide le body
**Then** `400 {"error": "invalid_key", "message": "Client key is empty. Omit the field entirely to let the server generate one"}`, et aucun blob n'est genere

> **Arbitrage rendu le 2026-09-03** : une variable d'environnement CI non definie vaut la chaine vide, pas l'absence du champ. Traiter `""` comme absent produirait un blob chiffre avec une cle serveur aleatoire que le pipeline ignore, et l'echec ne se manifesterait qu'au premier appel proxyfie, loin de sa cause. Le message doit dire quoi faire, pas seulement que c'est refuse.

### AC-38.16 `empty` et `too-short` sont deux cas distincts

**Given** un `POST /api/generate` avec `key: ""`, puis un avec `key: "trop-court"` (10 caracteres)
**When** le serveur valide les deux bodies
**Then** les deux renvoient `400 invalid_key` mais avec deux `message` differents : celui de la chaine vide invite a omettre le champ, celui de la cle courte annonce le minimum de 24 caracteres

> Un seul message pour les deux cas enverrait l'utilisateur de la chaine vide chercher a rallonger une cle qu'il n'a pas saisie.

### AC-38.18 Un retour a la ligne de fin est trimme, pas refuse

**Given** un `POST /api/generate` avec une `key` valide suivie d'un `\n`
**When** le serveur valide le body
**Then** la generation reussit et la `key` renvoyee est la version sans le saut de ligne

> Comportement voulu par §15.3. Un copier-coller depuis un gestionnaire de secrets ramene souvent un saut de ligne final, et HTTP le retirerait de toute facon en transit. A ne pas confondre avec AC-38.8 : un caractere de controle **interieur** reste refuse, c'est le cas d'injection d'en-tete.

### AC-38.19 Tout le charset ASCII imprimable est accepte

**Given** une cle composee des 94 caracteres ASCII imprimables de `0x21` a `0x7E`
**When** le serveur la valide
**Then** elle est acceptee ; la meme longueur composee d'espaces est refusee (l'espace, a `0x20`, est le seul caractere imprimable exclu)

### AC-38.17 `key` absente du body : cle generee, aucune erreur

**Given** un `POST /api/generate` sans champ `key`, puis un avec `key: null`
**When** le serveur valide le body
**Then** l'appel sans le champ genere une cle serveur et reussit ; le comportement sur `null` est celui du schema Zod et il est identique a l'absence ou refuse explicitement, jamais un `500`

### AC-38.15 Enum OpenAPI de `/api/generate`

**Given** la spec `GET /api/openapi.json`
**When** on inspecte les reponses `400` de `/api/generate`
**Then** l'enum des codes contient `invalid_key` et `auth_limit_exceeded` en plus des codes existants

---

## AC-39 : UI, soumettabilite du formulaire et champs masques

> **Ref specs** : §12.6, §12.7, §12.8, §12.9 et les specs design `custom-headers-multi.md` §5, `byok-client-key.md` §7.2.
> **Piege couvert** : un champ `required` invalide dans un conteneur `hidden` fait echouer `reportValidity()` et rend le formulaire non soumettable **sans aucun message visible**.

### AC-39.1 Mode headers multiples : `#token` perd `required` et sa section est masquee

**Given** la page de configuration chargee
**When** l'utilisateur selectionne le mode « Headers multiples » dans `#auth`
**Then** la section contenant `#token` porte l'attribut `hidden`, `#token` n'a plus l'attribut `required` et sa valeur est videe

### AC-39.2 Le formulaire reste soumettable dans tous les modes d'auth

**Given** un formulaire correctement rempli
**When** on selectionne successivement chaque mode d'auth (`bearer`, `basic`, « Scalingo API », « Scalingo Database API », « Headers multiples ») et qu'on soumet
**Then** `form.checkValidity()` vaut `true` dans chaque mode et la soumission part, sans blocage silencieux ni erreur console `An invalid form control is not focusable`

### AC-39.3 Aller-retour entre modes : `required` restaure, saisies conservees

**Given** un passage en mode headers multiples avec deux lignes saisies, puis un retour en mode `bearer`
**When** on inspecte le DOM
**Then** `#token` a retrouve son attribut `required`, sa section est revelee, la section headers est masquee, et les deux lignes headers sont toujours presentes en DOM avec leurs valeurs

### AC-39.4 `#byok-key` n'a ni `required`, ni `minlength`, ni `pattern`, ni `maxlength`

**Given** la page de configuration chargee
**When** on inspecte l'element `#byok-key`
**Then** aucun de ces quatre attributs n'est present

> `required`, `minlength` et `pattern` sont exclus parce qu'un champ invalide dans un `<details>` ferme fait echouer `reportValidity()` (cf. `byok-client-key.md` §7.2). `maxlength` a ete retire pour une autre raison, plus grave, couverte par AC-39.19.

### AC-39.5 Formulaire soumettable avec le bloc BYOK ferme et vide

**Given** un formulaire valide et `#byok-details` ferme, `#byok-key` vide
**When** on soumet
**Then** la soumission part et aucune validation native ne se declenche sur le champ masque

### AC-39.6 Cle BYOK invalide et bloc ferme : ouverture, focus, message visible

**Given** `#byok-key` contient une cle de 10 caracteres et `#byok-details` est ferme
**When** on soumet
**Then** la generation est bloquee, `#byok-details` s'ouvre, `#byok-key` recoit `aria-invalid="true"` puis le focus, et un message d'erreur visible est affiche (dans cet ordre : ouvrir avant de focuser)

### AC-39.7 Focus deplace quand la section token est masquee

**Given** le focus place dans `#token` (import de configuration, clic sur un preset, restauration depuis `?c=`)
**When** un changement d'etat masque la section token
**Then** le focus est deplace sur `#auth`, jamais laisse sur un element retire du rendu

### AC-39.8 Badge BYOK visible quand le bloc est replie

**Given** une cle saisie dans `#byok-key`
**When** on referme `#byok-details`
**Then** `#byok-active-badge` est visible sur la ligne du `<summary>` ; vider le champ le fait disparaitre

### AC-39.9 Reinitialisation par le preset clear

**Given** une cle BYOK saisie et le bloc ouvert
**When** on clique sur `#btn-preset-clear`
**Then** `#byok-key` est vide, `#byok-details` est referme, le badge est masque, la jauge est remise a zero

### AC-39.10 Preset Scalingo ne touche pas au bloc BYOK

**Given** une cle BYOK saisie
**When** on applique un preset Scalingo
**Then** la cle est conservee (la cle client est orthogonale a la cible)

### AC-39.11 Derniere ligne de header non supprimable

**Given** le mode headers multiples avec une seule ligne
**When** on inspecte le bouton de suppression de cette ligne
**Then** il est `disabled` avec un `title` explicatif (le mode sans header n'a pas de sens)

### AC-39.12 Limite de 8 headers dans l'UI

**Given** huit lignes de headers saisies
**When** on inspecte `#btn-add-header` et `#custom-headers-count`
**Then** le bouton est `disabled` et le compteur affiche `8 / 8`

### AC-39.13 Changement de region : la selection de base est reinitialisee

**Given** une base chargee et selectionnee en etat `loaded`
**When** on change la region
**Then** l'etat repasse a `idle`, le select est vide et desactive, et le changement est annonce dans la region live

> Les identifiants d'addon ne sont pas valides d'une region a l'autre : garder une base selectionnee apres un changement de region produirait un blob silencieusement faux.

### AC-39.14 Modification du nom d'application : selection remise a `idle`

**Given** une base chargee et selectionnee
**When** on modifie l'input application
**Then** l'etat repasse a `idle`, le select est vide et desactive, l'`aria-invalid` est retire (une base appartenant a une autre application produirait un blob silencieusement faux)

### AC-39.15 L'option d'addon affiche le `resourceId` mais ne transporte que l'`id`

**Given** un chargement de bases reussi renvoyant `{id: "ad-1111", resourceId: "my-db-123", provider: "PostgreSQL", plan: "postgresql-starter-512"}`
**When** on inspecte l'option correspondante du select puis le blob genere apres selection
**Then** le `value` de l'option vaut `ad-1111`, son libelle affiche `my-db-123` et le provider pour rester lisible, et le blob genere ne contient que `app` et `addonId` : `my-db-123` n'y apparait pas

> `resourceId` est de l'affichage. C'est ce qui rend la liste lisible sans forcer l'utilisateur a reconnaitre un ObjectID. Il s'arrete au navigateur, voir AC-35.24.

### AC-39.16 ~~Avertissement au-dela de 3 bases, blocage a 5~~

**Obsolete** : le mode est mono-addon (arbitrage du 2026-09-03). Il n'y a plus de bouton d'ajout, plus de compteur, plus de limite. Un blob donne acces a une base et une seule, ce qui rend l'avertissement sans objet.

### AC-39.19 NON-REGRESSION : un collage de clé trop longue n'est jamais tronque en silence

**Given** le bloc BYOK ouvert et une chaine de plus de 300 caracteres ASCII imprimables collee dans `#byok-key`
**When** on inspecte la valeur du champ puis qu'on soumet
**Then** la valeur du champ est conservee **integralement** (plus de 300 caracteres, pas 256), le message « 256 caractères maximum. » est affiche, la soumission est bloquee cote client, et un appel direct a `/api/generate` avec cette meme chaine est refuse en `400 invalid_key`

> **Le bug que cet AC empeche de revenir.** Avec un `maxlength="256"`, le navigateur tronquait le collage sans rien dire. L'utilisateur croyait avoir sa cle, le blob etait chiffre avec les 256 premiers caracteres, et l'echec ne se manifestait qu'au premier appel proxyfie, sans aucune piste vers la cause. Le message d'erreur de longueur maximale etait par construction inatteignable, puisque la valeur ne pouvait plus depasser la limite. C'est exactement le genre de defaillance silencieuse qu'un attribut de commodite introduit dans un formulaire de securite. Test de non-regression demande par le designer.

### AC-39.20 La jauge de diversite a trois segments et trois niveaux

**Given** quatre saisies dans `#byok-key` : une chaine de 10 caracteres, une chaine de 30 caracteres a 5 caracteres distincts, une chaine de 30 caracteres a 10 caracteres distincts d'une seule famille, et une chaine de 30 caracteres variee
**When** on inspecte la jauge apres chaque saisie
**Then** la jauge compte trois segments au total, et les niveaux rendus sont respectivement « trop courte » bloquant, « faible », « moyenne » et « élevée »

### AC-39.21 Une cle hexadecimale de 32 caracteres sort en diversite élevée

**Given** une cle hexadecimale aleatoire de 32 caracteres (16 caracteres distincts, une seule famille au sens des chiffres et minuscules)
**When** la jauge la mesure
**Then** le niveau rendu est « élevée », et la generation n'est pas bloquee

> C'est une bonne cle, 128 bits d'entropie. L'ancien palier a `n >= 32` la retrogradait, ce qui faisait mentir la jauge dans le sens le plus penalisant : decourager une cle correcte. La jauge informe, seule la longueur contraint.

### AC-39.17 Aucun script ni style inline dans le HTML servi

**Given** les reponses `GET /` et `GET /logs`
**When** on inspecte le HTML
**Then** aucune balise `<script>` sans attribut `src`, aucun attribut `style=`, aucun gestionnaire `on*=` (la CSP `script-src 'self'` sans `unsafe-inline` doit passer)

### AC-39.18 Validation client miroir des limites serveur

**Given** un formulaire en mode headers multiples
**When** on saisit une cle BYOK de 23 caracteres, ou un nom de header de 65 caracteres, ou 9 headers
**Then** la generation est bloquee cote client avec un message identifiant le champ fautif, sans appel a `/api/generate`

---

## AC-40 : Documentation pour agents LLM (`/llms.txt`)

> **Ref specs** : §16.

### AC-40.1 Contrat HTTP

**Given** une requete `GET /llms.txt` sans header particulier
**When** le serveur repond
**Then** `200`, `Content-Type: text/markdown; charset=utf-8`, `Cache-Control: public, max-age=3600`

### AC-40.2 Pas d'authentification, pas de kill switch

**Given** `FGP_LOGS_ENABLED` non defini et aucun header `X-FGP-Key`
**When** on appelle `GET /llms.txt`
**Then** `200` avec le document complet

### AC-40.3 Structure conforme a llmstxt.org

**Given** le contenu de `/llms.txt`
**When** on le parse
**Then** il commence par un unique titre `#`, suivi d'un blockquote `>`, puis d'un bloc de prose, puis de sections `##`

### AC-40.4 Aucun titre dans le bloc de prose

**Given** le contenu entre le blockquote et le premier `##`
**When** on cherche des lignes commencant par `#`
**Then** aucune n'est trouvee (la convention interdit les titres dans le bloc de prose)

### AC-40.5 Les sections H2 ne contiennent que des listes de liens

**Given** chaque section `##` du document
**When** on inspecte ses lignes non vides
**Then** chacune est une entree de liste au format `- [nom](url): description`

### AC-40.6 Taille sous 8 KB

**Given** le contenu de `/llms.txt`
**When** on mesure sa taille en octets UTF-8
**Then** elle est inferieure a 8192

### AC-40.7 Document en anglais

**Given** le contenu de `/llms.txt`
**When** on inspecte le texte
**Then** il ne contient aucun mot-cle francophone de la copy UI (par exemple « Bases de donnees », « Clé client », « Headers multiples »)

### AC-40.8 Contenu de fond present

**Given** le contenu de `/llms.txt`
**When** on cherche les elements requis par §16.4
**Then** on y trouve la syntaxe `METHOD:PATH`, la regle deny-all, les six modes d'authentification, les headers `X-FGP-Key` et `X-FGP-Blob`, la distinction `X-FGP-Source: proxy` / `upstream`, les codes d'erreur FGP, et au moins deux blocs `curl` complets

### AC-40.9 Liens absolus bases sur l'origine de la requete

**Given** une requete `GET /llms.txt` sur l'origine `https://fgp.example.com`
**When** on inspecte les liens du document
**Then** ils pointent vers `https://fgp.example.com/api/openapi.json` et `https://fgp.example.com/api/docs`, et le lien README pointe vers le repo GitHub

### AC-40.10 Aucune donnee d'instance divulguee

**Given** un serveur avec `FGP_SALT` defini, la feature logs activee et des blobs en circulation
**When** on inspecte le contenu de `/llms.txt`
**Then** il ne contient ni le salt, ni un blob, ni une cible configuree, ni un scope existant, ni l'etat de la feature logs

### AC-40.11 Contenu identique pour tous les appelants

**Given** deux requetes `GET /llms.txt`, l'une anonyme et l'autre avec un `X-FGP-Key` valide
**When** on compare les deux reponses
**Then** les bodies sont strictement identiques

### AC-40.12 `/llms.txt` en mode blob par header est proxyfie

**Given** une requete `GET /llms.txt` portant `X-FGP-Blob` et `X-FGP-Key` valides, avec un scope autorisant `GET:/llms.txt`
**When** le proxy traite la requete
**Then** la requete est forwardee vers `target`, la reponse porte `X-FGP-Source: upstream`, et le document FGP local n'est pas servi

### AC-40.13 Balise de decouverte dans le `<head>`

**Given** les reponses `GET /` et `GET /logs`
**When** on inspecte le `<head>`
**Then** chacune contient `<link rel="describedby" type="text/markdown" href="/llms.txt">`

### AC-40.14 Header `Link` sur les reponses HTML FGP

**Given** les reponses `GET /` et `GET /logs`
**When** on inspecte les headers
**Then** chacune porte `Link: </llms.txt>; rel="describedby"; type="text/markdown"`

### AC-40.15 Aucun header `Link` sur une reponse forwardee

**Given** une requete proxyfiee valide en mode URL, puis en mode header, dont la cible renvoie du HTML
**When** on inspecte les headers de la reponse
**Then** aucun header `Link` n'est ajoute par FGP (ce serait une transformation de reponse upstream, interdite par l'ADR-0006)

### AC-40.16 Pas de `/llms-full.txt`

**Given** une requete `GET /llms-full.txt`
**When** le serveur repond
**Then** la requete n'est pas servie par FGP (elle tombe dans le pattern proxy `/:blob/*` ou en 404 selon la resolution de route), et en aucun cas un second document n'est expose

### AC-40.17 `/llms.txt` porte les headers de securite

**Given** une requete `GET /llms.txt`
**When** on inspecte les headers de reponse
**Then** ils incluent `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Strict-Transport-Security` et la CSP commune (§17.1 liste `/llms.txt` parmi les chemins couverts)

---

## AC-41 : Headers de securite HTTP et transparence ADR-0006

> **Ref specs** : §17, ADR-0006.
> **Invariant le plus fragile de la session** : les headers de securite sont montes sur une liste explicite de chemins servis par FGP, jamais sur `*`. Repasser le middleware en `app.use("*", ...)` casserait la transparence du proxy. Les AC-41.5 a AC-41.8 sont la pour que ce changement fasse rougir la CI.

### AC-41.1 Headers poses sur les chemins servis par FGP

**Given** des requetes vers `/`, `/healthz`, `/static/styles.css`, `/logs`, `/api/salt` et `/llms.txt`
**When** on inspecte les headers de reponse
**Then** chacune porte `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, `Strict-Transport-Security: max-age=31536000; includeSubDomains`, `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-origin` et un `Permissions-Policy`

### AC-41.2 CSP commune

**Given** une requete `GET /`
**When** on inspecte le header `Content-Security-Policy`
**Then** il contient `default-src 'none'`, `script-src 'self'`, `style-src 'self'`, `img-src 'self' data:`, `font-src 'self'`, `connect-src 'self'`, `form-action 'self'`, `frame-ancestors 'none'`, `base-uri 'none'`, `object-src 'none'`, et **pas** `unsafe-inline`

### AC-41.3 CSP dediee sur `/api/docs`

**Given** une requete `GET /api/docs`
**When** on inspecte le header `Content-Security-Policy`
**Then** `script-src` et `style-src` autorisent `'self'`, `'unsafe-inline'` et l'origine du CDN Swagger, `img-src` et `font-src` incluent cette origine, `default-src 'none'` et `frame-ancestors 'none'` sont conserves, et le header n'est jamais absent

### AC-41.4 `Cache-Control: no-store` sur les reponses porteuses de secrets

**Given** des requetes vers `/api/generate`, `/api/decode`, `/api/salt` et `/logs/stream`
**When** on inspecte les headers de reponse
**Then** chacune porte `Cache-Control: no-store`

### AC-41.5 INVARIANT : aucune reponse upstream forwardee ne porte de header de securite (mode URL)

**Given** une requete proxyfiee valide en mode URL `/{blob}/v1/apps` dont la cible repond `200`
**When** on inspecte les headers de la reponse renvoyee au client
**Then** la reponse porte `X-FGP-Source: upstream` et **aucun** des headers suivants : `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Strict-Transport-Security`, `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`, `Permissions-Policy`

### AC-41.6 INVARIANT : idem en mode header `X-FGP-Blob`

**Given** une requete proxyfiee valide en mode header (`X-FGP-Blob` + `X-FGP-Key`) sur un path arbitraire, y compris un path qui collisionne avec un chemin FGP (`/`, `/api/salt`, `/logs`, `/llms.txt`)
**When** on inspecte les headers de la reponse renvoyee au client
**Then** la reponse porte `X-FGP-Source: upstream` et aucun des headers de securite listes en AC-41.5

> **Pourquoi ce cas est le plus dangereux** : `blobHeaderProxy()` intercepte avant le montage des chemins FGP. Une requete avec `X-FGP-Blob` sur `/api/salt` est proxyfiee. Si le middleware de securite etait monte sur `*`, ou monte avant `blobHeaderProxy`, cette reponse upstream se verrait enrichie sans que rien d'autre ne casse.

### AC-41.7 INVARIANT : une reponse upstream avec CSP propre n'est pas ecrasee

**Given** une requete proxyfiee valide dont la cible renvoie elle-meme un `Content-Security-Policy: default-src https://exemple.test`
**When** on inspecte la reponse renvoyee au client
**Then** le header CSP recu est celui de l'upstream, ni remplace ni double

### AC-41.8 INVARIANT structurel : le middleware n'est monte sur aucun pattern couvrant le proxy

**Given** la liste des chemins sur lesquels le middleware de headers de securite est monte (`FGP_OWNED_PATHS`)
**When** on l'inspecte
**Then** elle ne contient ni `*`, ni `/*`, ni `/:blob/*`, ni aucun pattern qui matcherait un path proxyfie a deux segments

### AC-41.9 Recensement des routes FGP, enumere depuis l'app Hono

**Given** les routes **reellement enregistrees sur l'instance Hono**, obtenues en enumerant `app.routes` et non depuis une liste ecrite a la main dans le fichier de test
**When** on retire les entrees du pattern proxy `/:blob/*` et qu'on interroge chacune des routes restantes
**Then** chaque reponse porte `X-Content-Type-Options: nosniff`, et l'ajout d'une route servie par FGP sans l'inscrire dans `FGP_OWNED_PATHS` fait echouer ce test

> **Pourquoi l'enumeration est la condition de l'efficacite du test.** Une liste de chemins ecrite dans le fichier de test ne detecte rien : la personne qui oublie d'inscrire sa route dans `FGP_OWNED_PATHS` oubliera aussi la liste du test, et les deux oublis se compensent en silence. Le test doit tirer sa source de verite de l'application elle-meme. Si Hono n'expose pas les routes sous une forme exploitable, la sortie de repli est d'enumerer les fichiers de routes, jamais de retomber sur une liste manuelle.

### AC-41.10 Le 404 statique porte les headers

**Given** une requete `GET /static/inexistant.css`
**When** le serveur repond `404`
**Then** la reponse porte les headers de securite (elle est generee par FGP)

### AC-41.11 Le 404 `/api/*` porte les headers

**Given** une requete `GET /api/inexistant`
**When** le serveur repond `404 not_found`
**Then** la reponse porte les headers de securite et `X-FGP-Source: proxy`

### AC-41.12 Les erreurs FGP de la route proxy portent les en-tetes de securite

**Given** des requetes sur la route proxy refusees par FGP : `401 missing_key`, `401 invalid_credentials`, `403 scope_denied`, `410 token_expired`, `414 blob_too_large`, `502 upstream_unreachable`
**When** on inspecte les headers de chaque reponse
**Then** chacune porte `X-FGP-Source: proxy` et l'integralite des en-tetes de `FGP_SECURITY_HEADERS`, en mode URL comme en mode header

> **Arbitrage rendu le 2026-09-03** : ces reponses sont produites par FGP, pas par l'upstream. Elles meritent le meme durcissement qu'une page FGP. La discrimination se fait apres coup sur `X-FGP-Source`, ce qui preserve l'ADR-0006 : une reponse `upstream` sur la meme route reste nue (AC-41.5 et AC-41.6). C'est la reponse au probleme souleve au point 1 du rapport de challenge, ou le `Referrer-Policy` etait absent precisement des URLs qui contiennent un blob.

### AC-41.13 PARITE : trois sources d'en-tetes, un seul jeu

**Given** trois collections d'en-tetes : ceux d'une reponse de route UI (`GET /`), ceux d'une erreur FGP de la route proxy (`403 scope_denied`), et la constante `FGP_SECURITY_HEADERS` importee depuis `src/constants.ts`
**When** on normalise la casse des noms et qu'on exclut `content-type`, `content-length`, `date` et `x-fgp-source`
**Then** les trois collections contiennent exactement les **13** memes noms d'en-tetes, avec des valeurs identiques nom par nom

> **Cet AC est la contrepartie d'une decision d'architecture.** Le lead a refuse une derivation dynamique de la liste au profit d'une constante explicite, precisement pour qu'une divergence produise un echec de test nomme plutot qu'un silence. Sans ce test, la constante et ce que `secureHeaders()` produit reellement peuvent deriver l'une de l'autre a la premiere montee de version de Hono, et personne ne le verra : les pages resteront durcies, les erreurs du proxy le seront un peu moins, et rien ne cassera. Le test doit comparer **nom par nom et valeur par valeur**, pas seulement compter.

### AC-41.14 PARITE : la CSP dediee de `/api/docs` n'est pas ecrasee

**Given** une requete `GET /api/docs`, servie par la CSP permissive dediee
**When** on inspecte le header `Content-Security-Policy` de la reponse
**Then** il contient `'unsafe-inline'` et l'origine du CDN Swagger, et n'a pas ete remplace par la CSP stricte de `FGP_SECURITY_HEADERS`

> Le wrapper qui pose les en-tetes sur les erreurs FGP du proxy doit se garder de re-estampiller une reponse deja traitee. `/api/docs` est le seul endroit ou les deux jeux different, donc le seul endroit ou la regression serait visible.

### AC-41.15 `/logs` et `/logs/*` sont exclus du mode header

**Given** une requete portant `X-FGP-Blob` et `X-FGP-Key` valides sur `/logs`, puis sur `/logs/health`
**When** le proxy traite la requete
**Then** aucune des deux n'est proxyfiee : elles portent `X-FGP-Source: proxy` et sont servies localement

> **C'est la seule carve-out du mode header, et elle est necessaire.** La feature `/logs` identifie elle-meme le blob a streamer par `X-FGP-Blob` et `X-FGP-Key` (§14.9). Sans cette exclusion, toute tentative d'ouverture de stream partirait vers l'upstream et la feature serait injoignable. Le comportement est correct mais **n'est ecrit nulle part dans les specs**, alors que §16.2 prend soin de dire que `/llms.txt`, lui, n'est pas exclu. Un lecteur en deduit qu'aucune route ne l'est. Cet AC existe pour que la suppression de la carve-out fasse echouer la CI plutot que de casser la feature en silence. Voir le point 20 du rapport de challenge.

---

## AC-42 : Retro-compatibilite v2 / v3 face au lot v4

> **Ref specs** : §6.1, §6.2.
> **Regle de version** : `v` est la plus haute des deux resolutions, `auth` objet donne `4`, sinon un ScopeEntry donne `3`, sinon `2`. Un blob v4 peut n'avoir que des scopes string ; un blob v3 conserve une auth string.

### AC-42.1 Blob v2 existant : comportement inchange

**Given** un blob v2 genere avant le lot v4 (`auth: "bearer"`, scopes string)
**When** il passe par le proxy nouvelle version
**Then** scopes verifies, `Authorization: Bearer {token}` pose, reponse forwardee, comportement identique a la version precedente

### AC-42.2 Blob v3 existant : comportement inchange

**Given** un blob v3 avec ScopeEntry et body filters, `auth: "scalingo-exchange"`
**When** il passe par le proxy nouvelle version
**Then** body filters appliques, exchange effectue, reponse forwardee, comportement identique

### AC-42.3 Blob v2 en `header:{name}` : comportement inchange

**Given** un blob v2 avec `auth: "header:X-API-Key"` et `token: "sk-1"`
**When** une requete est forwardee
**Then** la requete sortante porte `X-API-Key: sk-1`, exactement comme avant le lot v4

### AC-42.4 Un seul header ne produit jamais un blob v4

**Given** un `POST /api/generate` avec une seule entree de header d'auth et des scopes string uniquement
**When** on dechiffre le blob genere
**Then** `v` vaut `2` et `auth` vaut `"header:X-API-Key"` (non-regression sur la serialisation compacte)

### AC-42.5 Auth structuree + scopes string : v4

**Given** un `POST /api/generate` avec deux headers d'auth et uniquement des scopes string
**When** on dechiffre le blob genere
**Then** `v` vaut `4`

### AC-42.6 Auth string + ScopeEntry : v3

**Given** un `POST /api/generate` avec `auth: "bearer"` et au moins un ScopeEntry
**When** on dechiffre le blob genere
**Then** `v` vaut `3`, jamais `4`

### AC-42.7 Auth structuree + ScopeEntry : v4

**Given** un `POST /api/generate` avec un AuthSpec `scalingo-addon` et au moins un ScopeEntry
**When** on dechiffre le blob genere
**Then** `v` vaut `4`

### AC-42.8 `v` inconnu : rejete

**Given** un blob dont `v` vaut `5`, puis `1`
**When** le proxy dechiffre et valide
**Then** les deux blobs sont rejetes en `401 invalid_credentials`

### AC-42.9 Le champ `logs` reste orthogonal a la version

**Given** un blob v4 avec `logs: {enabled: true, detailed: true}`
**When** le proxy dechiffre, valide et capture
**Then** la capture fonctionne comme sur un blob v3 (§6.2 : le champ `logs` est orthogonal au versioning)

### AC-42.10 `/api/decode` d'un blob v2/v3 : shape de reponse inchangee

**Given** un blob v2 puis un blob v3
**When** on appelle `POST /api/decode`
**Then** la reponse garde la shape existante (`auth` est une string, `tokenRedacted` present), sans champ nouveau qui casserait un consommateur existant

### AC-42.11 `/api/share/encode` d'une configuration v2/v3 : inchange

**Given** une configuration `auth: "bearer"` avec des scopes string
**When** on appelle `POST /api/share/encode` puis `POST /api/share/decode`
**Then** l'aller-retour est fidele et le format encode reste compatible avec les URLs `?c=` deja partagees

### AC-42.12 Blob v4 des scopes v2/v3 : aucun bump implicite

**Given** un blob v3 existant, dechiffre puis re-chiffre sans modification par FGP
**When** on inspecte la version
**Then** `v` reste `3` (FGP ne migre jamais un blob a la volee)

---

## Assumptions : proprietes cryptographiques non directement testables

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

- **Blob v4 (AC-34 a AC-42)** : le champ `auth` accepte un `AuthSpec` structure (`headers`, `scalingo-addon`). Les blobs v2 et v3 restent lus a l'identique. Un AuthSpec `headers` a une seule entree est serialise en forme legacy `header:{name}` et ne bump pas la version.

- **Codes d'erreur d'auth upstream** : `auth_exchange_failed` (502, `scalingo-exchange`) et `auth_addon_failed` (502, `scalingo-addon`) remplacent la remontee en `upstream_unreachable` sur un echec d'obtention de credentials. `upstream_unreachable` reste strictement reserve au `fetch` qui throw pendant le forward. `token_exchange_failed` (401) reste le code des endpoints internes `/api/list-apps` et `/api/list-addons`, il ne se confond avec aucun des deux.

- **Arbitrages du 2026-09-03 repercutes** : multi-addon abandonne au profit du mono-addon (AuthSpec `scalingo-addon` aplati, plus de tableau, plus de `resourceId` dans le blob, code `addon_not_resolved` supprime). AC-35.2 a 35.7, AC-35.18, AC-35.19, AC-36.3 et AC-39.16 sont marques obsoletes plutot que supprimes, pour ne pas decaler la numerotation. Nouveaux AC : AC-35.24 (`resourceId` n'atteint jamais le blob), AC-36.14 a 36.16 (`app_not_found`), AC-37.12 et 37.13 (partage `?c=` en mode addon), AC-38.16 et 38.17 (`empty` vs `too-short`), AC-39.19 a 39.21 (`maxlength` retire, jauge a trois niveaux), AC-41.13 et 41.14 (parite des en-tetes).

- **Copy UI `/logs` a confirmer par le PO** : trois chaines de `docs/specs.md` §14.13 ont ete modifiees dans `src/ui/logs-client.ts` pendant la purge des tirets cadratins (« Body trop volumineux, non stocke », « Blob ou cle invalide : impossible de dechiffrer. », « Dechiffrement impossible : verifiez votre cle »). Les AC-20.x et AC-26.x portent la valeur observee dans le code, mais `specs.md` §14.13 porte encore l'ancienne ponctuation. **Ce n'est pas un alignement valide** : tant que le PO n'a pas tranche et mis a jour §14.13, ces AC assertent une chaine que la spec ne porte pas. A regler avant d'implementer les tests correspondants.

- **Invariant ADR-0006 sur les headers de securite (AC-41.5 a AC-41.8)** : les headers de securite ne sont poses que sur les chemins servis par FGP. Aucune reponse upstream forwardee, mode URL ou mode header, ne doit en porter. Ces quatre AC sont des tests de non-regression : ils doivent echouer si le middleware repasse un jour sur `app.use("*")`.
