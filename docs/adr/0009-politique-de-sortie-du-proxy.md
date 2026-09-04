# ADR 0009 : Politique de sortie du proxy (hôte, chemin, query, en-têtes)

- **Date** : 2026-09-04
- **Statut** : Proposed

## Contexte

Une auto-review adversariale a confirmé huit défauts sur la branche `fix/security-hardening`. Trois d'entre eux ont été instruits séparément : une SSRF non authentifiée, un contournement de scope par chemin percent-encodé, et une query string ignorée par le contrôle d'accès. Ce sont trois symptômes d'une seule cause : **FGP n'a jamais écrit ce qu'il contrôle sur ce qui sort de lui**.

Le projet a documenté avec soin ce qui entre (blob, clé client, TTL, scopes, body filters) et ce qui revient (ADR-0006, transparence des réponses upstream). Entre les deux, la requête sortante n'a jamais eu de contrat : ni sur l'hôte joint, ni sur le chemin émis, ni sur la query transmise, ni sur les en-têtes propagés. Chaque axe a donc dérivé indépendamment, et chaque dérive est aujourd'hui une faille.

### Les faits, tous reproduits

**L'hôte n'est contraint nulle part.** `target` est un `z.string().min(1)` nu sur `/api/generate` et `/api/test-proxy`, tous deux non authentifiés, et un `typeof config.target === "string"` non vide au déchiffrement du blob. Aucun contrôle de schéma, aucune notion de destination interdite. Un anonyme fait émettre à l'instance publique une requête vers n'importe quel hôte de son réseau, avec les en-têtes de son choix, et récupère le corps de la réponse. Le contrôle de scope ne l'arrête pas : les scopes sont fournis par le même appelant, donc satisfaits avec `["*:*"]`. Reproduit contre un `169.254.169.254` simulé. Le conteneur tourne avec `--allow-net` sans liste d'hôtes.

**Ce ne sont pas les deux seuls points de sortie.** `/api/list-apps` et `/api/list-addons` passent leur champ `target` à `resolveScalingoApiUrl()` sans contrôle. Surtout, le champ `apiUrl` de l'`AuthSpec` `scalingo-addon` (ADR-0008) désigne l'hôte auquel `fetchAddonToken()` présente le **bearer Scalingo fraîchement échangé**. Un blob v4 portant `apiUrl: "https://collecteur.example"` fait livrer ce bearer à un tiers. La SSRF n'est donc pas seulement un accès au réseau interne, c'est aussi une exfiltration de credential upstream.

**Le schéma n'est pas contraint non plus.** `fetch` accepte `data:` (vérifié : `fetch("data:text/plain,hello")` répond 200) et `file:` (bloqué ici par `--allow-read=static`, mais `file:///app/static/...` reste lisible). Un `target` n'a même pas à être une URL réseau.

**Le chemin autorisé n'est pas le chemin émis.** Trois divergences distinctes, toutes reproduites.

1. *Percent-encoding.* `proxyPath` sort de `url.pathname` sans décodage, `checkAccess` compare cette chaîne aux patterns, et le forward la reconcatène telle quelle. Le parseur URL normalise `..` et `%2e%2e`, pas `%2f` ni `%5c`. Avec le scope `GET:/v1/public/*`, la requête `/v1/public/..%2f..%2fadmin` passe en 200, et `fetch` réémet la séquence encodée octet pour octet sur le fil (vérifié). L'échec se matérialise sur toute cible qui décode `%2F` avant routage : Tomcat, Apache avec `AllowEncodedSlashes On`, plusieurs passerelles.
2. *Concaténation du target.* `forwardRequest` construit `${target}${proxyPath}${url.search}` par concaténation de chaînes. Un `target` valant `https://api.example.com/#` produit une URL dont le chemin réellement émis est `/`, le chemin scopé finissant dans le fragment, qui n'est jamais envoyé. Vérifié : scope contrôlé sur `/v1/items`, requête émise sur `/`. Un `target` valant `https://api.example.com/?x=` produit `/?x=/v1/items`. Le contrôle d'accès porte alors sur une chaîne qui n'a aucun rapport avec la requête émise.
3. *Divergence entre les deux modes de livraison du blob.* En mode header, `proxyPath = url.pathname`, brut. En mode URL, il est reconstruit par `"/" + segments.slice(1).join("/")` après un `filter(Boolean)`, ce qui écrase les slashes répétés et supprime le slash final. La même requête `/v1//public//x` est donc évaluée comme `/v1//public//x` en mode header et comme `/v1/public/x` en mode URL. Deux modes de livraison, deux surfaces d'autorisation.

