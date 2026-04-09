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
- **Prochaines étapes** : ~~terminées dans les sessions suivantes~~

## 2026-04-08 → 2026-04-09 — Tailscale, OpenAPI, guides déploiement, README

- **Changements** :
  - Compatibilité reverse proxy (X-Forwarded-Host/Proto pour Tailscale)
  - Guides de déploiement : Deno Deploy + Scalingo
  - README.md complet
- **Prochaines étapes** : ~~terminées dans la session suivante~~

## 2026-04-09 — Body filters, limites fonctionnelles, and/not, UI split

- **Changements** :
  - ADR-0004 : Body filters et scopes structurés (blob v3)
  - Implémentation body filters : ObjectValue (any, wildcard, stringwildcard, and, not)
  - ScopeEntry structurés avec bodyFilters optionnels dans `scopes.ts`
  - Backward compat v2/v3 dans `decryptBlob` et `checkAccess`
  - Validation limites dans `blob.ts` : profondeur and/not (4), body filters/scope (8), valeurs OR (16), ScopeEntry (10), dot-path (6)
  - Combinaisons interdites : not(wildcard), not(not), and([]), and(1)
  - Validation limites côté API dans `ui.tsx` (`validateScopeLimits`, `validateObjectValue`)
  - Body parsing conditionnel dans `proxy.ts` (lazy, seulement si body filters + POST/PUT/PATCH)
  - UI body filters : panel accordéon par scope, types exact/wildcard/glob/not/and avec sous-conditions
  - UI layout split : formulaire 3/5 + guide 2/5
  - UI dark mode (Tailwind media query)
  - Limites fonctionnelles documentées dans `docs/limits.md`
  - Specs v3, acceptance criteria v2 synchronisés avec le code
- **Décisions** :
  - ADR-0004 : discriminated union `ObjectValue` avec `type` comme discriminant — extensible sans casser l'existant
  - Blob v3 auto-détecté (si au moins un ScopeEntry → v3, sinon v2)
  - Body filters JSON only (pas de form-data/multipart)
  - Limites structurelles bornées pour prévenir DoS par blob crafté
- **Prochaines étapes** :
  - Tests body filters (unit + integration)
  - Review UI body filters par PO + designer
  - Regex body filter (type extensible, pas implémenté)
