# ADR 0011 : Migration du runtime de Deno vers Node

- **Date** : 2026-11-19
- **Statut** : Accepted

## Contexte

### Les faits

Le 9 octobre 2026, l'équipe Deno a rejoint Cloudflare. Ce qui a été annoncé :

- **Deno Deploy ferme environ six mois plus tard, vers avril 2027.** La cible de sortie officielle proposée aux projets hébergés est Cloudflare Workers.
- **Le runtime reçoit encore un an de correctifs**, puis son développement s'arrête.
- **Le code reste open source.** Rien ne s'éteint du jour au lendemain, et un fork reste possible.

FGP se déployait sur trois cibles : Deno Deploy, que `docs/scalingo-deploy.md` présentait comme « le choix naturel », Scalingo via le buildpack community `betagouv/deno-buildpack`, et Docker depuis l'image `denoland/deno`. La première ferme. Les deux autres continuent de fonctionner sur un runtime qui cesse d'évoluer et dont la fin des correctifs de sécurité a une date connue.

### Ce qui est en jeu

FGP tourne en instance publique, sans authentification en amont du proxy, et son travail consiste à manipuler des secrets et à décider d'une destination réseau. Pour ce produit, un runtime sans correctifs de sécurité n'est pas une dette, c'est une date de péremption. La question n'est donc pas s'il faut partir, mais vers où, et quand : maintenant, avec le temps de vérifier chaque traduction, ou dans un an sous contrainte de calendrier.

## Décision

**Le runtime devient Node 26 LTS.** Les points suivants sont arrêtés et ne sont pas réouverts par cet ADR.

1. **Node 26 LTS, ESM pur, pnpm 10.** Pas de CommonJS, pas de double sortie de build.
2. **Hono est conservé**, servi par `@hono/node-server`. Le choix de framework de l'ADR-0001 tient, c'est son choix de runtime qui tombe.
3. **Web Crypto reste l'API de crypto.** Elle est native dans Node : `crypto.subtle`, `CompressionStream` et `DecompressionStream` sont présents, vérifié sur Node 26.10.0.
4. **`node:test` plus `tsx` remplacent `deno test`.** La suite reste écrite en TypeScript et s'exécute sans étape de compilation préalable.
5. **Biome remplace `deno lint` et `deno fmt`**, un seul outil pour les deux rôles.
6. **Bundle esbuild unique pour la production**, `dist/main.js`, lancé sous `node --permission`.
7. **Les imports relatifs gardent leur extension `.ts` explicite**, inchangés dans tout le dépôt : `tsconfig.json` porte `allowImportingTsExtensions`, `tsx` et esbuild les résolvent. Les réécrire en `.js` aurait été une passe mécanique sur plusieurs centaines de lignes, pour aucun gain et au prix d'un diff illisible.
8. **Cibles de déploiement : Scalingo par buildpack Node, et Docker.** Deno Deploy est abandonné.

### Node plutôt que Cloudflare Workers

La sortie officielle de Deno Deploy est Cloudflare Workers. Elle ne convient pas à ce produit, et la raison n'est pas une préférence : **FGP porte de l'état en mémoire dont dépend une fonctionnalité déjà livrée.**

- Le ring buffer par blob de la feature `/logs` (ADR-0007) est en mémoire par conception, et c'est une décision de confidentialité autant qu'une décision de stockage.
- Sa purge d'inactivité est un `setInterval` qui doit survivre entre deux requêtes.
- Le cache de dérivation PBKDF2 (ADR-0010, D8) n'a de valeur que partagé entre les requêtes.

Le modèle d'isolate de Workers ne garantit aucun des trois : isolates éphémères, état non partagé entre eux, pas de minuterie de fond entre deux requêtes. Porter `/logs` sur Workers imposerait un Durable Object ou un KV, c'est-à-dire du stockage, c'est-à-dire la négation du « zero storage » qui est l'argument du produit. Workers aurait donc été une seconde migration et pas celle-ci : réécriture de la feature logs et révision d'un engagement produit, en plus du changement de runtime.