**La query string est invisible du modèle.** `checkAccess` ne reçoit que méthode, chemin et corps. `url.search` est concaténé sans examen. Un blob scopé `GET:/v1/items` rend 200 sur `/v1/items?action=delete&scope=all`. Symétriquement, un scope portant un `?` est un scope mort, jamais rejeté ni signalé, dont l'auteur croit qu'il contraint quelque chose. Aggravant : le testeur de scopes de l'UI répond « Accès refusé » sur `/v1/items?action=delete` là où la production répond 200. L'outil de vérification ment, et il ment dans le sens fail-open.

**Les en-têtes entrants sont propagés en bloc.** `src/middleware/proxy.ts` fait `new Headers(c.req.raw.headers)` et ne supprime que `X-FGP-Key`, `X-FGP-Blob` et `host`. Partent donc vers l'upstream : `Authorization` et `Cookie` de l'appelant quand le mode d'auth ne les écrase pas, tous les en-têtes hop-by-hop (`Connection`, `Transfer-Encoding`, `TE`, `Upgrade`, `Proxy-*`), et les en-têtes de provenance forgés par l'appelant. Aucun scope ne contraint un en-tête. Corollaire côté logs : `extractClientIp` fait confiance à `X-Forwarded-For` sans notion de proxy amont de confiance, donc l'IP tronquée stockée dans les entries est une donnée falsifiable par celui-là même qu'elle est censée identifier.

**Les redirections sont suivies.** `fetch` suit les redirections par défaut (vérifié). Toute vérification faite sur l'hôte du `target` est donc contournable par un `302` : l'hôte validé redirige vers `169.254.169.254`, et les en-têtes d'authentification sont rejoués sur la destination finale. Aucune politique sur l'hôte n'a de sens tant que ce comportement reste.

### Ce qui manque n'est pas un correctif, c'est un contrat

Chacun de ces points peut se corriger isolément, et c'est précisément ce qu'il ne faut pas faire : sans contrat écrit, la prochaine évolution rouvrira un axe non couvert, exactement comme `apiUrl` (ADR-0008) a rouvert l'axe hôte six mois après l'écriture du forward. Cet ADR écrit donc d'abord la politique, ensuite les règles qui l'appliquent.

## Décision

### 1. La politique de sortie

FGP publie un contrat en quatre garanties et une liste explicite de non-garanties. Ce contrat vaut pour **tout appel réseau sortant émis par le processus FGP**, sans exception : forward du proxy, endpoints d'aide de l'UI, obtention de credentials upstream.

**Ce que FGP garantit.**

- **G1, destination.** Toute requête sortante vise un schéma `http` ou `https` et une adresse **publique**. Les plages loopback, privées, link-local, CGNAT, unique-local, multicast, réservées, ainsi que les noms internes conventionnels, sont refusées, que l'appelant les désigne par une IP littérale ou par un nom. FGP ne se laisse pas utiliser comme relais vers le réseau privé de son hébergeur.
- **G2, chemin.** Le chemin autorisé par les scopes est le chemin émis vers l'upstream, octet pour octet. Aucune forme décodée ou normalisée de ce chemin n'échappe au contrôle de scope. Cette garantie est indépendante du mode de livraison du blob.
- **G3, en-têtes.** L'authentification que voit l'upstream vient du blob, jamais de l'appelant. Aucun en-tête de contrôle du transport, d'authentification ou de provenance fourni par l'appelant n'atteint l'upstream.
- **G4, query.** Les paramètres de query sont soit contraints par le scope quand celui-ci le déclare, soit transmis librement, et l'outillage dit lequel des deux s'applique. Il n'existe aucun cas où l'interface affirme une contrainte que le proxy n'applique pas. Tant que `queryFilters` n'est pas livré (voir §4), le seul état atteignable est « transmis librement », et c'est dit comme tel.

**Ce que FGP ne garantit pas**, et qui doit être écrit dans les specs au même titre :

- FGP ne protège pas le créateur d'un blob contre le `target` public qu'il a lui-même choisi. Le blob est une délégation : celui qui le crée choisit sa cible. La politique protège l'hôte FGP et son réseau, pas l'utilisateur contre lui-même.
- FGP ne garantit pas l'absence de rebinding DNS. Voir les conséquences, c'est la limite structurelle de cette décision.
- FGP n'inspecte ni ne filtre le contenu des réponses upstream : jamais le status, jamais le body, jamais un en-tête métier de l'upstream. Il retire un nombre restreint d'en-têtes de transport : `Set-Cookie` et `Transfer-Encoding` toujours, `Content-Encoding` et `Content-Length` seulement quand le runtime a déjà décodé le corps avant FGP (ADR-0006, `docs/specs.md` §11.3).
- FGP n'est pas un WAF. Hors des filtres explicitement déclarés dans le scope, le contenu de la requête n'est pas examiné.
- FGP ne contraint aucun paramètre de query tant que la feature `queryFilters` n'est pas livrée. C'est une non-garantie datée, pas un oubli : la décision est prise en §4, son implémentation est différée pour une raison écrite.
- FGP ne limite ni le débit ni la taille des requêtes sur ses endpoints publics. Cet axe relève d'un lot distinct et reste, à ce jour, un risque assumé.

