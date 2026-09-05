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
| Valeur testée par une regex | 128 chars max | matching, ADR-0010 |
| Valeurs `regex` par blob | 4 max | validation blob, ADR-0010 |
| Éléments d'un `and` | 8 max | validation blob, ADR-0010 |
| `ObjectValue` par blob, toutes portées | 256 max | validation blob, ADR-0010 |
| Source d'une regex | 200 chars max | validation blob |
| Quantificateurs par regex | 3 max | validation blob, ADR-0010 |
| Sortie de décompression | 128 Ko | blob et partage, ADR-0010 |
| Champ `encoded` de `/api/share/decode` | 8192 chars | schéma Zod |
| Corps bufferisé sur le proxy | 512 Ko | uniquement si body filter ou capture detailed |
| Corps sur `/api/*` | 64 Ko par défaut | 8 Ko decode, 16 Ko share/decode, 4 Ko helpers Scalingo |
| `queryFilters` par ScopeEntry | 8 max | validation blob, v5 |
| Valeurs OR par query filter | 16 max | validation blob, v5 |
| `queryFilter` par `param` (au sein d'un ScopeEntry) | 1 max | validation blob (génération et déchiffrement), v5 |
| Occurrences d'un paramètre de query évaluées par requête | 4 max si `regex` présent (toute profondeur), 64 max sinon | matching, v5 (charge de la requête, pas du blob) |
| Type `any` sur un query filter | `string` uniquement, y compris sous `and`/`not` à toute profondeur | validation blob, v5 |
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

---

## 11. Limites de ressources (ADR-0010)

Les limites des sections précédentes ont été posées une par une, pour des raisons fonctionnelles. Celles-ci répondent à un critère unique et mesuré.

**Le critère : aucune primitive optionnelle ne doit coûter plus cher que la dérivation de clé obligatoire déjà présente sur le chemin.**

La dérivation PBKDF2 est incompressible, elle est nécessaire pour déchiffrer et elle coûte 11,6 ms. Elle fixe donc le plancher de coût d'une requête proxy. Tout ce qui vient en plus (matching, décompression, parsing) doit rester sous cet ordre de grandeur, sinon la fonctionnalité optionnelle devient le coût dominant de l'instance. Ce critère remplace les nombres ronds : chaque plafond ci-dessous est calibré pour que son pire cas mesuré tienne dans ce budget.

### 11.1 Regex : trois couches, pas une

**Valeur testée : 128 caractères max** (auparavant 1 000). C'est la couche porteuse, parce qu'elle ne dépend d'aucune analyse du motif et ne peut donc pas se tromper. Le backtracking est exponentiel ou polynomial en la longueur de l'entrée : le motif `^a*a*a*b$` coûte 181,9 ms sur 1 000 caractères, 6,78 ms sur 256, et 2,54 ms sur 128. Une valeur plus longue doit être filtrée par `stringwildcard`, mesuré sur jusqu'à 8 000 caractères.

**Dialecte restreint**, validé à la génération avec un message actionnable, et au déchiffrement avec un refus du blob :

- source de 200 caractères maximum ;
- **aucun quantificateur appliqué à un groupe** : `(...)+`, `(?:...)*`, `(...){2,}` sont refusés. C'est la règle qui tue `^(a+)+$`, mesuré à 3 248 ms sur 29 caractères et 37 900 ms sur 31 ;
- ni backréférence `\1` à `\9`, ni lookaround ;
- `{n,m}` avec `m` inférieur ou égal à 100 ;
- 3 quantificateurs au maximum. Le pire cas construit à 3 quantificateurs tient dans le budget, celui à 4 non (82,6 ms), celui à 5 encore moins (2 209 ms).

**4 valeurs `regex` par blob**, toutes portées confondues. Quatre évaluations à 2,54 ms font 10,2 ms, soit exactement le budget.

Cette dernière couche est une heuristique, donc jamais seule : un motif qui passerait au travers de l'analyse retomberait sur les deux autres.

**Ce budget, comme celui de 256 `ObjectValue` par blob, est désormais réellement tenu par requête (corrigé le 2026-09-04).** Le chemin de matching contrôle le chemin de la requête sur deux formes, brute et canonique (ADR-0009 §3), et les body filters vivaient dans cette même fonction : un appelant qui forçait la seconde passe (un `//` ou un `/./` dans le chemin suffisait) faisait évaluer les body filters une seconde fois, doublant de fait le coût réel à 8 `regex` et 512 `ObjectValue` par requête au lieu des plafonds annoncés ici. La décision de match du corps est maintenant calculée une seule fois par scope et partagée entre les deux passes de chemin : les plafonds de cette section valent ce qu'ils annoncent sur une requête réelle, pas seulement sur le papier.

### 11.2 Ancrage des regex : une correction de faille, pas de performance

**L'évaluation est ancrée** : le moteur reçoit toujours `^(?:source)$`.

Auparavant, `{"type":"regex","value":"main"}` autorisait `not-main-at-all`, parce que `RegExp.test` fait du sous-chaîne. Un prédicat de permission qui matche en sous-chaîne est un contournement de scope qui attend son heure.

L'ancrage par enveloppement ne resserre jamais dans le mauvais sens : un ancien blob devient plus strict, jamais plus permissif.

### 11.3 `any` restreint aux valeurs scalaires

`any` n'accepte plus que `string`, `number`, `boolean` et `null`. Refusé à la génération et au déchiffrement.

Deux raisons, et la seconde est la vraie. Le coût : 1 280 comparaisons sur un sous-arbre de 770 Ko font 2 956 ms, contre 0,16 ms sur des scalaires. **La correction** : la comparaison était déjà cassée sur les objets. Elle repose sur `JSON.stringify`, qui dépend de l'ordre d'insertion des clés, et cet ordre vient du sérialiseur de l'appelant. `JSON.stringify({a:1,b:2}) === JSON.stringify({b:2,a:1})` vaut `false`. Un filtre `any` sur un objet autorisait ou refusait selon l'ordre dans lequel le client avait écrit son JSON. Ce n'est pas un prédicat de permission, c'est un tirage.

### 11.4 Décompression bornée

**128 Ko en sortie**, pour le blob comme pour le partage. Le ciphertext d'un blob vaut au plus 3 044 octets, donc 128 Ko autorisent un ratio de 42:1, largement au-dessus des 10 à 15:1 constatés sur du JSON de configuration répétitif, tout en coupant d'un facteur 24 le ratio gzip maximal mesuré à 1 029:1. Un blob dont la sortie dépasse 128 Ko ne peut pas être une configuration valide.

Effet sur `/api/share/decode` : 265 Ko d'entrée pour 320 Mo de RSS deviennent 8 Ko d'entrée pour 128 Ko de sortie. L'amplification passe de 1 200:1 à 16:1.

### 11.5 Taille des corps de requête

**`/api/*` : 64 Ko par défaut**, resserré par route (8 Ko sur `/api/decode`, 16 Ko sur `/api/share/decode`, 4 Ko sur les deux helpers Scalingo). Dépassement : 413 `payload_too_large`.

**Jamais sur `*`.** La route proxy transmet le corps en streaming ; un plafond global le mettrait en tampon, casserait les uploads volumineux légitimes à travers le proxy et introduirait précisément la consommation mémoire qu'on cherche à éviter. Montage sur liste explicite, comme pour les en-têtes de sécurité.

**Corps bufferisé sur le proxy : 512 Ko**, et **uniquement quand un body filter ou la capture detailed est actif**. `JSON.parse` de 337 Ko coûte 0,92 ms, donc 512 Ko coûtent environ 1,4 ms, un ordre de grandeur sous les 11,6 ms de la dérivation obligatoire.

**Non-régression à protéger** : sans body filter et sans capture detailed, le corps n'est jamais bufferisé, il est transmis en flux, et le plafond ne s'applique pas. Les gros uploads à travers le proxy continuent de passer. C'est une propriété du proxy transparent qu'il ne faut pas perdre en posant la limite au mauvais endroit.

### 11.6 Ce que ces limites ne font pas

Elles bornent le **coût d'une requête**, jamais le **nombre de requêtes**. La limitation de débit est hors de l'application, pour une raison écrite dans les specs §18.6 et dans les guides de déploiement.

---

## 12. Limites des query filters (v5)

`queryFilters` réutilise l'union `ObjectValue` des body filters (section 9 exceptée sur `any`, ci-dessous) et hérite donc de toutes les limites déjà posées sur cette union : profondeur `and`/`not` à 4 niveaux, combinaisons interdites, dialecte et ancrage des regex. Cette section documente uniquement ce qui est **propre** à `queryFilters` : ses deux plafonds structurels, l'unicité du paramètre nommé, sa restriction sur `any`, et son plafond d'occurrences à deux paliers, qui est d'une nature différente de tout ce qui précède dans ce document.

Cette section 12 a été révisée après un challenge du testeur QA (`docs/review/challenge-query-filters-v5.md`), qui a mesuré le coût réel des primitives de matching plutôt que de le supposer. Le plafond d'occurrences (12.5) et la restriction `any` (12.4) en sortent corrigés.

### 12.1 `queryFilters` par ScopeEntry

**Valeur : 8 max**, identique au plafond de body filters par scope (section 2), pour la même raison : un scope qui contraint 8 paramètres différents couvre largement les cas réels de pagination, tri, filtrage par statut. Au-delà, c'est un signal qu'il faut scinder en plusieurs scopes plutôt que tout empiler sur un seul.

### 12.2 Valeurs OR par query filter

**Valeur : 16 max**, identique au plafond de body filters (section 3), même union `ObjectValue`, même raison : au-delà de 16 alternatives listées une à une, `stringwildcard` couvre mieux l'intention.

### 12.3 Budgets globaux partagés avec les body filters (ADR-0010)

Les plafonds de dénombrement de l'ADR-0010 (section 11.1 et 11.3 de ce document) sont **globaux au blob**, comptés sur l'union des `bodyFilters` et des `queryFilters`, pas par axe séparément :

- **4 valeurs `regex` au total**, `bodyFilters` et `queryFilters` confondus.
- **256 `ObjectValue` au total**, toutes portées confondues.
- **8 éléments maximum par `and`**, où qu'il apparaisse.

Il n'existe pas de budget séparé pour les query filters : un `queryFilter` de type `regex` consomme exactement le même quota qu'un `bodyFilter` de type `regex`. Sans cette règle, `queryFilters` rouvrirait le vecteur que l'ADR-0010 a fermé pour les body filters, simplement déplacé sur un autre champ (interaction documentée explicitement dans l'ADR-0010).

