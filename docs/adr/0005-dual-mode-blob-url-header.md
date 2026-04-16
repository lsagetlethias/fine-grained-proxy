# ADR 0005 — Dual mode blob : URL ou header X-FGP-Blob

- **Date** : 2026-04-16
- **Statut** : Accepted

## Contexte

Le blob chiffré FGP était exclusivement transmis comme premier segment de l'URL : `/{blob}/path/to/resource`. Certains services (reverse proxies, CDN, load balancers) imposent une limite de 255 caractères par segment d'URL. Avec des scopes complexes ou des body filters, le blob base64url peut dépasser cette limite et causer des erreurs 414 ou des troncatures silencieuses.

## Décision

Introduire un mode alternatif où le blob est transmis via le header HTTP `X-FGP-Blob` au lieu de l'URL. Les deux modes coexistent (dual mode) :

- **Header mode (recommandé)** : le blob passe en header `X-FGP-Blob`, l'URL contient uniquement le path cible
- **URL mode (compatibilité)** : le blob reste dans le premier segment de l'URL, comportement existant inchangé

Le header mode est prioritaire : si `X-FGP-Blob` est présent, le proxy l'utilise même si l'URL contient un segment qui pourrait être un blob.

### Implémentation

- Un middleware `blobHeaderProxy()` est monté en catch-all (`*`) avant toutes les routes. Il intercepte les requêtes avec `X-FGP-Blob` et délègue à la logique proxy partagée (`handleProxy`).
- Le middleware existant `proxyMiddleware()` reste monté sur `/:blob/*` pour le mode URL.
- La logique commune est factorisée dans `handleProxy(c, blobRaw, proxyPath)`.
- Les deux headers FGP (`X-FGP-Key` et `X-FGP-Blob`) sont strippés avant le forward vers la target.
- L'API `/api/generate` retourne un champ `blob` en plus de `url` et `key`.

## Options envisagées

### Option A — Header mode exclusif (remplacement)
- Avantages : une seule implémentation, pas d'ambiguïté
- Inconvénients : breaking change pour tous les consommateurs existants, migration forcée

### Option B — Dual mode avec fallback (retenue)
- Avantages : rétrocompatible, migration progressive, le header est optionnel
- Inconvénients : deux chemins d'entrée à maintenir, légère complexité de routage

### Option C — Query parameter `?blob=`
- Avantages : pas de conflit de routing
- Inconvénients : les query strings sont loggées par défaut (sécurité), limite totale d'URL inchangée

## Conséquences

- Les consommateurs existants (blob dans l'URL) continuent de fonctionner sans modification
- Les nouveaux consommateurs sont encouragés à utiliser le mode header (documenté comme recommandé)
- Le middleware header est monté globalement (`*`), ce qui signifie que toute requête avec `X-FGP-Blob` est traitée comme proxy, même sur des paths comme `/healthz` — c'est voulu (le header est un signal explicite d'intention proxy)
- La factorisation de `handleProxy` simplifie la maintenance de la logique proxy

## Liens

- ADR-0002 : Chiffrement côté serveur
- ADR-0003 : Proxy agnostique, scopes génériques
