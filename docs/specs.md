# Spécifications fonctionnelles — Fine-Grained Proxy (FGP)

**Version** : 3.0
**Date** : 2026-04-09
**Statut** : Draft

---

## 1. Vue d'ensemble

Fine-Grained Proxy (FGP) est un proxy HTTP stateless et API-agnostique qui ajoute un contrôle d'accès granulaire devant n'importe quelle API cible. Le proxy permet de créer des URLs à usage limité : scopées par méthode HTTP, chemin et contenu du body, avec une durée de vie configurable et un mode d'authentification adaptable.

Le proxy ne stocke rien. Toute la configuration (token, cible, mode d'auth, scopes, body filters) est chiffrée directement dans l'URL, déchiffrable uniquement par la combinaison d'une clé client et d'un salt serveur.

### Historique des versions

| Version | Description |
|---------|-------------|
| v1 | Couplé à Scalingo : scopes nommés (read, scale, deploy...), ROUTE_TABLE hardcodée |
| v2 | Proxy agnostique : scopes METHOD:PATH génériques, 4 auth modes, target URL dans le blob (ADR 0003) |
| v3 | Body filters : scopes structurés ScopeEntry avec filtrage du body JSON (ADR 0004) |

---

## 2. User stories

### US-1 — Ops : donner un accès read-only à un prestataire

> En tant qu'ops, je veux générer une URL FGP qui donne accès en lecture seule à certains endpoints d'une API, afin de partager un accès limité avec un prestataire externe sans lui donner mon token.

**Critères d'acceptation** :
- L'URL générée ne permet que les requêtes GET sur les endpoints autorisés
- Toute tentative avec une autre méthode ou un autre path renvoie 403
- L'URL expire après le TTL configuré

### US-2 — Dev lead : permettre le scale sans accès au code (Scalingo)

> En tant que dev lead, je veux créer une URL FGP qui permet uniquement de scaler une app Scalingo, afin qu'un membre de l'équipe puisse gérer la charge sans accéder aux variables d'environnement ni déployer.

**Critères d'acceptation** :
- L'URL permet `POST /v1/apps/my-app/scale` et `GET /v1/apps/my-app/containers`
- L'accès aux variables d'environnement et aux déploiements est refusé (403)

### US-3 — CI/CD : token de déploiement scopé par branche

> En tant que responsable CI/CD, je veux un token qui ne peut que déployer une app précise sur les branches `main` et `release/*`, afin de limiter les dégâts si le secret du pipeline fuite.

**Critères d'acceptation** :
- L'URL ne fonctionne que pour `POST /v1/apps/my-app/deployments`
- Le body filter vérifie que `deployment.git_ref` vaut `main` ou matche `release/*`
- Toute autre branche est refusée (403)
- Le TTL peut être court (ex : 1h pour un run de pipeline)

### US-4 — Admin : accès large temporaire

> En tant qu'admin, je veux générer une URL FGP avec accès complet mais un TTL de 24h, afin de déléguer temporairement l'accès à un collègue.

**Critères d'acceptation** :
- L'URL utilise le scope `*:*` (toute méthode, tout path)
- Après le TTL, toute requête renvoie 410 Gone

### US-5 — Utilisateur : générer une URL via l'interface

> En tant qu'utilisateur FGP, je veux un formulaire web pour configurer et générer une URL FGP, afin de ne pas avoir à construire le blob chiffré manuellement.

**Critères d'acceptation** :
- Le formulaire permet de saisir le token, l'URL cible, le mode d'auth, les scopes (avec body filters optionnels) et le TTL
- L'URL et la clé client sont affichées à la génération
- Le token n'est jamais stocké côté serveur

### US-6 — API tierce : protéger un accès à une API non-Scalingo

> En tant que développeur, je veux utiliser FGP pour restreindre l'accès à une API tierce (ex : un service interne, une API REST quelconque) avec un bearer token, en limitant les endpoints accessibles.

**Critères d'acceptation** :
- L'URL cible peut être n'importe quelle API HTTP (pas seulement Scalingo)
- Le mode d'auth peut être `bearer`, `basic` ou `header:{nom}`
- Les scopes `METHOD:PATH` contrôlent finement les endpoints autorisés

### US-7 — CI/CD avancé : restreindre le contenu des requêtes

> En tant que responsable CI/CD, je veux restreindre non seulement la route mais aussi le contenu du body des requêtes, afin d'empêcher des modifications non autorisées même sur un endpoint autorisé.

**Critères d'acceptation** :
- Les body filters vérifient le contenu JSON du body des requêtes POST/PUT/PATCH
- Les types de filtres supportés sont : exact match, wildcard, string wildcard (glob), not (exclusion), and (composition)
- Les filtres sont en AND entre eux (tous doivent matcher), les valeurs d'un filtre sont en OR (au moins une doit matcher)

---

## 3. Scopes

### 3.1 Modèle de scopes

Les scopes définissent les requêtes autorisées. Deux formats coexistent :

#### Format string (v2+)

```
METHOD:PATH
```

| Composant | Description | Exemples |
|-----------|-------------|----------|
| `METHOD` | Méthode HTTP (ou `*` pour toutes). Multi-méthodes séparées par `\|`. | `GET`, `POST`, `GET\|POST`, `*` |
| `PATH` | Chemin d'API (ou `*` pour tous). Supporte le wildcard `*` en suffixe et en milieu. | `/v1/apps`, `/v1/apps/*`, `*` |

#### Format structuré ScopeEntry (v3)

```typescript
interface ScopeEntry {
  methods: string[];
  pattern: string;
  bodyFilters?: BodyFilter[];
}
```

Un ScopeEntry permet d'attacher des body filters à un scope. Sans `bodyFilters`, il se comporte comme un scope string.

#### Exemples de scopes

| Scope | Signification |
|-------|---------------|
| `GET:/v1/apps/*` | Lecture de toutes les ressources sous `/v1/apps/` |
| `POST:/v1/apps/my-app/scale` | Scale d'une app spécifique uniquement |
| `GET\|POST:/v1/apps/*` | Lecture et écriture sur les apps |
| `*:/v1/apps/*` | Toute méthode sur les apps |
| `*:*` | Accès total (wildcard complet) |
| `{ methods: ["POST"], pattern: "/deploy", bodyFilters: [...] }` | POST sur /deploy avec vérification du body |

### 3.2 Règles de résolution

- Les scopes sont **additifs** : plusieurs patterns peuvent être combinés (OR entre scopes).
- Le matching est case-insensitive sur la méthode (`get` == `GET`).
- Le wildcard `*` en path matche tout chemin commençant par le préfixe avant le `*`.
- **Deny-all par défaut** : toute requête qui ne matche aucun scope est refusée avec 403 (`scope_denied`). Le proxy est une allowlist.
- Un scope string sans `:` est interprété comme `*:{pattern}` (wildcard sur la méthode).

### 3.3 Algorithme de matching

Pour chaque requête entrante (méthode M, chemin P, body B optionnel) :

1. Pour chaque scope de la configuration :

   **Si string** :
   a. Parser le scope en `{methods[], pattern}`
   b. Vérifier que M est dans `methods` (ou que `methods` contient `*`)
   c. Vérifier que P matche `pattern`
   d. Si match → accès autorisé

   **Si ScopeEntry** :
   a. Vérifier que M est dans `entry.methods` (ou `*`)
   b. Vérifier que P matche `entry.pattern`
   c. Si pas de `bodyFilters` → accès autorisé
   d. Si `bodyFilters` présents : le body B doit être du JSON. Tous les body filters doivent matcher (AND). Si un filtre échoue → ce scope ne matche pas, passer au suivant.

2. Si au moins un scope matche → accès autorisé
3. Si aucun scope ne matche → 403 `scope_denied`

---

## 4. Body filters (v3)

### 4.1 Structure

```typescript
interface BodyFilter {
  objectPath: string;          // dot-path dans le body JSON
  objectValue: ObjectValue[];  // OR implicite entre les valeurs
}
```

- `objectPath` : chemin vers le champ dans le body JSON, notation dot-path (ex : `deployment.git_ref`, `app.name`).
- `objectValue` : liste de valeurs acceptées. Si au moins une matche, le filtre passe (OR).
- Plusieurs body filters sur un même scope sont en AND (tous doivent matcher).

### 4.2 Types ObjectValue

```typescript
type ObjectValue =
  | { type: "any"; value: JsonValue }
  | { type: "wildcard" }
  | { type: "stringwildcard"; value: string }
  | { type: "regex"; value: string }
  | { type: "and"; value: ObjectValue[] }
  | { type: "not"; value: ObjectValue };
```

| Type | Description | Exemple |
|------|-------------|---------|
| `any` | Match exact sur une valeur JSON (string, number, boolean, null, array, object) | `{ type: "any", value: "main" }` |
| `wildcard` | Le champ doit exister, valeur quelconque | `{ type: "wildcard" }` |
| `stringwildcard` | Glob pattern sur une valeur string (même algo que matchPath) | `{ type: "stringwildcard", value: "release/*" }` |
| `regex` | Match par expression régulière sur une valeur string | `{ type: "regex", value: "^release/\\d+\\.\\d+" }` |
| `and` | AND explicite : toutes les conditions doivent matcher | `{ type: "and", value: [ov1, ov2] }` |
| `not` | Exclusion : la condition NE doit PAS matcher | `{ type: "not", value: { type: "any", value: "develop" } }` |

### 4.3 Sémantique

- Un body filter sur un champ **absent** du body → le filtre échoue (le champ doit exister).
- Le body n'est parsé que si au moins un scope de la config a des body filters ET que la requête est POST, PUT ou PATCH.
- Si le body n'est pas du JSON valide alors que des body filters existent → 400 (`invalid_body`).
- Si la requête n'a pas le content-type `application/json` alors que des body filters existent → 403 (`scope_denied`).

### 4.4 Exemple

Blob v3 : autoriser le déploiement uniquement depuis `main` ou `release/*`, et uniquement depuis un repo GitHub de l'org `my-org` :

```json
{
  "v": 3,
  "token": "tk-us-...",
  "target": "https://api.osc-fr1.scalingo.com",
  "auth": "scalingo-exchange",
  "scopes": [
    "GET:/v1/apps/*",
    {
      "methods": ["POST"],
      "pattern": "/v1/apps/my-app/deployments",
      "bodyFilters": [
        {
          "objectPath": "deployment.git_ref",
          "objectValue": [
            { "type": "any", "value": "main" },
            { "type": "stringwildcard", "value": "release/*" }
          ]
        },
        {
          "objectPath": "deployment.source_url",
          "objectValue": [
            { "type": "stringwildcard", "value": "https://github.com/my-org/*" }
          ]
        }
      ]
    }
  ],
  "ttl": 3600,
  "createdAt": 1712534400
}
```

---

## 5. Limites fonctionnelles

Les body filters sont bornés pour éviter les dérives en performance, taille de blob et surface d'attaque. Toutes les limites sont validées au déchiffrement du blob. Un blob qui dépasse une limite est rejeté avec une erreur `malformed BlobConfig`. L'UI valide aussi ces limites à la création.

| Limite | Valeur | Justification |
|--------|--------|---------------|
| Profondeur `and`/`not` | 4 niveaux | Prévient les arbres de matching exponentiels (DoS par blob crafté) |
| Body filters par scope | 8 max | Au-delà, scinder en plusieurs scopes |
| Valeurs OR par filtre | 16 max | Utiliser `stringwildcard` plutôt que lister 50 alternatives |
| ScopeEntry structurés par blob | 10 max | Les scopes string simples sont illimités (légers en matching) |
| Segments dot-path | 6 max | Les APIs REST ont rarement des bodies imbriqués à plus de 5 niveaux |
| Taille blob | 4096 chars base64url | Sweet spot entre capacité et compat reverse proxies (URI max ~8KB) |

### Combinaisons interdites

| Combinaison | Raison |
|-------------|--------|
| `not(wildcard)` | Ne matche rien → bug de config |
| `not(not(...))` | Double négation = obfuscation, écrire la condition directement |
| `and([])` | Vacuous truth → wildcard implicite trompeur |
| `and` à 1 élément | Équivalent à la condition seule, écrire directement |

---

## 6. Format du blob chiffré

### 6.1 Structure JSON (avant chiffrement)

**Blob v2** (scopes string uniquement) :

```json
{
  "v": 2,
  "token": "tk-us-xxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "target": "https://api.osc-fr1.scalingo.com",
  "auth": "scalingo-exchange",
  "scopes": [
    "GET:/v1/apps/*",
    "POST:/v1/apps/my-app/scale"
  ],
  "createdAt": 1712534400,
  "ttl": 86400
}
```

**Blob v3** (scopes mixtes string + ScopeEntry) :

```json
{
  "v": 3,
  "token": "tk-us-xxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "target": "https://api.osc-fr1.scalingo.com",
  "auth": "scalingo-exchange",
  "scopes": [
    "GET:/v1/apps/*",
    {
      "methods": ["POST"],
      "pattern": "/v1/apps/my-app/deployments",
      "bodyFilters": [
        {
          "objectPath": "deployment.git_ref",
          "objectValue": [{ "type": "any", "value": "main" }]
        }
      ]
    }
  ],
  "createdAt": 1712534400,
  "ttl": 86400
}
```

| Champ | Type | Description |
|-------|------|-------------|
| `v` | `number` | Version du format (`2` ou `3`) |
| `token` | `string` | Token ou secret pour l'API cible |
| `target` | `string` | URL de base de l'API cible |
| `auth` | `string` | Mode d'authentification (voir section 10.1) |
| `scopes` | `Array<string \| ScopeEntry>` | Scopes string et/ou structurés |
| `createdAt` | `number` | Timestamp Unix (secondes) de création du blob |
| `ttl` | `number` | Durée de validité en secondes depuis `createdAt`. `0` = pas d'expiration. |

La version est déterminée automatiquement : si au moins un scope est un ScopeEntry → v3, sinon v2.

Le token est considéré expiré quand `Date.now() / 1000 > createdAt + ttl` (sauf si `ttl === 0`).

### 6.2 Processus de chiffrement

1. Sérialiser le JSON en UTF-8
2. Compresser avec gzip
3. Dériver la clé de chiffrement : `PBKDF2(client_key + server_salt, 100_000 iterations, SHA-256)` → clé AES-256
4. Générer un IV aléatoire de 12 bytes
5. Chiffrer avec AES-256-GCM → ciphertext + auth tag (16 bytes)
6. Encoder en base64url : `base64url(iv || ciphertext || tag)`

### 6.3 Processus de déchiffrement

1. Décoder le base64url
2. Extraire IV (12 premiers bytes), ciphertext + tag (le reste)
3. Dériver la même clé avec PBKDF2(client_key + server_salt)
4. Déchiffrer AES-256-GCM et vérifier le tag d'authenticité
5. Décompresser gzip
6. Parser le JSON
7. Valider la structure :
   - `v` doit être `2` ou `3`
   - `token`, `target`, `auth` non vides
   - `scopes` est un tableau
   - Si v2 : tous les scopes sont des strings
   - Si v3 : chaque scope est soit un string, soit un ScopeEntry valide (limites vérifiées)

---

## 7. Format de l'URL

### 7.1 Structure

```
https://fgp.example.com/{blob}/v1/apps/my-app/containers
                         ^^^^  ^^^^^^^^^^^^^^^^^^^^^^^^
                         |     Chemin de l'API cible (forwarded tel quel)
                         |
                         Blob chiffré en base64url
```

Le proxy extrait le premier segment du path comme blob, et forward le reste vers l'API cible définie par `config.target`.

**Limite de taille** : le blob base64url ne doit pas dépasser **4 KB** (4096 caractères). Au-delà, l'UI refuse la génération et le proxy renvoie 414 URI Too Long.

### 7.2 Exemples

```
# API Scalingo via scalingo-exchange
GET https://fgp.example.com/eyJhbGci.../v1/apps
Header: X-FGP-Key: ma-cle-secrete

# API tierce via bearer
GET https://fgp.example.com/eyJhbGci.../api/v2/resources
Header: X-FGP-Key: ma-cle-secrete

# API avec header custom
GET https://fgp.example.com/eyJhbGci.../data/query
Header: X-FGP-Key: ma-cle-secrete
```

### 7.3 Header requis

| Header | Requis | Description |
|--------|--------|-------------|
| `X-FGP-Key` | Oui | Clé client pour déchiffrer le blob. Sans elle, le blob est inexploitable. |

---

## 8. Comportement des erreurs

Le proxy renvoie des erreurs HTTP standardisées. Les messages d'erreur sont volontairement génériques pour ne pas leaker d'information sur la configuration interne.

| Code | Condition | Corps JSON |
|------|-----------|------------|
| **400 Bad Request** | Body JSON invalide (quand body filters requis) | `{"error": "invalid_body", "message": "Request body is not valid JSON"}` |
| **400 Bad Request** | Mode d'auth non supporté | `{"error": "invalid_auth_mode", "message": "Unsupported auth mode: ..."}` |
| **400 Bad Request** | Path proxy invalide (moins de 2 segments) | `{"error": "invalid_request", "message": "Invalid proxy path"}` |
| **401 Unauthorized** | Header `X-FGP-Key` manquant | `{"error": "missing_key", "message": "X-FGP-Key header is required"}` |
| **401 Unauthorized** | Déchiffrement échoué (clé invalide ou blob corrompu) | `{"error": "invalid_credentials", "message": "Unable to decrypt token"}` |
| **403 Forbidden** | La méthode/path/body ne matchent aucun scope | `{"error": "scope_denied", "message": "Insufficient permissions for this action"}` |
| **403 Forbidden** | Body filters requis mais content-type non JSON | `{"error": "scope_denied", "message": "Body filters require application/json content type"}` |
| **410 Gone** | Le TTL du blob est expiré | `{"error": "token_expired", "message": "This token has expired"}` |
| **414 URI Too Long** | Blob base64url > 4 KB | `{"error": "blob_too_large", "message": "Encrypted blob exceeds maximum size"}` |
| **502 Bad Gateway** | Erreur réseau ou HTTP 5xx de l'API cible | `{"error": "upstream_error", "message": "Target API is unavailable"}` |
| **502 Bad Gateway** | Token rejeté par l'API cible (401 upstream) | `{"error": "upstream_auth_failed", "message": "Target API rejected the token"}` |
| **429 Too Many Requests** | Rate limit de l'API cible atteint (429 upstream) | `{"error": "rate_limited", "message": "Rate limit exceeded, retry later"}` |

### Ordre de vérification

Le proxy vérifie dans cet ordre, et renvoie la première erreur rencontrée :

1. Validité du path (segments) → 400
2. Taille du blob → 414
3. Présence du header `X-FGP-Key` → 401 (missing_key)
4. Déchiffrement du blob → 401 (invalid_credentials)
5. Validité du mode d'auth → 400 (invalid_auth_mode)
6. Vérification du TTL → 410 (token_expired)
7. Parsing du body (si body filters requis) → 400 (invalid_body) ou 403 (content-type)
8. Vérification du scope (méthode + path + body) → 403 (scope_denied)
9. Forward vers l'API cible → 502/429 selon la réponse

---

## 9. Rate limiting

### 9.1 Stratégie FGP

FGP ne fait pas de rate limiting propre. La stratégie est transparente :

1. **Forward transparent** : les requêtes sont transmises à l'API cible telles quelles.
2. **Propagation du 429** : si l'API cible répond 429, FGP renvoie 429 au client avec le header `Retry-After` si présent.
3. **Pas de quota par URL** : FGP ne tente pas de répartir le budget entre les différentes URLs.

### 9.2 Optimisation : cache du bearer (Scalingo)

Pour le mode `scalingo-exchange`, l'exchange token → bearer compte dans le rate limit Scalingo (60 req/min). FGP met en cache le bearer en mémoire :

- Le bearer est stocké **en clair en mémoire** (le process est isolé, pas de persistence disque).
- Clé du cache : `SHA-256(token_scalingo)`
- TTL du cache : 55 minutes (le bearer Scalingo expire à 1h, marge de 5 minutes)
- **Concurrence (singleflight)** : si plusieurs requêtes arrivent en parallèle avec le même token et que le bearer a expiré, un seul exchange est exécuté. Les autres requêtes attendent le résultat via une `Promise` partagée. Si l'exchange échoue, toutes les requêtes en attente reçoivent l'erreur.

---

## 10. Endpoints internes du proxy

| Endpoint | Méthode | Description |
|----------|---------|-------------|
| `/` | GET | UI de configuration (formulaire de génération) |
| `/healthz` | GET | Health check (`{"status": "ok"}`) |
| `/api/salt` | GET | Retourne le salt serveur (`{"salt": "..."}`) |
| `/api/generate` | POST | Génération d'URL FGP (chiffrement serveur) |
| `/api/list-apps` | POST | Helper Scalingo : listing des apps via token exchange |
| `/api/openapi.json` | GET | Spec OpenAPI 3.0 (auto-générée depuis les schemas Zod) |
| `/api/docs` | GET | Swagger UI (documentation interactive) |
| `/{blob}/{path...}` | * | Proxy principal vers l'API cible |

Tout autre path sous `/api/*` renvoie 404 (`{"error": "not_found", "message": "Endpoint not found"}`).

---

## 11. Comportement du proxy (forward)

### 11.1 Modes d'authentification

Le proxy supporte quatre modes d'authentification, configurés dans le champ `auth` du blob :

| Mode | Comportement |
|------|-------------|
| `bearer` | Envoie `Authorization: Bearer {token}` directement |
| `basic` | Envoie `Authorization: Basic {base64(":"+token)}` |
| `scalingo-exchange` | Échange le token Scalingo via `POST {SCALINGO_AUTH_URL}/v1/tokens/exchange`, puis envoie `Authorization: Bearer {bearer}` |
| `header:{name}` | Envoie `{name}: {token}` (ex : `header:X-API-Key` envoie `X-API-Key: {token}`) |

### 11.2 Headers de requête

Le proxy forward tous les headers du client vers la cible, sauf :
- `X-FGP-Key` (consommé par le proxy, jamais transmis à la cible)
- `Host` (supprimé pour laisser le runtime résoudre le bon host)

Le header `Authorization` (ou le header custom) est défini selon le mode d'auth.

### 11.3 Headers de réponse

Le proxy propage tous les headers de la réponse de l'API cible, sauf :
- `Set-Cookie` (filtré, le proxy est stateless et ne doit pas propager de cookies)

### 11.4 Réponses non-JSON

Si l'API cible renvoie une réponse non-JSON (page de maintenance HTML, erreur texte), le proxy la propage telle quelle avec le `Content-Type` original. Les erreurs FGP elles-mêmes (400, 401, 403, 410, 414, 429, 502) sont toujours en JSON.

### 11.5 Body forwarding

Pour les requêtes POST, PUT, PATCH, le body est forwardé tel quel vers l'API cible. Si des body filters sont configurés, le body est parsé en JSON pour la vérification d'accès mais la requête originale (body brut) est forwarded.

Les requêtes GET et HEAD ne transmettent pas de body.

---

## 12. UI de configuration

### 12.1 Accès

L'interface de configuration est servie à la racine du proxy :

```
GET https://fgp.example.com/
```

C'est une page HTML (Hono JSX + Tailwind CSS build-time), pas de framework frontend.

### 12.2 Layout

L'UI utilise un layout split responsive :
- **Colonne gauche (3/5)** : formulaire de configuration
- **Colonne droite (2/5)** : guide d'utilisation, syntaxe des scopes, exemples curl

Sur mobile, les deux colonnes s'empilent verticalement.

### 12.3 Flow utilisateur

1. **Preset** (optionnel) : des boutons de preset pré-remplissent la configuration pour des cas d'usage courants. Le preset "Scalingo" configure la cible, le mode d'auth et des scopes par défaut.

2. **Saisie du token** : l'utilisateur entre le token ou secret de l'API cible.

3. **URL cible** : l'URL de base de l'API que le proxy doit atteindre.

4. **Mode d'authentification** : comment le proxy doit s'authentifier auprès de l'API cible (bearer, basic, scalingo-exchange, header custom).

5. **Scopes** : patterns `METHOD:PATH` (un par ligne) dans un textarea. Pour le mode `scalingo-exchange`, un helper permet de charger la liste des apps Scalingo.

6. **Body filters** (optionnel) : pour les scopes POST/PUT/PATCH, un panel permet d'ajouter des body filters. Chaque filtre est configuré avec :
   - Le scope cible (sélectionné parmi les scopes éligibles)
   - Le dot-path du champ dans le body
   - Le type de filtre (exact, wildcard, string wildcard, not, and)
   - Les valeurs acceptées

7. **TTL** : choix de la durée de validité. Presets : 1h, 24h, 7j, 30j, personnalisé, pas d'expiration. Un warning est affiché quand "pas d'expiration" est sélectionné.

8. **Génération** (côté serveur, cf. ADR 0002) : `POST /api/generate` chiffre le blob et retourne `{url, key}`.

### 12.4 Body filters dans l'UI

Le panel body filters apparaît quand au moins un scope éligible (POST, PUT, PATCH) est défini. Les scopes sont affichés en accordéon, et chaque scope peut avoir ses propres filtres.

Types de filtres disponibles dans l'UI :
- **Valeur exacte** : match exact sur une valeur (texte, nombre, booléen)
- **Existe** : le champ doit exister (wildcard)
- **Pattern glob** : glob sur une string (stringwildcard)
- **Expression régulière** : regex sur une string (regex)
- **Pas** : exclusion d'une valeur (not)
- **ET** : composition de conditions (and)

Pour `not` et `and`, l'UI propose des sous-types (exact, glob, existe) pour composer les conditions.

### 12.5 Sécurité de l'UI

- Le token est envoyé au serveur FGP via POST HTTPS pour le chiffrement. Le serveur ne stocke jamais le token.
- La clé client est générée côté serveur et retournée au client. Elle n'est jamais stockée.
- Le salt serveur est public (nécessaire pour dériver la clé, mais inutile sans la clé client).
- L'UI affiche un warning quand `ttl: 0` est sélectionné.
- L'UI refuse la génération si le blob dépasse 4 KB.
- L'UI valide les limites structurelles des body filters avant la génération.

---

## 13. Limites et non-goals (v3)

- **Pas de révocation** : une URL FGP ne peut pas être révoquée avant son TTL. La seule solution est de révoquer le token sous-jacent.
- **Pas de logging centralisé** : les requêtes passent par le proxy mais ne sont pas logguées dans un système externe. Seul le stdout du serveur est disponible.
- **Pas de rate limiting propre** : pas de quotas par URL, seulement la propagation du 429 upstream.
- **Pas de WebSocket** : seules les requêtes HTTP classiques sont proxyfiées.
- **Cache bearer uniquement pour Scalingo** : le cache du bearer (singleflight) est spécifique au mode `scalingo-exchange`. Les autres modes ne cachent rien.
- **Body filters JSON uniquement** : seul le JSON est supporté pour le filtrage du body. Les form-data, multipart, etc. ne sont pas filtrés.
- **Body filter `regex`** : le type `regex` est implémenté via `new RegExp(value).test(bodyValue)`. La regex est validée au déchiffrement du blob (regex invalide = blob rejeté).