### 12.4 Le type `any` est restreint aux chaînes, à toute profondeur

**Valeur : `string` uniquement, y compris sous `and` et `not`, à n'importe quelle profondeur d'imbrication.** `number`, `boolean` et `null`, acceptés par `any` dans les body filters (section 9), sont refusés sur un query filter, **au déchiffrement** (blob rejeté) et à la génération (message actionnable). Ce n'est pas seulement une restriction de formulaire : `{"type":"and","value":[{"type":"any","value":1},{"type":"wildcard"}]}` est refusé au même titre qu'un `any` non-string isolé, et un blob qui le porterait malgré tout est un blob malformé.

**Pourquoi.** Un paramètre de query est toujours une chaîne sur le fil. `{"type":"any","value":1}` appliqué à `?page=1` comparerait le nombre `1` (dans le blob) à la chaîne `"1"` (dans la requête), qui ne sont jamais égales : un piège silencieux, invisible à l'auteur au moment où il écrit le filtre, qui produit un scope mort exactement comme le `?` dans un pattern (ADR-0009 §4).

La restriction plutôt que la coercion suit le précédent déjà posé pour `any` sur objets et tableaux (section 11.3 de ce document, ADR-0010 D4) : dans les deux cas, une comparaison implicite dépendrait de quelque chose que l'auteur du blob ne contrôle pas au moment où il écrit la valeur. Avec le parseur standard (`URLSearchParams`), `?flag` et `?flag=` produisent la **même** chaîne vide, un seul état, pas deux ; `?flag=null` en est un second, distinct, la chaîne littérale `"null"`. Un JSON `null` unique ne représente proprement ni l'un ni l'autre sans un arbitrage invisible à l'auteur. Restreindre à `string` supprime la question : ce que l'auteur écrit est exactement ce qui sera comparé.