**C'est un arbitrage, et il est pris comme tel.** Workers est écarté pour ce que son modèle d'exécution impose à ce produit, pas pour un défaut de la plateforme. Un FGP sans `/logs` et sans cache de dérivation y tiendrait sans difficulté.

## Options envisagées

### Option A : rester sur Deno
- Avantages : aucun travail immédiat, aucun risque de régression, un an de correctifs devant soi.
- Inconvénients : passé ce délai, un runtime figé sous un produit exposé. La migration se fera quand même, plus tard, sans marge pour la vérifier.

### Option B : Cloudflare Workers
- Avantages : cible de sortie officielle de Deno Deploy, portabilité de Hono déjà acquise, pas de serveur à exploiter.
- Inconvénients : le ring buffer de `/logs`, son `setInterval` de purge et le cache PBKDF2 ne survivent pas au modèle d'isolate. Impose une réécriture de la feature logs vers un stockage, contre l'engagement « zero storage ».

### Option C : Node 26 (retenue)
- Avantages : processus unique et durable, qui correspond exactement à l'état en mémoire du produit. Web Crypto native. Hono supporté par un adaptateur maintenu par ses auteurs. Buildpack Node officiel chez Scalingo, là où Deno dépendait d'un buildpack community. LTS avec un horizon long et plusieurs éditeurs derrière le runtime.
- Inconvénients : le modèle de permissions perd l'axe environnement (voir plus bas, c'est le coût principal). `node_modules` revient. Trois outils à remplacer : test, lint, format.

### Option D : Bun
- Avantages : compatibilité Node large, exécution TypeScript directe, Hono supporté, outillage intégré.
- Inconvénients : un seul éditeur derrière le runtime, donc exactement le profil de risque qu'on vient de subir. Pas de modèle de permissions. Pas de buildpack officiel chez Scalingo.

## Ce que la migration coûte

C'est la section qui compte dans cet ADR. Elle ne se lit pas comme une liste de détails d'implémentation.

### Le modèle de permissions perd l'axe environnement, et une mesure applicative en tient la place

Node 26 a un système de permissions, `node --permission`, et onze indicateurs d'autorisation : `--allow-fs-read`, `--allow-fs-write`, `--allow-fs-vfs`, `--allow-net`, `--allow-child-process`, `--allow-worker`, `--allow-addons`, `--allow-ffi`, `--allow-inspector`, `--allow-wasi`, `--allow-openssl-store`. **Aucun ne porte sur l'environnement.** Il n'existe pas de `--allow-env`, et il n'en existe pas d'équivalent sous un autre nom. Vérifié sur Node 26.10.0.

Conséquences, par ordre de gravité.

1. **Une dépendance compromise lisait les onze variables déclarées, elle lit maintenant tout `process.env`.** Le périmètre passe de « ce que l'allow-list autorise » à « tout ce que l'hôte injecte », `FGP_SALT` compris, et sur Scalingo cela englobe les variables que la plateforme pose elle-même. C'est la perte de sécurité réelle de cette migration, et le runtime n'offre aucune contre-mesure.
2. **L'allow-list des onze variables disparaît.** Elle vivait dans les six listes `--allow-env` de `deno.json`, dans le `Procfile` et dans le `Dockerfile`. Ces trois endroits n'ont plus d'objet.
3. **La garantie « un refus d'accès retombe sur le défaut sûr » devient sans objet.** Elle existait parce que `Deno.env.get` levait `NotCapable` sur un nom hors allow-list, et c'est précisément la panne de production du 14 septembre 2026. `process.env` ne refuse rien, donc le cas ne se produit plus. La garantie de défaut sur une variable réellement absente, elle, est inchangée et reste exigée.
4. **`--allow-net` de Node est global, là où Deno acceptait une liste d'hôtes.** Sans effet immédiat, le `Procfile` et le `Dockerfile` utilisaient déjà `--allow-net` nu. C'est la possibilité de resserrer un jour par hôte qui disparaît.