### 2. Hôte : refus par nature de l'adresse, pas par allowlist

FGP est API-agnostique par conception. Une allowlist d'hôtes cibles détruirait le produit, la décision est donc prise à l'envers : **tout hôte public est autorisé, toute destination non publique est refusée**, ce qui ne restreint aucun usage légitime du proxy.

La règle s'applique en trois temps.

1. **Forme, purement syntaxique et sans réseau.** Le `target` doit être une URL absolue de schéma `http` ou `https`, sans userinfo, sans query, sans fragment. Seuls l'origine et un chemin de base sont acceptés. Le chemin de base ne doit contenir ni `%2f`, ni `..`, ni `\`. Vérifié à la génération (400 `invalid_target`) et au déchiffrement du blob (blob malformé, donc 401 `invalid_credentials`).
2. **Adresse, après résolution.** Avant tout appel sortant, l'hôte de destination est classé. IP littérale : la classification porte sur elle, dans toutes les notations, la normalisation WHATWG ramenant déjà `2130706433` et `0x7f.0.0.1` à `127.0.0.1`. Nom : `Deno.resolveDns` en A et AAAA, et **toutes** les adresses retournées doivent être publiques. Sont refusés `0.0.0.0/8`, `10/8`, `100.64/10`, `127/8`, `169.254/16`, `172.16/12`, `192.0.0/24`, `192.168/16`, `198.18/15`, `224/4`, `240/4`, `255.255.255.255`, `::`, `::1`, `fc00::/7`, `fe80::/10`, `ff00::/8`, ainsi que toute forme IPv4-mapped ou IPv4-compatible de ce qui précède. Sont également refusés les noms se terminant par `.internal`, `.local`, `.localhost`, `.home.arpa`, et les noms sans point.
3. **Redirections non suivies.** Le forward passe en `redirect: "manual"`. Sans cela, la classification de l'étape 2 ne vaut rien : un hôte public autorisé redirige vers l'adresse de métadonnées et les en-têtes d'auth y sont rejoués.

Un échec de résolution DNS n'est **pas** un refus de politique : la requête continue et échoue naturellement en 502 `upstream_unreachable`. Fail-closed ici transformerait chaque incident DNS en refus opaque, sans rien apporter, puisqu'un nom qui ne résout pas ne joint rien.

Deux exceptions, toutes deux motivées.

- **`FGP_EGRESS_ALLOW_PRIVATE=1`** désactive l'étape 2, jamais l'étape 1 ni l'étape 3. **C'est un interrupteur de développement, et rien d'autre.** Il existe parce que le développement local et une partie de la suite de tests visent des cibles non publiques. La conséquence de le laisser actif en production doit être écrite partout où il est documenté, sans euphémisme : **G1 ne s'applique plus, et l'instance redevient exactement la SSRF non authentifiée que cet ADR corrige**, ouverte sur le réseau privé de l'hébergeur, y compris son service de métadonnées. Le serveur écrit un avertissement au démarrage quand il est actif.
- **Les valeurs d'origine opérateur** (`SCALINGO_API_URL`, `SCALINGO_AUTH_URL`) ne sont pas soumises à l'étape 2. Elles ne viennent pas d'un appelant, et les tests s'en servent pour pointer un mock local.

**Le champ `apiUrl` du mode `scalingo-addon` reçoit une contrainte plus forte** : son hôte doit se terminer par `.scalingo.com`. Ce n'est pas une entorse à l'agnosticisme : ce mode d'authentification est spécifique à Scalingo par construction (ADR-0008), et il présente un bearer de compte à l'hôte désigné. L'agnosticisme est une propriété de `target`, pas des modes d'auth propriétaires. La même règle s'applique au champ `target` de `/api/list-apps` et `/api/list-addons`, qui sont des helpers Scalingo déclarés comme tels.

### 3. Chemin : contrôle sur toutes les formes, émission de la forme brute

Les deux voies proposées par la review sont toutes deux perdantes, pour la même raison, et il faut le dire clairement.

