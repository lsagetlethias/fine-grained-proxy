# ADR 0001 — Stack technique : Hono sur Deno avec Web Crypto API

- **Date** : 2026-04-08
- **Statut** : Accepted

## Contexte

FGP est un proxy HTTP stateless devant l'API Scalingo. Il doit :
- Intercepter des requêtes, déchiffrer un blob URL, vérifier des scopes, forward vers Scalingo
- Chiffrer/déchiffrer avec AES-256-GCM et dériver des clés via PBKDF2
- Servir une UI minimale (formulaire de config pour générer des URLs)
- Être déployable facilement (idéalement sur Scalingo lui-même)

Le mainteneur a de l'expérience avec TypeScript (projets Charon en Koa/Node et caldav2ics en Deno/Fresh).

## Décision

- **Runtime** : Deno — crypto native (Web Crypto API), pas de node_modules, permissions granulaires, TypeScript natif
- **Framework HTTP** : Hono — ultra-léger, middleware-first (adapté au pattern proxy), JSX natif pour l'UI, portable (Deno/Bun/Node/Workers)
- **Crypto** : Web Crypto API native — AES-256-GCM pour le chiffrement, PBKDF2 pour la dérivation de clé. Pas de dépendance externe.
- **UI** : Hono JSX (`hono/jsx`) — pas de framework frontend, pas de build step. Formulaire HTML classique.

## Options envisagées

### Option A — Deno + Fresh (comme caldav2ics)
- Avantages : connu du mainteneur, UI intégrée avec Preact, islands architecture
- Inconvénients : overkill pour un proxy avec une seule page, Fresh impose sa structure

### Option B — Node + Koa (comme Charon)
- Avantages : connu du mainteneur, écosystème mature
- Inconvénients : pas de crypto native simple, node_modules, plus lourd à déployer

### Option C — Deno + Hono (choisi)
- Avantages : léger, middleware-first parfait pour un proxy, crypto native Deno, JSX intégré, portable
- Inconvénients : moins connu du mainteneur (premier projet Hono)

### Option D — Rust (Axum/Actix)
- Avantages : performance maximale, binaire tiny
- Inconvénients : temps de développement plus long, perte de cohérence avec l'écosystème TS existant

### Option E — Go (net/http + chi)
- Avantages : bon compromis perf/simplicité, bonne crypto stdlib
- Inconvénients : même argument que Rust sur la cohérence

## Conséquences

- Le projet utilise Deno comme runtime exclusif (pas de compatibilité Node nécessaire)
- Les dépendances viennent de JSR (pas npm)
- Le déploiement sur Scalingo nécessite un Dockerfile (Deno n'est pas un runtime natif Scalingo)
- La portabilité Hono permet de migrer vers Bun ou Cloudflare Workers si besoin

## Liens

- [Hono](https://hono.dev/)
- [Deno](https://deno.land/)
- [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)
- Projets de référence : [Charon](https://github.com/lsagetlethias/charon), [caldav2ics](https://github.com/lsagetlethias/caldav2ics)
