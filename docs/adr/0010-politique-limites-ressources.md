# ADR 0010 : Politique de limites de ressources

- **Date** : 2026-09-04
- **Statut** : Proposed

## Contexte

FGP est conçu pour tourner en instance publique, sans compte, sans authentification en amont du proxy. Toute la surface est anonyme : `/api/*`, la route proxy `/{blob}/*`, et le mode header qui est monté sur `*` et donc joignable depuis n'importe quel chemin, `/healthz` compris.

Le runtime est mono-thread. Un `Deno.serve` unique, une boucle d'événements. Toute milliseconde de CPU synchrone consommée par une requête est une milliseconde pendant laquelle aucune autre requête n'avance. Le projet n'a aujourd'hui **aucune limite globale** : pas de `bodyLimit`, pas de plafond de décompression, pas de budget d'évaluation, pas de limitation de débit. Les quelques plafonds existants (blob à 4096 caractères, 8 body filters par scope, 16 valeurs OR par filtre) ont été posés un par un pour des raisons fonctionnelles, dans `docs/limits.md`, sans jamais être confrontés à un modèle de coût.

Une auto-review a mesuré quatre vecteurs de déni de service anonymes. Ils sont tous reproduits. Cet ADR les traite ensemble, parce que pris isolément chacun se corrige par un nombre, et que le nombre choisi n'a de sens que rapporté à ce que les autres coûtent déjà sur le même chemin.

### Mesures

Relevés sur la machine de développement (Apple Silicon, Deno 2). Les valeurs de l'auto-review, prises sur une machine environ trois fois plus lente, sont cohérentes en ordre de grandeur.

| Vecteur | Mesure | Prérequis pour l'attaquant |
| --- | --- | --- |
| PBKDF2 100 000 itérations | 11,60 ms de CPU pur par dérivation | aucun, un header `X-FGP-Key` quelconque |
| Backtracking `^(a+)+$` sur 29 caractères | 3 248 ms | une regex dans un scope de test |
| Backtracking `^(a+)+$` sur 31 caractères | 37 900 ms (mesure auto-review) | idem |
| 1 280 évaluations regex `^a*a*a*b$` sur 256 caractères | 7 780 ms | un blob qu'il fabrique lui-même |
| 1 280 évaluations `any()` sur un sous-arbre de 770 Ko | 2 956 ms | idem, **sans aucune regex** |
| `/api/share/decode`, 265 Ko de corps | 320 Mo de RSS, réponse 400 en 242 ms | aucun |
| Ratio gzip maximal mesuré | 1 029:1 | aucun |
| `matchPath`, motif de 1 000 segments contre 8 000 caractères | 0,096 ms | aucun |
| `JSON.parse` de 337 Ko | 0,92 ms | aucun |

Deux de ces lignes déplacent le problème par rapport à l'énoncé initial.

**La structure multiplicative des body filters coûte plus cher que le backtracking.** Un blob peut porter 10 scopes structurés, 8 body filters chacun, 16 valeurs OR par filtre, soit 1 280 évaluations d'`ObjectValue` pour une seule requête. À ce facteur, même une primitive parfaitement linéaire devient une arme : `any()` sur un sous-arbre de 770 Ko, qui ne contient pas une seule expression régulière, coûte 2 956 ms. Supprimer le type `regex` ne fermerait donc pas le vecteur.

**`matchPath` et `JSON.parse` ne sont pas des problèmes.** Le matcher glob maison est sans backtracking et reste sous 0,1 ms sur des entrées absurdes ; `JSON.parse` traite 337 Ko en 0,92 ms. Aucune limite ne se justifie de ce côté, et il faut le dire pour que personne n'aille en poser une par symétrie.

### Le principe qui gouverne tout le reste

Le salt serveur est **public par conception** : `GET /api/salt` le retourne en clair, parce que le navigateur en a besoin pour déchiffrer les bodies détaillés de `/logs` (`docs/specs.md`, section chiffrement). N'importe qui peut donc dériver une clé et **fabriquer un blob arbitraire hors ligne**, sans passer par `/api/generate`.

Conséquence directe : la frontière « donnée authentifiée par le blob » ne protège de rien contre un attaquant. Une limite posée uniquement à la génération est décorative. Le code le sait déjà en partie (`src/middleware/scope-limits.ts` commente « ici pour un message actionnable, là-bas pour refuser un blob crafté »), mais l'application est incomplète : les plafonds de `crypto/blob.ts` ne couvrent pas tout ce que `scope-limits.ts` couvre, et les deux handlers de test n'appellent ni l'un ni l'autre.

**Toute limite de cet ADR doit être vérifiée sur le chemin chaud, à chaque requête, pas seulement à la génération.**

## Décision

Neuf décisions. Elles reposent sur un critère unique, énoncé en D0.

### D0. Le critère de dimensionnement

**Aucune primitive optionnelle ne doit coûter plus cher que la dérivation de clé obligatoire déjà présente sur le chemin.**

La dérivation PBKDF2 est incompressible : elle est nécessaire pour déchiffrer, elle coûte 11,60 ms, et on ne peut pas s'en passer. Elle fixe donc le plancher de coût d'une requête proxy. Tout ce qui vient en plus (matching de body filters, décompression, parsing) doit rester sous cet ordre de grandeur, sinon la fonctionnalité optionnelle devient le coût dominant de l'instance. Ce critère remplace les nombres ronds : chaque plafond ci-dessous est calibré pour que son pire cas mesuré tienne dans ce budget.

