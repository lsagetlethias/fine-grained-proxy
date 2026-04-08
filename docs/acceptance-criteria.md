# Criteres d'acceptation — Fine-Grained Proxy (FGP)

**Version** : 1.0
**Date** : 2026-04-08
**Ref specs** : `docs/specs.md` v1.1

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
**Then** le proxy obtient le JSON contenant `v`, `token`, `scopes`, `createdAt`, `ttl` et poursuit la chaine de verification

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

## AC-3 — Verification du scope app

### AC-3.1 App autorisee explicitement

**Given** un blob avec `scopes: {"my-app": ["read"]}`
**When** la requete cible `GET /v1/apps/my-app`
**Then** la verification du scope app passe

### AC-3.2 App non autorisee

**Given** un blob avec `scopes: {"my-app": ["read"]}`
**When** la requete cible `GET /v1/apps/other-app`
**Then** le proxy renvoie `403` avec `{"error": "app_not_allowed", "message": "Access denied for this application"}`

### AC-3.3 Wildcard — toutes les apps

**Given** un blob avec `scopes: {"*": ["read"]}`
**When** la requete cible `GET /v1/apps/any-app`
**Then** la verification du scope app passe pour n'importe quelle app

### AC-3.4 Wildcard + app specifique — union des scopes

**Given** un blob avec `scopes: {"*": ["read"], "my-app": ["scale"]}`
**When** la requete cible `POST /v1/apps/my-app/scale`
**Then** `my-app` a les scopes `read` (de `*`) + `scale` (specifique) = la requete est autorisee

### AC-3.5 Wildcard + app specifique — autre app

**Given** un blob avec `scopes: {"*": ["read"], "my-app": ["scale"]}`
**When** la requete cible `POST /v1/apps/other-app/scale`
**Then** le proxy renvoie `403` (`scope_denied`) car `other-app` n'a que `read` (herite de `*`)

---

## AC-4 — Verification du scope action

### AC-4.1 Scope read — GET autorise

**Given** un blob avec `scopes: {"my-app": ["read"]}`
**When** la requete est `GET /v1/apps/my-app/containers`
**Then** la requete est autorisee

### AC-4.2 Scope read — POST refuse

**Given** un blob avec `scopes: {"my-app": ["read"]}`
**When** la requete est `POST /v1/apps/my-app/scale`
**Then** le proxy renvoie `403` avec `{"error": "scope_denied", "message": "Insufficient permissions for this action"}`

### AC-4.3 Scope scale — scale et restart autorises

**Given** un blob avec `scopes: {"my-app": ["scale"]}`
**When** la requete est `POST /v1/apps/my-app/scale` ou `POST /v1/apps/my-app/restart`
**Then** la requete est autorisee

### AC-4.4 Scope scale — deploy refuse

**Given** un blob avec `scopes: {"my-app": ["scale"]}`
**When** la requete est `POST /v1/apps/my-app/deployments`
**Then** le proxy renvoie `403` (`scope_denied`)

### AC-4.5 Scope deploy — uniquement deployments

**Given** un blob avec `scopes: {"my-app": ["deploy"]}`
**When** la requete est `POST /v1/apps/my-app/deployments`
**Then** la requete est autorisee

### AC-4.6 Scope logs

**Given** un blob avec `scopes: {"my-app": ["logs"]}`
**When** la requete est `GET /v1/apps/my-app/logs_url`
**Then** la requete est autorisee

### AC-4.7 Scope vars:read — lecture seule des variables

**Given** un blob avec `scopes: {"my-app": ["vars:read"]}`
**When** la requete est `GET /v1/apps/my-app/variables`
**Then** la requete est autorisee

### AC-4.8 Scope vars:read — ecriture refusee

**Given** un blob avec `scopes: {"my-app": ["vars:read"]}`
**When** la requete est `PUT /v1/apps/my-app/variables`
**Then** le proxy renvoie `403` (`scope_denied`)

### AC-4.9 Scope vars:write — ecriture autorisee

**Given** un blob avec `scopes: {"my-app": ["vars:write"]}`
**When** la requete est `PUT /v1/apps/my-app/variables`
**Then** la requete est autorisee

### AC-4.10 Scope vars:write — lecture refusee

**Given** un blob avec `scopes: {"my-app": ["vars:write"]}`
**When** la requete est `GET /v1/apps/my-app/variables`
**Then** le proxy renvoie `403` (`scope_denied`)

### AC-4.11 Scopes additifs

**Given** un blob avec `scopes: {"my-app": ["read", "scale"]}`
**When** la requete est `GET /v1/apps/my-app/containers` ou `POST /v1/apps/my-app/scale`
**Then** les deux requetes sont autorisees