**Le cas `not` : un `any` non-string ne produit pas un filtre mort, il produit un filtre qui autorise tout (correction apportée après le challenge testeur).** Un `any` non-string isolé, ou dans un `and`, ne matche jamais (`JSON.stringify` d'un nombre et d'une chaîne ne sont jamais égaux) : c'est un scope trop strict, gênant mais sûr. Sous `not`, ce résultat toujours faux s'inverse en toujours vrai. `not({type:"any", value:1})` accepte donc **toute** valeur envoyée par l'appelant, quelle qu'elle soit. Un auteur qui écrit « exclure la page 1 » de cette façon obtient un filtre qui n'exclut rien. C'est un fail-open, pas un désagrément d'ergonomie, sur l'axe même dont la raison d'être est de bloquer `?force=true`. C'est ce cas précis qui rend le rejet au déchiffrement non négociable, pas seulement souhaitable.

**Conséquence UI** : le sous-type Texte / Nombre / Booléen / Null du type « Valeur exacte » n'existe pas pour les query filters, y compris dans les conditions imbriquées d'un `and` ou d'un `not`, à quelque profondeur que ce soit. Un champ texte simple, sans sélecteur.

### 12.4bis Un `param` ne peut être couvert que par un seul query filter

**Valeur : un seul `queryFilter` par `param`, au sein d'un même `ScopeEntry`.** Rejeté à la génération et **au déchiffrement**, symétrique à l'unicité déjà exigée des noms de headers d'auth (section 9.3).