### D1. Les deux handlers de test n'évaluent plus rien qui n'ait été validé

`/api/test-proxy` applique `validateScopeLimits` et la nouvelle validation de dialecte regex (D3) aux scopes reçus, **avant** tout appel à `checkAccess`. Un jeu de scopes hors limites part en 400 sans qu'une seule expression régulière soit compilée.

`/api/test-scope` est **supprimé**. C'est un changement de contrat public : la route figure dans l'OpenAPI, dans le README et dans `docs/specs.md`. Elle n'a en revanche **aucun appelant dans le produit** : l'UI fait le test de scope dans le navigateur depuis `src/ui/client/test-scope.ts:124`, qui importe `checkAccess` directement, et va jusqu'à désactiver le bouton côté client quand aucun scope ne matche (ligne 130). `docs/specs.md` ligne 893 affirme encore que le bouton appelle l'endpoint : la documentation est périmée, pas le code. Maintenir une copie serveur validée d'une logique que le produit exécute déjà côté navigateur, c'est payer une surface d'attaque pour zéro valeur.

Repli si l'équipe refuse le changement de contrat : appliquer à `/api/test-scope` la même validation qu'à `/api/test-proxy`. Non cassant, mais on garde du code mort sous garde.

### D2. La regex du chemin blob est bornée par trois couches, pas par une

Le chemin proxy continue d'évaluer des expressions régulières issues du blob. Comme un attaquant fabrique son blob hors ligne, ce chemin est aussi exposé que les endpoints de test. Trois couches, du plus au moins solide :

1. **Plafond de la valeur testée : 1 000 vers 128 caractères.** C'est la couche porteuse. Le backtracking est exponentiel ou polynomial en la longueur de l'entrée : le même motif `^a*a*a*b$` coûte 181,9 ms sur 1 000 caractères, 6,78 ms sur 256, et 2,54 ms sur 128. Le plafond ne dépend d'aucune analyse du motif, il est vérifiable et il ne peut pas se tromper.
2. **Dialecte restreint (D3).** Élimine la classe catastrophique. Heuristique, donc jamais seule.
3. **Plafond de 4 valeurs `regex` par blob, toutes portées confondues.** Aujourd'hui le maximum est 1 280. Quatre évaluations à 2,54 ms font 10,2 ms, soit exactement le budget de D0.

Une valeur de plus de 128 caractères doit être filtrée par `stringwildcard`, mesuré sûr jusqu'à 8 000 caractères.

### D3. Le dialecte regex du blob

Validé à la génération (message actionnable) **et** au déchiffrement (refus du blob) :

- source de 200 caractères maximum (existant, `crypto/blob.ts:100`) ;
- aucun quantificateur appliqué à un groupe : `(...)+`, `(?:...)*`, `(...){2,}` sont refusés. C'est la règle qui tue `^(a+)+$` et toute la classe exponentielle ;
- ni backréférence `\1` à `\9`, ni lookaround `(?=`, `(?!`, `(?<=`, `(?<!` ;
- `{n,m}` avec `m` inférieur ou égal à 100 ;
- 3 quantificateurs au maximum. `^v\d+\.\d+\.\d+$` en contient exactement 3 et coûte 0,028 ms ; `^a*a*a*b$` en contient 3 aussi et coûte 2,54 ms sur 128 caractères. Le pire cas construit à 3 quantificateurs tient dans le budget, celui à 4 non (82,6 ms), celui à 5 encore moins (2 209 ms) ;
- **évaluation ancrée** : le moteur reçoit `^(?:source)$`, toujours.

L'ancrage n'est pas une mesure de performance, c'est une correction de faille. Aujourd'hui `{"type":"regex","value":"main"}` autorise `not-main-at-all`, parce que `RegExp.test` fait du sous-chaîne. Un prédicat de permission qui matche en sous-chaîne est un contournement de scope qui attend son heure. L'ancrage par enveloppement ne resserre jamais dans le mauvais sens : un ancien blob devient plus strict, jamais plus permissif.

### D4. `any` est restreint aux valeurs scalaires

`matchObjectValue` compare aujourd'hui `JSON.stringify(ov.value) === JSON.stringify(bodyValue)` sur un sous-arbre arbitraire du body. Deux problèmes, pas un.

Le coût : 1 280 comparaisons sur un sous-arbre de 770 Ko font 2 956 ms. Sur des scalaires, les mêmes 1 280 comparaisons font 0,16 ms.

La correction : la comparaison est **déjà cassée** sur les objets. `JSON.stringify` dépend de l'ordre d'insertion des clés, et l'ordre des clés du body vient du sérialiseur de l'appelant. Vérifié : `JSON.stringify({a:1,b:2}) === JSON.stringify({b:2,a:1})` vaut `false`. Un filtre `any` sur un objet autorise ou refuse selon l'ordre dans lequel le client a écrit son JSON. Ce n'est pas un prédicat de permission, c'est un tirage.

`any` n'accepte donc plus que `string`, `number`, `boolean` et `null`. Refusé à la génération et au déchiffrement.

### D5. Toute décompression est bornée en sortie

Un helper unique remplace les deux appels à `new Response(stream).arrayBuffer()` de `crypto/blob.ts:59` et `crypto/share.ts:35`. Il pompe le reader et jette dès que la sortie dépasse le plafond.

