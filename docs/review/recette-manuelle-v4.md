# Recette manuelle : lots v4 / BYOK / llms.txt / securite

**Date** : 2026-09-03
**Auteur** : testeur / QA
**Ref AC** : `docs/acceptance-criteria.md` v3.1, sections AC-34 a AC-42
**Duree totale** : environ 25 minutes, sequences A a E.

## A quoi sert ce document

Il couvre **ce que les tests automatises ne peuvent pas atteindre**, et rien d'autre. Chaque etape est ecrite pour etre executee sans connaissance prealable du lot, dans l'ordre, avec un resultat attendu binaire. Si une etape echoue, elle nomme l'AC concerne pour que le defaut soit rattachable.

Trois raisons rendent ces points non automatisables :

1. **Pas d'infrastructure de test DOM** dans le projet. `tests/testu/ui/` ne contient que des tests de rendu JSX, `tests/teste2e/` est vide. `reportValidity()`, le focus, `details.open` et les machines a etats ne s'assertent pas sans navigateur.
2. **Pas de compte Scalingo de test.** La conformite du mode addon a l'API reelle ne se verifie qu'avec des credentials.
3. **Le fond d'un document se relit, il ne s'assert pas.** La justesse de `/llms.txt` n'est pas mesurable par une regex.

## Prerequis

```
FGP_SALT=<valeur quelconque> deno task dev
```

Ouvrir `http://localhost:8000/` dans un navigateur, console ouverte (onglet Console, niveau « All »). La console est un instrument de mesure dans les sequences A et B : plusieurs echecs de ce lot ne se manifestent **que** par un message console.

---

## Sequence A : soumettabilite du formulaire (5 minutes)

C'est le risque principal du lot UI. Un champ `required` invalide dans un conteneur masque rend le formulaire impossible a soumettre **sans aucun message visible**. Le symptome est un bouton qui ne fait rien.

Couvre AC-39.1, AC-39.2, AC-39.3, AC-39.5, AC-39.7.

**A.1** Remplir une configuration minimale valide : cible `https://api.example.com`, un scope `GET:/v1/*`, un TTL au choix. Laisser le mode d'auth sur `bearer` et saisir un token quelconque.

**A.2** Pour **chacun** des cinq modes d'auth, dans cet ordre : `bearer`, `basic`, « Scalingo API », « Scalingo Database API », « Headers multiples ».

- Selectionner le mode.
- Completer les champs que le mode fait apparaitre (une valeur bidon suffit, on teste la soumission, pas la validite metier).
- Cliquer sur le bouton de generation.

**Attendu a chaque passage** : soit une URL est generee, soit un message d'erreur **visible** designe le champ fautif. Jamais un bouton qui ne produit rien.

**Echec caracteristique** : la console affiche `An invalid form control with name='...' is not focusable`. C'est AC-39.2 qui tombe, et c'est bloquant.

**A.3** Passer en « Headers multiples », saisir deux lignes completes, puis revenir sur `bearer`.

**Attendu** : la section Token reapparait, le champ Token est de nouveau obligatoire, et la soumission repart. (AC-39.3)

**A.4** Revenir sur « Headers multiples ».

**Attendu** : les deux lignes saisies en A.3 sont toujours la, avec leurs valeurs. Un aller-retour dans le selecteur ne doit pas detruire la saisie. (AC-39.3)

**A.5** Cliquer dans le champ Token, puis, sans quitter le champ, selectionner « Headers multiples » au clavier.

**Attendu** : le focus atterrit sur le selecteur de mode d'auth, pas dans le vide. Verifier au clavier avec Tab que la navigation continue normalement. (AC-39.7)

---

## Sequence B : cle client (BYOK) (6 minutes)

Couvre AC-39.4, AC-39.6, AC-39.8, AC-39.9, AC-39.10, AC-39.19, AC-39.20, AC-39.21.

**B.1** Formulaire valide, bloc « Cle client » **ferme**, champ vide. Soumettre.

**Attendu** : generation normale, une cle serveur est renvoyee. Aucune validation ne se declenche sur le champ masque. (AC-39.5)

**B.2** Ouvrir le bloc, saisir 10 caracteres, **refermer le bloc**, soumettre.

**Attendu, dans cet ordre** : le bloc se rouvre tout seul, le champ recoit un contour d'erreur, le focus s'y pose, et un message annonce le minimum de 24 caracteres. (AC-39.6)

**Echec caracteristique** : rien ne se passe, ou le bloc reste ferme avec le focus perdu.

**B.3 (test de non-regression demande explicitement par le designer)** Coller dans le champ une chaine de **plus de 300 caracteres** ASCII imprimables. Pour en fabriquer une, dans la console : `"x".repeat(310)` puis copier le resultat.

