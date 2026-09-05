# Matrice de couverture AC vers tests : lot de securite (AC-43 a AC-50) et v5 (AC-51 a AC-57)

**Date** : 2026-09-05 (mise a jour ; releve initial du 2026-09-04)
**Ref AC** : `docs/acceptance-criteria.md` v5.0, series AC-43 a AC-57
**Ref sources** : `docs/adr/0009-politique-de-sortie-du-proxy.md`, `docs/adr/0010-politique-limites-ressources.md`, `docs/specs.md` §18
**Ref challenge v5** : `docs/review/challenge-query-filters-v5.md`
**Suite** : `deno task verify` vert, **844 tests passes, 0 echec** (827 au releve du lot de securite, 828 avant l'audit v5 du 2026-09-05)

La matrice du lot v4 (`ac-coverage-v4.md`, series AC-34 a AC-42) garde sa valeur pour son propre perimetre et n'est pas reecrite : c'est le releve date d'un lot livre.

## Etat au 2026-09-05

Le releve du 2026-09-04 comptait **20 trous sur 102** pour un lot de securite livre et declare vert. Quatre ont ete combles dans les livraisons suivantes (AC-43.18, AC-44.9, AC-45.4, AC-47.8), les seize autres dans la passe du 2026-09-05, plus deux criteres qui n'etaient nommes que par le decompte des series (AC-45.10 et AC-46.6) et le critere de non-propriete AC-50.9, jusqu'ici classe non testable.

**Il reste un ecart, et un seul : AC-47.10, en PARTIEL.** Il n'est pas un trou de couverture mais un ecart entre le critere ecrit et l'implementation, detaille plus bas. Il appelle un arbitrage, pas un test.

| Serie | Criteres | OK | PARTIEL | TROU |
|-------|----------|----|---------|------|
| AC-43, destination (G1) | 24 | 24 | 0 | 0 |
| AC-44, chemin (G2) | 13 | 13 | 0 | 0 |
| AC-45, en-tetes (G3) | 14 | 14 | 0 | 0 |
| AC-46, query non contrainte (G4) | 6 | 6 | 0 | 0 |
| AC-47, corps et decompression | 10 | 9 | 1 | 0 |
| AC-48, regex et denombrement | 20 | 20 | 0 | 0 |
| AC-49, surface d'API | 4 | 4 | 0 | 0 |
| AC-50, derivation et cache | 11 | 11 | 0 | 0 |
| **Total lot securite** | **102** | **101** | **1** | **0** |

**La serie v5 a ete auditee le 2026-09-05**, sur le meme protocole, et son releve est plus bas. Le chiffre du 2026-09-04 (4 OK, 82 TROU) decrivait un contrat non encore implemente et n'a pas ete reconduit.

## Methode, et pourquoi elle compte ici

Les series AC-43 a AC-50 ont ete **backfillees apres coup**, le lot de securite ayant ete livre sans criteres ecrits. Elles sont reconstituees **depuis les ADR et `docs/specs.md` §18, jamais depuis les tests**. C'est la contrainte qui donne sa valeur a ce document : rediger les criteres d'apres l'implementation aurait produit une matrice tautologiquement complete, ou chaque test trouve son critere parce que le critere a ete ecrit pour lui.

**Chaque test ecrit pour combler un trou a ete verifie en deux etats** : vert sur le code livre, rouge apres retrait ou inversion de la garde qu'il protege. Ce protocole n'est pas de la ceinture et bretelles, il a change trois conclusions dans cette seule passe :

- **AC-46.6** devait s'appuyer sur la presence du marqueur `path_encoded` dans le bundle navigateur. Sous mutation, le marqueur **reste present** : il vit dans une table de rangs partagee avec `checkAccess`. Le test aurait ete vert sur exactement le code qu'il pretend interdire. Le marqueur retenu est `decodeURIComponent`, qui disparait bien du bundle des que `checkRequestAccess` n'est plus atteignable depuis l'entree.
- **AC-50.7 et AC-50.8** portent sur un refus qui **reste un 401 `invalid_credentials` avec ou sans la garde** : sans pre-validation, le dechiffrement echoue et produit le meme code. Seul le compteur de derivations distingue les deux etats. Un test qui aurait asserte le statut aurait ete vert sur une instance payant 11,60 ms par sonde malformee.
- **AC-45.10** et **AC-48.15** sont chacun le seul test de leur famille a tomber sous leur mutation : les neuf autres tests AC-45 restent verts quand on inverse l'ordre des passes d'en-tetes, et AC-48.11 reste vert quand on rend le budget de regex local a chaque filtre.

## Legende

- **OK** : critere couvert par au moins un test vert, dont la morsure a ete verifiee
- **PARTIEL** : couvert sur une partie de son enonce seulement
- **TROU** : aucun test, la decision est implementee mais rien ne la protege

---

## Le seul ecart restant

**AC-47.10, les refus de taille sont des reponses FGP, pas des reponses upstream.** PARTIEL, et ce n'est pas un trou de couverture.

Le critere demande que « un `413` et un `400` produits par ces plafonds » portent `X-FGP-Source: proxy` et la shape `{error, message}`. Mesure sur le code livre :

| Reponse | Statut | `X-FGP-Source` |
|---------|--------|----------------|
| `/api/generate`, corps au-dela de 64 Ko | 413 | `proxy` |
| `/api/decode`, corps au-dela de 8 Ko | 413 | `proxy` |
| `/api/share/decode`, `encoded` de plus de 8 192 caracteres | 400 | **absent** |

Les 413 le portent parce qu'`apiBodyLimit` le pose explicitement dans son `onError`. Le 400 sort du handler par `c.json({ error, message }, 400)` de `src/routes/ui.tsx`, qui ne pose pas l'en-tete, et il n'est pas seul dans ce cas : aucun 400 de validation des routes `/api/*` ne le porte.

**Ce n'est pas tranchable par le testeur.** Deux lectures se defendent. Soit `X-FGP-Source` est le discriminant du proxy transparent et n'a rien a faire sur les routes `/api/*`, auquel cas c'est mon critere qui sur-promet et il faut le restreindre aux 413. Soit c'est la marque de provenance de toute reponse FGP, auquel cas c'est l'implementation qui est incomplete, sur une surface bien plus large que ce seul 400. Le test livre couvre les 413 et nomme explicitement la moitie qu'il ne couvre pas ; aucun test rouge n'a ete laisse et `src/` n'a pas ete touche.

---

## Deux criteres corriges, l'implementation avait raison

Deux trous se sont reveles etre des erreurs de redaction de ma part au moment du backfill, pas des defauts du code. Les criteres ont ete corriges dans `docs/acceptance-criteria.md` et testes dans leur forme corrigee.

**AC-43.22** disait « les valeurs d'origine operateur ne sont pas soumises au classement d'adresse », et donnait pour attendu qu'un `SCALINGO_AUTH_URL` pointant un mock local aboutisse. Mesure : il est refuse en `Target host is not public`. L'exemption portee par `isOperatorScalingoUrl` couvre **la contrainte de domaine Scalingo**, jamais la classification d'adresse, et c'est le bon choix : une exemption par provenance dans `egressFetch` cesserait d'en faire un point de sortie unique, ce qui est precisement la forme de trou que l'ADR-0009 §6 ferme. C'est aussi pourquoi `tests/testu/auth/client.test.ts` pose `FGP_EGRESS_ALLOW_PRIVATE=1` pour viser ses mocks, detail qui aurait du me mettre la puce a l'oreille a la redaction.

**AC-43.21** disait « signale bruyamment au demarrage ». L'avertissement est ecrit au premier controle de destination, choix delibere et deja documente dans `CLAUDE.md` : une instance qui n'a encore rien proxyfie n'a encore rien expose.

---

## Correspondance test vers critere du registre

La numerotation des tests existants ne correspond pas a celle du registre, contradiction creee par le backfill et arbitree le 2026-09-04 : je ne renomme pas les tests preexistants, et cette table est la specification du renommage, a traiter en tache mecanique separee. Les tests ecrits depuis suivent la convention `AC-XX.Y (registre v5)` **quand le numero nu est deja porte par un test couvrant autre chose**, et le numero nu sinon.

### Tests ecrits pour combler les trous

| Test | Fichier | Critere |
|------|---------|---------|
| `AC-43.17: RECENSEMENT...` et `AC-43.17 bis: TEMOIN...` | `tests/testi/egress-census.test.ts` | AC-43.17 |
| `AC-43.21 (registre v5)` et son `bis` | `tests/testu/net/egress-warning.test.ts` | AC-43.21 |
| `AC-43.22 (registre v5)` | `tests/testi/egress-census.test.ts` | AC-43.22 |
| `AC-44.10` | `tests/testu/middleware/scopes-path-encoding.test.ts` | AC-44.10 |
| `AC-44.11` | `tests/testu/middleware/scopes-path-encoding.test.ts` | AC-44.11 |
| `AC-44.12` | `tests/testu/net/egress.test.ts` | AC-44.12 |
| `AC-45.10 (registre v5)` | `tests/testi/proxy-headers-policy.test.ts` | AC-45.10 |
| `AC-46.2: PARITE...` | `tests/testi/scope-verdict-parity.test.ts` | AC-46.2 |
| `AC-46.4 (registre v5)` | `tests/testi/scope-verdict-parity.test.ts` | AC-46.4 |
| `AC-46.6: STRUCTUREL...` | `tests/testu/ui/scope-verdict-bundle.test.ts` | AC-46.6 |
| `AC-47.2 (registre v5)` | `tests/testi/api-edge-cases.test.ts` | AC-47.2 |
| `AC-47.7` | `tests/testi/proxy-body-read.test.ts` | AC-47.7 |
| `AC-47.10` | `tests/testi/api-edge-cases.test.ts` | AC-47.10, moitie 413 |
| `AC-48.15 (registre v5)` | `tests/testu/crypto/blob-validation.test.ts` | AC-48.15 |
| `AC-49.3 (registre v5)` | `tests/testi/scope-verdict-parity.test.ts` | AC-49.3 |
| `AC-49.3 (registre v5) bis` | `tests/testu/ui/scope-verdict-bundle.test.ts` | AC-49.3 |
| `AC-50.5 (registre v5)` | `tests/testu/crypto/key-cache.test.ts` | AC-50.5 |
| `AC-50.6` | `tests/testu/crypto/key-cache.test.ts` | AC-50.6 |
| `AC-50.7`, `AC-50.8`, `AC-50.9` | `tests/testi/proxy-prevalidation.test.ts` | AC-50.7, AC-50.8, AC-50.9 |
| `AC-50.10` | `tests/testi/purge-timer.test.ts` | AC-50.10 |
| `AC-50.11` | `tests/testu/crypto/key-cache.test.ts` | AC-50.11 |

### Tests preexistants dont le numero designe un autre critere

| Test | Serie ou il vit | Critere qu'il couvre reellement |
|------|-----------------|----------------------------------|
| `AC-43.8 buildUpstreamUrl : le chemin proxy ne peut pas etre avale` | AC-43 | AC-44.13 |
| `AC-43.21: le refus de scope precede le refus de destination` | AC-43 | AC-43.24 |
| `AC-43.22: une redirection amont remonte telle quelle` | AC-43 | AC-43.16 |
| `AC-45.4: les en-tetes de provenance ne sont pas transmis` | AC-45 | AC-45.5 |
| `AC-45.10: a 1 saut avec une liste d'un seul element forge` | AC-45 | AC-45.13 |
| `AC-46.4: POST /api/generate refuse un scope portant une query` | AC-46 | AC-46.3 |
| `AC-47.5: INVARIANT structurel, le plafond de corps n'est monte que sous /api/` | AC-47 | **AC-47.6** |
| `AC-48.15: une regex hors dialecte est refusee avec un code dedie` | AC-48 | AC-48.17 |
| `AC-49.3: /api/test-proxy refuse un motif catastrophique sans l'evaluer` | AC-49 | AC-48.19 |
| `AC-50.5: une requete proxy avec logs detailed ne derive la cle qu'une fois` | AC-50 | AC-50.1 |
| `AC-5.17 bis` et `AC-5.17 ter` | AC-5 | AC-48.10 et AC-48.11 |
| `AC-9.2: Host header is stripped before forwarding` | AC-9 | AC-45.7 |
| `AC-9.3: query string is forwarded to target` | AC-9 | AC-46.5 |
| `AC-19.4` et `AC-19.5`, troncature de l'IP | AC-19 | AC-45.14 |

**AC-47.6 etait declare trou a tort dans le releve du 2026-09-04.** Le test de recensement des routes ajoute avec la declaration du 413 dans l'OpenAPI le couvre exactement : il enumere les montages reels de `bodyLimit` depuis `app.routes` et exige que chacun soit sous `/api/`. Aucun doublon n'a ete ecrit.

---

## Ce qui a resiste, et pourquoi

Trois criteres ne se testent pas par la voie qu'on prendrait naturellement. Le contournement retenu est note ici pour que personne ne le redecouvre.

**Le timer de purge (AC-50.10).** Il est enregistre au chargement de `src/main.ts`, deja evalue par les autres fichiers de test du meme processus. Un `import()` dynamique donnerait bien une instance neuve, mais il se resout a l'execution et exige une permission de lecture sur `src/` que les taches de test n'accordent pas, a dessein. Le montage retenu est un import **statique** suffixe (`src/main.ts?purge-timer`), precede d'un module qui pose un espion sur `setInterval` : cle de module distincte donc reevaluation, resolution statique donc aucune permission supplementaire.

**Le testeur de scopes du navigateur (AC-46.6, AC-49.3).** `src/ui/client/test-scope.ts` touche au DOM et ne peut pas etre importe sous la config serveur qui type-checke les tests. La verification passe par `static/client.js`, comme la parite de copy d'AC-56, ce qui suppose un `deno task build:client` prealable. Le tree-shaking d'esbuild est ce qui rend l'observation concluante : un symbole absent du bundle est un symbole que l'entree n'atteint pas.

**Le compte d'octets lus du corps (AC-47.7).** Mesurer directement le tirage avec un corps en flux fait pendre la requete : `c.req.raw.clone()` tee le flux et la branche non lue ne se resout pas. Le critere est mesure par ses deux plafonds observables, sur une taille intermediaire ou seuls eux les distinguent : refusee quand seule la capture detailed reclame le corps, acceptee quand un body filter le reclame.

---

# Audit de morsure de la serie v5 (AC-51 a AC-57)

**Date** : 2026-09-05. **Base** : `main`, commit `1e4d83f`, suite verte a 828 tests avant la passe, **844 apres**.

## Ce qui a ete audite, et ce qui ne l'a pas ete

Cet audit ne parcourt pas les 86 criteres. Il vise les tests qui gardent une propriete **dont la perte serait invisible autrement** : si la garde saute et que quelqu'un s'en apercoit par un autre chemin que ce test, la mutation n'apprend rien. Ont donc ete mutees, par ordre d'importance : le deni par defaut, la restriction de `any` aux chaines a toute profondeur, les deux paliers d'occurrences, le plancher de version par axe, les schemas stricts de generation, et l'absence de valeur de query dans l'entry `network`.

**Les tests de copy sont hors perimetre** : `tests/testu/ui/query-filters-copy.test.ts` verifie la parite entre `docs/specs.md` §12.5 et le bundle. Une rupture s'y voit a l'oeil nu sur la page, la muter serait du travail pour du travail. La logique que ces messages decrivent, elle, a ete auditee (voir AC-56.9 bis plus bas).

## Protocole

Chaque garde est retiree ou inversee dans `src/`, la suite est relancee, `src/` est restaure depuis git. Une mutation qui ne fait tomber aucun test designe une propriete non gardee. Dix-neuf mutations ont ete passees ; `src/` n'a jamais ete modifie de facon durable et le diff final ne touche que `tests/` et `docs/`.

### Les mutations qui ont mordu

| Mutation | Garde retiree ou inversee | Tests tombes |
|----------|---------------------------|--------------|
| M1 | la phase `undeclared` de `decideParsedQuery` | 9, dont AC-51.5, AC-51.6, AC-52.14, AC-55.5/6/10 |
| M2a | la restriction `any`-chaine au dechiffrement | AC-53.2, 53.4, 53.5, 53.6 bis |
| M2b | la propagation de `queryScoped` sous `and` et `not` | AC-53.4, 53.5, 53.6 bis |
| M2c | la meme restriction a la generation | AC-53.3 |
| M2d | la restriction **inversee** (`!== "string"`) | 14, dont AC-53.1 |
| M3a | le palier bas `regex` (tout plafonne a 64) | AC-52.3, 52.4, 52.5 |
| M3b | le palier rendu **global au `ScopeEntry`** | AC-52.7, et lui seul |
| M3c | le refus au-dela du plafond remplace par un troncage | AC-52.2, 52.3, 52.4, 52.6, 56.10 |
| M3d | off-by-one, `>` devient `>=` | AC-52.1, 52.3, 52.7, 52.8 |
| M4a | le refus d'un `v` sous-declare | AC-54.7 |
| M4b | le plancher d'auth structuree redevient `v === 4` | AC-54.3, 54.8 |
| M4c | `queryFilters: []` compte comme un axe present | AC-54.6 |
| M5b | `.strict()` sur `ScopeEntrySchema` | AC-53.15 bis, 53.16 bis |
| M5c | `queryFilters` accepte puis **efface** de la valeur parsee | 8, dont AC-53.15 et 53.16 |
| M6a | la coupe au premier `=` dans `extractQueryParamNames` | 5 tests du fichier unit |
| M10 | la memoisation de l'axe query entre les deux passes de chemin | AC-52.9 |
| M11 | `required` devient vrai par defaut | AC-51.8, 51.14 |
| M12 | `queryConstrained` cesse de regarder le scope qui accorde | AC-51.15 |

Deux resultats meritent d'etre notes parce qu'ils repondent a une question explicite du cadrage.

**La restriction de `any` attrape bien l'inversion, pas seulement l'absence de message.** M2d, qui rend la garde strictement inverse, fait tomber quatorze tests dont AC-53.1, le critere positif. Un test qui se serait contente d'asserter la presence du message de validation serait reste vert. M2b confirme separement que la propagation en profondeur est gardee pour elle-meme : elle fait tomber AC-53.4, 53.5 et 53.6 bis sans toucher AC-53.2.

**Les schemas stricts gardent deux proprietes distinctes, et chacune a son test.** M5b (perte du `.strict()`) ne fait tomber que les deux `bis`, qui gardent le rejet d'une cle inconnue. M5c (la cle reste connue mais l'axe disparait de la valeur parsee) fait tomber AC-53.15 et AC-53.16, qui gardent la survie de `queryFilters` jusqu'au blob. Aucun des deux ne couvre l'autre, ce qui est la bonne configuration.

