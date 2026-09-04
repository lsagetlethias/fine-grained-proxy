# ADR 0008 : Champ `auth` structuré (AuthSpec) et blob v4

- **Date** : 2026-09-03
- **Statut** : Accepted

## Contexte

Jusqu'en v3, le champ `auth` du blob est une simple string : `bearer`, `basic`, `scalingo-exchange`, ou `header:{name}`. Le secret associé vit dans un champ unique, `token`. Ce modèle tient tant qu'un mode d'authentification se résume à un secret et une façon de le poser.

Deux besoins le font craquer en même temps :

1. **Plusieurs headers d'authentification.** Certaines APIs exigent une combinaison, par exemple `X-API-Key` plus `X-Client-Id`. Un seul champ `token` ne peut pas en porter deux, et `header:{name}` ne décrit qu'un seul nom.
2. **Un flow d'authentification à plusieurs paramètres.** L'accès à la Database API d'un addon Scalingo demande une application, un identifiant d'addon et une région, en plus du token de compte. Aucun de ces paramètres n'a de place dans le modèle string.

La question n'est donc pas d'ajouter un mode de plus, c'est de décider si le champ `auth` reste un discriminant textuel ou devient une structure.

## Décision

Le champ `auth` accepte désormais une **union** : `string | AuthSpec`. Un blob dont `auth` est un objet est marqué `v: 4`.

```typescript
type AuthSpec =
  | { type: "headers"; headers: Array<{ name: string; value: string }> }
  | { type: "scalingo-addon"; app: string; addonId: string; apiUrl?: string };

type Auth = string | AuthSpec;
```

C'est exactement le pattern retenu pour les scopes en v3 (ADR 0004) : une union `string | objet`, la forme string restant la forme canonique du cas simple. Réutiliser le même pattern à un an d'intervalle est délibéré, un lecteur qui a compris les scopes v3 comprend `auth` v4 sans effort supplémentaire.

Trois règles complètent la décision :

- **Le versioning se calcule sur deux axes indépendants.** `auth` structuré donne v4, un scope structuré donne v3, sinon v2, et on retient la plus haute. Un blob v4 peut donc n'avoir que des scopes string. `v` marque une capacité de lecture, pas une génération fonctionnelle.
- **Sérialisation compacte à un seul header.** Un AuthSpec `headers` qui ne contient qu'une entrée est sérialisé en forme legacy `auth: "header:{name}"` avec la valeur dans `token`. Le mode structuré ne démarre qu'à deux entrées.
- **Un seul addon par blob.** Le mode `scalingo-addon` porte exactement un couple application/addon, sans liste ni résolution dynamique.

## Options envisagées

### Option A : champs frères au niveau du blob (rejetée)

Ajouter `authHeaders`, `addonApp`, `addonId` à côté de `auth`, et faire dépendre leur lecture de la valeur de `auth`.

- Avantages : pas de nouvelle version de blob, changement en apparence minimal.
- Inconvénients : le blob devient un sac de champs dont la validité dépend d'un autre champ. Rien n'empêche structurellement un blob de porter `auth: "bearer"` et un `addonId`, et il faut écrire à la main les règles de cohérence que le typage donnerait gratuitement. Chaque nouveau mode ajoute des champs au niveau racine, y compris pour les blobs qui ne s'en servent pas. C'est la porte ouverte à la configuration ambiguë.

### Option B : union `string | AuthSpec` (retenue)

- Avantages : chaque mode porte exactement les champs dont il a besoin, et rien d'autre. Le `type` sert de discriminant, donc la validation au déchiffrement est directe et exhaustive. Le pattern est déjà connu du projet grâce aux scopes v3. Les blobs v2 et v3 restent lisibles sans conversion.
- Inconvénients : introduit une seconde forme à valider et à documenter, et impose un bump de version.

### Option C : un `type` par mode, sans forme string (rejetée)