**Attendu, les quatre points** :
- la valeur du champ fait bien 310 caracteres, **pas 256**. Le verifier dans la console avec `document.getElementById("byok-key").value.length`.
- le message « 256 caractères maximum. » s'affiche.
- la soumission est bloquee.
- en appelant `POST /api/generate` directement avec cette meme chaine, le serveur repond `400 invalid_key`.

**Pourquoi cette etape existe** : un `maxlength="256"` tronquait le collage en silence. L'utilisateur croyait avoir sa cle, le blob etait chiffre avec les 256 premiers caracteres, et l'echec ne se manifestait qu'au premier appel proxyfie, sans aucune piste. Le message de longueur maximale etait par construction inatteignable. (AC-39.19)

**B.4** Vider le champ, verifier dans la console que l'element n'a ni `required`, ni `minlength`, ni `pattern`, ni `maxlength` :

```js
["required","minlength","pattern","maxlength"].map(a => document.getElementById("byok-key").hasAttribute(a))
```

**Attendu** : `[false, false, false, false]`. (AC-39.4)

**B.5** Saisir successivement ces quatre valeurs et observer la jauge :

| Saisie | Niveau attendu |
|--------|----------------|
| 10 caracteres | trop courte, bloquant |
| `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa` | faible |
| 30 caracteres, 10 distincts, une seule famille | moyenne |
| une cle hexadecimale aleatoire de 32 caracteres | **élevée** |

**Attendu** : la jauge compte **trois** segments, et la cle hexadecimale sort en « élevée ». (AC-39.20, AC-39.21)

**Pourquoi la derniere ligne compte** : une cle hexadecimale de 32 caracteres, c'est 128 bits d'entropie, une bonne cle. L'ancien palier la retrogradait, ce qui faisait mentir la jauge dans le sens le plus penalisant, decourager une saisie correcte.

**B.6** Saisir une cle valide, refermer le bloc.

**Attendu** : un badge reste visible sur la ligne du resume, indiquant qu'une cle personnalisee est active. Vider le champ le fait disparaitre. (AC-39.8)

**B.7** Cliquer sur le bouton de reinitialisation des presets.

**Attendu** : le champ est vide, le bloc referme, le badge disparu, la jauge a zero. (AC-39.9)

**B.8** Ressaisir une cle, puis appliquer un preset Scalingo.

**Attendu** : la cle est **conservee**. Elle est orthogonale a la cible. (AC-39.10)

---

## Sequence C : mode Scalingo Database API (4 minutes sans compte, 10 avec)

Couvre AC-36.16, AC-39.13, AC-39.14, AC-39.15, AC-35.24.

### C.1 Sans compte Scalingo

**C.1.a** Selectionner « Scalingo Database API ».

**Attendu** : un champ application, un bouton de chargement, un selecteur de base. **Aucun bouton d'ajout, aucun compteur, aucune limite affichee** : le mode est mono-addon depuis l'arbitrage du 2026-09-03. La presence d'un bouton « Ajouter une base » signale une integration faite sur la version perimee de la spec design. (AC-39.16, obsolete)

**C.1.b** Saisir un nom d'application qui n'existe pas et charger.

**Attendu** : le message designe **le nom de l'application** comme la cause, l'input recoit un contour d'erreur, et le focus lui est rendu. Le message ne doit parler ni du token ni du reseau. (AC-36.16)

### C.2 Avec un compte Scalingo (leve l'hypothese principale du lot)

**C.2.a** Token de compte reel, une application possedant une base. Charger les bases.

**Attendu** : le libelle de l'option est lisible, du type `my-db-123 · PostgreSQL`. Pas un ObjectID brut. (AC-39.15)

**C.2.b** Selectionner la base, generer, puis decoder le blob via `POST /api/decode`.

**Attendu** : la configuration contient `app` et `addonId`, et **pas** le `resourceId` affiche dans le libelle. Ce champ est de l'affichage, il s'arrete au navigateur. (AC-35.24, AC-39.15)

**C.2.c** Appeler la Database API a travers l'URL FGP generee, avec un scope autorisant l'appel.

**Attendu** : la requete aboutit. C'est la seule verification qui valide le flow en trois temps contre l'API reelle. (AC-35.1)

**C.2.d** Changer la region apres avoir selectionne une base.

**Attendu** : la selection est reinitialisee, le selecteur vide et desactive. Les identifiants d'addon ne sont pas valides d'une region a l'autre. (AC-39.13)

**C.2.e** Modifier le nom d'application apres avoir selectionne une base.

**Attendu** : la selection est reinitialisee. Garder une base appartenant a une autre application produirait un blob silencieusement faux. (AC-39.14)

