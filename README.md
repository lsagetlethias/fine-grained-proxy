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
| `FGP_GITHUB_REPO` | non | Repo GitHub (`owner/name`) pour la resolution du SHA de build (utile pour les forks sans git) | auto-detecte via git remote ou `lsagetlethias/fine-grained-proxy` |
| `FGP_EGRESS_ALLOW_PRIVATE` | non | **Interrupteur de developpement.** `1` desactive le refus des destinations non publiques. Voir l'avertissement ci-dessous. | off |
| `FGP_TRUSTED_PROXY_HOPS` | non | Nombre de proxys de confiance en amont, pour lire `X-Forwarded-For`. `0` ignore l'en-tete et utilise l'adresse du pair | `0` |
| `FGP_LOGS_ENABLED` | non | Kill switch feature `/logs` (`1` active les routes `/logs` + `/logs/stream` et la capture, sinon 404) | off |
| `FGP_LOGS_BUFFER_NETWORK` | non | Taille du ring buffer network par blob | `50` |
| `FGP_LOGS_BUFFER_DETAILED` | non | Taille du ring buffer detailed (body chiffre) par blob | `10` |
| `FGP_LOGS_INACTIVITY_MIN` | non | Minutes d'inactivite avant purge du buffer d'un blob | `10` |
| `FGP_LOGS_DETAILED_MAX_KB` | non | Taille max du body capture en detailed (KB) avant troncature | `32` |

> **`FGP_EGRESS_ALLOW_PRIVATE=1` ne doit jamais etre actif en production.**
> Il desactive la classification des destinations, donc la garantie G1 de la politique de sortie. L'instance redevient exactement la SSRF non authentifiee que cette politique corrige : n'importe qui peut lui faire emettre des requetes vers le reseau prive de l'hebergeur, service de metadonnees compris, et en recuperer le corps de reponse. Il existe pour le developpement local et la suite de tests, rien d'autre. Le serveur ecrit un avertissement au demarrage quand il est actif.

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
    "scopes": ["GET:/v1/apps", "GET:/v1/apps/*", "POST:/v1/apps/my-app/scale"],
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

**Mode header (recommande)**, le blob passe en header et l'URL reste propre :

```bash
curl http://localhost:8000/v1/apps \
  -H "X-FGP-Key: a7f2c9d4-1234-5678-abcd-ef0123456789" \
  -H "X-FGP-Blob: eyJhbGci..."
```

**Mode URL**, le blob est dans l'URL (compatibilite) :

```bash
curl http://localhost:8000/eyJhbGci.../v1/apps \
  -H "X-FGP-Key: a7f2c9d4-1234-5678-abcd-ef0123456789"
```

Le mode header est prefere pour eviter les problemes de limite de 255 caracteres par segment d'URL imposes par certains services. Le proxy dechiffre le blob, verifie le TTL et les scopes, puis forward la requete vers l'API cible avec le mode d'auth configure.

### 3. Partager une configuration

L'UI genere automatiquement une URL partageable avec le parametre `?c=` contenant la configuration (nom, target, auth, scopes, body filters, TTL) compressee en gzip + base64url. Le token n'est jamais inclus dans l'URL partagee. Ouvrir cette URL pre-remplit le formulaire. Le champ "Nom" est optionnel et sert a identifier la configuration dans l'URL partagee.

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
| `/api/generate` | POST | Generation d'URL FGP. Champ `key` optionnel pour fournir sa propre cle client (24 a 256 caracteres) |
| `/api/list-apps` | POST | Helper Scalingo : listing des apps |
| `/api/list-addons` | POST | Helper Scalingo : listing des bases de donnees d'une app |
| `/api/test-proxy` | POST | Test end-to-end : appel reel vers l'API cible avec verification scopes et body filters |
| `/api/decode` | POST | Decode un blob chiffre avec sa cle, retourne la config (token redacte) |
| `/api/share/encode` | POST | Encode une config (target, auth, scopes, TTL, body filters) en string gzip+base64url pour partage |
| `/api/share/decode` | POST | Decode une config partagee depuis un string gzip+base64url |
| `/api/openapi.json` | GET | Spec OpenAPI 3.0 |
| `/api/docs` | GET | Swagger UI |
| `/llms.txt` | GET | Description de FGP au format markdown, destinee aux agents LLM (convention llmstxt.org) |
| `/logs` | GET | Page UI de consultation des logs d'un blob (opt-in, requiert `FGP_LOGS_ENABLED=1`) |
| `/logs/stream` | GET | Stream SSE des logs d'un blob (`X-FGP-Blob` + `X-FGP-Key`, heartbeat 15s, cursor `?since=`) |
| `/logs/health` | GET | Indique si la feature logs est activee sur l'instance (`{enabled}`) |
| `/{blob}/{path...}` | * | Proxy vers l'API cible |

Documentation OpenAPI complete : [Swagger UI](/api/docs)

## Architecture

### Blob chiffre (URL ou header)

Toute la config (token, cible, auth, scopes, body filters, TTL) est serializee en JSON, compressee (gzip), puis chiffree avec AES-256-GCM. Le blob peut etre transmis dans l'URL (`/{blob}/path`) ou via le header `X-FGP-Blob` (recommande). La cle de chiffrement est derivee via PBKDF2 a partir de deux composants :