**Pourquoi.** Deux filtres sur le même paramètre créent une ambiguïté de sémantique qu'aucune règle n'a jamais tranchée (le premier gagne-t-il, sont-ils en AND, en OR entre eux ?). Il n'y a rien à définir, seulement à refuser. Et le salt étant public, une règle qui n'existerait qu'à la génération ne protégerait personne contre un blob forgé à la main.

### 12.5 Occurrences d'un paramètre répété : un plafond à deux paliers

**Valeur : 4 occurrences si `values` contient une valeur `regex` à n'importe quelle profondeur, 64 sinon.** Palier déterminé par lecture du discriminant `type` sur l'union `ObjectValue`, à toute profondeur dans les `and` et les `not` (le même parcours que celui déjà fait pour le budget global de 4 `regex` par blob, ADR-0010 D2). C'est une **fonction pure du filtre**, elle ne dépend d'aucune donnée de la requête. Elle est évaluée à la demande plutôt que mise en cache dans le blob : la fonction d'autorisation est bundlée côté navigateur autant que côté serveur et doit rester sans état, et le parcours d'un filtre plafonné à 16 valeurs et 4 niveaux de profondeur est négligeable devant le matching qu'il gouverne.

**Nature différente de toutes les autres limites de ce document.** Chaque limite précédente borne ce que **l'auteur du blob** peut écrire, et se vérifie donc à la génération (message actionnable) et au déchiffrement (rejet du blob). Ce plafond borne ce qu'**un appelant** peut envoyer dans sa requête : un paramètre de query, contrairement à une clé JSON dans un body, peut apparaître plusieurs fois (`?tag=a&tag=b&tag=c`), et chaque occurrence est évaluée indépendamment contre les valeurs du filtre (AND entre occurrences, ADR-0009 §4). Ce facteur multiplicatif n'existe dans aucune donnée du blob : aucun plafond structurel de la section 12.3 ne le couvre, puisqu'il se manifeste uniquement au moment du forward, sur le chemin chaud. Il n'y a donc **pas de message de génération possible** pour cette limite, quel que soit le palier : elle ne peut se vérifier qu'à chaque requête.

**Un plafond uniforme de 4 a été retenu d'abord, puis mesuré et corrigé.** Un plafond unique calibré sur le pire cas (`regex`) interdisait, pour un coût qui n'existe pas dans le cas général, un usage banal des API à dominante GET : un paramètre répété avec des valeurs `any` ou `stringwildcard` (`expand[]` chez Stripe, `fields` chez Elasticsearch, `include` en JSON:API, `labels` chez GitHub). Le testeur QA a mesuré, sur le code réel du projet (`compileAnchored`, `matchObjectValue`), le coût de chaque scénario :

