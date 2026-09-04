# Challenge des specs : lots v4 / BYOK / llms.txt / securite

**Date** : 2026-09-03
**Auteur** : testeur / QA
**Perimetre challenge** : `docs/specs.md` v4.0 (sections 5, 6, 8, 9, 10, 11, 12, 15, 16, 17), `docs/limits.md` sections 9 et 10, `docs/design/byok-client-key.md`, `docs/design/custom-headers-multi.md`, `docs/design/scalingo-addon-mode.md`, ADR-0006.
**AC produits** : AC-34 a AC-42 dans `docs/acceptance-criteria.md` v3.0.
**Matrice de couverture** : `docs/review/ac-coverage-v4.md`.
**Statut au 2026-09-03, apres arbitrages** : 17 des 19 points ont produit une decision, toutes implementees dans `src/`. Les points 10 et 11 ont ete tranches par l'abandon du multi-addon. Restent ouverts : le point 15 (comportement des paths a un seul segment) et le point 16 (liste de chaines attendues dans `/llms.txt`). Un vingtieme point a ete decouvert en ecrivant les tests, il est ajoute en fin de document.

---

## Verdict par lot, sans enrobage

| Lot | Etat de la spec | Implementable en l'etat |
|-----|-----------------|-------------------------|
| A : AuthSpec `headers` | Bonne. Deux trous de securite non ecrits, une contradiction de charset. | Oui, apres arbitrage des points 4, 5 et 8. |
| A : AuthSpec `scalingo-addon` | **Le maillon faible du lot.** Toute la resolution multi-addon repose sur une hypothese non verifiee sur la forme des URLs de la Database API Scalingo, et la spec UI qui sert de reference au dev est perimee sur cinq points dont un bloquant. | Le mode mono-addon oui. Le mode multi-addon est testable contre notre hypothese, pas contre la realite. Voir points 9, 10 et 11. |
| B : Cle client fournie (BYOK) | Bonne cote serveur. Une contradiction de borne, un cas non tranche. | Oui, apres arbitrage des points 6 et 7. |
| C : `/llms.txt` | Spec de forme solide, spec de fond entierement qualitative. | Oui, mais les tests ne pourront verifier que la forme. Voir point 19. |
| D : Headers de securite (livre) | Bonne, avec une justification qui se contredit elle-meme et un cas de bord non tranche. | Livre. Voir point 1, qui n'est pas bloquant mais doit etre ecrit. |

---

## 1. Le `Referrer-Policy` est absent exactement la ou le blob est dans l'URL

> **TRANCHE** : les erreurs FGP de la route proxy portent desormais les en-tetes, via un wrapper qui discrimine sur `X-FGP-Source`. Les reponses upstream restent nues. Couvert par AC-41.12, et la parite avec les routes UI par AC-41.13.


**Ou** : `specs.md` §17.1 et §17.2.

§17.2 justifie `Referrer-Policy: no-referrer` par : « Critique : une URL FGP contient le blob, elle ne doit jamais fuiter en `Referer`. » §17.1 restreint le perimetre aux chemins servis par FGP, ce qui exclut precisement `/{blob}/*`, c'est-a-dire les seules URLs qui contiennent un blob. Le header est pose sur toutes les pages **sauf** celles que sa justification designe.

La decision de perimetre est juste : l'ADR-0006 prime, on n'enrichit pas une reponse upstream. C'est **la justification qui est fausse**, et une justification fausse dans une spec de securite finit par etre citee pour prendre une mauvaise decision plus tard. Le vrai motif de `no-referrer` ici, c'est l'UI de configuration, qui manipule des tokens et des cles en clair dans son DOM et dont l'URL peut porter un `?c=`.

Corollaire non tranche : une erreur FGP generee sur la route proxy (`403 scope_denied`, `410 token_expired`, `401 invalid_credentials`) est une reponse produite par FGP, avec `X-FGP-Source: proxy`, et elle ne porte **aucun** header de securite puisque `/{blob}/*` n'est pas dans `FGP_OWNED_PATHS`. Ce n'est pas incoherent avec l'ADR (ces reponses ne sont pas upstream), mais la spec ne le dit nulle part et un lecteur peut le prendre pour un oubli et le « corriger ».