## Les huit prises

Huit mutations n'ont fait tomber **aucun test** sur les 828. Dans les huit cas la propriete est correctement implementee dans `src/` : ce sont des tests manquants ou qui visent a cote, pas des defauts du code. `src/` n'a pas ete touche.

**1. La query entiere peut entrer dans le champ `path` de l'entry `network` (AC-57.1, AC-57.2).** C'est la prise la plus lourde. `captureNetwork` recoit `proxyPath` sans query ; lui faire recevoir `proxyPath + search` fait entrer valeurs comprises dans le ring buffer, qui vit **en clair** contrairement au body `detailed` chiffre avec la cle client. 828 tests verts sur cette fuite. Toute la serie AC-57 tenait sur `tests/testu/logs-query-names.test.ts`, qui exerce `extractQueryParamNames` en isolation : une fuite qui entre par un autre champ de l'entry lui echappe entierement, par construction. Le test livre serialise l'entry **complete** et y cherche les secrets, ce qui est la seule forme qui ferme la porte.

**2. La memoisation de l'axe query peut fuir d'un `ScopeEntry` a l'autre (AC-51.15).** Remplacer `queryDecisions[i]` par `queryDecisions[0]` fait resservir le refus du premier scope contraint a tous les suivants : l'additivite tombe des que l'auteur declare deux scopes contraints sur le meme chemin, ce qui est l'usage normal de la feature. AC-51.15 ne l'attrape pas parce que sa fixture met un scope **string** en premier, et un scope string sort de la boucle avant que l'axe query soit atteint. Le test visait juste pour ce qu'il enonce, mais sa forme ne peut structurellement pas exercer le partage. `AC-51.15 bis` couvre les deux ordres entre deux `ScopeEntry`, `AC-51.15 ter` couvre l'ordre inverse de l'original.

