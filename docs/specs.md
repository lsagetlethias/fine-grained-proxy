# Spécifications fonctionnelles : Fine-Grained Proxy (FGP)

**Version** : 4.0
**Date** : 2026-09-03
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
| v4 | Auth structurée : le champ `auth` accepte un objet `AuthSpec` (headers multiples, Scalingo Database API) en plus des modes string existants |

---

## 2. User stories

### US-1 (ops) : donner un accès read-only à un prestataire

> En tant qu'ops, je veux générer une URL FGP qui donne accès en lecture seule à certains endpoints d'une API, afin de partager un accès limité avec un prestataire externe sans lui donner mon token.

**Critères d'acceptation** :
- L'URL générée ne permet que les requêtes GET sur les endpoints autorisés
- Toute tentative avec une autre méthode ou un autre path renvoie 403
- L'URL expire après le TTL configuré

### US-2 (dev lead) : permettre le scale sans accès au code (Scalingo)

> En tant que dev lead, je veux créer une URL FGP qui permet uniquement de scaler une app Scalingo, afin qu'un membre de l'équipe puisse gérer la charge sans accéder aux variables d'environnement ni déployer.

**Critères d'acceptation** :
- L'URL permet `POST /v1/apps/my-app/scale` et `GET /v1/apps/my-app/containers`
- L'accès aux variables d'environnement et aux déploiements est refusé (403)

### US-3 (CI/CD) : token de déploiement scopé par branche

> En tant que responsable CI/CD, je veux un token qui ne peut que déployer une app précise sur les branches `main` et `release/*`, afin de limiter les dégâts si le secret du pipeline fuite.

**Critères d'acceptation** :
- L'URL ne fonctionne que pour `POST /v1/apps/my-app/deployments`
- Le body filter vérifie que `deployment.git_ref` vaut `main` ou matche `release/*`
- Toute autre branche est refusée (403)
- Le TTL peut être court (ex : 1h pour un run de pipeline)

### US-4 (admin) : accès large temporaire

> En tant qu'admin, je veux générer une URL FGP avec accès complet mais un TTL de 24h, afin de déléguer temporairement l'accès à un collègue.

**Critères d'acceptation** :
- L'URL utilise le scope `*:*` (toute méthode, tout path)
- Après le TTL, toute requête renvoie 410 Gone

### US-5 (utilisateur) : générer une URL via l'interface

> En tant qu'utilisateur FGP, je veux un formulaire web pour configurer et générer une URL FGP, afin de ne pas avoir à construire le blob chiffré manuellement.

**Critères d'acceptation** :
- Le formulaire permet de saisir le token, l'URL cible, le mode d'auth, les scopes (avec body filters optionnels) et le TTL
- L'URL et la clé client sont affichées à la génération
- Le token n'est jamais stocké côté serveur

### US-6 (API tierce) : protéger un accès à une API non-Scalingo

> En tant que développeur, je veux utiliser FGP pour restreindre l'accès à une API tierce (ex : un service interne, une API REST quelconque) avec un bearer token, en limitant les endpoints accessibles.

**Critères d'acceptation** :
- L'URL cible peut être n'importe quelle API HTTP (pas seulement Scalingo)
- Le mode d'auth peut être `bearer`, `basic` ou `header:{nom}`
- Les scopes `METHOD:PATH` contrôlent finement les endpoints autorisés

### US-7 (CI/CD avancé) : restreindre le contenu des requêtes

> En tant que responsable CI/CD, je veux restreindre non seulement la route mais aussi le contenu du body des requêtes, afin d'empêcher des modifications non autorisées même sur un endpoint autorisé.

**Critères d'acceptation** :
- Les body filters vérifient le contenu JSON du body des requêtes POST/PUT/PATCH
- Les types de filtres supportés sont : exact match, wildcard, string wildcard (glob), not (exclusion), and (composition)
- Les filtres sont en AND entre eux (tous doivent matcher), les valeurs d'un filtre sont en OR (au moins une doit matcher)

### US-8 (développeur) : API qui exige plusieurs headers d'authentification

> En tant que développeur, je veux configurer plusieurs headers d'authentification sur une même URL FGP, afin de proxyfier une API qui demande une combinaison de secrets (par exemple une clé d'API plus un identifiant client).

**Critères d'acceptation** :
- La configuration accepte une liste de couples nom / valeur envoyés à chaque requête vers l'API cible
- Les valeurs sont chiffrées dans le blob au même titre que le token
- Les valeurs ne sont jamais renvoyées en clair par les endpoints de décodage ni par les URLs de partage
- Une configuration à un seul header reste strictement équivalente au mode `header:{nom}` existant

### US-9 (ops) : accès à une base Scalingo sans partager le token de compte

> En tant qu'ops Scalingo, je veux exposer la Database API d'un addon à un tiers, afin qu'il puisse consulter ou administrer une base précise sans jamais détenir mon token de compte Scalingo ni pouvoir toucher aux autres addons.

**Critères d'acceptation** :
- Le blob contient le token de compte Scalingo, la région, et **une seule** base de données autorisée
- FGP obtient lui-même le token d'addon et le renouvelle avant expiration, de façon transparente pour l'appelant
- Le consommateur de l'URL ne voit jamais le token de compte ni le token d'addon
- Donner accès à une seconde base impose de générer un second blob

### US-10 (CI/CD) : une seule clé client pour plusieurs URLs FGP

> En tant que responsable CI/CD, je veux fournir moi-même la clé client à la génération, afin de n'avoir qu'un seul secret à gérer dans mon pipeline même si j'utilise plusieurs URLs FGP.

**Critères d'acceptation** :
- La clé client peut être fournie à la génération au lieu d'être tirée au hasard par FGP
- Une clé trop courte est refusée à la génération
- L'interface avertit explicitement que mutualiser une clé lie les blobs entre eux
- Une clé générée automatiquement reste le comportement par défaut

### US-11 (agent LLM) : comprendre FGP sans lire l'interface

> En tant qu'agent LLM (ou développeur assisté par un agent), je veux une description machine-readable de FGP à une adresse conventionnelle, afin de générer une URL FGP correcte du premier coup sans parser une page HTML.

**Critères d'acceptation** :
- Un document markdown est servi à une adresse fixe et documentée
- Il décrit la syntaxe des scopes, les modes d'auth, les body filters, les codes d'erreur et des exemples curl
- Il est découvrable depuis les pages HTML du proxy
- Il ne divulgue aucune configuration ni aucun secret d'une instance donnée

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

Les body filters, et depuis la v4 les specs d'authentification structurées, sont bornés pour éviter les dérives en performance, taille de blob et surface d'attaque. Toutes les limites sont validées au déchiffrement du blob. Un blob qui dépasse une limite est rejeté avec une erreur `malformed BlobConfig`. L'UI valide aussi ces limites à la création.

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

### Limites des specs d'authentification (v4)

Les mêmes principes s'appliquent au champ `auth` structuré : bornes validées au déchiffrement du blob, blob rejeté au-delà, et validation miroir dans l'UI avant génération.

| Limite | Valeur | Justification |
|--------|--------|---------------|
| Headers par AuthSpec `headers` | 8 max | Aucune API réelle n'exige plus de 8 headers d'auth. Au-delà, c'est du forward de headers déguisé. |
| Longueur du nom de header | 64 chars max | Un nom de header HTTP réaliste tient largement dedans. Caractères autorisés : le jeu `token` de la RFC 7230, ni plus ni moins. |
| Longueur de la valeur de header | 1024 chars max | Couvre un JWT confortablement. Au-delà, c'est un payload, pas un secret d'auth. |
| Addons par AuthSpec `scalingo-addon` | exactement 1 | Un blob donne accès à une base de données, pas à un parc. Le multi-addon est écarté en v4 (cf. §11.1.2). |
| Longueur `app` et `addonId` | 64 chars max chacun | Aligné sur les identifiants Scalingo réels. |
| Taille blob | 4096 chars base64url | Inchangée. Les limites d'auth sont dimensionnées pour tenir dedans avec les scopes. |

Un blob dont l'`AuthSpec` dépasse une de ces limites est rejeté au déchiffrement (401 `invalid_credentials`, cf. §8.2), comme pour les limites de scopes. À la génération, `POST /api/generate` renvoie 400 `auth_limit_exceeded` avec un message explicite.

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
**Blob v4** (auth structurée, ici en mode headers multiples) :

```json
{
  "v": 4,
  "target": "https://api.example.com",
  "auth": {
    "type": "headers",
    "headers": [
      { "name": "X-API-Key", "value": "sk-live-xxxxxxxxxxxx" },
      { "name": "X-Client-Id", "value": "acme-prod" }
    ]
  },
  "scopes": ["GET:/v2/resources/*"],
  "createdAt": 1712534400,
  "ttl": 86400
}
```

| Champ | Type | Description |
|-------|------|-------------|
| `v` | `number` | Version du format (`2`, `3` ou `4`) |
| `token` | `string` | Token ou secret pour l'API cible. Requis sauf pour l'AuthSpec `headers` (cf. §6.3). |
| `target` | `string` | URL de base de l'API cible |
| `auth` | `string \| AuthSpec` | Mode d'authentification, string (v2/v3) ou objet structuré (v4). Voir §11.1. |
| `scopes` | `Array<string \| ScopeEntry>` | Scopes string et/ou structurés |
| `createdAt` | `number` | Timestamp Unix (secondes) de création du blob |
| `ttl` | `number` | Durée de validité en secondes depuis `createdAt`. `0` = pas d'expiration. |

La version est déterminée automatiquement, sur deux axes indépendants, en prenant la plus haute des deux :

- `auth` est un objet `AuthSpec` → **v4**
- sinon, au moins un scope est un ScopeEntry → **v3**
- sinon → **v2**

Un blob v4 peut donc n'avoir que des scopes string, et un blob v3 conserve une auth string. Le numéro de version est un marqueur de capacité de lecture, pas une génération fonctionnelle.

Le token est considéré expiré quand `Date.now() / 1000 > createdAt + ttl` (sauf si `ttl === 0`).

### 6.2 Compatibilité ascendante

- Les blobs v2 et v3 existants restent **valides et inchangés**. Aucune régénération n'est nécessaire.
- Un proxy à jour lit v2, v3 et v4. Un blob v4 présenté à une ancienne version du proxy est rejeté (auth non reconnue), ce qui est le comportement attendu : la donnée est structurellement nouvelle, pas juste enrichie.
- Le champ optionnel `logs` (cf. §14.4) reste orthogonal au versioning et s'applique à toutes les versions.
- Le mode string `header:{name}` n'est **pas déprécié**. Il reste la forme canonique d'un header d'auth unique (cf. §6.3).

### 6.3 Champ `auth` structuré (AuthSpec, v4)

```typescript
interface AuthHeaderEntry {
  name: string;
  value: string;
}

type AuthSpec =
  | { type: "headers"; headers: AuthHeaderEntry[] }
  | { type: "scalingo-addon"; app: string; addonId: string; apiUrl?: string };

type Auth = string | AuthSpec;
```

**Règle de sérialisation du mode headers** : un AuthSpec `headers` qui ne contient **qu'une seule entrée** est sérialisé en forme legacy, c'est-à-dire `auth: "header:{name}"` avec la valeur dans `token`, et le blob reste v2 ou v3. Le mode structuré n'est utilisé qu'à partir de deux headers. Motivations : blob plus petit, aucune régression sur l'existant, et un seul chemin de code pour le cas le plus courant. L'UI applique cette normalisation de façon transparente : l'utilisateur voit une liste de headers, la sérialisation est un détail interne.

**Règle sur `token` en mode headers** : les secrets vivent dans `headers[].value`, le champ `token` n'a plus de sens. Il est **omis à la génération**. S'il est présent malgré tout dans un blob reçu, il est ignoré et n'est jamais transmis à l'API cible. Le proxy ne rejette pas le blob pour autant : un secret orphelin ne doit pas casser un accès légitime, mais il ne doit surtout pas fuiter.

**Validation au déchiffrement** (en plus des règles §6.5) :

