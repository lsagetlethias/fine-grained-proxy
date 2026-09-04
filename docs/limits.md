# Limites fonctionnelles des body filters

Document de cadrage pour borner la complexite des body filters (blob v3) et eviter les derives en termes de performance, taille de blob et surface d'attaque.

## Etat actuel du code

Seule la profondeur d'imbrication `and`/`not` est limitee aujourd'hui (`isValidObjectValue` dans `blob.ts`, max 10 niveaux). Tout le reste est illimite.

---

## 1. Profondeur max d'imbrication `and`/`not`

**Valeur : 4 niveaux** (actuellement 10, a reduire)

10 niveaux c'est deja absurde pour un use case reel. Un filtre du type `and(not(stringwildcard("x")), any("y"))` c'est deja 2 niveaux et ca couvre la quasi-totalite des besoins. 4 niveaux laissent de la marge pour des compositions complexes tout en empechant des arbres de matching profonds.

**Pourquoi limiter** : `matchObjectValue` est recursif. Chaque niveau multiplie les appels. A 10 niveaux avec des `and` qui contiennent eux-memes des `and`, on peut construire un arbre exponentiel. C'est un vecteur de DoS par blob crafted.

**Impact sans limite** : un blob malicieux avec 10 niveaux de `and` contenant chacun plusieurs sous-valeurs explose le temps CPU au matching. Le proxy bloque sur le check d'acces au lieu de forwarder.

---

## 2. Nombre max de body filters par scope

**Valeur : 8 filtres** (AND implicite entre eux)

Un scope qui filtre 8 champs differents du body couvre largement les cas CI/CD (branche, source, env, variables...). Au-dela, c'est probablement un mauvais design : il faut scinder en plusieurs scopes plutot que tout empiler sur un seul.

**Pourquoi limiter** : chaque body filter declenche un `resolveObjectPath` + un `matchObjectValue` sur chaque valeur OR. 8 filtres x N valeurs OR chacun, ca reste raisonnable. 50 filtres, non.

**Impact sans limite** : un ScopeEntry avec des dizaines de body filters ralentit le matching de chaque requete sur ce scope. Et surtout, le blob gonfle en taille et risque de depasser les 4KB.

---

## 3. Nombre max de valeurs OR par filtre

**Valeur : 16 valeurs**

Le OR c'est pour lister les alternatives acceptees sur un meme champ. 16 alternatives, c'est par exemple 16 branches autorisees pour un deploiement. C'est genereux. Si on en a plus, on devrait utiliser un `stringwildcard` avec un pattern glob plutot que de lister une a une.

**Pourquoi limiter** : `matchBodyFilter` fait un `.some()` sur le tableau OR. 16 iterations c'est rien. 200 iterations sur un body avec 8 filtres, ca commence a couter. Et chaque valeur est serialisee dans le blob.

**Impact sans limite** : blob qui explose en taille (chaque `ObjectValue` prend 20-100 octets JSON avant compression), et temps de matching lineaire en fonction du nombre de valeurs.

---

## 4. Nombre max de scopes structures (ScopeEntry) par blob

**Valeur : 10 ScopeEntry** (pas de limite sur les scopes string simples, ils sont legers)

10 endpoints avec body filters, c'est deja un proxy tres configure. Les scopes string simples (`"GET:/v1/apps/*"`) ne coutent rien en matching et presque rien en taille, donc pas besoin de les limiter au-dela de ce que la taille du blob impose naturellement.

**Pourquoi limiter** : chaque ScopeEntry avec body filters est evaluee sequentiellement dans `checkAccess`. Le cout est proportionnel au nombre de ScopeEntry x nombre de body filters x nombre de valeurs OR. Borner les ScopeEntry c'est borner le facteur multiplicatif principal.

**Impact sans limite** : un blob avec 50 ScopeEntry detaillees rend le `checkAccess` lent sur chaque requete, et le blob depasse probablement 4KB de toute facon.

---

## 5. Longueur max du dot-path

**Valeur : 6 segments** (profondeur max du traversal, ex: `a.b.c.d.e.f`)

Les API REST ont rarement des bodies JSON imbriques a plus de 4-5 niveaux. Scalingo c'est typiquement `deployment.git_ref` (2 niveaux) ou `app.formation.web.amount` (4 niveaux). 6 segments laissent de la marge sans autoriser le traversal de structures JSON arbitrairement profondes.

**Pourquoi limiter** : `resolveObjectPath` split sur "." et traverse le body cle par cle. 6 niveaux c'est O(6). 100 niveaux c'est O(100) mais surtout ca implique que le body est absurdement imbrique, ce qui est suspect.

**Impact sans limite** : risque faible en perf (le traversal est lineaire), mais un dot-path tres long peut etre utilise pour sonder la structure d'un body en profondeur et extraire de l'info par timing side-channel (found/not found = 403 vs 200).

---

## 6. Taille max du blob

**Valeur : 4 KB (4096 chars base64url) -- conserver tel quel**