**Plafond : 128 Ko, identique pour le blob et pour le partage.** Justification : le ciphertext d'un blob vaut au plus 3 044 octets (4 096 caractères base64url moins l'IV et le tag GCM), et 128 Ko autorise donc un ratio de 42:1, largement au-dessus des 10 à 15:1 constatés sur du JSON de configuration répétitif, tout en coupant d'un facteur 24 le ratio maximal de gzip mesuré à 1 029:1. Un blob dont la sortie dépasse 128 Ko ne peut pas être une configuration valide.

Effet sur `/api/share/decode`, combiné à D6 : 265 Ko d'entrée pour 320 Mo de RSS deviennent 8 Ko d'entrée pour 128 Ko de sortie. L'amplification passe de 1 200:1 à 16:1.

### D6. `bodyLimit` sur `/api/*`, jamais sur `*`

Le middleware `bodyLimit` de Hono est monté sur `/api/*` avec un défaut, et resserré route par route. **Il ne doit jamais être monté sur `*`** : la route proxy transmet le corps en streaming (`src/middleware/proxy.ts:85`, `init.body = c.req.raw.body`) et un `bodyLimit` global le mettrait en tampon, cassant les uploads volumineux légitimes à travers le proxy et introduisant précisément la consommation mémoire qu'on cherche à éviter. Le montage sur liste explicite est le même parti que celui déjà pris pour les en-têtes de sécurité (`FGP_OWNED_PATHS`), pour la même raison.

Valeurs en D-plan, section Lot 1.

Le champ `encoded` de `/api/share/decode` reçoit en plus un `.max(8192)` dans son schéma Zod. Justification par l'usage : ce payload n'a qu'un transport, le paramètre d'URL `/?c=...`. 8 192 octets est la limite de fait des serveurs en frontal (`large_client_header_buffers` de nginx, `LimitRequestLine` d'Apache). Au-delà, le lien de partage est déjà cassé en tant que lien.

### D7. La lecture bufferisée du corps proxy est plafonnée, le streaming ne l'est pas

`src/middleware/proxy.ts:169` fait `c.req.raw.clone().arrayBuffer()` sans plafond dès qu'un body filter ou le mode detailed est actif. Le `clone()` fait un tee du flux et la branche clonée est lue intégralement **avant** le forward : un upload de 100 Mo à travers le proxy avec les logs detailed activés est entièrement mis en mémoire, pour n'en capturer ensuite que 32 Ko (`FGP_LOGS_DETAILED_MAX_KB`).

La lecture devient incrémentale avec un plafond, et rend 413 au delà.

**Plafond : 512 Ko.** Justification : `JSON.parse` de 337 Ko coûte 0,92 ms, donc 512 Ko coûtent environ 1,4 ms, un ordre de grandeur sous les 11,60 ms de la dérivation obligatoire (critère D0). Et un body filter décide sur des champs de type identifiant situés à 6 segments de dot-path au maximum : la charge utile filtrée réaliste du cas d'usage de référence tient sous 16 Ko, ce qui laisse un facteur 32.

**Non-régression à protéger explicitement** : sans body filter et sans capture detailed, le corps n'est jamais bufferisé, il est transmis en flux. Le plafond ne s'applique donc pas et les gros uploads à travers le proxy continuent de passer. C'est une propriété du proxy transparent (ADR-0006) qu'il ne faut pas perdre en posant la limite au mauvais endroit.

Raffinement : quand seule la capture detailed a besoin du corps (aucun body filter), lire au plus `FGP_LOGS_DETAILED_MAX_KB` plus un octet, le reste étant de toute façon tronqué.

### D8. PBKDF2 : une dérivation par requête, un cache borné, des itérations inchangées

**Une seule dérivation par requête.** `decryptBlob` dérive la clé, puis `finishWithCapture` la redérive vingt lignes plus loin (`proxy.ts:325`) pour chiffrer le body detailed. C'est 11,60 ms jetés par requête, sans le moindre bénéfice. La clé dérivée descend par le contexte au lieu d'être recalculée. Aucun risque, aucune contrepartie.

**Pré-validation à coût nul avant dérivation.** `checkClientKey` de `crypto/client-key.ts` (24 à 256 caractères ASCII imprimables) n'est appliqué que sur `/api/generate` ; le chemin proxy ne fait qu'un test de présence (`proxy.ts:123`). Une clé qui n'aurait jamais pu être générée ne peut déchiffrer aucun blob : la rejeter avant PBKDF2 est gratuit. Idem pour un plancher structurel de taille de blob (IV 12 octets plus tag GCM 16 octets plus un flux gzip minimal, soit 48 octets).

**Il faut dire ce que ça ne fait pas** : un attaquant envoie une clé de 24 caractères bien formée et ne paie rien. La pré-validation filtre les sondes malformées et les erreurs de configuration, elle ne déplace pas le plafond de 86 requêtes par seconde. C'est de l'hygiène, pas une défense.

**Cache LRU de dérivation, borné.** Clé de cache : `SHA-256(clientKey || 0x00 || serverSalt)`. Valeur : le `CryptoKey`, déjà non extractible (`blob.ts`, `extractable = false`). Capacité 512 entrées, TTL d'inactivité 10 minutes, purge par le timer existant de 60 secondes, qui doit cesser d'être conditionné à `logsEnabled()`.

Ce que le cache fait et ne fait pas, sans arrondi : le trafic légitime réutilise une clé, il passe de 11,60 ms à environ 0,01 ms par requête. Le trafic d'attaque utilise des clés aléatoires, il rate le cache à 100 % et **son coût ne bouge pas**. Le cache n'abaisse pas le plafond de l'attaquant, il rend le trafic légitime quasi gratuit, donc il augmente la charge utile qu'une instance sous attaque peut continuer d'absorber. C'est le bon gain, ce n'est pas le gain qu'on croit acheter.

Implications de sécurité, à poser explicitement :

- la table ne contient jamais la clé client : une empreinte SHA-256 salée en index, une poignée de `CryptoKey` non extractible en valeur. L'exposition marginale par rapport à l'existant est la durée de rétention, pas la nature de la donnée ;
- **canal auxiliaire par le temps** : un hit est mesurablement plus rapide qu'un miss, ce qui constitue un oracle indiquant si une clé client donnée a été vue récemment par cet isolate. Sévérité faible (les clés font 24 caractères au minimum, l'oracle révèle une récence, pas une valeur), mais c'est une raison de garder le TTL court, et ça doit être écrit quelque part plutôt que découvert ;
- le cache convertit une pression CPU en pression mémoire, d'où la borne dure en capacité ;
- sur Deno Deploy le cache est par isolate et éphémère. C'est un cache, jamais une dépendance de correction.