**Recommandation** : reecrire la justification de `Referrer-Policy` en §17.2 (l'UI, pas le blob), et ajouter une phrase en §17.1 disant explicitement que les reponses FGP emises sur la route proxy ne portent pas les headers de securite, et pourquoi c'est un choix : distinguer erreur FGP et reponse upstream au moment de poser les headers demanderait un branchement dans le chemin de forward, exactement ce que l'ADR-0006 cherche a garder simple. AC-41.12 reste a figer apres cet arbitrage.

---

## 2. Le partage `?c=` n'a pas de forme specifiee pour un `auth` structure

> **TRANCHE** : `value` presente et vide pour les headers ; en mode addon, ni `app` ni `addonId` ne sont transportes, seuls le mode et l'`apiUrl` le sont. Couvert par AC-37.5 et AC-37.12, tous deux verts.


**Ou** : `specs.md` §11.1.4, et le code actuel `ShareEncodeBodySchema.auth: z.string().min(1)`.

§11.1.4 dit : « Pour un AuthSpec `headers`, seuls les `name` sont encodes, les `value` sont videes. » Deux problemes.

D'abord, « videes » est ambigu : la cle `value` est-elle absente de l'objet, ou presente avec la valeur `""` ? Ce n'est pas cosmetique. Un `value: ""` present est indistinguable, cote destinataire, d'une valeur legitimement vide, et un test qui verifie « pas de secret » passe dans les deux cas alors qu'un seul est correct.

Ensuite, la spec ne dit rien du mode `scalingo-addon` dans une URL de partage. §11.1.4 ne traite ce mode que pour `/api/decode`. Or une URL de partage qui transporte `app`, `addonId` et `resourceId` divulgue le nom des applications et l'inventaire des bases de donnees d'un compte Scalingo a quiconque recoit le lien. Ce ne sont pas des secrets d'authentification, mais c'est de la cartographie d'infrastructure, et une URL de partage est faite pour circuler.

**Recommandation** : specifier en §11.1.4 la shape exacte du champ `auth` dans le payload de partage, pour les trois formes (string, `headers`, `scalingo-addon`), avec `value` **absent** et non vide. Et trancher explicitement si `app` / `addonId` / `resourceId` sont partages ou vides. Ma preference : les vider aussi. Le destinataire d'un partage doit choisir ses propres bases, il ne devrait pas heriter de l'inventaire de l'emetteur.

---

## 3. `/api/decode` : le champ `valueRedacted` n'a pas de contrat

> **TRANCHE** : la shape est `{name, valueRedacted}`, sans cle `value`. AC-37.1 assert explicitement l'absence de `value`.


**Ou** : `specs.md` §11.1.4, et le code actuel `DecodeResponseSchema.auth: z.string()`.

La spec dit « chaque `value` est remplacee par `valueRedacted` », sans donner la shape de l'entree resultante. `{name, valueRedacted}` ou `{name, value, valueRedacted}` ? La seconde forme est un piege : elle laisse un champ `value` dans le schema, et il suffit d'un oubli pour qu'il reparte rempli.

Autre point, de contrat cette fois : `DecodeResponseSchema.auth` est aujourd'hui `z.string()`. Il devient une union string / objet. C'est un **changement de contrat d'API**, pas seulement de format de blob. §6.2 traite la retro-compatibilite des blobs et se tait sur celle des reponses. Un consommateur de `/api/decode` qui typait `auth: string` casse, et rien dans la spec ne le previent.

**Recommandation** : figer `{name: string, valueRedacted: string}` sans champ `value`, et ajouter une ligne dans §6.2 ou dans `docs/changelog.md` signalant que la shape de reponse de `/api/decode` evolue en union.

---

## 4. Rien n'interdit un CRLF dans une valeur de header d'auth

> **TRANCHE ET IMPLEMENTE** : `CONTROL_CHARS` dans `src/auth/spec.ts` rejette `0x00` a `0x1F` et `0x7F` dans les valeurs de headers. Le commentaire du code cite le motif exact : sans ce garde, un blob crafte fait throw `Headers.set()` et remonte en 500.


**Ou** : absent de `specs.md` §5, §6.3 et de `limits.md` §9.1. Present uniquement dans `custom-headers-multi.md` §7.1, cote validation UI.

Un blob v4 avec `{name: "X-API-Key", value: "sk-live\r\nX-Admin: true"}` est, en l'etat de la spec serveur, un blob **valide** : la valeur est non vide et fait moins de 1024 caracteres. La validation UI ne protege de rien, un blob se fabrique par appel direct a `/api/generate` ou avec la cle client et le salt public.

Selon le runtime, `Headers.set()` avec une valeur contenant un CRLF lance une exception plutot que de l'accepter. Le resultat serait alors `500 internal_error` au lieu de `401 invalid_credentials`, c'est-a-dire un bug FGP declenchable par un blob crafte, remonte comme une erreur interne. La ligne de defense existe peut-etre par accident, elle n'est pas specifiee et elle ne renvoie pas le bon code.

**Recommandation** : ajouter dans `specs.md` §6.3 (validation au dechiffrement) et dans `limits.md` §9.1 la contrainte « la valeur ne contient aucun caractere de controle (`0x00` a `0x1F`, `0x7F`) ». Un blob qui la viole est rejete en `401 invalid_credentials`, comme toute autre violation de limite. AC-34.19 couvre le cas.

---

## 5. La liste des noms de headers reserves n'existe que dans l'UI, et l'ordre avec le strip de `Host` n'est pas defini

> **TRANCHE ET IMPLEMENTE** : `FORBIDDEN_HEADER_NAMES` dans `src/auth/spec.ts` couvre les en-tetes de transport et les en-tetes FGP, `authorization` reste autorise.


**Ou** : `custom-headers-multi.md` §7.1 (liste reservee cote UI), `specs.md` §11.1 et §11.2.

§11.1 : « Les headers d'auth sont poses **apres** la copie des headers du client. » §11.2 : `Host` est supprime du forward. L'ordre relatif de ces deux operations n'est pas specifie. Un blob v4 avec un header d'auth nomme `Host` a donc un comportement indetermine : soit le strip passe apres et neutralise l'auth, soit il passe avant et le blob reecrit le `Host` de la requete sortante, ce qui permet de detourner la resolution du host cote runtime. Meme raisonnement pour `Content-Length` et `Transfer-Encoding`, ou une valeur choisie corrompt le body forwarde.

Et `X-FGP-Key` comme nom de header d'auth : le proxy strippe `X-FGP-Key` de la requete client, mais un header d'auth du blob est pose ensuite. Un blob pourrait donc reinjecter un `X-FGP-Key` vers l'API cible. Sans consequence directe pour FGP, mais c'est exactement le genre de chemin qu'on n'a pas envie de laisser ouvert dans un composant de securite.

**Recommandation** : porter la liste reservee dans `specs.md` §6.3 comme regle de validation **serveur**, avec rejet en `401 invalid_credentials` au dechiffrement et refus en `400` a la generation. Et specifier l'ordre en §11.2 : strip des headers de transport d'abord, pose des headers d'auth ensuite, jamais l'inverse. AC-34.22 est ecrit mais bloque tant que le comportement serveur n'est pas tranche.

---

## 6. `key: ""` sur `/api/generate` n'est pas tranche

> **TRANCHE ET IMPLEMENTE** : refuse, avec un cas `empty` distinct de `too-short` et un message qui dit quoi faire. AC-38.14 et AC-38.16 verts.


**Ou** : `specs.md` §15.2 (champ optionnel) et §15.3 (24 caracteres minimum).

Un champ optionnel avec une contrainte de longueur minimale a deux lectures possibles en Zod : `z.string().min(24).optional()` refuse `""` en `400 invalid_key`, tandis qu'une validation custom peut traiter `""` comme absent et generer une cle serveur.

Ce n'est pas un detail theorique. Le cas d'usage principal de la feature est un pipeline CI. Une variable d'environnement non definie produit tres souvent une chaine vide, pas une absence. Si `""` est traite comme absent, la CI recoit une URL chiffree avec une cle aleatoire serveur qu'elle ne connait pas, et l'echec se manifeste au premier appel proxyfie, loin de sa cause.

**Recommandation** : refuser explicitement, `400 invalid_key`. Un echec immediat et explicite vaut mieux qu'un blob silencieusement inutilisable. A ecrire dans §15.2. AC-38.14 est ecrit et bloque sur cet arbitrage.

---

## 7. Contradiction sur la longueur maximale de la cle client : 256 ou 128

> **TRANCHE** : 256, et le `maxlength` a ete **retire** du champ plutot que corrige, parce qu'il tronquait les collages en silence. Voir AC-39.19, le test de non-regression a 310 caracteres.


**Ou** : `specs.md` §15.3 et `limits.md` §10 disent **256**. `byok-client-key.md` §7.1 et §7.2 disent **128** (`maxlength` natif a 128, regle formalisee `^[\x21-\x7E]{24,128}$`).

Consequence concrete si personne ne tranche : le dev suit le design pour l'UI et la spec pour le serveur. Une cle de 200 caracteres est acceptee par l'API et impossible a saisir dans le formulaire, ce qui produit exactement le genre d'incoherence que personne ne reproduit avant la mise en production.

**Recommandation** : 256 partout, c'est la valeur des deux documents normatifs et le design est le document qui doit suivre. Corriger `byok-client-key.md` §7.1 et §7.2, et le `maxlength` du champ. AC-38.5 assert la borne a 256.

---

## 8. Contradiction sur le charset des noms de headers d'auth

> **TRANCHE ET IMPLEMENTE** : token RFC 7230, `HEADER_NAME_TOKEN` dans `src/auth/spec.ts`.


**Ou** : `specs.md` §5 et §12.7 : « lettres, chiffres, `-`, `_`, `.`, `~`, `+`, `*` ». `limits.md` §9.1 : meme liste. `custom-headers-multi.md` §7.1 : token RFC 7230, `^[A-Za-z0-9!#$%&'*+.^_`|~-]+$`.

Les deux ensembles ne sont pas emboites : le design autorise `! # $ % & ' ^ |` que la spec refuse, et la spec autorise `~` que le design autorise aussi mais `.` uniquement dans les deux. Un nom `X-Api!Key` passe le design et echoue la spec. Personne ne va ecrire ca, mais deux regex differentes dans deux couches de validation d'un meme champ, c'est une divergence qui finit toujours par produire un cas ou l'UI accepte ce que le serveur rejette, avec un message d'erreur generique parce que c'est une erreur de securite.