- **Rejeter en 400 tout chemin contenant `%2f` ou `%5c`** casse des APIs légitimes et courantes. L'API GitLab identifie un projet par son chemin encodé (`/api/v4/projects/groupe%2Fprojet`). Artifactory, Nexus et toute API dont un identifiant contient un `/` font pareil. Un proxy agnostique qui refuse `%2F` n'est pas agnostique.
- **Décoder avant matching et forwarder la forme normalisée** casse les mêmes APIs, mais silencieusement et plus profondément : `/projects/groupe%2Fprojet` partirait en `/projects/groupe/projet`, une autre route. Cela modifie ce qui part vers l'upstream, donc contredit ADR-0006, pour un résultat faux.

**Décision retenue, troisième voie.** Le contrôle porte sur **toutes** les formes plausibles du chemin, l'émission porte sur la forme brute.

```
formeBrute      = le chemin tel que reçu, à l'octet près
formeCanonique  = décodage percent répété jusqu'au point fixe (3 tours max),
                  puis `\` remplacé par `/`,
                  puis slashes répétés écrasés,
                  puis résolution des segments `.` et `..` (RFC 3986)

accès autorisé  <=>  checkAccess(formeBrute) ET checkAccess(formeCanonique)
émission        =    formeBrute
```

Propriétés, dans l'ordre d'importance :

- **Monotone et fail-closed.** Ajouter une forme au jeu de vérification ne peut que réduire l'ensemble autorisé. La règle ne peut pas ouvrir un accès qui était fermé.
- **ADR-0006 intact.** Ce qui part sur le fil est inchangé, octet pour octet. Aucune renégociation de la transparence.
- **Agnosticisme préservé.** Le cas GitLab passe : brut `/api/v4/projects/groupe%2Fprojet`, canonique `/api/v4/projects/groupe/projet`, le scope `GET:/api/v4/projects/*` couvre les deux.
- **L'attaque tombe.** Brut `/v1/public/..%2f..%2fadmin`, canonique `/admin`, le scope `GET:/v1/public/*` ne couvre pas la seconde, donc 403 `scope_denied`.

Deux règles complètent la décision.

- **Un chemin contenant un octet NUL ou un caractère de contrôle après décodage est rejeté en 400 `invalid_request`.** Aucune API ne route là-dessus, et c'est un vecteur de troncature classique.
- **Le chemin cesse d'être reconstruit à partir des segments filtrés.** En mode URL, il est découpé du `pathname` brut après le premier segment. Les deux modes de livraison produisent alors la même chaîne pour la même requête. C'est la condition d'existence de G2.
- **L'URL sortante est construite avec l'API `URL`**, jamais par concaténation : origine et chemin de base issus du `target` validé, chemin proxy ajouté, query posée explicitement. La forme `target` avec fragment ou query ayant déjà été refusée à l'étape 1 de la politique hôte, cette construction est déterministe.

### 4. Query : un axe de contrainte dans `ScopeEntry`, décision prise, implémentation différée

**Décision : la query entre dans le modèle de scopes.** La déclarer non-goal est intenable, pour trois raisons.

1. **On ne déclare pas non-goal ce qui est déjà transmis et déjà silencieusement accepté par le langage de patterns.** Un utilisateur qui écrit `GET:/v1/items?safe=1` obtient aujourd'hui un scope mort sans le moindre signal. Un non-goal transformerait ce piège en règle, il ne le supprimerait pas.
2. **C'est le même argument que celui qui a justifié les body filters** (ADR-0004) : contraindre le contenu de ce qui est envoyé, pas seulement la route. Sur une API à dominante GET, la query **est** le corps de la requête. Être fine-grained sur le body d'un POST et grossier sur la query d'un GET est incohérent avec la promesse du produit.
3. **C'est là que vivent les paramètres destructeurs.** `?force=true`, `?recursive=true`, `?permanent=true`, `?scope=all`. Un token « lecture seule sur /v1/items » qui autorise `?action=delete` n'est pas un token de lecture seule.

**Forme retenue**, calquée sur les body filters pour ne rien inventer :

```typescript
interface QueryFilter {
  param: string;
  values: ObjectValue[];   // même union que les body filters
  required?: boolean;      // défaut false
}

interface ScopeEntry {
  methods: string[];
  pattern: string;
  bodyFilters?: BodyFilter[];
  queryFilters?: QueryFilter[];   // v5
}
```

Sémantique, en trois règles :