**3. Un `queryFilters: []` peut activer le deni par defaut (AC-54.6).** L'enonce dit « n'induit pas de bump **et ne contraint rien** ». Le test ne verifiait que la premiere moitie, la version. Retirer `filters.length === 0` de `scopeQueryFilters` transforme un tableau vide en axe present qui refuse tout parametre, et personne ne tombe. `AC-54.6 bis` couvre la moitie matching.

**4. Le plancher de version n'est pas garde a la generation (AC-54.8).** AC-54.8 verifie le plancher au **dechiffrement**, sur des blobs forges par `encryptBlob`. Le `Math.max` de `POST /api/generate` n'etait couvert par rien sur le seul cas ou une echelle et un maximum divergent : deux axes a la fois. Remplacer le `Math.max` par une cascade emet un `v: 4` pour un blob a auth structuree **et** `queryFilters`, que `decryptBlob` refuse aussitot par la regle d'AC-54.7. Symptome mesure sous mutation : `{"error":"invalid_credentials","message":"Unable to decrypt blob"}`, c'est-a-dire un blob mort livre avec un bandeau vert et un 401 qui envoie son porteur verifier une cle qui est bonne. `AC-54.8 bis` ferme le cas.

**5. Le plafond de noms captures n'existait pour personne (AC-57.4).** `MAX_QUERY_PARAM_NAMES` vaut 32 ; le retirer laisse une requete unique remplir le ring buffer dimensionne par `FGP_LOGS_BUFFER_NETWORK`. Une seconde mutation, `continue` remplace par `break`, sous-compte les occurrences d'un nom deja retenu qui reapparait au-dela du plafond, ce que le commentaire du code prend soin d'eviter et que rien ne verifiait. `AC-57.4` et `AC-57.4 bis` couvrent les deux.

