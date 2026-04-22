# Changelog

## 22 avril 2026

- Proxy transparent : les réponses de l'API cible sont forwardées telles quelles (status, body, headers)
- Nouveau header `X-FGP-Source: proxy|upstream` pour distinguer une erreur FGP d'une erreur de l'API cible
- **Breaking** : les codes `upstream_error`, `upstream_auth_failed` et le body `rate_limited` disparaissent. Les clients qui matchaient dessus doivent migrer sur `X-FGP-Source` + status/body natifs de l'API cible
- Nouveau code `upstream_unreachable` (502, fetch réseau échoué uniquement)
- Handler global `internal_error` (500) pour les exceptions non catchées
- Documentation OpenAPI durcie : les codes d'erreur sont typés par route (union `z.enum`), visible dans [Swagger UI](/api/docs) — utile pour les clients qui génèrent des SDKs

## 16 avril 2026

- Blob en header `X-FGP-Blob` (dual mode URL/header)
- Section « Tester un scope » avec highlight temps réel
- Test end-to-end via `POST /api/test-proxy`
- Partage de config via `?c=` (sans token)
- Import d'URL FGP existante avec token redacté
- API encode/decode pour URLs publiques
- Champ « Nom de la configuration »
- Body filters dans l'URL de partage `?c=`
- Presets réorganisés en accordéons
- Fix pipe methods dans le scope matching
- Onglets Doc / Exemples / Changelog

## 9 avril 2026

- Body filters v3 : exact, wildcard, glob, regex, not, and
- Scopes structurés (ScopeEntry) avec filtrage JSON body
- Tailwind CSS build-time (plus de CDN)
- Type regex dans les body filters
- Preset Scalingo enrichi (permissions par app, branches)
- Logo, SEO, palette fgp-*, dark mode media
- Extraction JS → modules TypeScript (esbuild)
- Migration Zod 4

## 8 avril 2026

- Première version : proxy stateless + double clé
- Chiffrement AES-256-GCM + PBKDF2 (Web Crypto)
- 4 modes d'auth : bearer, basic, scalingo-exchange, header custom
- Scopes METHOD:PATH avec wildcard
- UI de configuration (Hono JSX)
- OpenAPI 3.0 + Swagger UI