**Ne pas baisser le nombre d'itérations.** C'est le geste tentant et c'est le mauvais. Le paramètre n'est pas porté par le blob : le changer invalide tous les blobs en circulation. Et l'argument « la clé est un UUID à haute entropie donc l'étirement ne sert à rien » ne tient pas depuis le BYOK, qui accepte des clés fournies par l'utilisateur à partir de 24 caractères. Si ce paramètre doit bouger un jour, il lui faut un blob v5 qui transporte ses paramètres de KDF. Hors périmètre.

### D9. La limitation de débit n'est pas dans l'application

Toutes les décisions ci-dessus bornent le **coût d'une requête**. Aucune ne borne le **nombre de requêtes**. C'est un choix, pas un oubli, et il est développé dans la section suivante.

## Options envisagées pour le ReDoS

### Option A : Worker avec budget temps (rejetée)

Exécuter chaque évaluation dans un `Worker` et l'abattre au delà d'un budget.

- Avantages : c'est la seule façon d'interrompre un backtracking déjà lancé. Le budget est un vrai plafond, pas une estimation.
- Inconvénients : `new Worker` n'est pas disponible sur le runtime Deno Deploy classique, cible de déploiement principale du projet (à revérifier contre la documentation courante avant de s'appuyer sur ce point). Mais même disponible, l'option reste à rejeter : elle rendrait le résultat d'une **décision de permission** dépendant de la cible de déploiement, un même blob pouvant autoriser sur un conteneur et refuser sur Deploy. C'est inacceptable pour un proxy dont le contrat est « ce que tu as scopé est ce que tu obtiens ». Accessoirement, le coût d'un aller-retour de message dépasse de plusieurs ordres de grandeur les 0,028 ms que coûte un motif réaliste.

### Option B : tout côté navigateur, endpoint supprimé (retenue pour la surface, insuffisante seule)

- Avantages : gratuit, le produit le fait déjà. `src/ui/client/test-scope.ts` importe `checkAccess` et l'exécute dans l'onglet ; le projet type-checke ce code via `deno.client.json`. Le CPU brûlé est celui de l'attaquant.
- Inconvénients : ne ferme pas le chemin chaud. Le proxy évalue des regex issues du blob, et le salt étant public, fabriquer un blob est gratuit et anonyme. Retenue comme réduction de surface (D1), pas comme réponse.

### Option C : moteur non backtracking (rejetée pour l'instant, gardée en réserve)

RE2 ou le crate `regex` de Rust compilé en wasm, garantie de temps linéaire.

- Avantages : la seule option qui donne une **preuve** au lieu d'une borne mesurée.
- Inconvénients : une dépendance wasm dans un projet qui en compte six, du poids au démarrage à froid sur Deno Deploy, et un changement de dialecte de toute façon puisque RE2 n'a ni lookaround ni backréférence. Le tout pour la primitive la plus rare de la fonctionnalité la plus rare. Rejetée aujourd'hui, retenue comme échappatoire si l'enveloppe mesurée de D2 et D3 se révèle insuffisante.

### Option D : supprimer le type `regex` (rejetée)

- Avantages : ferme définitivement la classe.
- Inconvénients : **ne suffirait pas**, puisque `any()` seul atteint 2 956 ms sans regex. Et la perte fonctionnelle est réelle : le tableau OR de 16 `stringwildcard` absorbe l'alternation, mais pas les classes de caractères ni la répétition bornée. `^v\d+\.\d+\.\d+$` n'a pas d'équivalent glob.

## Deno Deploy et auto-hébergement : ce qui est garanti dans chaque cas

### Ce qui est identique

Toutes les limites de cet ADR sont appliquées dans le code applicatif, sur chaque requête. Elles tiennent à l'identique sur les deux cibles. C'est la raison pour laquelle la politique est écrite en code et pas en configuration d'infrastructure.

### Deno Deploy

La plateforme borne le CPU par requête et recycle les isolates. Un emballement est donc borné en durée, et son rayon d'action se limite aux requêtes co-locataires du même isolate. La mémoire est plafonnée à 512 Mo (`docs/deno-deploy.md`) : le pic de 320 Mo de `/api/share/decode` en est à un facteur 1,6 de tuer l'isolate.

