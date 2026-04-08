# Spécifications fonctionnelles — Fine-Grained Proxy (FGP)

**Version** : 2.0
**Date** : 2026-04-08
**Statut** : Draft

---

## 1. Vue d'ensemble

Fine-Grained Proxy (FGP) est un proxy HTTP stateless et API-agnostique qui ajoute un contrôle d'accès granulaire devant n'importe quelle API cible. Le proxy permet de créer des URLs à usage limité : scopées par méthode HTTP et chemin, avec une durée de vie configurable et un mode d'authentification adaptable.

Le proxy ne stocke rien. Toute la configuration (token, cible, mode d'auth, scopes) est chiffrée directement dans l'URL, déchiffrable uniquement par la combinaison d'une clé client et d'un salt serveur.

Depuis la v2 (cf. ADR 0003), le proxy n'est plus couplé à Scalingo. Scalingo reste supporté comme cas d'usage via le mode d'auth `scalingo-exchange`, mais le proxy peut protéger n'importe quelle API HTTP.

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

### US-3 — CI/CD : token de déploiement scopé

> En tant que responsable CI/CD, je veux un token qui ne peut que déployer une app précise, afin de limiter les dégâts si le secret du pipeline fuite.

**Critères d'acceptation** :
- L'URL ne fonctionne que pour `POST /v1/apps/my-app/deployments`
- Toute autre requête est refusée
- Le TTL peut être court (ex : 1h pour un run de pipeline)

### US-4 — Admin : accès large temporaire

> En tant qu'admin, je veux générer une URL FGP avec accès complet mais un TTL de 24h, afin de déléguer temporairement l'accès à un collègue.

**Critères d'acceptation** :
- L'URL utilise le scope `*:*` (toute méthode, tout path)
- Après le TTL, toute requête renvoie 410 Gone

### US-5 — Utilisateur : générer une URL via l'interface

> En tant qu'utilisateur FGP, je veux un formulaire web pour configurer et générer une URL FGP, afin de ne pas avoir à construire le blob chiffré manuellement.

**Critères d'acceptation** :
- Le formulaire permet de saisir le token, l'URL cible, le mode d'auth, les scopes et le TTL
- L'URL et la clé client sont affichées à la génération
- Le token n'est jamais stocké côté serveur

### US-6 — API tierce : protéger un accès à une API non-Scalingo

> En tant que développeur, je veux utiliser FGP pour restreindre l'accès à une API tierce (ex : un service interne, une API REST quelconque) avec un bearer token, en limitant les endpoints accessibles.

**Critères d'acceptation** :
- L'URL cible peut être n'importe quelle API HTTP (pas seulement Scalingo)
- Le mode d'auth peut être `bearer`, `basic` ou `header:{nom}`
- Les scopes `METHOD:PATH` contrôlent finement les endpoints autorisés

---

## 3. Scopes

### 3.1 Modèle de scopes

Les scopes sont des patterns `METHOD:PATH` qui définissent les requêtes autorisées.

#### Format

```
METHOD:PATH
```

| Composant | Description | Exemples |
|-----------|-------------|----------|
| `METHOD` | Méthode HTTP (ou `*` pour toutes). Multi-méthodes séparées par `\|`. | `GET`, `POST`, `GET\|POST`, `*` |
| `PATH` | Chemin d'API (ou `*` pour tous). Supporte le wildcard `*` en suffixe. | `/v1/apps`, `/v1/apps/*`, `*` |

#### Exemples de scopes

| Scope | Signification |
|-------|---------------|
| `GET:/v1/apps/*` | Lecture de toutes les ressources sous `/v1/apps/` |
| `POST:/v1/apps/my-app/scale` | Scale d'une app spécifique uniquement |
| `GET\|POST:/v1/apps/*` | Lecture et écriture sur les apps |
| `*:/v1/apps/*` | Toute méthode sur les apps |
| `*:*` | Accès total (wildcard complet) |

### 3.2 Règles de résolution

- Les scopes sont **additifs** : plusieurs patterns peuvent être combinés.
- Le matching est case-insensitive sur la méthode (`get` == `GET`).
- Le wildcard `*` en path matche tout chemin commençant par le préfixe avant le `*`.
- **Deny-all par défaut** : toute requête qui ne matche aucun scope est refusée avec 403 (`scope_denied`). Le proxy est une allowlist.
- Le scope sans `:` est interprété comme `*:{pattern}` (wildcard sur la méthode).

### 3.3 Algorithme de matching

Pour chaque requête entrante (méthode M, chemin P) :

1. Pour chaque scope de la configuration :
   a. Parser le scope en `{methods[], pattern}`
   b. Vérifier que M est dans `methods` (ou que `methods` contient `*`)
   c. Vérifier que P matche `pattern` :
      - `*` matche tout
      - Si pas de `*` : match exact
      - Si `*` en fin de pattern : P doit commencer par le préfixe avant `*`
2. Si au moins un scope matche → accès autorisé
3. Si aucun scope ne matche → 403 `scope_denied`

---

## 4. Format du blob chiffré

### 4.1 Structure JSON (avant chiffrement)

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

| Champ | Type | Description |
|-------|------|-------------|
| `v` | `number` | Version du format (actuellement `2`) |
| `token` | `string` | Token ou secret pour l'API cible |
| `target` | `string` | URL de base de l'API cible |
| `auth` | `string` | Mode d'authentification (voir section 10.1) |
| `scopes` | `string[]` | Liste de patterns `METHOD:PATH` |
| `createdAt` | `number` | Timestamp Unix (secondes) de création du blob |
| `ttl` | `number` | Durée de validité en secondes depuis `createdAt`. `0` = pas d'expiration. |

Le token est considéré expiré quand `Date.now() / 1000 > createdAt + ttl` (sauf si `ttl === 0`).

### 4.2 Processus de chiffrement

1. Sérialiser le JSON en UTF-8
2. Dériver la clé de chiffrement : `PBKDF2(client_key + server_salt, 100_000 iterations, SHA-256)` → clé AES-256
3. Générer un IV aléatoire de 12 bytes
4. Chiffrer avec AES-256-GCM → ciphertext + auth tag (16 bytes)
5. Encoder en base64url : `base64url(iv || ciphertext || tag)`

### 4.3 Processus de déchiffrement

1. Décoder le base64url
2. Extraire IV (12 premiers bytes), tag (16 derniers bytes), ciphertext (le reste)
3. Dériver la même clé avec PBKDF2(client_key + server_salt)
4. Déchiffrer AES-256-GCM et vérifier le tag d'authenticité
5. Parser le JSON
6. Valider la structure : `v === 2`, `target` et `auth` non vides, `scopes` est un tableau de strings

---

## 5. Format de l'URL

### 5.1 Structure

```
https://fgp.example.com/{blob}/v1/apps/my-app/containers
                         ^^^^  ^^^^^^^^^^^^^^^^^^^^^^^^
                         |     Chemin de l'API cible (forwarded tel quel)
                         |
                         Blob chiffré en base64url
```

Le proxy extrait le premier segment du path comme blob, et forward le reste vers l'API cible définie par `config.target`.

**Limite de taille** : le blob base64url ne doit pas dépasser **4 KB** (4096 caractères). Au-dela, l'UI refuse la generation et le proxy renvoie 414 URI Too Long. Cette limite previent les problemes de troncature par les reverse proxies et CDN en amont.

### 5.2 Exemples

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

### 5.3 Header requis

| Header | Requis | Description |
|--------|--------|-------------|
| `X-FGP-Key` | Oui | Clé client pour déchiffrer le blob. Sans elle, le blob est inexploitable. |

---

## 6. Comportement des erreurs

Le proxy renvoie des erreurs HTTP standardisées. Les messages d'erreur sont volontairement génériques pour ne pas leaker d'information sur la configuration interne.

| Code | Condition | Corps JSON |
|------|-----------|------------|
| **401 Unauthorized** | Header `X-FGP-Key` manquant | `{"error": "missing_key", "message": "X-FGP-Key header is required"}` |
| **401 Unauthorized** | Déchiffrement échoué (clé invalide ou blob corrompu) | `{"error": "invalid_credentials", "message": "Unable to decrypt token"}` |
| **403 Forbidden** | La méthode et/ou le path ne matchent aucun scope | `{"error": "scope_denied", "message": "Insufficient permissions for this action"}` |
| **410 Gone** | Le TTL du blob est expiré | `{"error": "token_expired", "message": "This token has expired"}` |
| **414 URI Too Long** | Blob base64url > 4 KB | `{"error": "blob_too_large", "message": "Encrypted blob exceeds maximum size"}` |
| **502 Bad Gateway** | Erreur réseau ou HTTP 5xx de l'API cible | `{"error": "upstream_error", "message": "Target API is unavailable"}` |
| **502 Bad Gateway** | Token rejeté par l'API cible (401 upstream) | `{"error": "upstream_auth_failed", "message": "Target API rejected the token"}` |
| **429 Too Many Requests** | Rate limit de l'API cible atteint (429 upstream) | `{"error": "rate_limited", "message": "Rate limit exceeded, retry later"}` |

### Ordre de vérification

Le proxy vérifie dans cet ordre, et renvoie la première erreur rencontrée :

1. Taille du blob → 414
2. Présence du header `X-FGP-Key` → 401 (missing_key)
3. Déchiffrement du blob → 401 (invalid_credentials)
4. Vérification du TTL → 410 (token_expired)
5. Vérification du scope (méthode + path) → 403 (scope_denied)
6. Forward vers l'API cible → 502/429 selon la réponse

---

## 7. Rate limiting

### 7.1 Stratégie FGP

FGP ne fait pas de rate limiting propre. La stratégie est transparente :

1. **Forward transparent** : les requêtes sont transmises à l'API cible telles quelles.
2. **Propagation du 429** : si l'API cible répond 429, FGP renvoie 429 au client avec le header `Retry-After` si présent.
3. **Pas de quota par URL** : FGP ne tente pas de répartir le budget entre les différentes URLs.

### 7.2 Optimisation : cache du bearer (Scalingo)

Pour le mode `scalingo-exchange`, l'exchange token → bearer compte dans le rate limit Scalingo (60 req/min). FGP met en cache le bearer en mémoire :

- Le bearer est stocké **en clair en mémoire** (le process est isolé, pas de persistence disque).
- Clé du cache : `SHA-256(token_scalingo)`
- TTL du cache : 55 minutes (le bearer Scalingo expire à 1h, marge de 5 minutes)
- **Concurrence (singleflight)** : si plusieurs requêtes arrivent en parallèle avec le même token et que le bearer a expiré, un seul exchange est exécuté. Les autres requêtes attendent le résultat via une `Promise` partagée. Si l'exchange échoue, toutes les requêtes en attente reçoivent l'erreur.

### 7.3 Considération future

Si le besoin se présente, un rate limiter local pourrait être ajouté pour protéger les utilisateurs d'eux-mêmes (ex : un script en boucle qui consomme tout le budget). Ce n'est pas dans le scope actuel.

---

## 8. UI de configuration

### 8.1 Accès

L'interface de configuration est servie à la racine du proxy :

```
GET https://fgp.example.com/
```

C'est une page HTML statique (Hono JSX, pas de framework frontend).

### 8.2 Flow utilisateur

```
┌─────────────────────────────────────────────┐
│  Presets: [Scalingo] [Vide]                  │
│                                              │
│  1. Token / Secret                           │
│     [                                    ]   │
│                                              │
│  2. URL cible                                │
│     [https://api.osc-fr1.scalingo.com    ]   │
│                                              │
│  3. Mode d'authentification                  │
│     [scalingo-exchange ▼]                    │
│                                              │
│  4. Scopes (METHOD:PATH, un par ligne)       │
│     ┌──────────────────────────────┐         │
│     │ GET:/v1/apps/*               │         │
│     │ POST:/v1/apps/my-app/scale   │         │
│     └──────────────────────────────┘         │
│                                              │
│     Helper Scalingo (si auth=scalingo):      │
│     [Charger les apps]                       │
│     ☑ my-app  ☐ other-app  ☐ staging        │
│                                              │
│  5. TTL                                      │
│     ○ 1h  ○ 24h  ○ 7j  ○ 30j  ○ Sans       │
│                                              │
│  6. [Générer l'URL]                          │
│                                              │
│  ┌─────────────────────────────────────────┐ │
│  │ URL : https://fgp.example.com/eyJ.../   │ │
│  │ Clé : a7f2c9...                         │ │
│  │ [Copier l'URL]  [Copier la clé]         │ │
│  └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

### 8.3 Étapes détaillées

1. **Preset** (optionnel) : des boutons de preset pré-remplissent la configuration pour des cas d'usage courants. Le preset "Scalingo" configure la cible, le mode d'auth et des scopes par défaut.

2. **Saisie du token** : l'utilisateur entre le token ou secret de l'API cible. Le token est envoyé au serveur FGP via HTTPS POST pour la génération. Il n'est jamais stocké côté serveur.

3. **URL cible** : l'URL de base de l'API que le proxy doit atteindre (ex : `https://api.osc-fr1.scalingo.com`).

4. **Mode d'authentification** : comment le proxy doit s'authentifier auprès de l'API cible :
   - `bearer` : envoie `Authorization: Bearer {token}`
   - `basic` : envoie `Authorization: Basic {base64(":"+token)}`
   - `scalingo-exchange` : échange le token Scalingo via l'API auth, puis utilise le bearer
   - `header:{nom}` : envoie le token dans un header custom

5. **Scopes** : patterns `METHOD:PATH` (un par ligne) définissant les requêtes autorisées. Pour le mode `scalingo-exchange`, un helper permet de charger la liste des apps et de générer les patterns automatiquement.

6. **TTL** : choix de la durée de validité. Des presets sont proposés (1h, 24h, 7j, 30j), avec possibilité de désactiver l'expiration. Un warning est affiché quand "pas d'expiration" est sélectionné.

7. **Génération (côté serveur, cf. ADR 0002)** : le chiffrement du blob est fait par le serveur FGP via `POST /api/generate` :
   - Le client envoie `{token, target, auth, scopes, ttl}` au serveur via HTTPS POST
   - Le serveur génère une clé client (`crypto.randomUUID()`)
   - Le serveur construit le JSON du blob v2
   - Le serveur dérive la clé de chiffrement via PBKDF2(client_key + server_salt)
   - Le serveur chiffre avec AES-256-GCM et encode en base64url
   - Le serveur retourne `{url, key}` au client

### 8.4 Sécurité de l'UI

- Le token est envoyé au serveur FGP via POST HTTPS pour le chiffrement. Le serveur ne stocke jamais le token (il est inclus dans le blob chiffré et immédiatement oublié).
- La clé client est générée côté serveur et retournée au client. Elle n'est jamais stockée côté serveur.
- Le salt serveur est public (il est nécessaire pour dériver la clé, mais inutile sans la clé client).
- L'UI affiche un warning quand `ttl: 0` (pas d'expiration) est sélectionné.
- L'UI refuse la génération si le blob dépasse 4 KB.