**Recommandation** : adopter le token RFC 7230 comme reference unique. C'est la seule definition qui garantit qu'aucun runtime HTTP ne rejettera le nom au forward, et elle est strictement plus large donc elle ne casse rien. Aligner `specs.md` §5, §12.7 et `limits.md` §9.1 dessus.

---

## 9. `scalingo-addon-mode.md` est perime, et un des ecarts est bloquant

> **RESOLU PAR L'ABANDON DU MULTI-ADDON** : le point bloquant sur le `resourceId` disparait, le champ ne vit plus dans le blob. Il survit comme donnee d'affichage et AC-35.24 verifie qu'il ne franchit jamais la frontiere navigateur (vert).


Ce document est celui que le dev a sous les yeux pour integrer l'UI. Il precede les arbitrages de `specs.md` v4 et diverge sur cinq points.

| Point | Design | Specs v4 | Gravite |
|-------|--------|----------|---------|
| Nombre max d'addons | 10 (wireframe §2.7, point tranche §9.4) | 5, avertissement au-dela de 3 (§5, §11.1.2) | Moyenne, contredit une limite produit |
| Libelles UI | « Scalingo + addon token », « Scalingo exchange » | « Scalingo Database API », « Scalingo API » (§11.1, §12.8) | Faible, copy |
| Reponse `/api/list-addons` | `{id, name, plan, type}` (§1.1) | `{id, resourceId, provider, plan}` (§12.8) | Moyenne, contrat d'API |
| Valeur de l'option d'addon | `<option value="<addon-id>">` seul (§5.2) | Le blob a besoin de `addonId` **et** `resourceId` (§11.1.2) | **Bloquante** |
| Scope du preset | `GET:/api/databases/*`, signale comme suppose par le designer | Repris tel quel, jamais confirme | **Bloquante**, voir point 10 |