- **Opt-in.** Sans `queryFilters`, le comportement est celui d'aujourd'hui : la query passe librement. Aucun blob existant ne change de sens.
- **Déni par défaut à l'intérieur du scope.** Dès qu'un `ScopeEntry` porte des `queryFilters`, **tout paramètre présent dans la requête et non couvert par un filtre fait échouer ce scope**. C'est la seule sémantique qui protège réellement : autoriser l'inconnu reviendrait à demander à l'auteur d'énumérer les paramètres dangereux qu'il ne connaît pas.
- **Occurrences multiples.** Un paramètre répété n'est autorisé que si **chacune** de ses occurrences satisfait le filtre.

**Le pattern ne porte jamais la query.** Un `?` dans un `pattern` est refusé à la génération (400 `invalid_scope`). Le message dit que la query n'est pas contrainte par les scopes tant que la feature n'est pas livrée, et renverra vers `queryFilters` une fois qu'elle le sera. Au déchiffrement en revanche, un pattern portant un `?` reste accepté et simplement jamais matché : il ne peut rien autoriser, donc le refuser reviendrait à casser des blobs vivants sur leurs autres scopes pour un gain de sécurité nul. La règle générale est celle d'ADR-0006 appliquée à la validation : on refuse ce qui peut nuire, on ne casse pas ce qui est seulement inutile.

**Versionnement : `queryFilters` porte le blob en v5.** Un proxy antérieur ignorerait ce champ et servirait la requête sans la contrainte, ce qui est exactement le fail-open que cette décision supprime. Le bump n'est pas cosmétique, c'est lui qui rend le refus explicite. Il s'inscrit dans la règle multi-axes d'ADR-0008 : `auth` structuré donne v4, un `ScopeEntry` donne v3, des `queryFilters` donnent v5, on retient la plus haute.

**Périmètre d'implémentation : la décision est prise, son implémentation est différée.** `queryFilters` et le blob v5 partent en **feature séparée**, pas dans le lot de durcissement. La raison est de périmètre, pas de doute : deux vulnérabilités critiques sont en production sur une instance publique, le lot de sécurité doit partir vite, et un nouveau format de blob est une évolution produit qui allonge la review et élargit la surface de régression. Mélanger les deux ferait payer au correctif urgent le prix de la feature.

Le lot de sécurité prend donc, sur cet axe, le minimum qui ferme le mensonge sans toucher au format :

1. **Un `?` dans un `pattern` est refusé à la génération** (400 `invalid_scope`). Un scope syntaxiquement mort dont l'auteur croit qu'il contraint quelque chose est le pire des deux mondes, et le refuser ne demande aucun changement de format.
2. **La non-contrainte de la query est documentée explicitement**, dans les specs, dans le panneau Doc et dans `/llms.txt`, avec sa conséquence : un blob scopé `GET:/v1/items` autorise n'importe quelle query sur ce chemin.
3. **La fonction d'autorisation est unifiée** dès ce lot, avec dans son verdict la place de la query. C'est ce qui supprime la divergence entre le testeur et la production, et c'est aussi ce qui rend la feature `queryFilters` mécanique quand elle arrivera : un seul point à étendre.

Ce découpage n'annule rien de ce qui précède. La sémantique de déni par défaut, la forme du `QueryFilter` et le bump en v5 sont arbitrés ici et n'ont pas à être rejoués au moment de l'implémentation.

**Le testeur de scopes cesse de mentir**, quelle que soit la suite. La cause de son mensonge n'est pas son code, c'est qu'il possède sa propre lecture des scopes en parallèle de celle du proxy. Le correctif est structurel : **une seule fonction d'autorisation, exportée par `src/middleware/scopes.ts`, appelée par le proxy, par `/api/test-scope` et par le highlight client**. Elle prend le chemin brut avec sa query éventuelle, applique la règle des deux formes, et retourne un verdict dont un champ dit si la query est contrainte. Dans ce lot ce champ vaut toujours « non contrainte, transmise telle quelle », ce qui est déjà la fin du fail-open : l'UI affirmait un refus là où la production répond 200. La feature `queryFilters` se branchera sur ce même champ, sans nouveau point de décision. Trois lectures des scopes ne peuvent pas rester d'accord dans le temps, une seule ne peut pas diverger.

### 5. En-têtes entrants : denylist par classe

Une allowlist casserait l'agnosticisme aussi sûrement qu'une allowlist d'hôtes : `Accept`, `Range`, `If-None-Match`, `Idempotency-Key`, `X-GitHub-Api-Version` et l'infini des en-têtes propriétaires doivent passer. La décision est donc une **denylist par classe**, chaque classe justifiée par une propriété du produit, pas par une liste de CVE.