Passer tous les modes en objet, y compris `bearer` et `basic`, pour n'avoir qu'une seule forme.

- Avantages : uniformité totale, un seul chemin de lecture.
- Inconvénients : casse tous les blobs existants, pour un gain esthétique. Un `{ type: "bearer" }` n'apporte rien de plus que `"bearer"` et alourdit le blob, qui est contraint à 4 KB.

### Option D : mode headers toujours structuré, même à une entrée (rejetée)

- Avantages : une seule représentation pour le mode headers, pas de normalisation à écrire.
- Inconvénients : fait passer en v4 tous les blobs à header unique, qui sont le cas le plus courant, sans qu'ils y gagnent quoi que ce soit. Grossit le blob et crée une régression de compatibilité pour un usage déjà couvert par `header:{name}`. La normalisation coûte quelques lignes, la régression aurait coûté bien plus.

### Option E : mode addon avec liste de couples et résolution par le path (rejetée)

Permettre plusieurs addons par blob et sélectionner le bon en extrayant l'identifiant du chemin de la requête entrante.

- Avantages : un seul blob pour plusieurs bases de données.
- Inconvénients : la résolution repose sur une hypothèse que la documentation Scalingo ne permet pas de trancher. Sa page Databases indique que le segment d'URL correspond au champ `id` de l'addon, mais ses exemples affichent une valeur ressemblant à un `resource_id`. Des tests écrits sur cette hypothèse auraient validé notre supposition, pas la réalité, et seraient passés au vert avec une résolution fausse en production. Faute de compte de test pour lever le doute, le multi-addon est écarté. Accessoirement, un blob ouvrant l'accès à plusieurs bases contredit la promesse fine-grained du produit.

### Option F : wildcard `app: "*"` sur le mode addon (rejetée)

- Avantages : configuration minimale pour un compte entier.
- Inconvénients : obligerait FGP à lister les apps du compte pour résoudre l'addon, donc à maintenir un état en mémoire et à appeler l'API Scalingo hors du chemin de forward. Cela casse la nature stateless du proxy et donne de fait au blob un accès à tous les addons du compte, à l'opposé du principe de moindre privilège.

## Conséquences

- Les blobs v2 et v3 existants restent valides et lisibles sans changement. Aucune régénération n'est nécessaire, aucun blob en circulation ne casse.
- Un blob v4 présenté à une ancienne version du proxy est rejeté. C'est le comportement attendu : la donnée est structurellement nouvelle, pas seulement enrichie.
- **Les secrets ne sont plus concentrés dans `token`.** Les valeurs de headers en sont désormais, ce qui étend la surface à protéger : elles doivent être redactées par `POST /api/decode` et retirées des URLs de partage `?c=`, au même titre que le token. C'est la conséquence la plus facile à oublier de cette décision, et la plus coûteuse si elle l'est.
- Le mode `scalingo-addon` introduit un second cache de credentials, indépendant du cache bearer, et deux codes d'erreur dédiés, `auth_exchange_failed` et `auth_addon_failed`, qui remplacent l'ancien fourre-tout `upstream_unreachable` sur les échecs d'authentification.
- L'aplatissement de `app` et `addonId` au niveau de l'`AuthSpec` a un coût différé : un retour du multi-addon imposera de faire évoluer cette forme, soit par un champ additionnel, soit par un nouveau `type`.
- Le multi-addon reste réouvrable, mais sa condition d'entrée est une recette sur un vrai compte Scalingo, pas une relecture de documentation.

## Liens

- ADR 0003 : Proxy agnostique, scopes METHOD:PATH génériques
- ADR 0004 : Body filters et scopes structurés (blob v3), dont ce document reprend le pattern d'union
- `docs/specs.md` §6.3 (AuthSpec), §11.1 (modes d'authentification), §11.1.2 (mode Scalingo Database API)
- `docs/limits.md` §9 (limites du champ `auth` structuré)
