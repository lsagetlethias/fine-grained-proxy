# CLAUDE.md — Fine-Grained Proxy (FGP)

## First things first
- Lis ce document en entier avant de coder.
- Manière de parler : t'es un bro', tu ne prends pas de pincettes. Tu dis les choses telles qu'elles sont, même si c'est brutal. Pas de "peut-être", "il faudrait", "je pense que" — tu affirmes avec confiance et clarté. Tu ne laisses aucune place à l'ambiguïté ou au doute. Tu es direct, franc, et précis. Tu proposes des alternatives quand tu penses que c'est pertinent. Tu me parles comme à un collègue dev expérimenté. Tu peux me parler familièrement, mais toujours avec respect et professionnalisme. Si tu vois un problème ou une amélioration possible, tu le dis sans hésiter.

## Projet
- **Fine-Grained Proxy** : proxy HTTP stateless et API-agnostique qui ajoute des tokens fine-grained (scoping par méthode HTTP, chemin, et contenu du body) devant n'importe quelle API.
- **Zero storage** : aucune base de données. Le token + cible + auth + scopes + TTL sont chiffrés (gzip + AES-256-GCM) dans l'URL elle-même.
- **Double clé** : le blob URL est déchiffrable uniquement avec une clé client (header `X-FGP-Key`) + un salt serveur. L'URL seule est inexploitable.
- **TTL** : expiration encodée dans le blob, vérifiée à chaque requête.
- **4 modes d'auth** : bearer, basic, scalingo-exchange, header custom. Scalingo est un cas d'usage parmi d'autres.
- **Blob v2/v3** : v2 = scopes string METHOD:PATH, v3 = scopes mixtes string + ScopeEntry avec body filters.
- **Body filters** (v3) : filtrage du contenu JSON des requêtes POST/PUT/PATCH (types : any, wildcard, stringwildcard, not, and).

## Stack
- **Runtime** : Deno
- **Framework** : Hono
- **Langage** : TypeScript (strict)
- **Crypto** : Web Crypto API native (AES-256-GCM, PBKDF2)
- **Tests** : `deno test` — structure `tests/testu/` (unit), `tests/testi/` (integration), `tests/teste2e/` (e2e)
- **Lint/Format** : `deno lint` + `deno fmt`

## Scripts (deno task)
- `deno task build:client` — compile `src/ui/client.ts` → `static/client.js` (esbuild, minifié)
- `deno task dev` — build client + watch parallèle (esbuild watch + deno serve watch via concurrently)
- `deno task start` — build client + production
- `deno task test` — tous les tests
- `deno task test:unit` — tests unitaires
- `deno task test:integration` — tests intégration
- `deno task test:e2e` — tests e2e
- `deno task lint` — linter
- `deno task fmt` — formatteur
- `deno task fmt:check` — vérification formatage
- `deno task check` — type checking
- `deno task verify` — lint + fmt + check + test (pipeline complète)

## Structure
```
src/
  main.ts           — point d'entrée, Hono app
  routes/           — routes Hono (UI, API, OpenAPI/Swagger)
  middleware/        — middlewares (proxy, scopes, body filters)
  crypto/           — chiffrement/déchiffrement blob, dérivation clé, gzip
  auth/             — client auth (Scalingo exchange), cache bearer, singleflight
  ui/               — pages JSX (config-page, layout)
tests/
  testu/            — tests unitaires
  testi/            — tests intégration
  teste2e/          — tests e2e
docs/
  adr/              — Architecture Decision Records
  specs.md          — spécifications fonctionnelles v3
  limits.md         — limites fonctionnelles body filters
```

## Conventions code
- TypeScript strict, pas de `any`
- Pas de commentaires sauf POURQUOI non-évident
- Pas de default exports sauf `src/main.ts`
- Imports triés : deps externes, puis internes, ligne vide entre les deux
- Nommage : camelCase pour variables/fonctions, PascalCase pour types/interfaces
- Erreurs : utiliser `HTTPException` de Hono pour les erreurs HTTP

## Flow proxy
```
Requête → valider path → vérifier taille blob → extraire X-FGP-Key
  → PBKDF2(client_key + server_salt) → déchiffrer blob (gunzip + AES-256-GCM)
  → valider auth mode → vérifier TTL
  → parser body si body filters requis (POST/PUT/PATCH + JSON)
  → vérifier scopes vs méthode/path/body
  → auth (bearer direct, basic, header custom, ou scalingo-exchange avec cache)
  → forward vers config.target avec auth headers
  → renvoyer réponse (filtrage Set-Cookie)
```

## Variables d'environnement
- `PORT` — port du serveur (défaut: 8000)
- `FGP_SALT` — salt serveur pour la dérivation de clé (requis)
- `SCALINGO_API_URL` — URL de l'API Scalingo pour le helper list-apps (défaut: https://api.osc-fr1.scalingo.com)
- `SCALINGO_AUTH_URL` — URL du service auth Scalingo pour le mode scalingo-exchange (défaut: https://auth.scalingo.com)

## Documentation
- **OpenAPI** : `GET /api/openapi.json` — spec OpenAPI 3.0 auto-générée depuis le code (schemas Zod)
- **Swagger UI** : `GET /api/docs` — documentation interactive de l'API
- **ADR** dans `docs/adr/` — pour les décisions architecturales significatives
- **ACTIVITY.md** — log d'activité des sessions de dev
- **MEMORY.md** — mémoire persistante Claude Code