- `auth` est soit une string non vide, soit un objet avec un `type` connu (`headers`, `scalingo-addon`). Tout autre `type` → blob rejeté.
- Si `auth` est un objet, alors `v` doit valoir `4`. Si `v <= 3`, `auth` doit être une string.
- `headers` : tableau non vide, chaque entrée a un `name` et un `value` non vides, les noms sont uniques (comparaison insensible à la casse), limites §5 respectées.
- `scalingo-addon` : `app` et `addonId` sont présents et non vides, `token` est requis et non vide, `apiUrl` (si présent) est une URL absolue en `https`. Limites §5 respectées. Un `auth` de ce type qui porterait un tableau d'addons est rejeté : la forme multi n'existe pas en v4.

### 6.4 Processus de chiffrement

1. Sérialiser le JSON en UTF-8
2. Compresser avec gzip
3. Dériver la clé de chiffrement : `PBKDF2(client_key + server_salt, 100_000 iterations, SHA-256)` → clé AES-256
4. Générer un IV aléatoire de 12 bytes
5. Chiffrer avec AES-256-GCM → ciphertext + auth tag (16 bytes)
6. Encoder en base64url : `base64url(iv || ciphertext || tag)`

### 6.5 Processus de déchiffrement

1. Décoder le base64url
2. Extraire IV (12 premiers bytes), ciphertext + tag (le reste)
3. Dériver la même clé avec PBKDF2(client_key + server_salt)
4. Déchiffrer AES-256-GCM et vérifier le tag d'authenticité
5. Décompresser gzip
6. Parser le JSON
7. Valider la structure :
   - `v` doit être `2`, `3` ou `4`
   - `target` et `auth` non vides ; `token` non vide sauf en AuthSpec `headers` (cf. §6.3)
   - `scopes` est un tableau
   - Si v2 : tous les scopes sont des strings, `auth` est une string
   - Si v3 : chaque scope est soit un string, soit un ScopeEntry valide (limites vérifiées), `auth` est une string
   - Si v4 : mêmes règles de scopes que v3, et `auth` est un AuthSpec valide (cf. §6.3)

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

### 7.3 Headers FGP

| Header | Requis | Description |
|--------|--------|-------------|
| `X-FGP-Key` | Oui | Clé client pour déchiffrer le blob. Sans elle, le blob est inexploitable. |
| `X-FGP-Blob` | Non | Blob chiffré, en mode header. Prioritaire sur le premier segment d'URL quand les deux sont présents. |

Les deux headers sont consommés par le proxy et ne sont **jamais** transmis à l'API cible.

#### Carve-out `/logs` (ne pas supprimer)

Le mode header s'applique à toutes les requêtes portant `X-FGP-Blob`, quel que soit le chemin, **sauf** `/logs` et `/logs/*`, explicitement exclus.

La raison est que la feature logs consomme elle-même ces deux headers, pour son propre compte : `GET /logs/stream` s'authentifie avec `X-FGP-Blob` et `X-FGP-Key` pour identifier le blob dont il doit streamer les entries (§14.9). Sans l'exclusion, ces requêtes seraient captées par le proxy et forwardées vers `config.target`. La conséquence n'est pas une dégradation, c'est une disparition : **`/logs/stream` deviendrait purement injoignable**, et l'appelant recevrait à la place la réponse de sa propre API cible interrogée sur le chemin `/logs/stream`.

L'exclusion est donc une condition d'existence de la feature, pas une optimisation. Elle est verrouillée par un test : la supprimer fait échouer la CI.

Cette exception est **asymétrique** avec `/llms.txt`, qui n'est pas exclu et reste proxyfiable en mode header (§16.2). L'asymétrie n'est pas une incohérence : `/logs*` lit ces headers, `/llms.txt` ne les lit pas. Le critère d'exclusion est la consommation des headers FGP par la route elle-même, rien d'autre.

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
- Headers : propagés tels quels, sauf `Set-Cookie` qui reste filtré (le proxy est stateless, entorse acceptée à la transparence pure, cf. section 11.3).
- Header ajouté : `X-FGP-Source: upstream`.

En particulier :
- Un 401 upstream (token invalide côté API cible) n'est plus transformé en 502 `upstream_auth_failed`. Il reste un 401 avec le body d'origine de l'API cible et `X-FGP-Source: upstream`. C'est au client d'interpréter ce 401 : son token upstream est invalide, pas un problème de proxy.
- Un 429 upstream n'est plus réécrit en body FGP `rate_limited`. Il reste un 429 avec le body d'origine de l'API cible et ses headers (`Retry-After` inclus) et `X-FGP-Source: upstream`.
- Un 5xx upstream n'est plus transformé en 502 `upstream_error`. Il reste le status original de l'upstream avec son body et `X-FGP-Source: upstream`.

### 8.2 Erreurs FGP

Les erreurs produites par le proxy (avant ou pendant le forward) suivent la shape JSON `{error, message}` et portent systématiquement le header `X-FGP-Source: proxy`.

Les messages des erreurs FGP (`X-FGP-Source: proxy`) sont **volontairement génériques** pour ne pas leaker d'information sur la configuration interne (pas de détail sur quel scope a échoué, pas de dump du blob, pas d'exception stack). Cette contrainte ne s'applique **qu'aux réponses `X-FGP-Source: proxy`** : les réponses `X-FGP-Source: upstream` sont forwardées telles quelles et peuvent contenir n'importe quel message produit par l'API cible. C'est le contrat de transparence (section 8.1), pas une fuite côté FGP.

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
| **502 Bad Gateway** | Mode `scalingo-exchange` : l'échange du token de compte contre un bearer a échoué | `{"error": "auth_exchange_failed", "message": "Unable to exchange Scalingo token"}` |
| **502 Bad Gateway** | Mode `scalingo-addon` : FGP n'a pas pu obtenir de token d'addon (exchange refusé, API Scalingo en erreur ou injoignable) | `{"error": "auth_addon_failed", "message": "Unable to obtain addon token"}` |

Trois 502 sont légitimes côté proxy, et elles ne se recouvrent pas :

