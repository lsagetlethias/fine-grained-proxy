# Review de la migration Deno vers Node (PR 35)

Review adversariale du diff de migration, lancée après que CodeRabbit a sauté la PR (161
fichiers pour une limite de 100). Cinq relecteurs en parallèle sur des dimensions disjointes,
chacun plafonné à six findings, puis les quatre findings les plus graves soumis à un réfuteur
dédié. Neuf agents, 26 findings bruts.

Le mandat était adversarial : chercher où l'engagement « aucun comportement observable ne
change » est faux, et traiter les affirmations du code, des commentaires et de l'ADR comme
des choses à remesurer. Un finding n'était accepté qu'avec une commande rejouable ou une
comparaison avant/après à l'appui.

## Ce que la review a trouvé et qui est corrigé

**Toute requête à corps rendait 502** (`16b1933`). `undici` refuse par `TypeError` un corps
qui est un flux tant que `duplex: "half"` n'est pas déclaré, et `@hono/node-server` fait du
corps entrant un flux pour toute méthode autre que GET, HEAD et TRACE, même sans corps. POST,
PUT, PATCH, DELETE et OPTIONS échouaient donc avant d'ouvrir un socket, et la `TypeError`
ressortait en `upstream_unreachable`, imputée à l'API cible. Les body filters v3 étaient
intégralement morts. Le code de forward n'avait pas changé d'un caractère : le runtime sous
lui, oui. Confirmé par réfutation sur quatre angles, puis reproduit à la main sur le bundle de
production. `tests/teste2e/proxy-forward.test.ts` est désormais le seul test qui laisse sortir
un vrai `fetch` vers un vrai socket, à travers `serve()`.

**`Content-Range` survivait au décodage** (`ac40d04`). Il décrit des offsets du flux
compressé ; relayé après décodage, il fait reconstruire un fichier faux à un client qui
télécharge par morceaux, sans erreur pour le signaler. Mesure : 72 octets livrés pour un
`Content-Range` annonçant 31 octets au total. Il tombe maintenant avec `Content-Encoding` et
`Content-Length`.

**La description du 206 était fausse** dans l'ADR-0011, `CLAUDE.md` et `ACTIVITY.md`, qui
annonçaient un corps vide. La mesure donne pire : un fragment de flux compressé est inflaté en
clair partiel plausible, proportionnel au fragment, que rien ne distingue d'une réponse
légitime. Un corps vide, tout client le détecte. Les trois documents disent désormais ce qui
est mesuré.

## Findings majeurs non traités, qui demandent un arbitrage

1. **`biome lint` ne peut plus échouer.** Il sort 0 avec 16 avertissements et 37 informations,
   là où les règles `recommended` de `deno lint` étaient des erreurs. L'étage lint de `verify`
   est donc un garde qui ne mord pas. Vérifié : `--error-on-warnings` sort 1. Activer le drapeau
   impose de traiter 12 `noNonNullAssertion`, 2 `useImportType`, 1 `noPrototypeBuiltins` et
   1 `useOptionalChain`, dont les premiers demandent de vraies modifications de code.
2. **`src/net/egress.ts`, le `catch` d'`egressFetch` habille une erreur locale en panne de
   l'amont.** C'est précisément ce qui a rendu le bloquant `duplex` illisible : une `TypeError`
   de programmation est ressortie en `upstream_unreachable`. Le projet a déjà une règle contre
   les `catch` nus pour cette raison exacte, et elle ne protège pas ce cas.
3. **Aucun test ne laissait sortir un vrai `fetch`** : 31 fichiers d'intégration remplacent
   `globalThis.fetch` (224 occurrences) et les tests appellent `app.fetch`, jamais `serve()`.
   Le test e2e ajouté couvre le forward ; la classe entière de défauts de runtime reste sinon
   invisible.
4. **Aucune étape avant la production n'exerce le modèle de permissions.** `verify` ne lance
   jamais le serveur sous `node --permission`, donc un refus d'accès sur un chemin rare (flux
   SSE de `/logs/stream`, `/api/docs`, gros corps) ne se verrait qu'en production.
5. **Le périmètre de Biome** mord sur `.claude` et sur les worktrees voisins.
6. **Le câblage de `lockdownEnv()` dans `src/main.ts` n'est couvert par aucun test**, alors
   qu'il remplace seul l'allow-list `--allow-env`. La fonction est testée, son appel non.
7. **La suppression de `tests/testi/env-denied.test.ts` a emporté deux garanties** qui ne
   dépendaient pas du modèle de permissions de Deno.
8. **`docs/scalingo-deploy.md` est faux sur deux points** : il nomme un script `build:prod`
   qui n'existe plus, et imprime un `Procfile` avec `--allow-fs-read=./dist` qui ne correspond
   à aucun fichier du dépôt.
9. **Le chiffre de 83 variables retirées par `lockdownEnv()`** dans l'ADR-0011 est celui de la
   machine de développement. Le conteneur en retire 3. Aucun dyno n'a été mesuré.

## Findings mineurs, groupés

`src/ui/layout.tsx` donne encore l'instance Deno Deploy comme URL canonique du produit.
`tests/_globals.d.ts` remet `Response.json()` à `any` sur tout `src/`, y compris là où la
migration avait ajouté des casts. Aucun `--test-timeout` : les deux classes de pannes que la
migration a rencontrées font pendre la suite au vert. Le commentaire de `src/env.ts` justifie
l'interdiction de mémoïser par un processus de test partagé que `node:test` n'a plus.
`ACTIVITY.md` annonce 848 sites `Deno.test` quand le dépôt en portait 870. L'ADR surévalue la
perte des sanitizers, les tests qu'il cite les avaient déjà coupés. `presentation/` est sorti
du lint et du format alors que la migration l'a réécrit, et y déclare `pnpm@11.5.1` face à
`pnpm@10.24.0` à la racine. Le `Dockerfile` va chercher `corepack@latest`. L'étape CI
« Build assets » lance aussi le bundle serveur. `src/crypto/base64url.ts` manque à la section
Structure de `CLAUDE.md`. `static/version.txt` porte un commit antérieur à la migration.
Deux en-têtes que Deno n'envoyait pas partent vers l'amont, `sec-fetch-mode: cors` et
`connection: keep-alive` (ramené de majeur à mineur par réfutation).

## Ce que la review n'a pas couvert

Rien de ce qui suit n'a été mesuré, et chaque point est un trou connu plutôt qu'un verdict.

Le comportement sur un dyno Scalingo réel : variables effectivement retirées, disponibilité de
Node 26 sur le buildpack, élagage des `devDependencies`. La parité de `src/crypto/base64url.ts`
contre la vraie source de `@std/encoding@1.0.11`, faute de pouvoir exécuter le paquet jsr ici ;
la comparaison a porté sur son comportement documenté. Les deux modes d'auth Scalingo contre
une vraie API. Le rebinding DNS entre `assertPublicHost` et l'ouverture de la connexion, et
l'écart entre la classification par `resolve4` et la connexion par `getaddrinfo`, qui lit
`/etc/hosts`. Un relecteur signale enfin que sous Linux, `unsetenv` ne réécrit pas le bloc
`environ` initial, donc les secrets purgés par `lockdownEnv()` resteraient probablement
lisibles dans `/proc/self/environ` : si cela se confirme, la mesure perd l'essentiel de sa
valeur contre une dépendance compromise.

Enfin, le plafond de six findings par dimension a écarté sept points mineurs nommés par leurs
auteurs, et seuls quatre findings sur 26 ont reçu un second regard adversarial. Les 22 autres
tiennent sur la preuve de leur auteur, pas sur une réfutation.
