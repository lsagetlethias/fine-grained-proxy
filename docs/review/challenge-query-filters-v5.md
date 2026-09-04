# Challenge des specs : `queryFilters` et blob v5

- **Date** : 2026-09-04
- **Branche** : `feat/query-filters`, commit `746fdac`
- **Auteur** : testeur QA
- **Périmètre lu** : `docs/specs.md` §3.1, §3.3, §5, §6.1, §6.2, §6.3, §8.3, §12.5, §12.10, §12.14, §13, §18.4, §19 ; `docs/limits.md` §12 ; `docs/adr/0009-politique-de-sortie-du-proxy.md` §4 ; `docs/adr/0008-auth-structuree-blob-v4.md` ; `docs/adr/0010-politique-limites-ressources.md`
- **Code lu** : `src/crypto/blob.ts`, `src/middleware/scopes.ts`, `src/middleware/scope-limits.ts`, `src/middleware/proxy.ts`, `src/crypto/share.ts`, `src/routes/ui.tsx`, `src/ui/client/test-scope.ts`, `src/logs/capture.ts`
- **AC produits** : `docs/acceptance-criteria.md`, séries AC-51 à AC-56

---

## Verdict d'ensemble

La spec est solide sur ce qu'elle décide. Le déni par défaut, l'opt-in, la restriction de `any`, la matrice `required` et le partage des budgets ADR-0010 sont bien arbitrés et bien argumentés. Ce qui ne va pas est ailleurs : la spec décrit correctement un moteur de matching, et beaucoup moins correctement son insertion dans un produit qui existe déjà. Cinq points bloquent, dont deux sont des fail-open silencieux et un rend la feature inutilisable sur la famille d'API qu'elle cite elle-même comme cas d'usage principal.

Compte : **5 bloquants**, **8 à trancher par l'architecte**, **7 acceptés**.

---

## Bloquants

### B1. §6.3 rend un blob v5 à auth structurée indéchiffrable, et contredit §6.1 dans le même document

`docs/specs.md` §6.3, règle de validation au déchiffrement, inchangée depuis la v4 :

> Si `auth` est un objet, alors `v` doit valoir `4`. Si `v <= 3`, `auth` doit être une string.

`src/crypto/blob.ts:279` applique littéralement cette règle :

```typescript
if (config.v !== 4 || !isValidAuthSpec(auth)) {
  throw new Error("Invalid blob: malformed BlobConfig");
}
```

Or §6.1 promet l'inverse, deux pages plus haut :

> Un blob v5 est toujours lisible par un proxy v5 quels que soient ses autres axes (auth string ou structurée, scopes avec ou sans bodyFilters).

