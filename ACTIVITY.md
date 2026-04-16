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
- **Prochaines étapes** : ~~terminées dans la session suivante~~

## 2026-04-09 — Extraction JS, zod 4, recette, UX fixes

- **Changements** :
  - Extraction JS inline (1400 lignes string template) → `src/ui/client.ts` typé
  - Build pipeline esbuild → `static/client.js` (32.5KB minifié, gitignored)
  - `deno task dev` avec concurrently (esbuild watch + deno serve watch en parallèle)
  - Migration zod 3.24 → zod 4 + @hono/zod-openapi 0.19 → 1.2
  - Migration `deno run` → `deno serve` (export `{ port, fetch }`)
  - Phase recette complète : dev /verif, designer review skills, testeur tests statique, PO recette visuelle
  - UX fixes : presets label + hint, guide deploy Deno Deploy mis à jour (console.deno.com)
  - 263 tests, 0 failed
- **Décisions** :
  - Client TS + esbuild plutôt que Vite (Hono recommande Vite mais pas de plugin Deno natif)
  - concurrently pour les tasks parallèles (pas d'équivalent Deno natif)
  - zod 4 compatible via @hono/zod-openapi 1.2 (la 0.19 ne marchait pas avec zod 4)
- **Prochaines étapes** : ~~terminées dans la session suivante~~

## 2026-04-09 — Tailwind build-time, regex body filter, preset enrichi, logo, SEO, split modules, a11y

- **Changements** :
  - Tailwind CDN → build-time CSS : `tailwind.config.js` + `src/ui/tailwind.css` → `static/styles.css` via `deno task build:css`
  - Task `deno task build` unifiée (CSS + client JS), `deno task deploy` ajoutée
  - `deno task dev` avec watch parallèle CSS + client + server (concurrently 3 processus)
  - Découpage `src/ui/client.ts` → 9 modules dans `src/ui/client/` (presets, body-filters, apps, generate, ttl, clipboard, scopes, elements, types)
  - Body filter type `regex` implémenté : `new RegExp(value).test(bodyValue)`, validé au déchiffrement du blob
  - Regex disponible dans l'UI (body filters, not, and sub-conditions)
  - Preset Scalingo enrichi : permissions par app (read, deploy avec branches, vars read/write, scale/restart) via `AppsPermissionsState`
  - Logo SVG inline (bouclier + cadenas) dans `layout.tsx`, utilisé comme favicon data-URI
  - SEO meta complet : description, theme-color, canonical, Open Graph, Twitter Card
  - Palette couleurs custom `fgp-*` dans Tailwind config
  - Dark mode via `darkMode: "media"` (Tailwind) au lieu de classes manuelles
  - Accessibilité : `aria-label` sur les inputs body filters
- **Décisions** :
  - Tailwind 3 build-time (pas Tailwind 4) pour compatibilité Deno stable
  - Regex validée au decrypt (pas seulement à la génération) pour se protéger des blobs craftés
  - Palette fgp-* custom plutôt que les couleurs Tailwind par défaut pour une identité visuelle propre
- **Prochaines étapes** :
  - Premier déploiement Deno Deploy
  - Test e2e avec un vrai token Scalingo

## 2026-04-16 — Dual mode blob : header X-FGP-Blob

- **Changements** :
  - Nouveau middleware `blobHeaderProxy()` monté en catch-all avant toutes les routes
  - Factorisation logique proxy dans `handleProxy(c, blobRaw, proxyPath)` (plus de duplication)
  - `proxyMiddleware()` simplifié, délègue à `handleProxy`
  - Header `X-FGP-Blob` strippé avant forward (comme `X-FGP-Key`)
  - API `/api/generate` retourne `{ url, key, blob }` (champ `blob` ajouté)
  - UI : champ blob copiable dans les résultats, double exemple curl (URL + header mode)
  - Doc aside : encart "Mode header (recommandé)" avec mention limite 255 chars
  - 8 tests d'intégration AC-14.1 à AC-14.8 (header mode, fallback URL, strip headers, erreurs, query string)
  - 295 tests, 0 failed
- **Décisions** :
  - ADR-0005 : Dual mode blob URL/header — header prioritaire, URL en fallback
  - Catch-all middleware (`*`) pour le header mode plutôt qu'une route dédiée
  - Pas de breaking change : mode URL inchangé, champ `blob` additionnel dans la réponse API

## 2026-04-16 — Section "Tester un scope" (UI + API)

- **Changements** :
  - Nouvel endpoint `POST /api/test-scope` (Zod/OpenAPI) : vérifie si une requête (méthode + path + body) est autorisée par un jeu de scopes
  - Module client `src/ui/client/test-scope.ts` : matching client-side (matchPath, parseScope), debounce 150ms, appel API pour body filters
  - Section `<details>` dans le formulaire : méthode, path, body JSON, indicateurs ✓/✗ temps réel par scope, bouton Tester
  - Doc wildcard "minimum 1 caractère" dans specs.md + limits.md
  - Specs section test-scope dans specs.md (highlight temps réel, run API, body JSON)
  - 10 tests d'intégration AC-15.1 à AC-15.9
  - Fiches de poste par rôle dans `docs/team/` (lead, dev, po, testeur, designer)
- **Décisions** :
  - Pas d'ADR : outil de debug UI, pas structurant
  - Matching client-side pour le temps réel (debounce) + appel API uniquement pour les body filters (besoin serveur)

## 2026-04-16 — URL publique `?c=` (config sharing)

- **Changements** :
  - Partage de configuration via paramètre URL `?c=` : gzip + base64url de `{target, auth, scopes, ttl}` (sans token)
  - Auto-update temps réel dans la barre d'adresse via `history.replaceState`
  - Decode au chargement : pré-remplissage automatique du formulaire
  - Module client `src/ui/client/share-config.ts`
  - Suppression de la section share-url (doublon avec la barre d'adresse)
  - Reset du formulaire vide le paramètre `?c=`
- **Décisions** :
  - Pas d'ADR : encoding standard, pas de décision structurante
  - Pas de token dans l'URL partagée (sécurité)

## 2026-04-16 — Import FGP (decode blob)

- **Changements** :
  - Nouvel endpoint `POST /api/decode` : déchiffre un blob avec sa clé client, retourne la config complète avec token redacté
  - Module client `src/ui/client/import-config.ts` : bouton "Importer" dans les presets, extraction blob depuis URL ou brut
  - Pré-remplissage du formulaire après import, token laissé vide (redacté affiché en status)
  - 7 tests d'intégration AC-16
- **Décisions** :
  - Token toujours redacté dans la réponse decode (sécurité, jamais renvoyé en clair)

## 2026-04-16 — Fiches de poste, .env, doc, UX polish

- **Changements** :
  - Fiches de poste par rôle dans `docs/team/` : lead, dev, po, testeur, designer
  - `.env.example` + `.env` + `--env-file` dans deno.json
  - Doc aside "Partage & import" dans l'UI
  - Nouvel endpoint `POST /api/test-proxy` : test end-to-end avec vrai appel API cible
  - Endpoints `POST /api/share/encode` et `POST /api/share/decode` pour URLs publiques
  - Champ "Nom de la configuration" dans le formulaire (cosmétique, inclus dans `?c=`)
  - Body filters inclus dans l'URL publique `?c=`
  - Presets réorganisés en `<details>/<summary>` (accordéons)
  - Fix pipe methods (`GET|POST`) dans le scope matching
  - `version.txt` build-time pour le SHA git dans le footer
  - Onglets Doc / Exemples / Changelog dans l'aside UI (module `tabs.ts`)
  - 312 tests, 0 failed
- **Prochaines étapes** :
  - Premier déploiement Deno Deploy
  - Test e2e avec un vrai token Scalingo