---

## 9. Endpoints internes du proxy

En plus du proxy principal, FGP expose des endpoints utilitaires :

| Endpoint | Méthode | Description |
|----------|---------|-------------|
| `/` | GET | UI de configuration |
| `/healthz` | GET | Health check (`{"status": "ok"}`) |
| `/api/salt` | GET | Retourne le salt serveur (`{"salt": "..."}`) |
| `/api/generate` | POST | Génération d'URL FGP (chiffrement serveur, cf. ADR 0002) |
| `/api/list-apps` | POST | Helper Scalingo : listing des apps via token exchange |
| `/{blob}/{path...}` | * | Proxy principal vers l'API cible |

---

## 10. Comportement du proxy (forward)

### 10.1 Modes d'authentification

Le proxy supporte quatre modes d'authentification, configurés dans le champ `auth` du blob :

| Mode | Comportement |
|------|-------------|
| `bearer` | Envoie `Authorization: Bearer {token}` directement |
| `basic` | Envoie `Authorization: Basic {base64(":"+token)}` |
| `scalingo-exchange` | Échange le token Scalingo via `POST {SCALINGO_AUTH_URL}/v1/tokens/exchange`, puis envoie `Authorization: Bearer {bearer}` |
| `header:{name}` | Envoie `{name}: {token}` (ex : `header:X-API-Key` envoie `X-API-Key: {token}`) |

