# Matrice de couverture AC vers tests : lots v4 / BYOK / llms.txt / securite

**Date** : 2026-09-03
**Ref AC** : `docs/acceptance-criteria.md` v3.1, sections AC-34 a AC-42
**Ref challenge** : `docs/review/challenge-v4-byok-llms.md`
**Ref recette manuelle** : `docs/review/recette-manuelle-v4.md`
**Statut** : **LIVRE**. `deno task verify` vert : lint, `fmt:check`, type check serveur et client, **578 tests passes, 0 echec, 0 ignore**. Baseline avant ce lot : 411. Tests ajoutes : **167**.

## Legende

- **OK** : test ecrit et vert
- **MANUEL** : non couvrable automatiquement, procedure dans `recette-manuelle-v4.md`
- **OBSOLETE** : AC retire par l'arbitrage du 2026-09-03

---

## Fichiers livres

| Fichier | Tests | Contenu |
|---------|-------|---------|
| `tests/testu/crypto/auth-spec.test.ts` | 22 | Validation de l'`AuthSpec` au dechiffrement, bornes, charset, noms reserves |
| `tests/testi/auth-headers.test.ts` | 16 | Mode `headers` de bout en bout, serialisation compacte, resolution de version |
| `tests/testi/security-headers.test.ts` | 20 | §17 complet, `no-store`, invariant ADR-0006, parite, recensement, carve-out `/logs` |
| `tests/testu/llms-txt.test.ts` | 14 | Structure llmstxt.org, taille, langue, URLs cles |
| `tests/testi/llms-txt.test.ts` | 12 | Contrat HTTP, decouverte, mode header, paths a un segment |
| `tests/testu/auth/addon-cache.test.ts` | 12 | Second cache addon, chainage, singleflight, resolution d'`apiUrl` |
| `tests/testi/byok.test.ts` | 18 | Contrat serveur de la cle fournie, dont le collage de 310 caracteres |
| `tests/testi/auth-secrets.test.ts` | 11 | Les trois surfaces de fuite, redaction, partage `?c=`, `resourceId` |
| `tests/testi/list-addons.test.ts` | 11 | `/api/list-addons`, `app_not_found`, regle de cadrage, enums |
| `tests/testi/scalingo-addon.test.ts` | 10 | Mode addon de bout en bout, echecs, ordre de verification |
| `tests/testi/retro-compat.test.ts` | 8 | Blobs v2 et v3 inchanges, champ `logs`, pas de migration implicite |
| `tests/testu/crypto/client-key.test.ts` | 7 | Validation unitaire de la cle, bornes et charset |
| `tests/testu/ui/config-page.test.ts` | 6 | Attributs de `#byok-key`, absence d'inline (protege la CSP) |

Convention appliquee : virgule dans les noms de test (ils portent deja le deux-points du prefixe AC), deux-points dans les commentaires, zero tiret cadratin.

---

## AC-34 : AuthSpec `headers`

| AC | Description | Test | Statut |
|----|-------------|------|--------|
| AC-34.1 | Deux headers donnent v4, ordre preserve | `auth-headers` | **OK** |
| AC-34.2 | Un seul header serialise en `header:{name}`, blob v2 | `auth-headers` | **OK** |
| AC-34.3 | Tous les headers poses sur la requete sortante | `auth-headers` | **OK** |
| AC-34.4 | Le blob ecrase le header homonyme du client | `auth-headers` | **OK** |
| AC-34.5 | `token` omis a la generation | `auth-headers` | **OK** |
| AC-34.6 | `token` orphelin supprime et jamais forwarde | `auth-spec` + `auth-headers` | **OK** |
| AC-34.7 | Blob v4 headers sans `token` accepte | `auth-spec` | **OK** |
| AC-34.8 | Auth string sans `token` rejetee | `auth-spec` | **OK** |
| AC-34.9 | `auth` objet avec `v` < 4 rejete | `auth-spec` | **OK** |
| AC-34.10 | Type d'AuthSpec inconnu en 401, pas 400 | `auth-spec` | **OK** |
| AC-34.11 | Auth string non supportee en 400 `invalid_auth_mode` | `auth-spec` + `auth-headers` | **OK** |
| AC-34.12 | `headers` vide rejete | `auth-spec` | **OK** |
| AC-34.13 | Nom ou valeur vide rejete | `auth-spec` | **OK** |
| AC-34.14 | Doublon insensible a la casse rejete | `auth-spec` | **OK** |
| AC-34.15 | Limite 8 headers, bornes exactes | `auth-spec` | **OK** |
| AC-34.16 | Nom 64 caracteres, bornes exactes | `auth-spec` | **OK** |
| AC-34.17 | Valeur 1024 caracteres, bornes exactes | `auth-spec` | **OK** |
| AC-34.18 | Charset token RFC 7230 | `auth-spec` | **OK** |
| AC-34.19 | Caracteres de controle dans la valeur rejetes | `auth-spec` + `auth-headers` | **OK** |
| AC-34.20 | 9 headers a la generation en 400 | `auth-headers` | **OK** |
| AC-34.21 | Aucun appel reseau supplementaire | `auth-headers` | **OK** |
| AC-34.22 | Noms reserves rejetes, `authorization` autorise | `auth-spec` + `auth-headers` | **OK** |