Avec les limites ci-dessus, 4KB reste suffisant. Estimation worst case :
- 10 ScopeEntry x 8 body filters x 16 valeurs OR = 1280 ObjectValue
- Chaque ObjectValue fait ~50 octets JSON en moyenne
- 1280 x 50 = 64 KB en JSON brut, mais gzip compresse du JSON repetitif a ~85-90%
- 64 KB x 0.15 = ~10 KB compresse, ce qui depasse 4KB

Donc les limites de blob size et les limites structurelles se contraignent mutuellement. En pratique, un blob realiste (3-4 ScopeEntry, 2-3 body filters, 3-5 valeurs OR chacun) fait 500-1500 octets compresses. On est large.

Si on atteint regulierement 4KB, c'est un signal que les body filters sont trop detailles et qu'il faut revoir le design des scopes (utiliser des wildcards, scinder les tokens).

**Pourquoi ne pas augmenter** : le blob est dans l'URL. Les reverse proxies (nginx, Cloudflare, etc.) ont des limites sur la taille des URI, souvent 8KB. Avec le prefixe de path, il faut garder de la marge. 4KB est un sweet spot.

---

## 7. Combinaisons interdites

Certaines combinaisons d'ObjectValue sont syntaxiquement valides mais fonctionnellement absurdes ou dangereuses. Le proxy doit les rejeter a la validation du blob (`isValidObjectValue`).

### `not(wildcard)` -- interdit

`wildcard` matche tout. `not(wildcard)` ne matche rien. Un filtre qui ne peut jamais matcher est un bug de config, pas un use case. Rejeter a la creation du blob plutot que laisser un scope mort en prod.

### `not(not(x))` -- interdit

Double negation. Equivalent a `x` tout seul. C'est de l'obfuscation, pas de la configuration. Forcer l'ecriture directe.

### `and([])` -- interdit (tableau vide)

Un AND sur zero conditions est trivialement vrai (vacuous truth). Ca revient a un wildcard implicite, ce qui est trompeur. Si on veut un wildcard, on ecrit `{ type: "wildcard" }`.

### `and` avec un seul element -- interdit

`and([x])` est equivalent a `x`. Forcer l'ecriture directe. Un `and` doit avoir au moins 2 elements pour avoir un sens.

### `not(any(valeur))` dans un OR avec `any(valeur)` -- non interdit mais warning UI

`objectValue: [{ type: "any", value: "x" }, { type: "not", value: { type: "any", value: "x" } }]` matche tout (x OR not-x = tautologie). C'est techniquement valide mais probablement une erreur. L'UI devrait afficher un warning, pas le proxy rejeter (ca pourrait etre intentionnel dans un cas tordu).

---

## Resume des limites

| Limite | Valeur | Enforcement |
|---|---|---|
| Profondeur `and`/`not` | 4 niveaux | `isValidObjectValue` dans `blob.ts` |
| Body filters par scope | 8 max | `isValidBodyFilter` / `isValidScopeEntry` |
| Valeurs OR par filtre | 16 max | `isValidBodyFilter` |
| ScopeEntry par blob | 10 max | `decryptBlob` validation |
| Segments dot-path | 6 max | `isValidBodyFilter` |
| Taille blob | 4096 chars | `proxy.ts` + `ui.tsx` (inchange) |
| Headers par AuthSpec `headers` | 8 max | validation AuthSpec dans `blob.ts` |
| Nom de header | 64 chars max | validation AuthSpec dans `blob.ts` |
| Valeur de header | 1024 chars max | validation AuthSpec dans `blob.ts` |
| Addons par AuthSpec `scalingo-addon` | exactement 1 | validation AuthSpec dans `blob.ts` |
| Longueur `app` et `addonId` | 64 chars max | validation AuthSpec dans `blob.ts` |
| Longueur clé client fournie | 24 à 256 chars | `POST /api/generate` |
| `not(wildcard)` | interdit | `isValidObjectValue` |
| `not(not(...))` | interdit | `isValidObjectValue` |
| `and([])` | interdit | `isValidObjectValue` |
| `and` a 1 element | interdit | `isValidObjectValue` |

Toutes les limites sont validees au moment du dechiffrement du blob (`decryptBlob`). Un blob qui depasse une limite est rejete avec une erreur `malformed BlobConfig`. L'UI doit aussi valider ces limites a la creation pour donner un feedback clair a l'utilisateur.

---

## 8. Wildcard `*` : minimum 1 caractère

Le wildcard `*` dans un pattern de scope doit matcher au moins un caractère. `GET:/v1/apps/*` matche `/v1/apps/my-app` mais pas `/v1/apps/`. Cela évite les faux positifs sur des paths vides ou des trailing slashes.

---

## 9. Limites du champ `auth` structuré (v4)

Le blob v4 introduit un champ `auth` qui peut être un objet (`AuthSpec`) au lieu d'une simple string. Les mêmes principes que pour les body filters s'appliquent : bornes validées au déchiffrement, blob rejeté au-delà, validation miroir dans l'UI avant génération.

### 9.1 Headers d'authentification multiples

**Valeur : 8 headers max par AuthSpec `headers`**

