# Matrice de couverture AC vers tests : lot de securite (AC-43 a AC-50) et v5 (AC-51 a AC-57)

**Date** : 2026-09-04
**Ref AC** : `docs/acceptance-criteria.md` v5.0, series AC-43 a AC-57
**Ref sources** : `docs/adr/0009-politique-de-sortie-du-proxy.md`, `docs/adr/0010-politique-limites-ressources.md`, `docs/specs.md` §18
**Ref challenge v5** : `docs/review/challenge-query-filters-v5.md`
**Suite** : `deno task verify` vert, **654 tests passes, 0 echec**

La matrice du lot v4 (`ac-coverage-v4.md`, series AC-34 a AC-42) garde sa valeur pour son propre perimetre et n'est pas reecrite : c'est le releve date d'un lot livre.

## Methode, et pourquoi elle compte ici

Les series AC-43 a AC-50 ont ete **backfillees apres coup**, le lot de securite ayant ete livre sans criteres ecrits. Elles sont reconstituees **depuis les ADR et `docs/specs.md` §18, jamais depuis les tests**. C'est la contrainte qui donne sa valeur a ce document : rediger les criteres d'apres l'implementation aurait produit une matrice tautologiquement complete, ou chaque test trouve son critere parce que le critere a ete ecrit pour lui.

En partant des decisions, deux categories d'ecart apparaissent, et ce sont les seules interessantes :

- **Sens A**, un critere tire d'un ADR que rien ne couvre. C'est un trou de couverture reel sur une decision prise.
- **Sens B**, un test qui ne correspond a aucun critere de sa serie. Soit une exigence non ecrite, soit un test mal range.

## Legende

- **OK** : critere couvert par au moins un test vert
- **PARTIEL** : couvert sur une partie de son enonce seulement
- **TROU** : aucun test, la decision est implementee mais rien ne la protege
- **NON IMPLEMENTE** : aucun test et aucun code
- **N/A** : non testable automatiquement

---

## Vue d'ensemble

| Serie | Criteres | OK | PARTIEL | TROU | N/A |
|-------|----------|----|---------|------|-----|
| AC-43, destination (G1) | 24 | 20 | 1 | 3 | 0 |
| AC-44, chemin (G2) | 13 | 9 | 1 | 3 | 0 |
| AC-45, en-tetes (G3) | 14 | 12 | 0 | 2 | 0 |
| AC-46, query non contrainte (G4) | 6 | 3 | 0 | 3 | 0 |
| AC-47, corps et decompression | 10 | 5 | 2 | 3 | 0 |
| AC-48, regex et denombrement | 20 | 19 | 1 | 0 | 0 |
| AC-49, surface d'API | 4 | 3 | 0 | 1 | 0 |
| AC-50, derivation et cache | 11 | 4 | 1 | 5 | 1 |
| **Sous-total lot securite** | **102** | **75** | **6** | **20** | **1** |
| AC-51 a AC-57, v5 | 86 | 4 | 0 | 82 | 0 |

Les 82 de la v5 ne sont pas un constat de negligence : `queryFilters` n'existe pas dans `src/`, ces criteres sont le contrat de ce que le dev doit livrer. Detail dans `challenge-query-filters-v5.md`.

**Le chiffre a retenir est 20 trous sur 102 pour un lot de securite livre et declare vert.** Aucun n'est une regression : chaque decision concernee est implementee dans le code, verifiee a la main. Ce sont des decisions qu'aucun test ne protege contre un futur refactor.

---

## Sens A : criteres tires des ADR que rien ne couvre

Classes par gravite. Chacun a ete verifie dans le code avant d'etre declare trou : je distingue « implemente mais non teste » de « non implemente », et il n'y a **aucun** cas de la seconde categorie.

### Grave

