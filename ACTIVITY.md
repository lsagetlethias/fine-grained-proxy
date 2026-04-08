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
- **Prochaines étapes** :
  - Implémenter le module crypto (encrypt/decrypt blob, dérivation clé)
  - Implémenter le client Scalingo (token exchange)
  - Implémenter le middleware proxy (déchiffrement + scoping + forward)
  - UI de configuration (formulaire + génération URL)