Aucune API réelle n'exige plus de 8 headers pour s'authentifier. Au-delà de 2 ou 3, on n'est déjà plus dans de l'authentification mais dans du forward de headers déguisé, ce qui n'est pas le rôle de ce champ : l'appelant peut envoyer ses propres headers, ils sont forwardés tels quels.

**Valeur : 64 caractères max pour le nom du header**

Un nom de header HTTP réaliste fait moins de 30 caractères. 64 laisse de la marge sans autoriser un nom absurde. Caractères autorisés : le jeu `token` défini par la RFC 7230, celui qu'HTTP accepte réellement dans un nom de champ. Ne pas inventer une liste maison plus restrictive : elle finirait par refuser un header parfaitement légal utilisé par une API cible. Un nom invalide doit être rejeté, pas assaini : un header mal formé provoquerait une erreur au forward, ou pire, un comportement dépendant du runtime.

**Valeur : 1024 caractères max pour la valeur du header**

Couvre confortablement une clé d'API, un identifiant de client, un HMAC ou un JWT compact. Au-delà, ce n'est plus un secret d'authentification mais un payload, qui n'a rien à faire dans un blob.

**Pourquoi limiter** : les valeurs sont des secrets à haute entropie, donc quasi incompressibles par gzip. Contrairement aux scopes (très répétitifs, compressés à 85-90 %), chaque octet de secret coûte environ 1,37 octet dans le blob base64url final.

**Contrainte réelle : la taille du blob prime.** Une configuration au maximum théorique (8 headers x 1088 caractères) fait environ 8,7 KB bruts, soit plus de 11 KB en base64url : très au-dessus des 4096 caractères autorisés. En pratique, le budget cumulé des valeurs de headers est de l'ordre de **2 KB**, scopes compris. La limite par valeur est un garde-fou, pas un budget utilisable en totalité.

**Conséquence pour l'UI** : quand la génération échoue en `blob_too_large` avec un AuthSpec `headers`, le message doit pointer les valeurs de headers, pas seulement les scopes. Un utilisateur qui colle un gros secret et lit « réduisez vos scopes » cherchera au mauvais endroit.

### 9.2 Base de données Scalingo (couple app / addon)

**Valeur : exactement 1 addon par AuthSpec `scalingo-addon`**

Un blob donne accès à une base de données, pas à un parc. Pour en ouvrir une seconde, on génère un second blob, qui a son TTL, ses scopes et sa clé, donc sa propre révocation.

La limite n'est pas seulement produit, elle est aussi prudentielle. Le multi-addon supposait de résoudre la base visée en extrayant un identifiant du path de la requête, alors que la documentation Scalingo se contredit sur la forme de cet identifiant (le champ `id` selon le texte, une valeur ressemblant à `resource_id` dans les exemples). Des tests écrits sur cette hypothèse auraient validé notre supposition, pas la réalité. Le sujet est fermé tant qu'une recette sur un vrai compte Scalingo n'a pas tranché. Détail complet dans les specs, §11.1.2.

**Valeur : 64 caractères max pour `app` et `addonId`**

Aligné sur les identifiants Scalingo réels (nom d'app limité côté plateforme, identifiant d'addon de type `ad-<uuid>`).

**Impact sans limite** : un blob multi-addon devient un passe-partout de compte, exactement ce que le wildcard `app: "*"` a été refusé pour éviter.

### 9.3 Doublons

- Deux headers de même nom (comparaison insensible à la casse) : interdit. Le dernier écraserait le premier au forward, donc l'un des deux secrets serait mort dans le blob sans que personne ne le voie.
- Un AuthSpec `scalingo-addon` qui porterait plusieurs addons : rejeté. La forme multi n'existe pas en v4, un blob vise une base et une seule.

---

## 10. Clé client fournie par l'utilisateur

**Valeur : 24 caractères minimum, 256 maximum**

Le minimum protège contre le brute-force hors ligne : le salt serveur est public (`GET /api/salt`), donc la clé client est la seule inconnue protégeant un blob intercepté. PBKDF2 à 100 000 itérations renchérit chaque essai mais ne compense pas une clé courte.

Le maximum est une borne défensive : la clé transite dans le header `X-FGP-Key`, et rien ne justifie une clé de plusieurs kilo-octets.

**Caractères autorisés** : ASCII imprimables `0x21` à `0x7E`, soit tout sauf l'espace et les caractères de contrôle. Contrainte imposée par le transport en header HTTP, pas par la crypto.

**Pourquoi limiter** : une clé mutualisée entre plusieurs blobs mutualise le risque. Si elle fuite ou est cassée, tous les blobs générés avec elle deviennent déchiffrables d'un coup, y compris ceux créés avant la fuite. C'est le prix de la commodité en CI, et il doit être affiché explicitement dans l'UI.

**Impact sans limite** : une clé de 6 caractères rendrait le chiffrement du blob décoratif. Un attaquant qui capte une URL FGP la casse hors ligne, récupère le token upstream en clair, et le proxy n'a servi à rien.