### AC-4.12 Endpoint non couvert par la matrice — deny-all

**Given** un blob avec `scopes: {"my-app": ["read", "scale", "deploy", "logs", "vars:read", "vars:write"]}`
**When** la requete est `DELETE /v1/apps/my-app` ou `PATCH /v1/apps/my-app`
**Then** le proxy renvoie `403` (`scope_denied`) — tout endpoint absent de la matrice est refuse

---

## AC-5 — Filtrage de la liste des apps

### AC-5.1 GET /v1/apps avec apps specifiques

**Given** un blob avec `scopes: {"my-app": ["read"], "staging": ["read"]}`
**When** la requete est `GET /v1/apps` et Scalingo retourne `[my-app, staging, production, other]`
**Then** le proxy filtre la reponse et ne retourne que `[my-app, staging]`

### AC-5.2 GET /v1/apps avec wildcard

**Given** un blob avec `scopes: {"*": ["read"]}`
**When** la requete est `GET /v1/apps`
**Then** le proxy retourne la liste complete sans filtrage

### AC-5.3 GET /v1/apps sans scope read

**Given** un blob avec `scopes: {"my-app": ["scale"]}`
**When** la requete est `GET /v1/apps`
**Then** le proxy renvoie `403` (`scope_denied`) car `read` est requis pour lister les apps

---

## AC-6 — Ordre de verification

### AC-6.1 Verification sequentielle

