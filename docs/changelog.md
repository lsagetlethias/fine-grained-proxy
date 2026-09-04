# Changelog

## 3 septembre 2026

- Nouveau mode d'auth « Headers multiples » : envoyez plusieurs headers d'authentification vers l'API cible (par exemple `X-API-Key` et `X-Client-Id`) depuis une seule URL FGP
- Nouveau mode d'auth « Scalingo Database API » : accès à une base Scalingo sans exposer votre token de compte, FGP obtient et renouvelle le token de base
- Le mode Scalingo existant s'appelle « Scalingo API » dans l'interface. Simple changement de libellé, vos blobs existants fonctionnent sans modification
- Une base de données par blob, choisie dans la liste de votre application en un clic. Pour en ouvrir une seconde, générez un second blob
- Blob v4 : le champ `auth` accepte une configuration structurée. Vos blobs v2 et v3 restent valides, aucune régénération n'est nécessaire
- Les valeurs de headers d'authentification sont traitées comme le token : redactées par `/api/decode`, retirées des URLs de partage `?c=`, jamais réaffichées après génération
- **Breaking** : un échec d'authentification Scalingo renvoie `auth_exchange_failed` au lieu de `upstream_unreachable`. Le status reste 502
- Nouveau code d'erreur `auth_addon_failed` (502) quand FGP n'arrive pas à obtenir le token de la base de données
- Vous pouvez fournir votre propre clé client à la génération (champ `key` de `/api/generate`, 24 à 256 caractères) pour ne gérer qu'un secret en CI
- L'interface avertit que réutiliser une clé lie les blobs entre eux, et affiche une jauge de diversité des caractères pour repérer les clés dégénérées
- Nouvelle page [`/llms.txt`](/llms.txt) : description de FGP lisible par un agent LLM (scopes, modes d'auth, body filters, codes d'erreur, exemples curl)
- En-têtes de sécurité HTTP (CSP, `nosniff`, `no-referrer`, HSTS) sur les réponses FGP uniquement : celles de votre API cible restent transmises sans ajout
- L'interface FGP ne peut plus être affichée dans une iframe
- Déploiement sur Scalingo par buildpack, avec `Procfile` et guide dédié, en plus de Deno Deploy et Docker. Contribution de [revolunet](https://github.com/revolunet)
- Correction : un blob dont le nom de header d'authentification est vide ou réservé (`header:`, `header:Host`) est refusé proprement, au lieu de provoquer une erreur 500
- Correction : une configuration de scopes malformée envoyée à `/api/generate` renvoie une erreur explicite nommant le champ fautif, au lieu d'une erreur 500
- Correction : la variable `PORT` est réellement prise en compte, elle était sans effet et le serveur écoutait toujours 8000. Vérifiez le port de votre reverse proxy
- Correction : l'image Docker embarque les assets compilés. L'interface y sortait sans CSS ni JavaScript
- Dépendances mises à jour et permissions du runtime resserrées

## 22 avril 2026

- Nouvelle page [`/logs`](/logs) pour consulter en direct les requêtes d'un blob (flux live + court historique in-memory)
- Logs opt-in par blob depuis l'onglet « Logs » de la configuration, deux niveaux : requêtes (méthode, chemin, status, durée, IP tronquée) ou bodies détaillés
- Bodies détaillés chiffrés avec votre clé client avant stockage : le serveur FGP ne peut pas les lire
- Zero storage strict : aucun log n'est persisté, purge automatique après 10 minutes d'inactivité
- Feature désactivable globalement par l'admin de l'instance (variable `FGP_LOGS_ENABLED`)
- Proxy transparent : les réponses de l'API cible sont forwardées telles quelles (status, body, headers)
- Nouveau header `X-FGP-Source: proxy|upstream` pour distinguer une erreur FGP d'une erreur de l'API cible
- **Breaking** : les codes `upstream_error`, `upstream_auth_failed` et `rate_limited` disparaissent. Migrez sur `X-FGP-Source` et les réponses natives de l'API cible
- Nouveau code `upstream_unreachable` (502, fetch réseau échoué uniquement)
- Handler global `internal_error` (500) pour les exceptions non catchées
- Documentation OpenAPI durcie : les codes d'erreur sont typés par route (union `z.enum`), visible dans [Swagger UI](/api/docs), utile pour les clients qui génèrent des SDKs

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
