# Matrice de couverture AC → Tests

**Date** : 2026-04-09
**Ref** : `docs/acceptance-criteria.md` v2.0

## Legende

- **OK** : test present et passe
- **FAIL** : test present mais echoue (bug code)
- **IGNORED** : test present, marque `ignore: true` (bug code connu)

---

## AC-1 — Dechiffrement et authentification

| AC | Description | Test(s) | Status |
|----|-------------|---------|--------|
| AC-1.1 | Header X-FGP-Key manquant → 401 | tests/testi/proxy.test.ts `AC-1.1:` | OK |
| AC-1.2 | Cle client invalide → 401 | tests/testi/proxy.test.ts `AC-1.2:` | OK |
| AC-1.3 | Blob corrompu → 401 | tests/testu/crypto/blob.test.ts `AC-1.3:` + tests/testi/proxy-edge-cases.test.ts `AC-1.3:` | OK |
| AC-1.4 | Blob trop grand → 414 | tests/testi/proxy.test.ts `AC-1.4:` | OK |
| AC-1.5 | Dechiffrement reussi | tests/testi/proxy.test.ts `AC-1.5:` | OK |
| AC-1.6 | Blob v2 et v3 supportes | tests/testu/crypto/blob-validation.test.ts `AC-1.6:` (x2) | OK |
| AC-1.7 | Blob avec limites depassees | tests/testu/crypto/blob-validation.test.ts (AC-6.x couvrent les cas) | OK |

## AC-2 — Verification du TTL