**6. Une requete sans query pouvait produire un nom vide (AC-57.7).** Le garde-fou `search.length === 0` n'etait teste par rien. Le remplacer par un retour `{ names: [""] }` fait apparaitre dans l'entry ce qui se lit comme un parametre au nom vide reellement envoye, cas que AC-55.10 traite par ailleurs comme un parametre a part entiere. Le diagnostic devient trompeur sur toutes les requetes sans query. `AC-57.7` ferme le cas.

**7. Le rendu des noms de parametres dans `/logs` n'etait garde par rien (AC-57.6).** Aucun test ne lisait `static/logs-client.js`. Remplacer le `textContent` du rendu des noms par un `innerHTML` passe sans qu'un test bouge, alors que c'est le seul chemin d'injection ouvert par la decision de §14.6 : un nom de parametre est une chaine d'appelant qui traverse le serveur jusqu'au navigateur de l'auteur du blob. `AC-57.6` recense le bundle, `AC-57.6 bis` est son temoin, sans lequel le recensement resterait vert sur un bundle d'ou l'affichage aurait disparu.

**8. Le troisieme etat pouvait se declencher a tort (AC-56.9 bis).** `queryConstrainedElsewhere` ne doit se lever que si un scope contraignant couvre reellement cette methode et ce chemin. Le forcer a `true` des qu'un scope contraignant existe ailleurs dans le blob ne fait tomber aucun test : la note alarmerait sur un chemin que rien ne contraint. AC-56.9 et AC-56.9 bis n'etaient couverts que du cote copy, qui verifie la presence des chaines et pas la condition qui les declenche. `AC-56.9 bis` couvre les trois formes de non-couverture (autre chemin, autre methode) plus un temoin positif.