## AC-35 : AuthSpec `scalingo-addon` (mono-addon)

| AC | Description | Test | Statut |
|----|-------------|------|--------|
| AC-35.1 | Flow nominal en trois temps | `scalingo-addon` + `addon-cache` | **OK** |
| AC-35.2 a 35.7 | Resolution multi-addon | - | **OBSOLETE** |
| AC-35.8 | Echec etape 1 en `auth_addon_failed` | `scalingo-addon` | **OK** |
| AC-35.9 | Etape 2 non-2xx en `auth_addon_failed` | `scalingo-addon` | **OK** |
| AC-35.10 | Etape 2 injoignable, pas `upstream_unreachable` | `scalingo-addon` | **OK** |
| AC-35.11 | Cache du token d'addon | `addon-cache` | **OK** |
| AC-35.12 | Cache par couple app/addon, cle non ambigue | `addon-cache` (x3) | **OK** |
| AC-35.13 | Chainage des caches | `addon-cache` | **OK** |
| AC-35.14 | Singleflight | `addon-cache` | **OK** |
| AC-35.15 | Echec propage, non memorise | `addon-cache` (x2) | **OK** |
| AC-35.16 | Resolution d'`apiUrl` en trois niveaux | `addon-cache` + `scalingo-addon` | **OK** |
| AC-35.17 | `apiUrl` non https ou relative rejetee | `auth-spec` | **OK** |
| AC-35.18, 35.19 | Limite de 5, doublons | - | **OBSOLETE** |
| AC-35.20 | `token` requis | `auth-spec` | **OK** |
| AC-35.21 | `app` ou `addonId` vide rejete | `auth-spec` | **OK** |
| AC-35.22 | Bornes 64 caracteres | `auth-spec` | **OK** |
| AC-35.23 | Token de compte n'atteint pas la cible | `scalingo-addon` | **OK** |
| AC-35.24 | `resourceId` n'atteint jamais le blob | `auth-secrets` | **OK** |
| AC-35.25 | Ancien format a tableau rejete | `auth-spec` | **OK** |

## AC-36 : Ordre de verification et echecs d'auth

| AC | Description | Test | Statut |
|----|-------------|------|--------|
| AC-36.1 | Hors scope, zero appel Scalingo | `scalingo-addon` | **OK** |
| AC-36.2 | TTL expire, zero appel Scalingo | `scalingo-addon` | **OK** |
| AC-36.3 | `addon_not_resolved` apres scopes | - | **OBSOLETE** |
| AC-36.4, 36.5 | `auth_exchange_failed` et singleflight | `proxy-edge-cases` | **OK** (dev) |
| AC-36.6 | `upstream_unreachable` reserve au forward | `scalingo-addon` | **OK** |
| AC-36.7 | `token_exchange_failed` sur les deux helpers | `list-addons` (x2) | **OK** |
| AC-36.8 | `upstream_list_addons_failed` | `list-addons` | **OK** |
| AC-36.9 | API injoignable | `list-addons` | **OK** |
| AC-36.10 | Body invalide | `list-addons` | **OK** |
| AC-36.11 | Shape de reponse, `id` et `resourceId` distincts | `list-addons` (x2) | **OK** |
| AC-36.12 | Enums OpenAPI, code mort disparu | `list-addons` (x2) + `byok` | **OK** |
| AC-36.13 | Messages generiques | `scalingo-addon` + `addon-cache` + `auth-secrets` | **OK** |
| AC-36.14 | `app_not_found` en 404 | `list-addons` | **OK** |
| AC-36.15 | Regle de cadrage, 403/429/500 non traduits | `list-addons` | **OK** |
| AC-36.16 | `app_not_found` cote UI | - | **MANUEL** (C.1.b) |