Le quatrieme point est le bug d'integration le plus probable de tout le lot. Le design fait porter a l'option du select le seul `addonId`. Si le dev l'implemente ainsi, le `resourceId` n'a aucun chemin pour arriver jusqu'au blob, et **toute la resolution multi-addon par `resourceId` devient morte** : elle sera implementee cote proxy, testee avec des blobs fabriques a la main dans les tests, et ne se declenchera jamais en production parce qu'aucun blob genere par l'UI ne contiendra le champ. Le mode ne cassera pas visiblement, il echouera en `addon_not_resolved` dans le cas de figure ou la doc Scalingo dit vrai, c'est-a-dire exactement le cas pour lequel on a stocke deux identifiants.

**Recommandation** : mettre a jour `scalingo-addon-mode.md` avant que le dev integre l'UI, ou a defaut lui signaler nommement les cinq ecarts. Sur l'option d'addon : `data-resource-id` sur l'`<option>`, en plus du `value` qui porte l'`addonId`. AC-39.15 couvre le cas.

---

## 10. La resolution multi-addon repose sur un path que personne n'a verifie

> **VETO RETENU** : le multi-addon est abandonne, on livre le mono-addon, qui ne depend d'aucune hypothese sur la forme des URLs. Le risque residuel se limite a l'etape 2 du flow, couverte par la recette manuelle C.2.


**Ou** : `specs.md` §11.1.2 : « la Database API expose ses ressources sous `/api/databases/{addon_id}/...` ».

C'est l'hypothese qui porte tout le mode multi-addon, et elle vient du meme corpus documentaire que la spec qualifie elle-meme de contradictoire deux paragraphes plus haut. On a tranche la question « quel identifiant » en stockant les deux, ce qui est la bonne decision. On n'a pas tranche la question « quelle forme de path », et on ne peut pas : personne dans l'equipe n'a de compte de test.

Consequence pour les tests, et je prefere l'ecrire noir sur blanc : mes AC-35.2 a AC-35.7 verifient que **notre implementation est conforme a notre hypothese**. Ils ne verifient pas que notre hypothese est vraie. Un test vert sur ce bloc ne dit rien de la Database API reelle. C'est de la couverture de contrat interne, pas de la validation fonctionnelle.

**Recommandation** : deux options, aucune n'est du ressort du testeur.
1. Obtenir un compte Scalingo avec une base, et faire une recette manuelle du mode addon avant de le presenter comme livre. C'est une heure de travail et ca leve l'hypothese.
2. A defaut, livrer le mode **mono-addon** (une seule entree, aucune inspection du path, donc aucune dependance a la forme des URLs) et garder le multi-addon derriere un arbitrage explicite. Le mono-addon est solide, il ne depend d'aucune supposition.

Livrer le multi-addon sans recette reelle en le presentant comme fonctionnel serait le seul endroit de ce lot ou je mettrais un veto de testeur.

---

## 11. Deux incoherences de comportement dans la resolution multi-addon

> **SANS OBJET** : les deux incoherences venaient du multi-addon.


**Ou** : `specs.md` §11.1.2.

**a) Le comportement depend du nombre d'entrees.** Avec une seule entree, la spec dit explicitement « elle est utilisee directement, sans inspection du path ». Donc une requete `GET /api/databases/base-qui-nexiste-pas/stats` autorisee par les scopes declenche deux appels reseau Scalingo et un forward, et echoue cote cible. Avec deux entrees, la meme requete est refusee en `403 addon_not_resolved` sans aucun appel reseau. Le meme appel, sur deux blobs qui different seulement par le nombre de bases autorisees, produit deux comportements opposes. C'est defendable comme optimisation, mais ce n'est pas ecrit comme un choix et un utilisateur ne le devinera pas.

**b) « Un segment du path » est trop large.** La spec dit que l'entree retenue est celle dont `addonId` ou `resourceId` « correspond exactement a un segment du path ». N'importe quel segment. Une requete `GET /api/databases/ad-2/copy-from/ad-1` contient deux segments qui matchent deux entrees differentes, et la regle de depart d'egalite est « la premiere declaree gagne » : l'addon retenu depend de l'ordre de declaration dans le blob, pas de la position dans le path. L'utilisateur croit cibler `ad-2` et FGP peut demander un token pour `ad-1`. Un `resourceId` court et generique aggrave le risque de faux positif ailleurs dans le path.

**Recommandation** : restreindre le match au segment qui suit `/api/databases/` (ou au premier segment qui suit le prefixe reel une fois le point 10 leve), et harmoniser le cas mono-addon : verifier le path des qu'un identifiant y est extractible, quel que soit le nombre d'entrees. Cela supprime les deux incoherences d'un coup et rend la regle enoncable en une phrase.