## Une garde qui tient, mais par un fil

**Le deni par defaut de bout en bout tenait a un seul test, hors serie.** Faire recevoir a `checkRequestAccess` un chemin ampute de sa query, depuis `src/middleware/proxy.ts`, ne faisait tomber que `AC-46.2` de `tests/testi/scope-verdict-parity.test.ts`, ecrit pour le lot de securite. Aucun test de la serie v5 ne l'attrapait, et **AC-56.10 restait vert pour la mauvaise raison** : son unique filtre porte `required: true`, donc toute requete dont la query n'atteint pas le controle est refusee de toute facon, et le `403` attendu tombe sans rien prouver du deni par defaut. AC-56.10 fait correctement son travail sur ce qu'il enonce, la genericite du message, et il n'a pas ete modifie. `AC-51.5 bis` ajoute la garde manquante, avec un filtre **non requis** pour que la seule cause de refus possible soit le parametre non declare.

## Releve de couverture de la serie v5

| Serie | Criteres | OK | PARTIEL | TROU |
|-------|----------|----|---------|------|
| AC-51, semantique de l'axe query | 16 | 16 | 0 | 0 |
| AC-52, paliers d'occurrences et budget | 14 | 14 | 0 | 0 |
| AC-53, validation blob et generation | 18 | 18 | 0 | 0 |
| AC-54, version et retro-compatibilite | 9 | 9 | 0 | 0 |
| AC-55, analyse de la query | 10 | 10 | 0 | 0 |
| AC-56, testeur et diagnostic | 11 | 11 | 0 | 0 |
| AC-57, capture des noms de parametres | 8 | 8 | 0 | 0 |
| **Total v5** | **86** | **86** | **0** | **0** |

