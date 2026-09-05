# Matrice de couverture AC vers tests : lot de securite (AC-43 a AC-50) et v5 (AC-51 a AC-57)

**Date** : 2026-09-05 (mise a jour ; releve initial du 2026-09-04)
**Ref AC** : `docs/acceptance-criteria.md` v5.0, series AC-43 a AC-57
**Ref sources** : `docs/adr/0009-politique-de-sortie-du-proxy.md`, `docs/adr/0010-politique-limites-ressources.md`, `docs/specs.md` §18
**Ref challenge v5** : `docs/review/challenge-query-filters-v5.md`
**Suite** : `deno task verify` vert, **827 tests passes, 0 echec**

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

**La serie v5 (AC-51 a AC-57, 86 criteres) n'a pas ete reauditee dans cette passe.** Le releve du 2026-09-04 la donnait a 4 OK et 82 TROU, mais ce chiffre decrivait un contrat non encore implemente : `queryFilters` et le blob v5 ont depuis ete livres et merges, avec leurs tests. Reporter ce chiffre ici serait faux. Il demande son propre releve, sur le meme protocole que celui du lot de securite.

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

## Ce que je n'ai pas couvert

- **La serie v5, AC-51 a AC-57.** Elle demande son propre releve, sur le meme protocole. Le chiffre du 2026-09-04 est perime et n'a pas ete reconduit ici.
- **La moitie 400 d'AC-47.10**, decrite plus haut : arbitrage, pas test.
- **La passe finale de `stripTransportHeaders` sur les en-tetes hop-by-hop.** Elle ne retire que `Host` et `X-FGP-*`. Un `AuthSpec` qui tenterait de poser `TE` ou `Connection` n'atteint jamais cette passe : `validateHeaderName` refuse ces noms, et `isValidAuthSpec` est appele au dechiffrement, donc le blob forge est refuse en entier. La defense tient, mais par la validation et non par le strip, et aucun chemin public ne permet d'exercer le strip lui-meme. AC-45.10 est donc couvert sur sa moitie observable, l'ordre des passes, verifiee par inversion.
- **Le rebinding DNS**, explicitement laisse ouvert par l'ADR-0009. Non testable en l'etat, ne figure dans aucun critere, vit en §13 comme non-garantie.
- **La renumerotation des tests existants.** Arbitrage inchange : la table ci-dessus en est la specification, elle se traite en tache mecanique separee sur un arbre ou personne d'autre n'ecrit.