1. **Contrôle FGP** : `X-FGP-Key`, `X-FGP-Blob`, et tout en-tête préfixé `X-FGP-`. Ils appartiennent au protocole du proxy, pas à l'upstream.
2. **Hop-by-hop (RFC 9110 §7.6.1)** : `Connection` et tous les en-têtes qu'il nomme, `Keep-Alive`, `Proxy-Authenticate`, `Proxy-Authorization`, `Proxy-Connection`, `TE`, `Trailer`, `Transfer-Encoding`, `Upgrade`. Aucun proxy conforme ne les relaie. C'est aussi la matière première du request smuggling.
3. **Authentification de l'appelant** : `Authorization`, `Cookie`. C'est la classe qui porte la vraie décision. **La promesse de FGP est que l'appelant ne détient pas le credential de l'API cible.** Laisser l'appelant poser son propre `Authorization` sur une requête dont le mode d'auth ne l'écrase pas (mode `header:{name}`, mode `headers` multiples) permet d'atteindre l'upstream avec une identité que le blob n'a jamais accordée, sur une API qui accepte plusieurs schémas d'authentification. C'est une escalade de privilège qui contourne entièrement le modèle de scopes.
4. **Provenance** : `X-Forwarded-For`, `X-Forwarded-Host`, `X-Forwarded-Proto`, `X-Real-IP`, `Forwarded`. FGP n'en pose aucun et n'en relaie aucun. En relayer un forgé pollue les logs de l'upstream ; en poser un vrai divulguerait l'IP de l'appelant à la cible, ce qu'un proxy stateless n'a pas à faire sans qu'on le lui demande.
5. **`Host`**, déjà supprimé aujourd'hui, conservé.

L'ordre d'application reste celui de la spec §11.2 : les en-têtes d'auth issus du blob écrasent ceux de l'appelant, puis le strip transport passe en dernier et écrase tout.

**Cas `X-Forwarded-For` côté logs.** La règle est celle de tout proxy correct : ne jamais faire confiance à un en-tête de provenance sans savoir combien de sauts amont sont dignes de confiance. `FGP_TRUSTED_PROXY_HOPS`, entier, défaut `0`.

- `0` : `X-Forwarded-For` et `X-Real-IP` sont ignorés, l'IP vient de l'adresse du pair (`remoteAddr`).
- `n > 0` : l'IP retenue est la **n-ième en partant de la droite** de la liste `X-Forwarded-For`, jamais la première. La partie gauche de la liste est écrite par l'appelant, la partie droite par l'infrastructure.

Le défaut à `0` dégrade la précision des logs derrière un routeur mal déclaré. C'est le bon arbitrage : une IP fausse dans un journal est pire qu'une IP absente, parce qu'elle sera lue comme une preuve. Le champ est de toute façon déjà tronqué en /24 ou /48.

### 6. Un seul point de sortie

Toutes les règles ci-dessus vivent dans un module unique, `src/net/egress.ts`, et **tout appel `fetch` sortant du processus passe par lui**. C'est la partie de la décision qui empêche la prochaine régression : la revue d'une future PR n'a plus à se demander si un nouvel appel réseau est sûr, elle a à vérifier qu'il utilise le point de sortie. Les cinq appelants connus sont le forward du proxy, `/api/test-proxy`, `/api/list-apps`, `/api/list-addons` et `fetchAddonToken`.

## Options envisagées

### Hôte

#### Option A : allowlist d'hôtes cibles (rejetée)
- Avantages : protection totale et triviale à auditer.
- Inconvénients : détruit la raison d'être du produit. FGP existe pour se mettre devant n'importe quelle API. Une allowlist par instance transforme un proxy générique en passerelle configurée, et déplace le problème sur l'opérateur.

#### Option B : refus des destinations non publiques après résolution (retenue)
- Avantages : ne restreint aucun usage légitime, la classification est déterminée par la nature de l'adresse et non par une liste à maintenir, s'applique uniformément à tous les points de sortie.
- Inconvénients : nécessite une résolution DNS avant chaque forward, donc une latence et une dépendance à `Deno.resolveDns`. Ne ferme pas le rebinding DNS. Impose une échappatoire pour le développement local, donc une variable d'environnement qu'un opérateur peut activer par erreur.

#### Option C : isolation réseau au déploiement uniquement (rejetée comme mesure unique)
- Avantages : la seule défense réellement étanche, insensible au rebinding.
- Inconvénients : non portable, invérifiable par la CI, absente en développement, et laisse le code faux. Retenue en complément, jamais en remplacement : elle est documentée dans les guides de déploiement.

### Chemin

#### Option A : rejet en 400 des chemins contenant `%2f` ou `%5c` (rejetée)
- Avantages : trivial, une ligne, aucun risque de faux négatif.
- Inconvénients : casse les APIs qui encodent un `/` dans un identifiant de ressource, GitLab en tête. Un proxy agnostique ne peut pas interdire une construction d'URL parfaitement légale.