**Ce tableau dit la couverture, pas la morsure de chaque ligne.** La legende du lot de securite plus haut associe les deux parce que chaque test y avait ete ecrit sous mutation. Ici la serie preexistait : l'audit a mute les gardes du cadrage, pas les 86 criteres un par un. Un « OK » de ce tableau signifie donc qu'un test vert nomme le critere ; la morsure est etablie pour les criteres cites dans les deux tableaux de mutations ci-dessus, et presumee pour les autres. Les series les moins exercees par cet audit sont AC-55, dont seuls 55.5, 55.6, 55.8 et 55.10 sont tombes sous une mutation, et la partie budget d'AC-52 (52.10 a 52.13), qui mesure des temps et n'a pas ete mutee.

Deux criteres sont couverts par des tests portant un autre numero, sans doublon ecrit : **AC-54.1** par les assertions de version d'`AC-53.15`, qui le nomme en commentaire, et **AC-56.8** par `AC-46.2` de `tests/testi/scope-verdict-parity.test.ts`, dont la couverture de l'axe query est etablie par sa chute sous M1 et M14.

## Tests ajoutes ou corriges dans cette passe

| Test | Fichier | Critere | Mutation qu'il ferme |
|------|---------|---------|----------------------|
| `AC-51.5 bis` | `tests/testi/query-filters.test.ts` | AC-51.5 | query hors controle de scopes |
| `AC-51.15 bis` et `ter` | `tests/testu/middleware/query-filters.test.ts` | AC-51.15 | memoisation partagee entre scopes |
| `AC-54.6 bis` | `tests/testu/middleware/query-filters.test.ts` | AC-54.6 | `queryFilters: []` traite comme un axe |
| `AC-54.8 bis` | `tests/testi/query-filters.test.ts` | AC-54.8 | plancher de version a la generation |
| `AC-56.9 bis` | `tests/testu/middleware/query-filters.test.ts` | AC-56.9 bis | troisieme etat declenche a tort |
| `AC-57.1`, `57.2`, `57.3`, `57.7`, `57.8`, `57.8 bis` | `tests/testi/logs-query-capture.test.ts` | AC-57.1 a 57.3, 57.7, 57.8 | query dans le champ `path` |
| `AC-57.4` et `AC-57.4 bis` | `tests/testu/logs-query-names.test.ts` | AC-57.4 | plafond de noms, et `break` au lieu de `continue` |
| `AC-57.6` et `AC-57.6 bis` | `tests/testu/ui/logs-bundle.test.ts` | AC-57.6 | `innerHTML` dans le rendu des noms |

