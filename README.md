[![CI](https://github.com/lsagetlethias/fine-grained-proxy/actions/workflows/ci.yml/badge.svg)](https://github.com/lsagetlethias/fine-grained-proxy/actions/workflows/ci.yml)

# Fine-Grained Proxy (FGP)

Proxy HTTP stateless et API-agnostique qui ajoute des tokens fine-grained (scoping par methode HTTP, chemin et contenu du body) devant n'importe quelle API. Zero storage, double cle, scopes `METHOD:PATH` avec body filters optionnels. Le blob chiffre peut etre dans l'URL ou en header `X-FGP-Blob`.

## Pourquoi

Beaucoup d'APIs ne proposent pas de tokens a granularite fine. FGP permet de generer des URLs a usage limite : scopees par methode, path et contenu du body, avec une duree de vie configurable, sans stocker quoi que ce soit. Toute la configuration (token, cible, mode d'auth, scopes, body filters) est chiffree dans l'URL elle-meme.

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

Copier `.env.example` en `.env` et renseigner les valeurs :

```bash
cp .env.example .env
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
  "key": "a7f2c9d4-1234-5678-abcd-ef0123456789",
  "blob": "eyJhbGci..."
}
```

### 2. Utiliser l'URL generee pour proxifier

**Mode header (recommande)** — le blob passe en header, l'URL reste propre :

```bash
curl http://localhost:8000/v1/apps \
  -H "X-FGP-Key: a7f2c9d4-1234-5678-abcd-ef0123456789" \
  -H "X-FGP-Blob: eyJhbGci..."
```

**Mode URL** — le blob est dans l'URL (compatibilite) :

```bash
curl http://localhost:8000/eyJhbGci.../v1/apps \
  -H "X-FGP-Key: a7f2c9d4-1234-5678-abcd-ef0123456789"
```

Le mode header est prefere pour eviter les problemes de limite de 255 caracteres par segment d'URL imposes par certains services. Le proxy dechiffre le blob, verifie le TTL et les scopes, puis forward la requete vers l'API cible avec le mode d'auth configure.

### 3. Partager une configuration

L'UI genere automatiquement une URL partageable avec le parametre `?c=` contenant la configuration (target, auth, scopes, TTL) compressee en gzip + base64url. Le token n'est jamais inclus dans l'URL partagee. Ouvrir cette URL pre-remplit le formulaire.

### 4. Importer depuis un blob existant

Via l'UI (bouton "Importer" dans les presets) ou via curl :

```bash
curl -X POST http://localhost:8000/api/decode \
  -H "Content-Type: application/json" \
  -d '{"blob": "eyJhbGci...", "key": "a7f2c9d4-1234-5678-abcd-ef0123456789"}'
```

Retourne la configuration complete avec le token redacte. Utile pour inspecter ou dupliquer une configuration existante.

## API

| Endpoint | Methode | Description |
|----------|---------|-------------|
| `/` | GET | UI de configuration |
| `/healthz` | GET | Health check |
| `/api/salt` | GET | Salt serveur (public) |
| `/api/generate` | POST | Generation d'URL FGP |
| `/api/list-apps` | POST | Helper Scalingo : listing des apps |
| `/api/test-scope` | POST | Test scope matching : verifie si methode + path + body est autorise par des scopes |
| `/api/test-proxy` | POST | Test end-to-end : appel reel vers l'API cible avec verification scopes et body filters |
| `/api/decode` | POST | Decode un blob chiffre avec sa cle, retourne la config (token redacte) |
| `/api/openapi.json` | GET | Spec OpenAPI 3.0 |
| `/api/docs` | GET | Swagger UI |
| `/{blob}/{path...}` | * | Proxy vers l'API cible |

Documentation OpenAPI complete : [Swagger UI](/api/docs)

## Architecture

### Blob chiffre (URL ou header)

Toute la config (token, cible, auth, scopes, body filters, TTL) est serializee en JSON, compressee (gzip), puis chiffree avec AES-256-GCM. Le blob peut etre transmis dans l'URL (`/{blob}/path`) ou via le header `X-FGP-Blob` (recommande). La cle de chiffrement est derivee via PBKDF2 a partir de deux composants :

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

### Scopes METHOD:PATH + body filters

Les scopes sont des patterns additifs (allowlist). Deux formats :

**Scopes string** (v2+) :
```
GET:/v1/apps/*            -> lecture sur /v1/apps/ et sous-chemins
POST:/v1/apps/my-app/*    -> ecriture sur une app specifique
GET|POST:/v1/apps/*       -> lecture + ecriture
*:*                       -> acces total
```

**Scopes structures** (v3) — avec body filters optionnels :
```json
{
  "methods": ["POST"],
  "pattern": "/v1/apps/my-app/deployments",
  "bodyFilters": [{
    "objectPath": "deployment.git_ref",
    "objectValue": [
      { "type": "any", "value": "main" },
      { "type": "stringwildcard", "value": "release/*" }
    ]
  }]
}
```

Types de body filters : `any` (exact match), `wildcard` (champ existe), `stringwildcard` (glob), `regex` (expression reguliere), `not` (exclusion), `and` (composition). Voir `docs/specs.md` et `docs/limits.md` pour les details et limites.

### Flow d'une requete proxy

```
Requete -> extraire blob (header X-FGP-Blob prioritaire, sinon premier segment URL)
  -> verifier taille blob -> extraire X-FGP-Key
  -> PBKDF2(client_key + server_salt) -> dechiffrer blob (gunzip + AES-256-GCM)
  -> valider auth mode -> verifier TTL
  -> parser body si body filters requis (POST/PUT/PATCH + JSON)
  -> verifier scopes vs methode/path/body
  -> auth (bearer, basic, header custom, ou scalingo-exchange avec cache)
  -> forward vers config.target (X-FGP-Key et X-FGP-Blob strippes)
  -> renvoyer reponse
```

## Scripts

| Commande | Description |
|----------|-------------|
| `deno task build` | Build CSS (Tailwind) + client JS (esbuild) |
| `deno task dev` | Watch parallele CSS + client + serveur |
| `deno task start` | Build + production |
| `deno task deploy` | Build + deploy Deno Deploy |
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

- [Specifications fonctionnelles v3](docs/specs.md)
- [Criteres d'acceptation](docs/acceptance-criteria.md)
- [Limites fonctionnelles body filters](docs/limits.md)
- [Architecture Decision Records](docs/adr/)
- [Guide deploiement Deno Deploy](docs/deno-deploy.md)
- [Guide deploiement Scalingo](docs/scalingo-deploy.md)

## License

MIT