- **Cle client** (`X-FGP-Key`) : generee a la creation, transmise au client, jamais stockee sur le serveur
- **Salt serveur** (`FGP_SALT`) : configure sur le serveur, inutile sans la cle client

L'URL seule est inexploitable. Il faut les deux composants pour dechiffrer.

### Modes d'authentification

Quatre modes string (blob v2/v3) et deux modes structures (blob v4, champ `auth` en objet) :

| Mode | Forme | Comportement |
|------|-------|-------------|
| `bearer` | string | `Authorization: Bearer {token}` |
| `basic` | string | `Authorization: Basic {base64(":"+token)}` |
| `scalingo-exchange` | string | Exchange token -> bearer temporaire (1h), avec cache en memoire. Affiche « Scalingo API » dans l'UI |
| `header:{name}` | string | Header custom (ex: `header:X-API-Key` -> `X-API-Key: {token}`) |
| `{ type: "headers" }` | AuthSpec | Plusieurs headers d'authentification envoyes ensemble (8 max). Un seul header retombe sur la forme compacte `header:{name}` |
| `{ type: "scalingo-addon" }` | AuthSpec | Token d'addon Scalingo obtenu en trois temps et renouvele automatiquement (1h). Affiche « Scalingo Database API » dans l'UI |

Les blobs v2 et v3 restent lisibles sans changement : le passage en v4 n'intervient que si `auth` est un objet. Voir [ADR 0008](docs/adr/0008-auth-structuree-blob-v4.md).

### Politique de sortie

Toute requete sortante emise par FGP passe par un point de sortie unique qui applique quatre garanties (ADR-0009) : destination publique uniquement, chemin autorise egal au chemin emis, authentification issue du blob et jamais de l'appelant, et un etat de la query dit explicitement par l'outillage.

Consequences visibles :

- Les cibles non publiques (loopback, reseaux prives, link-local, metadonnees) sont refusees en 403 `target_forbidden`.
- Les redirections ne sont plus suivies : un 3xx amont est forwarde tel quel.
- Les en-tetes `Authorization` et `Cookie` de l'appelant ne sont plus transmis. Pour envoyer un `Authorization` fixe a l'upstream, le declarer dans l'AuthSpec `headers` du blob (v4).
- **Les parametres de query ne sont pas contraints par les scopes.** Un blob scope sur `/v1/items` accepte `/v1/items?action=delete`. C'est une dette datee, pas un non-goal : voir `docs/specs.md` section 18.4.

### Scopes METHOD:PATH + body filters

Les scopes sont des patterns additifs (allowlist). Deux formats :

**Scopes string** (v2+) :
```
GET:/v1/apps              -> lecture du listing /v1/apps (path exact)
GET:/v1/apps/*            -> lecture des sous-chemins de /v1/apps/ (ex: /v1/apps/my-app), pas /v1/apps nu
POST:/v1/apps/my-app/*    -> ecriture sur une app specifique
GET|POST:/v1/apps/*       -> lecture + ecriture
*:*                       -> acces total
```

**Scopes structures** (v3), avec body filters optionnels :
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
  -> renvoyer reponse upstream telle quelle (status/body/headers, seul Set-Cookie strippe)
```

Toute reponse du proxy porte le header `X-FGP-Source` : `upstream` quand la reponse vient de l'API cible (forward transparent), `proxy` quand c'est une erreur FGP (shape `{error, message}`). Voir [ADR-0006](docs/adr/0006-proxy-transparent-erreurs-upstream.md).

### Logs stream par blob (optionnel)

Feature opt-in gatee par `FGP_LOGS_ENABLED=1`. Activee par blob via le champ `logs: { enabled, detailed }` (ajout non-cassant sur v3). La page `/logs` consomme un stream SSE (`/logs/stream`) scope au blob + cle client : network entries (methode, path, status, duree) en clair, body `detailed` chiffre AES-256-GCM cote serveur avec la cle client et dechiffre dans le navigateur (zero trust). Stockage in-memory (ring buffer par blob, purge apres inactivite). Voir [ADR-0007](docs/adr/0007-logs-stream-in-memory-opt-in.md).

## Scripts

| Commande | Description |
|----------|-------------|
| `deno task build` | Build CSS (Tailwind) + client JS (esbuild) + version (SHA git) + changelog |
| `deno task build:css` | Compile `src/ui/tailwind.css` vers `static/styles.css` |
| `deno task build:client` | Compile les modules TS client vers `static/client.js` (esbuild) |
| `deno task build:version` | Resout le SHA git du commit courant et l'ecrit dans `static/version.txt` |
| `deno task build:changelog` | Regenere `src/ui/changelog-data.ts` depuis `docs/changelog.md` |
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

- [Specifications fonctionnelles v4](docs/specs.md)
- [Criteres d'acceptation](docs/acceptance-criteria.md)
- [Limites fonctionnelles body filters et auth structuree](docs/limits.md)
- [Changelog](docs/changelog.md)
- [Architecture Decision Records](docs/adr/), dont [ADR-0009 politique de sortie](docs/adr/0009-politique-de-sortie-du-proxy.md) et [ADR-0010 limites de ressources](docs/adr/0010-politique-limites-ressources.md)
- [Guide deploiement Deno Deploy](docs/deno-deploy.md)
- [Guide deploiement Scalingo](docs/scalingo-deploy.md)

## License

MIT
