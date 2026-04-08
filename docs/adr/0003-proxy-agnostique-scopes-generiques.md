# ADR 0003 — Proxy agnostique avec scopes génériques METHOD:PATH

- **Date** : 2026-04-08
- **Statut** : Accepted

## Contexte

Le proxy était initialement couplé à Scalingo : les scopes utilisaient des concepts métier ("read", "scale", "deploy") et un `ROUTE_TABLE` hardcodé mappait les endpoints Scalingo vers ces scopes. Ce couplage empêchait de proxifier d'autres APIs.

L'architecte a demandé que le proxy soit agnostique de l'API cible. N'importe quelle API qui n'a pas de fine-grained tokens devrait pouvoir être proxifiée.

## Décision

### Scopes génériques METHOD:PATH

Les scopes sont des patterns bruts `METHOD:PATH` avec support wildcard :

```
GET:*                     → tout GET
GET:/v1/apps/*            → GET sur /v1/apps/ et sous-chemins
POST:/v1/apps/my-app/*    → POST sur une app spécifique
GET|POST:/v1/apps/*       → GET et POST sur apps
*:/v1/apps/my-app         → toutes méthodes sur une app
*:*                       → full access
```

Le proxy fait du pattern matching sans connaître la sémantique des routes.

### Auth modes

Le mode d'authentification est configurable dans le blob :

- `bearer` — le token est passé directement en `Authorization: Bearer {token}`
- `basic` — le token est passé en `Authorization: Basic {base64(:token)}`
- `scalingo-exchange` — le token est échangé via POST vers un endpoint d'exchange pour obtenir un bearer temporaire (flow Scalingo : token → bearer 1h)
- `header:{name}` — le token est passé dans un header custom (ex: `header:X-API-Key`)

### BlobConfig v2

```json
{
  "v": 2,
  "token": "tk-us-...",
  "target": "https://api.osc-fr1.scalingo.com",
  "auth": "scalingo-exchange",
  "scopes": ["GET:/v1/apps/*", "POST:/v1/apps/my-app/scale"],
  "ttl": 3600,
  "createdAt": 1712534400
}
```

| Champ | Type | Description |
|-------|------|-------------|
| `v` | `number` | Version du format (`2`) |
| `token` | `string` | Token/clé API de l'API cible |
| `target` | `string` | URL de base de l'API cible |
| `auth` | `string` | Mode d'authentification |
| `scopes` | `string[]` | Patterns `METHOD:PATH` autorisés |
| `ttl` | `number` | Durée de validité en secondes (`0` = pas d'expiration) |
| `createdAt` | `number` | Timestamp Unix (secondes) de création |

## Options envisagées

### Option A — Scopes nommés Scalingo (rejeté)
- Avantages : ergonomique dans l'UI, mapping explicite
- Inconvénients : couplé à Scalingo, `ROUTE_TABLE` hardcodé, pas extensible

### Option B — Provider pattern (rejeté)
- Avantages : structuré, chaque provider définit ses scopes
- Inconvénients : overhead d'abstraction, il faut un provider par API

### Option C — Scopes METHOD:PATH génériques (choisi)
- Avantages : agnostique, simple, pas de mapping, fonctionne avec n'importe quelle API REST
- Inconvénients : moins ergonomique brut (résolu par des presets UI par API)

## Conséquences

- `scopes.ts` réécrit : plus de ROUTE_TABLE, juste du pattern matching METHOD:PATH avec wildcard
- `BlobConfig` passe en v2 (le proxy peut supporter v1 en legacy si besoin, ou pas)
- `proxy.ts` utilise `config.target` pour le forward (plus de `SCALINGO_API_URL` en env)
- `scalingo/client.ts` devient un auth provider parmi d'autres (dispatch sur `config.auth`)
- L'UI de config peut proposer des presets par API (Scalingo, etc.) qui génèrent les bons patterns
- `/api/list-apps` reste Scalingo-spécifique (c'est un helper UI, pas du proxy core)

## Liens

- ADR 0001 — Stack technique
- ADR 0002 — Chiffrement côté serveur