Ce qui survit du durcissement : `node --permission --allow-net --allow-fs-read=./static` conserve la restriction de lecture disque et le filtrage de la sortie réseau, et refuse par défaut les processus fils, les threads, les addons natifs et le FFI. Cette liste est **minimale et mesurée**, pas estimée : `./dist` et `./package.json` ne sont pas nécessaires, Node autorisant implicitement la lecture de son script d'entrée. Elle n'a tenu qu'au prix d'une correction du code, et c'est le précédent à retenir : `serveStatic` recevait `root: "./"`, hérité de l'adaptateur Deno, et l'adaptateur Node sonde ce root au montage, donc le serveur réclamait un droit de lecture sur la racine du dépôt, sources et `node_modules` comprises. La première réponse apportée avait été d'ouvrir la permission à `./`, avec un commentaire pour la justifier. **C'est l'inverse qu'il faut faire** : le root est passé à `./static`, et la permission est redevenue celle que Deno avait, `--allow-read=static`. Une permission qu'on élargit pour faire taire une erreur d'accès ne durcit plus rien.

**`lockdownEnv()` tient la place de l'allow-list, partiellement.** Puisque le runtime n'offre rien, la mesure est applicative : au démarrage du serveur, `src/main.ts` appelle `lockdownEnv()` (`src/env.ts`), qui retire de `process.env` tout nom absent de `ENV_NAMES` et de `HOST_ENV_NAMES`, cette dernière étant la liste nommée de ce que l'hôte et le runtime doivent garder (`PATH`, `HOME`, `TMPDIR`, les `NODE_*`, dont `NODE_EXTRA_CA_CERTS` sans lequel une sortie TLS cesse de valider). Sur un dyno Scalingo, elle retire 83 variables. Ce qu'elle rend : le point 1 ci-dessus cesse d'être vrai au-delà du chargement des modules, et le registre `ENV_NAMES` redevient un garde-fou d'exécution et non plus seulement de type.

Ses trois limites, à connaître avant de s'y fier, et aucune n'est contournable sans changer la structure du point d'entrée :

1. **Elle ne couvre pas les lectures faites au chargement des modules.** Les imports ESM sont évalués avant le corps de `main.ts`, donc avant l'appel. Une dépendance qui lit `process.env` à l'évaluation de son module a déjà lu. La mesure couvre tout ce qui se produit ensuite, c'est-à-dire le traitement des requêtes, où se situe une exfiltration qui cherche à rester discrète. Fermer ce trou demanderait un point d'entrée de production distinct de `src/main.ts`, qui purgerait avant d'importer l'application ; ce n'est pas fait, et c'est un choix réversible.
2. **Elle ampute l'environnement des processus fils.** Le serveur n'en lance aucun aujourd'hui, et les permissions les refusent de toute façon. Un futur appel à `child_process` les trouverait privés de tout ce qui n'est pas au registre.
3. **Elle n'est appelée que sous `import.meta.main`.** Les fichiers de test importent `src/main.ts` ; purger à l'import du module amputerait l'environnement du lanceur de tests. Le comportement du processus serveur et celui des tests diffèrent donc sur ce point, et c'est assumé.

### Le contrat d'ajout d'une variable passe de cinq endroits verrouillés à un seul couple

Le contrat en comptait cinq, verrouillés par le test de parité `tests/testu/env-registry.test.ts`, qui lit les fichiers réels : `ENV_NAMES`, les six listes de `deno.json`, le `Procfile`, le `Dockerfile`, `.env.example`. Trois disparaissent avec les allow-lists. **Il reste `ENV_NAMES` face à `.env.example`**, et c'est tout ce qu'un test peut encore vérifier.

Ce n'est pas une simplification, c'est une perte de filet. Avant, oublier une variable à un endroit faisait échouer la pipeline. Maintenant il n'y a plus d'oubli qui casse : une variable lue sans être déclarée nulle part fonctionne en local, et manque en production sans que rien ne l'ait signalé en amont. La discipline revient sur `ENV_NAMES`, qui reste la source de vérité des noms lus par le serveur, et sur la revue pour les guides de déploiement, que `docs/scalingo-deploy.md` dit désormais explicitement. `lockdownEnv()` en récupère une part : une variable positionnée en production mais oubliée dans `ENV_NAMES` est effacée au démarrage, donc elle manque bruyamment plutôt que de fonctionner par accident.