### 10.2 Headers de requête

Le proxy forward tous les headers du client vers la cible, sauf :
- `X-FGP-Key` (consommé par le proxy, jamais transmis à la cible)
- `Host` (supprimé pour laisser le runtime résoudre le bon host)

Le header `Authorization` (ou le header custom) est défini selon le mode d'auth.

### 10.3 Headers de réponse

Le proxy propage tous les headers de la réponse de l'API cible, sauf :
- `Set-Cookie` (filtré, le proxy est stateless et ne doit pas propager de cookies)

### 10.4 Réponses non-JSON

Si l'API cible renvoie une réponse non-JSON (page de maintenance HTML, erreur texte), le proxy la propage telle quelle avec le `Content-Type` original. Les erreurs FGP elles-mêmes (401, 403, 410, 414, 429, 502) sont toujours en JSON.

---

## 11. Limites et non-goals (v2)

- **Pas de révocation** : une URL FGP ne peut pas être révoquée avant son TTL. La seule solution est de révoquer le token sous-jacent.
- **Pas de logging centralisé** : les requêtes passent par le proxy mais ne sont pas logguées dans un système externe. Seul le stdout du serveur est disponible.
- **Pas de rate limiting propre** : pas de quotas par URL, seulement la propagation du 429 upstream.
- **Pas de WebSocket** : seules les requêtes HTTP classiques sont proxyfiées.
- **Cache bearer uniquement pour Scalingo** : le cache du bearer (singleflight) est spécifique au mode `scalingo-exchange`. Les autres modes ne cachent rien.