Le vrai risque sur Deploy n'est pas la latence, c'est le **quota**. Le plan gratuit documente environ 20 heures de CPU par mois. Deux calculs :

- une inondation anonyme soutenue à 86 requêtes par seconde consomme une seconde de CPU par seconde de temps réel, donc la totalité du quota mensuel en **une vingtaine d'heures d'attaque** ;
- avec le ReDoS non corrigé à 37,9 secondes par requête, **1 900 requêtes** suffisent à épuiser le mois (72 000 secondes divisées par 37,9).

Le plafond CPU par requête de la plateforme ne protège pas de ça, il ne fait qu'étaler la facture. C'est une mise hors service par facturation, à 1 900 requêtes.

La limitation de débit en mémoire du processus est **quasi inopérante** sur Deploy : l'état est par isolate, les isolates sont éphémères et les requêtes se répartissent entre eux. Elle doit être posée devant l'instance, dans un CDN ou un WAF.

### Auto-hébergement en conteneur

Rien ne tue une requête emballée. Un `Deno.serve`, une boucle d'événements : les 37,9 secondes de backtracking sont **37,9 secondes d'indisponibilité totale** pour tous les clients, pas une requête lente parmi d'autres. Le pic de 320 Mo provoque un OOM kill sur un conteneur à 512 Mo, ce qui coupe toutes les requêtes en vol et vide le ring buffer des logs.

En contrepartie, il y a un processus unique et durable : une limitation de débit en mémoire y fonctionne réellement, et un `limit_req` nginx en frontal aussi.

### Ce que la politique ne garantit sur aucune des deux

Une borne sur le **débit**. Il faut le documenter côté opérateur plutôt que de prétendre le résoudre dans le code : sur Deploy, un CDN ou un WAF en frontal ; en auto-hébergement, `limit_req` au niveau du reverse proxy, ou un limiteur en processus qui, lui, tiendra. Un limiteur applicatif qui ne fonctionne que sur une cible sur deux donnerait un faux sentiment de couverture ; c'est la raison de D9.

## Conséquences

### Ce qui casse

Par ordre décroissant d'impact.

1. **`/api/test-scope` disparaît.** Changement de contrat public : la route est dans l'OpenAPI, dans le README, dans `docs/specs.md` et dans `/llms.txt`. Impact produit nul (aucun appelant côté UI), impact potentiel sur un intégrateur tiers qui l'aurait câblée. À annoncer dans le changelog.
2. **Les blobs dont une regex sort du dialecte D3 sont refusés au déchiffrement.** Leurs porteurs doivent régénérer. Aujourd'hui `decryptBlob` lève une erreur générique attrapée en 401 `invalid_credentials`, ce qui serait un diagnostic mensonger : il faut un code dédié, à ajouter dans `docs/specs.md` et `/llms.txt` puisque la route proxy n'est pas documentée dans l'OpenAPI (convention CLAUDE.md).
3. **Le plafond de la valeur testée par une regex passe de 1 000 à 128 caractères.** Une valeur de body entre 128 et 1 000 caractères fait désormais échouer le filtre, donc refuse l'accès. Échec fermé, jamais ouvert, mais c'est un changement de comportement sur des blobs existants.
4. **`any` sur un objet ou un tableau est refusé.** Casse une configuration qui, en pratique, ne fonctionnait déjà que par chance sur l'ordre des clés.
5. **L'évaluation regex devient ancrée.** Un blob qui reposait sur un match en sous-chaîne devient plus strict. Correction de faille, mais changement de comportement.
6. **4 valeurs `regex` par blob au maximum, `and` de 8 éléments au maximum, 256 `ObjectValue` au total.** D'après l'analyse de `docs/limits.md` section 6, le maximum théorique actuel (1 280 `ObjectValue`) ne tient de toute façon pas dans un blob de 4 Ko : ces trois plafonds ne cassent rien qui fonctionne aujourd'hui.
7. **413 sur `/api/*` au delà du `bodyLimit`, et sur le proxy au delà de 512 Ko de corps bufferisé** quand un body filter ou la capture detailed est actif.

### Ce qui ne change pas

- Le proxy transparent (ADR-0006) : aucune réponse amont n'est transformée. Les 413 et 400 introduits sont des réponses FGP, portent `X-FGP-Source: proxy` et la shape `{error, message}`.
- Le streaming du corps proxy quand aucun body filter ni capture detailed n'est actif.
- Le nombre d'itérations PBKDF2, donc la validité de tous les blobs existants qui n'utilisent pas les primitives restreintes.
- `matchPath` et `stringwildcard`, mesurés sûrs, non touchés.

### Dette assumée

La couche 2 de D2 (le dialecte) repose sur une analyse statique d'une source de regex, écrite à la main. C'est un parseur, et les parseurs ont des bugs. Un motif qui passerait au travers de l'analyse retomberait sur les couches 1 et 3, soit 4 évaluations sur 128 caractères. C'est le point faible connu de cette proposition, il est traité en tête du plan de test.

## Plan d'implémentation

Trois lots, ordonnés par ratio risque supprimé sur coût. Le lot 1 ne casse rien et peut partir seul.

### Lot 1 : sans casse, gains immédiats

