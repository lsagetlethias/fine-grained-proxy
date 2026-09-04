# Changelog

## 3 septembre 2026

- Nouveau mode d'auth « Headers multiples » : envoyez plusieurs headers d'authentification vers l'API cible (par exemple `X-API-Key` et `X-Client-Id`) depuis une seule URL FGP
- Nouveau mode d'auth « Scalingo Database API » : donnez accès à une base de données Scalingo sans jamais exposer votre token de compte, FGP obtient et renouvelle le token de base pour vous
- Le mode Scalingo existant s'appelle désormais « Scalingo API » dans l'interface. C'est un simple changement de libellé : vos blobs existants continuent de fonctionner sans aucune modification
- Une base de données par blob, choisie dans la liste de votre application en un clic. Pour en ouvrir une seconde, générez un second blob : chacun garde son TTL, ses scopes et sa clé
- Blob v4 : le champ `auth` accepte une configuration structurée. Vos blobs v2 et v3 restent valides, aucune régénération n'est nécessaire
- Les valeurs de headers d'authentification sont traitées comme le token : redactées par `/api/decode`, retirées des URLs de partage `?c=`, jamais réaffichées après génération
- **Breaking** : un échec d'authentification Scalingo en mode « Scalingo API » renvoie désormais `auth_exchange_failed` au lieu de `upstream_unreachable`. Le status reste 502, seuls les clients qui testent le code d'erreur sont concernés
- Nouveau code d'erreur `auth_addon_failed` (502) quand FGP n'arrive pas à obtenir le token de la base de données
- Vous pouvez fournir votre propre clé client à la génération (champ `key` de `/api/generate`, 24 à 256 caractères) pour ne gérer qu'un seul secret en CI. Une clé vide est refusée plutôt que silencieusement remplacée
- L'interface avertit que réutiliser une clé lie les blobs entre eux, et affiche une jauge de diversité des caractères pour repérer les clés dégénérées
- Nouvelle page [`/llms.txt`](/llms.txt) : description de FGP lisible par un agent LLM (scopes, modes d'auth, body filters, codes d'erreur, exemples curl)
- En-têtes de sécurité HTTP (CSP, `nosniff`, `no-referrer`, HSTS) sur les réponses générées par FGP. Les réponses de votre API cible restent forwardées telles quelles, sans ajout. L'interface ne peut plus être affichée dans une iframe
- Correction : la variable `PORT` est de nouveau respectée. Elle était documentée mais sans effet, le serveur écoutait 8000 quoi qu'il arrive. Si votre plateforme définit `PORT`, l'instance écoute désormais réellement sur ce port
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
- **Breaking** : les codes `upstream_error`, `upstream_auth_failed` et le body `rate_limited` disparaissent. Les clients qui matchaient dessus doivent migrer sur `X-FGP-Source` + status/body natifs de l'API cible
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