| Scénario | Évaluations | Coût mesuré |
|---|---|---|
| 4 occurrences × 4 `regex` (pire cas) | 16 | ≈ 40 ms au coût de référence ADR-0010 |
| 64 occurrences × 16 valeurs `any` | 1 024 | ≈ 0,2 ms |
| 64 occurrences × 16 valeurs `stringwildcard` | 1 024 | ≈ 0,2 ms |

Trois ordres de grandeur séparent les deux familles. Un plafond calibré sur `regex` et appliqué uniformément aux types les moins chers punissait un usage sans rapport avec le risque qu'il cherchait à couvrir.

**Pourquoi 4 pour `regex`.** Inchangé : symétrie avec le plafond de 4 valeurs `regex` par blob (ADR-0010 D2), même primitive coûteuse. Le pire cas construit délibérément (16 valeurs OR d'un même filtre, dont les 4 `regex` du budget global entier concentrées sur ce seul filtre, appliqué à un paramètre répété 4 fois) donne un ordre de grandeur de 4 × 4 × 2,54 ms ≈ 40 ms, confirmé par la mesure indépendante ci-dessus.

**Pourquoi 64 pour les autres types.** Choisi pour couvrir confortablement les cas réels de paramètres répétés cités plus haut, à un coût mesuré (≈ 0,2 ms pour 1 024 évaluations) qui reste très en dessous de la dérivation PBKDF2 obligatoire (11,6 ms).

**Le parallèle avec la couche 1 de l'ADR-0010 D2, invoqué dans une version antérieure de cette section pour justifier l'uniformité, ne tenait pas et a été retiré.** Cette couche refuse d'**analyser la source d'une regex**, parce qu'un tel analyseur peut lui-même se tromper (point faible assumé de l'ADR-0010). Lire si un `queryFilter` contient un `ObjectValue` de type `regex` n'est pas une analyse de motif : c'est un discriminant sur une union fermée, qui ne peut pas se tromper. Les deux mécanismes n'étaient pas comparables.

**Ces deux chiffres restent des estimations à confirmer par un test de performance dédié avant d'être considérés définitifs**, avec le même sérieux que l'ADR-0010 a appliqué à chacun de ses propres plafonds. Le 4 était déjà sous cette réserve, le 64 y est soumis pareillement.

**Comportement au dépassement : fail-closed, sur les deux paliers.** Au-delà du plafond applicable, ce filtre échoue et le `ScopeEntry` qui le porte ne matche pas la requête, quelles que soient les valeurs envoyées. Ce n'est jamais un troncage silencieux (évaluer les premières occurrences et ignorer le reste) : un tel comportement laisserait passer une occurrence non couverte au-delà du plafond, ce qui serait un contournement de scope, pas une limite de charge. Le comptage des occurrences précède toujours l'évaluation des valeurs (`docs/specs.md` §19.2), pour que le message de diagnostic ne dépende jamais de l'ordre dans lequel l'appelant a rangé ses paramètres.

**La porte de sortie : `stringwildcard` plutôt que `regex`.** Un auteur qui a besoin de plus de 4 occurrences sur un paramètre filtré par une regex peut, dans la plupart des cas réalistes (préfixe, suffixe, motif simple), passer ce filtre en `stringwildcard` et rejoindre le palier à 64. Cette information doit être dite dans l'UI au moment où l'auteur choisit le type de son filtre (`docs/specs.md` §12.14), pas découverte après coup sur une requête refusée en production.

### 12.6 Ce que ces limites ne font pas

Comme celles de la section 11, elles bornent le **coût d'une requête**. Le plafond d'occurrences (12.5) va plus loin que les autres limites de ce document : il borne aussi une forme de **répétition côté appelant** qu'aucune limite précédente n'avait à couvrir, puisque les body filters n'ont pas d'équivalent (une clé JSON ne se répète pas dans un même objet).