Un blob qui combine `AuthSpec` de type `headers` (deux headers d'auth, US-8) et des `queryFilters` calcule `v = 5` par la règle des trois axes, puis échoue sur `config.v !== 4`. Ce n'est pas un cas tordu : c'est l'intersection de deux features livrées, et le premier utilisateur qui a une API à double header et veut contraindre sa query tombe dessus. Le symptôme est un `401 invalid_credentials`, c'est-à-dire le message qui envoie son porteur vérifier sa clé alors que la clé est bonne.

La même faute existe en miroir pour l'axe scopes : la condition correcte est `v >= 4` pour `auth` objet, et il faudra la réécrire une troisième fois à la v6 si elle reste exprimée en égalité. La règle générale à écrire dans §6.3 est : chaque axe impose un **plancher** de version, jamais une égalité, et `v` est le maximum des planchers.

**À corriger dans la spec avant que le dev ne touche au code**, sinon il implémentera la règle telle qu'elle est écrite.

Couvert par AC-54.3 et AC-54.8.

### B2. `/api/share/encode` supprime les `queryFilters` en silence, et `/api/generate` fera pareil

`ScopeEntrySchema` dans `src/routes/ui.tsx:129` est un `z.object` sans `.strict()`. Zod 4 **strippe** les clés inconnues au lieu de les refuser. Mesuré :

```
parsed: {"methods":["GET"],"pattern":"/v1/items"}
queryFilters survecu ? false
```

Ce schéma est utilisé par `/api/generate` **et** par `/api/share/encode` (`ShareEncodeBodySchema`, ligne 337). Conséquences si le dev oublie d'étendre le schéma, ou l'étend pour `generate` et pas pour `share` :

- **Partage** : un auteur configure ses `queryFilters`, partage sa config par `?c=`, le destinataire reçoit un lien où la contrainte a disparu. Il génère un blob qui laisse passer `?force=true`. Aucune erreur, aucun avertissement, la config affichée à l'écran ne mentionne rien. C'est exactement le fail-open que le bump de version est censé rendre impossible, sauf qu'il passe par la porte de la documentation au lieu de celle du proxy, et que le bump ne le voit pas : le blob généré est un v3 parfaitement valide.
- **Génération** : même effet, en pire, puisque l'auteur lui-même croit avoir généré un blob contraint.

La forme du blob rend ce scénario indétectable après coup : `POST /api/decode` renverra des scopes sans `queryFilters`, ce qui ressemble en tout point à un blob qui n'en a jamais eu.

**Demande** : le schéma Zod des scopes passe en `.strict()` sur cette route, ou à défaut la spec exige explicitement une validation de non-perte. Une clé inconnue dans un `ScopeEntry` envoyé à `/api/generate` doit produire une erreur, pas un silence. Le coût d'un `.strict()` est nul, celui d'un strip silencieux est un blob qui ment sur son propre périmètre.

Piège jumeau à la génération, dans `src/middleware/scope-limits.ts:93` :

```typescript
for (const entry of structured) {
  if (!entry.bodyFilters) continue;
```

Un `ScopeEntry` qui porte des `queryFilters` mais pas de `bodyFilters` sort de la boucle avant toute validation. Les quatre messages de §12.14 ne se déclencheraient jamais pour le cas le plus courant, un scope GET avec query filters et sans body filter.

Couvert par AC-53.14, AC-53.15, AC-53.16.

### B3. §12.5 ne couvre pas le refus par surnombre d'occurrences : quatre causes de refus, trois messages

§3.3 énumère quatre façons pour l'axe query de faire échouer un scope :

> paramètre non déclaré, requis absent, valeur non couverte, **ou occurrences en surnombre**

§12.5 spécifie trois messages de détail, et affirme qu'ils sont exhaustifs :

> Trois cas, jamais cumulés puisque l'évaluation s'arrête au premier problème rencontré

Le quatrième cas, le plafond de 4 occurrences du §19.4, n'a **aucun message**. Et c'est précisément celui dont l'utilisateur ne peut pas deviner la cause : les trois autres refus se lisent dans sa propre configuration, le surnombre ne se lit nulle part, ni dans le blob, ni dans le formulaire, ni dans aucun message de génération (§12.14 le dit explicitement).

Le risque n'est pas seulement l'absence de message, c'est le **mauvais** message. La troisième ligne du tableau §12.5 dit :

> Un `queryFilter` est présent mais aucune de ses valeurs ne couvre la valeur envoyée (ou une occurrence, en cas de répétition) → « Valeur de "{param}" non autorisée par ce filtre. »

Un dev qui implémente sans y penser fera tomber le surnombre dans cette branche, parce qu'elle parle déjà de répétition. L'utilisateur lira « Valeur de "ids" non autorisée » et passera son après-midi à vérifier ses valeurs, qui sont toutes bonnes. Le testeur de scopes existe pour éviter exactement ça.

**Demande** : un quatrième message dédié, du type « Plus de 4 occurrences de "{param}" : au delà de cette limite, la requête est refusée quelles que soient les valeurs. » Et l'ordre d'évaluation doit être fixé par la spec, pas laissé au dev : le comptage d'occurrences se fait **avant** l'évaluation des valeurs, sans quoi le message dépend de l'ordre des occurrences.

Couvert par AC-56.6 et AC-56.7.

### B4. La restriction de `any` aux chaînes n'est normative nulle part pour les sous-conditions, et sous `not` elle protège d'un trou plus grave que celui décrit

Trois textes parlent de la restriction, aucun ne la rend normative en profondeur :

- §19.3 la décide, sans un mot sur `and` et `not`.
- §12.14 dit que le sélecteur de sous-type n'existe pas « y compris dans les sous-conditions d'un `ET` ou d'un `Exclure` imbriqué », ce qui est une contrainte d'**interface**.
- `docs/limits.md` §12.4 reprend la même phrase, également sous le titre « Conséquence UI ».

La règle de validation du blob, elle, ne dit rien. Le dev qui implémente réutilisera `isValidObjectValue` (`src/crypto/blob.ts:122`), qui descend dans `and` et `not` en passant `budget` et `depth`, et **pas** un drapeau de contexte. La porte dérobée est donc ouverte par construction :

```json
{ "type": "and", "value": [ { "type": "any", "value": 1 }, { "type": "wildcard" } ] }
```

Cette valeur est valide aujourd'hui pour un body filter et le restera pour un query filter si la restriction n'est pas propagée. Elle est toujours fausse, donc c'est un filtre mort, exactement le piège que §19.3 veut supprimer.

**Le cas `not` est pire et la spec ne le voit pas.** §19.3 justifie la restriction par un seul symptôme :

> le filtre ne matche jamais, et rien ne le signale à l'auteur

C'est vrai pour `any` seul et pour `and`. Sous `not`, c'est l'inverse. `matchObjectValue` (`src/middleware/scopes.ts:104`) compare par `JSON.stringify` :

```typescript
case "any":
  return JSON.stringify(ov.value) === JSON.stringify(bodyValue);
```

`JSON.stringify(1)` vaut `"1"`, `JSON.stringify("1")` vaut `"\"1\""`. Jamais égaux. Donc `not({type:"any", value:1})` retourne **toujours vrai**. L'auteur écrit « exclure la page 1 », il obtient « accepter tout ». Ce n'est plus un scope mort qui refuse trop, c'est un filtre décoratif qui autorise tout, sur un axe dont la raison d'être est de bloquer `?force=true`.

L'argument de §19.3 est donc plus fort que ce qu'il dit, et il faut le dire, sinon la restriction sera implémentée comme un confort d'ergonomie et sautera au premier refactor.

**Demande** : rendre la règle normative dans §19.3 et dans `docs/limits.md` §12.4, en ces termes : un `ObjectValue` de type `any` porté par un `queryFilter`, **à n'importe quelle profondeur d'imbrication dans un `and` ou un `not`**, n'accepte qu'une valeur `string`. Rejet au déchiffrement, message à la génération. Et ajouter le cas `not` à la justification.

Couvert par AC-53.4, AC-53.5, AC-53.6.

### B5. Le plafond de 4 occurrences n'a aucune porte de sortie et rend la feature inutilisable sur les API à paramètres répétés

C'est le point sur lequel le lead avait raison, et les mesures le confirment plus durement que prévu.

#### Le cas concret

Un auteur veut un token de lecture sur `/v1/items` qui interdise `?force=true`. Il déclare, comme la doc le lui demande :

```json
{ "methods": ["GET"], "pattern": "/v1/items",
  "queryFilters": [ { "param": "ids", "values": [ { "type": "regex", "value": "^\\d+$" } ] } ] }
```

Son CI appelle `GET /v1/items?ids=1&ids=2&ids=3&ids=4&ids=5`. Cinq identifiants, forme parfaitement banale : Stripe (`expand[]`), Elasticsearch (`fields`), JSON:API (`include`), GitHub (`labels`), toutes les API de listes filtrées.

Résultat : **403 `scope_denied`**, générique par décision de §12.5, sur cinq valeurs qui matchent toutes le filtre. Les portes de sortie disponibles :

1. **Retirer les `queryFilters`.** Il perd la protection contre `?force=true`, qui est la seule raison pour laquelle il a activé la feature.
2. **Ajouter un second scope sans `queryFilters` sur le même chemin.** Les scopes sont additifs (`checkAccess` retourne `true` au premier match, `src/middleware/scopes.ts:143`). Ce second scope autorise tout, y compris `?force=true`. Strictement équivalent à l'option 1, en moins visible.
3. **Découper en plusieurs `ScopeEntry`.** Sans effet : le plafond porte sur la requête, pas sur le blob.
4. **Modifier son client pour envoyer au plus 4 identifiants par appel.** Il doit paginer par tranches de 4 sur une API dont il ne contrôle ni le contrat ni le SDK, et multiplier ses appels.

Aucune ne préserve à la fois l'usage légitime et la contrainte. Le déni par défaut ferme même la sortie évidente, qui serait de ne pas déclarer `ids` du tout : un paramètre non déclaré fait échouer le scope. **L'auteur est enfermé.** Ce plafond n'est pas une limite de charge, c'est une limite de fonctionnalité qui exclut une famille entière d'API, et cette famille est précisément celle que §19.1 désigne comme le cas d'usage principal :

> Sur une API à dominante GET, la query **est** le corps de la requête

Sur ces API, un paramètre répété est l'équivalent d'un tableau JSON dans un body. FGP accepte d'inspecter **512 Ko** de body (`MAX_BUFFERED_BODY`, ADR-0010 D7) et refuse cinq valeurs de query. La proportion ne se défend pas.

#### Ce que les mesures disent du chiffre 4

J'ai mesuré le coût réel des primitives de matching, avec le code du projet (`compileAnchored`, `matchPath`, `matchObjectValue`), motif `^a*a*a*b$` du benchmark ADR-0010, entrée de 128 caractères. Machine environ 2,3 fois plus rapide que celle de l'ADR-0010 (1,1 ms mesuré ici contre 2,54 ms de référence), donc je donne les deux colonnes.

| Scénario | Évaluations | Mesuré ici | Ramené au coût de référence ADR-0010 |
|---|---|---|---|
| 4 occurrences x 4 regex (pire cas de la spec) | 16 | 16,2 ms | 40,6 ms |
| 8 occurrences x 4 regex | 32 | 33,0 ms | 82,6 ms |
| 16 occurrences x 4 regex | 64 | 64,7 ms | 162 ms |
| 64 occurrences x 4 regex | 256 | 261 ms | 654 ms |
| 4 occurrences x 4 regex, **double passe brute + canonique** | 32 | 31,9 ms | 79,9 ms |
| **64 occurrences x 16 valeurs `any`** | 1024 | **0,22 ms** | 0,22 ms |
| **64 occurrences x 16 valeurs `stringwildcard`** | 1024 | **0,19 ms** | 0,19 ms |
| Parsing d'une query de 5 000 occurrences (48 Ko) | - | 1,91 ms | 1,91 ms |

L'estimation de 40 ms de la spec est **confirmée**, le raisonnement d'ordre de grandeur est bon. Mais les deux lignes en gras disent l'essentiel : **le coût est entièrement porté par `regex`, et par rien d'autre.** Mille évaluations d'un `any` ou d'un `stringwildcard` coûtent 0,2 ms, soit un cinquantième d'une seule évaluation regex, et un cinquantième du coût de la dérivation PBKDF2 (11,6 ms) que **toute** requête paie de toute façon.

Le plafond de 4 est donc calibré sur le coût du seul type qui dispose **déjà** d'un budget global de 4 par blob (ADR-0010 D2), et il est appliqué uniformément à des types dont le coût est inférieur de trois ordres de grandeur. §19.4 revendique cette uniformité :

> il ne dépend d'aucune analyse du contenu du filtre, à l'image de la couche 1 de l'ADR-0010 D2

**Ce parallèle est faux.** La couche 1 de D2 refuse d'analyser la **source d'une regex**, parce qu'un analyseur statique de regex est un parseur écrit à la main qui peut se tromper (l'ADR-0010 le dit lui-même en toutes lettres : « c'est le point faible assume de la politique »). Savoir si un `queryFilter` contient au moins une valeur de type `regex` n'est pas de la même nature : c'est une lecture de discriminant sur une union fermée, décidée **une fois au déchiffrement**, sur une donnée du blob et jamais sur une donnée de l'appelant. Le compteur `budget.regexes` de `isValidObjectValue` fait déjà exactement ce parcours. Il n'y a aucun parseur, aucune heuristique, rien qui puisse se tromper.

#### Ce que je demande

Le plafond doit rester, le vecteur est réel. Le chiffre et sa forme doivent changer. Deux formes tiennent, l'architecte tranche :

- **Forme A, plafond à deux paliers.** 4 occurrences pour un `queryFilter` dont les `values` contiennent au moins un `regex` à n'importe quelle profondeur, 64 pour tous les autres. Le palier est déterminé au déchiffrement, une fois, et stocké. Les deux paliers restent fail-closed. Coût du pire cas inchangé pour le palier regex, 0,2 ms pour l'autre.
- **Forme B, budget d'évaluations regex par requête.** Un compteur unique de 16 évaluations `regex` par requête, tous scopes et tous paramètres confondus, et **aucun** plafond d'occurrences pour les autres types. Exprime directement ce qui coûte, borne le pire cas à 40 ms au coût de référence, et se généralise au jour où les body filters gagneront un axe répété.

Ma préférence va à la forme A : elle reste locale au filtre, elle est triviale à tester, et elle ne demande pas de faire circuler un compteur mutable dans la fonction d'autorisation, qui est aussi bundlée côté navigateur.

Dans les deux cas, le plafond haut doit être choisi **après** exécution du test de performance, ce que §19.4 exige déjà pour le 4 actuel.

Couvert par AC-52.

---

## À trancher par l'architecte

### T1. Le déni par défaut n'a aucun garde-fou de diagnostic en production, et les logs ne capturent pas la query

Le lead demandait si la copy suffit à prévenir. Elle ne suffit pas, et le problème n'est pas la copy : c'est que la boucle de diagnostic est cassée de bout en bout.

Les paramètres que la vraie vie ajoute sans prévenir sont réels et cités à juste titre : `per_page` et `page` ajoutés par un SDK de pagination, `_=1712534400` de cache-busting jQuery, `api-version` ajouté par un client généré depuis un OpenAPI, `utm_*` collés quand l'URL transite par un outil. Aucun n'est visible dans le code de l'utilisateur, tous font échouer le scope.

Ce que voit l'auteur quand ça arrive :

1. En production, **403 `scope_denied` générique**. §12.5 refuse de nommer le paramètre fautif, et cette décision est **bonne** : un appelant anonyme n'a pas à apprendre la structure du blob. Rien à changer là.
2. Dans `/logs`, **rien**. `src/middleware/proxy.ts:444` capture `path: proxyPath`, et `proxyPath` est `url.pathname`, sans la query. La feature de logs, qui existe précisément pour observer ce qui passe par un blob, ne montre pas l'axe sur lequel la requête a été refusée.
3. Dans le testeur de scopes, un diagnostic exact, **à condition de connaître déjà la query exacte que son client envoie**. C'est justement l'information qui lui manque, puisque le paramètre fautif a été ajouté par une couche qu'il ne voit pas.

Il ne reste que tcpdump ou la lecture du code source de son SDK. Pour une feature dont le mode de défaillance nominal est « un tiers a ajouté un paramètre à mon insu », c'est insuffisant.

**Proposition** : la capture network enregistre la **liste des noms de paramètres** de la query, sans les valeurs. Les noms suffisent au diagnostic (`per_page` apparaît, tout s'explique) et ne fuitent aucun secret, alors que les valeurs de query en contiennent régulièrement (`?api_key=`, `?token=`). L'entrée network vit en clair dans le ring buffer, contrairement au body `detailed` qui est chiffré, donc y mettre les valeurs serait un vecteur de fuite à part entière. Si l'architecte veut les valeurs, leur place est dans l'entrée `detailed`, chiffrée.

Coût estimé : quelques lignes dans `capture.ts` et un champ de plus dans le schéma d'events (§14.6), qui casse la compat du flux SSE et demande donc l'avis du PO.

**À défaut**, il faut au minimum que §12.14 dise à l'auteur, au moment de la saisie, que les paramètres ajoutés par son client comptent aussi. L'alerte actuelle dit « tout paramètre de query non déclaré ici fait échouer la requête », ce qui est vrai mais se lit comme « les paramètres que j'écris », pas comme « ceux que mon SDK ajoute ».

### T2. Le testeur peut redevenir menteur, dans le sens permissif, par la combinaison de scopes

§12.5 spécifie que le champ `queryConstrained` vaut « contrainte » dès qu'**au moins un** scope testé porte des `queryFilters`, et `src/ui/client/test-scope.ts:139` agrège déjà de cette façon.

Cas de figure, très courant pendant une itération dans le formulaire : le blob contient un scope string historique `GET:/v1/items` **et** un nouveau `ScopeEntry` avec `queryFilters`. L'auteur teste `/v1/items?force=true`. Le testeur affiche :

- verdict global : **accès autorisé** (le scope string matche, les scopes sont en OR) ;
- note : **« La query est contrainte par au moins un scope »**.

L'auteur lit « autorisé » et « contrainte » côte à côte et conclut que sa query a été validée. Elle ne l'a pas été : elle est passée par un scope qui ne contraint rien, et `?force=true` part vers l'API. C'est le retour exact du mensonge que l'ADR-0009 §4 qualifie de « pire que pas d'outil », dans une forme nouvelle.

Ce piège existe déjà pour les body filters (un scope string sur le même chemin annule un `ScopeEntry` à `bodyFilters`), mais son exposition change d'échelle ici : les query filters s'appliquent à GET, et un scope string GET sur le même chemin est la chose la plus commune dans un blob.

**Proposition, deux niveaux** :

1. Minimum : le testeur nomme le scope qui a accordé l'accès, et affiche la note « contrainte » **uniquement** si ce scope-là porte des `queryFilters`. La note actuelle devient un troisième cas : « autorisé par un scope qui ne contraint pas la query ».
2. Recommandé en plus : un avertissement à la génération quand un scope string ou un `ScopeEntry` sans `queryFilters` couvre le même chemin qu'un `ScopeEntry` à `queryFilters`, avec la même méthode. Le scope contraint est alors décoratif, et c'est vérifiable statiquement.

Couvert par AC-56.9.

### T3. Le décodage de la query n'est spécifié qu'en creux, et quatre comportements silencieux en découlent

§19.8 dit « décodage percent standard, jamais re-parsé », ce qui laisse quatre questions ouvertes. Comportements mesurés avec `URLSearchParams`, qui est le parseur que le dev utilisera :

| Entrée | Ce que voit le filtre | Problème |
|---|---|---|
| `?a=x+y` | `a` = `"x y"` | Le `+` devient une espace. L'auteur qui écrit `x+y` dans le formulaire obtient un filtre mort. Aucun texte ne le dit. |
| `?flag` et `?flag=` | `flag` = `""` dans les deux cas | §19.3 et `limits.md` §12.4 affirment que `?flag`, `?flag=` et `?flag=null` sont « trois états distincts ». Ils sont **deux** avec le parseur standard. La décision reste bonne, sa justification est factuellement fausse et doit être corrigée. |
| `?A=1&a=2` | deux paramètres distincts | La sensibilité à la casse du nom n'est écrite nulle part. Un dev peut légitimement normaliser en minuscules, comme le projet le fait pour les noms de headers d'auth (§6.3). Il faut le dire. |
| `?a[]=1&a[]=2` | nom du paramètre = `a[]` | L'auteur doit écrire `a[]` dans le champ « Paramètre de query », crochets compris. Contre-intuitif et non documenté, alors que c'est la forme employée par Stripe et PHP. |

**Cas plus sérieux, le point-virgule.** `URLSearchParams` ne traite pas `;` comme un séparateur : `?a=1;force=true` donne **un** paramètre `a` valant `1;force=true`. Un filtre `{param: "a", values: [{type: "wildcard"}]}` l'accepte. Mais plusieurs piles amont (Jetty en configuration historique, PHP selon `arg_separator.input`) découpent sur `;` et voient **deux** paramètres, dont `force=true`. C'est un différentiel de parseur, de la même famille que celui que l'ADR-0009 §3 a pris au sérieux pour `%2f` sur le chemin.

Je ne demande pas de le corriger : on ne peut pas deviner le parseur de la cible, et normaliser côté FGP casserait des valeurs légitimes contenant un `;`. Je demande qu'il soit **écrit** comme non-goal explicite dans §19.8, au même titre que le rebinding DNS l'est en §13. Une limite connue et documentée est un choix ; la même limite non documentée est une découverte pour l'auditeur suivant.

Couvert par AC-55.

### T4. La double passe brute/canonique double le coût de l'axe query, et l'appelant décide quand

`checkRequestAccess` (`src/middleware/scopes.ts:233`) appelle `checkAccess` une fois sur le chemin brut, puis une seconde fois sur le chemin canonique quand les deux diffèrent :

```typescript
const rawAllowed = checkAccess(scopes, method, rawPath, body);
if (!rawAllowed) { ... }
if (canonical !== rawPath && !checkAccess(scopes, method, canonical, body)) { ... }
```

Si l'axe query est branché naïvement dans `checkAccess`, il est évalué **deux fois**, et c'est l'appelant qui décide : il suffit d'envoyer `//v1/items` ou `/v1/./items` pour forcer la seconde passe. Le pire cas de §19.4 passe de 40 ms à 80 ms au coût de référence, mesuré à 31,9 ms sur ma machine contre 16,2 ms en simple passe.

L'axe query est indépendant de la forme du chemin, donc la correction est gratuite : l'évaluer **une seule fois**, en amont des deux passes de chemin. Mais ça ne se fera que si c'est écrit, parce que le branchement naturel est à l'intérieur de `checkAccess`, là où vivent déjà les body filters.

À noter que les body filters ont exactement le même défaut aujourd'hui, sans que personne l'ait relevé : le budget de 256 `ObjectValue` de l'ADR-0010 est en réalité un budget de 512 évaluations pour un appelant qui force la seconde passe. Ce n'est pas ma feature, mais ça mérite un ticket à part.

Couvert par AC-52.6.

### T5. `queryFilters: []` et sous-déclaration de `v` : deux cas non spécifiés

§6.1 dit « au moins un ScopeEntry porte des `queryFilters` → v5 » sans dire ce qu'est « porter ». Deux cas à trancher :

- **Tableau vide.** L'UI produira `queryFilters: []` dès que l'auteur ouvre le panel puis supprime son dernier filtre, exactement comme la spec le prévoit pour l'alerte de §12.14 qui « disparaît si l'auteur supprime le dernier filtre ». Faut-il alors générer un v5 ? Ma recommandation : **non**. Un tableau vide est sémantiquement identique à l'absence (aucun déni par défaut, cf. §19.2 « dès que `queryFilters` est non vide »), il doit être omis à la sérialisation et traité comme absent au déchiffrement. Le générer en v5 rendrait le blob illisible par un proxy antérieur pour zéro contrainte apportée, ce qui est le contraire de la règle « on refuse ce qui peut nuire, on ne casse pas ce qui est seulement inutile » de l'ADR-0009 §4.
- **`v` sous-déclaré.** Un blob `v: 3` portant des `queryFilters` non vides. `isValidScopeEntry` ignore aujourd'hui toute clé inconnue, donc ce blob est actuellement **accepté et ses `queryFilters` ignorés**, ce qui est un fail-open silencieux. Ma recommandation : **rejet**, par symétrie stricte avec la règle `auth` objet de §6.3 corrigée en B1. Chaque axe impose un plancher de version, un blob qui déclare moins que son plancher est malformé.

Couvert par AC-54.6 et AC-54.7.

### T6. Deux `queryFilters` du même `ScopeEntry` sur le même paramètre : refusé à la génération, non spécifié au déchiffrement

§12.14 prévoit `Duplicate query filter for param '{param}'` à la génération. Le déchiffrement n'en dit rien. Or le salt est public : l'ADR-0009 §2 pose que « un blob se forge hors ligne » et que toute règle qui n'existe qu'à la génération ne protège personne.

Le cas n'est pas seulement une hygiène : deux filtres sur `ids` créent une ambiguïté réelle de sémantique. Le premier gagne-t-il ? Sont-ils en AND ? En OR ? Chaque réponse change le périmètre autorisé, et aucune n'est écrite.

Recommandation : rejet au déchiffrement, miroir exact de la génération, comme le projet le fait déjà pour l'unicité des noms de headers d'auth (§6.3, « les noms sont uniques »).

Couvert par AC-53.9.

### T7. Le message de refus d'un `?` dans un pattern doit changer, et il est aujourd'hui faux

`src/middleware/scope-limits.ts:126` renvoie :

> `Query parameters are not constrained by scopes, they are forwarded as sent.`

§19.7 demande de le faire pointer vers `queryFilters`. C'est bien noté dans la spec, mais aucun texte de remplacement n'est fourni, alors que §12.14 fournit le texte exact des quatre autres messages de validation. Sans texte, le dev inventera. Le PO doit livrer la chaîne, en anglais comme les autres messages de ce fichier.

Le message actuel devient factuellement faux le jour où la feature part : il affirme une non-contrainte universelle qui n'est plus vraie.

### T8. Le registre d'AC est décroché du code depuis le lot de sécurité

Constat vérifié, et il ne correspond pas exactement à ce que le lead avait en tête. `docs/acceptance-criteria.md` est en version 3.1, référence `docs/specs.md` v4.0, et s'arrête à **AC-42**. La série AC-40 (`/llms.txt`) y est bien présente. Ce qui manque, ce sont les huit séries introduites par le lot ADR-0009 / ADR-0010, qui n'existent **que** dans les noms de tests :

| Série | Thème | Fichiers de tests |
|---|---|---|
| AC-43 | Politique de sortie, hôte et forme du target | `tests/testu/net/egress.test.ts`, `tests/testu/crypto/blob-validation.test.ts`, `tests/testi/egress-policy.test.ts`, `tests/testi/proxy-egress.test.ts` |
| AC-44 | Chemin, encodage et règle des deux formes | `tests/testu/middleware/scopes-path-encoding.test.ts`, `tests/testi/proxy-egress.test.ts` |
| AC-45 | En-têtes entrants et résolution d'IP | `tests/testi/proxy-headers-policy.test.ts`, `tests/testu/logs-ip.test.ts`, `tests/testi/logs-endpoints.test.ts` |
| AC-46 | Non-contrainte de la query et verdict unifié | `tests/testu/middleware/scopes-path-encoding.test.ts`, `tests/testi/egress-policy.test.ts` |
| AC-47 | Plafonds de corps de requête | `tests/testi/api-edge-cases.test.ts`, `tests/testi/body-filters.test.ts` |
| AC-48 | Dialecte regex et budgets de dénombrement | `tests/testu/crypto/regex-policy.test.ts`, `tests/testu/crypto/blob-validation.test.ts` |
| AC-49 | Suppression de `/api/test-scope` | `tests/testi/endpoints.test.ts`, `tests/testi/egress-policy.test.ts` |
| AC-50 | Cache de clés dérivées | `tests/testu/crypto/key-cache.test.ts`, `tests/testi/egress-policy.test.ts` |

`docs/review/ac-coverage-v4.md` ne les mentionne pas non plus : c'est la matrice de la v4, antérieure au lot.

**Ma tranche, et je l'assume** : je ne backfille pas ces huit séries dans cette tâche. Reconstituer des critères d'acceptation à partir de tests déjà écrits, c'est rédiger la spec d'après l'implémentation, exactement l'inverse de ce à quoi sert un AC, et ça produirait des critères qui décrivent le code au lieu de le contraindre. Ce backfill est une dette du lot de sécurité, il se traite avec le PO qui a écrit l'ADR-0009 et l'ADR-0010, pas au détour d'une feature.

Ce que je fais à la place, dans le même commit :

1. Je prends la série **AC-51 et suivantes** pour `queryFilters`, ce qui évite toute collision avec AC-43 à AC-50.
2. J'ajoute au registre une section « Séries existantes hors registre », qui est exactement le tableau ci-dessus. Le registre cesse ainsi de laisser croire que rien n'existe entre AC-42 et AC-51, et la dette devient localisable sans avoir à greper les tests.
3. Je remonte le backfill comme tâche à part au lead, à cadrer avec le PO.

Ce que je ne fais **pas** : mettre à jour le numéro de version du registre en prétendant qu'il est à jour. Il passe en 4.0 avec sa référence de specs corrigée, et la section de dette dit ce qui manque.

---

## Acceptés

### A1. Opt-in plus déni par défaut : bonne décision, bien argumentée

L'argument de §19.2 est le bon : autoriser l'inconnu reviendrait à demander à l'auteur d'énumérer les paramètres dangereux qu'il ne connaît pas. C'est la même logique d'allowlist que le deny-all des scopes (§3.2), le produit est cohérent avec lui-même. Rien à redire, sous réserve de T1 sur la capacité à diagnostiquer un refus.

### A2. Restreindre `any` plutôt que coercer : bon précédent, bonne conclusion

Le rapprochement avec ADR-0010 D4 (`any` interdit sur objets et tableaux parce que la comparaison dépend de l'ordre de sérialisation du client) tient. Dans les deux cas, la valeur écrite par l'auteur n'est pas celle qui sera comparée, et il ne le voit pas. La conclusion est bonne, même si l'exemple des « trois états » est faux (T3) et si le cas `not` manque (B4).

### A3. Matrice `required` : complète, sans trou

Les quatre cas sont couverts, la troisième ligne (paramètre non déclaré) est bien distinguée des deux premières, et le paragraphe « piège d'articulation » dit exactement ce qu'il faut : `required: false` sur un filtre ne désactive jamais le déni par défaut pour les autres paramètres. J'ai cherché un cinquième cas, il n'y en a pas. Le seul angle non couvert est le doublon de `param`, traité en T6, qui n'est pas un cas de la matrice mais de la validation.

### A4. Budgets ADR-0010 globaux au blob, pas par axe

Décision juste, et c'est la plus importante des trois du point de vue sécurité. Un budget par axe aurait permis de doubler le coût d'une requête en répartissant les regex entre `bodyFilters` et `queryFilters`, ce qui aurait reproduit sur un autre champ le vecteur que l'ADR-0010 vient de fermer. Le code s'y prête sans effort : `BlobBudget` est déjà un objet mutable passé en paramètre.

### A5. Bump en v5 et contrôle exhaustif de `v`

Vérifié par le lead sur `src/crypto/blob.ts:255`, je construis dessus sans le rejouer. La promesse tient : un proxy antérieur refuse un blob v5 en `invalid_credentials` au lieu de le servir sans contrainte. L'argument de §6.2 est correct, le contrôle de version est bien la garantie et pas un marqueur informatif. J'ajoute simplement l'AC de non-régression (AC-54.4) pour que ce contrôle exhaustif ne soit jamais transformé en `v >= 2` par un futur refactor, ce qui suffirait à détruire la garantie.

Attention toutefois : cette garantie est unilatérale. Elle protège contre un **vieux proxy** face à un blob récent, pas contre un **blob qui sous-déclare sa version** face à un proxy récent, qui est le trou de T5.

### A6. Non-goals de §19.8

Les trois sont justes et bien choisis. L'indépendance à l'ordre des paramètres est la seule sémantique défendable. L'absence de contrainte croisée est correctement justifiée par le fait qu'elle demanderait un langage plus riche que `ObjectValue`. L'absence de re-parsing d'une valeur encodée en JSON évite d'ouvrir un second moteur de matching sur des données appelant. Il manque seulement le point-virgule (T3).

### A7. La copy de §12.14, alerte permanente de déni par défaut

Le choix d'un bloc d'alerte **permanent** tant qu'un filtre existe, plutôt qu'un message au premier ajout, est le bon, et la justification (asymétrie avec les body filters, qui sont purement additifs) est exacte. Le texte retenu porte sa gravité sans mot d'alerte, conformément à §12.13. C'est la meilleure page de la spec.

Réserve mineure, traitée en T1 : l'alerte parle des paramètres « non déclarés ici », ce qui couvre mal les paramètres qu'un tiers ajoute à l'insu de l'auteur.

---

## Ce que je n'ai pas couvert

- **Aucun test de la feature elle-même n'est écrit.** `queryFilters` n'existe pas dans `src/`, les AC des séries 51 à 56 sont donc à implémenter par le dev en même temps que la feature. J'ai livré un seul test exécutable, celui que §19.4 exige explicitement (`tests/testu/middleware/query-occurrences-budget.test.ts`), parce qu'il porte sur des primitives qui existent déjà.
- **Pas de recette d'accessibilité ni de revue visuelle** du formulaire de §12.14 : c'est le périmètre du designer, et il n'y a rien à regarder tant que rien n'est intégré.
- **Pas d'audit du différentiel de parseur de query côté cibles réelles.** Je documente le risque (T3) à partir du comportement de `URLSearchParams`, mesuré, et du comportement connu de piles amont, non mesuré. Vérifier ce qu'une cible donnée fait de `;` demanderait une cible de test, ce que je n'ai pas.
- **Le backfill des séries AC-43 à AC-50** est explicitement hors périmètre, argumenté en T8.