| AC | Description | Test(s) | Status |
|----|-------------|---------|--------|
| AC-2.1 | Token non expire | tests/testu/crypto/blob.test.ts `AC-2.1:` | OK |
| AC-2.2 | Token expire | tests/testu/crypto/blob.test.ts `AC-2.2:` + tests/testi/proxy.test.ts `AC-2.2:` | OK |
| AC-2.3 | TTL zero (pas d'expiration) | tests/testu/crypto/blob.test.ts `AC-2.3:` + tests/testi/proxy.test.ts `AC-2.3:` | OK |
| AC-2.4 | Limite exacte du TTL | tests/testu/crypto/blob-validation.test.ts `AC-2.4:` | OK |

## AC-3 — Scopes string (METHOD:PATH)

| AC | Description | Test(s) | Status |
|----|-------------|---------|--------|
| AC-3.1 | Scope exact match | tests/testu/middleware/scopes.test.ts `AC-3.1:` + tests/testi/proxy.test.ts `AC-3.1+AC-3.11:` | OK |
| AC-3.2 | Scope exact mismatch | tests/testu/middleware/scopes.test.ts `AC-3.2:` (x2) + tests/testi/proxy.test.ts `AC-3.2:` | OK |
| AC-3.3 | Wildcard path | tests/testu/middleware/scopes.test.ts `AC-3.3:` | OK |
| AC-3.4 | Wildcard methode | tests/testu/middleware/scopes.test.ts `AC-3.4:` + tests/testi/proxy.test.ts `AC-3.4:` | OK |
| AC-3.5 | Multi-methodes | tests/testu/middleware/scopes.test.ts `AC-3.5:` + tests/testi/proxy.test.ts `AC-3.5+AC-3.6:` | OK |
| AC-3.6 | Multi-methodes — methode non listee | tests/testu/middleware/scopes.test.ts `AC-3.6:` + tests/testi/proxy.test.ts `AC-3.5+AC-3.6:` | OK |
| AC-3.7 | Full wildcard | tests/testu/middleware/scopes.test.ts `AC-3.7:` + tests/testi/proxy.test.ts `AC-3.7:` | OK |
| AC-3.8 | Methode case-insensitive | tests/testu/middleware/scopes.test.ts `AC-3.8:` | OK |
| AC-3.9 | Scope sans separateur | tests/testu/middleware/scopes.test.ts `AC-3.9:` | OK |
| AC-3.10 | Scopes additifs | tests/testu/middleware/scopes.test.ts `AC-3.10:` | OK |
| AC-3.11 | Deny-all par defaut | tests/testu/middleware/scopes.test.ts `AC-3.11:` (x2) + tests/testi/proxy.test.ts `AC-3.11:` | OK |

## AC-4 — Scopes structures (ScopeEntry) sans body filters

| AC | Description | Test(s) | Status |
|----|-------------|---------|--------|
| AC-4.1 | ScopeEntry sans body filters — match | tests/testu/middleware/body-filters.test.ts `AC-4.1:` + tests/testi/body-filters.test.ts `AC-4.1:` | OK |
| AC-4.2 | ScopeEntry methode mismatch | tests/testu/middleware/body-filters.test.ts `AC-4.2:` | OK |
| AC-4.3 | ScopeEntry multi-methodes | tests/testu/middleware/body-filters.test.ts `AC-4.3:` | OK |
| AC-4.4 | Mix string et ScopeEntry | tests/testu/middleware/body-filters.test.ts `AC-4.4:` + tests/testi/body-filters.test.ts `AC-4.4:` (x2) | OK |

## AC-5 — Body filters

| AC | Description | Test(s) | Status |
|----|-------------|---------|--------|
| AC-5.1 | Body filter exact match | tests/testu/middleware/body-filters.test.ts `AC-5.1:` (x2) + tests/testi/body-filters.test.ts `AC-5.1:` | OK |
| AC-5.2 | Body filter exact mismatch | tests/testu/middleware/body-filters.test.ts `AC-5.2:` + tests/testi/body-filters.test.ts `AC-5.2:` | OK |
| AC-5.3 | Body filter champ absent | tests/testu/middleware/body-filters.test.ts `AC-5.3:` | OK |
| AC-5.4 | Body filter wildcard | tests/testu/middleware/body-filters.test.ts `AC-5.4:` | OK |
| AC-5.5 | Body filter stringwildcard | tests/testu/middleware/body-filters.test.ts `AC-5.5:` + tests/testi/body-filters.test.ts `AC-5.5+AC-5.6:` | OK |
| AC-5.6 | Body filter stringwildcard mismatch | tests/testu/middleware/body-filters.test.ts `AC-5.6:` + tests/testi/body-filters.test.ts `AC-5.5+AC-5.6:` | OK |
| AC-5.7 | Body filter OR (valeurs multiples) | tests/testu/middleware/body-filters.test.ts `AC-5.7:` | OK |
| AC-5.8 | Body filters AND (filtres multiples) | tests/testu/middleware/body-filters.test.ts `AC-5.8:` | OK |
| AC-5.9 | Body filters AND partial failure | tests/testu/middleware/body-filters.test.ts `AC-5.9:` | OK |
| AC-5.10 | Body filter dot-path (nested) | tests/testu/middleware/body-filters.test.ts `AC-5.10:` | OK |
| AC-5.11 | Body filter — not (exclusion) | tests/testu/middleware/body-filters.test.ts `AC-5.11:` | OK |
| AC-5.12 | Body filter — not match | tests/testu/middleware/body-filters.test.ts `AC-5.12:` | OK |
| AC-5.13 | Body filter — and (composition) | tests/testu/middleware/body-filters.test.ts `AC-5.13:` | OK |
| AC-5.14 | Body filter — and failure | tests/testu/middleware/body-filters.test.ts `AC-5.14:` | OK |
| AC-5.15 | Body non JSON avec body filters | tests/testi/body-filters.test.ts `AC-5.15:` | OK |
| AC-5.16 | Body JSON invalide avec body filters | tests/testi/body-filters.test.ts `AC-5.16:` | OK |
| AC-5.17 | Body filter regex match | tests/testu/middleware/body-filters.test.ts `AC-5.17:` + tests/testu/crypto/blob-validation.test.ts `AC-5.17:` | OK |
| AC-5.18 | Body filter regex mismatch | tests/testu/middleware/body-filters.test.ts `AC-5.18:` | OK |
| AC-5.19 | Body filter regex invalide dans le blob | tests/testu/crypto/blob-validation.test.ts `AC-5.19:` | OK |
| AC-5.20 | Requete GET avec ScopeEntry + body filters | tests/testi/body-filters.test.ts `AC-5.20:` | OK |
| AC-5.21 | ScopeEntry avec body filters — body absent | tests/testu/middleware/body-filters.test.ts `AC-5.21:` + tests/testi/body-filters.test.ts `AC-5.21:` | OK |

## AC-6 — Limites body filters

| AC | Description | Test(s) | Status |
|----|-------------|---------|--------|
| AC-6.1 | Profondeur and/not depassee | tests/testu/crypto/blob-validation.test.ts `AC-6.1:` (x2) | OK |
| AC-6.2 | Trop de body filters par scope | tests/testu/crypto/blob-validation.test.ts `AC-6.2:` | OK |
| AC-6.3 | Trop de valeurs OR | tests/testu/crypto/blob-validation.test.ts `AC-6.3:` | OK |
| AC-6.4 | Trop de ScopeEntry | tests/testu/crypto/blob-validation.test.ts `AC-6.4:` | OK |
| AC-6.5 | Dot-path trop profond | tests/testu/crypto/blob-validation.test.ts `AC-6.5:` | OK |
| AC-6.6 | not(wildcard) interdit | tests/testu/crypto/blob-validation.test.ts `AC-6.6:` | OK |
| AC-6.7 | not(not(...)) interdit | tests/testu/crypto/blob-validation.test.ts `AC-6.7:` | OK |
| AC-6.8 | and vide interdit | tests/testu/crypto/blob-validation.test.ts `AC-6.8:` | OK |
| AC-6.9 | and a un seul element interdit | tests/testu/crypto/blob-validation.test.ts `AC-6.9:` | OK |

## AC-7 — Modes d'authentification

| AC | Description | Test(s) | Status |
|----|-------------|---------|--------|
| AC-7.1 | Mode bearer | tests/testi/proxy.test.ts `AC-7.1:` | OK |
| AC-7.2 | Mode basic | tests/testi/proxy.test.ts `AC-7.2:` | OK |
| AC-7.3 | Mode scalingo-exchange | tests/testi/proxy.test.ts `AC-7.3+AC-8.1:` | OK |
| AC-7.4 | Mode header custom | tests/testi/proxy.test.ts `AC-7.4:` | OK |
| AC-7.5 | Mode d'auth invalide | tests/testi/proxy-edge-cases.test.ts `AC-7.5:` | OK |

## AC-8 — Bearer cache (scalingo-exchange)

| AC | Description | Test(s) | Status |
|----|-------------|---------|--------|
| AC-8.1 | Bearer cache hit | tests/testu/auth/cache.test.ts `AC-8.1:` + tests/testi/proxy.test.ts `AC-7.3+AC-8.1:` | OK |
| AC-8.2 | Bearer cache TTL | tests/testu/auth/cache.test.ts `AC-8.2:` | OK |
| AC-8.3 | Singleflight — un seul exchange par token | tests/testi/proxy.test.ts `AC-8.3:` | OK |
| AC-8.4 | Singleflight — echec propage | tests/testi/proxy-edge-cases.test.ts `AC-8.4:` | OK |

## AC-9 — Forward et headers

| AC | Description | Test(s) | Status |
|----|-------------|---------|--------|
| AC-9.1 | Header X-FGP-Key non forwarde | tests/testi/headers.test.ts `AC-9.1:` + tests/testi/proxy.test.ts `AC-9.1+AC-15.2:` | OK |
| AC-9.2 | Header Host supprime | tests/testi/headers.test.ts `AC-9.2:` | OK |
| AC-9.3 | Query string preservee | tests/testi/proxy-edge-cases.test.ts `AC-9.3:` | OK |
| AC-9.4 | Propagation des headers de reponse | tests/testi/headers.test.ts `AC-9.4+AC-9.5:` | OK |
| AC-9.5 | Filtrage de Set-Cookie | tests/testi/proxy.test.ts `AC-9.5:` + tests/testi/headers.test.ts `AC-9.4+AC-9.5:` | OK |
| AC-9.6 | Reponse non-JSON | tests/testi/headers.test.ts `AC-9.6:` | OK |

## AC-10 — Gestion des erreurs upstream

| AC | Description | Test(s) | Status |
|----|-------------|---------|--------|
| AC-10.1 | Token rejete par la cible | tests/testi/proxy.test.ts `AC-10.1:` | OK |
| AC-10.2 | API cible indisponible | tests/testi/proxy.test.ts `AC-10.2:` + tests/testi/proxy-edge-cases.test.ts `AC-10.2:` (x2: 503 + network error) | OK |
| AC-10.3 | Rate limit upstream (429) | tests/testi/proxy.test.ts `AC-10.3:` | OK |
| AC-10.4 | Rate limit sans Retry-After | tests/testi/headers.test.ts `AC-10.4:` | OK |

## AC-11 — Ordre de verification

| AC | Description | Test(s) | Status |
|----|-------------|---------|--------|
| AC-11.1 | Verification sequentielle (blob > 4KB first) | tests/testi/proxy-edge-cases.test.ts `AC-11.1:` | OK |
| AC-11.2 | TTL verifie avant les scopes | tests/testi/proxy-edge-cases.test.ts `AC-11.2:` | OK |
| AC-11.3 | Auth mode verifie apres TTL | tests/testi/proxy-edge-cases.test.ts `AC-11.3:` | IGNORED |

> **AC-11.3 BUG** : Le code verifie le auth mode (ligne 159) AVANT le TTL (ligne 166) dans `src/middleware/proxy.ts`. L'AC dit que le TTL devrait etre verifie en premier. Le test est present mais `ignore: true`.

## AC-12 — Endpoints internes

| AC | Description | Test(s) | Status |
|----|-------------|---------|--------|
| AC-12.1 | Health check | tests/testi/endpoints.test.ts `AC-12.1:` | OK |
| AC-12.2 | Salt public | tests/testi/endpoints.test.ts `AC-12.2:` | OK |
| AC-12.3 | UI de configuration | tests/testi/endpoints.test.ts `AC-12.3:` | OK |
| AC-12.4 | OpenAPI spec | tests/testi/endpoints.test.ts `AC-12.4:` | OK |
| AC-12.5 | Swagger UI | tests/testi/endpoints.test.ts `AC-12.5:` | OK |
| AC-12.6 | API 404 | tests/testi/endpoints.test.ts `AC-12.6:` + tests/testi/api-edge-cases.test.ts `AC-12.6:` | OK |

## AC-13 — Generation d'URL (POST /api/generate)

| AC | Description | Test(s) | Status |
|----|-------------|---------|--------|
| AC-13.1 | Generation reussie | tests/testi/api.test.ts `AC-13.1:` | OK |
| AC-13.2 | Body invalide | tests/testi/api.test.ts `AC-13.2:` (x2) + tests/testi/endpoints.test.ts `AC-13.2:` | OK |
| AC-13.3 | Blob trop grand a la generation | tests/testi/api-edge-cases.test.ts `AC-13.3:` | OK |
| AC-13.4 | Limites body filters a la generation | tests/testi/api.test.ts `AC-13.4:` (x5: 8 filters, 16 OR, dot-path, 10 scopes, valid within limits) | OK |
| AC-13.5 | Version automatique (v2/v3) | tests/testi/api.test.ts `AC-13.5:` (x2: string→v2, ScopeEntry→v3) | OK |
| AC-13.6 | Combinaisons interdites a la generation | tests/testi/api.test.ts `AC-13.6:` (x4: not(wildcard), not(not), and vide, and 1 element) | OK |

## AC-14 — Chiffrement / dechiffrement du blob

| AC | Description | Test(s) | Status |
|----|-------------|---------|--------|
| AC-14.1 | Round-trip chiffrement | tests/testu/crypto/blob.test.ts `AC-14.1:` | OK |
| AC-14.2 | Cle differente = echec | tests/testu/crypto/blob.test.ts `AC-14.2:` | OK |
| AC-14.3 | Salt different = echec | tests/testu/crypto/blob.test.ts `AC-14.3:` | OK |
| AC-14.4 | IV unique | tests/testu/crypto/blob.test.ts `AC-14.4:` | OK |

## AC-15 — Securite transversale

| AC | Description | Test(s) | Status |
|----|-------------|---------|--------|
| AC-15.1 | Token jamais expose | tests/testi/proxy.test.ts `AC-15.1:` | OK |
| AC-15.2 | Cle client jamais forwardee | tests/testi/proxy.test.ts `AC-9.1+AC-15.2:` + tests/testi/headers.test.ts `AC-9.1:` | OK |
| AC-15.3 | Messages d'erreur generiques | tests/testi/proxy-edge-cases.test.ts `AC-15.3:` | OK |

## AC-16 — UI de configuration

| AC | Description | Test(s) | Status |
|----|-------------|---------|--------|
| AC-16.1 | Layout split | N/A (visuel/CSS, non testable en unit/integration) | N/A |
| AC-16.2 | Presets | N/A (comportement JS client) | N/A |
| AC-16.3 | Chargement des apps Scalingo | N/A (necessite e2e avec UI) | N/A |
| AC-16.4 | Body filters UI | N/A (comportement JS client) | N/A |
| AC-16.5 | Dark mode | N/A (CSS media query) | N/A |
| AC-16.6 | Warning TTL zero | N/A (comportement JS client) | N/A |
| AC-16.7 | Refus si blob trop grand | N/A (UI + API, couvert cote API par AC-13.3) | N/A |

---

## Resume

| Section | Total AC | Couverts | Ignores | Non applicables |
|---------|----------|----------|---------|-----------------|
| AC-1 | 7 | 7 | 0 | 0 |
| AC-2 | 4 | 4 | 0 | 0 |
| AC-3 | 11 | 11 | 0 | 0 |
| AC-4 | 4 | 4 | 0 | 0 |
| AC-5 | 21 | 21 | 0 | 0 |
| AC-6 | 9 | 9 | 0 | 0 |
| AC-7 | 5 | 5 | 0 | 0 |
| AC-8 | 4 | 4 | 0 | 0 |
| AC-9 | 6 | 6 | 0 | 0 |
| AC-10 | 4 | 4 | 0 | 0 |
| AC-11 | 3 | 2 | 1 | 0 |
| AC-12 | 6 | 6 | 0 | 0 |
| AC-13 | 6 | 6 | 0 | 0 |
| AC-14 | 4 | 4 | 0 | 0 |
| AC-15 | 3 | 3 | 0 | 0 |
| AC-16 | 7 | 0 | 0 | 7 |
| **Total** | **104** | **96** | **1** | **7** |

- **96/104** AC couverts par des tests nommes (92.3%)
- **1** AC en echec (AC-11.3 : bug dans l'ordre de verification, auth mode verifie avant TTL)
- **7** AC non applicables (UI client-side, CSS, necessitent e2e browser)