#### Option B : décodage avant matching et forward de la forme normalisée (rejetée)
- Avantages : une seule forme à raisonner, alignée sur ce que fait la majorité des upstreams.
- Inconvénients : change ce qui part sur le fil, donc rouvre ADR-0006 ; et surtout produit une requête différente de celle demandée sur toutes les APIs qui traitent `%2F` comme une donnée. Erreur silencieuse et non détectable côté FGP.

#### Option C : contrôle sur toutes les formes, émission de la forme brute (retenue)
- Avantages : fail-closed par construction, transparence intacte, agnosticisme préservé, s'étend naturellement à toute nouvelle forme d'obfuscation qu'on découvrirait plus tard, en l'ajoutant simplement au jeu de formes vérifiées.
- Inconvénients : un scope en correspondance exacte portant du percent-encoding doit désormais couvrir aussi la forme décodée. C'est le coût ergonomique de la décision, il est réel et concerne les scopes sans wildcard.

### Query

#### Option A : non-goal déclaré dans les specs (rejetée)
- Avantages : coût nul, aucune version de blob, aucune UI.
- Inconvénients : entérine une promesse fausse. Un produit qui vend du fine-grained et qui laisse `?action=delete` passer sur un scope de lecture ne tient pas sa promesse, l'écrire dans les specs ne la tient pas davantage. Et le piège du scope portant un `?` reste entier.

#### Option B : axe `queryFilters` sur `ScopeEntry`, opt-in, déni par défaut à l'intérieur du scope (retenue, implémentation différée en feature séparée)
- Avantages : réutilise `ObjectValue`, ses validations et ses limites, donc quasiment aucun code de matching nouveau ; opt-in, donc aucun blob existant ne change de sens ; comble le seul axe de la requête qui échappait au modèle.
- Inconvénients : troisième axe de version de blob, surface d'UI supplémentaire, et une sémantique de déni par défaut qui surprendra l'auteur qui ajoute un filtre en pensant n'ajouter qu'une contrainte.

#### Option C : contrainte de query dans le pattern, façon `GET:/v1/items?safe=1` (rejetée)
- Avantages : aucune nouvelle structure, écriture compacte.
- Inconvénients : le pattern deviendrait un mini-langage avec ses règles d'ordre, de répétition et d'échappement, à écrire et à documenter. Les body filters ont déjà tranché cette question dans l'autre sens (ADR-0004), et pour les mêmes raisons.

### En-têtes

#### Option A : allowlist d'en-têtes propageables (rejetée)
- Avantages : la plus sûre, aucune surprise.
- Inconvénients : incompatible avec l'agnosticisme. Il n'existe pas de liste finie d'en-têtes utiles à toutes les APIs.

#### Option B : denylist par classe (retenue)
- Avantages : chaque classe se justifie par une propriété du produit ou par la RFC, ce qui la rend défendable et extensible ; ne casse aucun usage applicatif.
- Inconvénients : les modes d'auth qui n'écrasent pas `Authorization` perdent la possibilité, aujourd'hui existante, de laisser passer celui de l'appelant. Changement cassant assumé, avec une porte de sortie déjà présente dans le produit.

#### Option C : rendre le filtrage des en-têtes configurable par scope (rejetée)
- Avantages : contrôle fin, cohérent avec l'esprit du produit.
- Inconvénients : quatrième axe de scope, quatrième version de blob, pour un besoin non exprimé. La denylist par classe couvre le risque identifié. À rouvrir seulement si un usage réel le demande.

## Conséquences

### Changements cassants

- **`Authorization` et `Cookie` de l'appelant ne sont plus transmis.** Une intégration qui s'appuyait sur ce passage doit désormais poser la valeur dans l'`AuthSpec` `headers` du blob (v4). La porte de sortie existe déjà, c'est précisément ce pour quoi ADR-0008 a été écrit.
- **Les redirections ne sont plus suivies.** Un `301` ou `302` upstream est désormais forwardé tel quel au client, avec son `Location` et `X-FGP-Source: upstream`. Les appelants qui comptaient sur la redirection silencieuse (typiquement un upstream qui redirige `/x` vers `/x/`) verront un 3xx. C'est plus transparent, pas moins : aujourd'hui le client reçoit un 200 provenant d'une URL qu'il n'a jamais demandée.
- **Les cibles non publiques cessent de fonctionner.** Une instance FGP utilisée pour joindre une API sur le réseau privé de l'opérateur doit passer par `FGP_EGRESS_ALLOW_PRIVATE=1`, avec l'exposition que cela implique.
- **Les blobs dont le `target` porte une query, un fragment ou un userinfo sont rejetés au déchiffrement.** Ils étaient de toute façon cassés : leur chemin scopé n'arrivait pas à l'upstream.
- **Certains scopes en correspondance exacte deviennent plus stricts.** Un scope `GET:/projects/groupe%2Fprojet` ne suffit plus seul, la forme décodée doit être couverte elle aussi.
- **Un `?` dans un pattern de scope est refusé à la génération.** Les formulaires qui en produisaient un obtenaient un scope mort, la contrainte qu'ils croyaient poser n'a jamais existé. Les blobs déjà en circulation qui en portent un ne sont pas invalidés, le pattern reste simplement sans effet.
- **Les logs perdent l'IP réelle derrière un routeur non déclaré**, jusqu'à ce que `FGP_TRUSTED_PROXY_HOPS` soit positionné.