---

## 12. La cle de cache du token d'addon n'inclut pas `apiUrl`

> **A VERIFIER A L'ECRITURE DE AC-35.12**, non re-controle dans ce tour.


**Ou** : `specs.md` §9.2 : cle `SHA-256(token_scalingo + app + addonId)`.

Deux blobs avec le meme token de compte, la meme app et le meme `addonId` mais deux regions differentes partagent la meme entree de cache. En pratique un addon n'existe que dans une region, donc le cas est theorique aujourd'hui. Mais une cle de cache qui omet un parametre de l'appel qu'elle memoise est une bombe a retardement, et l'ajouter coute une concatenation.

**Recommandation** : `SHA-256(token_scalingo + apiUrl + app + addonId)`. Meme remarque pour le cache de bearer, dont la cle est `SHA-256(token_scalingo)` alors que l'exchange depend de `SCALINGO_AUTH_URL` (variable d'instance, donc constante sur un process, le risque est nul mais l'argument est le meme).

---

## 13. L'etape 6 de l'ordre de verification est un no-op en v4

> **CLARIFICATION ACCEPTEE**, sans impact sur le code.


**Ou** : `specs.md` §8.4, etape 6 : « Validite du mode d'auth → 400 `invalid_auth_mode` ».

Pour un `AuthSpec`, la validite est integralement tranchee a l'etape 4 (dechiffrement et validation de structure, `401 invalid_credentials`, cf. §11.1.3). L'etape 6 ne peut donc concerner que les modes string. La spec ne le dit pas, et un dev qui lit §8.4 lineairement peut poser une validation d'AuthSpec a l'etape 6, ce qui produirait un `400` la ou §11.1.3 exige un `401`.

**Recommandation** : annoter l'etape 6 « modes string uniquement, les AuthSpec sont valides a l'etape 4 ». Une demi-ligne qui evite un mauvais code d'erreur. AC-34.10 et AC-34.11 encadrent la frontiere.

---

## 14. `blob_too_large` a la generation n'a pas de code specifie

> **IMPLEMENTE** : `blob_too_large` figure dans l'enum 400 de `/api/generate` (`src/routes/ui.tsx`).