**1.1 Dérivation unique par requête**
- Fichier : `src/crypto/blob.ts`, `src/middleware/proxy.ts`
- Changement : `decryptBlob` expose la `CryptoKey` dérivée (retour `{ config, derivedKey }` ou variante interne) ; `handleProxy` la passe à `finishWithCapture` au lieu du couple `clientKey` / `serverSalt` ; suppression du `deriveKey` de `proxy.ts:325`.
- Valeur : 1 dérivation par requête au lieu de 2.
- Justification : 11,60 ms mesurés, recalculés pour rien vingt lignes plus loin dans la même requête.
- Test : `tests/testi/logs-endpoints.test.ts`, espion de comptage sur `deriveKey`, assertion d'exactement un appel pour une requête proxy avec `logs.detailed` actif.

**1.2 `bodyLimit` sur `/api/*`**
- Fichier : `src/main.ts`
- Changement : `import { bodyLimit } from "hono/body-limit"`, monté sur `/api/*` avec un défaut, resserré par route. **Jamais sur `*`.**
- Valeurs : défaut `/api/*` 64 Ko ; `/api/decode` 8 Ko ; `/api/share/decode` 16 Ko ; `/api/list-apps` et `/api/list-addons` 4 Ko.
- Justification : le plus gros corps qui peut aboutir est celui de `/api/generate`. Une configuration qui produit un blob de 4 096 caractères base64url au maximum pèse au plus 3 044 octets de gzip, soit environ 45 Ko de JSON au ratio de 10 à 15:1 constaté sur du JSON de configuration ; 64 Ko laisse 40 % de marge et tout ce qui dépasse échouerait de toute façon en `blob_too_large`, donc le refuser plus tôt ne coûte rien à l'appelant. `/api/decode` transporte un blob (4 096) plus une clé (256). `/api/share/decode` transporte `encoded` (8 192, voir 1.3). Les deux helpers Scalingo transportent un token, un nom d'application et une URL.
- Test : `tests/testi/api-edge-cases.test.ts`, un 413 par palier, plus une assertion que la route proxy accepte un corps de 2 Mo en streaming sans body filter (non-régression du point 1.5).

**1.3 Plafond du champ `encoded`**
- Fichier : `src/routes/ui.tsx`, `ShareDecodeBodySchema`
- Changement : `z.string().min(1)` devient `z.string().min(1).max(8192)`.
- Valeur : 8 192 caractères.
- Justification : seul transport de ce payload, le paramètre d'URL `/?c=...` ; 8 192 est la limite de fait des serveurs en frontal, au delà le lien de partage est cassé en tant que lien.
- Test : `tests/testi/api.test.ts`, 400 `invalid_body` sur 8 193 caractères, 200 sur un partage réaliste.

**1.4 Décompression bornée**
- Fichier : nouveau `src/crypto/bounded.ts`, appelé par `src/crypto/blob.ts:59` et `src/crypto/share.ts:35`
- Changement : helper qui pompe le reader de `DecompressionStream` et lève dès que la sortie cumulée dépasse le plafond, au lieu de `new Response(stream).arrayBuffer()`.
- Valeur : 128 Ko, identique aux deux appelants.
- Justification : ciphertext de blob à 3 044 octets au maximum, donc un ratio autorisé de 42:1 quand le JSON de configuration compresse à 10 ou 15:1 ; coupe d'un facteur 24 le ratio gzip maximal mesuré à 1 029:1. Ramène `/api/share/decode` de 320 Mo de RSS à 128 Ko.
- Test : `tests/testu/crypto/`, une bombe gzip de 3 Ko produisant 3 Mo, assertion du rejet et de la borne mémoire ; plus un aller-retour nominal encode / decode.

**1.5 Lecture bufferisée du corps proxy plafonnée**
- Fichier : `src/middleware/proxy.ts:169`
- Changement : lecture incrémentale du clone avec plafond et abandon, 413 au delà. Quand seule la capture detailed a besoin du corps, plafond à `FGP_LOGS_DETAILED_MAX_KB` plus un octet.
- Valeur : 512 Ko.
- Justification : `JSON.parse` de 337 Ko à 0,92 ms, donc environ 1,4 ms à 512 Ko, un ordre de grandeur sous les 11,60 ms de la dérivation obligatoire ; et la charge utile filtrée réaliste tient sous 16 Ko, soit un facteur 32.
- Test : `tests/testi/body-filters.test.ts`, 413 sur 1 Mo avec body filter actif ; **et surtout** un test de non-régression : 2 Mo transmis sans body filter ni detailed, assertion que l'amont a bien reçu les 2 Mo.

**1.6 Pré-validation avant dérivation**
- Fichier : `src/middleware/proxy.ts:119-127`
- Changement : appliquer `checkClientKey` à `X-FGP-Key` et un plancher structurel de taille de blob avant `decryptBlob`.
- Valeurs : clé de 24 à 256 caractères ASCII imprimables (réutilise `crypto/client-key.ts`) ; blob de 48 octets décodés au minimum (IV 12, tag GCM 16, flux gzip minimal 20).
- Justification : une clé hors format n'a jamais pu générer de blob, la rejeter est gratuit. **Ne déplace pas le plafond de 86 requêtes par seconde contre un attaquant délibéré**, à ne pas vendre comme une défense.
- Test : `tests/testi/proxy-edge-cases.test.ts`, 401 sur une clé de 5 caractères et sur une clé contenant un espace, sans appel à `deriveKey` (espion de comptage).

