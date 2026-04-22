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
- Le wildcard `*` en path matche tout chemin commençant par le préfixe avant le `*`. Le wildcard doit matcher **au moins un caractère**. Par exemple, `GET:/v1/apps/*` ne matche PAS `/v1/apps/` (trailing slash sans rien après), mais matche `/v1/apps/a`.
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

FGP distingue strictement deux sources d'erreurs : celles produites par le proxy lui-même (validation, décryptage, scopes, TTL, réseau upstream injoignable) et celles produites par l'API cible (status HTTP renvoyés par l'upstream). Cette distinction est matérialisée par le header de réponse **`X-FGP-Source`** :

| Valeur | Signification |
|--------|---------------|
| `proxy` | La réponse a été générée par FGP (erreur de validation, de scope, ou upstream injoignable). Le body suit la shape FGP `{error, message}`. |
| `upstream` | La réponse provient de l'API cible et est forwardée telle quelle (status, body, headers). FGP n'a rien transformé. |

Tous les clients doivent utiliser ce header pour savoir à qui attribuer une erreur (FGP vs API cible) et décider de la stratégie de retry / remédiation.

### 8.1 Forward transparent des réponses upstream

**Règle** : toute réponse HTTP effectivement reçue de l'API cible (peu importe le status : 2xx, 3xx, 4xx, 5xx) est forwardée **transparente** au client, sans aucune transformation du status ni du body.

- Status HTTP : préservé tel quel (y compris 401, 403, 404, 429, 500, 502, 503, 504 upstream).
- Body : forwardé inchangé (stream), avec le `Content-Type` original.
- Headers : propagés tels quels, sauf `Set-Cookie` qui reste filtré (le proxy est stateless — entorse acceptée à la transparence pure, cf. section 11.3).
- Header ajouté : `X-FGP-Source: upstream`.

En particulier :
- Un 401 upstream (token invalide côté API cible) n'est plus transformé en 502 `upstream_auth_failed`. Il reste un 401 avec le body d'origine de l'API cible et `X-FGP-Source: upstream`. C'est au client d'interpréter ce 401 : son token upstream est invalide, pas un problème de proxy.
- Un 429 upstream n'est plus réécrit en body FGP `rate_limited`. Il reste un 429 avec le body d'origine de l'API cible et ses headers (`Retry-After` inclus) et `X-FGP-Source: upstream`.
- Un 5xx upstream n'est plus transformé en 502 `upstream_error`. Il reste le status original de l'upstream avec son body et `X-FGP-Source: upstream`.

### 8.2 Erreurs FGP

Les erreurs produites par le proxy (avant ou pendant le forward) suivent la shape JSON `{error, message}` et portent systématiquement le header `X-FGP-Source: proxy`.

Les messages des erreurs FGP (`X-FGP-Source: proxy`) sont **volontairement génériques** pour ne pas leaker d'information sur la configuration interne (pas de détail sur quel scope a échoué, pas de dump du blob, pas d'exception stack). Cette contrainte ne s'applique **qu'aux réponses `X-FGP-Source: proxy`** : les réponses `X-FGP-Source: upstream` sont forwardées telles quelles et peuvent contenir n'importe quel message produit par l'API cible — c'est le contrat de transparence (section 8.1), pas une fuite côté FGP.

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
| **500 Internal Server Error** | Exception non catchée dans le proxy (bug FGP) | `{"error": "internal_error", "message": "Internal proxy error"}` |
| **502 Bad Gateway** | L'API cible est injoignable (fetch throw : DNS, timeout, connexion refusée, TLS) | `{"error": "upstream_unreachable", "message": "Target API is unreachable"}` |

Le 502 `upstream_unreachable` est la **seule 502 légitime côté proxy** : elle n'est renvoyée que quand aucune réponse HTTP n'a pu être obtenue de l'upstream. Dès qu'une réponse upstream existe (même un 502/503/504 upstream), elle est forwardée telle quelle avec `X-FGP-Source: upstream`.

Le 500 `internal_error` est renvoyé par un handler global (`app.onError`) qui catche toute exception non prévue dans le pipeline FGP. Il conserve la même shape `{error, message}` et le header `X-FGP-Source: proxy`.

