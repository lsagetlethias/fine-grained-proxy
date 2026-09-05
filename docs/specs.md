# Spécifications fonctionnelles : Fine-Grained Proxy (FGP)

**Version** : 5.0
**Date** : 2026-09-04
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
| v5 | Query filters : un `ScopeEntry` accepte `queryFilters`, un axe de contrainte sur les paramètres de query, opt-in et à déni par défaut à l'intérieur du scope qui le porte (§19) |

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
  queryFilters?: QueryFilter[];  // v5, cf. §19
}
```

Un ScopeEntry permet d'attacher des body filters et/ou des query filters à un scope. Sans `bodyFilters` ni `queryFilters`, il se comporte comme un scope string. Les deux axes sont indépendants : un ScopeEntry peut porter l'un, l'autre, les deux, ou aucun. Le détail des query filters, sa sémantique de déni par défaut et ses limites font l'objet du §19 ; cette section ne fait qu'annoncer le champ, à l'image de la façon dont `bodyFilters` est annoncé ici et détaillé en §4.

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
   c. Si `queryFilters` présents : évaluer l'axe query selon la sémantique du §19.2. Si l'axe query échoue (paramètre non déclaré, requis absent, valeur non couverte, ou occurrences en surnombre) → ce scope ne matche pas, passer au suivant.
   d. Si pas de `bodyFilters` → accès autorisé (sous réserve que c. ait passé)
   e. Si `bodyFilters` présents : le body B doit être du JSON. Tous les body filters doivent matcher (AND). Si un filtre échoue → ce scope ne matche pas, passer au suivant.

L'axe query et l'axe body sont indépendants et tous deux en AND avec méthode et chemin : un ScopeEntry qui porte les deux doit satisfaire les quatre pour matcher. Aucun ordre d'évaluation n'est imposé au proxy entre c. et e., les deux étant sans effet de bord ; le testeur de scopes en revanche a intérêt à évaluer l'axe le moins coûteux en premier pour produire un diagnostic rapide (cf. §12.5).

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

### Limites des query filters (v5)

Détail complet, justification chiffrée et articulation avec les budgets d'ADR-0010 dans `docs/limits.md`. Résumé :

| Limite | Valeur | Justification |
|--------|--------|----------------|
| `queryFilters` par ScopeEntry | 8 max | Même plafond que les body filters, même raison : au-delà, scinder en plusieurs scopes |
| Valeurs OR par query filter | 16 max | Même plafond que les body filters, même union `ObjectValue` |
| Occurrences d'un paramètre répété, évaluées par requête | 4 max si le filtre contient une valeur `regex`, 64 max sinon | Nouveau : un paramètre répété multiplie les évaluations à la charge de l'appelant, pas de l'auteur du blob. Palier déterminé une fois au déchiffrement. Au-delà, ce filtre échoue (fail-closed) |
| Type `any` sur un query filter | `string` uniquement | Une valeur de query est toujours une chaîne sur le fil ; `number`/`boolean`/`null` y créeraient une comparaison dont le résultat dépend d'une coercion, pas d'une valeur écrite par l'auteur (cf. §19.3) |

Ces plafonds structurels (nombre de filtres, de valeurs) partagent les budgets **globaux au blob** déjà posés par ADR-0010 avec les body filters : 4 valeurs `regex` toutes portées confondues, 256 `ObjectValue` au total, largeur d'un `and` à 8. Un `queryFilter` de type `regex` consomme le même budget qu'un `bodyFilter` de type `regex` ; il n'existe pas de budget séparé par axe.

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

**Blob v5** (query filters, cf. §19) :

```json
{
  "v": 5,
  "token": "tk-us-xxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "target": "https://api.example.com",
  "auth": "bearer",
  "scopes": [
    {
      "methods": ["GET"],
      "pattern": "/v1/items",
      "queryFilters": [
        {
          "param": "status",
          "values": [
            { "type": "any", "value": "open" },
            { "type": "any", "value": "pending" }
          ],
          "required": true
        },
        {
          "param": "page",
          "values": [{ "type": "wildcard" }]
        }
      ]
    }
  ],
  "createdAt": 1712534400,
  "ttl": 86400
}
```

Ce scope autorise `GET /v1/items?status=open` et `GET /v1/items?status=pending&page=3`, refuse `GET /v1/items?status=closed` (valeur non couverte), refuse `GET /v1/items?page=3` (`status` requis absent), et refuse `GET /v1/items?status=open&sort=asc` (`sort` non déclaré : déni par défaut, cf. §19.2).

| Champ | Type | Description |
|-------|------|-------------|
| `v` | `number` | Version du format (`2`, `3`, `4` ou `5`) |
| `token` | `string` | Token ou secret pour l'API cible. Requis sauf pour l'AuthSpec `headers` (cf. §6.3). |
| `target` | `string` | URL de base de l'API cible |
| `auth` | `string \| AuthSpec` | Mode d'authentification, string (v2/v3) ou objet structuré (v4). Voir §11.1. |
| `scopes` | `Array<string \| ScopeEntry>` | Scopes string et/ou structurés |
| `createdAt` | `number` | Timestamp Unix (secondes) de création du blob |
| `ttl` | `number` | Durée de validité en secondes depuis `createdAt`. `0` = pas d'expiration. |

La version est déterminée automatiquement, sur **trois axes indépendants**, en prenant la plus haute des trois. Chaque axe impose un **plancher** (`v >= N`), jamais une égalité : le détail de cette règle et l'erreur qu'elle corrige sont en §19.7.

- au moins un ScopeEntry porte un `queryFilters` **non vide** → plancher **v5**
- sinon, `auth` est un objet `AuthSpec` → plancher **v4**
- sinon, au moins un scope est un ScopeEntry (avec ou sans `bodyFilters`) → plancher **v3**
- sinon → plancher **v2**

`queryFilters: []` (tableau vide) n'impose aucun plancher : il est sérialisé comme absent, pas comme une capacité utilisée (§19.7).

Un blob v5 peut donc n'avoir qu'une auth string, et un blob v4 conserve des scopes string. Un ScopeEntry qui porte des `queryFilters` non vide est par construction un ScopeEntry structuré, donc le plancher v5 entraîne toujours le plancher v3 : il n'y a pas de cas où v5 s'applique sans que v3 s'applique aussi, ce qui est sans conséquence puisqu'on ne retient que le maximum. Le numéro de version est un marqueur de capacité de lecture, pas une génération fonctionnelle : il dit à un lecteur quels champs il doit savoir interpréter, rien de plus.

Le token est considéré expiré quand `Date.now() / 1000 > createdAt + ttl` (sauf si `ttl === 0`).

### 6.2 Compatibilité ascendante

- Les blobs v2, v3 et v4 existants restent **valides et inchangés**. Aucune régénération n'est nécessaire.
- Un proxy à jour lit v2, v3, v4 et v5.
- **Un blob v5 présenté à un proxy qui ne connaît que v2/v3/v4 est rejeté** (401 `invalid_credentials`), exactement comme un blob v4 est rejeté par un proxy qui ne connaît que v2/v3. Le refus vient du contrôle exhaustif de `v` à l'étape 7 du déchiffrement (§6.5) : toute valeur hors de l'ensemble que le proxy sait lire est refusée, quel que soit par ailleurs le sort réservé à un champ `queryFilters` qu'il ne connaîtrait pas. C'est cette explicitude qui fait tout l'intérêt du bump de version (ADR-0009 §4) : un vieux proxy qui ignorerait silencieusement un champ inconnu et servirait la requête sans la contrainte reproduirait exactement le fail-open que la feature corrige. Le contrôle de version est donc la garantie, pas un simple marqueur informatif.
- Un blob v5 est toujours lisible par un proxy v5 quels que soient ses autres axes (auth string ou structurée, scopes avec ou sans bodyFilters) : la version ne dit que la présence de `queryFilters` quelque part dans les scopes, jamais leur absence des autres axes.
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
- Si `auth` est un objet, alors `v` doit être **au moins** `4` (`v >= 4`, jamais `v === 4` : un blob v5 à auth structurée doit rester lisible, §19.7). Si `v <= 3`, `auth` doit être une string.
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
7. Valider la structure. **Chaque capacité impose un plancher de version (`v >= N`), jamais une égalité (`v === N`) : voir §19.7 pour la faute que cette formulation corrige et la règle générale.**
   - `v` doit être `2`, `3`, `4` ou `5`. Toute autre valeur → blob rejeté, sans tenter d'interpréter le reste. C'est ce contrôle, exhaustif et vérifié en premier, qui garantit qu'un proxy antérieur à v5 refuse tout blob v5 plutôt que de l'accepter en ignorant silencieusement `queryFilters` (§6.2).
   - `target` et `auth` non vides ; `token` non vide sauf en AuthSpec `headers` (cf. §6.3)
   - `scopes` est un tableau
   - Un scope structuré (`ScopeEntry`, avec ou sans `bodyFilters`) n'est valide que si `v >= 3`. En dessous, tous les scopes doivent être des strings.
   - `auth` objet (`AuthSpec`) n'est valide que si `v >= 4` (cf. §6.3). En dessous, `auth` doit être une string.
   - Un `queryFilters` non vide sur un `ScopeEntry` n'est valide que si `v >= 5` (limites et sémantique du §19 vérifiées). En dessous, le blob est rejeté : un `v` sous-déclaré face à des `queryFilters` réellement présents est une capacité non couverte par son propre plancher, refusée au même titre qu'une capacité manquante (§19.7). Un `queryFilters` vide (`[]`) n'impose aucun plancher et n'est pas considéré comme porter des `queryFilters` (§19.7).
   - `v` publié est le **maximum** des planchers effectivement imposés par le contenu du blob. Un blob peut légitimement publier un `v` supérieur à son plancher minimum (par exemple v5 avec une auth string simple), jamais inférieur.

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
- Headers : propagés tels quels, sauf `Set-Cookie` et `Transfer-Encoding` (toujours filtrés), et `Content-Encoding`/`Content-Length` quand le runtime a déjà décodé le corps avant que FGP ne le reçoive (`gzip`/`br` sans `Range` ni `Accept-Encoding: identity` sur la requête sortante). Détail complet et justification en section 11.3.
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
| **403 Forbidden** | La méthode, le chemin, le body ou la query ne matchent aucun scope | `{"error": "scope_denied", "message": "Insufficient permissions for this action"}` |
| **403 Forbidden** | Body filters requis mais content-type non JSON | `{"error": "scope_denied", "message": "Body filters require application/json content type"}` |
| **400 Bad Request** | Le blob porte une regex hors du dialecte autorisé (ADR-0010) | `{"error": "unsupported_regex", "message": "..."}` |
| **403 Forbidden** | La cible du blob n'est pas une destination publique (ADR-0009) | `{"error": "target_forbidden", "message": "Target is not reachable by policy"}` |
| **413 Payload Too Large** | Corps de requête trop volumineux pour être inspecté, quand un body filter ou la capture detailed est actif | `{"error": "payload_too_large", "message": "Request body is too large to inspect"}` |
| **410 Gone** | Le TTL du blob est expiré | `{"error": "token_expired", "message": "This token has expired"}` |
| **414 URI Too Long** | Blob base64url > 4 KB | `{"error": "blob_too_large", "message": "Encrypted blob exceeds maximum size"}` |
| **500 Internal Server Error** | Exception non catchée dans le proxy (bug FGP) | `{"error": "internal_error", "message": "Internal proxy error"}` |
| **502 Bad Gateway** | L'API cible est injoignable (fetch throw : DNS, timeout, connexion refusée, TLS) | `{"error": "upstream_unreachable", "message": "Target API is unreachable"}` |
| **502 Bad Gateway** | Mode `scalingo-exchange` : l'échange du token de compte contre un bearer a échoué | `{"error": "auth_exchange_failed", "message": "Unable to exchange Scalingo token"}` |
| **502 Bad Gateway** | Mode `scalingo-addon` : FGP n'a pas pu obtenir de token d'addon (exchange refusé, API Scalingo en erreur ou injoignable) | `{"error": "auth_addon_failed", "message": "Unable to obtain addon token"}` |

`unsupported_regex` est volontairement distinct de `invalid_credentials`. Un blob dont une regex sort du dialecte est parfaitement déchiffrable : le signaler comme un problème d'identifiants enverrait son porteur vérifier sa clé, ce qui est un diagnostic mensonger. Il doit régénérer son blob, pas retrouver sa clé.

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

Trois codes supplémentaires apparaissent sur ces endpoints. Les deux premiers leur sont propres, ils n'existent pas sur la route proxy. Le troisième vit sur les deux surfaces, avec un plafond différent de chaque côté (§18.5) :

| Status | Code | Endpoint | Condition |
|--------|------|----------|-----------|
| 400 | `invalid_target` | `/api/generate`, `/api/list-apps`, `/api/list-addons` | La cible ne respecte pas la forme exigée, ou son hôte n'est pas public (ADR-0009) |
| 400 | `invalid_scope` | `/api/generate` | Un pattern de scope porte un `?` : le pattern ne porte jamais la query, qui se contraint via `queryFilters` (cf. §19) |
| 413 | `payload_too_large` | tout `/api/*` | Corps de requête au-delà du plafond de la route |

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
9. Application de la politique de sortie sur la cible du blob (§18) → 403 `target_forbidden` (`X-FGP-Source: proxy`)
10. Obtention des credentials upstream → 502 `auth_exchange_failed` en mode `scalingo-exchange`, 502 `auth_addon_failed` en mode `scalingo-addon` (`X-FGP-Source: proxy`)
11. Forward vers l'API cible :
    - Si `fetch` throw (réseau) → 502 `upstream_unreachable` (`X-FGP-Source: proxy`)
    - Sinon → status/body/headers upstream forwardés transparents (`X-FGP-Source: upstream`)
12. Exception inattendue à n'importe quelle étape → 500 `internal_error` via `app.onError` (`X-FGP-Source: proxy`)

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

Le proxy forward les headers du client vers la cible, **sauf cinq classes** retirées systématiquement (ADR-0009, garantie G3). Une denylist par classe, et non une allowlist, parce qu'il n'existe pas de liste finie d'en-têtes utiles à toutes les APIs : `Accept`, `Range`, `If-None-Match`, `Idempotency-Key` et l'infini des en-têtes propriétaires doivent passer.

| Classe | En-têtes | Raison |
|--------|----------|--------|
| Contrôle FGP | `X-FGP-Key`, `X-FGP-Blob`, tout `X-FGP-*` | Appartiennent au protocole du proxy, pas à l'upstream |
| Hop-by-hop | `Connection` et ceux qu'il nomme, `Keep-Alive`, `Proxy-*`, `TE`, `Trailer`, `Transfer-Encoding`, `Upgrade` | Aucun proxy conforme ne les relaie (RFC 9110 §7.6.1). C'est aussi la matière première du request smuggling. |
| Authentification de l'appelant | `Authorization`, `Cookie` | Voir ci-dessous |
| Provenance | `X-Forwarded-For`, `X-Forwarded-Host`, `X-Forwarded-Proto`, `X-Real-IP`, `Forwarded` | FGP n'en pose aucun et n'en relaie aucun |
| Host | `Host` | Supprimé pour laisser le runtime résoudre le bon hôte |

**Pourquoi `Authorization` et `Cookie` de l'appelant ne passent plus.** La promesse de FGP est que l'appelant ne détient pas le credential de l'API cible. Laisser l'appelant poser son propre `Authorization` sur une requête dont le mode d'auth ne l'écrase pas (`header:{name}`, mode `headers`) permet d'atteindre l'upstream avec une identité que le blob n'a jamais accordée, sur une API qui accepte plusieurs schémas d'authentification. C'est une escalade de privilège qui contourne entièrement le modèle de scopes.

**La porte de sortie légitime existe déjà** : qui a besoin d'envoyer un `Authorization` fixe à l'upstream le déclare dans l'AuthSpec `headers` du blob (v4, §6.3). La valeur vit alors dans le blob, chiffrée, au lieu d'être posée par l'appelant. C'est précisément ce pour quoi l'ADR-0008 a été écrit.

Ordre d'application : les headers d'auth issus du blob écrasent ceux de l'appelant, puis le strip passe en dernier et écrase tout.

### 11.3 Headers de réponse

Le proxy propage tous les headers de la réponse de l'API cible, sauf :

- `Set-Cookie` : toujours filtré, le proxy est stateless et ne doit pas propager de cookies.
- `Transfer-Encoding` : toujours filtré. C'est un en-tête hop-by-hop (RFC 9110 §7.6.1), il décrit le framing du hop amont, jamais celui que FGP émet, et aucun proxy conforme ne le relaie.
- `Content-Encoding` et `Content-Length` : filtrés **uniquement quand le runtime a réellement décodé le corps** avant que FGP ne le reçoive.

**Pourquoi ces deux derniers sont conditionnels, et pas simplement filtrés en bloc.** `fetch` décompresse automatiquement un corps dont l'upstream a annoncé `Content-Encoding: gzip` ou `br`, sauf si la requête sortante porte un `Range` (quelle que soit sa valeur, la réponse pouvant être un fragment indécodable) ou un `Accept-Encoding` valant exactement `identity`, deux cas où le décodage reste désactivé et le corps ressort tel qu'envoyé par l'upstream. Quand le décodage a eu lieu, les en-têtes amont continuent de décrire l'entité compressée d'origine, qui n'existe plus au moment où FGP répond : les laisser passer ferait croire à un client qu'il reçoit du contenu compressé alors qu'il reçoit du clair (un client qui respecte l'en-tête tente de le décompresser et échoue), et un `Content-Length` périmé tronque la réponse à la première lecture. Dans tous les autres cas, hors de ce décodage (encodage que le runtime ne décode pas, ou décodage désactivé par `Range`/`Accept-Encoding: identity`), le corps ressort exactement comme envoyé par l'upstream et ces deux en-têtes restent exacts : ils sont alors relayés sans modification.

Cette suppression conditionnelle n'est pas une entorse supplémentaire à la transparence de l'ADR-0006, elle en découle : garder un en-tête qui décrit un corps que le runtime a déjà transformé reviendrait à mentir sur ce que FGP transmet réellement. La déviation vient du runtime, qui a transformé le corps avant que FGP ne le voie, jamais d'un choix produit. Voir ADR-0006 pour la doctrine complète.

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

L'UI propose une section dépliable "Tester un scope" sous les body filters. Elle permet de vérifier si une requête (méthode + path + body optionnel) est autorisée par les scopes configurés.

#### Fonctionnement

1. **Highlight temps réel** : à mesure que l'utilisateur tape un path et sélectionne une méthode, les scopes matchant sont mis en surbrillance visuellement (indicateurs ✓/✗ par scope).
2. **Évaluation locale** : le test s'exécute **dans le navigateur**, sur la même fonction d'autorisation que celle du proxy. Il n'y a pas d'appel réseau.
3. **Body JSON** : un textarea JSON optionnel (affiché pour POST/PUT/PATCH) permet de tester les body filters.

#### `POST /api/test-scope` est supprimé

**Changement de contrat public.** La route figurait dans l'OpenAPI, le README, ces specs et `/llms.txt`. Elle n'avait aucun appelant dans le produit : l'UI faisait déjà son test dans le navigateur en important directement la fonction d'autorisation. Maintenir une copie serveur d'une logique que le produit exécute côté client, c'était payer une surface d'attaque publique et non authentifiée pour zéro valeur (ADR-0010 D1).

Un intégrateur tiers qui l'aurait câblée doit migrer vers `POST /api/test-proxy`, qui teste la configuration de bout en bout, ou reproduire la vérification chez lui.

#### Une seule fonction d'autorisation

Le testeur de scopes **mentait**, et pas par accident de code : il possédait sa propre lecture des scopes, en parallèle de celle du proxy. Sur `/v1/items?action=delete`, il répondait « Accès refusé » là où la production répondait 200. Un outil de vérification qui se trompe dans le sens permissif est pire que pas d'outil.

Le correctif est structurel : **une seule fonction d'autorisation**, exportée par `src/middleware/scopes.ts`, appelée par le proxy et par le highlight client. Elle prend le chemin brut avec sa query éventuelle, applique la règle des deux formes (§18.3), et retourne un verdict dont un champ indique si la query est contrainte. Trois lectures des scopes ne peuvent pas rester d'accord dans le temps, une seule ne peut pas diverger.

**Correction (challenge testeur, T2) : le champ de contrainte doit être lu sur le scope qui accorde réellement l'accès, jamais sur « au moins un scope testé ».** Les scopes sont en OR (§3.2) : `checkAccess` retourne vrai au premier scope qui matche et n'examine pas les suivants. Si un blob contient à la fois un scope string historique `GET:/v1/items` (aucune contrainte) et un `ScopeEntry` à `queryFilters` sur le même chemin et la même méthode, une requête `/v1/items?force=true` est **autorisée par le premier**, `force=true` part tel quel, et le second n'a jamais été sollicité. Afficher « contrainte » parce que le second scope du blob en porte une, à côté d'un verdict « autorisé », dirait au testeur que sa query a été validée alors qu'elle ne l'a pas été : exactement le mensonge, dans une forme nouvelle, que ce module existe pour supprimer (§18.3, ADR-0009 §4).

**Ce que le testeur doit donc afficher : trois états, jamais deux.**

| État | Condition | Texte |
|------|-----------|-------|
| 1. Non contrainte | Le chemin de test contient un `?`, et **aucun** scope testé, dans tout le jeu de scopes, ne porte de `queryFilters` | « La query n'est pas contrainte par les scopes : tous les paramètres passent. » |
| 2. Contrainte | Le chemin de test contient un `?`, la requête est autorisée, et **le scope qui accorde l'accès** porte des `queryFilters` | « La query est contrainte par le scope qui vous autorise : {method}:{pattern}. » |
| 3. Contournée | Le chemin de test contient un `?`, la requête est autorisée, **au moins un scope du blob porte des `queryFilters` sur ce chemin**, mais **le scope qui accorde l'accès n'en porte pas** | « Autorisé par un scope qui ne contraint pas la query : {method}:{pattern}. D'autres scopes de ce blob contraignent ce chemin, mais ce n'est pas celui qui a matché en premier. » |

L'état 3 est la correction du bug : il dit explicitement que la protection existe ailleurs dans le blob mais n'a pas joué, ce qui est la seule formulation qui n'induit pas en erreur. Quand la requête est **refusée**, aucun de ces trois états ne s'affiche : il n'y a pas de scope accordant l'accès à nommer, et le détail par scope ci-dessous porte déjà toute l'information utile.

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

#### Détail par scope : quel paramètre a bloqué

Un indicateur ✓/✗ par scope ne suffit plus quand le refus vient de la query : un utilisateur qui voit juste « ✗ » sur un scope à `queryFilters` ne sait pas s'il a oublié un paramètre requis, ajouté un paramètre non prévu, envoyé une valeur hors liste, ou répété un paramètre plus de fois que le plafond ne l'autorise. **Quand un scope refuse spécifiquement sur son axe query, une ligne de détail apparaît sous ce scope**, nommant le paramètre fautif et la nature du problème. **Quatre cas, jamais cumulés** : l'évaluation s'arrête au premier problème rencontré, dans l'ordre où ce tableau les liste, qui est aussi l'ordre d'évaluation imposé par §19.2 (le comptage des occurrences précède toujours l'examen des valeurs) :

| Cas | Texte |
|-----|-------|
| Un paramètre présent dans la requête de test n'est couvert par aucun `queryFilter` de ce scope (déni par défaut, §19.2) | « Paramètre "{param}" non déclaré : refusé par défaut dès qu'un filtre query existe sur ce scope. » |
| Un `queryFilter` a `required: true` et son paramètre est absent de la requête de test | « Paramètre requis "{param}" absent. » |
| Un paramètre couvert par un `queryFilter` apparaît plus de fois que le plafond applicable ne l'autorise (§19.4) | « Plus de {plafond} occurrences de "{param}" : au-delà de cette limite, la requête est refusée quelles que soient les valeurs. Pour filtrer davantage d'occurrences, remplacez une valeur `regex` par `stringwildcard` si possible : le plafond passe de 4 à 64. » |
| Un `queryFilter` est présent, le nombre d'occurrences est dans le plafond, mais au moins une occurrence ne matche aucune valeur de `values` | « Valeur de "{param}" non autorisée par ce filtre. » |

**Pourquoi le comptage précède l'examen des valeurs, et pourquoi c'est écrit ici et pas seulement en §19.2.** Sans cet ordre fixé, le message dépendrait d'un détail d'implémentation invisible à l'utilisateur : un dev qui évalue occurrence par occurrence pourrait renvoyer « valeur non autorisée » sur la troisième occurrence d'un paramètre qui en compte six, avant même d'avoir remarqué qu'il y en a trop, ce qui envoie l'utilisateur vérifier des valeurs qui sont pourtant toutes bonnes. Le troisième message de ce tableau n'existe que parce que le quatrième ne doit jamais se déclencher à sa place.

Le nom du paramètre entre guillemets doubles droits n'est pas un choix arbitraire : c'est la même convention que celle déjà utilisée pour citer un champ dans les messages de validation de body filters (`"deployment.git_ref" exceeds maximum of 6 segments"`), reprise ici pour la cohérence.

Ce niveau de détail n'existe **que dans le testeur**, qui tourne dans le navigateur sur la configuration de son propre auteur. Les erreurs de production (`scope_denied`) restent volontairement génériques (§8.2) : dire à un appelant anonyme quel paramètre précis a fait échouer quel scope reviendrait à lui dévoiler la structure interne du blob qu'il n'a pas le droit de lire.

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
| Lien vers le panneau Doc | « En savoir plus sur les modes d'auth » (cf. §12.11) |
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
| Puce `upstream` | « `upstream` : la réponse vient de votre API cible. FGP n'a touché ni au status ni au corps. Il ajoute cet en-tête et retire trois en-têtes au plus : `Set-Cookie` et `Transfer-Encoding` toujours, `Content-Encoding` et `Content-Length` uniquement si votre corps est arrivé compressé puis décompressé avant de vous être transmis (ils décriraient alors un corps qui n'existe plus). Interprétez la réponse avec la documentation de cette API. » |
| Aide pratique | « Ajoutez `-i` à votre commande `curl` pour voir cet en-tête. » |

#### Bloc 2 : « Les erreurs de FGP » (replié)

| Élément | Texte |
|---------|-------|
| Libellé du `<summary>` | « Les erreurs de FGP » |
| Sous-titre du groupe 1 | « La clé ou le blob » |
| Sous-titre du groupe 2 | « Le périmètre du blob » |
| Sous-titre du groupe 3 | « La cible du blob » |
| Sous-titre du groupe 4 | « FGP n'a pas pu obtenir de credentials ou joindre l'API cible » |
| Sous-titre du groupe 5 | « Anomalies » |

**Groupe 1, « La clé ou le blob »** :

| Code et status | Texte de remédiation |
|----------------|----------------------|
| `missing_key` (401) | « L'en-tête `X-FGP-Key` est absent de la requête. Sans la clé client, le blob ne peut pas être déchiffré. » |
| `invalid_credentials` (401) | « Le déchiffrement a échoué. La clé ne correspond pas à ce blob, le blob a été tronqué ou modifié, ou il a été généré sur une autre instance FGP. » |
| `blob_too_large` (414) | « Le blob dépasse 4 Ko. Réduisez le nombre de scopes, de body filters ou de headers d'authentification. Le mode en-tête ne contourne pas cette limite : elle porte sur la taille du blob, pas sur son transport. » |
| `unsupported_regex` (400) | « Une expression régulière de ce blob n'est plus autorisée : les groupes quantifiés, les backréférences et les lookarounds sont refusés. Le blob doit être régénéré avec un motif plus simple. » |

**Groupe 2, « Le périmètre du blob »** :

| Code et status | Texte de remédiation |
|----------------|----------------------|
| `scope_denied` (403) | « La méthode ou le chemin demandé ne correspond à aucun scope du blob. Si des body filters ou des query filters sont configurés, le contenu de la requête ou ses paramètres de query peuvent aussi être en cause. La section « Tester un scope » rejoue le cas sans consommer d'appel, et détaille quel paramètre bloque si l'axe query est en cause. » |
| `token_expired` (410) | « Le TTL du blob est dépassé. Une URL expirée ne se prolonge pas, il faut en générer une nouvelle. » |
| `invalid_body` (400) | « Des body filters sont configurés mais le corps de la requête n'est pas du JSON valide. Vérifiez aussi que l'en-tête `Content-Type` vaut bien `application/json`, sinon la requête est refusée en `scope_denied`. » |
| `payload_too_large` (413) | « Le corps de la requête dépasse la taille inspectable, 512 Ko, quand un body filter ou la capture des logs détaillés est actif. Sans ces deux fonctions, le corps est transmis en flux et n'est pas plafonné. » |

**Groupe 3, « La cible du blob »** :

| Code et status | Texte de remédiation |
|----------------|----------------------|
| `target_forbidden` (403) | « La cible de ce blob n'est pas une adresse publique. FGP refuse de joindre les réseaux privés, la boucle locale et les adresses de métadonnées. Vérifiez l'URL cible du blob. » |

**Groupe 4, « FGP n'a pas pu obtenir de credentials ou joindre l'API cible »** :

| Code et status | Texte de remédiation |
|----------------|----------------------|
| Intro du groupe | « Ces trois erreurs sont les seules 502 produites par FGP. Toute autre 502 vient de votre API cible : vérifiez `X-FGP-Source` avant de conclure. » |
| `upstream_unreachable` (502) | « L'API cible n'a répondu à aucun moment : DNS, délai dépassé, connexion refusée ou erreur TLS. Vérifiez l'URL cible du blob. » |
| `auth_exchange_failed` (502) | « Mode Scalingo API : impossible de s'authentifier auprès de Scalingo. Le token de compte du blob est invalide ou révoqué, ou l'API d'authentification Scalingo est indisponible. » |
| `auth_addon_failed` (502) | « Mode Scalingo Database API : impossible d'obtenir un token de base de données. Le token de compte est invalide, ou il n'a pas accès à la base configurée dans ce blob. » |

**Groupe 5, « Anomalies »** : trois codes rares, regroupés en une seule entrée pour ne pas allonger la liste.

| Élément | Texte |
|---------|-------|
| Entrée unique | « `invalid_request` (400) quand l'URL ne contient pas de chemin après le blob, `invalid_auth_mode` (400) quand le mode d'authentification du blob n'est pas reconnu par cette instance, et `internal_error` (500) qui signale un bug de FGP et mérite un rapport. » |

#### Bloc 2 bis : paramètres de query (visible)

À placer sous la liste des codes, hors du `<details>`, parce que ce n'est pas une erreur mais une règle de comportement, et que personne ne la cherchera dans une liste de codes.

**Ce bloc ne disparaît plus** depuis que `queryFilters` est livré (v5, §19) : il existe désormais deux comportements possibles selon que le scope utilisé en porte ou non, et les deux doivent être dits. La non-contrainte reste la règle par défaut et concerne la majorité des blobs, ceux qui n'utilisent pas la feature.

| Élément | Texte |
|---------|-------|
| Titre du bloc | « Paramètres de query » |
| Paragraphe 1 (règle par défaut) | « Par défaut, les scopes contraignent la méthode et le chemin, pas les paramètres de query. Un scope autorisé sur `/v1/items` accepte `/v1/items?action=delete`, sauf s'il déclare des `queryFilters`. » |
| Paragraphe 2 (règle opt-in) | « Un scope qui déclare au moins un filtre query bascule en refus par défaut sur toute sa query : seuls les paramètres explicitement couverts sont acceptés, tout paramètre non déclaré fait échouer la requête sur ce scope. » |

Le second paragraphe ne répète pas les détails de sémantique (`required`, occurrences répétées, restriction du type `any`) : ils vivent dans le guide « Query filters : exemples » du formulaire (§12.14.1) et dans le reste du §19, pas ici. Ce panneau documente le comportement d'une URL déjà générée, pas la façon de construire un scope.

#### Bloc 3 : « Tout le reste vient de votre API » (visible)

| Élément | Texte |
|---------|-------|
| Titre du bloc | « Tout le reste vient de votre API » |
| Texte | « Un code absent de cette liste n'a pas été produit par FGP. Un 401, un 404, un 429 ou un 500 portant `X-FGP-Source: upstream` sont la réponse de votre API cible : status et corps sont inchangés, seuls `X-FGP-Source` est ajouté et quelques en-têtes de transport sont retirés (`Set-Cookie`, `Transfer-Encoding`, et `Content-Encoding`/`Content-Length` si votre corps a été décompressé en route). FGP ne les reformule pas et ne les traduit pas : c'est ce qui vous permet de traiter les erreurs de votre API exactement comme si vous l'appeliez en direct. » |

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
| Un champ ou un bloc du formulaire | « En savoir plus sur {sujet} » | « En savoir plus sur la clé client », « En savoir plus sur les modes d'auth » |
| Le changelog | « Voir {section} dans la doc » | « Voir Codes d'erreur dans la doc » |
| Le retour, depuis le panneau Doc | « Revenir à {label du champ} » | « Revenir à Clé personnalisée », « Revenir à Base de données » |

Le libellé de retour cite le label du champ **tel qu'il est affiché, majuscule comprise**, et sans article. La majuscule signale que c'est une citation d'un élément de l'interface et non une tournure de phrase, ce qui est exactement ce qui rend le retour identifiable quand plusieurs renvois coexistent sur la page. C'est la valeur transportée par `data-return-label`.

Trois règles, dans l'ordre d'importance :

1. **Le libellé nomme sa destination.** Jamais « cliquez ici », jamais « en savoir plus » seul, jamais « revenir au formulaire ». Un lecteur d'écran peut lister les liens d'une page hors de leur contexte : un libellé qui ne dit pas où il mène devient inutilisable dans cette liste, et il y en aura plusieurs identiques sur la même page. C'est la règle qui impose la forme du retour : dès qu'il y a deux renvois, « Revenir au formulaire » ne distingue plus rien.
2. **Le sujet reprend le mot du label du champ**, en minuscule à l'aller, tel quel au retour. Le lien placé sous « Clé personnalisée » parle de « la clé client », pas de « BYOK » ni de « la génération de clé ». L'utilisateur doit reconnaître ce qu'il vient de lire.
3. **Pas de formulation de navigation externe.** Le lien bascule d'onglet sans quitter la page : il ne dit ni « ouvrir », ni « aller à », ni « consulter la documentation », qui laissent croire à un départ. « En savoir plus sur », « Voir » et « Revenir à » conviennent.

**Un contre-exemple, gardé comme rappel.** La première version de cette convention donnait « Comment fonctionne ce mode » comme libellé du renvoi depuis le bloc Scalingo, et le citait en exemple de la forme « En savoir plus sur {sujet} ». Il n'a ni cette forme, ni ne nomme sa destination : lu hors contexte dans une liste de liens, « ce mode » ne désigne rien. La règle 1 était donc enfreinte par sa propre illustration, ce qui est le meilleur moyen de la vider de son sens. Corrigé en « En savoir plus sur les modes d'auth ». Vérifier qu'un libellé reste compréhensible **sorti de la page** est le test à appliquer, y compris aux exemples de cette section.

### 12.12 Bloc de résultat : la clé n'est affichée qu'une fois

**Manque constaté.** Le bloc de résultat affiche l'URL, la clé et le blob, sans **aucun** avertissement indiquant que la clé n'est montrée qu'une seule fois et que FGP ne peut pas la redonner. Un utilisateur qui ferme l'onglet perd l'accès à tous les blobs générés avec cette clé, définitivement, sans avoir été prévenu.

C'est le bon endroit pour cette information, et c'est la destination du texte retiré du champ BYOK (§12.9) : dans le champ, l'utilisateur fournit une clé qu'il détient déjà, ici il en reçoit une qu'il est seul à détenir.

| Élément | Texte | Condition d'affichage |
|---------|-------|-----------------------|
| Avertissement sous le champ clé | « Notez cette clé maintenant : FGP ne la stocke pas et ne pourra pas vous la redonner. Sans elle, l'URL est inexploitable. » | Uniquement quand la clé a été **générée par le serveur** |
| Variante clé fournie | « Cette clé est celle que vous avez fournie. FGP ne la stocke pas. » | Uniquement quand l'utilisateur a fourni sa propre clé |

La distinction n'est pas cosmétique : « notez cette clé maintenant » adressé à quelqu'un qui vient de la coller depuis son coffre est un bruit qui décrédibilise les avertissements suivants.

Traitement visuel : même registre que l'avertissement de mutualisation, pas plus fort. C'est une consigne, pas une alerte de sécurité.

### 12.13 Blocs d'alerte : pas de titre

**Règle confirmée** : un bloc d'alerte n'a pas de titre. Le niveau est porté par l'icône et la couleur, le texte dit ce qui se passe.

Le titre « Attention » en gras a donc disparu de l'encadré de la clé client, et ne doit pas revenir. Il ne portait aucune information : c'est une étiquette de catégorie, pas un contenu, exactement le même défaut que « cliquez ici » sur un lien (§12.11, règle 1). Il coûtait une troisième ligne, ce qui faisait sortir le bloc de son budget de hauteur.

Le corollaire du designer est la partie la plus utile de la règle, et elle vaut au-delà de ce bloc : **si un bloc d'alerte a besoin d'un titre pour être compris, son texte relève de la documentation.** Un titre qui rend un avertissement lisible est le symptôme d'un avertissement trop long.

**Une condition d'accessibilité s'y ajoute, et elle n'est pas optionnelle.** L'icône est décorative donc `aria-hidden`, et la couleur n'est pas un canal d'information pour qui ne la perçoit pas. Ni l'une ni l'autre n'atteint un lecteur d'écran. **La gravité doit donc rester déductible du texte seul.** Elle l'est pour l'encadré de la clé client : « Réutiliser une clé lie les blobs : sa fuite rend déchiffrables tous ceux générés avec elle » porte sa propre alarme, sans avoir besoin qu'on la qualifie.

Un texte d'alerte qui ne se comprendrait comme une alerte qu'en voyant sa couleur est mal écrit, et retirer son titre a le mérite de le révéler.

### 12.14 Query filters dans l'UI (copy, v5)

Le formulaire de saisie reprend le **gabarit visuel des body filters** (§12.4) : accordéon par scope, panel repliable, un bloc par filtre avec un sélecteur de type et une liste de valeurs OR extensible. Cette section ne redécrit pas ce gabarit, elle donne le texte propre aux query filters et les trois écarts fonctionnels qui le distinguent des body filters.

#### Où le panel apparaît, et un seul panel pour les deux axes

**Correction sur le mécanisme : un seul bouton, un seul panel, pas un second doublant celui des body filters.** La version précédente de cette section décrivait un bouton et un panel propres à l'axe query, en miroir de ceux des body filters. Le designer a unifié les deux (`docs/design/query-filters-ui.md`, validé par le lead) : un même bouton ouvre un même panel pour un scope donné, qui contient deux sous-sections quand les deux axes sont utilisés, « Body Filters (avancé) » et « Query Filters (avancé) » (ces deux libellés restent les miens, réutilisés tels quels comme titres de sous-section plutôt que de panel). Le bouton d'ouverture et le titre du panel englobant, eux, sont une formulation du designer que je valide ici sans y toucher : elle est claire, cohérente avec le gabarit existant, et n'a pas besoin d'être réécrite.

Le bouton d'ouverture apparaît **pour tout scope**, contrairement au comportement d'avant les query filters où il n'apparaissait que pour les scopes POST/PUT/PATCH. Une query s'observe sur n'importe quelle méthode, GET compris, c'est même le cas d'usage principal (§19.1).

| Élément | Texte |
|---------|-------|
| Bouton d'ouverture (unique, body et query) | « + Ajouter des filtres sur un scope... » |
| Titre du panel englobant (unique) | « Filtres avancés » |
| Titre de la sous-section body filters, à l'intérieur du panel | « Body Filters (avancé) » |
| Titre de la sous-section query filters, à l'intérieur du panel | « Query Filters (avancé) » |

#### L'avertissement de déni par défaut : au moment de la saisie, pas dans une doc

**C'est le point de copy le plus important de cette section.** Un body filter est purement additif : il contraint le champ qu'il nomme, il ne dit rien des autres champs du body. Un query filter ne l'est pas : dès qu'un scope en porte un seul, ce scope bascule en refus par défaut sur **tous les autres** paramètres de sa query (§19.2). Cette asymétrie est le piège que l'ADR-0009 signale, et un auteur qui pense « j'ajoute une contrainte » sans le savoir vient d'en ajouter une deuxième, sur tout le reste.

L'avertissement doit donc être **visible dès qu'un filtre existe sur ce scope**, pas seulement au premier ajout : un bloc d'alerte permanent en tête de la liste des filtres du scope, qui disparaît si l'auteur supprime le dernier filtre (puisqu'à ce moment-là la règle ne s'applique plus). Traitement §12.13 : pas de titre, gravité déductible du texte seul.

| Élément | Condition d'affichage | Texte |
|---------|------------------------|-------|
| Alerte de déni par défaut | Au moins un query filter existe sur ce scope | « Dès qu'un filtre query est ajouté à ce scope, tout paramètre de query non déclaré ici fait échouer la requête, y compris ceux que vous n'écrivez pas vous-même (pagination, cache-busting, tracking ajoutés par votre client). Ce n'est pas une contrainte en plus : c'est un refus par défaut sur tout le reste de la query. » |

La gravité tient au texte seul (« fait échouer la requête », « refus par défaut ») sans avoir besoin d'un mot comme « Attention » : c'est exactement le corollaire du designer en §12.13 appliqué ici.

**Ajout (challenge testeur, T1) : la mention des paramètres ajoutés par le client de l'auteur.** La première version de cette alerte disait « tout paramètre de query non déclaré ici fait échouer la requête », qui se lit comme « les paramètres que j'écris », pas comme « ceux que mon SDK ajoute ». Le mode de défaillance nominal de la feature est justement un paramètre que l'auteur ne voit jamais dans son propre code (§19.8) : la copy doit le dire à l'endroit où l'auteur peut encore agir, avant de basculer le déni par défaut, pas seulement dans le guide qu'il n'ouvrira qu'après coup.

#### Labels du formulaire

| Élément | Texte | Écart avec les body filters |
|---------|-------|-------------------------------|
| Label du champ nommant le paramètre | « Paramètre de query » | Remplace « Champ (dot-path) » |
| Placeholder du champ | `status` | Remplace `deployment.git_ref` |
| Texte d'aide sous le champ | « Nom exact du paramètre, tel qu'il apparaît dans l'URL. Pas de notation par point : un paramètre de query n'a pas de structure imbriquée. » | Nouveau : évite qu'un utilisateur habitué aux body filters tente `user.id` |
| Case à cocher | « Requis » | Nouveau, absent des body filters |
| Texte d'aide sous la case | « Décochée (par défaut), ce paramètre peut être absent de la requête, ce n'est pas un problème. Cochée, la requête est refusée si ce paramètre est absent. » | Nouveau |

#### Type `any` : pas de sous-type

**Deuxième écart avec les body filters, direct effet de l'arbitrage §19.3.** Une valeur de query est toujours une chaîne : le sélecteur Texte / Nombre / Booléen / Null qui accompagne le type « Valeur exacte » dans les body filters **n'existe pas** ici, y compris dans les sous-conditions d'un `ET` ou d'un `Exclure` imbriqué. Le champ de saisie de la valeur est un simple champ texte. Afficher un sélecteur à une seule option utilisable aurait été un choix pire que ne pas l'afficher : un menu qui ne propose qu'un choix n'est pas un menu, c'est un contournement de composant.

| Élément | Texte |
|---------|-------|
| Texte d'aide sous le champ valeur, type « Valeur exacte » | « Une valeur de query est toujours du texte, y compris pour un nombre ou un booléen. Pour `?page=1`, écrivez `1` ici, pas une coche. » |

#### Messages d'erreur (génération)

Les messages de validation à la génération suivent la convention déjà en place pour les scopes et les body filters (`src/middleware/scope-limits.ts`) : rédigés en anglais, nommant le champ fautif. Ce n'est pas une exception à créer, c'est la continuité d'un existant.

| Condition | Message |
|-----------|---------|
| Plus de 8 `queryFilters` sur un ScopeEntry | `Maximum 8 query filters per scope, got {n}` |
| Plus de 16 valeurs OR sur un `queryFilter` | `Maximum 16 OR values per query filter, got {n} on param '{param}'` |
| `any` avec une valeur non-string sur un query filter | `Type "any" on a query filter only accepts a string value (param: '{param}')` |
| Deux `queryFilters` du même ScopeEntry nomment le même paramètre | `Duplicate query filter for param '{param}'` |

**Le doublon de `param` est rejeté aux deux endroits, pas seulement à la génération.** Le message ci-dessus s'affiche à la génération, mais la même règle est aussi vérifiée au déchiffrement du blob (§19.5) : le salt étant public, une règle qui ne vivrait qu'au formulaire ne protégerait personne contre un blob forgé à la main.

**Le plafond d'occurrences évaluées par requête n'a pas de message de génération, quel que soit le palier applicable.** Il ne peut pas en avoir : contrairement à tous les autres plafonds de cette liste, il ne dépend d'aucune donnée du blob, seulement de la requête envoyée par l'appelant au moment du forward. Il ne se manifeste jamais à la génération, seulement à l'usage, en `scope_denied` générique côté proxy et en détail nommé côté testeur (§12.5).

**Le choix du type « Expression régulière » doit dire, au moment où l'auteur le sélectionne, qu'il abaisse le plafond d'occurrences (§19.4).** C'est le point de copy qui débloque un auteur qui se retrouverait sinon enfermé (§19.4) : sans cette information au bon endroit, il découvre le plafond de 4 en production, sur une requête refusée, sans savoir pourquoi ni quoi corriger.

| Élément | Condition d'affichage | Texte |
|---------|------------------------|-------|
| Texte d'aide sous le sélecteur de type, uniquement quand « Expression régulière » est choisi | « Un paramètre filtré par une expression régulière n'accepte que 4 occurrences répétées par requête, contre 64 pour les autres types. Si vous attendez plus de 4 valeurs sur ce paramètre, un pattern glob (`stringwildcard`) suffit souvent et n'a pas cette limite. » |

#### 12.14.1 Guide « Query filters : exemples »

Nouveau guide repliable, même registre que les guides existants (§12.4, scopes et body filters). Il complète le bloc 2 bis du panneau Doc (§12.10) sur les cas concrets, sans répéter sa règle générale.

| Élément | Texte |
|---------|-------|
| Libellé du `<summary>` | « Query filters : exemples » |
| Chapô | « Les query filters s'appliquent à n'importe quelle méthode, GET compris. Dès qu'un scope en porte un, tout paramètre non déclaré fait échouer la requête sur ce scope. » |

**Cas courants** :

| Cas | Contenu |
|-----|---------|
| Statut restreint et requis | Scope `GET:/v1/items`, filtre `status` = `open` \| `pending`, requis. Autorise `/v1/items?status=open`. Bloque `/v1/items?status=deleted` (valeur hors liste) et `/v1/items` (paramètre requis absent). |
| Paramètre optionnel, valeur libre | Filtre `page`, valeur = Existe (toute valeur), non requis. Autorise `/v1/items` et `/v1/items?page=2`. Bloque `/v1/items?page=2&sort=asc` (`sort` non déclaré). |

**Edge cases** :

| Cas | Contenu |
|-----|---------|
| Paramètre répété | Filtre `tag` = `feature` \| `bugfix`. `/v1/items?tag=feature&tag=bugfix` : chaque occurrence est vérifiée séparément, toutes doivent matcher une valeur. `/v1/items?tag=feature&tag=urgent` est refusé : `urgent` ne matche aucune valeur. Au-delà du plafond d'occurrences, la requête est refusée quelle que soit leur valeur : 64 occurrences ici (aucune `regex` dans ce filtre), seulement 4 si le filtre avait utilisé une `regex` (cf. `docs/limits.md`). |
| Refus par défaut | Dès qu'un seul `queryFilter` existe sur ce scope, tout paramètre non déclaré, même anodin (`?debug=1`), fait échouer la requête sur ce scope. |
| Type de valeur | Contrairement aux body filters, `any` sur un query filter n'accepte que du texte. Pour `?page=1`, la valeur du filtre s'écrit `1` en tant que texte, pas en tant que nombre. |

---

## 13. Limites et non-goals (v5)

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
- **Aucune contrainte sur les paramètres de query par défaut** : un scope sans `queryFilters` laisse passer n'importe quelle query sur son chemin. Ce n'est plus une dette : c'est le comportement opt-in voulu, et un scope qui veut contraindre sa query le fait via `queryFilters` (§19).
- **Pas de limitation de débit dans l'application** : l'axe relève de l'opérateur (§18.6 et les guides de déploiement).
- **Pas de protection contre le rebinding DNS** : la politique de sortie est un ralentisseur, pas une preuve (§18.2).
- **FGP n'est pas un WAF** : hors des filtres déclarés dans le scope, le contenu de la requête n'est pas examiné.
- **FGP ne protège pas le créateur d'un blob contre la cible publique qu'il a lui-même choisie.** Le blob est une délégation : la politique de sortie protège l'hôte FGP et son réseau, pas l'utilisateur contre lui-même.
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
  "ipPrefix": "203.0.113.0/24",
  "queryParamNames": ["per_page", "status", "ids"],
  "queryParamRepeats": [["ids", 5]]
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
| `queryParamNames` | Depuis v5 (§19.8). Noms des paramètres de query présents dans la requête, dédupliqués, **jamais leurs valeurs**. Au plus 32 noms distincts, chacun tronqué à 64 caractères. Absent (pas un tableau vide) quand la requête n'a pas de query. |
| `queryParamRepeats` | Depuis v5. Tableau de paires `[nom, nombre d'occurrences]`, **un seul par nom réellement répété**. Un nom présent dans `queryParamNames` mais absent d'ici est apparu exactement une fois. Absent quand aucun paramètre n'est répété. |
| `queryParamNamesTruncated` | Depuis v5. `true` si `queryParamNames` a atteint son plafond de 32 noms distincts (des noms supplémentaires existaient mais ne sont plus retenus) ou si un nom a dû être tronqué à 64 caractères. Absent sinon. |

Le `target` upstream n'est **pas** inclus dans les entries network.

**Sur `queryParamNames` : pourquoi les noms et jamais les valeurs.** L'entry `network` vit **en clair** dans le ring buffer, contrairement au body `detailed` qui est chiffré côté client avant stockage (§14.8). Les noms de paramètres suffisent au diagnostic le plus courant (« `per_page` apparaît, mon SDK de pagination l'a ajouté ») et ne fuitent aucun secret. Les valeurs, elles, contiennent régulièrement des identifiants ou des secrets (`?api_key=`, `?token=`) : les stocker en clair dans le ring buffer network en ferait un vecteur de fuite à part entière, ce qu'aucune autre donnée de cette entry ne fait aujourd'hui. Un besoin futur de voir les valeurs a sa place dans l'entry `detailed`, chiffrée, jamais ici. Un compteur d'occurrences n'est pas une valeur : `queryParamRepeats` respecte cette contrainte à l'identique, il ne fuite rien de plus que la liste de noms.

**Pourquoi `queryParamRepeats` existe, et pourquoi il ne se contente pas de dédupliquer (arbitrage rendu contre la première version de cette section).** §19.4 distingue quatre causes de refus sur l'axe query. Trois se lisent dans la configuration de l'auteur : le paramètre non déclaré se lit dans le formulaire, la valeur non couverte se lit dans le filtre, le paramètre requis absent se lit dans `required`. **Le surnombre d'occurrences ne se lit nulle part** : ni dans le blob, ni dans le formulaire, ni dans un message de génération (§12.14). Une liste de noms simplement dédupliquée aurait affiché `ids` présent, une information que l'auteur avait déjà, et lui aurait caché la seule qui explique réellement son 403. `queryParamRepeats` ne liste que les paramètres réellement répétés, avec leur nombre d'occurrences : une requête sans répétition n'ajoute pas un octet au ring buffer, et un auteur bloqué par le plafond de §19.4 voit enfin le paramètre et le compte qui l'expliquent.

**Pourquoi un tableau de paires plutôt qu'un objet indexé par nom.** Les noms de paramètres sont entièrement contrôlés par l'appelant. Une clé `__proto__` sur un objet littéral modifie le prototype de l'objet au lieu d'y créer une propriété : un attaquant qui nomme un paramètre `__proto__` pourrait ainsi affecter la valeur observée pour n'importe quel autre nom, ou celle d'objets créés ensuite avec le même prototype, selon la façon dont le champ est ensuite lu et fusionné côté client. Un tableau de paires `[string, number][]` n'a pas cette classe de risque : une clé de nom n'a aucun effet spécial sur la structure qui la contient.

**Champ additif, pas une rupture du flux.** `queryParamNames` garde son type et son nom d'origine : un client `/logs/stream` déjà écrit continue de fonctionner sans rien changer, il ignore simplement `queryParamRepeats` et `queryParamNamesTruncated` s'il ne les lit pas. Un client qui veut afficher le nombre d'occurrences ou signaler une troncature doit être mis à jour pour les lire, ce qui est une évolution, pas une migration forcée.

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
| Label de la ligne de query (v5), affiché sous une entry network dès que `queryParamNames` est non vide | « query : » suivi de la liste des noms, séparés par des virgules ; un nom répété s'affiche `{nom} x{n}` (`queryParamRepeats`, §14.6) ; `, ...` en fin de liste si `queryParamNamesTruncated` |

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

---

## 18. Politique de sortie et limites de ressources

Cette section résume les contrats établis par l'ADR-0009 (sortie du proxy) et l'ADR-0010 (limites de ressources). Les ADR font foi sur le raisonnement, cette section sur le comportement observable.

### 18.1 Les quatre garanties

Le contrat vaut pour **tout appel réseau sortant émis par FGP**, sans exception : forward du proxy, endpoints d'aide de l'UI, obtention de credentials upstream. Tous passent par un point de sortie unique.

| Garantie | Énoncé |
|----------|--------|
| **G1, destination** | Toute requête sortante vise un schéma `http` ou `https` et une adresse **publique**. FGP ne se laisse pas utiliser comme relais vers le réseau privé de son hébergeur. |
| **G2, chemin** | Le chemin autorisé par les scopes est le chemin émis vers l'upstream, octet pour octet. Aucune forme décodée ou normalisée n'échappe au contrôle. Indépendant du mode de livraison du blob. |
| **G3, en-têtes** | L'authentification que voit l'upstream vient du blob, jamais de l'appelant. Aucun en-tête de transport, d'authentification ou de provenance fourni par l'appelant n'atteint l'upstream (§11.2). |
| **G4, query** | Les paramètres de query sont soit contraints par le scope, soit transmis librement, et l'outillage dit lequel des deux s'applique. Il n'existe aucun cas où l'interface affirme une contrainte que le proxy n'applique pas. |

Les non-garanties sont énumérées en §13, au même titre que les garanties. Une politique de sécurité qui ne dit pas ce qu'elle ne couvre pas invite à lui prêter des propriétés qu'elle n'a pas.

### 18.2 Hôte : refus par nature de l'adresse

FGP est agnostique par conception, donc **pas d'allowlist de cibles** : elle transformerait un proxy générique en passerelle configurée. La décision est prise à l'envers, **tout hôte public est autorisé, toute destination non publique est refusée**, ce qui ne restreint aucun usage légitime.

Trois temps :

1. **Forme**, purement syntaxique. Le `target` doit être une URL absolue en `http` ou `https`, sans userinfo, sans query, sans fragment, avec un chemin de base ne contenant ni `%2f`, ni `..`, ni `\`. Vérifié à la génération (400 `invalid_target`) et au déchiffrement (blob malformé, donc 401 `invalid_credentials`).
2. **Adresse**, après résolution. Les plages loopback, privées, link-local, CGNAT, unique-local, multicast et réservées sont refusées, en IPv4 comme en IPv6 et dans toutes leurs notations, ainsi que les noms en `.internal`, `.local`, `.localhost`, `.home.arpa` et les noms sans point. Pour un nom, **toutes** les adresses résolues doivent être publiques. Refus en 403 `target_forbidden`.
3. **Redirections non suivies** (`redirect: "manual"`). Sans cela la classification ne vaut rien : un hôte public autorisé redirigerait vers l'adresse de métadonnées, et les en-têtes d'auth y seraient rejoués.

Un échec de résolution DNS n'est **pas** un refus de politique : la requête continue et échoue naturellement en 502 `upstream_unreachable`. Un nom qui ne résout pas ne joint rien, et transformer chaque incident DNS en refus opaque n'apporterait rien.

Le champ `apiUrl` du mode `scalingo-addon`, ainsi que le `target` de `/api/list-apps` et `/api/list-addons`, reçoivent une contrainte plus forte : leur hôte doit se terminer par `.scalingo.com`. Ce n'est pas une entorse à l'agnosticisme, qui est une propriété de `target` et non des modes d'auth propriétaires : ce mode présente un bearer de compte à l'hôte désigné, un `apiUrl` libre serait un canal d'exfiltration de credential.

**Le rebinding DNS reste ouvert.** Entre la résolution de contrôle et le `fetch`, le nom est résolu une seconde fois par le runtime et rien ne garantit la même réponse. La défense réelle est le filtrage d'egress au niveau réseau, au déploiement. La politique de code est un ralentisseur solide, elle n'est pas une preuve.

### 18.3 Chemin : contrôle sur toutes les formes, émission de la forme brute

Le contrôle porte sur **deux formes** du chemin, l'émission sur une seule.

```
formeBrute      = le chemin tel que reçu, à l'octet près
formeCanonique  = décodage percent répété jusqu'au point fixe (3 tours max),
                  puis `\` remplacé par `/`, slashes répétés écrasés,
                  puis résolution des segments `.` et `..`

accès autorisé  <=>  autorisé(formeBrute) ET autorisé(formeCanonique)
émission        =    formeBrute
```

La règle est **fail-closed et monotone** : ajouter une forme au jeu de vérification ne peut que réduire l'ensemble autorisé, jamais l'élargir. L'ADR-0006 est intact, ce qui part sur le fil est inchangé.

Les deux voies naturelles ont été écartées et méritent d'être connues, parce qu'elles reviendront : **refuser `%2f`** casse les APIs qui encodent un `/` dans un identifiant (GitLab en tête), et **décoder avant de forwarder** casse les mêmes APIs plus profondément, silencieusement, en émettant une route différente de celle demandée.

Conséquences observables :

- L'attaque tombe : brut `/v1/public/..%2f..%2fadmin`, canonique `/admin`, le scope `GET:/v1/public/*` ne couvre pas la seconde forme, donc 403 `scope_denied`.
- Le cas légitime passe : brut `/api/v4/projects/groupe%2Fprojet`, canonique `/api/v4/projects/groupe/projet`, le scope `GET:/api/v4/projects/*` couvre les deux.
- **Certains scopes en correspondance exacte deviennent plus stricts.** Un scope `GET:/projects/groupe%2Fprojet` ne suffit plus seul, la forme décodée doit être couverte aussi. C'est le coût ergonomique assumé de la décision.
- Un chemin contenant un octet NUL ou un caractère de contrôle après décodage est rejeté en 400 `invalid_request`.
- Les deux modes de livraison du blob produisent désormais la **même** chaîne pour la même requête. Auparavant `/v1//public//x` était évalué différemment en mode URL et en mode header, soit deux surfaces d'autorisation pour un seul blob.

### 18.4 Query : contrainte optionnelle via `queryFilters` (v5)

**Ce qui était vrai jusqu'à v5, et reste vrai par défaut : un blob scopé sur un chemin autorise toutes les querys de ce chemin**, tant que le `ScopeEntry` ne porte pas de `queryFilters`. Un scope `GET:/v1/items` sans `queryFilters` laisse passer `/v1/items?action=delete&scope=all`. C'est le comportement de la majorité des blobs, ceux qui n'utilisent pas la feature, et il ne change pas.

**Depuis v5, la query entre dans le modèle de scopes**, sous la forme d'un axe `queryFilters` sur `ScopeEntry`, opt-in, avec déni par défaut à l'intérieur du scope qui le porte. Ce n'est plus une dette : c'est livré. Détail complet, sémantique de `required`, restriction du type `any`, gestion des occurrences répétées et plafonds, en §19.

Trois points restent acquis depuis le lot de sécurité et n'ont pas bougé :

1. **Un `?` dans un pattern de scope est refusé à la génération** (400 `invalid_scope`). Un scope qui veut contraindre sa query utilise `queryFilters`, jamais le pattern. Au déchiffrement, un blob qui porte un `?` dans un pattern reste valide, le pattern est simplement sans effet : refuser casserait des blobs vivants sur leurs autres scopes pour un gain de sécurité nul.
2. **Le comportement par défaut (sans `queryFilters`) est dit partout** : ici, dans le panneau Doc (§12.10) et dans `/llms.txt`.
3. **Le testeur de scopes ne ment plus**, et distingue désormais les deux états (§12.5).

### 18.5 Limites de ressources

Toutes calibrées sur un critère unique : **aucune primitive optionnelle ne doit coûter plus cher que la dérivation de clé obligatoire déjà présente sur le chemin**, soit environ 11,6 ms. Une fonctionnalité optionnelle qui dépasse ce plancher devient le coût dominant de l'instance. Le détail chiffré est dans `docs/limits.md`, les mesures dans l'ADR-0010.

Ce qui est observable côté client :

- **413 `payload_too_large`** sur `/api/*` au-delà du plafond de la route, et sur le proxy au-delà de 512 Ko de corps quand un body filter ou la capture detailed est actif.
- **Le streaming du corps proxy est préservé** quand aucun body filter ni capture detailed n'est actif : les gros uploads à travers le proxy continuent de passer sans être mis en mémoire. C'est une propriété du proxy transparent qu'il ne fallait pas perdre en posant la limite au mauvais endroit.
- **400 `unsupported_regex`** quand une regex du blob sort du dialecte autorisé.
- **Un paramètre de query répété au-delà du plafond d'occurrences fait échouer le scope qui le filtre** (v5, §19.4) : 4 occurrences pour un filtre qui contient une regex à n'importe quelle profondeur, 64 pour les autres. Même code `scope_denied` que tout autre refus de scope. Contrairement aux autres limites de cette liste, celle-ci ne dépend d'aucune donnée du blob : elle porte sur la requête de l'appelant, pas sur ce que l'auteur du blob a écrit.

### 18.6 Limitation de débit : hors de l'application, et pourquoi

Toutes les limites ci-dessus bornent le **coût d'une requête**. Aucune ne borne le **nombre de requêtes**. C'est un choix.

Un limiteur en mémoire du processus est **quasi inopérant sur Deno Deploy** : l'état est par isolate, les isolates sont éphémères, et les requêtes se répartissent entre eux. Il fonctionnerait en auto-hébergement, où le processus est unique et durable. Livrer un limiteur applicatif efficace sur une cible de déploiement sur deux donnerait une **fausse couverture**, ce qui est pire que pas de couverture : l'opérateur croirait le problème réglé.

La limitation de débit est donc documentée **côté opérateur**, par cible de déploiement, dans `docs/deno-deploy.md` et `docs/scalingo-deploy.md`.

L'ordre de grandeur qui justifie qu'on ne l'ignore pas : avant les correctifs de l'ADR-0010, **1 900 requêtes suffisaient à épuiser les 20 heures de CPU mensuelles** du plan gratuit de la plateforme. Les correctifs suppriment le coût unitaire aberrant, ils ne suppriment pas la nécessité d'une borne sur le débit.

---

## 19. Query filters (v5)

Cette section spécifie l'axe `queryFilters` annoncé en §3.1, §6.1 et §18.4, arbitré par l'ADR-0009 §4 (forme du `QueryFilter`, opt-in, déni par défaut, bump en v5) et contraint par l'ADR-0010 (critère de dimensionnement des primitives optionnelles). Les points que les deux ADR laissent ouverts, et qui sont tranchés ici, sont signalés comme tels.

**Révision.** Cette section a été challengée par le testeur QA (`docs/review/challenge-query-filters-v5.md`) et corrigée sur cinq points bloquants (B1 à B5) et sept points tranchés par l'architecte (T1 à T7). Les corrections sont intégrées directement, sans les marquer en marge : une spec ne garde pas la trace de ses propres bugs corrigés, elle est juste correcte.

### 19.1 Ce que ça résout

Sans `queryFilters`, un scope ne contraint que la méthode et le chemin (§18.4) : `GET:/v1/items` autorise n'importe quelle query sur ce chemin, y compris des paramètres destructeurs (`?force=true`, `?action=delete`). Sur une API à dominante GET, la query **est** le corps de la requête au sens où le body l'est pour un POST : être fine-grained sur l'un et grossier sur l'autre est incohérent avec la promesse du produit (ADR-0009 §4, même argument que celui qui a justifié les body filters en ADR-0004).

`queryFilters` ferme cet axe, en restant **opt-in** : un scope qui n'en déclare pas garde exactement le comportement d'aujourd'hui.

### 19.2 Structure et sémantique

```typescript
interface QueryFilter {
  param: string;
  values: ObjectValue[];   // OR implicite, meme union que les body filters
  required?: boolean;      // defaut false
}
```

`values` réutilise l'union `ObjectValue` des body filters (§4.2) telle quelle : `any`, `wildcard`, `stringwildcard`, `regex`, `and`, `not`, avec une seule restriction contextuelle sur `any`, à toute profondeur d'imbrication (§19.3). Toutes les autres règles déjà posées pour `ObjectValue` s'appliquent sans exception aux valeurs d'un `queryFilter` : profondeur `and`/`not` à 4 niveaux, combinaisons interdites (§5), dialecte et ancrage des regex (ADR-0010 D3/D2). Rien de nouveau n'est inventé sur ce plan, c'est le même moteur de matching qui s'applique, avec en entrée la valeur brute du paramètre de query au lieu d'une valeur résolue dans le body JSON.

**Un `ScopeEntry` ne peut pas déclarer deux `queryFilters` sur le même `param`.** Deux filtres sur un même paramètre créeraient une ambiguïté de sémantique non résolue et non résolvable a priori (le premier gagne-t-il, sont-ils en AND, en OR ?), donc il n'y a rien à définir, seulement à rejeter : à la génération et **au déchiffrement** (§19.5), miroir exact de l'unicité déjà exigée des noms de headers d'auth (§6.3).

**Deux règles sémantiques gouvernent le comportement d'un `ScopeEntry` dès qu'il porte au moins un `queryFilter` non vide** (un tableau `queryFilters` vide est traité comme absent, §19.7) :

1. **Déni par défaut.** Tout paramètre présent dans la requête et dont le nom ne correspond à **aucun** `queryFilter` de ce `ScopeEntry` fait échouer ce scope. Ce n'est pas conditionné par `required` : c'est une propriété du `ScopeEntry` dès que `queryFilters` est non vide, indépendante de ce que chaque filtre déclare individuellement. Un scope qui déclare `queryFilters: [{param: "status", ...}]` refuse tout aussi bien `?other=1` que `?status=invalide`.
2. **Occurrences multiples en AND.** Un paramètre répété (`?tag=a&tag=b`) n'est autorisé que si **chacune** de ses occurrences satisfait `values` (OR entre les valeurs, AND entre les occurrences). Une seule occurrence qui ne matche aucune valeur suffit à faire échouer le filtre.

**Deux règles d'exécution, pour que le résultat ne dépende jamais d'un choix d'implémentation :**

3. **Le comptage des occurrences précède l'évaluation des valeurs (challenge testeur, B3).** Pour un paramètre couvert par un `queryFilter`, le nombre d'occurrences réellement présentes dans la requête est déterminé **avant** qu'aucune valeur ne soit comparée à `values`. Si ce nombre dépasse le plafond applicable (§19.4), le filtre échoue immédiatement pour surnombre, sans regarder si les valeurs envoyées auraient matché. Sans cet ordre fixé ici, le message de diagnostic dépendrait de l'ordre dans lequel l'appelant a rangé ses paramètres dans l'URL, et un dev qui évalue occurrence par occurrence pourrait renvoyer « valeur non autorisée » sur une requête dont le seul problème est le nombre d'occurrences (détail des quatre messages en §12.5).
4. **L'axe query est évalué une seule fois par requête, en amont de la double passe brute/canonique du chemin, jamais à l'intérieur (challenge testeur, T4).** `checkRequestAccess` (§18.3) évalue le chemin sous sa forme brute, puis, si elle diffère, sous sa forme canonique. L'axe query n'a aucun rapport avec cette normalisation de chemin et ne doit jamais être réévalué à la seconde passe : un appelant qui force cette seconde passe (`//v1/items`, `/v1/./items`) ne doit pas pouvoir doubler au passage le coût de l'évaluation query, ce qui doublerait aussi le pire cas chiffré en §19.4.

#### La matrice de `required`

**Ce que l'ADR-0009 laisse ouvert et que cette section tranche.** `required` a un défaut à `false`, mais l'ADR ne dit pas ce que `false` implique quand le paramètre est absent. Les quatre cas, croisant présence du filtre et présence du paramètre dans la requête :

| | Paramètre **présent** dans la requête | Paramètre **absent** de la requête |
|---|---|---|
| **Filtre déclaré** pour ce nom, `required: true` | Chaque occurrence doit satisfaire `values`. Une occurrence qui échoue → scope refusé. | Scope refusé : le paramètre requis manque. |
| **Filtre déclaré** pour ce nom, `required: false` (défaut) | Identique à `required: true` quand le paramètre est présent : chaque occurrence doit satisfaire `values`. `required` ne change rien à l'évaluation d'une valeur présente, il ne gouverne que l'absence. | Ce filtre est trivialement satisfait : rien à vérifier, son absence n'est pas un problème. Le scope peut matcher (sous réserve des autres filtres). |
| **Aucun filtre déclaré** pour ce nom | Scope refusé : déni par défaut (règle 1 ci-dessus), quel que soit le `required` des *autres* filtres du même `ScopeEntry`. | Rien à vérifier, sans effet sur le match. |

**Le piège d'articulation à ne pas laisser un lecteur reconstruire seul** : les deux lignes du tableau qui parlent d'un « filtre déclaré » répondent à la question *que devient une valeur que j'ai prévue*, la troisième ligne répond à une question différente, *que devient un paramètre que je n'ai pas prévu du tout*. `required: false` sur le filtre `page` ne rend jamais un paramètre `sort` non déclaré tolérable : le déni par défaut ne se désactive pas filtre par filtre, il se désactive uniquement en retirant `queryFilters` du `ScopeEntry` en entier.

### 19.3 Arbitrage 1 : le type `any` est restreint aux chaînes, à toute profondeur

**Le piège que l'ADR-0009 signale sans le trancher, tranché ici, et plus profond qu'il n'y paraît (challenge testeur, B4).** Un paramètre de query est **toujours une chaîne** sur le fil, alors que `ObjectValue` de type `any` est typé sur `JsonValue` (string, number, boolean, null, array, object). Un filtre `{"type":"any","value":1}` appliqué à `?page=1` comparerait le nombre `1` à la chaîne `"1"` : elles ne sont jamais égales, le filtre ne matche jamais, et rien ne le signale à l'auteur. C'est un piège silencieux. Trois issues sont possibles : restreindre, coercer, ou laisser passer. La troisième est exclue d'emblée.

**Décision : `any` sur un `queryFilter` n'accepte que `string`, à n'importe quelle profondeur d'imbrication dans un `and` ou un `not`, jamais seulement au premier niveau.** `{"type":"and","value":[{"type":"any","value":1},{"type":"wildcard"}]}` est tout aussi refusé qu'un `any` non-string isolé. Le rejet a lieu **au déchiffrement** (blob refusé), pas seulement empêché côté formulaire : une restriction qui ne vivrait que dans l'UI n'en serait pas une, le salt étant public et un blob se forgeant hors ligne (ADR-0009 §2). Elle est doublée à la génération avec un message actionnable.

**Pourquoi restreindre plutôt que coercer.** Le projet a déjà tranché ce genre de question une fois, dans l'autre sens qu'on pourrait croire à première vue mais pour la même raison : `any` a été interdit sur les objets et tableaux (ADR-0010 D4) parce que la comparaison `JSON.stringify` dépendait de l'ordre de sérialisation du **client**, une donnée que l'auteur du blob ne contrôle pas. Coercer ici reproduirait un défaut de même nature, pas identique mais parent : le blob porterait une valeur typée (`1`, `true`, `null`) que l'auteur écrit en pensant JSON, alors que la seule chose qui existe réellement sur le fil est une chaîne. Avec le parseur standard (`URLSearchParams`), `?flag` et `?flag=` produisent la **même** valeur, une chaîne vide : un seul état, pas deux. `?flag=null` en est un second, distinct, la chaîne littérale `"null"`. Un JSON `null` unique ne représente proprement ni l'un ni l'autre sans un arbitrage que l'auteur ne voit pas au moment où il écrit sa valeur. Restreindre à `string` supprime la question : l'auteur écrit exactement ce qui sera comparé, sans traduction intermédiaire.

**Le cas `not` : ce n'est pas un filtre mort, c'est un filtre qui autorise tout, et c'est le plus grave des deux symptômes (ajout du challenge testeur, B4).** Le premier symptôme décrit ci-dessus (`any` non-string isolé, ou dans un `and`) produit un filtre qui ne matche **jamais** : un scope trop strict, gênant mais sûr. Sous `not`, l'effet s'inverse. Le matching compare par `JSON.stringify` : `JSON.stringify(1)` vaut `"1"`, `JSON.stringify("1")` vaut `"\"1\""`, jamais égaux, donc `any` non-string contre n'importe quelle chaîne envoyée retourne toujours `false`. `not` inverse ce résultat : `not({type:"any", value:1})` retourne donc **toujours vrai**, quelle que soit la valeur envoyée par l'appelant. Un auteur qui écrit « exclure la page numéro 1 » avec `{"type":"not","value":{"type":"any","value":1}}` obtient un filtre qui accepte tout. Ce n'est plus un scope trop strict, c'est un **fail-open** sur l'axe même dont la raison d'être est de bloquer `?force=true` (§19.1). C'est ce cas, et lui seul, qui rend le rejet au déchiffrement non négociable : un formulaire qui empêcherait juste la saisie ne protège rien contre un blob écrit à la main.

**Conséquence pour l'UI (§12.14) :** le sélecteur de sous-type Texte / Nombre / Booléen / Null, présent sur `any` dans les body filters, n'existe pas pour les query filters, **y compris dans les sous-conditions imbriquées d'un `ET` ou d'un `Exclure`**. Un seul champ texte, sans choix à faire, à quelque profondeur que ce soit.

**Ce que cette restriction ne touche pas :** `stringwildcard`, `regex`, `wildcard`, `and`, `not` fonctionnent déjà exclusivement sur des chaînes ou sans valeur propre (`matchObjectValue` retourne `false` sur un type non-string pour `stringwildcard` et `regex`), donc rien ne change pour eux. Seul `any` avait une porte ouverte sur `JsonValue`, et c'est cette porte qui se referme, à tous les étages.

### 19.4 Occurrences répétées : un plafond à deux paliers, à la charge de la requête

**Ce que l'interaction ADR-0009/ADR-0010 signale sans le chiffrer, chiffré une première fois puis corrigé par la mesure (challenge testeur, B5).** ADR-0010 établit que les plafonds de dénombrement (4 `regex`, 256 `ObjectValue`, largeur d'`and` à 8) sont globaux au blob, comptés sur l'union des `bodyFilters` et des `queryFilters`. Ces plafonds bornent ce que **l'auteur du blob** peut écrire. Ils ne bornent pas ce qu'**un appelant** peut envoyer : un paramètre de query répété (`?tag=a&tag=b&tag=c...`) multiplie le nombre d'évaluations d'un même `queryFilter` proportionnellement au nombre d'occurrences, sans que le blob n'ait rien de plus à contenir pour ça. C'est un vecteur que les plafonds structurels de l'ADR-0010 ne couvrent pas, parce qu'il ne vit pas dans le blob.

**Le plafond uniforme de 4, retenu initialement, a été mesuré et invalidé.** Un plafond unique calibré sur le pire cas (`regex`) interdisait, pour un coût qui n'existe pas dans le cas général, un usage banal : un paramètre répété avec des valeurs `any` ou `stringwildcard`, la forme la plus courante de filtrage par liste sur les API à dominante GET que §19.1 cite comme cas d'usage principal (`expand[]` chez Stripe, `fields` chez Elasticsearch, `include` en JSON:API, `labels` chez GitHub). Sur ces API, cinq identifiants dans un même paramètre est une requête banale, pas une attaque, et un plafond de 4 la refuse sans qu'aucune sortie ne préserve à la fois l'usage et la contrainte : retirer le `queryFilter` perd la protection cherchée, ajouter un second scope sans `queryFilters` sur le même chemin la neutralise tout aussi silencieusement, découper en plusieurs `ScopeEntry` ne change rien puisque le plafond porte sur la requête et non sur le blob.

**Décision, tranchée par l'architecte : deux paliers.**

- **4 occurrences** pour un `queryFilter` dont `values` contient **au moins une valeur `regex`, à n'importe quelle profondeur d'imbrication** dans un `and` ou un `not`.
- **64 occurrences** pour tout autre `queryFilter` (`any`, `wildcard`, `stringwildcard`, ou des combinaisons `and`/`not` n'en contenant aucune).

Le palier applicable à un `queryFilter` donné est déterminé **une seule fois, au déchiffrement du blob**, en lisant si `values` contient un `ObjectValue` de type `regex` : le même parcours que celui déjà fait pour le budget global de 4 `regex` par blob (ADR-0010 D2), sur une union fermée dont le discriminant `type` ne peut pas être mal lu. Il ne dépend d'aucune donnée de la requête, seulement du blob, et peut donc être calculé une fois par blob et réutilisé à chaque requête. Les deux paliers restent **fail-closed** : au-delà, le filtre échoue quelles que soient les valeurs envoyées, jamais un troncage silencieux des occurrences en trop (règle d'exécution 3, §19.2).

**Le parallèle avec la couche 1 de l'ADR-0010 D2, invoqué dans la version précédente de cette section pour justifier l'uniformité, était faux et il est retiré.** Cette couche refuse délibérément d'**analyser la source d'une regex** pour y repérer un motif dangereux, parce qu'un tel analyseur est un parseur écrit à la main qui peut lui-même se tromper : l'ADR-0010 le désigne en toutes lettres comme son propre point faible assumé. Déterminer si un `queryFilter` contient un `ObjectValue` de type `regex` n'est pas une analyse de motif, c'est la lecture d'un discriminant sur une union fermée et déjà validée par ailleurs : elle ne peut pas se tromper, il n'y a rien à parser. L'argument d'analogie ne tenait donc pas ; le retirer laisse le vrai argument, qui est la mesure.

**Ce que les mesures disent.** Sur le pire cas construit délibérément (16 valeurs OR d'un même filtre, dont les 4 `regex` du budget global entier concentrées sur ce seul filtre, appliqué à un paramètre répété 4 fois), l'ordre de grandeur reste celui déjà avancé, environ 40 ms au coût de référence de l'ADR-0010 (2,54 ms par évaluation regex à 128 caractères), **confirmé par une mesure indépendante du testeur QA** sur le code réel du projet. Le même calcul pour 64 occurrences de valeurs `any` ou `stringwildcard` (1 024 évaluations) coûte environ 0,2 ms, mesuré, soit un cinquantième d'une seule évaluation `regex` et un cinquantième de la dérivation PBKDF2 (11,6 ms) que toute requête paie de toute façon. Le palier de 64 est choisi pour couvrir confortablement les cas réels de paramètres répétés cités plus haut sans s'approcher du budget D0 ; **il reste, comme le 4, une estimation à confirmer par le test de performance dédié avant d'être considéré définitif**, exigence déjà posée par la version précédente de cette section pour le seul palier de 4 et qui s'étend maintenant au palier de 64.

**La porte de sortie devient explicite, et la copy doit la dire au moment de la saisie, pas dans une note de bas de page.** Un auteur qui a besoin de plus de 4 occurrences sur un paramètre filtré par une regex a désormais une issue concrète : passer ce filtre en `stringwildcard`, qui couvre la plupart des besoins réalistes (préfixe, suffixe, motif simple) et rejoint le palier à 64. C'est cette information, au moment où l'auteur choisit le type de son filtre (§12.14), qui débloque l'utilisateur qui se serait retrouvé enfermé, pas une explication qu'il ne lira qu'après avoir buté dessus en production.

### 19.5 Validation : aucune capacité ne doit se perdre en silence

**Exigence fonctionnelle, la mécanique reste au choix du dev (challenge testeur, B2).** Le schéma qui valide un `ScopeEntry` à `POST /api/generate` et à `POST /api/share/encode` doit **rejeter** toute clé non reconnue, jamais la faire disparaître silencieusement. Un `queryFilters` mal placé, mal orthographié, ou envoyé à un schéma qui ne le connaît pas encore, ne doit produire ni un blob amputé de sa contrainte ni une configuration partagée qui perd le filtre en route : dans les deux cas, l'auteur croit avoir contraint sa query, et il ne l'a pas fait, sans le moindre message pour le signaler. C'est exactement le fail-open silencieux que le déni par défaut de §19.2 existe pour empêcher au moment du matching, rouvert par la porte d'à côté si la validation d'entrée n'est pas aussi stricte que le moteur de matching lui-même.

**La validation à la génération doit s'exécuter pour tout `ScopeEntry` qui porte des `bodyFilters` OU des `queryFilters`, jamais seulement quand `bodyFilters` est présent.** Un `ScopeEntry` GET avec uniquement des `queryFilters`, sans aucun `bodyFilters`, est le cas le plus courant de la feature (§19.1, les API à dominante GET) : il doit recevoir exactement le même niveau de validation qu'un `ScopeEntry` POST avec des `bodyFilters`. Les quatre messages de §12.5 et les messages de §12.14 n'ont de sens que si cette validation se déclenche pour ce cas, pas seulement pour celui qui porte historiquement des `bodyFilters`.

**Le doublon de `param` sur un même `ScopeEntry` est rejeté au déchiffrement, pas seulement à la génération (challenge testeur, T6).** Le salt serveur est public (ADR-0009 §2) : n'importe qui fabrique un blob hors ligne, donc une règle qui ne vivrait qu'au moment de `/api/generate` ne protège personne contre un blob forgé à la main. Miroir exact de l'unicité des noms de headers d'auth, déjà exigée au déchiffrement (§6.3).

### 19.6 Limites structurelles

Détail chiffré et justifié dans `docs/limits.md`, résumé en §5. Rappel des points qui ne sont **pas** nouveaux : `queryFilters` par `ScopeEntry` (8 max) et valeurs OR par filtre (16 max) reprennent exactement les plafonds des body filters, pour la même raison (au-delà, scinder en plusieurs scopes). Les plafonds réellement nouveaux sont le palier d'occurrences à deux niveaux (§19.4) et l'unicité des `param` (§19.5).

### 19.7 Version du blob : un plancher par axe, jamais une égalité

**Erreur trouvée dans §6.3 et corrigée là où elle vit, expliquée ici (challenge testeur, B1).** §6.3 disait, depuis la v4 et resté inchangé par erreur au moment d'écrire v5 : « Si `auth` est un objet, alors `v` doit valoir `4` ». Lue littéralement, cette règle teste `v === 4` et rejette donc un blob v5 dont `auth` est structuré, alors que §6.1 promet l'inverse deux sections plus haut. Ce n'est pas un cas tordu : c'est l'intersection de deux features livrées à quelques mois d'écart, les headers multiples (US-8, v4) et `queryFilters` (v5). Le premier blob qui combine les deux tombe dessus, avec pour symptôme un `401 invalid_credentials` qui envoie son porteur vérifier une clé qui n'a jamais été le problème.

**La règle corrigée, valable partout où une version est testée dans ce document et dans le code (§6.1, §6.3, §6.5) :**

- `queryFilters` non vide sur au moins un `ScopeEntry` → `v` doit être **au moins** `5` (`v >= 5`)
- `auth` structuré (`AuthSpec`) → `v` doit être **au moins** `4` (`v >= 4`)
- au moins un scope structuré (`ScopeEntry`, avec ou sans filtres) → `v` doit être **au moins** `3` (`v >= 3`)
- sinon → `v` doit être **au moins** `2` (`v >= 2`)

`v` publié dans le blob est le **maximum** des planchers imposés par ce que le blob contient réellement, jamais une égalité testée contre un seul axe. Un blob v5 peut donc avoir une auth string simple et des scopes sans `bodyFilters` : seul l'axe `queryFilters` a poussé son plancher à 5, les deux autres n'imposaient qu'un plancher de 2. La règle elle-même n'a pas changé depuis §6.1 ; ce qui change ici, c'est sa traduction correcte dans les contrôles de validation, qui doivent tester des inégalités, jamais des égalités.

**Un `v` sous-déclaré est rejeté au déchiffrement, symétriquement (challenge testeur, T5).** Un blob `v: 3` qui porte des `queryFilters` non vides ment sur son propre plancher : `v` doit être au moins 5 pour ce que le blob contient réellement, et un `v` inférieur au plancher requis rend le blob malformé, refusé au déchiffrement, exactement comme une capacité manquante l'aurait fait dans l'autre sens. Sans ce contrôle, un blob mal généré, ou délibérément sous-déclaré pour cibler un vieux proxy, verrait ses `queryFilters` silencieusement ignorés par un lecteur qui validerait la forme des scopes sans vérifier que le plancher de version déclaré leur correspond réellement. C'est le même fail-open que le bump en v5 existe pour fermer, découvert de l'autre côté du contrôle.

**Un tableau `queryFilters` vide (`[]`) n'impose aucun plancher et n'est pas considéré comme « porter » des `queryFilters` (challenge testeur, T5).** Il est sémantiquement identique à l'absence du champ : aucun déni par défaut ne s'applique (§19.2, « dès que `queryFilters` est non vide »). L'UI produira ce cas dès qu'un auteur ouvre le panel puis supprime son dernier filtre, moment où l'alerte de §12.14 disparaît d'ailleurs elle aussi. La sérialisation **omet** le champ plutôt que d'écrire un tableau vide, et le blob reste à la version qu'imposent ses autres axes. Générer un v5 pour un tableau vide casserait la lisibilité du blob sur un proxy antérieur pour une contrainte nulle, ce que l'ADR-0009 §4 refuse explicitement : « on refuse ce qui peut nuire, on ne casse pas ce qui est seulement inutile ».

Détail complet du comportement d'un proxy antérieur face à un blob v5, et d'un proxy à jour face à un blob v2 à v5, en §6.1 et §6.2, inchangés par cette correction qui ne porte que sur les contrôles internes de plancher.

### 19.8 Diagnostic et observabilité

**Le mode de défaillance nominal de cette feature n'est pas l'auteur qui écrit un mauvais filtre, c'est un tiers qui ajoute un paramètre à son insu (challenge testeur, T1).** Pagination injectée par un SDK (`per_page`, `page`), cache-busting jQuery (`_=1712534400`), version d'API ajoutée par un client généré depuis un OpenAPI (`api-version`), tracking collé quand l'URL transite par un outil (`utm_*`). Aucun de ces paramètres n'apparaît dans le code de l'auteur, et le déni par défaut les refuse tous aussi sûrement qu'un `?force=true`.

**Ce que voit l'auteur aujourd'hui quand ça arrive, et pourquoi ce n'est pas suffisant :**

1. En production, `403 scope_denied`, générique. **C'est la bonne décision et elle ne change pas** (§8.2, §12.5) : un appelant anonyme n'a pas à apprendre la structure du blob en sondant ses réponses d'erreur.
2. Dans `/logs`, rien : la query n'était jusqu'ici pas capturée du tout. Une feature construite pour observer ce qui traverse un blob ne montrait pas l'axe sur lequel une requête a été refusée.
3. Dans le testeur de scopes, un diagnostic exact et nommé (§12.5), à la seule condition de connaître déjà la query exacte envoyée par son propre client, précisément l'information qui manque quand le paramètre en trop vient d'une couche que l'auteur ne contrôle pas.

**Décision, tranchée par l'architecte : la capture `/logs` enregistre les noms des paramètres de query et le nombre d'occurrences des seuls paramètres répétés, jamais aucune valeur (§14.6, champs `queryParamNames` et `queryParamRepeats`).** Les noms seuls suffisent au diagnostic pour trois des quatre causes de refus de §19.4 : voir `per_page` dans la liste d'une requête refusée explique un paramètre non déclaré, une valeur non couverte ou un requis absent, parce que ces trois-là se lisent déjà dans la configuration de l'auteur. Ils ne suffisent pas pour la quatrième : le surnombre d'occurrences ne se lit nulle part ailleurs, et une liste dédupliquée aurait montré `ids` présent sans jamais révéler qu'il l'était cinq fois, la seule information qui explique ce refus précis (arbitrage rendu contre la première version de cette section, qui dédupliquait sans exception). Les valeurs, elles, contiennent régulièrement des secrets (`api_key`, `token`, `session`), et l'entrée network vit **en clair** dans le ring buffer, contrairement au body `detailed` qui est chiffré côté client (§14.8) : y écrire des valeurs de query en ferait un vecteur de fuite à part entière, sur une surface que rien ne protège aujourd'hui. Un compteur d'occurrences n'est pas une valeur, cette contrainte reste intacte. Un besoin futur de voir les valeurs a sa place dans l'entrée `detailed`, chiffrée, jamais dans l'entrée network.

**Conséquence, assumée : deux champs de plus dans le schéma d'events de §14.6.** Additifs, pas une rupture au sens de l'ADR-0009 (aucun champ existant ne change de sens ni ne disparaît, `queryParamNames` garde son type) : un client `/logs/stream` déjà connecté continue de fonctionner sans les lire, un client qui veut afficher le nombre d'occurrences doit être mis à jour pour le faire.

**Ce que ça ne remplace pas.** L'alerte de déni par défaut de §12.14 doit continuer à dire, au moment de la saisie, que des paramètres ajoutés par le client de l'auteur comptent aussi, pas seulement ceux que l'auteur écrit lui-même dans son formulaire : c'est ce qui permet d'anticiper le problème avant qu'il ne se manifeste. La capture dans `/logs` est ce qui permet de le diagnostiquer une fois qu'il s'est manifesté malgré tout. Les deux sont nécessaires, aucune ne suffit seule.

**Le testeur de scopes distingue par ailleurs, depuis §12.5, le scope qui a réellement accordé l'accès de ceux qui contraignent la query sans avoir été sollicités (challenge testeur, T2).** Le détail vit en §12.5, puisqu'il touche l'algorithme d'agrégation du verdict d'autorisation, pas la structure de `queryFilters` elle-même.

### 19.9 Ce que cette feature rend faux ailleurs dans le produit, et son traitement

Trois éléments du produit affirmaient, avant v5, une non-contrainte universelle de la query. Les trois sont mis à jour, pas seulement mentionnés :

- **Le panneau Doc** (§12.10, bloc 2 bis) : la non-contrainte reste vraie par défaut, la contrainte opt-in est maintenant dite à côté.
- **Le message de refus d'un `?` dans un pattern** (`invalid_scope`, §8.3) : renvoie désormais vers `queryFilters` plutôt que d'affirmer que la query n'est contrainte par rien. **Texte exact (challenge testeur, T7)**, en anglais comme le reste des messages de validation de ce fichier, pour remplacer le message actuel qui devient factuellement faux dès que la feature part : `A scope pattern cannot carry a query string: {pattern}. Use the queryFilters field on this scope to constrain query parameters, not the pattern.`
- **Le testeur de scopes** (§12.5) : distingue trois états, nomme le scope qui accorde réellement l'accès, et détaille le paramètre fautif (quatre causes) quand un scope à `queryFilters` refuse la requête testée.

### 19.10 Décodage de la query : ce que le parseur standard fait, et ce qu'il ne corrige pas

**Quatre comportements que §19.11 (ex-§19.8, non-goals, dans la version précédente de cette spec) évoquait en creux, et que le challenge testeur (T3) demande d'écrire noir sur blanc.** Mesurés avec `URLSearchParams`, le parseur que le dev utilisera :

| Entrée | Ce que voit le filtre | Ce qu'il faut en retenir |
|---|---|---|
| `?a=x+y` | `a` = `"x y"` | Le `+` devient une espace. Un auteur qui écrit `x+y` dans le formulaire en attendant un `+` littéral obtient un filtre qui ne matchera jamais cette forme. |
| `?flag` et `?flag=` | `flag` = `""` dans les deux cas | Les deux écritures sont **identiques** pour le filtre : une chaîne vide, pas deux états distincts (correction de §19.3, qui en affirmait trois à tort dans une version antérieure). |
| `?A=1&a=2` | deux paramètres distincts | Le nom d'un paramètre est **sensible à la casse**. Aucune normalisation n'est appliquée, à la différence des noms de headers d'auth qui sont comparés insensibles à la casse (§6.3) : les deux mécanismes sont volontairement différents, un nom de header HTTP et un nom de paramètre de query n'obéissent pas à la même convention côté cible. |
| `?a[]=1&a[]=2` | nom du paramètre = `"a[]"` | La forme employée par Stripe et par PHP pour les tableaux de query. L'auteur doit écrire `a[]`, crochets compris, dans le champ « Paramètre de query » : rien n'est réécrit ou interprété. |

**Le point-virgule comme séparateur : documenté, pas corrigé (T3).** `URLSearchParams` ne traite pas `;` comme un séparateur : `?a=1;force=true` donne **un seul** paramètre `a` valant `"1;force=true"`. Un filtre `{param: "a", values: [{type: "wildcard"}]}` l'accepterait tel quel. Mais certaines piles amont (Jetty en configuration historique, PHP selon `arg_separator.input`) découpent sur `;` et y verraient **deux** paramètres, dont `force=true`. C'est un différentiel de parseur entre FGP et une cible potentielle, de la même famille que celui qu'ADR-0009 §3 a pris au sérieux pour `%2f` sur le chemin. FGP ne le corrige pas : on ne peut pas deviner le parseur de la cible, et normaliser côté FGP casserait des valeurs légitimes contenant un `;`. C'est un non-goal explicite, ci-dessous.

### 19.11 Non-goals de cette feature

- **Pas de contrainte sur l'ordre des paramètres.** `?a=1&b=2` et `?b=2&a=1` sont strictement équivalents pour l'évaluation des `queryFilters`.
- **Pas de contrainte croisée entre paramètres.** Un `queryFilter` évalue un paramètre indépendamment des autres ; il n'existe pas de condition du type « si `status=deleted` alors `confirm` doit valoir `true` ». Une telle règle demanderait un langage de contrainte plus riche que l'union `ObjectValue`, hors périmètre de cette feature.
- **Pas de décodage applicatif au-delà du décodage standard de la query string.** Un paramètre encodé en JSON dans sa valeur (`?filter=%7B%22a%22%3A1%7D`) est comparé comme une chaîne brute après décodage percent standard, jamais re-parsé.
- **Pas de correction du différentiel de parseur sur le point-virgule** (§19.10). Documenté comme limite connue, au même titre que le rebinding DNS l'est en §13 : une limite écrite est un choix, la même limite non écrite est une découverte pour l'auditeur suivant.