**Ou** : `specs.md` §12.6 (« l'UI refuse la generation si le blob depasse 4 KB »), §15.2 (tableau des erreurs de `/api/generate`), `limits.md` §9.1.

`limits.md` §9.1 explique tres bien que le budget reel des valeurs de headers est de l'ordre de 2 KB et qu'une configuration respectant toutes les limites individuelles peut quand meme depasser les 4096 caracteres de blob. Le comportement serveur dans ce cas n'est specifie nulle part : §15.2 ne liste que `invalid_key` et `auth_limit_exceeded`, et `blob_too_large` n'est documente qu'en `414` cote proxy. `limits.md` demande par ailleurs que le message pointe les valeurs de headers plutot que les scopes, ce qui suppose bien une erreur serveur dediee.

**Recommandation** : ajouter au tableau §15.2 une ligne `400 blob_too_large`, avec la precision que le message doit designer la cause dominante (valeurs de headers ou scopes). Sinon l'utilisateur qui colle un gros secret recevra un refus generique et ira reduire ses scopes.

---

## 15. `/llms-full.txt` et les paths a un seul segment n'ont pas de comportement defini

> **RESOLU, ET MON HYPOTHESE ETAIT FAUSSE.** J'affirmais qu'un path a un seul segment tombait dans le 404 par defaut de Hono, sans shape FGP ni `X-FGP-Source`. Verification faite en ecrivant le test : le pattern `/:blob/*` matche aussi un path a un seul segment, `proxyMiddleware` compte les segments et repond `400 invalid_request` avec `X-FGP-Source: proxy`, exactement ce que decrit §8.2. Il n'y a pas de trou dans le contrat. AC-40.16 est debloque et couvert par deux tests verts.


**Ou** : `specs.md` §16.6 (non-goal) et §8.2 (`400 invalid_request` pour « moins de 2 segments »).

Le pattern du proxy est `/:blob/*`, qui exige au moins deux segments. Un `GET /llms-full.txt` ne matche donc ni une route FGP ni le proxy : il tombe dans le 404 par defaut de Hono, sans shape `{error, message}` et sans `X-FGP-Source`. Le `400 invalid_request` de §8.2 n'est jamais atteint pour ces paths, puisqu'il suppose que la route proxy ait matche.

Ce n'est pas grave, mais c'est un trou dans le contrat : FGP promet que toutes ses reponses portent `X-FGP-Source`, et cette famille de reponses ne le porte pas. Un client qui se fie au header pour attribuer une erreur n'a rien a lire.

**Recommandation** : specifier le comportement des paths a un seul segment non reconnus, avec une shape FGP et le header `X-FGP-Source: proxy`. AC-40.16 est ecrit de facon volontairement souple pour ne pas figer le mauvais comportement.

---

## 16. `/llms.txt` : le contenu de fond n'est testable que sur la forme

> **TRANCHE** : pas de liste de chaines de contenu, qui deviendrait un test de copie cassant a chaque reformulation sans rien proteger. Les tests verifient la structure llmstxt.org (H1 unique, blockquote, prose sans titre, sections H2 en listes de liens conformes), la taille, et la presence des URLs cles `/api/openapi.json` et `/api/docs`. Le perimetre des concepts (les six modes d'auth, les en-tetes FGP, `curl`) est verifie, le fond se relit a la main (recette F.1).


**Ou** : `specs.md` §16.4.

La section liste huit elements attendus, tous qualitatifs : « ce qu'est FGP et ce qu'il n'est pas », « deux ou trois exemples `curl` complets », « les codes d'erreur FGP ». Un test automatise ne peut verifier que la presence de chaines et la structure markdown. AC-40.8 fait ce qu'il peut : il cherche `METHOD:PATH`, les noms des six modes d'auth, `X-FGP-Key`, `X-FGP-Blob`, `X-FGP-Source` et des blocs `curl`. Au-dela, un test devient une tautologie qui verifie que le document contient ce que le test dit qu'il contient.

Consequence assumee : **la justesse du contenu de `/llms.txt` se relit a la main.** Un exemple `curl` faux, un code d'erreur perime, un mode d'auth oublie passeront tous les tests. Et c'est un document qui se perime a chaque evolution de contrat : `auth_exchange_failed` et `auth_addon_failed` viennent de naitre, ils devront y etre, et le prochain code d'erreur aussi.

**Recommandation** : deux choses. D'abord, que le PO fournisse la liste explicite des chaines qui doivent apparaitre, pour que le test soit un vrai garde-fou de perimetre plutot qu'un test de forme. Ensuite, ajouter `/llms.txt` a la checklist de `/sync-docs`, au meme titre que le README : c'est de la documentation versionnee, elle se desynchronise comme le reste.

---

## 17. BYOK combine a `logs.detailed` n'est pas traite

> **A ARBITRER PAR LE LEAD**, sans impact sur les tests de ce lot.


**Ou** : `specs.md` §15.5 et §14.8. Signale par le designer dans `byok-client-key.md` §12.3.

§15.5 affirme que la mutualisation ne concerne que la confidentialite du blob, pas les droits. C'est exact pour les scopes. C'est **incomplet** pour la feature logs : le body `detailed` est chiffre avec la cle client. Une cle mutualisee entre cinq blobs rend les bodies capturees des cinq blobs lisibles par tout porteur de la cle. La mutualisation n'etend pas les droits d'acces a l'API cible, mais elle etend bel et bien la portee de lecture des logs, ce qui est une consequence de securite reelle et non mentionnee.

**Recommandation** : au minimum, une phrase en §15.5 qui reconnait l'exception. Le designer proposait deux garde-fous plus fermes (TTL maximum impose quand une cle est fournie, ou refus de BYOK sur les blobs `logs.detailed`) ; c'est un arbitrage lead ou architecte, pas testeur. Je note simplement que §15.5 affirme aujourd'hui quelque chose de trop large.

---

## 18. Le test d'invariant sur les headers de securite doit enumerer les routes, pas une liste ecrite a la main

Point d'implementation plutot que de spec, mais il conditionne l'efficacite de la protection que le dev securite reclame.

AC-41.5 a AC-41.7 attrapent le scenario principal : quelqu'un repasse le middleware en `app.use("*")` et une reponse upstream se retrouve enrichie. Ces trois-la sont robustes, ils testent un comportement observable.

AC-41.9 vise l'autre moitie du risque, celle de §17.1 : « toute nouvelle route servie par FGP doit etre ajoutee a la liste des chemins couverts ». Si ce test itere sur une liste de routes ecrite a la main dans le fichier de test, il ne detectera jamais une route ajoutee sans y penser, puisque la meme personne qui oublie `FGP_OWNED_PATHS` oubliera la liste du test. Il doit enumerer les routes effectivement enregistrees sur l'app Hono et verifier que chacune, hors pattern proxy, repond avec `X-Content-Type-Options`.

Je le signalerai au dev au moment d'implementer. Je le note ici pour que ce ne soit pas perdu si quelqu'un d'autre ecrit ce test.

---

## 19. Ce qui n'est pas couvrable par des tests automatises en l'etat

Liste franche, avec ce qu'il faut faire a la main a la place.

**a) Tout le comportement dynamique de l'UI (AC-39.1 a AC-39.3, AC-39.6 a AC-39.16).** Le projet n'a aucune infrastructure de test DOM : `tests/testu/ui/` ne contient qu'un test de rendu JSX pur, et `tests/teste2e/` est vide. `reportValidity()`, la gestion du focus, `details.open`, les machines a etats des lignes d'addon ne s'assertent pas sans un DOM. Deux AC seulement sont couvrables par assertion sur le HTML rendu statiquement : AC-39.4 (absence de `required` / `minlength` / `pattern` sur `#byok-key`) et AC-39.17 (aucun script ni style inline). C'est peu, et c'est justement le piege du champ masque qui reste non couvert.

**Recette manuelle a faire, dans cet ordre, avant de declarer le lot livre** : pour chacun des cinq modes d'auth, remplir le formulaire et soumettre ; verifier qu'aucun mode ne bloque silencieusement et que la console ne contient pas `An invalid form control is not focusable`. Puis : saisir une cle BYOK de 10 caracteres, refermer le bloc, soumettre, verifier que le bloc se rouvre avec le message et le focus. Puis : aller-retour entre « Headers multiples » et `bearer` avec deux lignes saisies, verifier que les lignes survivent et que la soumission repart. C'est cinq minutes et ca couvre le risque principal du lot UI.

**Recommandation de fond** : ajouter `deno-dom` ou un harness equivalent et rendre `config-page.tsx` testable. Ce n'est pas dans le perimetre de ce lot, mais tant que ce n'est pas fait, chaque evolution de formulaire se recette a la main.

**b) La conformite reelle du mode `scalingo-addon` a l'API Scalingo.** Voir point 10. Nos tests valident notre hypothese. La recette demande un compte Scalingo avec au moins une base : generer un blob mono-addon, appeler la Database API a travers FGP, verifier que ca passe ; puis un blob multi-addon, verifier que la resolution retient la bonne base. Sans ce passage, le multi-addon est du code non valide.

