# CLAUDE.md — Fine-Grained Proxy (FGP)

## First things first
- Lis ce document en entier avant de coder.
- Manière de parler : t'es un bro', tu ne prends pas de pincettes. Tu dis les choses telles qu'elles sont, même si c'est brutal. Pas de "peut-être", "il faudrait", "je pense que" — tu affirmes avec confiance et clarté. Tu ne laisses aucune place à l'ambiguïté ou au doute. Tu es direct, franc, et précis. Tu proposes des alternatives quand tu penses que c'est pertinent. Tu me parles comme à un collègue dev expérimenté. Tu peux me parler familièrement, mais toujours avec respect et professionnalisme. Si tu vois un problème ou une amélioration possible, tu le dis sans hésiter.

## Projet
- **Fine-Grained Proxy** : proxy HTTP stateless devant l'API Scalingo qui ajoute des tokens fine-grained (scoping par app, par action) là où Scalingo n'en propose pas.
- **Zero storage** : aucune base de données. Le token Scalingo + la config de droits sont chiffrés dans l'URL elle-même.
- **Double clé** : le blob URL est déchiffrable uniquement avec une clé client (header `X-FGP-Key`) + un salt serveur. L'URL seule est inexploitable.
- **TTL** : expiration encodée dans le blob, vérifiée à chaque requête.
- **Auth Scalingo** : double step — API token (`tk-us-...`) → exchange → bearer (1h TTL). Le proxy gère l'exchange et cache le bearer chiffré en mémoire.

## Stack
- **Runtime** : Deno
- **Framework** : Hono
- **Langage** : TypeScript (strict)
- **Crypto** : Web Crypto API native (AES-256-GCM, PBKDF2)
- **Tests** : `deno test` — structure `tests/testu/` (unit), `tests/testi/` (integration), `tests/teste2e/` (e2e)
- **Lint/Format** : `deno lint` + `deno fmt`

## Scripts (deno task)
- `deno task dev` — serveur dev avec watch
- `deno task start` — production
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
  routes/           — routes Hono (proxy, UI config, healthz)
  middleware/        — middlewares (auth, scoping, logging)
  crypto/           — chiffrement/déchiffrement blob, dérivation clé
  scalingo/         — client API Scalingo (token exchange, proxy)
  ui/               — pages JSX (formulaire de config)
tests/
  testu/            — tests unitaires
  testi/            — tests intégration
  teste2e/          — tests e2e
docs/
  adr/              — Architecture Decision Records
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
Requête → extraire blob du path → extraire X-FGP-Key du header
  → PBKDF2(client_key + server_salt) → déchiffrer blob
  → vérifier TTL → vérifier scopes vs route/méthode
  → cache hit? déchiffrer bearer : exchange token → chiffrer bearer → cache
  → forward vers api.osc-fr1.scalingo.com avec bearer
  → renvoyer réponse
```

## Variables d'environnement
- `PORT` — port du serveur (défaut: 8000)
- `FGP_SALT` — salt serveur pour la dérivation de clé (requis)
- `SCALINGO_API_URL` — URL de l'API Scalingo (défaut: https://api.osc-fr1.scalingo.com)
- `SCALINGO_AUTH_URL` — URL du service auth Scalingo (défaut: https://auth.scalingo.com)

## Documentation
- **OpenAPI** : `GET /api/openapi.json` — spec OpenAPI 3.0 auto-générée depuis le code (schemas Zod)
- **Swagger UI** : `GET /api/docs` — documentation interactive de l'API
- **ADR** dans `docs/adr/` — pour les décisions architecturales significatives
- **ACTIVITY.md** — log d'activité des sessions de dev
- **MEMORY.md** — mémoire persistante Claude Code