**Given** une requete avec un blob > 4KB, un header manquant, un TTL expire, un scope app invalide et un scope action invalide
**When** le proxy traite la requete
**Then** le proxy renvoie `414` (premiere erreur dans l'ordre) et ne tente pas les verifications suivantes

### AC-6.2 TTL verifie avant les scopes

**Given** une requete valide (blob ok, cle ok) mais avec un TTL expire et un scope app invalide
**When** le proxy traite la requete
**Then** le proxy renvoie `410` (TTL) et pas `403` (scope)

### AC-6.3 Scope app verifie avant scope action

**Given** une requete valide avec un TTL ok, une app non autorisee et une action non autorisee
**When** le proxy traite la requete
**Then** le proxy renvoie `403` `app_not_allowed` et pas `scope_denied`

---

## AC-7 — Forward vers Scalingo et bearer cache

### AC-7.1 Exchange token et forward

**Given** une requete valide qui passe toutes les verifications, et pas de bearer en cache
**When** le proxy forward vers Scalingo
**Then** le proxy fait l'exchange (`tk-us-...` -> bearer), met le bearer en cache, et forward la requete avec `Authorization: Bearer <token>`

### AC-7.2 Bearer cache hit

**Given** une requete valide, et un bearer en cache pour le meme token Scalingo (cache non expire)
**When** le proxy forward vers Scalingo
**Then** le proxy utilise le bearer en cache sans refaire l'exchange

### AC-7.3 Bearer cache TTL

**Given** un bearer mis en cache il y a 56 minutes (TTL cache = 55 min)
**When** une requete arrive avec le meme token Scalingo
**Then** le proxy considere le cache expire, fait un nouvel exchange, et met a jour le cache

### AC-7.4 Singleflight — un seul exchange par token

**Given** 3 requetes simultanees avec le meme token Scalingo et le bearer en cache expire
**When** les 3 requetes tentent un exchange
**Then** un seul exchange HTTP est execute. Les 2 autres requetes attendent le resultat de la Promise partagee.

### AC-7.5 Singleflight — echec propage

**Given** 3 requetes simultanees, exchange en cours via singleflight
**When** l'exchange echoue (Scalingo down)
**Then** les 3 requetes recoivent l'erreur `502` (`upstream_error`)

### AC-7.6 Header X-FGP-Key non forwarde

**Given** une requete valide avec `X-FGP-Key: secret`
**When** le proxy forward vers Scalingo
**Then** le header `X-FGP-Key` n'est pas present dans la requete envoyee a Scalingo

### AC-7.7 Header Host remplace

**Given** une requete vers `fgp.example.com`
**When** le proxy forward vers Scalingo
**Then** le header `Host` est remplace par le host Scalingo (ex: `api.osc-fr1.scalingo.com`)

---

## AC-8 — Gestion des erreurs upstream

### AC-8.1 Token Scalingo revoque

**Given** une requete valide (blob ok, scopes ok)
**When** Scalingo renvoie `401` a l'exchange ou au forward (token revoque)
**Then** le proxy renvoie `502` avec `{"error": "upstream_auth_failed", "message": "Scalingo rejected the token"}`

### AC-8.2 Scalingo indisponible (5xx ou erreur reseau)

**Given** une requete valide
**When** Scalingo renvoie `500`, `503`, ou une erreur reseau (timeout, connection refused)
**Then** le proxy renvoie `502` avec `{"error": "upstream_error", "message": "Scalingo API is unavailable"}`

### AC-8.3 Rate limit Scalingo (429)

**Given** une requete valide
**When** Scalingo renvoie `429` avec un header `Retry-After: 30`
**Then** le proxy renvoie `429` avec `{"error": "rate_limited", "message": "Rate limit exceeded, retry later"}` et propage le header `Retry-After: 30`

### AC-8.4 Rate limit sans Retry-After

**Given** une requete valide
**When** Scalingo renvoie `429` sans header `Retry-After`
**Then** le proxy renvoie `429` avec `{"error": "rate_limited", "message": "Rate limit exceeded, retry later"}` sans header `Retry-After`

---

## AC-9 — Headers de reponse

### AC-9.1 Propagation des headers Scalingo

**Given** Scalingo repond avec des headers `Content-Type`, `X-Request-Id`, `X-Runtime`
**When** le proxy construit la reponse
**Then** tous ces headers sont propages au client

### AC-9.2 Filtrage de Set-Cookie

**Given** Scalingo repond avec un header `Set-Cookie`
**When** le proxy construit la reponse
**Then** le header `Set-Cookie` est supprime de la reponse

### AC-9.3 Ajout de X-FGP-App

**Given** une requete vers `/v1/apps/my-app/containers`
**When** le proxy construit la reponse
**Then** le header `X-FGP-App: my-app` est present dans la reponse

### AC-9.4 Ajout de X-FGP-Scope

**Given** un blob avec `scopes: {"my-app": ["read", "scale"]}`
**When** la requete cible `my-app` et le proxy construit la reponse
**Then** le header `X-FGP-Scope: read,scale` est present dans la reponse

### AC-9.5 Reponse non-JSON de Scalingo

**Given** Scalingo repond avec `Content-Type: text/html` et un body HTML (page de maintenance)
**When** le proxy construit la reponse
**Then** le proxy propage le body HTML et le `Content-Type: text/html` tels quels, sans wrapping JSON

---

## AC-10 — Endpoints internes

### AC-10.1 Health check

**Given** une requete `GET /healthz`
**When** le serveur est en fonctionnement
**Then** le serveur repond `200` avec `{"status": "ok"}`

### AC-10.2 Salt public

**Given** une requete `GET /api/salt`
**When** la variable d'environnement `FGP_SALT` est configuree
**Then** le serveur repond `200` avec `{"salt": "<valeur_du_salt>"}` (le salt est public)

### AC-10.3 UI de configuration

**Given** une requete `GET /`
**When** le serveur est en fonctionnement
**Then** le serveur repond `200` avec une page HTML contenant le formulaire de generation

### AC-10.4 Endpoints supprimes

**Given** une requete `POST /api/generate` ou `POST /api/list-apps`
**When** le client tente d'y acceder
**Then** le serveur repond `404` (ces endpoints n'existent pas)

---

## AC-11 — UI de configuration (client-side)

### AC-11.1 Chargement des apps via CORS

**Given** l'utilisateur a saisi un token Scalingo valide (`tk-us-...`)
**When** l'utilisateur clique "Charger"
**Then** le navigateur appelle directement l'API Scalingo (exchange + listing), sans passer par le serveur FGP, et affiche la liste des apps

### AC-11.2 Saisie manuelle des apps

**Given** l'utilisateur ne souhaite pas charger les apps automatiquement
**When** l'utilisateur saisit des noms d'apps manuellement
**Then** les noms saisis sont utilises pour construire le blob

### AC-11.3 Selection "Toutes les apps"

**Given** l'utilisateur coche "Toutes les apps (*)"
**When** le blob est genere
**Then** le blob contient `"*"` comme cle dans les scopes

### AC-11.4 Scope write — cochage automatique

**Given** l'utilisateur coche le scope `write` pour une app
**When** l'UI met a jour les checkboxes
**Then** `scale`, `deploy` et `vars:write` sont coches automatiquement

### AC-11.5 Affichage granulaire vars

**Given** l'utilisateur configure les scopes pour une app
**When** l'UI affiche les checkboxes de scopes
**Then** `vars:read` et `vars:write` sont affiches comme deux checkboxes separees (pas un seul `vars`)

### AC-11.6 Warning TTL zero

**Given** l'utilisateur selectionne "Pas d'expiration"
**When** l'option est selectionnee
**Then** un warning explicite est affiche pour signaler le risque de securite

### AC-11.7 Generation 100% client-side

**Given** l'utilisateur a configure les scopes, le TTL, et saisi son token
**When** l'utilisateur clique "Generer l'URL"
**Then** le client recupere le salt via `GET /api/salt`, genere une cle aleatoire, construit le JSON, chiffre via Web Crypto API (PBKDF2 + AES-256-GCM), encode en base64url, et construit l'URL. Le token Scalingo n'est jamais envoye au serveur FGP.

### AC-11.8 Affichage du resultat

**Given** la generation est terminee
**When** l'URL et la cle sont pretes
**Then** l'UI affiche l'URL complete et la cle client, avec des boutons "Copier l'URL" et "Copier la cle"

### AC-11.9 Refus si blob trop grand

**Given** le blob genere depasse 4096 caracteres en base64url
**When** l'utilisateur clique "Generer l'URL"
**Then** l'UI refuse la generation et affiche un message d'erreur

---

## AC-12 — Chiffrement / dechiffrement du blob

### AC-12.1 Round-trip chiffrement

**Given** un JSON blob valide, une cle client et un salt serveur
**When** le blob est chiffre (PBKDF2 + AES-256-GCM) puis dechiffre avec les memes parametres
**Then** le JSON obtenu est identique a l'original

### AC-12.2 Cle differente = echec

**Given** un blob chiffre avec la cle client A
**When** on tente de dechiffrer avec la cle client B
**Then** le dechiffrement echoue (tag d'authenticite invalide)

### AC-12.3 Salt different = echec

**Given** un blob chiffre avec le salt S1
**When** on tente de dechiffrer avec le salt S2
**Then** le dechiffrement echoue

### AC-12.4 IV unique

**Given** deux chiffrements du meme blob avec les memes cle et salt
**When** on compare les deux blobs chiffres
**Then** les blobs sont differents (IV aleatoire a chaque chiffrement)

### AC-12.5 Forme canonique dans le blob

**Given** l'utilisateur selectionne les scopes via l'UI
**When** le blob est genere
**Then** le blob ne contient que des scopes atomiques (`read`, `scale`, `deploy`, `logs`, `vars:read`, `vars:write`), jamais les alias `vars` ou `write`

---

## AC-13 — Securite transversale

### AC-13.1 Token Scalingo jamais expose

**Given** une requete proxy valide
**When** le proxy construit la reponse (succes ou erreur)
**Then** le token Scalingo (`tk-us-...`) n'apparait jamais dans le body, les headers, ni les logs stdout

### AC-13.2 Cle client jamais forwardee

**Given** une requete avec `X-FGP-Key`
**When** le proxy forward vers Scalingo
**Then** le header `X-FGP-Key` n'est pas transmis

### AC-13.3 Messages d'erreur generiques

**Given** une erreur FGP (401, 403, 410)
**When** le proxy construit la reponse d'erreur
**Then** le message ne contient aucun detail sur la configuration interne (pas de nom d'app attendu, pas de scopes configures, pas de TTL restant)

---

## AC-14 — Scopes meta (resolution write)

### AC-14.1 Write se resout en scale + deploy + vars:write

**Given** un blob avec `scopes: {"my-app": ["write"]}`
**When** les requetes suivantes sont envoyees :
- `POST /v1/apps/my-app/scale`
- `POST /v1/apps/my-app/restart`
- `POST /v1/apps/my-app/deployments`
- `PUT /v1/apps/my-app/variables`
**Then** toutes sont autorisees

### AC-14.2 Write n'inclut pas read

**Given** un blob avec `scopes: {"my-app": ["write"]}`
**When** la requete est `GET /v1/apps/my-app`
**Then** le proxy renvoie `403` (`scope_denied`)

### AC-14.3 Write n'inclut pas logs

**Given** un blob avec `scopes: {"my-app": ["write"]}`
**When** la requete est `GET /v1/apps/my-app/logs_url`
**Then** le proxy renvoie `403` (`scope_denied`)

### AC-14.4 Write n'inclut pas vars:read

**Given** un blob avec `scopes: {"my-app": ["write"]}`
**When** la requete est `GET /v1/apps/my-app/variables`
**Then** le proxy renvoie `403` (`scope_denied`)

---

## Remarques

- **Forme canonique** : le proxy ne doit jamais resoudre d'alias (`vars`, `write`). La resolution est faite a la generation du blob cote client. Si un blob contient `write` ou `vars`, le proxy les traite comme des chaines inconnues (pas de match dans la matrice = `scope_denied`). Toutefois, les AC-14.x documentent le comportement attendu pour des blobs generes par l'UI officielle, qui resout les alias avant chiffrement.

- **Deny-all** : tout endpoint/methode absent de la matrice section 3.3 des specs renvoie `403` `scope_denied`. Le proxy est une allowlist stricte.

- **Version du blob** : seul `v: 1` est supporte. Un blob avec un `v` different est traite comme un echec de dechiffrement (le format n'est pas reconnu).