> **Si C.2 n'est pas executable faute de compte**, le dire dans le rapport de livraison. Les tests automatises du mode addon valident la conformite du code a notre hypothese sur les URLs Scalingo, pas la justesse de l'hypothese. Le mono-addon reduit fortement le risque (aucune resolution depuis le path), mais l'etape 2 du flow reste non verifiee contre l'API reelle.

---

## Sequence D : partage de configuration et fuites (4 minutes)

Couvre AC-37.7, AC-37.9, AC-37.12, AC-37.13.

**D.1** Configuration en « Headers multiples » avec deux valeurs secretes reconnaissables (par exemple `SECRET-AAA-1111` et `SECRET-BBB-2222`), plus une cle BYOK reconnaissable.

**D.2** Produire l'URL de partage et **la lire en entier**.

**Attendu** : ni `SECRET-AAA-1111`, ni `SECRET-BBB-2222`, ni la cle BYOK n'y apparaissent, sous aucune forme. (AC-37.7)

**D.3** Ouvrir l'URL de partage dans un onglet de navigation privee.

**Attendu** : les noms de headers sont restaures, les champs de valeur sont **vides** et signales a ressaisir. Une generation immediate sans ressaisie est refusee. (AC-37.9)

**D.4** Configuration en « Scalingo Database API » avec une application et une base, produire l'URL de partage, l'ouvrir en navigation privee.

**Attendu** : le mode et la region sont restaures. **Le nom de l'application et l'identifiant de la base sont vides.** Une URL de partage circule dans les tickets, elle ne doit pas transporter la topologie d'un compte Scalingo. (AC-37.12, AC-37.13)

---

## Sequence E : en-tetes de securite en navigateur (3 minutes)

Couvre l'effet reel des en-tetes, que les tests peuvent affirmer mais pas eprouver.

**E.1** Charger `/` et `/logs`, console ouverte.

**Attendu** : **aucune** violation CSP dans la console. Une seule violation signifie qu'un script ou un style inline a ete introduit, et que la CSP sans `unsafe-inline` est desormais contournee ou cassee. (AC-39.17, AC-41.2)

**E.2** Charger `/api/docs`.

**Attendu** : Swagger UI s'affiche et fonctionne, avec sa CSP dediee. Verifier dans l'onglet Reseau que l'en-tete `Content-Security-Policy` de cette reponse contient bien `unsafe-inline` et l'origine du CDN, et n'a pas ete remplace par la CSP stricte. (AC-41.3, AC-41.14)

**E.3** Creer un fichier local contenant `<iframe src="http://localhost:8000/"></iframe>` et l'ouvrir.

**Attendu** : le cadre reste vide, la console signale un refus. Une page qui manipule des tokens n'a rien a faire dans le cadre d'un tiers. (AC-41.9)

**E.4** Provoquer une erreur FGP sur la route proxy (appeler `/{blob}/quelque-chose` sans en-tete `X-FGP-Key`) et lire les en-tetes de la reponse dans l'onglet Reseau.

**Attendu** : `X-FGP-Source: proxy` **et** les en-tetes de securite. (AC-41.12)

**E.5** Faire un appel proxyfie qui aboutit reellement a la cible, et lire les en-tetes.

**Attendu** : `X-FGP-Source: upstream` et **aucun** en-tete de securite. C'est l'invariant ADR-0006, et c'est le contraire de E.4. Les deux etapes ensemble prouvent que la discrimination fonctionne. (AC-41.5, AC-41.6)

---

## Sequence F : relecture de `/llms.txt` (3 minutes)

Le fond du document n'est pas testable. Les tests verifient la structure, la taille et la presence de mots-cles. La justesse se relit.

**F.1** Charger `/llms.txt` et lire le document en entier.

**Points a verifier a l'oeil** :
- Les exemples `curl` sont-ils **executables tels quels** ? Les copier et les lancer.
- Les codes d'erreur cites existent-ils tous encore ? Verifier en particulier `auth_exchange_failed`, `auth_addon_failed` et `app_not_found`, et l'**absence** de `addon_not_resolved`, supprime par l'arbitrage du 2026-09-03.
- Les six modes d'auth sont-ils decrits ? Le mode `scalingo-addon` est-il decrit comme mono-addon, sans mention d'une liste de bases ?
- Le document est-il en anglais de bout en bout ?

**F.2 (facultatif, mais c'est le seul test qui mesure l'objectif reel)** Donner l'URL `/llms.txt` a un agent LLM sans autre contexte et lui demander de generer une URL FGP correcte. C'est l'objectif fonctionnel enonce en §16.1 des specs. Si l'agent echoue, le document ne remplit pas son role, quels que soient les tests au vert.

---

## Rapport

Pour chaque sequence, noter : executee ou non, resultat, et l'AC concerne en cas d'echec. Signaler explicitement les sequences non executees plutot que de les omettre, en particulier C.2 si le compte Scalingo n'etait pas disponible.