### Les tests perdent la détection de fuites

`deno test` fermait chaque test sur deux vérifications, `sanitizeOps` et `sanitizeResources` : une opération asynchrone pendante ou une ressource non fermée faisait échouer le test qui l'avait laissée. **`node:test` n'a pas d'équivalent.** Un `setInterval` oublié ou un flux non clos ne fait plus échouer de test. Pour un produit dont la feature logs tient sur un intervalle de purge et sur des flux SSE de longue durée, c'est la perte la plus concrète côté qualité, et elle retombe sur la revue.

### Quatre écarts de comportement imposés par le runtime

Aucun n'a été choisi. Tous ont été mesurés pendant la migration, et trois ont demandé une correction du code.

1. **Le runtime décode plus d'encodages que Deno.** Deno décodait `gzip` et `br` à la réception du `fetch` ; Node 26.10 décode en plus `x-gzip`, `deflate` et `zstd`. La liste `RUNTIME_DECODED_ENCODINGS` de `src/middleware/proxy.ts` conditionne le retrait de `Content-Encoding` et `Content-Length` : calibrée sur Deno, elle laissait repartir une réponse `deflate` ou `zstd` décodée mais toujours annoncée compressée, avec un `Content-Length` périmé, soit exactement la panne client que l'ADR-0006 cherche à éviter. Recalibrée sur une mesure du runtime. **Cette liste est une mesure, pas une préférence** : elle se vérifie à chaque montée de version de Node.
2. **Rien ne désactive plus le décodage, et un 206 compressé est vidé.** Sous Deno, un `Range` ou un `Accept-Encoding: identity` sur la requête sortante faisait ressortir le corps réellement compressé, et le code en dépendait pour savoir quand les en-têtes amont étaient exacts. Sous Node, les deux décodent quand même, et ce code a disparu. Conséquence qu'aucune correction de notre côté ne peut rattraper : une réponse 206 portant un fragment de corps compressé ressort avec un corps vide, là où Deno relayait le fragment intact. C'est une perte de données silencieuse, rare puisqu'un amont compresse rarement un 206, et elle est documentée ici faute de pouvoir être corrigée.
3. **`cancel()` sur une branche de `tee()` ne résout qu'une fois les deux branches annulées.** Le lecteur borné de `src/middleware/proxy.ts` lit une branche issue de `c.req.raw.clone()` et l'annulait avec `await` au dépassement du plafond. C'est le comportement spécifié par WHATWG, et Deno était permissif : sous Node, cet `await` suspendait le flux proxy indéfiniment au lieu de rendre le 413 `payload_too_large`. Deux tests ne se terminaient jamais. La promesse n'est plus attendue.
4. **Un `setInterval` au niveau module empêche tout processus de test de se terminer.** L'intervalle de purge de `src/main.ts` tenait la boucle d'événements ouverte dans chacun des fichiers de test qui importent l'application, et `pnpm test` ne rendait pas la main même tous tests verts. Résolu par `.unref()`, sans effet en production où le serveur en écoute suffit à tenir le processus. C'est précisément le genre de défaut que `sanitizeOps` signalait et que `node:test` ne signale plus, découvert ici parce qu'il bloquait, pas parce qu'un test l'a dit.

## Ce que la migration gagne

Deux choses, et pas plus.

**Chaque fichier de test tourne dans son propre processus.** `deno test` partageait un processus unique pour tout le run, ce qui rendait l'état global observable d'un fichier à l'autre. Le commentaire en tête de `src/env.ts` en porte la trace : aucune mémoïsation n'y est permise, parce que des fichiers de test basculent `FGP_EGRESS_ALLOW_PRIVATE` dans ce processus partagé et qu'un cache ferait dépendre le résultat de l'ordre d'exécution. `node:test` isole par fichier, et cette classe de dépendance à l'ordre disparaît. Ce que l'isolation permettrait de reconsidérer dans `src/env.ts` n'est pas tranché ici : une mémoïsation serait un changement de comportement, et cette migration n'en fait aucun.