**c) La justesse du contenu de `/llms.txt`.** Voir point 16. Relecture humaine, et idealement un essai reel : donner l'URL `/llms.txt` a un agent et lui demander de generer une URL FGP, c'est l'objectif fonctionnel enonce en §16.1 et le seul test qui le mesure vraiment.

**d) L'efficacite des headers de securite en navigateur.** On peut asserter la valeur des headers, pas leur effet. Que la CSP ne casse rien dans l'UI reelle, que `/api/docs` s'affiche correctement avec sa CSP dediee, que l'interface refuse bien de s'afficher en iframe : trois verifications navigateur, deux minutes.

**e) Le brute-force hors ligne d'une cle de 24 caracteres.** Assumption cryptographique, meme statut que les `Assumption AC-crypto.x` deja presentes dans le fichier d'AC. Non testable, justifie par le raisonnement de §15.4.

---

## Recapitulatif des arbitrages attendus

| # | Sujet | Qui tranche | Bloque quoi |
|---|-------|-------------|-------------|
| 1 | Justification `Referrer-Policy` et headers sur erreurs FGP de la route proxy | Lead / architecte | AC-41.12 |
| 2 | Shape de `auth` dans le partage `?c=`, partage ou non des identifiants d'addon | PO / architecte | AC-37.5, AC-37.6 |
| 3 | Shape de `valueRedacted` dans `/api/decode`, mention du changement de contrat | PO | AC-37.1 |
| 4 | Interdiction des caracteres de controle dans les valeurs de headers | Architecte | AC-34.19 |
| 5 | Liste de noms de headers reserves cote serveur, ordre strip / pose | Architecte | AC-34.22 |
| 6 | Comportement de `key: ""` | PO | AC-38.14 |
| 7 | Longueur max de la cle client : 256 ou 128 | PO | AC-38.5 |
| 8 | Charset des noms de headers : token RFC 7230 ou liste specs | Architecte | AC-34.18 |
| 9 | Mise a jour de `scalingo-addon-mode.md`, transport du `resourceId` | Designer / lead | AC-39.15 |
| 10 | Recette reelle du mode addon, ou livraison mono-addon seul | Lead | AC-35.2 a AC-35.7 |
| 11 | Regle de resolution multi-addon (segment cible, harmonisation mono/multi) | Architecte | AC-35.6, AC-35.7 |
| 12 | `apiUrl` dans la cle de cache du token d'addon | Architecte | AC-35.12 |
| 13 | Annotation de l'etape 6 de §8.4 | PO | rien, clarification |
| 14 | Code d'erreur `blob_too_large` sur `/api/generate` | PO | rien, complement |
| 15 | Comportement des paths a un seul segment inconnus | Architecte | AC-40.16 |
| 16 | Liste explicite des chaines attendues dans `/llms.txt` | PO | AC-40.8 |
| 17 | BYOK combine a `logs.detailed` | Lead | rien, complement §15.5 |

---

## 20. Decouvert en ecrivant les tests : `/logs` est exclu du mode header, et ce n'est ecrit nulle part

**Ou** : `src/middleware/proxy.ts`, `blobHeaderProxy()` ligne 348 environ. Absent de `docs/specs.md`.

```ts
if (proxyPath === "/logs" || proxyPath.startsWith("/logs/")) return next();
```

Une requete portant `X-FGP-Blob` sur `/logs` ou `/logs/stream` n'est **pas** proxyfiee, contrairement a tout autre chemin. Le comportement est **necessaire et correct** : la feature logs identifie elle-meme le blob a streamer par `X-FGP-Blob` et `X-FGP-Key` (§14.9). Sans cette exclusion, `/logs/stream` serait injoignable, chaque tentative d'ouverture de stream partant vers l'upstream.

Le probleme est documentaire. §16.2 prend la peine de dire, a propos de `/llms.txt`, que « la route n'est pas exclue du mode blob par header » et que c'est le comportement attendu. Un lecteur en conclut raisonnablement qu'aucune route n'est exclue. §14.9 ne mentionne pas la carve-out, §7.3 non plus. Quelqu'un qui refactorise `blobHeaderProxy` en se fiant aux specs supprimera ces deux lignes et cassera la feature logs, avec un symptome deroutant : le stream ne s'ouvre plus et renvoie du contenu upstream.

Je m'y suis fait prendre en ecrivant AC-41.6 : j'avais inclus `/logs` dans la liste des chemins censes etre proxyfies en mode header, sur la foi des specs.