**AC-43.18, la contrainte d'hote sur `apiUrl` du mode `scalingo-addon`.**
Implemente (`src/auth/client.ts:64`, garde dans `fetchAddonToken`), **zero test**. C'est le trou le plus serieux de la liste. L'ADR-0009 nomme ce champ comme le point de sortie non controle qui a motive la regle d'unicite du point de sortie : un blob v4 portant `apiUrl: "https://collecteur.example"` fait livrer a un tiers le **bearer Scalingo fraichement echange**. La SSRF n'y est pas seulement un acces au reseau interne, c'est une exfiltration de credential upstream. Les deux tests voisins (AC-43.15 et AC-43.15 bis) couvrent la meme garde sur `/api/list-apps` et `/api/list-addons`, c'est-a-dire les deux surfaces les moins dangereuses des trois : celle du chemin chaud du proxy, la seule qui manipule un bearer, n'est pas couverte.

**AC-47.8, la borne de decompression.**
`src/crypto/bounded.ts` est implemente et appele par `blob.ts` et `share.ts`. **Il n'existe aucun fichier de test pour ce module.** C'est la decision D5 de l'ADR-0010, celle qui fait passer `/api/share/decode` de 320 Mo de RSS a 128 Ko, soit une amplification de 1 200:1 ramenee a 16:1, contre un ratio gzip maximal mesure a 1 029:1. La bombe gzip que l'ADR demande explicitement en test (3 Ko produisant 3 Mo) n'a jamais ete ecrite. Un refactor qui remplacerait `readBounded` par un `arrayBuffer()` ne ferait echouer aucun test.

**AC-45.4, les en-tetes nommes par `Connection`.**
Implemente (`stripCallerHeaders` lit l'en-tete `Connection` et supprime ceux qu'il designe), non teste. AC-45.3 couvre `TE`, `Upgrade`, `Proxy-Authorization` et `Keep-Alive`, mais ni `Connection` lui-meme ni le mecanisme d'indirection qu'il porte. C'est la matiere premiere du request smuggling, et c'est le seul comportement hop-by-hop non couvert.

**AC-50.7 et AC-50.8, la pre-validation avant derivation.**
Implementees (`src/middleware/proxy.ts:208`, `checkClientKey` plus un plancher structurel de taille de blob), non testees. L'ADR-0010 demande explicitement le test avec un espion de comptage sur `deriveKey`. Sans lui, rien n'empeche qu'un refactor replace la derivation avant la validation, ce qui redonne gratuitement 11,60 ms de CPU par sonde malformee.

### Notable

**AC-44.9, l'emission de la forme brute octet pour octet.**
C'est la **moitie emission de la garantie G2**, et elle n'a pas de test. Les huit tests d'AC-44 couvrent tous la moitie controle. Or c'est l'emission brute qui preserve l'ADR-0006 et fait passer le cas GitLab : un refactor qui emettrait la forme canonique passerait AC-44.1 a AC-44.8 au vert tout en cassant silencieusement toutes les APIs qui traitent `%2F` comme une donnee. C'est exactement l'option B que l'ADR-0009 a rejetee, et rien ne l'empeche de revenir.

**AC-44.11, le durcissement des scopes en correspondance exacte.**
Changement cassant explicitement documente dans l'ADR et dans §18.3, non teste. Le jour ou un utilisateur le signale, personne ne saura si c'est le comportement voulu ou une regression.

**AC-46.4, un `?` dans un pattern reste accepte au dechiffrement.**
Seule la moitie « refus a la generation » est testee (AC-46.4 dans `egress-policy.test.ts`, qui porte ce numero pour un autre enonce). L'autre moitie, « les blobs en circulation ne sont pas casses », est la partie qui protege des acces vivants, et c'est celle qui n'a pas de test.

