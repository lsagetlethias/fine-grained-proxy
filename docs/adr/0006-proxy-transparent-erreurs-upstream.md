# ADR 0006 — Proxy transparent vs gateway opinionated pour les erreurs upstream

- **Date** : 2026-04-22
- **Statut** : Accepted

## Contexte

Jusqu'ici, `src/middleware/proxy.ts` opérait comme un **gateway opinionated** : il transformait certaines réponses de l'API cible avant de les renvoyer au client.

Comportement actuel :

- Upstream `401` → transformé en `502 upstream_auth_failed` (shape FGP).
- Upstream `429` → status conservé, mais body réécrit en `{error: "rate_limited", ...}` (shape FGP).
- Upstream `5xx` → transformé en `502 upstream_error` (shape FGP).
- `fetch` throw → `502 upstream_error` (shape FGP).
- `Set-Cookie` filtré (stateless).
- Aucun header ne permet au client de distinguer une erreur produite par FGP d'une erreur produite par l'API cible.

Les motivations initiales de ce gateway étaient :

1. **Masquer l'upstream** : fournir au client une erreur "propre" et uniforme côté FGP.
2. **UX client** : éviter que le client ait à gérer deux shapes d'erreur (FGP vs upstream).
3. **Absorber les particularités** : certains upstreams renvoient des 401 dans des formats exotiques.

Plusieurs problèmes sont apparus avec ce modèle :

- **Opacité debug** : un client qui reçoit `502 upstream_auth_failed` ne sait pas ce que l'upstream a réellement renvoyé. Le body upstream est perdu, y compris les codes d'erreur spécifiques à l'API cible.
- **Correctness proxy** : un proxy HTTP est par nature transparent. Transformer un `500` upstream en `502` change le contrat : le status `502 Bad Gateway` signifie sémantiquement "je n'ai pas réussi à joindre l'upstream", pas "l'upstream a planté en interne".
- **401 mal attribué** : un `401` upstream signifie que le token configuré dans le blob est invalide côté API cible. C'est un problème de config client (utilisateur qui a généré le blob), pas un problème de proxy. Le transformer en `502` masque cette information et laisse penser à une panne FGP.
- **Réécriture de body** : la réécriture du 429 efface les informations upstream (détail des quotas, timestamp de reset non standard, etc.) que le client légitime pourrait consommer.
- **Pas de distinction source** : aucun moyen pour le client de savoir si la réponse vient de FGP ou de l'upstream. Un `401` pouvait être `missing_key` (FGP) ou `invalid_credentials` (FGP) ou un 401 upstream transformé — ambigu.

## Décision

Basculer sur un modèle **proxy transparent** :

1. **Toute réponse HTTP reçue de l'upstream est forwardée telle quelle** : status original, body original, headers (sauf `Set-Cookie` qui reste filtré pour préserver la nature stateless). Aucune réécriture. Le header `X-FGP-Source: upstream` est ajouté.

2. **Les erreurs FGP** (validation de blob, décryptage, TTL, scopes, auth mode invalide, body filters) conservent leur shape `{error, message}` et leurs status actuels, mais portent désormais le header `X-FGP-Source: proxy`.

3. **Seule 502 légitime** : `502 upstream_unreachable` quand `fetch` throw (DNS, timeout, connexion refusée, TLS). C'est le seul cas où le proxy n'a pas reçu de réponse upstream et peut légitimement renvoyer un 502. Header `X-FGP-Source: proxy`.

4. **Handler `app.onError` global** : toute exception non catchée dans le pipeline produit `500 internal_error` avec la même shape FGP `{error, message}` et `X-FGP-Source: proxy`.

5. **Harmonisation des endpoints internes** : les endpoints FGP qui consomment eux-mêmes des APIs externes (ex : `/api/list-apps` qui tape Scalingo pour l'UI) utilisent le même modèle : `upstream_unreachable` sur fetch throw, pas de 502 `upstream_error` générique.

Le header `X-FGP-Source` devient le contrat officiel pour que le client distingue une erreur proxy d'une erreur upstream.

## Options envisagées

### Option A — Garder le gateway opinionated
- Avantages : shape d'erreur uniforme pour le client, masquage de l'upstream, rétrocompatibilité totale.
- Inconvénients : perte d'information upstream (body effacé, status réécrit), mauvaise attribution des 401, viole la sémantique d'un proxy HTTP, rend le debug difficile.

### Option B — Proxy transparent + `X-FGP-Source` (retenue)
- Avantages : respect du contrat upstream, debug facile, attribution claire des erreurs via header, sémantique HTTP correcte (502 = upstream injoignable, pas upstream en erreur), le client voit exactement ce que l'API cible a répondu.
- Inconvénients : breaking change pour les clients existants qui matchaient sur les codes FGP (`upstream_error`, `upstream_auth_failed`, body `rate_limited`). Le client doit apprendre à lire `X-FGP-Source`.

### Option C — Modèle hybride (proxy transparent + shim uniforme optionnel)
- Avantages : rétrocompatibilité via un query param ou header de config.
- Inconvénients : complexité accrue (deux code paths), ambiguïté pour les consommateurs, tentation de garder les deux modes indéfiniment. Rejetée pour simplicité.

## Conséquences

- **Breaking change du contrat API** : les clients qui matchaient sur `{"error": "upstream_error"}`, `{"error": "upstream_auth_failed"}` ou `{"error": "rate_limited"}` dans le body de la réponse vont casser. Les erreurs upstream sont maintenant les erreurs natives de l'API cible (status + body upstream inchangés). À signaler dans le changelog UI comme **changement majeur** (v3.1 ou équivalent).
- **Amélioration du debug** : le client voit la vraie réponse de l'API cible, avec son body (codes d'erreur métier, détails quotas, messages standards).
- **Sémantique HTTP correcte** : `502` redevient un vrai `502` (upstream injoignable). `401` upstream reste `401` (token client invalide côté API cible, pas un problème de proxy).
- **Pas de "magie" de transformation** : simplification du code proxy, moins de surface à maintenir.
- **Nouveau contrat côté client** : les consommateurs sont encouragés à utiliser `X-FGP-Source` pour router leur gestion d'erreur (`proxy` → problème de config/scopes FGP, `upstream` → problème métier côté API cible).
- **Set-Cookie toujours filtré** : c'est l'unique entorse à la transparence pure, justifiée par la nature stateless du proxy. Documentée en section 8.1 des specs.
- **Harmonisation des endpoints internes** : `/api/list-apps` et endpoints similaires basculent sur `upstream_unreachable` pour les fetch throws.

## Liens

- ADR-0003 : Proxy agnostique, scopes génériques
- `docs/specs.md` section 8 : Comportement des erreurs
- `src/middleware/proxy.ts` : implémentation actuelle à remplacer
- `src/routes/ui.tsx` (endpoint list-apps) : à harmoniser