**Recommandation** : une phrase en §14.9 et une en §7.3 disant que `/logs` et `/logs/*` sont les seules routes exclues du mode header, et pourquoi. J'ai ajoute AC-41.15 et son test (vert) pour que la suppression de la carve-out fasse echouer la CI plutot que de casser la feature en silence.

---

## Recapitulatif final des arbitrages

| # | Sujet | Statut |
|---|-------|--------|
| 1 | En-tetes sur les erreurs FGP du proxy | Tranche, implemente, teste |
| 2 | Shape de `auth` dans le partage `?c=` | Tranche, implemente, teste |
| 3 | Shape de `valueRedacted` | Tranche, implemente, teste |
| 4 | Caracteres de controle dans les valeurs de headers | Tranche, implemente, test a ecrire |
| 5 | Noms de headers reserves cote serveur | Tranche, implemente, test a ecrire |
| 6 | `key: ""` | Tranche, implemente, teste |
| 7 | Longueur max de la cle, et retrait du `maxlength` | Tranche, implemente, teste |
| 8 | Charset RFC 7230 | Tranche, implemente, test a ecrire |
| 9 | Transport du `resourceId` | Resolu par l'abandon du multi-addon, teste |
| 10 | Recette reelle du mode addon | Veto retenu, mono-addon livre |
| 11 | Regle de resolution multi-addon | Sans objet |
| 12 | `apiUrl` dans la cle de cache | A verifier a l'ecriture d'AC-35.12 |
| 13 | Annotation de l'etape 6 de §8.4 | Clarification acceptee |
| 14 | `blob_too_large` sur `/api/generate` | Implemente |
| 15 | Paths a un seul segment | Resolu, mon hypothese etait fausse, comportement conforme |
| 16 | Liste de chaines attendues dans `/llms.txt` | Tranche : structure et URLs cles, pas de test de copie |
| 17 | BYOK combine a `logs.detailed` | A arbitrer |
| 20 | Carve-out `/logs` du mode header non documentee | **Nouveau, a documenter** |

---

## 21. Le 404 de `/api/*` ne porte pas `X-FGP-Source`

**Ou** : le catch-all `app.all("/api/*", ...)` de `src/main.ts`. Constate en ecrivant les tests.

§8 fait de `X-FGP-Source` le moyen pour un client de savoir a qui attribuer une erreur, et §8.3 affirme que « tous les resultats de ces endpoints portent `X-FGP-Source: proxy`, que ce soit 2xx ou erreur ». Le 404 `not_found` de `/api/*` ne le porte pas : `res.headers.get("X-FGP-Source")` vaut `null`. Un client qui se fie au header n'a rien a lire sur cette famille de reponses.

C'est mineur en impact (le body a la bonne shape `{error, message}` et le status est sans ambiguite), mais c'est une promesse du contrat qui n'est pas tenue, et c'est exactement le genre d'exception qui rend une regle inutilisable : si le header est absent une fois, un client ne peut plus le traiter comme garanti.

**RESOLU le 2026-09-04.** Le lead a applique le fix en integration et l'a etendu au 404 de `/static/*`, qui avait le meme defaut et que je n'avais pas releve. Les deux posent desormais `X-FGP-Source: proxy` via `response.headers.set()`, comme le fait deja `app.onError`. Le test est passe au vert, le `ignore` a ete retire, et il couvre maintenant les deux chemins : `tests/testi/security-headers.test.ts`, « AC-41.11: les 404 generes par FGP portent X-FGP-Source proxy ».

---

## 22. La route proxy n'existe pas dans l'OpenAPI, ses codes d'erreur ne vivent que dans `/llms.txt`

**Ou** : `GET /api/openapi.json`, et la convention de `CLAUDE.md` : « OpenAPI : schemas de reponse stricts par route (union `z.enum([...])` des error codes autorises). Ajouter un nouveau code d'erreur = l'ajouter dans l'enum de la route correspondante. »

J'ai ecrit un AC qui verifiait que `auth_exchange_failed` et `auth_addon_failed` figurent dans l'enum de la route proxy. Il echouait, et pour une bonne raison : **la route proxy `/{blob}/*` n'a aucune definition OpenAPI**. La spec ne documente que les endpoints internes `/api/*`. La convention de `CLAUDE.md` est donc inapplicable telle quelle au coeur du produit.

Consequence concrete : `/llms.txt` presente `/api/openapi.json` comme le « machine-readable API contract », et un agent qui suit ce lien pour comprendre les erreurs du proxy n'y trouve rien. Le contrat d'erreur du proxy vit uniquement dans la prose de `/llms.txt`, qui est la seule surface ou il s'asserte (test `AC-36.12: les codes d'erreur du proxy sont documentes dans /llms.txt`, vert).

Ce n'est pas forcement un bug : documenter en OpenAPI une route dont le path, le status et le body dependent entierement du blob a peu de sens. Mais alors la formulation de `CLAUDE.md` merite d'etre precisee (« par route documentee »), et §16 pourrait dire explicitement que le contrat d'erreur du proxy vit dans `/llms.txt`, pas dans l'OpenAPI. Sinon quelqu'un cherchera un enum qui n'existe pas, comme je viens de le faire.
| 21 | 404 `/api/*` et `/static/*` sans `X-FGP-Source` | Corrige en integration, test vert |
| 22 | Route proxy absente de l'OpenAPI | Retenu, convention precisee dans `CLAUDE.md` |