**AC-46.2, la parite entre le testeur de scopes et le proxy.**
Le mensonge du testeur est le defaut fondateur de l'ADR-0009 sur cet axe, celui qualifie de « pire que pas d'outil ». Sa correction est structurelle (une seule fonction d'autorisation, AC-46.6) mais aucun test ne compare les deux verdicts. La structure est la bonne, rien ne verifie qu'elle le reste.

**AC-47.6, le `bodyLimit` jamais monte sur `*`.**
Un commentaire le dit dans `api-edge-cases.test.ts`, aucun test ne le verifie. Le projet dispose pourtant du modele exact : AC-41.9 recense les routes depuis l'app Hono elle-meme pour les en-tetes de securite, precisement pour que « qui oublie la liste oublierait aussi le test » ne puisse pas arriver. Le meme recensement appliquerait ici sans invention.

**AC-47.2, les paliers par route.**
PARTIEL. Le defaut a 64 Ko et le palier de `/api/share/decode` a 16 Ko sont testes. Les paliers de `/api/decode` (8 Ko) et des deux helpers Scalingo (4 Ko) ne le sont pas.

### Mineur

- **AC-43.21**, l'avertissement au demarrage quand `FGP_EGRESS_ALLOW_PRIVATE` est actif. Implemente dans `egress.ts`, non teste.
- **AC-43.22**, l'exemption des valeurs d'origine operateur. Implicitement exercee par toute la suite qui pointe des mocks locaux, jamais asserte comme regle.
- **AC-43.17**, le point de sortie unique. PARTIEL : deux des cinq appelants sont couverts en tant que tels. La forme utile de ce critere est un recensement, comme AC-41.9, pas cinq tests separes.
- **AC-44.10**, la monotonie de la regle des deux formes. Propriete structurelle, testable par corpus, non couverte.
- **AC-44.12**, la construction de l'URL par l'API `URL`. PARTIEL via le test du chemin non avale.
- **AC-47.7**, la lecture raccourcie quand seule la capture detailed a besoin du corps.
- **AC-47.10**, `X-FGP-Source: proxy` sur les 413. PARTIEL : le code d'erreur est asserte, l'en-tete non.
- **AC-48.15**, les budgets globaux au blob. PARTIEL : le plafond de 5 regex est teste, jamais leur repartition sur plusieurs filtres et plusieurs scopes, qui est precisement ce que « global » veut dire.
- **AC-49.3**, l'absence d'appel reseau du testeur cote navigateur.
- **AC-50.5**, le cache n'est jamais une dependance de correction.
- **AC-50.10**, le timer de purge non conditionne a la feature logs.
- **AC-50.11**, les 100 000 iterations PBKDF2 inchangees. Test trivial a ecrire, et c'est le genre de constante qu'un jour quelqu'un baissera « pour la performance », ce que l'ADR-0010 anticipe nommement.
- **AC-50.9**, non testable : c'est un critere de **non-propriete**, ecrit pour que la pre-validation ne soit pas vendue comme une defense.

---

## Sens B : tests qui ne correspondent pas a leur serie

**Aucun test du lot n'est du test pour du test.** Les 73 tests examines couvrent tous une decision reelle des deux ADR. C'est un bon resultat et il merite d'etre dit avant les remarques qui suivent.

Deux tests sont ranges dans la mauvaise serie :

| Test | Serie ou il est | Critere qu'il couvre reellement |
|------|-----------------|----------------------------------|
| `AC-43.8 buildUpstreamUrl : le chemin proxy ne peut pas etre avale` | AC-43, destination | AC-44.13, construction de l'URL sortante, donc l'axe chemin |
| `AC-49.3 /api/test-proxy refuse un motif catastrophique sans l'evaluer` | AC-49, surface d'API | AC-48.19, validation avant evaluation, donc l'axe regex |

Quatre exigences du lot de securite vivent sous des series anterieures a la decision qui les a creees :

| Test | Serie ou il vit | Decision qu'il couvre |
|------|-----------------|------------------------|
| `AC-5.17 bis: l'ancrage ferme le contournement de scope par sous-chaine` | AC-5, body filters (v3) | ADR-0010 D3, ancrage, mon AC-48.10 |
| `AC-5.17 ter: une valeur de plus de 128 caracteres n'est plus testee` | AC-5, body filters (v3) | ADR-0010 D2 couche 1, mon AC-48.11 |
| `AC-9.2: Host header is stripped before forwarding` | AC-9, forward | ADR-0009 §5 classe 5, mon AC-45.7 |
| `AC-9.3: query string is forwarded to target` | AC-9, forward | ADR-0009 G4, mon AC-46.5 |
| `AC-19.4` et `AC-19.5`, troncature de l'IP | AC-19, capture network | ADR-0009 §5, mon AC-45.14 |

Ce n'est pas une faute : ces tests preexistaient et le lot de securite les a durcis sur place plutot que d'en creer de nouveaux, ce qui est le bon geste. Mais la consequence est qu'une lecture par serie de la couverture du lot de securite **sous-estime** ce qui est reellement couvert, et qu'un lecteur cherchant l'ancrage dans AC-48 ne trouve que la moitie unitaire.

**La serie AC-46 a des trous de numerotation** dans les tests : ils vont de `AC-46.1` a `AC-46.4` sans `AC-46.2` ni `AC-46.3`. La numerotation a ete posee en prevision de criteres qui n'ont jamais ete ecrits, ce qui est le symptome direct de l'absence de registre au moment du lot.

---

## La question de la renumerotation, et ce que j'en fais

Les numeros des tests existants ne correspondent plus a ceux du registre. Exemple : le test `AC-43.3` porte sur les plages IP non publiques, le critere AC-43.3 du registre porte sur le refus d'un `target` avec query. C'est une contradiction que le backfill vient de creer, et il faut la trancher.

**Je ne renomme pas les 73 tests, et c'est un arbitrage que je rends plutot qu'une omission.** Trois raisons.

1. Le contenu des criteres a ete derive des ADR, et **aligner ma numerotation sur celle des tests aurait revenu a laisser les tests dicter la structure du registre**, par la porte de derriere. L'ordre retenu suit les trois temps de l'ADR-0009 §2 (forme, adresse, redirections), qui est la structure de la decision.
2. Plusieurs renommages demandent un jugement, pas une substitution : deux tests changent de serie, un test couvre quatre criteres a lui seul (`AC-43.2 forme`), quatre exigences vivent sous des series anterieures. Un `sed` produirait des correspondances fausses, qui sont pires que des correspondances absentes.
3. Le renommage touche dix fichiers de `tests/`, ou le dev travaillera pour la v5. Le faire maintenant cree une surface de conflit pour un gain purement cosmetique a court terme.

**La table ci-dessus est la specification de ce renommage.** Il se traite en tache mecanique separee, sur un arbre ou personne d'autre n'ecrit, avec pour critere de sortie qu'aucun identifiant AC ne soit porte par deux tests couvrant des criteres differents. Tant qu'il n'est pas fait, ce document est l'index qui permet de repondre a « quel test couvre AC-43.18 » sans greper la suite.

---

## Ce que je n'ai pas couvert

- **Je n'ai ecrit aucun test dans cette passe.** Les 20 trous sont documentes, pas combles : les combler est un lot de test a part entiere, a dispatcher au dev ou a me redonner, et il vaut d'etre priorise par la liste ci-dessus plutot que traite en bloc.
- **Je n'ai pas verifie le comportement reel des plages IP contre une pile reseau**, seulement contre la fonction de classification. Le rebinding DNS, explicitement laisse ouvert par l'ADR-0009, n'est pas testable en l'etat et ne figure dans aucun critere : c'est une non-garantie, elle vit en §13.
- **Deux variables d'environnement du lot de securite ne sont documentees nulle part hors de l'ADR-0009** : `FGP_EGRESS_ALLOW_PRIVATE` et `FGP_TRUSTED_PROXY_HOPS`. Elles ne figurent ni dans `docs/specs.md`, ni dans `docs/limits.md`, ni dans la liste des variables d'environnement de `CLAUDE.md`. La premiere desactive la garantie G1 a elle seule. Ce n'est pas mon perimetre de les y ajouter, c'est signale au PO et au lead.
- **La priorisation des trous n'est pas la mienne a rendre.** Je les ai classes par gravite technique. Le choix de ce qui part maintenant et de ce qui attend appartient a l'architecte.
