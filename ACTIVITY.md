# Activity Log — Fine-Grained Proxy

## 2026-04-08 — Initialisation du projet

- **Changements** :
  - Init repo git + Deno/Hono
  - Structure : `src/`, `tests/testu|testi|teste2e/`, `docs/adr/`
  - CLAUDE.md avec conventions projet
  - 4 skills locaux adaptés de roadmaps-faciles (verif, add-tests, sync-docs, check-review-pr)
  - Skills marketplace installés (deno-expert, deno-guidance, typescript-e2e-testing, code-review, architecture-decision)
  - ADR-0001 : choix stack Hono/Deno/Web Crypto
  - Setup équipe (lead dev, dev, PO, designer, testeur)
- **Décisions** :
  - Hono sur Deno plutôt que Fresh (trop lourd) ou Koa/Node (pas de crypto native)
  - Zero storage avec double clé (blob URL + header client + salt serveur)
  - Bearer cache in-memory chiffré avec clé utilisateur
  - Auth Scalingo : API token → exchange → bearer 1h
- **ADR** : ADR-0001 — Stack technique
- **Prochaines étapes** : ~~terminées dans la même session~~

## 2026-04-08 — Implémentation complète + refonte agnostique

- **Changements** :
  - Module crypto complet (AES-256-GCM, PBKDF2, gzip, base64url)
  - Client auth Scalingo (token exchange, cache bearer, singleflight)
  - Middleware proxy avec scope matching et forward
  - UI de configuration (Hono JSX + Tailwind CDN)
  - Specs v1.1 rédigées par le PO, challengées par le testeur → 50+ critères d'acceptation
  - Refonte scopes v2 : proxy agnostique avec patterns METHOD:PATH génériques
  - 4 modes d'auth : bearer, basic, scalingo-exchange, header custom
  - Chiffrement côté serveur (revert du client-side proposé par le PO)
  - BlobConfig v2 avec target, auth, scopes string[]
  - OpenAPI 3.0 spec + Swagger UI (/api/docs) + validation Zod
  - Premier commit (95 tests, 15 fichiers source)
- **Décisions** :
  - ADR-0002 : Chiffrement côté serveur (pas client-side) — risque XSS, cohérence avec caldav2ics
  - ADR-0003 : Proxy agnostique, scopes METHOD:PATH génériques — plus de couplage Scalingo
  - Bearer cache en clair en mémoire (pas chiffré), clé = hash(token) pour partage entre blobs
  - Scopes canoniques dans le blob (pas d'alias write/vars)
  - OpenAPI plutôt que markdown statique pour la doc API
- **Process** :
  - Équipe 5 rôles (lead dev, dev, PO, designer, testeur) — le testeur a challengé le PO efficacement
  - Feedback : le designer ne touche pas à main.ts, le dev doit respecter les pauses, doc API non négociable
  - Copilotage archi avec l'utilisateur sur les décisions structurantes (server-side crypto, proxy agnostique)
- **Prochaines étapes** :
  - Compatibilité Tailscale (X-Forwarded-Host/Proto)
  - Guide déploiement Deno Deploy + Scalingo
  - README.md
  - /verif + /add-tests sur le code agnostique v2
  - Review UI par PO + designer