### Coûts et dettes assumés

- **Le rebinding DNS reste ouvert.** Entre `Deno.resolveDns` et le `fetch`, le nom est résolu une seconde fois par le runtime, et rien ne garantit la même réponse. Un attaquant maîtrisant une zone DNS à TTL nul bascule la seconde réponse vers `169.254.169.254`. Ni `fetch` ni `Deno.createHttpClient` ne permettent d'épingler la connexion sur l'adresse validée. Fermer ce trou dans le code imposerait un client HTTP maison sur `Deno.connect`, avec TLS, SNI, streaming des corps et gestion des erreurs, soit une surface disproportionnée pour un proxy dont c'est le chemin critique. **La défense réelle contre le rebinding est le filtrage d'egress au niveau réseau, au déploiement.** La politique de code est un ralentisseur solide, elle n'est pas une preuve, et cet ADR refuse de laisser croire le contraire.
- **`FGP_EGRESS_ALLOW_PRIVATE` est un interrupteur de sécurité exposé à l'opérateur.** Il est nécessaire (développement local, suite de tests), il est dangereux (il désactive G1), et il n'existe pas de moyen de le rendre sûr. Il est journalisé bruyamment au démarrage.
- **L'axe query reste ouvert jusqu'à la livraison de `queryFilters`.** Entre ce lot et la feature, un blob scopé sur un chemin autorise toutes les querys de ce chemin, `?force=true` compris. Le lot de sécurité rend ce trou visible et cesse de mentir dessus, il ne le ferme pas. C'est un arbitrage de calendrier assumé, pas une réévaluation du risque.
- **`/api/test-proxy` reste un client HTTP ouvert sur l'internet public**, non authentifié, qui masque l'appelant derrière l'IP de l'instance. La politique de sortie supprime l'accès au réseau interne, elle ne supprime pas l'usage en relais d'abus. Ce résidu relève du lot anti-abus, il est nommé ici pour ne pas être oublié.
- **La latence du forward augmente d'une résolution DNS** quand le cache système ne répond pas. Un cache mémoire court, avec la même clé que la classification, est la première optimisation si le besoin se manifeste. Il n'est pas fait d'emblée : un cache de décision de sécurité est un objet à concevoir, pas à improviser.

### Bénéfices structurels

- **Un point de sortie unique.** La question « ce nouvel appel réseau est-il sûr » disparaît de la revue de code, remplacée par « passe-t-il par `egress.ts` », qui se vérifie mécaniquement.
- **Une seule fonction d'autorisation.** Le mensonge du testeur de scopes n'est pas corrigé, il devient impossible : proxy, endpoint de test et highlight client lisent le même code.
- **Le modèle de menace existe.** Les quatre garanties et les non-garanties donnent enfin un critère pour trancher les évolutions futures. `apiUrl` n'aurait pas pu être ajouté sans contrainte d'hôte si ce document avait existé lors de l'écriture d'ADR-0008.

## Liens

- ADR 0003 : proxy agnostique, scopes METHOD:PATH, dont cet ADR préserve la contrainte d'agnosticisme
- ADR 0004 : body filters et scopes structurés, dont l'axe `queryFilters` reprend la structure et les validations
- ADR 0005 : dual mode blob URL et header, dont cet ADR supprime la divergence de normalisation du chemin
- ADR 0006 : proxy transparent, dont la garantie d'émission brute du chemin est explicitement préservée
- ADR 0008 : `auth` structuré et blob v4, dont le champ `apiUrl` est le point de sortie non contrôlé qui a motivé la règle d'unicité du point de sortie
- RFC 9110 §7.6.1 : en-têtes hop-by-hop
- RFC 3986 §5.2.4 : résolution des segments `.` et `..`
- `docs/review/plan-politique-sortie.md` : plan d'implémentation ordonné de cette décision