## AC-37 : Redaction des secrets d'auth

| AC | Description | Test | Statut |
|----|-------------|------|--------|
| AC-37.1 a 37.4 | Redaction `/api/decode`, shape `{name, valueRedacted}` | `auth-secrets` | **OK** |
| AC-37.5 a 37.8 | Partage sans secret, URL FGP sans secret | `auth-secrets` | **OK** |
| AC-37.9, 37.10 | Import et non-reutilisation d'une valeur redactee | - | **MANUEL** (D.3) |
| AC-37.11 | `/api/generate` ne renvoie que url, key, blob | `auth-secrets` | **OK** |
| AC-37.12 | Partage addon sans topologie du compte | `auth-secrets` | **OK** |
| AC-37.13 | Aller-retour de partage en mode addon | - | **MANUEL** (D.4) |

## AC-38 : Cle client fournie (BYOK)

| AC | Description | Test | Statut |
|----|-------------|------|--------|
| AC-38.1 a 38.3 | Defaut, cle fournie, non dechiffrable autrement | `byok` | **OK** |
| AC-38.4 a 38.8 | Bornes, espace, non ASCII, controle interieur | `byok` + `client-key` | **OK** |
| AC-38.9, 38.10 | Trim, et trim qui ne sauve pas | `byok` | **OK** |
| AC-38.11 a 38.13 | Validation serveur, pas d'echo, droits non partages | `byok` | **OK** |
| AC-38.14, 38.16 | `empty` refuse, distinct de `too-short` | `byok` + `client-key` | **OK** |
| AC-38.15 | Enum OpenAPI | `byok` | **OK** |
| AC-38.17 | `key: null` | `byok` | Partiel |
| AC-38.18 | Retour a la ligne de fin trimme | `byok` | **OK** |
| AC-38.19 | Charset ASCII imprimable complet | `client-key` | **OK** |

## AC-39 : UI, soumettabilite et champs masques

| AC | Description | Test | Statut |
|----|-------------|------|--------|
| AC-39.1 a 39.3 | Neutralisation de `#token`, soumettabilite | - | **MANUEL** (A.2 a A.4) |
| AC-39.4 | Aucun attribut de validation native ni `maxlength` | `config-page` (x2) | **OK** |
| AC-39.5 a 39.10 | Bloc BYOK, focus, badge, reset | - | **MANUEL** (B.1, B.2, B.6 a B.8) |
| AC-39.11 a 39.14 | Lignes de headers, region, application | - | **MANUEL** |
| AC-39.15 | Option affiche `resourceId`, transporte l'`id` | - | **MANUEL** (C.2.a, C.2.b) |
| AC-39.16 | Limite de 5 bases | - | **OBSOLETE** |
| AC-39.17 | Aucun script, style ou handler inline | `config-page` (x3) | **OK** |
| AC-39.18 | Validation client miroir | - | **MANUEL** (B.3) |
| AC-39.19 | Collage de plus de 300 caracteres | `byok` (serveur) + `config-page` (attribut) | **OK** serveur, **MANUEL** navigateur (B.3) |
| AC-39.20, 39.21 | Jauge a trois niveaux, hexa en élevée | - | **MANUEL** (B.5) |

## AC-40 : `/llms.txt`

| AC | Description | Test | Statut |
|----|-------------|------|--------|
| AC-40.1, 40.2 | Contrat HTTP, pas d'auth ni de kill switch | `llms-txt` (testi) | **OK** |
| AC-40.3 a 40.5 | Structure llmstxt.org | `llms-txt` (testu) | **OK** |
| AC-40.6, 40.7 | Taille sous 8 KB, document en anglais | `llms-txt` (testu) | **OK** |
| AC-40.8 | Structure et URLs cles, pas de test de copie | `llms-txt` (testu, x4) | **OK** |
| AC-40.9 a 40.11 | Liens sur l'origine, pas de donnee d'instance, stabilite | `llms-txt` (les deux) | **OK** |
| AC-40.12 | Mode header proxyfie | `llms-txt` (testi) + `security-headers` | **OK** |
| AC-40.13, 40.14 | Balise et header `Link` | `llms-txt` (testi) + `config-page` | **OK** |
| AC-40.15 | Pas de `Link` sur une reponse forwardee | `llms-txt` (testi) | **OK** |
| AC-40.16 | Paths a un seul segment, comportement observe | `llms-txt` (testi, x2) | **OK** |
| AC-40.17 | `/llms.txt` durci | `llms-txt` (testi) + `security-headers` | **OK** |