- `upstream_unreachable` : aucune réponse HTTP n'a pu être obtenue de l'API cible (échec réseau au moment du forward).
- `auth_exchange_failed` : FGP n'a pas pu obtenir le bearer Scalingo dont il a besoin pour s'authentifier (mode `scalingo-exchange`).
- `auth_addon_failed` : FGP n'a pas pu obtenir le token d'addon (mode `scalingo-addon`, échec à l'étape 1 ou 2).

Les deux dernières se produisent **avant** le forward : la requête n'a jamais atteint l'API cible. Dès qu'une réponse upstream existe (même un 502/503/504 upstream), elle est forwardée telle quelle avec `X-FGP-Source: upstream`.

Le 500 `internal_error` est renvoyé par un handler global (`app.onError`) qui catche toute exception non prévue dans le pipeline FGP. Il conserve la même shape `{error, message}` et le header `X-FGP-Source: proxy`.

### 8.3 Harmonisation des endpoints internes

Les endpoints internes du proxy qui tapent eux-mêmes des APIs externes (ex : `POST /api/list-apps` qui appelle Scalingo pour l'UI) ne sont **pas des proxies transparents** : ils consomment l'upstream pour servir leur propre contrat (shape JSON stable attendue par l'UI). Ils utilisent donc un modèle hybride :

- Échec réseau (fetch throw) → 502 `upstream_unreachable` + `X-FGP-Source: proxy`.
- Échec d'exchange token (pour `list-apps` et `list-addons`) → 401 `token_exchange_failed` + `X-FGP-Source: proxy`.

Ne pas confondre `token_exchange_failed` (401, endpoints internes `/api/list-apps` et `/api/list-addons`) avec `auth_exchange_failed` (502, proxy principal en mode `scalingo-exchange`). Les deux décrivent un échange de token Scalingo qui a échoué, mais ils ne s'adressent pas au même public : le premier dit à l'utilisateur de l'UI que **son** token est mauvais, au moment où il le saisit, et il peut le corriger. Le second dit au consommateur d'une URL FGP que le proxy n'a pas pu s'authentifier pour lui, ce qui n'est pas de son ressort et ne se corrige pas côté client. Deux publics, deux statuts, deux codes.

Le préfixe `auth_` des codes du proxy est là pour rendre cette frontière lisible d'un coup d'oeil : `auth_*` signale un échec d'authentification **du proxy vers l'aval**, jamais un problème de l'appelant ni une erreur renvoyée par l'API cible.
- Réponse upstream non-OK (status non-2xx reçu de l'upstream) → 502 avec shape FGP dédiée à l'endpoint (ex : `upstream_list_apps_failed` avec le status upstream reporté dans `message` pour le debug) + `X-FGP-Source: proxy`.

**Exception** : quand un status upstream porte une information que l'utilisateur peut corriger lui-même, l'endpoint le traduit en code dédié avec le status correspondant, au lieu de le noyer dans le 502 générique. C'est le cas de `app_not_found` (404) sur `/api/list-addons` : une application inexistante et une panne de l'API Scalingo ne doivent pas produire le même message, sinon une faute de casse sur un nom d'app se présente à l'utilisateur comme une panne, sans rien à corriger. La règle reste étroite : un status upstream n'est traduit que s'il désigne sans ambiguïté une erreur de saisie.

Tous les résultats de ces endpoints portent `X-FGP-Source: proxy` (que ce soit 2xx ou erreur), puisque le contrat de réponse est défini par FGP et non par l'upstream.

### 8.4 Ordre de vérification

Le proxy vérifie dans cet ordre, et renvoie la première erreur rencontrée :

1. Validité du path (segments) → 400 `invalid_request` (`X-FGP-Source: proxy`)
2. Taille du blob → 414 `blob_too_large` (`X-FGP-Source: proxy`)
3. Présence du header `X-FGP-Key` → 401 `missing_key` (`X-FGP-Source: proxy`)
4. Déchiffrement du blob → 401 `invalid_credentials` (`X-FGP-Source: proxy`)
5. Vérification du TTL → 410 `token_expired` (`X-FGP-Source: proxy`)
6. Validité du mode d'auth → 400 `invalid_auth_mode` (`X-FGP-Source: proxy`)
7. Parsing du body (si body filters requis) → 400 `invalid_body` ou 403 `scope_denied` (`X-FGP-Source: proxy`)
8. Vérification du scope (méthode + path + body) → 403 `scope_denied` (`X-FGP-Source: proxy`)
9. Obtention des credentials upstream → 502 `auth_exchange_failed` en mode `scalingo-exchange`, 502 `auth_addon_failed` en mode `scalingo-addon` (`X-FGP-Source: proxy`)
10. Forward vers l'API cible :
    - Si `fetch` throw (réseau) → 502 `upstream_unreachable` (`X-FGP-Source: proxy`)
    - Sinon → status/body/headers upstream forwardés transparents (`X-FGP-Source: upstream`)
11. Exception inattendue à n'importe quelle étape → 500 `internal_error` via `app.onError` (`X-FGP-Source: proxy`)

L'obtention des credentials intervient **après** la vérification des scopes : un appelant hors scope ne doit jamais provoquer d'appel réseau vers Scalingo.

---

## 9. Rate limiting

### 9.1 Stratégie FGP

FGP ne fait pas de rate limiting propre. La stratégie est transparente :

1. **Forward transparent** : les requêtes sont transmises à l'API cible telles quelles.
2. **Propagation du 429** : si l'API cible répond 429, FGP forwarde le 429 avec son body et ses headers d'origine (`Retry-After` inclus) et ajoute `X-FGP-Source: upstream` (cf. section 8.1).
3. **Pas de quota par URL** : FGP ne tente pas de répartir le budget entre les différentes URLs.

### 9.2 Optimisation : caches Scalingo

Pour les modes `scalingo-exchange` et `scalingo-addon`, l'exchange token → bearer compte dans le rate limit Scalingo (60 req/min). FGP met en cache le bearer en mémoire :

- Le bearer est stocké **en clair en mémoire** (le process est isolé, pas de persistence disque).
- Clé du cache : `SHA-256(token_scalingo)`
- TTL du cache : 55 minutes (le bearer Scalingo expire à 1h, marge de 5 minutes)
- **Concurrence (singleflight)** : si plusieurs requêtes arrivent en parallèle avec le même token et que le bearer a expiré, un seul exchange est exécuté. Les autres requêtes attendent le résultat via une `Promise` partagée. Si l'exchange échoue, toutes les requêtes en attente reçoivent l'erreur.

Le mode `scalingo-addon` ajoute un **second cache**, indépendant du premier, pour les tokens d'addon :

- Clé du cache : `SHA-256(token_scalingo + app + addonId)`. Deux addons du même compte ne partagent donc jamais leur token.
- TTL du cache : 55 minutes (le token d'addon expire à 1h, même marge de 5 minutes).
- Même stratégie singleflight que pour le bearer : une seule demande de token d'addon en vol par couple app/addon.
- Les deux caches sont chaînés : un token d'addon expiré déclenche une demande qui réutilise le bearer en cache s'il est encore valide, sans nouvel exchange.

---

## 10. Endpoints internes du proxy

| Endpoint | Méthode | Description |
|----------|---------|-------------|
| `/` | GET | UI de configuration (formulaire de génération) |
| `/healthz` | GET | Health check (`{"status": "ok"}`) |
| `/llms.txt` | GET | Documentation markdown destinée aux agents LLM (cf. §16) |
| `/api/salt` | GET | Retourne le salt serveur (`{"salt": "..."}`) |
| `/api/generate` | POST | Génération d'URL FGP (chiffrement serveur). Accepte une clé client fournie par l'appelant (cf. §15). |
| `/api/decode` | POST | Décode un blob avec sa clé client. Token et secrets d'auth redactés (cf. §11.1.4). |
| `/api/share/encode` | POST | Encode une configuration publique partageable (`?c=`), sans secret |
| `/api/share/decode` | POST | Décode une configuration publique partageable |
| `/api/list-apps` | POST | Helper Scalingo : listing des apps via token exchange |
| `/api/list-addons` | POST | Helper Scalingo : listing des bases de données d'une app pour en sélectionner une (cf. §12.8) |
| `/api/test-scope` | POST | Test de scopes : vérifie si une requête (méthode + path + body) est autorisée par un jeu de scopes |
| `/api/test-proxy` | POST | Test end-to-end : rejoue une requête réelle vers l'API cible avec la configuration en cours |
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

Le proxy supporte six modes d'authentification, configurés dans le champ `auth` du blob. Les quatre premiers sont des modes string (v2/v3/v4), les deux derniers sont des AuthSpec structurés (v4 uniquement, cf. §6.3) :

| Mode | Forme | Comportement |
|------|-------|--------------|
| `bearer` | string | Envoie `Authorization: Bearer {token}` directement |
| `basic` | string | Envoie `Authorization: Basic {base64(":"+token)}` |
| `scalingo-exchange` | string | Échange le token Scalingo via `POST {SCALINGO_AUTH_URL}/v1/tokens/exchange`, puis envoie `Authorization: Bearer {bearer}` |
| `header:{name}` | string | Envoie `{name}: {token}` (ex : `header:X-API-Key` envoie `X-API-Key: {token}`) |
| `{ type: "headers" }` | AuthSpec | Envoie plusieurs headers d'authentification en une fois (cf. §11.1.1) |
| `{ type: "scalingo-addon" }` | AuthSpec | Obtient un token d'addon Scalingo en trois temps et envoie `Authorization: Bearer {addon_token}` (cf. §11.1.2) |

**Nommage des deux modes Scalingo** : l'interface les présente sous les noms employés par Scalingo dans sa propre documentation, pour parler le vocabulaire que l'utilisateur connaît déjà.

| Valeur technique dans le blob | Libellé UI |
|-------------------------------|------------|
| `scalingo-exchange` | « Scalingo API » |
| `{ type: "scalingo-addon" }` | « Scalingo Database API » |

Ce renommage est **purement cosmétique**. La valeur `scalingo-exchange` stockée dans les blobs ne change pas, n'est pas dépréciée, et continue d'être lue à l'identique. Aucun blob existant ne casse, aucune migration n'est nécessaire. Renommer la valeur technique en même temps que le libellé serait un breaking change gratuit sur tous les blobs Scalingo en circulation : ne pas le faire.

Les headers d'auth sont posés **après** la copie des headers du client : une valeur d'auth définie par le blob écrase systématiquement le header homonyme envoyé par l'appelant. Le consommateur d'une URL FGP ne peut donc pas neutraliser ni détourner l'authentification en injectant ses propres headers.

#### 11.1.1 Mode headers multiples

```json
{
  "type": "headers",
  "headers": [
    { "name": "X-API-Key", "value": "sk-live-xxxxxxxxxxxx" },
    { "name": "X-Client-Id", "value": "acme-prod" }
  ]
}
```

- Chaque entrée est posée telle quelle sur la requête sortante, dans l'ordre déclaré.
- Les valeurs sont des **secrets au même titre que `token`** : chiffrées dans le blob, jamais renvoyées en clair par `/api/decode`, jamais incluses dans une URL de partage `?c=` (cf. §11.1.4).
- Aucun appel réseau supplémentaire, aucun cache : le mode est purement local.
- Une entrée unique est normalisée en `header:{name}` à la génération (cf. §6.3). Le mode structuré démarre à deux entrées.

#### 11.1.2 Mode Scalingo Database API (token d'addon)

```json
{
  "type": "scalingo-addon",
  "app": "mon-app",
  "addonId": "ad-1111-2222-3333",
  "apiUrl": "https://api.osc-fr1.scalingo.com"
}
```

Ce mode donne accès à la Database API d'un addon Scalingo (typiquement `target: https://db-api.osc-fr1.scalingo.com`) sans jamais exposer le token de compte. Le flow se déroule **en trois temps** :

1. **Exchange du token de compte** : le token API Scalingo (`tk-us-...`, stocké dans `token`) est échangé contre un bearer sur `POST {SCALINGO_AUTH_URL}/v1/tokens/exchange`. Le bearer est valable 1 heure et mis en cache (cf. §9.2).
2. **Obtention du token d'addon** : ce bearer sert à demander un token d'addon sur `POST {apiUrl}/v1/apps/{app}/addons/{addonId}/token`. La réponse a la forme `{"addon": {..., "token": "..."}}`. Ce token est lui aussi valable 1 heure et fait l'objet d'un cache dédié (cf. §9.2).
3. **Forward** : la requête est transmise à `target` avec `Authorization: Bearer {addon_token}`.

`apiUrl` est l'URL de l'API Scalingo de la région (`https://api.<région>.scalingo.com`). En l'absence de `apiUrl`, FGP retombe sur `SCALINGO_API_URL`, puis sur `https://api.osc-fr1.scalingo.com`. Régions connues : `osc-fr1` et `osc-secnum-fr1`.

**Un blob, une base de données**

Le blob porte **exactement un couple `{app, addonId}`**. Il n'y a pas de liste, pas de sélection dynamique, pas d'inspection du path entrant : la base visée est connue à la génération et ne change jamais pendant la vie du blob. Donner accès à une seconde base impose de générer un second blob, avec son TTL, ses scopes et sa clé propres.

Ce n'est pas une simplification par paresse, c'est le périmètre le plus étroit possible, et il tombe bien : c'est aussi le seul qu'on sait garantir aujourd'hui (voir ci-dessous).

**Pourquoi pas de multi-addon (et ce qu'il faudrait pour le faire)**

Une version multi-addon a été spécifiée puis retirée avant implémentation. La raison est une ambiguïté non levée dans la documentation Scalingo, sur l'identifiant qui apparaît dans les URLs de la Database API : la page Databases indique que le segment d'URL correspond au champ `id` de l'addon, mais ses exemples affichent une valeur de la forme `my-db-123`, qui ressemble à un `resource_id` et non à un identifiant de la forme `ad-<uuid>`.

Le multi-addon supposait de résoudre la base visée en extrayant cet identifiant du path entrant et en le comparant à la liste du blob. Cette résolution repose donc entièrement sur l'hypothèse ambiguë. Des tests écrits sur cette hypothèse vérifieraient que le code respecte notre supposition, pas que la supposition soit vraie : ils passeraient au vert avec une résolution fausse en production. Faute de compte Scalingo de test pour trancher, la fonctionnalité est écartée.

L'ambiguïté ne touche **pas** l'étape 2 : la demande de token d'addon utilise bien le champ `id`, c'est documenté sans contradiction et c'est ce que le mono-addon utilise. Le mode livré ne dépend d'aucune hypothèse incertaine.

**Follow-up si le multi-addon revient un jour** : la condition d'entrée est une **recette sur un vrai compte Scalingo**, pas une relecture de documentation. Il faut appeler la Database API avec les deux formes d'identifiant et constater laquelle répond. Tant que ce test n'a pas été fait sur une instance réelle, le sujet reste fermé. Noter aussi qu'y revenir impliquera de faire évoluer la forme de l'`AuthSpec` (aujourd'hui `app` et `addonId` à plat), soit par un champ additionnel, soit par un nouveau `type`.

**Pourquoi pas de wildcard `app: "*"`** : écarté pour la même famille de raisons, en plus fort. Un wildcard obligerait FGP à lister les apps du compte pour résoudre l'addon, donc à maintenir un état en mémoire et à taper l'API Scalingo hors du chemin de forward. Cela casserait la nature stateless du proxy et donnerait de fait au blob un accès à **tous** les addons du compte, à l'opposé du principe de moindre privilège de FGP.

**Qui refuse une requête visant une autre base**

Le token d'addon obtenu à l'étape 2 est délivré par Scalingo **pour cette base et elle seule**. Une requête qui en vise une autre est donc rejetée, mais il faut être précis sur le point d'application : le refus vient de **Scalingo, pas de FGP**. Le proxy n'inspecte pas le path pour vérifier quelle base est visée, il forwarde avec le token dont il dispose.

Conséquence concrète pour le consommateur : cette réponse porte `X-FGP-Source: upstream` et le status choisi par la Database API, pas une erreur FGP en `X-FGP-Source: proxy`. La propriété de sécurité est réelle (un blob ne peut pas toucher une autre base), mais elle est garantie par la portée du token, pas par une vérification du proxy. Qui veut un refus côté FGP, avec la shape d'erreur FGP, doit passer par les **scopes** : c'est leur rôle.

**Erreurs propres au mode** (cf. §11.1.5 pour les échecs de credentials) :

| Status | Code | Condition |
|--------|------|-----------|
| 502 | `auth_addon_failed` | Exchange refusé, réponse non-2xx de l'API Scalingo, ou API injoignable pendant les étapes 1 ou 2 |

#### 11.1.3 Validité et rejet

Un blob dont l'`auth` est structurellement invalide (type inconnu, entrée vide, limite §5 dépassée) est rejeté au déchiffrement, donc en 401 `invalid_credentials`. Le proxy ne distingue pas un blob malformé d'un blob illisible, par principe de non-divulgation. Le 400 `invalid_auth_mode` reste réservé aux `auth` string de forme correcte mais non supportées par cette instance.

#### 11.1.4 Redaction des secrets d'auth

Les endpoints qui renvoient une configuration à l'utilisateur ne doivent jamais rendre un secret d'auth en clair. La règle s'applique à tous les secrets, pas seulement au champ `token` :

- **`POST /api/decode`** : le champ `auth` est renvoyé **redacté**. Pour un AuthSpec `headers`, chaque `value` est remplacée par `valueRedacted` (mêmes règles que `tokenRedacted` : seuls les 4 derniers caractères restent visibles). Les `name` sont conservés en clair, ce sont des noms de headers, pas des secrets. Pour un AuthSpec `scalingo-addon`, `app`, `addonId` et `apiUrl` sont conservés (identifiants d'infrastructure, déjà nécessaires pour ré-éditer la configuration), le token de compte reste couvert par `tokenRedacted`.
- **`POST /api/share/encode` et le partage `?c=`** : une URL de partage ne contient **aucun secret**. Pour un AuthSpec `headers`, seuls les `name` sont encodés, les `value` sont vidées. Le destinataire doit ressaisir les valeurs, exactement comme il doit ressaisir le token aujourd'hui.
- **Partage `?c=` et mode `scalingo-addon`** : l'URL de partage transporte uniquement le **mode et la région**. Ni `app`, ni `addonId`, ni `apiUrl` complet ne sont encodés. Ces identifiants ne sont pas des secrets au sens strict, mais mis bout à bout ils décrivent la topologie d'un compte Scalingo, et une URL de partage est faite pour circuler par mail ou par chat. Le destinataire resélectionne sa base avec son propre token.
- **Import d'une URL FGP existante** : les champs correspondant à une valeur redactée sont présentés vides, avec l'indication qu'ils doivent être ressaisis. FGP ne réutilise jamais une valeur redactée pour regénérer un blob.

#### 11.1.5 Échecs d'obtention des credentials upstream

Les modes Scalingo demandent des credentials à un tiers avant de pouvoir forwarder. Ces échecs ont désormais leurs propres codes, au lieu d'être confondus avec un problème réseau :

| Mode | Étape en échec | Code | Status |
|------|----------------|------|--------|
| `scalingo-exchange` | Échange du token de compte | `auth_exchange_failed` | 502 |
| `scalingo-addon` | Échange du token de compte ou obtention du token d'addon | `auth_addon_failed` | 502 |

`auth_exchange_failed` n'est pas un nom inventé pour l'occasion : c'est déjà la valeur du champ `reason` renvoyée par `POST /api/test-proxy` quand l'échange échoue pendant un test de configuration. Même sémantique, même nom, dans les deux surfaces. Cela évite un troisième vocabulaire pour la même défaillance, et cela met le test de configuration et le comportement réel du proxy d'accord.

Le status reste 502 : le client a présenté une clé et un blob valides, son scope est autorisé, c'est la passerelle qui n'a pas pu obtenir de quoi s'authentifier en aval. Un 401 laisserait croire au consommateur que sa propre authentification FGP est en cause, ce qui est faux et l'enverrait corriger la mauvaise chose.

Le comportement singleflight est inchangé : quand plusieurs requêtes concurrentes attendent le même exchange et qu'il échoue, toutes reçoivent la même erreur (cf. §9.2).

**Changement de contrat sur un mode existant** : jusqu'ici, un échec d'exchange en mode `scalingo-exchange` remontait en 502 `upstream_unreachable`, parce que l'exception était avalée par le `catch` du forward. Un consommateur qui teste `error === "upstream_unreachable"` verra désormais `auth_exchange_failed` dans ce cas précis. Le status HTTP, lui, ne change pas.

**Impact tests** : `tests/testi/proxy-edge-cases.test.ts` (cas « AC-8.4 singleflight propagates exchange error to all concurrent requests », autour de la ligne 236) assertait `error === "upstream_unreachable"` sur un exchange refusé. L'assertion doit passer à `auth_exchange_failed` ; le status 502, le header `X-FGP-Source: proxy` et le compteur d'exchange à 1 restent inchangés.

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

4. **Mode d'authentification** : comment le proxy doit s'authentifier auprès de l'API cible (Bearer token, Basic auth, Header custom, Headers multiples, Scalingo API, Scalingo Database API). Le formulaire affiche le bloc de saisie correspondant au mode choisi (cf. §12.7 et §12.8).

5. **Scopes** : patterns `METHOD:PATH` (un par ligne) dans un textarea. Pour le mode `scalingo-exchange`, un helper permet de charger la liste des apps Scalingo.

6. **Body filters** (optionnel) : pour les scopes POST/PUT/PATCH, un panel permet d'ajouter des body filters. Chaque filtre est configuré avec :
   - Le scope cible (sélectionné parmi les scopes éligibles)
   - Le dot-path du champ dans le body
   - Le type de filtre (exact, wildcard, string wildcard, not, and)
   - Les valeurs acceptées

7. **TTL** : choix de la durée de validité. Presets : 1h, 24h, 7j, 30j, personnalisé, pas d'expiration. Un warning est affiché quand "pas d'expiration" est sélectionné.

8. **Clé client** (optionnel) : par défaut FGP génère la clé. L'utilisateur peut fournir la sienne (cf. §12.9 et §15).

9. **Génération** (côté serveur, cf. ADR 0002) : `POST /api/generate` chiffre le blob et retourne `{url, key, blob}`.

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
- Les valeurs de headers d'authentification sont saisies en champ masqué et traitées comme le token : jamais réaffichées après génération, jamais incluses dans une URL de partage.
- Quand l'utilisateur fournit sa propre clé client, l'UI valide la longueur minimale avant l'appel et affiche l'avertissement de mutualisation (cf. §12.9).

### 12.7 Headers d'authentification multiples (copy)

Le bloc apparaît quand le mode « Headers multiples » est sélectionné. Il remplace le champ « Token / Clé API », qui n'a pas de sens dans ce mode.

| Élément | Texte |
|---------|-------|
| Option du sélecteur de mode | « Headers multiples » |
| Titre du bloc | « Headers d'authentification » |
| Aide du bloc | « Chaque header est envoyé tel quel à l'API cible, à chaque requête. Les valeurs sont des secrets : elles sont chiffrées dans le blob et ne sont plus affichées après la génération. » |
| Label nom | « Nom du header » |
| Placeholder nom | `X-API-Key` |
| Label valeur | « Valeur » |
| Placeholder valeur | « Secret envoyé à l'API cible » |
| Bouton ajout | « Ajouter un header » |
| Bouton suppression (aria-label) | « Supprimer ce header » |
| Note un seul header | « Avec un seul header, FGP utilise la forme compacte `header:{nom}`. Comportement identique, blob plus petit. » |

Messages d'erreur du bloc :

| Condition | Texte |
|-----------|-------|
| Nom vide | « Le nom du header est obligatoire. » |
| Nom invalide | « Nom de header invalide : ce caractère n'est pas autorisé dans un nom de header HTTP. » |
| Nom trop long | « Nom de header limité à 64 caractères. » |
| Valeur vide | « La valeur du header est obligatoire. » |
| Valeur trop longue | « Valeur limitée à 1024 caractères. » |
| Nom en doublon | « Ce header est déjà défini. » |
| Limite atteinte | « 8 headers maximum. » |
| Valeur redactée après import | « Valeur masquée à l'import : ressaisissez-la pour regénérer. » |

### 12.8 Scalingo Database API (copy)

Le bloc apparaît quand le mode « Scalingo Database API » est sélectionné. Le champ « Token / Clé API » reste affiché : c'est le token de compte Scalingo (`tk-us-...`).

Les deux modes Scalingo portent dans l'UI les noms utilisés par Scalingo lui-même : « Scalingo API » pour le mode historique (valeur `scalingo-exchange`) et « Scalingo Database API » pour le nouveau (valeur `scalingo-addon`). Seuls les libellés changent, aucune valeur stockée n'est touchée (cf. §11.1).

| Élément | Texte |
|---------|-------|
| Option du sélecteur de mode (mode historique) | « Scalingo API » |
| Option du sélecteur de mode (mode addon) | « Scalingo Database API » |
| Titre du bloc | « Base de données » |
| Aide du bloc | « Le consommateur ne voit jamais votre token de compte. L'accès est limité à cette base. » (86 caractères, capacité 118) |
| Label région | « Région » |
| Options région | « Paris (`osc-fr1`) », « SecNumCloud (`osc-secnum-fr1`) » |
| Aide région | « Détermine l'API interrogée : `https://api.<région>.scalingo.com`. » |
| Label application (visible) | « Application » |
| Placeholder application | `mon-app` |
| Bouton helper | « Charger les bases de données » |
| Label sélecteur de base (visible) | « Base de données » |
| Placeholder sélecteur | « Choisissez une base de données » |
| Lien vers le panneau Doc | « Comment fonctionne ce mode » (cf. §12.11) |
| Lien de retour depuis le panneau Doc | « Revenir à Base de données » (cf. §12.11) |
| Rappel URL cible | « Cible : `https://db-api.<région>.scalingo.com` » (voir la contrainte de largeur ci-dessous) |

#### Contraintes de largeur mesurées à 375 px

**Ligne « Cible »**. Le préfixe et l'URL se partagent 343 px. « Cible attendue : » en occupait 93 et l'URL, en police à chasse fixe, 253, soit 346 px pour 343 disponibles. Il manquait **3 pixels** et le navigateur coupait l'URL sur son tiret, ce qui donnait une adresse en deux morceaux, illisible et impossible à copier d'un geste.

Le préfixe passe donc à « Cible : », ce qui libère largement les 3 px manquants. L'URL est la partie incompressible, c'est le préfixe qui doit céder.

**Ce texte est écrit à deux endroits** et les deux doivent rester identiques :

- `src/ui/config/form-auth.tsx`, dans le JSX, pour le rendu au chargement ;
- `src/ui/client/addons.ts`, dans `syncRegion()`, qui le réécrit à chaque changement de région.

Reformuler l'un sans l'autre produit un texte qui change tout seul au premier clic sur une région, et le bug ne se voit pas au chargement de la page. Toute modification de cette ligne se fait aux deux endroits.

**Hint du bloc**. Le texte intégré mesurait 125 caractères pour 118 disponibles, et portait deux informations sans rapport : la garantie de périmètre et la disponibilité des suggestions d'applications. Seule la première est conservée, reformulée en 86 caractères.

La suggestion d'applications n'est pas remplacée ailleurs : le champ propose ses complétions dès qu'on le focalise après un chargement, et décrire une autocomplétion en toutes lettres coûte plus qu'elle n'apprend.

La formulation retenue dit **ce qui est vrai** : l'accès est limité à cette base, ce qui est une propriété du token obtenu, et non « une requête qui ne vise pas cette base est refusée », qui laisse croire que FGP filtre les requêtes. Il ne les filtre pas, c'est Scalingo qui refuse (§11.1.2). La nuance tient en un mot de moins et évite un contresens sur le rôle du proxy.

**Découpe** : le paragraphe qui détaillait le flow en trois temps sort du formulaire. L'échange de token, le renouvellement horaire et le fait que Scalingo refuse une requête visant une autre base sont des explications de mécanisme, elles vivent dans le panneau Doc (guide des modes d'auth, entrée « Scalingo Database API », qui les porte déjà). Sous un sélecteur, il reste la seule chose qui aide à choisir : ce que le consommateur de l'URL peut faire et ne peut pas faire. Le conseil « pour en ouvrir une autre, générez un second blob » rejoint le panneau Doc, il ne se lit pas au moment de sélectionner une base.

Le helper « Charger les bases de données » remplit l'identifiant d'addon automatiquement à partir de la réponse de l'API Scalingo. **Cet identifiant n'est jamais exposé dans le formulaire** : l'utilisateur choisit une base dans une liste lisible (nom du provider et plan), pas un identifiant technique. La saisie manuelle reste possible en repli quand le helper échoue.

Messages d'erreur du bloc :

| Condition | Texte |
|-----------|-------|
| Application vide | « Renseignez d'abord une application. » |
| Helper en cours | « Chargement des bases de données... » |
| Helper en échec (token, 401) | « Token refusé par Scalingo. Vérifiez votre token de compte. » |
| Helper en échec (application introuvable, 404) | « Application introuvable. Vérifiez le nom, il est sensible à la casse. » Le focus revient sur le champ « Application ». |
| Helper en échec (réseau ou API, 502) | « Impossible de récupérer les bases de données. Réessayez dans un instant. » |
| Aucune base sur l'app | « Cette application n'a aucune base de données. » |
| Aucune base sélectionnée | « Sélectionnez une base de données. » |
| Cible incohérente (warning, non bloquant) | « Cette cible ne ressemble pas à une Database API Scalingo. Vérifiez l'URL cible. » |

Messages affichés côté consommateur de l'URL, pour les deux modes Scalingo (réponses `X-FGP-Source: proxy`, à reprendre dans la doc et l'onglet Exemples) :

| Status | `error` | Mode concerné | Texte |
|--------|---------|---------------|-------|
| 502 | `auth_exchange_failed` | Scalingo API | « Impossible de s'authentifier auprès de Scalingo. » |
| 502 | `auth_addon_failed` | Scalingo Database API | « Impossible d'obtenir un token de base de données Scalingo. » |

#### API `POST /api/list-addons`

Helper appelé par le bouton « Charger les bases de données ». Modèle hybride des endpoints internes (cf. §8.3) : réponse au contrat FGP, jamais un forward transparent.

**Input** :

```json
{
  "token": "string",
  "app": "string",
  "target": "string (optionnel, apiUrl de la région)"
}
```

**Output** :

```json
{
  "addons": [
    {
      "id": "ad-1111-2222-3333",
      "provider": "PostgreSQL",
      "plan": "postgresql-starter-512"
    }
  ]
}
```

`id` alimente `addonId` dans le blob. `provider` et `plan` ne servent qu'à l'affichage de la liste et ne sont jamais stockés dans le blob.

| Status | `error` | Condition |
|--------|---------|-----------|
| 400 | `invalid_body` | Body invalide (token ou app manquant) |
| 401 | `token_exchange_failed` | Échange du token de compte refusé par Scalingo |
| 404 | `app_not_found` | Scalingo répond 404 sur l'application demandée |
| 502 | `upstream_unreachable` | API Scalingo injoignable |
| 502 | `upstream_list_addons_failed` | API Scalingo joignable mais réponse non-2xx, hors 404 sur l'application |

Le 404 `app_not_found` est volontairement séparé du 502 générique : c'est le seul cas où l'utilisateur peut corriger lui-même, et l'UI s'en sert pour pointer le champ fautif (cf. §8.3).

### 12.9 Clé client personnalisée (copy)

Section repliée (`<details>`) placée juste avant le bouton de génération, fermée par défaut : la génération automatique de la clé reste le chemin nominal.

**Activation** : il n'y a pas de choix explicite entre « générer » et « fournir ». Le champ fait foi, **un champ non vide vaut activation**. Un badge sur le résumé signale l'état actif quand une clé est saisie, y compris section repliée. Deux gestes pour une seule intention créeraient deux états capables de diverger.

#### Principe de découpe

Le formulaire ne garde que ce qui doit être lu **au moment de saisir**. Tout ce qui relève de la compréhension du mécanisme part dans le panneau Doc, entrée « Clé client » de « Infos sur les champs », qui le porte déjà. Le bloc passe ainsi d'environ treize lignes à trois.

Ce qui reste dans le formulaire, et pourquoi :

- **Le risque de mutualisation.** C'est la seule information dont l'ignorance coûte cher, et elle est irréversible une fois le blob généré. Une phrase, pas deux.
- **La contrainte de saisie.** Sans le minimum de 24 caractères, l'utilisateur découvre l'erreur au moment de générer.
- **Le comportement du champ vide.** C'est la question immédiate quand on ouvre un champ optionnel.

#### Copy

| Élément | Texte |
|---------|-------|
| Libellé de la section repliable | « Utiliser ma propre clé client » (29 caractères) |
| Badge d'état actif | « Active » (6 caractères), avec `aria-label="Clé personnalisée active"` |
| Label champ (visible) | « Clé personnalisée » |
| Placeholder champ | « 24 caractères minimum » |
| Bouton | « Générer une clé forte » |
| Avertissement (encadré) | « Réutiliser une clé lie les blobs : sa fuite rend déchiffrables tous ceux générés avec elle. » (91 caractères, capacité 99) |
| Aide sous le champ | « Laissez vide pour que FGP en génère une. » (40 caractères, capacité 52) |
| Label de la jauge | « Diversité » |
| Niveaux de la jauge | « faible », « moyenne », « élevée » (trois segments, trois niveaux) |
| Alerte clé dégénérée | « Cette clé contient très peu de caractères distincts. Préférez une clé aléatoire. » |
| Lien vers le panneau Doc | « En savoir plus sur la clé client » (cf. §12.11) |
| Lien de retour depuis le panneau Doc | « Revenir à Clé personnalisée » (cf. §12.11) |

Messages d'erreur du bloc, inchangés. Ils n'apparaissent qu'en cas d'erreur et ne pèsent donc pas sur la lecture nominale :

| Condition | Texte |
|-----------|-------|
| Clé trop courte | « 24 caractères minimum. » |
| Caractères invalides | « Caractères ASCII imprimables sans espace uniquement. » |
| Clé trop longue | « 256 caractères maximum. » |

#### Ce qui sort du formulaire, et où ça va

| Texte retiré | Destination |
|--------------|-------------|
| « Réservez la mutualisation aux secrets de CI, et prenez une clé longue et aléatoire. » | Panneau Doc, déjà couvert par l'explication de l'intérêt de la mutualisation |
| « La clé n'est jamais stockée : FGP ne peut ni la retrouver, ni la réinitialiser. Sans elle, le blob est inexploitable. » | Bloc de résultat, cf. §12.12 |
| « ASCII imprimable, sans espace » dans l'aide | Message d'erreur, qui s'affiche au moment exact où la règle est enfreinte |
| « La jauge mesure la variété des caractères saisis, pas la sécurité réelle de la clé. » | Panneau Doc, phrase à ajouter (ci-dessous) |

**Pourquoi retirer la phrase d'avertissement sur la jauge du formulaire.** Le mot « Diversité » a été choisi précisément pour que l'interface n'ait pas besoin de se dédire. Un libellé honnête doublé d'un avertissement expliquant qu'il est honnête, c'est de la ceinture avec des bretelles, et ça rallonge le bloc de trois lignes. La nuance reste utile mais elle relève de la documentation.

Phrase à ajouter à l'entrée « Clé client » du panneau Doc :

> « La jauge affichée sous le champ mesure la variété des caractères saisis. Elle repère une clé pauvre, par exemple une répétition, mais elle ne mesure pas la sécurité réelle : une phrase de passe en langue naturelle y ressort au maximum. »

#### Budget de caractères du résumé

Mesure du designer à 375 px : le libellé du `summary` et le badge disposent **ensemble de 40 caractères** pour tenir sur une ligne, avec une cible de sécurité à **36**. La formulation précédente en consommait 62, d'où le débordement constaté.

Le budget est dépensé côté libellé plutôt que côté badge, parce que le libellé est lu à chaque visite alors que le badge n'apparaît qu'une fois une clé saisie. Le sacrifice porte donc d'abord sur le badge, réduit à un seul mot.

| Élément | Avant | Après | Coût |
|---------|-------|-------|------|
| Libellé du `summary` | « Utiliser ma propre clé client (avancé) » | « Utiliser ma propre clé client » | 38 vers 29 |
| Badge | « Clé personnalisée active » | « Active » | 24 vers 6 |
| **Total** | 62 | **35** | sous la cible de 36 |

Ce qui est sacrifié, et pourquoi c'est le bon ordre :

- **« (avancé) »**, 9 caractères, est la coupe la moins coûteuse. Le marqueur disait « vous n'avez pas besoin de ceci », or la section est déjà repliée par défaut et l'aide interne dit « Laissez vide pour que FGP en génère une ». L'information est portée deux fois ailleurs.
- **Le badge** perd son contexte visuel mais le récupère à l'oral : `aria-label="Clé personnalisée active"` donne aux lecteurs d'écran la phrase complète, pendant que l'affichage se limite à « Active ». Le badge est de toute façon collé au libellé, donc « Utiliser ma propre clé client » suivi de « Active » se lit sans ambiguïté à l'écran.

#### Capacités de ligne mesurées à 375 px

Le budget de 40 caractères du résumé (ci-dessus) n'était que le premier. Le dev a mesuré la hauteur réelle du bloc après intégration : chaque texte tenait sur une ligne de plus que prévu, ce qui portait le bloc ouvert à 329 px au lieu des 240 visés. Ni la structure du designer ni la formulation n'étaient en cause isolément, c'est leur combinaison qui n'avait jamais été mesurée.

| Texte | Avant | Capacité | Après |
|-------|-------|----------|-------|
| Avertissement | 123 | 99 | 91 |
| Aide sous le champ | 63 | 52 | 40 |

**La capacité de l'avertissement est de 99 caractères, pas 116.** La première mesure portait sur la largeur du paragraphe, 309 px, sans voir qu'il est le second enfant d'un conteneur flex : l'icône de 16 px, le `gap` de 8 px et 16 px de padding sont prélevés sur cette même largeur. Le texte n'en reçoit que 269, soit 49 caractères par ligne et 99 pour tenir en deux.

À retenir pour les prochains encadrés : **la capacité d'un texte accompagné d'une icône n'est pas la largeur de son conteneur.** Mesurer la boîte du texte, pas celle du bloc.

Ce qui a été retiré :

- **« entre eux »** dans l'avertissement, 10 caractères. « Réutiliser une clé lie les blobs » porte déjà la réciprocité, le complément ne fait que la répéter.
- **« si elle fuite, tous ceux [...] deviennent [...] d'un coup »** resserré en « sa fuite rend déchiffrables tous ceux générés avec elle », 22 caractères de moins. La subordonnée devient un groupe nominal et « d'un coup » disparaît : « tous » porte déjà la simultanéité. Le complément « générés avec elle » est en revanche **conservé**, c'est lui qui limite la portée aux blobs concernés. Sans lui, la phrase se lit comme si tous les blobs de l'instance tombaient.
- **« 24 caractères minimum »** dans l'aide, 23 caractères. L'information est **déjà présente deux fois** : dans le placeholder du champ et dans le message d'erreur qui s'affiche si la règle est enfreinte. La dire une troisième fois au-dessus du champ coûtait une ligne entière.

**Toute reformulation de ces textes doit être remesurée.** Une phrase qui gagne trois mots reprend une ligne, et la contrainte ne se voit pas dans le markdown des specs.

**Repli si 35 déborde malgré tout en conditions réelles** : libellé « Ma clé client » (13) et badge inchangé, soit 19 caractères. On perd le verbe d'action, ce qui rend la section moins explicite sur ce qu'elle propose. Ne l'appliquer que sur mesure, pas par précaution.

#### Réserve sur « la clé n'est jamais stockée »

Le brief demandait de garder cette phrase dans le formulaire. Je la déplace, et voici pourquoi. Dans le champ BYOK, l'utilisateur **fournit** une clé qu'il détient déjà et qu'il a donc rangée quelque part : lui dire que FGP ne la mémorise pas ne change aucune de ses actions. L'information mord ailleurs, sur la clé **générée**, affichée une seule fois dans le bloc de résultat, où un utilisateur qui ferme l'onglet la perd définitivement.

Or ce bloc ne porte aujourd'hui **aucun avertissement** de ce genre, ce qui est un vrai manque (§12.12). Déplacer la phrase la met à l'endroit où elle protège quelqu'un.

### 12.10 Codes d'erreur dans le panneau Doc (copy)

Le panneau Doc ne documente aujourd'hui aucun code d'erreur, et ne mentionne nulle part `X-FGP-Source`. Un utilisateur qui reçoit un 403 n'a donc aucun moyen, depuis l'interface, de savoir si le refus vient de FGP ou de son API cible. C'est le contrat central de l'ADR 0006, et un en-tête dont personne ne connaît l'existence ne sert à rien.

#### Périmètre : les erreurs d'une URL générée, pas celles du formulaire

Cette section documente uniquement les erreurs **reçues en consommant une URL FGP**. Les erreurs de génération (`invalid_key`, `auth_limit_exceeded`, `blob_too_large` au moment de générer, limites de scopes) en sont **exclues** : elles sont déjà affichées en ligne, dans le formulaire, au moment exact où elles se produisent et à côté du champ fautif (§12.7, §12.8, §12.9). Les documenter une seconde fois ici créerait deux sources pour le même texte, qui divergeraient à la première correction.

#### Structure retenue

Nouvelle `<section>` dans l'onglet Doc, titre `<h3>` « Codes d'erreur », **placée juste après « Utilisation de l'URL »** et avant « Partage et import ». C'est l'ordre de lecture réel : on lit comment appeler l'URL, puis ce que signifie ce qu'on récupère.

La section se compose de trois blocs, dans cet ordre :

1. **« D'où vient l'erreur »**, toujours visible. C'est la partie que personne ne connaît, elle ne doit pas demander un clic pour exister.
2. **« Les erreurs de FGP »**, liste des codes, **repliée** dans un `<details>`. C'est une consultation ponctuelle, pas une lecture.
3. **« Tout le reste vient de votre API »**, toujours visible, deux phrases.

**Pourquoi replier le deuxième bloc et pas les autres.** Le panneau utilise déjà des sections repliables pour les quatre guides (scopes, body filters, modes d'auth, regex), le motif est donc établi et il suffit de le réutiliser. Il reste à justifier pourquoi on l'applique ici, et la raison est que les deux besoins sont de natures différentes : comprendre l'attribution d'une erreur est une notion, qui doit être vue sans action ; retrouver un code précis est un geste de recherche, qui suppose déjà de savoir ce qu'on cherche. Replier la notion la rendrait invisible, replier la liste ne coûte qu'un clic à qui la cherche. Les navigateurs actuels ouvrent d'eux-mêmes un `<details>` fermé lors d'une recherche dans la page, donc la liste reste trouvable au `Ctrl+F`.

**Pas de tableau.** Le panneau est latéral et étroit. Chaque code est une paire `<dt>` / `<dd>` sur le motif déjà utilisé par « Infos sur les champs » : le `<dt>` porte le code et son status, le `<dd>` porte la remédiation. Un tableau à colonnes déborderait ou se réduirait à des cellules d'un mot.

**Regroupement par remédiation, pas par status.** Les codes sont groupés selon ce que l'utilisateur doit corriger, parce que c'est la question qu'il se pose. Chaque entrée affiche quand même son status, donc la recherche par code ou par status fonctionne toujours.

#### Bloc 1 : « D'où vient l'erreur » (visible)

| Élément | Texte |
|---------|-------|
| Titre du bloc | « D'où vient l'erreur » |
| Intro | « Toute réponse renvoyée par le proxy porte l'en-tête `X-FGP-Source`. Il dit qui a répondu, avant même de regarder le status. » |
| Puce `proxy` | « `proxy` : c'est FGP qui a répondu. Le corps a la forme `{error, message}` et le code figure dans la liste ci-dessous. » |
| Puce `upstream` | « `upstream` : la réponse vient de votre API cible. FGP n'a touché ni au status ni au corps. Il ajoute seulement cet en-tête et retire `Set-Cookie`, le proxy étant sans état. Interprétez la réponse avec la documentation de cette API. » |
| Aide pratique | « Ajoutez `-i` à votre commande `curl` pour voir cet en-tête. » |

#### Bloc 2 : « Les erreurs de FGP » (replié)

| Élément | Texte |
|---------|-------|
| Libellé du `<summary>` | « Les erreurs de FGP » |
| Sous-titre du groupe 1 | « La clé ou le blob » |
| Sous-titre du groupe 2 | « Le périmètre du blob » |
| Sous-titre du groupe 3 | « FGP n'a pas pu joindre l'API cible » |
| Sous-titre du groupe 4 | « Anomalies » |

**Groupe 1, « La clé ou le blob »** :

| Code et status | Texte de remédiation |
|----------------|----------------------|
| `missing_key` (401) | « L'en-tête `X-FGP-Key` est absent de la requête. Sans la clé client, le blob ne peut pas être déchiffré. » |
| `invalid_credentials` (401) | « Le déchiffrement a échoué. La clé ne correspond pas à ce blob, le blob a été tronqué ou modifié, ou il a été généré sur une autre instance FGP. » |
| `blob_too_large` (414) | « Le blob dépasse 4 Ko. Réduisez le nombre de scopes, de body filters ou de headers d'authentification. Le mode en-tête ne contourne pas cette limite : elle porte sur la taille du blob, pas sur son transport. » |

**Groupe 2, « Le périmètre du blob »** :

| Code et status | Texte de remédiation |
|----------------|----------------------|
| `scope_denied` (403) | « La méthode ou le chemin demandé ne correspond à aucun scope du blob. Si des body filters sont configurés, le contenu de la requête peut aussi être en cause. La section « Tester un scope » rejoue le cas sans consommer d'appel. » |
| `token_expired` (410) | « Le TTL du blob est dépassé. Une URL expirée ne se prolonge pas, il faut en générer une nouvelle. » |
| `invalid_body` (400) | « Des body filters sont configurés mais le corps de la requête n'est pas du JSON valide. Vérifiez aussi que l'en-tête `Content-Type` vaut bien `application/json`, sinon la requête est refusée en `scope_denied`. » |

**Groupe 3, « FGP n'a pas pu obtenir de credentials ou joindre l'API cible »** :

| Code et status | Texte de remédiation |
|----------------|----------------------|
| Intro du groupe | « Ces trois erreurs sont les seules 502 produites par FGP. Toute autre 502 vient de votre API cible : vérifiez `X-FGP-Source` avant de conclure. » |
| `upstream_unreachable` (502) | « L'API cible n'a répondu à aucun moment : DNS, délai dépassé, connexion refusée ou erreur TLS. Vérifiez l'URL cible du blob. » |
| `auth_exchange_failed` (502) | « Mode Scalingo API : impossible de s'authentifier auprès de Scalingo. Le token de compte du blob est invalide ou révoqué, ou l'API d'authentification Scalingo est indisponible. » |
| `auth_addon_failed` (502) | « Mode Scalingo Database API : impossible d'obtenir un token de base de données. Le token de compte est invalide, ou il n'a pas accès à la base configurée dans ce blob. » |

**Groupe 4, « Anomalies »** : trois codes rares, regroupés en une seule entrée pour ne pas allonger la liste.

| Élément | Texte |
|---------|-------|
| Entrée unique | « `invalid_request` (400) quand l'URL ne contient pas de chemin après le blob, `invalid_auth_mode` (400) quand le mode d'authentification du blob n'est pas reconnu par cette instance, et `internal_error` (500) qui signale un bug de FGP et mérite un rapport. » |

#### Bloc 3 : « Tout le reste vient de votre API » (visible)

| Élément | Texte |
|---------|-------|
| Titre du bloc | « Tout le reste vient de votre API » |
| Texte | « Un code absent de cette liste n'a pas été produit par FGP. Un 401, un 404, un 429 ou un 500 portant `X-FGP-Source: upstream` sont la réponse de votre API cible : status et corps sont inchangés, seuls `X-FGP-Source` est ajouté et `Set-Cookie` retiré. FGP ne les reformule pas et ne les traduit pas : c'est ce qui vous permet de traiter les erreurs de votre API exactement comme si vous l'appeliez en direct. » |

#### Contraintes d'intégration

- Les trois messages Scalingo restent alignés sur ceux de §12.8. Une seule formulation pour les deux endroits, la remédiation en plus ici.
- Aucun tiret cadratin dans l'intégration, **entités HTML comprises** : pas de `&mdash;`. Utiliser deux-points, virgule, parenthèses ou point.
- Le `<details>` du bloc 2 n'a besoin d'aucun attribut ARIA supplémentaire, l'élément est nativement accessible. Il est fermé par défaut (pas d'attribut `open`).
- Le bloc 3 n'est pas un encadré d'alerte : c'est une explication, pas un avertissement. Même traitement visuel que les autres paragraphes de la section.

### 12.11 Liens vers le panneau Doc (libellés)

Plusieurs blocs du formulaire renvoient vers le panneau Doc pour le détail (§12.8, §12.9), et le changelog pourra le faire aussi. Ces liens ont besoin d'une convention, sinon chaque intégration inventera la sienne.

**Répartition** : le **mécanisme** relève du designer, la **formulation** de moi. Le mécanisme est tranché, ce qui suit est définitif.

#### Mécanisme retenu (rappel, spécifié par le designer)

- Le lien **bascule l'onglet actif**, il ne navigue pas. Aucun hash n'est écrit dans l'URL : `share-config.ts` y écrit déjà l'état du formulaire via `replaceState`, et deux écritures concurrentes mettraient le partage en risque.
- Le focus se déplace vers la section de destination, qui porte `tabindex="-1"` et un `aria-labelledby` pointant vers son `dt` existant. À l'arrivée, un lecteur d'écran annonce par exemple « Clé client, groupe ».
- Un **lien de retour** est nécessaire et visible, pas seulement au clavier : sur mobile le déplacement mesuré atteint 4499 px. Chaque élément porte un `data-return-label` transportant le libellé du champ d'origine.

#### Convention de libellé

Trois formes, selon le sens du déplacement :

| Origine | Forme | Exemples |
|---------|-------|----------|
| Un champ ou un bloc du formulaire | « En savoir plus sur {sujet} » | « En savoir plus sur la clé client », « Comment fonctionne ce mode » |
| Le changelog | « Voir {section} dans la doc » | « Voir Codes d'erreur dans la doc » |
| Le retour, depuis le panneau Doc | « Revenir à {label du champ} » | « Revenir à Clé personnalisée », « Revenir à Base de données » |

Le libellé de retour cite le label du champ **tel qu'il est affiché, majuscule comprise**, et sans article. La majuscule signale que c'est une citation d'un élément de l'interface et non une tournure de phrase, ce qui est exactement ce qui rend le retour identifiable quand plusieurs renvois coexistent sur la page. C'est la valeur transportée par `data-return-label`.

Trois règles, dans l'ordre d'importance :

1. **Le libellé nomme sa destination.** Jamais « cliquez ici », jamais « en savoir plus » seul, jamais « revenir au formulaire ». Un lecteur d'écran peut lister les liens d'une page hors de leur contexte : un libellé qui ne dit pas où il mène devient inutilisable dans cette liste, et il y en aura plusieurs identiques sur la même page. C'est la règle qui impose la forme du retour : dès qu'il y a deux renvois, « Revenir au formulaire » ne distingue plus rien.
2. **Le sujet reprend le mot du label du champ**, en minuscule à l'aller, tel quel au retour. Le lien placé sous « Clé personnalisée » parle de « la clé client », pas de « BYOK » ni de « la génération de clé ». L'utilisateur doit reconnaître ce qu'il vient de lire.
3. **Pas de formulation de navigation externe.** Le lien bascule d'onglet sans quitter la page : il ne dit ni « ouvrir », ni « aller à », ni « consulter la documentation », qui laissent croire à un départ. « En savoir plus sur », « Voir » et « Revenir à » conviennent.

### 12.12 Bloc de résultat : la clé n'est affichée qu'une fois

**Manque constaté.** Le bloc de résultat affiche l'URL, la clé et le blob, sans **aucun** avertissement indiquant que la clé n'est montrée qu'une seule fois et que FGP ne peut pas la redonner. Un utilisateur qui ferme l'onglet perd l'accès à tous les blobs générés avec cette clé, définitivement, sans avoir été prévenu.

C'est le bon endroit pour cette information, et c'est la destination du texte retiré du champ BYOK (§12.9) : dans le champ, l'utilisateur fournit une clé qu'il détient déjà, ici il en reçoit une qu'il est seul à détenir.

| Élément | Texte | Condition d'affichage |
|---------|-------|-----------------------|
| Avertissement sous le champ clé | « Notez cette clé maintenant : FGP ne la stocke pas et ne pourra pas vous la redonner. Sans elle, l'URL est inexploitable. » | Uniquement quand la clé a été **générée par le serveur** |
| Variante clé fournie | « Cette clé est celle que vous avez fournie. FGP ne la stocke pas. » | Uniquement quand l'utilisateur a fourni sa propre clé |

La distinction n'est pas cosmétique : « notez cette clé maintenant » adressé à quelqu'un qui vient de la coller depuis son coffre est un bruit qui décrédibilise les avertissements suivants.

Traitement visuel : même registre que l'avertissement de mutualisation, pas plus fort. C'est une consigne, pas une alerte de sécurité.

---

## 13. Limites et non-goals (v4)

- **Pas de révocation** : une URL FGP ne peut pas être révoquée avant son TTL. La seule solution est de révoquer le token sous-jacent.
- **Pas de logging centralisé** : les requêtes passent par le proxy mais ne sont pas logguées dans un système externe. Seul le stdout du serveur est disponible.
- **Pas de rate limiting propre** : pas de quotas par URL, seulement la propagation du 429 upstream.
- **Pas de WebSocket** : seules les requêtes HTTP classiques sont proxyfiées.
- **Cache bearer uniquement pour Scalingo** : le cache du bearer (singleflight) est spécifique au mode `scalingo-exchange`. Les autres modes ne cachent rien.
- **Body filters JSON uniquement** : seul le JSON est supporté pour le filtrage du body. Les form-data, multipart, etc. ne sont pas filtrés.
- **Body filter `regex`** : le type `regex` est implémenté via `new RegExp(value).test(bodyValue)`. La regex est validée au déchiffrement du blob (regex invalide = blob rejeté).
- **Un seul addon par blob en mode `scalingo-addon`** : pas de liste, pas de wildcard d'app, pas de résolution dynamique depuis le path. Le multi-addon est écarté tant qu'une recette sur un vrai compte Scalingo n'a pas levé l'ambiguïté d'identifiant (cf. §11.1.2).
- **Pas de rotation de clé client** : changer la clé d'un blob impose de le regénérer. FGP ne connaît pas la clé et ne peut pas rechiffrer un blob existant.
- **Pas de valeurs dynamiques dans les headers d'auth** : les valeurs sont statiques, figées au moment de la génération. Pas de templating, pas de variables d'environnement, pas d'interpolation depuis la requête entrante.
- **Pas de `/llms-full.txt` ni de `/robots.txt`** : un seul document `/llms.txt` (cf. §16).
- **Aucun secret d'auth n'est récupérable** : ni `token`, ni les valeurs de headers ne sont réaffichables après génération. Les endpoints de décodage renvoient des valeurs redactées (cf. §11.1.4).

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

### 14.4 Schéma blob : ajout du champ `logs`

Ajout d'un champ optionnel `logs` au `BlobConfig`, **sans bump de version** (v3 reste v3) :

```typescript
interface BlobConfig {
  v: 2 | 3 | 4;
  token?: string;
  target: string;
  auth: string | AuthSpec;
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
- Aucun bump de version de blob : v3 reste v3. Le champ `logs` est un **additif non-cassant** décorrélé du versioning du format. Il s'applique de la même façon à un blob v4.
- À la génération d'un blob depuis l'UI, le champ `logs` n'est inclus que si l'utilisateur a explicitement coché une case dans l'onglet « Logs ». Sinon il est omis (blob identique à aujourd'hui).

### 14.5 Identification serveur d'un blob

Le serveur a besoin de scoper les buffers et les streams par blob, sans être capable de reconstruire le blob ou son contenu. Clé utilisée :

```
blobId = SHA-256(blob_base64url).slice(0, 16)   // 16 chars hex = 64 bits
```

Cette empreinte est calculée à partir du blob chiffré brut (le ciphertext base64url), pas du contenu déchiffré. Elle est non réversible et identique entre deux requêtes portant le même blob : suffisant pour router un ring buffer et un topic pub/sub, insuffisant pour retrouver la clé client ou le contenu.

### 14.6 Types de logs et contenu

Le schéma des events est discriminé par le champ `type`.

**Event `network`**, capturé pour chaque requête proxy quand `logs.enabled` :

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

**Event `detailed`**, capturé en plus du network, uniquement si `logs.detailed` et content-type JSON non-multipart :

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
| `truncated` | `true` si le body gzippé dépasse `FGP_LOGS_DETAILED_MAX_KB` : le body est alors **entièrement omis** (pas de troncature partielle, qui fausserait un déchiffrement), le champ `bodyEncrypted` est omis et seul le flag `truncated: true` subsiste. |

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

1. Le proxy lit le body request (déjà disponible pour le matching body filters, cf. section 11.5).
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

Ces deux headers sont exactement ceux du mode header du proxy, et c'est pour cette raison que `/logs` et `/logs/*` sont exclus de ce mode (§7.3). Sans cette exclusion, la requête d'ouverture du stream serait forwardée vers l'API cible au lieu d'atteindre FGP.

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

**Page `/logs`, formulaire d'auth initial** :

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
| État connecté | « Connecté, en attente d'événements » |
| Bouton déconnexion | « Se déconnecter » |

**Vue stream** :

| Élément | Texte |
|---------|-------|
| Section network | « Requêtes » |
| Section detailed | « Bodies détaillés » |
| Badge reconnexion | « Reconnexion... » |
| Info buffer vide | « Aucun événement pour l'instant. Les requêtes apparaîtront ici en direct. » |
| Info detailed non activé | « Les bodies détaillés ne sont pas activés pour ce blob. Activez-les dans l'onglet Logs de votre configuration. » |
| Indicateur truncated | « Body trop volumineux, non stocké » |
| Erreur déchiffrement body | « Déchiffrement impossible : vérifiez votre clé » |

**Onglet « Logs » dans la page de configuration** :

| Élément | Texte |
|---------|-------|
| Titre onglet | « Logs » |
| Intro | « Activez la capture in-memory des requêtes passant par ce blob. Les logs sont visibles uniquement via `/logs` et ne sont jamais persistés. » |
| Toggle principal | « Activer les logs pour ce blob » |
| Aide toggle principal | « Chaque requête est journalisée en mémoire (méthode, chemin, status, durée, IP tronquée) pendant quelques minutes. » |
| Toggle detailed | « Capturer aussi les bodies détaillés (POST/PUT/PATCH JSON) » |
| Aide toggle detailed | « Le body request est compressé puis chiffré avec votre clé client avant d'être stocké. Le serveur ne peut pas le lire. Multipart exclu. » |
| Warning detailed | « Activez uniquement si vous avez besoin d'inspecter les payloads. Le body peut contenir des informations sensibles, n'ouvrez `/logs` que sur un poste de confiance. » |
| Lien vers /logs | « Ouvrir la console `/logs` » |
| Feature off globalement | « Les logs sont désactivés sur cette instance FGP. Contactez l'administrateur pour activer `FGP_LOGS_ENABLED`. » |

**Messages d'erreur SSE** (réponses `X-FGP-Source: proxy` côté `/logs/stream`, shape `{error, message}`) :

| Status | `error` | Condition | Message UI |
|--------|---------|-----------|------------|
| 400 | `invalid_request` | `since` présent mais non parsable | « Paramètre de reconnexion invalide. » |
| 401 | `missing_key` | Header `X-FGP-Blob` ou `X-FGP-Key` manquant | « Blob ou clé absent, veuillez ressaisir. » |
| 401 | `invalid_credentials` | Déchiffrement du blob échoué | « Blob ou clé invalide : impossible de déchiffrer. » |
| 403 | `logs_not_enabled` | Blob valide mais `logs.enabled !== true` | « Les logs ne sont pas activés pour ce blob. Activez-les dans la configuration avant de réessayer. » |
| 404 | (route absente) | `FGP_LOGS_ENABLED` off ou absent | « Les logs sont désactivés sur cette instance. » |
| 409 | `logs_stream_conflict` | Un autre stream est déjà ouvert pour ce blob | « Un flux de logs est déjà actif pour ce blob. Fermez l'autre onglet avant de réessayer. » |
| 410 | `token_expired` | TTL du blob dépassé | « Ce blob est expiré. » |
| 414 | `blob_too_large` | Blob > 4 KB | « Blob trop volumineux. » |

L'UI lit `error` pour router l'affichage.

---

## 15. Clé client personnalisée (BYOK)

### 15.1 Principe

Par défaut, `POST /api/generate` tire la clé client au hasard côté serveur et la retourne dans la réponse. Un appelant peut désormais **fournir sa propre clé** via un champ optionnel `key` du body. Elle est alors utilisée telle quelle pour dériver la clé de chiffrement du blob, et renvoyée à l'identique dans la réponse.

Cas d'usage principal : un pipeline CI qui utilise plusieurs URLs FGP et ne veut gérer qu'un seul secret dans son coffre, au lieu d'une clé par blob.

Le comportement par défaut est **inchangé** : sans champ `key`, FGP génère la clé.

### 15.2 Contrat API

```
POST /api/generate
{
  "token": "...",
  "target": "https://api.example.com",
  "auth": "bearer",
  "scopes": ["GET:/v2/resources/*"],
  "ttl": 3600,
  "key": "ma-cle-de-ci-tres-longue-et-aleatoire"
}
```

Réponse 200 : `{ "url": "...", "key": "...", "blob": "..." }`. Le champ `key` reflète la clé effectivement utilisée : celle fournie, ou celle générée.

| Status | `error` | Condition |
|--------|---------|-----------|
| 400 | `invalid_key` | `key` fourni mais non conforme aux contraintes §15.3 |
| 400 | `auth_limit_exceeded` | L'AuthSpec dépasse une limite §5 |

### 15.3 Contraintes sur la clé

| Contrainte | Valeur | Raison |
|------------|--------|--------|
| Longueur minimale | 24 caractères | Résistance au brute-force hors ligne (cf. §15.4) |
| Longueur maximale | 256 caractères | Borne de sécurité, la clé transite en header HTTP |
| Caractères autorisés | ASCII imprimables `0x21` à `0x7E` | La clé est transmise dans le header `X-FGP-Key` : ni espace, ni caractère de contrôle, ni non-ASCII |
| Normalisation | Trim des espaces en début et fin avant validation | Un copier-coller avec retour à la ligne ne doit pas produire une clé inutilisable, et HTTP retire de toute façon ces espaces en transit |
| Chaîne vide | Refusée, comme toute clé trop courte | `key: ""` n'est **pas** traité comme un champ absent (cf. §15.3.1) |

#### 15.3.1 Pourquoi `key: ""` est un refus et non un défaut

Un champ `key` absent signifie « génère-la pour moi ». Une chaîne vide signifie « voici ma clé », et cette clé ne vaut rien. Les deux ne doivent pas se confondre.

Le cas se produit tout le temps en CI : une variable non définie ne disparaît pas du payload, elle s'y retrouve interpolée en chaîne vide. Traiter ce cas comme une absence produirait un blob parfaitement valide, chiffré avec une clé aléatoire que le pipeline ne connaît pas et n'a jamais reçue en retour, donc inutilisable au premier appel. L'erreur serait découverte loin de sa cause.

`key: ""` (ou une clé qui ne contient que des espaces, puisque le trim s'applique avant validation) est donc refusé avec 400 `invalid_key`, exactement comme une clé de 3 caractères. Le pipeline échoue à la génération, avec un message qui pointe la bonne variable.

La clé validée après trim est celle qui est utilisée pour la dérivation **et** celle qui est renvoyée dans la réponse. FGP ne fait aucune autre transformation (pas de normalisation Unicode, pas de changement de casse).

**La longueur maximale se valide, elle ne se tronque pas.** Le champ de saisie ne doit porter aucun `maxlength` : un navigateur qui coupe silencieusement une clé collée trop longue produit un blob chiffré avec une clé que l'utilisateur n'a jamais eue, et l'erreur ne se manifeste qu'au premier appel proxy, loin de sa cause. La borne de 256 est vérifiée explicitement, côté client comme côté serveur, et rejetée avec un message. C'est la seule façon de rendre « 256 caractères maximum. » réellement atteignable.

La clé générée par défaut reste un `crypto.randomUUID()` (36 caractères). Le bouton « Générer une clé forte » de l'UI produit 32 caractères base64url tirés de `crypto.getRandomValues` (192 bits d'entropie).

### 15.4 Pourquoi 24 caractères minimum

La clé de chiffrement du blob est dérivée par `PBKDF2(clé client + salt serveur, 100 000 itérations, SHA-256)`. Le salt serveur est **public** : il est exposé par `GET /api/salt`, parce que le client en a besoin pour déchiffrer les bodies détaillés de `/logs`. La seule inconnue protégeant un blob est donc la clé client.

Conséquence : un attaquant qui détient un blob (une URL FGP interceptée dans un log, un historique shell, un ticket) peut tenter un brute-force **hors ligne**, sans passer par le proxy et sans être limité par un quelconque rate limit. Les 100 000 itérations PBKDF2 renchérissent chaque essai, mais ne sauvent pas une clé courte ou devinable.

Le risque est amplifié par la mutualisation, et c'est le point à faire comprendre à l'utilisateur : **une clé partagée entre N blobs, ce sont N blobs qui tombent ensemble**. Le jour où la clé fuite ou est cassée, tout ce qui a été généré avec elle devient déchiffrable, y compris les blobs créés avant la fuite et encore valides.

24 caractères est un plancher, pas une cible. La recommandation reste une clé **aléatoire**, pas une phrase mémorisable : 24 caractères tirés au hasard, c'est hors de portée ; 24 caractères de phrase française, c'est beaucoup moins.

### 15.5 Ce que la mutualisation ne change pas

Partager une clé entre plusieurs blobs ne partage **pas** les autorisations. Chaque blob garde ses propres scopes, son propre TTL et sa propre cible. La mutualisation ne concerne que la confidentialité : elle mutualise le risque de déchiffrement, pas les droits d'accès. Un blob read-only reste read-only, même si sa clé sert aussi à un blob plus permissif.

---

## 16. Documentation pour les agents LLM (`/llms.txt`)

### 16.1 Objectif

Exposer une description de FGP directement consommable par un agent LLM, à une adresse conventionnelle (convention [llmstxt.org](https://llmstxt.org)). Objectif fonctionnel : qu'un agent puisse générer une URL FGP correcte et interpréter une erreur FGP **sans lire l'interface HTML ni deviner le format des scopes**.

### 16.2 Contrat HTTP

| Aspect | Valeur |
|--------|--------|
| Route | `GET /llms.txt` |
| Status | 200, toujours. Pas d'authentification, pas de kill switch. |
| `Content-Type` | `text/markdown; charset=utf-8` |
| `Cache-Control` | `public, max-age=3600` |
| Contenu | Identique pour tous les appelants. La seule donnée d'instance est l'origine publique, utilisée pour construire les liens absolus. |

Le document ne divulgue **aucune** configuration : pas de blob, pas de scope existant, pas de cible, pas de salt, pas d'état de la feature logs.

La route n'est pas exclue du mode blob par header : une requête portant `X-FGP-Blob` sur `/llms.txt` est proxyfiée vers la cible, comme n'importe quel autre chemin en mode header. C'est le comportement attendu, pas un bug à corriger. Le seul chemin exclu du mode header est `/logs*`, et pour une raison précise qui ne s'applique pas ici (§7.3).

### 16.3 Structure du document

Conforme à la convention : un titre H1, un blockquote de résumé, un bloc de prose, puis des sections H2 composées uniquement de listes de liens `[nom](url): description`.

```markdown
# Fine-Grained Proxy (FGP)

> Stateless, API-agnostic HTTP proxy that adds fine-grained tokens (scoped by
> HTTP method, path and request body) in front of any API. No storage: the
> target, credentials, scopes and TTL live encrypted inside the token itself.

<prose : concepts, syntaxe des scopes, modes d'auth, body filters, codes
d'erreur, exemples curl ; sans titres, listes et blocs de code autorisés>

## Documentation

- [OpenAPI spec](https://.../api/openapi.json): machine-readable API contract
- [Swagger UI](https://.../api/docs): interactive API documentation

## Resources

- [README](https://github.com/lsagetlethias/fine-grained-proxy): project overview and self-hosting
```

La convention interdit les titres dans le bloc de prose. Le contenu de fond (scopes, auth, erreurs) vit donc dans ce bloc unique, sous forme de listes et de blocs de code, et les sections H2 restent des listes de liens. C'est ce qui permet à un parseur llms.txt naïf de continuer à fonctionner.

### 16.4 Contenu attendu

- Ce qu'est FGP et ce qu'il n'est pas (proxy transparent, zero storage, deny-all par défaut).
- Le format de l'URL et des headers `X-FGP-Key` / `X-FGP-Blob`.
- La syntaxe des scopes `METHOD:PATH`, les wildcards et la règle deny-all.
- Les six modes d'authentification.
- Les body filters : types d'`ObjectValue` et sémantique AND/OR.
- Les codes d'erreur FGP et la distinction `X-FGP-Source: proxy` / `upstream`.
- Deux ou trois exemples `curl` complets (génération via `/api/generate`, appel proxyfié en mode URL, appel proxyfié en mode header).
- Les liens vers `/api/openapi.json`, `/api/docs` et le README GitHub.

**Langue** : le document est rédigé en **anglais**, comme la spec OpenAPI, les codes et les messages d'erreur de l'API. L'audience est l'outillage, pas l'utilisateur final francophone.

**Taille cible** : moins de 8 KB. Au-delà, on tronque le contenu de fond au profit des liens : un agent qui a besoin du détail va chercher l'OpenAPI.

### 16.5 Découverte

Deux mécanismes complémentaires :

1. **Balise HTML** dans le `<head>` des pages servies par FGP (`/` et `/logs`) :

```html
<link rel="describedby" type="text/markdown" href="/llms.txt">
```

2. **Header HTTP** équivalent sur les réponses HTML générées par FGP :

```
Link: </llms.txt>; rel="describedby"; type="text/markdown"
```

Le header n'est posé **que** sur les réponses HTML produites par FGP. Il n'est jamais ajouté aux réponses forwardées depuis l'API cible : ce serait une transformation de réponse upstream, interdite par l'ADR 0006 (cf. §8.1).

### 16.6 Non-goals

- Pas de `/llms-full.txt` : un seul document, tenu court. La version exhaustive, c'est l'OpenAPI.
- Pas de `/robots.txt` pour l'instant : décision différée, hors scope de ce lot.
- Pas de contenu dépendant de l'instance au-delà de l'origine : le document est un document produit, pas un dump de configuration.

---

## 17. En-têtes de sécurité HTTP

### 17.1 Périmètre

Les en-têtes de sécurité sont posés sur une **liste explicite de chemins servis par FGP** : `/`, `/healthz`, `/static/*`, `/logs*`, `/api/*`, `/llms.txt`. Cette liste est centralisée côté code dans `FGP_OWNED_PATHS` (`src/constants.ts`).

S'y ajoutent **les erreurs générées par FGP sur la route proxy**, celles qui portent `X-FGP-Source: proxy` (400, 401, 403, 410, 414, 500, 502). Une erreur FGP reste une réponse FGP, même renvoyée depuis `/{blob}/*`, et elle est distinguable sans ambiguïté par ce header.

Ils ne sont **jamais** ajoutés aux réponses forwardées depuis l'API cible (`X-FGP-Source: upstream`, en mode URL comme en mode header). Ajouter un header à une réponse upstream serait une transformation, ce que l'ADR 0006 interdit : le contrat de transparence prime sur le durcissement. Un consommateur qui veut ces en-têtes sur les réponses de son API les configure sur son API.

**Le middleware n'est jamais monté sur `*`.** C'est une contrainte d'implémentation, pas un détail de style : monté sur la liste explicite, il ne traverse jamais la route proxy, et la transparence de l'ADR 0006 est garantie **par construction**. Montée sur `*` avec une exclusion conditionnelle, elle ne serait plus garantie que par la justesse de la condition, sur l'invariant le plus fragile du produit. Sur ce point précis, la construction prime sur la vérification.

**Alternative rejetée, et pourquoi elle ne marche pas** : utiliser `X-FGP-Source` comme unique discriminant (poser les en-têtes partout sauf sur `upstream`) semble plus élégant et supprimerait la liste. La prémisse est fausse : ce header n'est pas posé sur toutes les réponses FGP, seulement par le proxy et par les erreurs FGP. Relevé sur l'instance :

| Requête | Status | `X-FGP-Source` | En-têtes posés |
|---------|--------|----------------|----------------|
| `GET /llms.txt` | 200 | absent | 6/6 |
| `GET /llms.txt` avec `X-FGP-Blob` | 200 | `upstream` | 0/6 |
| `GET /logs/health` avec `X-FGP-Blob` | 200 | `proxy` | 6/6 |

Un critère exigeant `X-FGP-Source: proxy` laisserait donc la page d'accueil, `/llms.txt` et les réponses nominales de l'API entièrement découvertes, comme le montre la première ligne. Et le critère inverse, tout sauf `upstream`, impose le middleware global qu'on vient d'écarter.

**Comment la liste reste à jour** : pas par la vigilance humaine. Un test de recensement énumère les routes réellement enregistrées sur l'application Hono et vérifie que chacune est couverte (AC-41.9). Une route ajoutée sans être inscrite fait échouer la suite. C'est ce test qui rend la liste explicite tenable dans la durée.

### 17.2 En-têtes posés

Dans le tableau ci-dessous, « toutes les réponses FGP » désigne exactement le périmètre défini en §17.1, pas l'ensemble du trafic qui traverse le proxy.

| Header | Valeur | Portée |
|--------|--------|--------|
| `X-Content-Type-Options` | `nosniff` | Toutes les réponses FGP |
| `Referrer-Policy` | `no-referrer` | Toutes les réponses FGP. Empêche une page FGP de divulguer sa propre URL, `?c=` de partage compris, quand l'utilisateur suit un lien sortant. |
| `X-Frame-Options` | `DENY` | Toutes les réponses FGP |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | Toutes les réponses FGP |
| `Cross-Origin-Opener-Policy` | `same-origin` | Toutes les réponses FGP |
| `Cross-Origin-Resource-Policy` | `same-origin` | Toutes les réponses FGP |
| `Permissions-Policy` | Toutes les fonctionnalités du navigateur désactivées (`geolocation=()`, `camera=()`, `microphone=()`, etc.) | Toutes les réponses FGP. FGP n'a besoin d'aucune API navigateur privilégiée. |
| `Content-Security-Policy` | `default-src 'none'` et allowlist explicite : `script-src 'self'`, `style-src 'self'`, `img-src 'self' data:`, `font-src 'self'`, `connect-src 'self'`, `form-action 'self'`, `frame-ancestors 'none'`, `base-uri 'none'`, `object-src 'none'` | Pages HTML FGP, sauf `/api/docs` qui a la sienne (cf. §17.3) |
| `Cache-Control` | `no-store` | `/api/generate`, `/api/decode`, `/api/salt`, `/logs/stream` : réponses qui portent ou dérivent des secrets |

Le `default-src 'none'` est volontaire : on autorise explicitement ce dont l'UI a besoin, plutôt que de partir de `'self'` et d'espérer que rien ne dépasse.

L'UI ne contient aucun script ni style inline : la CSP passe sans `unsafe-inline`. **Toute future modification de l'UI doit conserver cette propriété.** Un `<script>` inline casserait la CSP, et la contourner avec `unsafe-inline` viderait la mesure de son sens.

**Effet visible** : l'interface FGP ne peut plus être affichée dans une iframe (`frame-ancestors 'none'` et `X-Frame-Options: DENY`). C'est assumé : une page qui manipule des tokens et des clés n'a rien à faire dans le cadre d'un tiers.

**Ce que `Referrer-Policy` ne protège pas** : les URLs proxy `/{blob}/...` en mode URL. Le blob est dans le chemin, mais la réponse qui l'accompagne vient de l'upstream et ne peut pas être touchée (§17.1). Le header n'est présent que sur les erreurs FGP de cette route, jamais sur une 2xx forwardée. Protéger un blob présent dans une URL reste la responsabilité de l'appelant, et la vraie réponse est le **mode header** `X-FGP-Blob`, qui sort le blob de l'URL. Ne pas justifier ces en-têtes par la protection du blob dans l'URL : ce n'est pas ce qu'ils font.

### 17.3 Cas particulier `/api/docs`

Swagger UI charge ses assets depuis un CDN externe et pose un script inline non nonçable. La CSP de §17.2 le casserait. Cette route reçoit donc une **CSP dédiée**, plus permissive mais toujours explicite : `script-src` et `style-src` limités à `'self'`, `'unsafe-inline'` et l'origine du CDN, `img-src` et `font-src` étendus à cette même origine. Tout le reste (dont `frame-ancestors 'none'` et `default-src 'none'`) est conservé.

`/api/docs` n'est jamais servie sans CSP. La cible à terme reste l'auto-hébergement des assets Swagger dans `/static/`, ce qui permettrait de lui appliquer la CSP commune et de supprimer la dépendance à un CDN tiers. C'est un chantier séparé, non bloquant pour ce lot.