### Lot 2 : casse contenue, ferme le ReDoS

**2.1 Module de politique regex**
- Fichier : nouveau `src/crypto/regex-policy.ts`
- Changement : `checkRegexSource(source): RegexIssue | null` implémentant D3, plus `compileAnchored(source): RegExp` qui enveloppe en `^(?:...)$`. Appelé depuis `crypto/blob.ts` (`isValidObjectValue`, refus du blob), `middleware/scope-limits.ts` (message actionnable à la génération) et `routes/ui.tsx` (`/api/test-proxy`).
- Valeurs : source de 200 caractères au maximum ; aucun quantificateur sur un groupe ; ni backréférence ni lookaround ; `{n,m}` avec `m` inférieur ou égal à 100 ; 3 quantificateurs au maximum.
- Justification : `^a*a*a*b$` sur 128 caractères coûte 2,54 ms à 3 quantificateurs, 82,6 ms à 4, 2 209 ms à 5. Le seuil est là où le pire cas mesuré tient dans le budget D0.
- Test : `tests/testu/crypto/regex-policy.test.ts`. **C'est le test le plus important du lot.** Un corpus de motifs catastrophiques connus doit être refusé : `^(a+)+$`, `^(a|a)*$`, `^(a*)*$`, `^(?:a+)+$`, `(x+x+)+y`, `^(a+){10}$`. Un corpus de motifs légitimes doit passer : `^v\d+\.\d+\.\d+$`, `^refs/heads/[a-z0-9._/-]+$`, `^(main|develop)$`. Les pièges de parseur doivent être couverts : parenthèses échappées `\(a+\)+`, parenthèses en classe `[(]a+`, `{` littéral non quantificateur.

**2.2 Plafond de valeur et ancrage**
- Fichier : `src/middleware/scopes.ts:105-112`
- Changement : `bodyValue.length > 1000` devient `> 128` ; `new RegExp(ov.value)` devient `compileAnchored(ov.value)`.
- Valeurs : 128 caractères ; ancrage systématique.
- Justification : 181,9 ms sur 1 000 caractères, 2,54 ms sur 128, pour le même motif. L'ancrage corrige en plus un contournement de scope par match en sous-chaîne.
- Test : `tests/testi/body-filters.test.ts`, un filtre `{"type":"regex","value":"main"}` doit refuser `not-main-at-all` (aujourd'hui il l'autorise) ; une valeur de 129 caractères doit refuser.

**2.3 Plafonds de dénombrement**
- Fichier : `src/crypto/blob.ts` (déchiffrement) et `src/middleware/scope-limits.ts` (génération)
- Changement : compteur global sur l'ensemble du blob, toutes portées et tous niveaux d'imbrication confondus.
- Valeurs : 4 `ObjectValue` de type `regex` par blob ; largeur d'un `and` à 8 ; 256 `ObjectValue` au total.
- Justification : 4 fois 2,54 ms font 10,2 ms, soit le budget D0. La largeur de `and` n'a aujourd'hui **aucune borne supérieure** (`blob.ts:110` ne vérifie que le minimum de 2) ; 8 aligne sur le plafond de body filters déjà retenu dans `docs/limits.md`. Le total de 256 borne le budget d'évaluation par requête, et `docs/limits.md` section 6 établit déjà que le maximum théorique de 1 280 ne tient pas dans un blob de 4 Ko.
- Test : `tests/testu/crypto/`, blob forgé avec 5 regex refusé, avec 4 accepté ; `and` de 9 éléments refusé ; blob de 257 `ObjectValue` refusé. Forger les blobs directement avec `encryptBlob` et non via `/api/generate`, pour vérifier la validation côté déchiffrement.

**2.4 `any` restreint aux scalaires**
- Fichier : `src/crypto/blob.ts` (`isValidObjectValue`, cas `any`), `src/middleware/scope-limits.ts`
- Changement : `return "value" in o` devient une vérification que la valeur est `string`, `number`, `boolean` ou `null`.
- Justification : 2 956 ms contre 0,16 ms pour 1 280 évaluations, et surtout la comparaison sur objet dépend de l'ordre des clés du sérialiseur de l'appelant, ce qui la rend non déterministe pour une décision de permission.
- Test : `tests/testu/crypto/`, blob forgé avec `{"type":"any","value":{"a":1}}` refusé au déchiffrement ; `tests/testi/api.test.ts`, 400 `scope_limit_exceeded` à la génération.

**2.5 Validation des scopes sur `/api/test-proxy`**
- Fichier : `src/routes/ui.tsx`, handler `testProxyRoute`
- Changement : `validateScopeLimits` plus la politique regex appliqués avant tout `checkAccess`, 400 sinon.
- Justification : ferme le vecteur de 37,9 secondes sans changer le contrat de la route.
- Test : `tests/testi/api.test.ts`, 400 sur `^(a+)+$`, et assertion que la réponse arrive en moins de 100 ms.

**2.6 Suppression de `/api/test-scope`**
- Fichiers : `src/routes/ui.tsx` (route, schémas `TestScopeBody`, `TestScopeResult`, `TestScopeResponse`, `TestScopeError400`), `src/routes/llms.ts`, `docs/specs.md` (tableau des endpoints et section 893, périmée), `README.md` (tableau des endpoints), `docs/changelog.md`, suppression de `tests/testi/test-scope.test.ts`.
- Justification : zéro appelant produit, l'UI fait le test dans le navigateur depuis `src/ui/client/test-scope.ts:124`.
- Test : `tests/testi/endpoints.test.ts`, 404 sur `POST /api/test-scope` et absence de la clé dans `/api/openapi.json`.
- **Cassant, à annoncer.**