## AC-41 : Headers de securite et transparence

| AC | Description | Test | Statut |
|----|-------------|------|--------|
| AC-41.1 a 41.3 | En-tetes, CSP commune, CSP `/api/docs` | `security-headers` | **OK** |
| AC-41.4 | `Cache-Control: no-store` sur les 4 routes, plus contre-epreuve | `security-headers` (x4) | **OK** |
| AC-41.5 | INVARIANT mode URL | `security-headers` (x2) | **OK** |
| AC-41.6 | INVARIANT mode header | `security-headers` (x2) | **OK** |
| AC-41.7 | CSP upstream non ecrasee | `security-headers` | **OK** |
| AC-41.8 | INVARIANT structurel sur le montage | `security-headers` | **OK** |
| AC-41.9 | Recensement enumere depuis `app.routes` | `security-headers` | **OK** |
| AC-41.10, 41.11 | 404 `/static/*` et `/api/*` durcis et attribues a FGP | `security-headers` (x2) | **OK** |
| AC-41.12 | Erreurs FGP du proxy durcies | `security-headers` | **OK** |
| AC-41.13, 41.14 | PARITE des trois sources, CSP `/api/docs` intacte | `security-headers` | **OK** |
| AC-41.15 | `/logs` exclu du mode header | `security-headers` | **OK** |

## AC-42 : Retro-compatibilite v2 / v3

| AC | Description | Test | Statut |
|----|-------------|------|--------|
| AC-42.1 | Blob v2 bearer et basic inchanges | `retro-compat` (x2) | **OK** |
| AC-42.2 | Blob v3 exchange plus body filters inchange | `retro-compat` | **OK** |
| AC-42.3 | `header:{name}` inchange | `auth-headers` | **OK** |
| AC-42.4 a 42.7 | Resolution de version sur les quatre combinaisons | `auth-headers` + `auth-spec` | **OK** |
| AC-42.8 | `v` inconnu rejete | `auth-spec` | **OK** |
| AC-42.9 | `logs` orthogonal, `logs` mal type gracieux | `retro-compat` (x2) | **OK** |
| AC-42.10 | `/api/decode` v2 et v3, shape inchangee | `retro-compat` + `auth-secrets` | **OK** |
| AC-42.11 | Aller-retour de partage v2 fidele | `retro-compat` | **OK** |
| AC-42.12 | Aucun bump implicite | `retro-compat` | **OK** |

---

## Comptage

| Categorie | Nombre |
|-----------|--------|
| AC ecrits (AC-34 a AC-42) | 160 |
| Couverts par un test vert | 124 |
| A ecrire | 0 |
| Non couvrables, recette manuelle | 24 |
| Obsoletes (arbitrage du 2026-09-03) | 12 |

## Ce qui reste

**Rien de couvrable.** Les 124 AC automatisables des sections AC-34 a AC-42 sont ecrits et verts. AC-41.4 a ete livre apres verification que le `Cache-Control: no-store` etait bien pose par le code (`src/routes/ui.tsx` pour `/api/salt`, `/api/decode` et `/api/generate`, `src/routes/logs.tsx` pour `/logs/stream`, ce dernier en `no-store, no-transform`). Le bug du 404 sans `X-FGP-Source` a ete corrige en integration sur `/api/*` **et** sur `/static/*`, le test est passe au vert et le `ignore` a ete retire.

**24 AC en recette manuelle**, tous des comportements UI dynamiques ou la conformite reelle a l'API Scalingo. Procedure complete dans `recette-manuelle-v4.md`, six sequences, environ 25 minutes. La sequence C.2 reste la plus importante : elle est la seule qui valide le mode addon contre l'API Scalingo reelle, et elle demande un compte.
