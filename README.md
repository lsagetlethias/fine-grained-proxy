# Fine-Grained Proxy (FGP)

Proxy HTTP stateless et API-agnostique qui ajoute des tokens fine-grained (scoping par methode HTTP et chemin) devant n'importe quelle API. Zero storage, double cle, scopes `METHOD:PATH`.

## Pourquoi

Beaucoup d'APIs ne proposent pas de tokens a granularite fine. FGP permet de generer des URLs a usage limite : scopees par methode et path, avec une duree de vie configurable, sans stocker quoi que ce soit. Toute la configuration (token, cible, mode d'auth, scopes) est chiffree dans l'URL elle-meme.

## Quick start

### Prerequis

- [Deno](https://deno.com/) >= 2.x

### Variables d'environnement

| Variable | Requis | Description | Defaut |
|----------|--------|-------------|--------|
| `FGP_SALT` | oui | Salt serveur pour la derivation de cle (PBKDF2) | - |
| `PORT` | non | Port du serveur | `8000` |
| `SCALINGO_API_URL` | non | URL de l'API Scalingo | `https://api.osc-fr1.scalingo.com` |
| `SCALINGO_AUTH_URL` | non | URL du service auth Scalingo | `https://auth.scalingo.com` |

### Lancer en dev

```bash
export FGP_SALT="mon-salt-secret"
deno task dev
```

Le serveur demarre sur `http://localhost:8000`. L'UI de configuration est accessible a la racine.

## Utilisation

### 1. Generer une URL FGP

Via l'UI web (`http://localhost:8000/`) ou via curl :

```bash
curl -X POST http://localhost:8000/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "token": "tk-us-xxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "target": "https://api.osc-fr1.scalingo.com",
    "auth": "scalingo-exchange",
    "scopes": ["GET:/v1/apps/*", "POST:/v1/apps/my-app/scale"],
    "ttl": 3600
  }'
```

Reponse :

```json
{
  "url": "http://localhost:8000/eyJhbGci.../",
  "key": "a7f2c9d4-1234-5678-abcd-ef0123456789"
}
```

### 2. Utiliser l'URL generee pour proxifier

```bash
curl http://localhost:8000/eyJhbGci.../v1/apps \
  -H "X-FGP-Key: a7f2c9d4-1234-5678-abcd-ef0123456789"
```

Le proxy dechiffre le blob, verifie le TTL et les scopes, puis forward la requete vers l'API cible avec le mode d'auth configure.

## API

| Endpoint | Methode | Description |
|----------|---------|-------------|
| `/` | GET | UI de configuration |
| `/healthz` | GET | Health check |
| `/api/salt` | GET | Salt serveur (public) |
| `/api/generate` | POST | Generation d'URL FGP |
| `/api/list-apps` | POST | Helper Scalingo : listing des apps |
| `/api/docs` | GET | Swagger UI |
| `/{blob}/{path...}` | * | Proxy vers l'API cible |

Documentation OpenAPI complete : [Swagger UI](/api/docs)

## Architecture

### Blob chiffre dans l'URL

Toute la config (token, cible, auth, scopes, TTL) est serializee en JSON, compressée (gzip), puis chiffree avec AES-256-GCM. La cle de chiffrement est derivee via PBKDF2 a partir de deux composants :

- **Cle client** (`X-FGP-Key`) : generee a la creation, transmise au client, jamais stockee sur le serveur
- **Salt serveur** (`FGP_SALT`) : configure sur le serveur, inutile sans la cle client

L'URL seule est inexploitable. Il faut les deux composants pour dechiffrer.

### Modes d'authentification

| Mode | Comportement |
|------|-------------|
| `bearer` | `Authorization: Bearer {token}` |
| `basic` | `Authorization: Basic {base64(":"+token)}` |
| `scalingo-exchange` | Exchange token -> bearer temporaire (1h), avec cache en memoire |
| `header:{name}` | Header custom (ex: `header:X-API-Key` -> `X-API-Key: {token}`) |

### Scopes METHOD:PATH

Les scopes sont des patterns additifs (allowlist). Exemples :

```
GET:/v1/apps/*            -> lecture sur /v1/apps/ et sous-chemins
POST:/v1/apps/my-app/*    -> ecriture sur une app specifique
GET|POST:/v1/apps/*       -> lecture + ecriture
*:*                       -> acces total
```

### Flow d'une requete proxy

```
Requete -> extraire blob du path -> extraire X-FGP-Key du header
  -> PBKDF2(client_key + server_salt) -> dechiffrer blob
  -> verifier TTL -> verifier scopes vs methode/path
  -> auth (bearer direct ou exchange) -> forward vers API cible
  -> renvoyer reponse
```

## Scripts

| Commande | Description |
|----------|-------------|
| `deno task dev` | Serveur dev avec watch |
| `deno task start` | Production |
| `deno task test` | Tous les tests |
| `deno task test:unit` | Tests unitaires |
| `deno task test:integration` | Tests integration |
| `deno task test:e2e` | Tests e2e |
| `deno task lint` | Linter |
| `deno task fmt` | Formatteur |
| `deno task fmt:check` | Verification formatage |
| `deno task check` | Type checking |
| `deno task verify` | Pipeline complete (lint + fmt + check + test) |

## Documentation

- [Architecture Decision Records](docs/adr/)
- [Specifications fonctionnelles](docs/specs.md)
- [Guide deploiement Deno Deploy](docs/deno-deploy.md)
- [Guide deploiement Scalingo](docs/scalingo-deploy.md)

## License

MIT