### Lot 3 : cache et exploitation

**3.1 Cache LRU de dérivation**
- Fichier : nouveau `src/crypto/key-cache.ts`, appelé par `src/crypto/blob.ts` (`deriveKey`)
- Valeurs : capacité 512 entrées, TTL d'inactivité 10 minutes, index `SHA-256(clientKey || 0x00 || serverSalt)`.
- Justification : rend le trafic légitime quasi gratuit (11,60 ms vers environ 0,01 ms). **N'abaisse pas le coût de l'attaquant**, qui rate le cache à 100 % avec des clés aléatoires.
- Prérequis : sortir le `setInterval` de purge de `src/main.ts` de sa condition `logsEnabled()`, ou lui donner son propre timer.
- Test : `tests/testu/crypto/key-cache.test.ts`, deux déchiffrements avec la même clé n'appellent `crypto.subtle.deriveKey` qu'une fois ; l'entrée 513 évince la plus ancienne ; une entrée expirée est redérivée ; la table ne contient à aucun moment la clé client en clair (inspection des clés d'index).

**3.2 Documentation opérateur**
- Fichiers : `docs/deno-deploy.md`, `docs/scalingo-deploy.md`, `README.md`
- Changement : une section « limitation de débit » par cible. Sur Deploy, la poser dans un CDN ou un WAF en frontal, avec le calcul du quota (1 900 requêtes ReDoS, ou une vingtaine d'heures d'inondation, épuisent le mois du plan gratuit). En auto-hébergement, `limit_req` nginx en frontal, avec la note qu'une requête emballée y est une indisponibilité totale et non une requête lente.
- Justification : c'est la seule borne que cette politique ne pose pas, il faut dire où elle se pose.

### Hors périmètre, à traiter ailleurs

- La politique de sortie du proxy et le statut de relais ouvert de `/api/test-proxy` : ADR de l'architecte en parallèle. Le point 2.5 valide les scopes reçus mais ne change rien à qui peut faire émettre une requête sortante par l'instance.
- Un blob v5 portant ses paramètres de KDF, seule voie propre pour faire évoluer les 100 000 itérations.
- Un limiteur de débit applicatif : rejeté en D9 tant que la couverture serait à une cible sur deux.

## Interaction avec l'ADR-0009

Les deux ADR se croisent sur deux points, qu'il faut arbitrer avant d'implémenter l'un ou l'autre.

**Les `queryFilters` sont une nouvelle dimension multiplicative sur le chemin chaud.** L'ADR-0009 ajoute `queryFilters?: QueryFilter[]` au `ScopeEntry`, dont le champ `values` est **la même union `ObjectValue`** que les body filters. Sans plafond, cet axe rouvre exactement le vecteur que le lot 2 ferme : les mêmes types `regex` et `any`, évalués sur des valeurs contrôlées par l'appelant, avec un facteur multiplicatif supplémentaire de scopes fois paramètres fois valeurs OR, qui vient s'ajouter aux 1 280 évaluations déjà possibles par les body filters.

Arbitrage retenu : **les plafonds de dénombrement du point 2.3 sont globaux au blob, pas par axe**. Les 4 valeurs `regex`, les 256 `ObjectValue` au total et la largeur de `and` à 8 se comptent sur l'union des `bodyFilters` et des `queryFilters`. De même, le plafond de 128 caractères sur la valeur testée et l'évaluation ancrée du point 2.2 s'appliquent aux valeurs de query, qui sont d'ailleurs plus courtes que des valeurs de body. Si l'ADR-0009 part avant le lot 2, ses plafonds doivent être posés dès sa propre implémentation, sans quoi la mesure de 7 780 ms est simplement reproduite sur un autre champ.

**La suppression de `/api/test-scope` sert l'argument de l'ADR-0009, elle ne le contredit pas.** L'ADR-0009 propose une fonction d'autorisation unique dans `src/middleware/scopes.ts`, appelée par le proxy, par `/api/test-scope` et par le highlight client, au motif que trois lectures parallèles des scopes ne peuvent pas rester d'accord dans le temps. Le handler de `/api/test-scope` est précisément la troisième lecture : il réimplémente le décompte par scope en ligne dans `src/routes/ui.tsx` avec `parseScope`, `matchPath` et `matchBodyFilter`, au lieu d'appeler `checkAccess`. Le supprimer ramène le nombre de lectures de trois à deux, et les deux restantes (le proxy et le navigateur) partagent déjà le même module. La convergence demandée par l'ADR-0009 est obtenue par soustraction plutôt que par refactorisation.

Si l'équipe préfère conserver l'endpoint, les deux ADR restent compatibles : il faut alors qu'il appelle la fonction unique de l'ADR-0009 **et** qu'il applique la validation du point 2.5 avant toute évaluation.

## Liens

- ADR-0002 : chiffrement serveur, dérivation PBKDF2
- ADR-0004 : body filters et scopes structurés
- ADR-0006 : proxy transparent, forme des erreurs FGP
- ADR-0007 : logs stream, capture detailed
- `docs/limits.md` : limites fonctionnelles des body filters, dont la section 6 sur la taille de blob
- `docs/deno-deploy.md` : quotas de la plateforme