**Un écosystème qui n'a pas de date de fin.** Il n'y a pas de gain technique à inventer au delà : le bénéfice est la disparition de la péremption, pas une amélioration du produit.

## Ce que la migration ne change pas

C'est l'engagement du produit, et il est entier.

- **Web Crypto reste l'API de crypto.** AES-256-GCM, PBKDF2, 100 000 itérations, même dérivation, même salt serveur.
- **Le format des blobs v2 à v5 reste déchiffrable à l'identique.** Aucun blob en circulation n'est invalidé, aucune régénération n'est nécessaire.
- **La politique de sortie de l'ADR-0009 est inchangée** : point de sortie unique, destination publique obligatoire, chemin contrôlé sur ses deux formes et émis en brut, authentification issue du blob et jamais de l'appelant, `redirect: "manual"` partout.
- **Les limites de l'ADR-0010 sont inchangées**, plafonds et critère de dimensionnement compris.
- **Le proxy reste transparent au sens de l'ADR-0006** : status et corps amont jamais transformés, `X-FGP-Source` sur chaque réponse.
- **Aucun comportement observable du produit ne bouge.** Un appelant qui consomme une URL FGP ne peut pas constater que le runtime a changé.

## Conséquences

- **`docs/deno-deploy.md` est supprimé.** `docs/scalingo-deploy.md` devient le guide de déploiement principal, réécrit pour le buildpack Node, et Docker reste la seconde cible.
- **Le script `build` doit produire le bundle serveur.** Le buildpack Node de Scalingo n'exécute que `build`, et le `Procfile` lance `dist/main.js`. Si `build:server` sort de `build`, le dyno démarre sans bundle, et il ne peut pas le fabriquer au lancement puisque les `devDependencies` sont élaguées après la phase de build. C'est une contrainte de la plateforme, pas une préférence de pipeline.
- **Les commandes de travail changent toutes.** Les `deno task` deviennent des scripts npm, listés dans `package.json` et dans le README. Les fichiers `deno.json`, `deno.lock` et `deno.client.json` cèdent la place à `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `tsconfig.client.json` et `biome.json`.
- **La classification de destination passe de `Deno.resolveDns` à la résolution de `node:dns`.** La politique est identique, la primitive change. Le rebinding DNS reste ouvert exactement comme l'ADR-0009 le documente, et pour la même raison : rien ne permet d'épingler la connexion sur l'adresse validée.
- **L'ADR-0001 est partiellement remplacé** par celui-ci. Son choix de framework et de crypto tient, son choix de runtime tombe, et son affirmation « pas de compatibilité Node nécessaire » est désormais fausse.
- **L'argument de portabilité de la décision D9 de l'ADR-0010 ne tient plus.** La limitation de débit avait été écartée de l'application parce qu'un limiteur en mémoire est inopérant sur Deno Deploy, où l'état est par isolate. Cette cible disparaît, et les deux qui restent ont un processus unique et durable, où un limiteur fonctionnerait réellement. **D9 n'est pas réouverte ici**, mais son argument doit être réexaminé pour lui-même plutôt que reconduit par habitude.

## Liens

- ADR-0001 : stack Hono sur Deno avec Web Crypto, partiellement remplacé par celui-ci
- ADR-0006 : proxy transparent, préservé sans changement
- ADR-0007 : logs stream in-memory, dont l'état en mémoire est l'argument décisif contre Workers
- ADR-0009 : politique de sortie du proxy, préservée sans changement
- ADR-0010 : politique de limites de ressources, préservée sans changement, dont D9 perd son argument de portabilité
- `docs/scalingo-deploy.md` : guide de déploiement principal
- [Modèle de permissions de Node.js](https://nodejs.org/api/permissions.html)
- [Adaptateur Node.js de Hono](https://github.com/honojs/node-server)
- [Biome](https://biomejs.dev/)