### 8.3 Harmonisation des endpoints internes

Les endpoints internes du proxy qui tapent eux-mêmes des APIs externes (ex : `POST /api/list-apps` qui appelle Scalingo pour l'UI) ne sont **pas des proxies transparents** : ils consomment l'upstream pour servir leur propre contrat (shape JSON stable attendue par l'UI). Ils utilisent donc un modèle hybride :

- Échec réseau (fetch throw) → 502 `upstream_unreachable` + `X-FGP-Source: proxy`.
- Échec d'exchange token (pour `list-apps`) → 401 `token_exchange_failed` + `X-FGP-Source: proxy`.
- Réponse upstream non-OK (status non-2xx reçu de l'upstream) → 502 avec shape FGP dédiée à l'endpoint (ex : `upstream_list_apps_failed` avec le status upstream reporté dans `message` pour le debug) + `X-FGP-Source: proxy`.

Tous les résultats de ces endpoints portent `X-FGP-Source: proxy` (que ce soit 2xx ou erreur), puisque le contrat de réponse est défini par FGP et non par l'upstream.

### 8.4 Ordre de vérification

Le proxy vérifie dans cet ordre, et renvoie la première erreur rencontrée :

1. Validité du path (segments) → 400 `invalid_request` (`X-FGP-Source: proxy`)
2. Taille du blob → 414 `blob_too_large` (`X-FGP-Source: proxy`)
3. Présence du header `X-FGP-Key` → 401 `missing_key` (`X-FGP-Source: proxy`)
4. Déchiffrement du blob → 401 `invalid_credentials` (`X-FGP-Source: proxy`)
5. Validité du mode d'auth → 400 `invalid_auth_mode` (`X-FGP-Source: proxy`)
6. Vérification du TTL → 410 `token_expired` (`X-FGP-Source: proxy`)
7. Parsing du body (si body filters requis) → 400 `invalid_body` ou 403 `scope_denied` (`X-FGP-Source: proxy`)
8. Vérification du scope (méthode + path + body) → 403 `scope_denied` (`X-FGP-Source: proxy`)
9. Forward vers l'API cible :
   - Si `fetch` throw (réseau) → 502 `upstream_unreachable` (`X-FGP-Source: proxy`)
   - Sinon → status/body/headers upstream forwardés transparents (`X-FGP-Source: upstream`)
10. Exception inattendue à n'importe quelle étape → 500 `internal_error` via `app.onError` (`X-FGP-Source: proxy`)

---

## 9. Rate limiting

### 9.1 Stratégie FGP

FGP ne fait pas de rate limiting propre. La stratégie est transparente :

1. **Forward transparent** : les requêtes sont transmises à l'API cible telles quelles.
2. **Propagation du 429** : si l'API cible répond 429, FGP forwarde le 429 avec son body et ses headers d'origine (`Retry-After` inclus) et ajoute `X-FGP-Source: upstream` (cf. section 8.1).
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
| `/api/test-scope` | POST | Test de scopes : vérifie si une requête (méthode + path + body) est autorisée par un jeu de scopes |
| `/api/openapi.json` | GET | Spec OpenAPI 3.0 (auto-générée depuis les schemas Zod) |
| `/api/docs` | GET | Swagger UI (documentation interactive) |
| `/logs` | GET | UI de consultation des logs par blob (feature `/logs`, cf. §14) |
| `/logs/health` | GET | Indique si la feature logs est activée côté serveur (`{"enabled": true\|false}`). Toujours 200, même avec `FGP_LOGS_ENABLED=0`. |
| `/logs/stream` | GET | Stream SSE des events d'un blob (headers `X-FGP-Blob` + `X-FGP-Key` requis, cf. §14.9) |
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
- `Set-Cookie` (filtré, le proxy est stateless et ne doit pas propager de cookies). C'est la seule entorse à la transparence stricte, acceptée pour préserver la nature stateless du proxy.

Le proxy ajoute systématiquement le header `X-FGP-Source` sur toutes ses réponses :
- `X-FGP-Source: upstream` sur les réponses forwardées depuis l'API cible.
- `X-FGP-Source: proxy` sur les réponses générées par FGP (erreurs de validation, de scope, TTL, `upstream_unreachable`, `internal_error`).

### 11.4 Réponses non-JSON

Si l'API cible renvoie une réponse non-JSON (page de maintenance HTML, erreur texte), le proxy la forwarde telle quelle avec le `Content-Type` original et `X-FGP-Source: upstream`. Les erreurs FGP (400, 401, 403, 410, 414, 500, 502 `upstream_unreachable`) sont toujours en JSON avec `X-FGP-Source: proxy`.

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

### 12.5 Test de scopes (UI)

L'UI propose une section dépliable "Tester un scope" sous les body filters. Elle permet de vérifier en temps réel si une requête (méthode + path + body optionnel) est autorisée par les scopes configurés.

#### Fonctionnement

1. **Highlight temps réel** : à mesure que l'utilisateur tape un path et sélectionne une méthode, les scopes matchant sont mis en surbrillance visuellement (indicateurs ✓/✗ par scope).
2. **Run** : un bouton "Tester" envoie la requête de test à l'API `POST /api/test-scope` pour un résultat détaillé incluant les body filters.
3. **Body JSON** : un textarea JSON optionnel (affiché pour POST/PUT/PATCH) permet de tester les body filters.

#### API `POST /api/test-scope`

**Input** :

```json
{
  "method": "string",
  "path": "string",
  "scopes": "Scope[]",
  "body": "unknown (optionnel)"
}
```

**Output** :

```json
{
  "allowed": "boolean",
  "results": [
    {
      "index": "number",
      "scope": "Scope",
      "matched": "boolean",
      "methodMatch": "boolean",
      "pathMatch": "boolean",
      "bodyMatch": "boolean | null"
    }
  ]
}
```

#### Labels UI (copy)

| Élément | Texte |
|---------|-------|
| Titre section | "Tester un scope" |
| Label méthode | "Méthode" |
| Label path | "Chemin de test" |
| Placeholder path | `/v1/apps/my-app` |
| Label body | "Body JSON (optionnel)" |
| Bouton | "Tester" |
| Résultat autorisé | "Accès autorisé" (vert) |
| Résultat refusé | "Accès refusé" (rouge) |

### 12.6 Sécurité de l'UI

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

---

## 14. Logs par blob (feature `/logs`)

### 14.1 Vue d'ensemble

La feature `/logs` permet à un opérateur de consulter les requêtes passées par un blob FGP donné, en stream live et avec un court historique. C'est une feature **UI uniquement** : il n'existe aucun endpoint JSON public équivalent, et aucune entrée de log n'est jamais persistée.

**Principes** :
- **Zero storage strict** : les logs vivent exclusivement en mémoire, dans l'isolate qui a capturé la requête. Pas de DB, pas de fichier, pas de bus externe.
- **Opt-in** : aucune capture n'a lieu tant que le blob ne l'autorise pas explicitement et que le kill switch global n'est pas activé.
- **Scoping strict par blob** : les logs sont isolés par blob via un hash SHA-256 tronqué. Un opérateur ne peut voir que les logs du blob dont il possède la clé client.
- **Zero-trust serveur pour le body** : quand le mode `detailed` est activé, le body request est chiffré côté client avant d'être stocké en mémoire. Le serveur FGP ne peut pas lire le contenu en clair, même en dump mémoire.
- **Agnostique infra** : pas de dépendance à une feature PaaS spécifique. La visibilité est limitée à l'isolate qui a capturé la requête (per-isolate), ce qui est une conséquence assumée du choix zero storage.

### 14.2 Scope et non-goals

**Inclus** :
- Page UI `/logs` avec formulaire d'auth (blob + clé client) et vue stream live.
- Onglet « Logs » dans la page de configuration d'un blob pour activer/désactiver la capture.
- Deux niveaux de capture : `network` (toujours actif quand logs opt-in) et `detailed` (opt-in supplémentaire, body request chiffré).
- Ring buffer court par blob + purge sur inactivité.
- Stream SSE avec heartbeat et cursor de reconnect.

**Non-goals v1** :
- Pas d'équivalent API JSON exposé (pas de `/api/logs/*` public).
- Pas de capture des headers de requête (risque de fuite cookies/tokens).
- Pas de capture du body de réponse de l'upstream (hors scope, coût mémoire prohibitif).
- Pas de capture du `target` upstream dans les entries (sensible, structure API interne).
- Pas d'export, pas de recherche plein texte, pas de filtres avancés.
- Pas de rate limit par IP (IP spoofable) : la protection se fait via « 1 stream max par blob ».

### 14.3 Feature gating

La capture s'active uniquement si **les trois conditions** sont réunies :

1. **Kill switch global serveur** : la variable d'environnement `FGP_LOGS_ENABLED` vaut `1`. Si absente ou égale à `0`, aucune route `/logs*` n'existe (elles renvoient 404), aucune capture n'a lieu, aucun buffer n'est alloué.
2. **Flag `logs.enabled` dans le blob** : le blob contient `logs: { enabled: true, ... }`.
3. **Pour `detailed`** : le blob contient en plus `logs: { enabled: true, detailed: true }`.

Tableau de vérité de la capture :

| `FGP_LOGS_ENABLED` | `blob.logs.enabled` | `blob.logs.detailed` | Network capturé | Detailed capturé |
|--------------------|---------------------|----------------------|-----------------|------------------|
| `0` ou absent      | *                   | *                    | Non             | Non              |
| `1`                | `false` ou absent   | *                    | Non             | Non              |
| `1`                | `true`              | `false` ou absent    | Oui             | Non              |
| `1`                | `true`              | `true`               | Oui             | Oui              |

### 14.4 Schéma blob — ajout du champ `logs`

Ajout d'un champ optionnel `logs` au `BlobConfig`, **sans bump de version** (v3 reste v3) :

```typescript
interface BlobConfig {
  v: 2 | 3;
  token: string;
  target: string;
  auth: string;
  scopes: Scope[];
  ttl: number;
  createdAt: number;
  name?: string;
  logs?: {
    enabled: boolean;
    detailed: boolean;
  };
}
```

Le champ `name` (optionnel, introduit antérieurement avec le champ « Nom de la configuration » de l'UI) est lu côté client dans la vue stream `/logs` pour afficher un identifiant humain au lieu du seul `blobId` (cf. §14.10).

**Règles de compatibilité** :

- Le champ est **strictement optionnel** : un blob v2 ou v3 existant sans `logs` reste valide et continue de fonctionner à l'identique.
- Un blob avec `logs` absent ou `logs.enabled !== true` est traité comme « logs désactivés », pas comme un blob malformé.
- Les anciennes versions du proxy qui ne connaissent pas ce champ l'ignorent gracieusement (Deno `JSON.parse` ne plante pas sur un champ supplémentaire, et la validation `decryptBlob` actuelle ne rejette pas les champs extra).
- Aucun bump de version de blob : v3 reste v3. Le champ `logs` est un **additif non-cassant** décorrélé du versioning du format.
- À la génération d'un blob depuis l'UI, le champ `logs` n'est inclus que si l'utilisateur a explicitement coché une case dans l'onglet « Logs ». Sinon il est omis (blob identique à aujourd'hui).

### 14.5 Identification serveur d'un blob

Le serveur a besoin de scoper les buffers et les streams par blob, sans être capable de reconstruire le blob ou son contenu. Clé utilisée :

```
blobId = SHA-256(blob_base64url).slice(0, 16)   // 16 chars hex = 64 bits
```

Cette empreinte est calculée à partir du blob chiffré brut (le ciphertext base64url), pas du contenu déchiffré. Elle est non réversible et identique entre deux requêtes portant le même blob — suffisant pour router un ring buffer et un topic pub/sub, insuffisant pour retrouver la clé client ou le contenu.

### 14.6 Types de logs et contenu

Le schéma des events est discriminé par le champ `type`.

**Event `network`** — capturé pour chaque requête proxy quand `logs.enabled` :

```json
{
  "type": "network",
  "ts": 1713787200123,
  "method": "GET",
  "path": "/v1/apps/my-app/containers",
  "status": 200,
  "durationMs": 142,
  "ipPrefix": "203.0.113.0/24"
}
```

| Champ | Description |
|-------|-------------|
| `ts` | Timestamp Unix en millisecondes (temps serveur au moment du capture) |
| `method` | Méthode HTTP de la requête entrante |
| `path` | Path entrant, normalisé (sans le segment blob en mode URL) |
| `status` | Status HTTP renvoyé au client (peut être FGP ou upstream) |
| `durationMs` | Durée totale du traitement proxy, depuis l'entrée jusqu'à l'envoi de la réponse |
| `ipPrefix` | IP client tronquée au /24 (IPv4) ou /48 (IPv6). Respect vie privée + infos debug. |

Le `target` upstream n'est **pas** inclus dans les entries network.

**Event `detailed`** — capturé en plus du network, uniquement si `logs.detailed` et content-type JSON non-multipart :

```json
{
  "type": "detailed",
  "ts": 1713787200123,
  "method": "POST",
  "path": "/v1/apps/my-app/deployments",
  "bodyEncrypted": "AES-GCM ciphertext base64url",
  "truncated": false
}
```

| Champ | Description |
|-------|-------------|
| `bodyEncrypted` | Body request chiffré AES-256-GCM avec la clé client dérivée (cf. 14.8). Stocké gzippé avant chiffrement. **Absent du JSON** (pas de chaîne vide) si `truncated: true`. |
| `truncated` | `true` si le body gzippé dépasse `FGP_LOGS_DETAILED_MAX_KB` — le body est alors **entièrement omis** (pas de troncature partielle, qui fausserait un déchiffrement), le champ `bodyEncrypted` est omis et seul le flag `truncated: true` subsiste. |

Les events `network` et `detailed` partagent le même `ts` quand les deux sont émis pour la même requête. Le client UI les corrèle par timestamp.

### 14.7 Ring buffer et purge

**Ring buffer par blob** :

- Deux ring buffers indépendants par blob : un pour `network` (défaut 50 entries), un pour `detailed` (défaut 10 entries).
- Taille configurable via `FGP_LOGS_BUFFER_NETWORK` et `FGP_LOGS_BUFFER_DETAILED`.
- FIFO strict : nouvelle entry quand plein → éviction de la plus ancienne.
- Le ring buffer sert à alimenter les reconnects courts (historique immédiat) : à la connexion SSE, le serveur flush les entries du buffer filtrées par `since`, puis bascule en stream live.

**Purge sur inactivité** :

- Si aucun event n'est ajouté au buffer d'un blob pendant `FGP_LOGS_INACTIVITY_MIN` minutes (défaut 10), le buffer + le topic pub/sub sont libérés.
- La purge se fait à la prochaine opération (accès paresseux) ou via un timer périodique global.
- Une connexion SSE active **pour ce blob** ne compte pas comme inactivité : le buffer reste vivant tant qu'un consommateur est branché.

### 14.8 Chiffrement client-side du body detailed

Objectif : même en cas de dump mémoire du serveur FGP, le contenu des bodies capturés reste illisible sans la clé client.

**Flux de chiffrement (côté serveur au moment du capture)** :

1. Le proxy lit le body request (déjà disponible pour le matching body filters — cf. section 11.5).
2. Le body est compressé (gzip).
3. Si la taille compressée dépasse `FGP_LOGS_DETAILED_MAX_KB` → entry marquée `truncated: true`, body omis, on passe à l'étape suivante avec un body vide.
4. Sinon, le body compressé est chiffré AES-256-GCM avec la **même clé dérivée** que le blob (`PBKDF2(client_key + server_salt)`), IV 12 bytes aléatoire.
5. Le résultat (IV || ciphertext || tag) est encodé en base64url et stocké dans `bodyEncrypted`.

**Flux de déchiffrement (côté client dans le JS de `/logs`)** :

1. Le client a déjà renseigné la clé client pour ouvrir le stream SSE (cf. 14.10).
2. À la réception d'un event `detailed`, le JS dérive la même clé avec PBKDF2(client_key + server_salt), où `server_salt` est obtenu via `GET /api/salt` (même endpoint que le flow de génération).
3. Le client décode le base64url, extrait l'IV, déchiffre AES-256-GCM, décompresse gzip, affiche le body en JSON.
4. Si le déchiffrement échoue → l'event est affiché avec un indicateur d'erreur, sans bloquer le reste du stream.

**Conséquences** :

- Le serveur ne voit **jamais** le body detailed en clair en dehors de la fenêtre de capture immédiate (le temps de chiffrer). Après chiffrement, la version plain text est libérée.
- Le serveur ne peut pas servir un endpoint de recherche ou d'analyse sur les bodies detailed : il n'a que du ciphertext.
- Si la clé client est perdue, les bodies detailed encore en buffer sont définitivement illisibles. C'est conforme à la philo zero-trust FGP.

### 14.9 Stream SSE

**Endpoint** : `GET /logs/stream`

**Authentification** (au choix, cf. 14.10) :
- Header `X-FGP-Blob` : blob chiffré.
- Header `X-FGP-Key` : clé client.

Le serveur déchiffre le blob pour valider l'auth et lire `logs.enabled`. Les codes d'erreur réutilisent la convention du proxy principal (§8) pour cohérence (`missing_key`, `invalid_credentials`, `token_expired`, `blob_too_large`). Les codes nouveaux introduits par `/logs/stream` (`invalid_request`, `logs_not_enabled`, `logs_stream_conflict`) sont spécifiques à cette route.

| Status | Code erreur (shape `{error, message}`) | Condition |
|--------|----------------------------------------|-----------|
| 400 | `invalid_request` | Paramètre `since` présent mais non parsable en integer positif |
| 401 | `missing_key` | Header `X-FGP-Blob` ou `X-FGP-Key` manquant |
| 401 | `invalid_credentials` | Déchiffrement du blob échoué (clé invalide, blob corrompu, ou `FGP_SALT` absent côté serveur) |
| 403 | `logs_not_enabled` | Blob valide mais `logs.enabled !== true` |
| 404 | (pas de shape erreur, route inexistante) | `FGP_LOGS_ENABLED=0` ou absent |
| 409 | `logs_stream_conflict` | Un autre stream est déjà ouvert pour ce `blobId` |
| 410 | `token_expired` | Blob valide mais TTL dépassé |
| 414 | `blob_too_large` | `X-FGP-Blob` > 4 KB (cohérent avec §8) |

Toutes les erreurs portent `X-FGP-Source: proxy`.

**Query string** :
- `since=<ts>` (optionnel) : timestamp en millisecondes, integer positif. Le serveur flush depuis le ring buffer uniquement les entries avec `ts > since`, puis bascule en stream live. Sans `since`, le serveur flush tout le buffer courant. Si `since` est présent mais non parsable → 400 `invalid_request`.

**Format** :

```
event: log
data: {"type":"network","ts":1713787200123, ...}

event: log
data: {"type":"detailed","ts":1713787200123, ...}

event: ping
data: {}

```

- Event `log` : une entry de log (network ou detailed).
- Event `ping` : heartbeat envoyé toutes les 15 secondes pour éviter les idle kills de reverse proxies (Deno Deploy, Cloudflare, nginx). Payload `{}` ignoré par le client, il suffit de maintenir la connexion.
- Le client track le `ts` du dernier event `log` reçu. En cas de déconnexion (réseau, idle kill malgré le heartbeat), il reconnecte avec `?since=<lastTs>`.

**Pourquoi `fetch` streaming plutôt que `EventSource`** : l'API `EventSource` ne permet pas d'envoyer des headers custom (pas de moyen de passer `X-FGP-Blob` + `X-FGP-Key`). Le client utilise donc `fetch` en mode streaming et parse le flux SSE à la main.

### 14.10 Flow UI

**Page `/logs` — formulaire d'auth initial** :

1. L'utilisateur arrive sur `/logs` sans contexte. L'UI affiche un formulaire avec deux champs : blob et clé client (le champ clé a un bouton œil pour révéler/masquer, cohérent avec la page `/`).
2. Soumission → le client tente un `fetch` streaming vers `/logs/stream` avec les headers.
3. Si succès (stream ouvert) → l'UI bascule sur la vue stream.
4. Blob et clé sont conservés en `sessionStorage` pour la durée de l'onglet uniquement (pas de `localStorage` → pas de persistence après fermeture). Cela permet de survivre à un F5 sans re-saisir.
5. **Auto-reconnect au chargement** : si sessionStorage contient un blob et une clé valides à l'ouverture de `/logs`, le client tente automatiquement la connexion SSE (état visuel « Connexion en cours... »). En cas d'échec (blob expiré, kill switch off, etc.), l'UI rebascule sur le formulaire avec le message d'erreur et les champs pré-remplis.

**Identification visuelle du blob consulté** :

- Après déchiffrement réussi côté client, l'UI extrait le champ `name` du blob (« Nom de la configuration ») et l'affiche en en-tête de la vue stream, suivi du `blobId` tronqué à 8 chars hex. Le `title` attribute porte les 16 chars complets pour les utilisateurs qui veulent l'identifiant de debug.
- Format : `<Nom de config> · <blobId 8 chars>`.
- Si le blob n'a pas de `name` (blob ancien), fallback sur `blobId 8 chars` seul.

**Vue stream** :

- Deux colonnes ou deux sections : liste des events network en continu, section dépliable pour les events detailed (avec body déchiffré).
- Indicateur de statut : « Connecté » / « Reconnexion... » / « Erreur ».
- Bouton « Se déconnecter » qui ferme le stream et efface le `sessionStorage`.

**Onglet « Logs » dans la page de configuration** :

- Dans la page de génération d'un blob (`/`), un nouvel onglet « Logs » rejoint les onglets existants (Doc / Exemples / Changelog).
- Contenu : description de la feature, case à cocher « Activer les logs pour ce blob » (pilote `logs.enabled`), case à cocher conditionnelle « Capturer les bodies détaillés » (pilote `logs.detailed`, grisée tant que `enabled` n'est pas coché).
- Warning visible quand `detailed` est coché : rappel que le body est chiffré mais peut contenir des données sensibles, que le buffer est court, et que multipart est exclu.
- Lien direct vers `/logs` pour tester la consultation.

### 14.11 Exclusions et limitations

- **Multipart non capturé** : si le content-type est `multipart/*`, aucune entry `detailed` n'est produite (même si `logs.detailed` actif). L'entry `network` reste émise normalement. Raison : body potentiellement binaire volumineux (upload de fichier).
- **Headers non capturés** : aucun header de requête n'est inclus dans les entries, ni network ni detailed. Raison : risque de fuite cookies, tokens tiers, X-API-Key de l'appelant.
- **Target upstream non exposé** : les entries ne contiennent pas `target`. Un opérateur qui consulte `/logs` voit seulement le path entrant, jamais l'URL de destination réelle.
- **Response body non capturé** : seul le status et la durée sont tracés. Le corps de la réponse upstream n'est jamais loggé (coût mémoire + potentiel sensible).
- **1 stream par blob** : le serveur refuse un second `GET /logs/stream` pour un `blobId` déjà connecté (HTTP 409). Évite les abus et simplifie le modèle mémoire.
- **Pas de backfill long** : le ring buffer est volontairement court. La feature sert le monitoring en temps quasi-réel, pas l'audit rétrospectif.

### 14.12 Variables d'environnement

| Variable | Défaut | Effet |
|----------|--------|-------|
| `FGP_LOGS_ENABLED` | `0` | Kill switch global. Si `0` ou absent, les routes `/logs` et `/logs/stream` répondent 404, aucune capture n'a lieu, aucun buffer n'est alloué. `/logs/health` reste disponible et répond `{"enabled": false}` pour que l'UI config puisse informer l'utilisateur. Redémarrage serveur requis pour changer d'état. |
| `FGP_LOGS_BUFFER_NETWORK` | `50` | Taille du ring buffer network par blob. |
| `FGP_LOGS_BUFFER_DETAILED` | `10` | Taille du ring buffer detailed par blob. |
| `FGP_LOGS_INACTIVITY_MIN` | `10` | Minutes sans nouvel event → libération du buffer et du topic pub/sub pour ce blob. |
| `FGP_LOGS_DETAILED_MAX_KB` | `32` | Taille max en KB du body compressé par entry detailed. Au-delà, entry `truncated: true` sans body. |

**Estime RAM** (worst case, configuration par défaut) : ~330 KB par blob actif (50 network × 200 B + 10 detailed × 32 KB). 100 blobs actifs = ~33 MB. Marge confortable vs 512 MB d'un isolate Deno Deploy.

### 14.13 Copy UI `/logs`

**Formulaire d'auth (page `/logs` initiale)** :

| Élément | Texte |
|---------|-------|
| Titre page | « Logs d'un blob » |
| Sous-titre | « Consultez en direct les requêtes passées par votre blob FGP. Saisissez votre blob et votre clé client pour ouvrir le flux. » |
| Label champ blob | « Blob chiffré » |
| Placeholder blob | « Collez le blob base64url ici » |
| Label champ clé | « Clé client (X-FGP-Key) » |
| Placeholder clé | « La clé retournée à la génération » |
| Bouton soumission | « Connecter » |
| État chargement | « Connexion en cours... » |
| État connecté | « Connecté — en attente d'événements » |
| Bouton déconnexion | « Se déconnecter » |

**Vue stream** :

| Élément | Texte |
|---------|-------|
| Section network | « Requêtes » |
| Section detailed | « Bodies détaillés » |
| Badge reconnexion | « Reconnexion... » |
| Info buffer vide | « Aucun événement pour l'instant. Les requêtes apparaîtront ici en direct. » |
| Info detailed non activé | « Les bodies détaillés ne sont pas activés pour ce blob. Activez-les dans l'onglet Logs de votre configuration. » |
| Indicateur truncated | « Body trop volumineux — non stocké » |
| Erreur déchiffrement body | « Déchiffrement impossible — vérifiez votre clé » |

**Onglet « Logs » dans la page de configuration** :

| Élément | Texte |
|---------|-------|
| Titre onglet | « Logs » |
| Intro | « Activez la capture in-memory des requêtes passant par ce blob. Les logs sont visibles uniquement via `/logs` et ne sont jamais persistés. » |
| Toggle principal | « Activer les logs pour ce blob » |
| Aide toggle principal | « Chaque requête est journalisée en mémoire (méthode, chemin, status, durée, IP tronquée) pendant quelques minutes. » |
| Toggle detailed | « Capturer aussi les bodies détaillés (POST/PUT/PATCH JSON) » |
| Aide toggle detailed | « Le body request est compressé puis chiffré avec votre clé client avant d'être stocké. Le serveur ne peut pas le lire. Multipart exclu. » |
| Warning detailed | « Activez uniquement si vous avez besoin d'inspecter les payloads. Le body peut contenir des informations sensibles — n'ouvrez `/logs` que sur un poste de confiance. » |
| Lien vers /logs | « Ouvrir la console `/logs` » |
| Feature off globalement | « Les logs sont désactivés sur cette instance FGP. Contactez l'administrateur pour activer `FGP_LOGS_ENABLED`. » |

**Messages d'erreur SSE** (réponses `X-FGP-Source: proxy` côté `/logs/stream`, shape `{error, message}`) :

| Status | `error` | Condition | Message UI |
|--------|---------|-----------|------------|
| 400 | `invalid_request` | `since` présent mais non parsable | « Paramètre de reconnexion invalide. » |
| 401 | `missing_key` | Header `X-FGP-Blob` ou `X-FGP-Key` manquant | « Blob ou clé absent — veuillez ressaisir. » |
| 401 | `invalid_credentials` | Déchiffrement du blob échoué | « Blob ou clé invalide — impossible de déchiffrer. » |
| 403 | `logs_not_enabled` | Blob valide mais `logs.enabled !== true` | « Les logs ne sont pas activés pour ce blob. Activez-les dans la configuration avant de réessayer. » |
| 404 | (route absente) | `FGP_LOGS_ENABLED` off ou absent | « Les logs sont désactivés sur cette instance. » |
| 409 | `logs_stream_conflict` | Un autre stream est déjà ouvert pour ce blob | « Un flux de logs est déjà actif pour ce blob. Fermez l'autre onglet avant de réessayer. » |
| 410 | `token_expired` | TTL du blob dépassé | « Ce blob est expiré. » |
| 414 | `blob_too_large` | Blob > 4 KB | « Blob trop volumineux. » |

L'UI lit `error` pour router l'affichage.