`tests/testu/ui/logs-bundle.test.ts` lit `static/logs-client.js` et exige donc un `deno task build:client` prealable, comme `scope-verdict-bundle.test.ts` et la parite de copy.

## Un critere corrige, il etait auto-contradictoire

**AC-56.9 bis** disait que la note ne doit pas apparaitre « des qu'un scope **non** contraignant existe ailleurs dans le blob ». C'est l'inverse du mecanisme : le troisieme etat se declenche quand le scope qui accorde ne contraint pas **et** qu'un scope contraignant couvre la meme requete. Le drapeau qui peut se lever a tort est donc `queryConstrainedElsewhere`, qui compte les scopes **contraignants**. L'enonce est corrige dans `docs/acceptance-criteria.md` avec la trace de la correction, et le test livre porte la forme corrigee.

---

## Ce que je n'ai pas couvert

- **La moitie 400 d'AC-47.10**, decrite plus haut : arbitrage, pas test.
- **Les tests de copy de la serie v5**, hors perimetre de cet audit par decision explicite : `tests/testu/ui/query-filters-copy.test.ts` n'a pas ete mute. Sa logique sous-jacente l'a ete, et AC-56.9 bis en est sorti.
- **La nomenclature de `tests/testu/logs-query-names.test.ts`.** Neuf des onze tests de ce fichier ne portent aucun numero d'AC, ce qui viole la convention de nommage. Ils couvrent AC-57.2 et AC-57.5 sous des libelles descriptifs. Je ne les ai pas renommes : c'est la meme tache mecanique que la renumerotation deja arbitree, et la faire au milieu d'un audit melangerait deux diffs. Les deux tests ajoutes portent leur numero.
- **Le cout reel de la double passe de chemin sous mutation M10.** AC-52.9 mesure le nombre de lectures de `values`, ce qui suffit a detecter la perte de memoisation, mais ne mesure pas le temps. Le budget lui-meme reste couvert par AC-52.10 a AC-52.13.
- **La passe finale de `stripTransportHeaders` sur les en-tetes hop-by-hop.** Elle ne retire que `Host` et `X-FGP-*`. Un `AuthSpec` qui tenterait de poser `TE` ou `Connection` n'atteint jamais cette passe : `validateHeaderName` refuse ces noms, et `isValidAuthSpec` est appele au dechiffrement, donc le blob forge est refuse en entier. La defense tient, mais par la validation et non par le strip, et aucun chemin public ne permet d'exercer le strip lui-meme. AC-45.10 est donc couvert sur sa moitie observable, l'ordre des passes, verifiee par inversion.
- **Le rebinding DNS**, explicitement laisse ouvert par l'ADR-0009. Non testable en l'etat, ne figure dans aucun critere, vit en §13 comme non-garantie.
- **La renumerotation des tests existants.** Arbitrage inchange : la table ci-dessus en est la specification, elle se traite en tache mecanique separee sur un arbre ou personne d'autre n'ecrit.
