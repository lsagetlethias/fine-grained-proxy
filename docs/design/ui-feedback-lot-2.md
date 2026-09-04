# Design Document : second lot de retours, cause racine commune et gabarit d'alerte

**Branche** : `fix/ui-feedback-mobile-copy`
**Date** : 2026-09-04
**Auteur** : Designer FGP
**Statut** : Draft, prêt à intégrer
**Portée** : 7 retours de l'architecte sur la page en production, dont 5 partagent une cause racine unique
**Fichiers impactés (intégration dev)** : `src/ui/config/constants.ts`, `src/ui/config/form-auth.tsx`, `src/ui/config/form-delivery.tsx`, `src/ui/config/form-identity.tsx`, `src/ui/config/form-scopes.tsx`, `src/ui/config/result.tsx`, plus la chaîne de build des assets

> **Inventaire des identifiants : section 6**, qui fait foi comme contrat de sélecteurs. Aucun renommage.

---

## 0. Méthode et mise en garde

Mesures prises dans le navigateur sur la page servie en local, viewport 375 x 812, avec vérification visuelle par capture en plus des hauteurs calculées. Le point 1 a confirmé l'avertissement du lead : **un contrôle peut mesurer exactement la bonne hauteur et paraître faux**, tout dépend de la feuille de style effectivement servie.

Deux pièges de méthode rencontrés, à connaître pour reproduire :

**Chercher une classe à valeur arbitraire dans le CSS compilé demande de tenir compte de l'échappement.** Tailwind écrit `.h-\[2\.375rem\]{height:2.375rem}`. Un `grep '\.h-\[2\.375rem\]'` ne trouve rien et fait croire à tort que la classe est absente. J'ai commis l'erreur avant de la corriger : chercher la valeur brute, `grep '2.375rem'`, est fiable.

**Ajouter une classe Tailwind depuis la console ne prouve rien.** Le JIT ne génère que les classes présentes dans les sources. `self-end` n'étant utilisé nulle part, `classList.add('self-end')` n'a aucun effet et donne un faux négatif. Toutes les expérimentations de ce document utilisent des styles inline ou la suppression de règles via `CSSStyleSheet.deleteRule`.

---

## 1. Points 1 à 5 : une seule cause racine

### 1.1 Les cinq symptômes sont le même défaut

| Point | Symptôme rapporté | Reproduit |
| --- | --- | --- |
| 1 | « Charger » fait près du double de la hauteur du champ | oui, 58 px contre 38, ratio 1,53 |
| 2 | « Base de données » paraît plus petit que les autres | oui, 20,5 px contre 38 |
| 3 | « Décoder » trop petit en hauteur | oui, 20 px contre 34 |
| 4 | Dans « Tester un scope », ni les champs ni le bouton à la même taille | oui, champ 34, select 20,5, bouton 20 |
| 5 | L'icône du bouton oeil touche presque les bords | oui, bouton de 22 px de large pour une icône de 20, soit 1 px de marge |

Sur une feuille de style fraîchement compilée, **aucun des cinq ne se reproduit** : les sept paires sont bien à 0 px d'écart, la mesure du dev était juste. Les cinq apparaissent tous, simultanément et exactement, dès qu'on retire de la feuille de style les quatre règles suivantes :

```
.h-\[2\.375rem\]   .w-\[2\.375rem\]   .h-\[2\.125rem\]   .items-end
```

Vérifié par suppression de ces règles à l'exécution, puis mesure et capture. Le rendu obtenu est identique à ce que décrit l'architecte, y compris le « près du double » qui vaut précisément 1,53.

### 1.2 Pourquoi la disparition d'une classe est catastrophique et pas dégradée

C'est mon erreur de conception dans le lot précédent, et je l'assume.

Ma règle disait : « tout bouton adjacent à un champ reçoit la hauteur de l'échelle de son contexte, plus `inline-flex items-center justify-center`, et **perd son `py-*`** ». Retirer le padding vertical supprime la seule source de hauteur intrinsèque du bouton. La géométrie du contrôle repose alors **entièrement** sur une classe unique à valeur arbitraire, sans aucun repli.

Conséquence chiffrée quand cette classe n'est pas appliquée :

| Contrôle | Avec la classe | Sans la classe | Pourquoi |
| --- | --- | --- | --- |
| bouton `#btn-addon-load` | 38 px | 20 px, ou **58 px** si le parent n'est pas en `items-end` | plus de padding, donc hauteur du texte seul, ou étirement sur le groupe label plus champ |
| select `#addon-select` | 38 px | 20,5 px | plus de padding, hauteur de la ligne de texte |
| bouton `#btn-import-decode` | 34 px | 20 px | idem |
| select `#test-method` | 34 px | 20,5 px | idem |
| bouton oeil `#btn-byok-reveal` | 38 x 38 | **22 px de large**, icône de 20 | plus de padding, largeur de l'icône seule |

Le cas du bouton « Charger » cumule les deux défauts : sans `items-end` sur le parent, il retombe sur `align-items: stretch` et **s'étire sur la hauteur du sous-groupe label plus champ**, soit 58 px. C'est très exactement la règle que l'architecte énonce : le bouton prend la hauteur du groupe au lieu de celle du champ.

### 1.3 Pourquoi les classes manquent chez l'utilisateur : le cache navigateur

**Correction de mon diagnostic initial.** J'avais conclu à un `static/` périmé au déploiement. C'est faux, et le lead l'a vérifié en production : `version.txt` renvoie bien le SHA du dernier commit de `main`, la feuille contient `height:2.375rem`, `height:2.125rem` et `align-items:flex-end`, et le bundle porte `data-goto-doc`, `doc-return` et `returnLabel`. Le déploiement est correct.

La vraie cause est le **cache navigateur**. `/static/*` est servi en `max-age=86400` avec des **noms de fichiers stables**. Toute personne ayant ouvert la page dans les 24 heures précédant un déploiement conserve donc l'ancien CSS et l'ancien JS, tout en recevant le nouveau HTML. Elle voit un balisage neuf habillé par une feuille ancienne, ce qui est exactement l'état que je reproduisais en supprimant les quatre règles.

Le raisonnement reliant les six symptômes à une cause unique était juste, y compris pour l'inertie des liens « En savoir plus » qui dépendent de `static/client.js`. Je m'étais seulement trompé de mécanisme : ce n'est pas la production qui sert des assets périmés, c'est le navigateur qui les conserve.

Le correctif de fond est le **cache-busting sur les trois assets**, appliqué par le dev. C'est bien à ce niveau que le problème se règle, pas dans la feuille de style.

**Ce que cela ne change pas** : la fragilité de conception reste entière et le correctif de la section 1.4 reste nécessaire. Un cache-busting empêche la désynchronisation d'arriver, il n'empêche pas une mise en page de s'effondrer quand elle arrive quand même. Toute désynchronisation future entre balisage et feuille de style, quelle qu'en soit la cause, reproduirait les cinq symptômes. Une mise en page qui tombe de 38 à 20 px parce qu'une classe manque est fragile indépendamment de la raison pour laquelle elle manque.

### 1.4 Correctif de conception : défense en profondeur

Indépendamment de la cause de build, **une mise en page ne doit pas s'effondrer parce qu'une classe manque**. Je remplace ma règle du lot précédent par une règle à trois niveaux, où chaque niveau protège le précédent.

**Niveau 1, la hauteur intrinsèque. On garde le `py-*`, on ne le retire plus.** Tout contrôle **dépourvu de bordure visible** reçoit `border border-transparent`, ce qui compense exactement les 2 px de bordure du champ voisin. Cela vaut pour les boutons à fond plein **comme pour les boutons fantômes**, voir la correction en 1.4.1.

La hauteur intrinsèque n'est pas une valeur de padding à recopier, c'est une **soustraction** :

```
padding vertical = (hauteur d'échelle visée - interligne - 2 px de bordure) / 2
```

Le padding dépend donc de la taille de police du contrôle, ce que ma règle précédente passait sous silence en écrivant « `py-2` » et « `py-1.5` » comme si l'interligne était constant. Table complète, mesurée sur banc d'essai :

| Échelle | Taille de police | Interligne | Padding vertical | Hauteur obtenue |
| --- | --- | --- | --- | --- |
| 38 px | `text-sm` | 20 px | `py-2` | **38** |
| 38 px | `text-xs` | 16 px | `py-2.5` | **38** |
| 38 px | icône de 20 px | 20 px | `p-2` | **38** |
| 34 px | `text-sm` | 20 px | `py-1.5` | **34** |
| 34 px | `text-xs` | 16 px | `py-2` | **34** |
| 34 px | icône de 20 px | 20 px | `p-1.5` | **34** |

Contre-exemple mesuré, qui est exactement le piège rencontré : `text-xs` avec `py-2` donne **34 px et non 38**. Un contrôle en `text-xs` à l'échelle 38 réclame `py-2.5`.

**Niveau 2, l'indépendance au contexte flex.** L'alignement se déclare **sur l'élément** avec `self-end`, jamais sur le parent avec `items-end`. Mesuré :

| Recette | Parent `stretch` | Parent `items-start` | Parent `items-center` |
| --- | --- | --- | --- |
| padding intrinsèque seul | **58 px**, échec | 38 px | 38 px |
| padding intrinsèque plus `self-end` | **38 px** | **38 px** | **38 px** |

`self-end` est la pièce porteuse : sans lui, le padding intrinsèque ne suffit pas, l'étirement l'emporte. Avec lui, le bouton fait 38 px et reste aligné sur le bas du champ quel que soit l'alignement du parent. C'est la réponse à la demande « une règle qui ne dépende pas du contexte de flex ».

**Niveau 3, la hauteur explicite.** `CONTROL_H` et `CONTROL_H_SM` sont conservés, mais comme **confirmation** et non plus comme unique source. Si la classe disparaît, les niveaux 1 et 2 tiennent la mise en page.

Recette complète pour un bouton à fond plein, échelle standard :

```jsx
class={`${CONTROL_H} self-end shrink-0 inline-flex items-center justify-center rounded-md border border-transparent px-3 py-2 text-sm font-medium text-white bg-fgp-600 hover:bg-fgp-700 ...`}
```

Pour un bouton à icône seule, ajouter le pendant horizontal : `w-[2.375rem]` en confirmation, et surtout **`p-2` conservé** pour que l'icône de 20 px garde 8 px de respiration sans dépendre de la largeur imposée.

### 1.5 Inventaire des contrôles à reprendre

Padding déduit de la table du niveau 1 selon la taille de police, jamais recopié d'un contrôle voisin.

| Contrôle | Échelle | Police | Padding | Bordure | Ancrage |
| --- | --- | --- | --- | --- | --- |
| `#btn-addon-load` | 38 | `text-sm` | `py-2` | transparente | `self-end` |
| `#btn-load-apps` | 38 | `text-sm` | `py-2` | transparente | `self-end` |
| `#addon-select` | 38 | `text-sm` | `py-2` | déjà visible | aucun, il remplit sa colonne |
| `[data-header-remove]` via `REMOVE_BTN_CLASS` | 38 | icône 20 | `p-2` | **transparente** | `self-end` |
| `#btn-byok-reveal` | 38 | icône 20 | `p-2` | déjà visible | aucun, voir section 2 |
| `#btn-byok-copy` | 38 | `text-xs` | **`py-2.5`** | déjà visible | aucun, voir section 2 |
| `#btn-import-decode` | 34 | `text-sm` | `py-1.5` | transparente | `self-end` |
| `#btn-test-scope` | 34 | `text-sm` | `py-1.5` | transparente | `self-end` |
| `#test-method` | 34 | `text-sm` | `py-1.5` | déjà visible | aucun |
| `.copy-btn` via `RESULT_COPY_BTN_CLASS` | 34 | `text-xs` | **`py-2`** | déjà visible | `self-start` |

### 1.6 Les trois écarts d'intégration

#### `RESULT_COPY_BTN_CLASS` en `py-2` : le dev a raison, je confirme

Ma spec disait `py-1.5`. Ces boutons sont en `text-xs`, dont l'interligne vaut 16 px et non 20. `py-1.5` donne donc 16 plus 12 plus 2, soit **30 px**, alors que `CONTROL_H_SM` en annonce 34. Le niveau 1 et le niveau 3 de la défense en profondeur se contredisaient, et l'état dégradé retombait à 30.

`py-2` donne 16 plus 16 plus 2, soit **34 px**, ce qui aligne les deux niveaux. Aucun changement visuel en nominal, puisque la classe de hauteur imposait déjà 34.

L'erreur venait de ma règle, qui donnait des valeurs de padding fixes au lieu de la soustraction. La table du niveau 1 la corrige à la racine. **Le même défaut existe en sens inverse sur `#btn-byok-copy`**, en `text-xs` à l'échelle 38 avec `py-2` : il vaut 34 intrinsèquement au lieu de 38, et doit passer à `py-2.5`.

#### `self-start` sur `#byok-actions` et non sur les boutons : le dev a raison, je corrige ma spec

Ma spec se contredisait : le tableau d'inventaire désignait les boutons, le JSX de la section 2.2 désignait le conteneur. **Le conteneur fait foi**, et le tableau ci-dessus est corrigé en conséquence.

Le raisonnement du dev est le bon. `self-start` posé sur chaque bouton les sort de l'étirement mutuel du groupe, et « Copier » retombe alors à 34 face à un oeil à 38 dans l'état dégradé.

La règle générale à retenir : **`self-*` se pose sur l'élément qui participe directement à la rangée du champ.** Quand cet élément est un groupe de boutons frères, c'est le groupe qui le porte, et l'étirement mutuel à l'intérieur du groupe est un mécanisme voulu, pas une dépendance subie : deux boutons voisins qui doivent être égaux entre eux sont précisément le cas où l'étirement fait le bon travail.

Avec le passage de `#btn-byok-copy` à `py-2.5`, les deux boutons du groupe valent 38 px intrinsèquement et cet étirement devient un filet de sécurité plutôt qu'un mécanisme porteur. C'est la disposition souhaitable.

#### Les deux écarts résiduels : un fermé, un documenté en tolérance

**Le bouton de suppression, 2 px : je ferme.** C'est une erreur de ma spec, qui indiquait « bordure : aucune ». J'avais réservé la bordure transparente aux boutons à fond plein, alors qu'elle sert précisément à tout contrôle **dépourvu de bordure visible**, ce que ce bouton fantôme est aussi. Mesuré : icône de 20 px avec `p-2` sans bordure donne 36 px, avec bordure transparente donne **38 px**. La règle du niveau 1 est corrigée pour ne plus mentionner le fond mais l'absence de bordure.

**Les deux `select`, 1,5 px : je documente en tolérance.** La boîte de contenu d'un `<select>` dérive de la police et non de l'interligne, ce que le dev a correctement identifié. Mesuré sur banc d'essai, à padding et bordure identiques : un `<input>` fait 38 px, un `<select>` fait **36,5 px**.

Aucun cran de padding Tailwind ne tombe sur 38, et fermer l'écart demanderait une valeur arbitraire calculée pour une police donnée, du type `py-[0.53125rem]`. Ce serait réintroduire exactement la fragilité que ce lot supprime, pour 1,5 px.

**Portée de la tolérance** : elle ne s'applique **qu'à l'état dégradé**. En nominal, `CONTROL_H` impose 38 px et l'écart est nul, ce que j'ai mesuré. Le 1,5 px n'apparaît que si la classe de hauteur manque, c'est-à-dire dans un chemin devenu rare depuis le cache-busting. Un écart de 4 % dans un état de repli est acceptable, là où l'écart de 17,5 px du même contrôle sans padding ne l'était pas.

Pour les `select`, la classe de hauteur reste donc le mécanisme principal et le padding n'est qu'un filet. C'est le seul type de contrôle dans ce cas, et c'est écrit ici pour que personne ne le prenne plus tard pour un oubli.

## 2. Point 6 : la jauge doit s'arrêter à la largeur du champ

### 2.1 Constat

Mesuré à 375 px, bloc ouvert : la jauge fait **309 px** de large, le champ **191 px**. Elle dépasse de **118 px**, soit exactement la largeur des deux boutons et des deux gouttières.

La cause est structurelle : `#byok-strength` est un frère de la rangée, pas du champ. Il occupe donc toute la largeur de la rangée, boutons compris, alors qu'il ne qualifie que le contenu du champ.

### 2.2 Correctif : une colonne qui réunit le champ et sa jauge

```jsx
<div class="flex flex-wrap gap-2">
  <div class="min-w-[11rem] flex-1">
    <input id="byok-key" class="w-full ..." />
    <div id="byok-strength" class="mt-2 flex gap-1" aria-hidden="true"> ... </div>
  </div>
  <div id="byok-actions" class="flex shrink-0 gap-2 self-start"> oeil, Copier </div>
</div>
```

Trois déplacements de classes, aucun changement d'identifiant :

- une colonne intermédiaire reçoit `min-w-[11rem] flex-1`, qui quittent l'input
- l'input passe en `w-full`, il remplit la colonne
- `#byok-actions` reçoit `self-start` pour rester aligné sur le haut du champ et non centré sur une colonne devenue plus haute

### 2.3 Validation dans les deux dispositions

Le lead demandait de vérifier la cohérence avec le repli sous 360 px. Mesuré :

| Disposition | Champ | Jauge | Alignée | Boutons | Hauteur de rangée |
| --- | --- | --- | --- | --- | --- |
| une ligne, conteneur 309 px | 191 px | **191 px** | oui | sur la même ligne | 50 px |
| repli, conteneur 280 px | 280 px | **280 px** | oui | sous le champ | 96 px |

La jauge suit la largeur du champ dans les deux cas, y compris quand le champ passe en pleine largeur au repli. Le correctif est cohérent avec la spec de repli du lot précédent.

La rangée passe de 38 à 50 px, la jauge étant désormais dans le flux de la colonne au lieu d'être sous la rangée. Le bloc ne grandit pas pour autant : c'est la même hauteur totale, simplement répartie autrement.

---

## 3. Point 7 : il n'existe pas de gabarit d'alerte, il faut le créer

### 3.1 Constat élargi

L'architecte compare deux blocs. En réalité la page en compte six, avec six traitements différents.

| Bloc | Fond et bordure | Bordure gauche | Icône | Padding | Texte |
| --- | --- | --- | --- | --- | --- |
| `#byok-warning` | red-50 / red-300 | `border-l-4` | oui | `p-2` | `text-xs` red-800 |
| `#ttl-warning` | amber-50 / amber-200 | non | non | `p-2` | `text-xs` amber-700 |
| `#logs-detailed-warning` | amber-50 / amber-200 | non | non | `p-3` | titre gras plus `text-xs` |
| `#logs-feature-off` | blue-50 / blue-200 | non | non | `p-3` | `text-xs` blue-800 |
| `#error-banner` | red-50 / red-200 | non | non | `p-3` | `text-sm` red-700 |
| `#addon-target-warning` | **aucun** | non | non | aucun | `text-xs` amber-700 |

Le padding varie entre rien, `p-2` et `p-3`, la taille de texte entre `xs` et `sm`, les rampes sombres entre `amber-900/30` et `amber-900/20`. La différence que relève l'architecte n'est pas une hiérarchie, c'est une accumulation de décisions locales.

### 3.2 Décision : même gabarit, hiérarchie portée par la seule couleur

Je réponds à l'alternative posée par **la première branche, avec la hiérarchie écrite** : les blocs suivent un gabarit unique, et le niveau de gravité ne change **que** la rampe de couleur.

La structure devient invariante : même padding, même taille de texte, même icône, même bordure gauche. Trois niveaux :

| Niveau | Usage | Rampe claire | Rampe sombre |
| --- | --- | --- | --- |
| `info` | état de l'instance, rien à corriger | `bg-blue-50 border-blue-200 border-l-blue-500 text-blue-800` | `dark:bg-blue-900/30 dark:border-blue-700 dark:text-blue-300` |
| `caution` | imprudence, l'action reste permise | `bg-amber-50 border-amber-200 border-l-amber-500 text-amber-800` | `dark:bg-amber-900/30 dark:border-amber-700 dark:text-amber-300` |
| `danger` | risque de compromission, ou échec | `bg-red-50 border-red-300 border-l-red-500 text-red-800` | `dark:bg-red-900/30 dark:border-red-700 dark:text-red-300` |

Structure commune, à poser en constante dans `constants.ts` :

```
flex items-start gap-2 rounded-md border border-l-4 p-2 text-xs
```

Icône en `h-4 w-4 shrink-0`, toujours `aria-hidden="true"`, triangle d'avertissement pour `caution` et `danger`, cercle d'information pour `info`.

#### Le `display:flex` du gabarit écrase l'attribut `hidden`

Piège rencontré à l'intégration, et il est structurant. Trois des six blocs (`#ttl-warning`, `#addon-target-warning`, `#logs-feature-off`) pilotent leur visibilité par l'attribut `hidden`. Le gabarit leur pose `display:flex`, une déclaration d'auteur, qui bat le `[hidden] { display: none }` de la feuille de l'agent utilisateur. Résultat : les trois blocs deviennent visibles en permanence.

C'est le même conflit que celui du badge de clé personnalisée du lot précédent, dans l'autre sens. Là j'avais tranché par une règle d'évitement : « ne jamais poser une classe utilitaire de `display` sur un élément dont la visibilité est pilotée par `hidden` ». **Cette règle est maintenant caduque**, parce que le gabarit d'alerte a légitimement besoin de `flex` et que trois blocs ont légitimement besoin de `hidden`.

Le correctif appliqué par le dev est le bon, et il est général :

```css
@layer base {
  [hidden] { display: none !important; }
}
```

Il rend l'attribut `hidden` inconditionnellement prioritaire, ce qui est le comportement que tout le monde suppose déjà. Il retire la charge mentale de vérifier, à chaque ajout de classe, si l'élément est piloté par `hidden`. **Il remplace ma règle d'évitement du lot précédent**, qui n'était qu'un contournement.

#### `showError` écrasait l'icône

Second piège : `showError` remplaçait le contenu de la bannière par `textContent`, ce qui supprimait l'icône du gabarit dès le premier affichage d'erreur. Le dev a ajouté un élément dédié pour porter le message, l'icône restant en place. C'est la bonne réponse, et elle vaut comme règle : **un bloc d'alerte dont le contenu est écrit par le JS doit avoir un noeud de texte distinct de son icône**. L'identifiant est inventorié en section 6.

**Pourquoi la couleur seule suffit à hiérarchiser** : elle n'est jamais le seul vecteur, puisque le texte dit toujours ce qui se passe et que l'icône diffère entre information et avertissement. Le critère 1.4.1 est respecté. Ajouter en plus une icône sur l'un et pas sur l'autre, ou une bordure épaisse sur l'un et pas sur l'autre, ne renforce pas la hiérarchie, cela brouille la lecture du gabarit.

### 3.3 Affectation des six blocs

| Bloc | Niveau | Justification |
| --- | --- | --- |
| `#byok-warning` | `danger` | une clé partagée compromise expose tous les blobs générés avec elle, c'est une compromission en chaîne |
| `#error-banner` | `danger` | échec effectif d'une opération |
| `#ttl-warning` | `caution` | une URL sans expiration est une imprudence, pas une compromission |
| `#logs-detailed-warning` | `caution` | capture de payloads potentiellement sensibles, l'utilisateur choisit en connaissance de cause |
| `#addon-target-warning` | `caution` | incohérence probable entre le mode et la cible, non bloquante |
| `#logs-feature-off` | `info` | état de l'instance, aucune action attendue de l'utilisateur |

La hiérarchie est donc : `danger` pour ce qui compromet ou a échoué, `caution` pour ce qui est permis mais risqué, `info` pour ce qui est constaté. C'est cette phrase qui doit figurer dans la doc de contribution.

Deux conséquences visibles : `#addon-target-warning` gagne un encadré, il n'en avait aucun alors qu'il porte le même niveau que `#ttl-warning` ; `#error-banner` passe de `text-sm` à `text-xs` et de `p-3` à `p-2`, ce qui l'aligne sur les autres sans réduire sa lisibilité, sa couleur et sa position en faisant déjà un bloc saillant.

Le `font-semibold` sur la totalité du texte de `#logs-detailed-warning` disparaît : sur un bloc de deux lignes, le gras intégral ne hiérarchise plus rien.

**Le titre « Attention » en gras disparaît aussi, et je confirme cette lecture.** Ma consigne visait le gras appliqué à tout le texte, mais la conclusion vaut également pour le titre, et pour une raison propre au gabarit : dans un bloc qui porte déjà un triangle d'avertissement et une rampe ambre, le mot « Attention » ne transporte aucune information que l'icône et la couleur ne donnent pas déjà. Il consomme une ligne sur les deux du budget pour répéter le niveau de gravité.

La règle qui en découle : **un bloc d'alerte n'a pas de titre.** Le niveau est porté par l'icône et la couleur, le texte dit ce qui se passe et ce qu'il faut faire. Si un bloc a besoin d'un titre pour être compris, c'est que son texte est trop long pour un bloc d'alerte et qu'il relève de la documentation.

C'est du copy, donc le PO tranche derrière moi. S'il tient au titre, il faut savoir qu'il coûte une troisième ligne et fait sortir le bloc du budget de deux lignes fixé au lot précédent.

---

## 4. Les deux points pour information

### 4.1 Les liens « En savoir plus » : le mécanisme n'a pas de faille sur mobile

Testé sur le build local à 375 px, depuis l'onglet Changelog, donc dans le pire cas où la cible est dans un panneau masqué :

```
onglet Doc avant  : aria-selected=false
onglet Doc après  : aria-selected=true
défilement        : 758 -> 3865
cible visible     : oui
focus             : doc-client-key
```

Les deux liens existent avec leurs `data-goto-doc` et `data-return-label`, les deux cibles ont bien `tabindex="-1"`, `role="group"` et `aria-labelledby`. **Le mécanisme fonctionne de bout en bout, y compris sur mobile.** Il n'y a rien à corriger dans la spec.

Si le comportement est inerte en production, l'explication la plus probable est celle de la section 1.3, un `static/client.js` périmé au même titre que la feuille de style.

Si ce n'est pas ça, le seul piège d'intégration que je vois est un **ordre d'exécution inversé** : `scrollIntoView` appelé avant l'activation de l'onglet ne fait rien, parce que le panneau est encore en `display:none` et n'a donc aucune position. La spec impose l'ordre activation, ouverture des `details`, défilement, focus. C'est la première chose à vérifier dans le code du gestionnaire.

### 4.2 L'exemple Scalingo Database API : pas de structure nouvelle, mais un choix à faire

Le panneau Exemples est constitué de blocs `<details>` dans `sidebar-guides.tsx`. Un exemple supplémentaire suit ce gabarit sans rien inventer, donc **aucune structure particulière n'est nécessaire**.

Une recommandation de conception en revanche. Le formulaire possède déjà `#btn-preset-scalingo-db`, qui pré-remplit cible, mode d'auth, région et scope de départ. Un exemple qui se contenterait de lister ces valeurs en texte demanderait à l'utilisateur de les recopier, alors qu'un bouton les applique déjà. **L'exemple doit donc renvoyer vers le preset plutôt que dupliquer son contenu**, sur le même principe que les liens « En savoir plus » mais en sens inverse.

Cela suppose un mécanisme symétrique, du panneau vers le formulaire, que je n'ai pas spécifié et qui n'existe pas. Il est simple, un `[data-apply-preset="scalingo-db"]` qui déclenche le clic sur le bouton de preset puis renvoie le focus sur le champ cible, mais **c'est du périmètre à ouvrir, pas un ajustement**. À arbitrer avant que le PO écrive le contenu : soit l'exemple reste descriptif et autonome, soit il devient actionnable et il faut ce mécanisme.

---

## 5. Ce qu'il faut vérifier avant de refermer le lot

Le défaut de ce lot était invisible sur le code et visible seulement sur la page servie. La recette doit donc porter sur le rendu, pas sur la revue de code.

1. **Reconstruire les assets et vérifier que les quatre règles sont présentes** dans `static/styles.css`, en cherchant les valeurs brutes et non les sélecteurs échappés : `grep -c '2.375rem'`, `grep -c '2.125rem'`, `grep -c 'items-end'`.
2. **Mesurer à 375 px** les cinq paires de la section 1.1, toutes à 0 px d'écart.
3. **Recommencer la mesure après avoir supprimé les quatre règles** de la feuille de style à l'exécution. Avec le correctif de la section 1.4, les hauteurs doivent **rester correctes**, puisque le padding et `self-end` prennent le relais. C'est le test qui prouve que le point unique de défaillance a disparu, et c'est le seul qui aurait attrapé la régression.
4. **Vérifier la jauge** dans les deux dispositions, à 375 px et sous 360 px.
5. **Vérifier les six blocs d'alerte** après passage au gabarit unique, en clair et en sombre.
6. **Vérifier que les trois blocs pilotés par `hidden` sont bien masqués au chargement** : `#ttl-warning`, `#addon-target-warning` et `#logs-feature-off`. C'est le test du `[hidden]` en couche de base, et il échouait avant le correctif.
7. **Déclencher une erreur et vérifier que l'icône de la bannière survit**, la régression `showError` remplaçant tout le contenu.
8. **Vider le cache et recharger** après déploiement, puis recharger une seconde fois sans vider : c'est le scénario que le cache-busting doit rendre indolore.

---

## 6. Identifiants et fichiers : ce qui change

**Inventaire faisant foi.** Cette section est le contrat de sélecteurs de ce lot. Toute mention d'identifiant ailleurs dans le document est une illustration locale, pas un décompte : en cas d'écart, c'est cette liste qui fait référence.

**Aucun renommage.** Tous les `id` consommés par `assertElement` sont préservés.

**Ajoutés :**

- `#error-banner-message`, noeud de texte de la bannière d'erreur, distinct de son icône. `showError` écrit désormais dans ce noeud et non plus dans `#error-banner`, dont le `textContent` détruirait l'icône du gabarit. Le nom est une proposition, seule compte la séparation icône et texte.

**Changent de parent, `id` inchangé :**

- `#byok-key` et `#byok-strength` passent dans une colonne intermédiaire commune, section 2.2. La colonne n'a pas besoin d'identifiant.

**Supprimés :** aucun.

**Hors identifiants**, deux changements structurels à ne pas oublier :

- une règle `[hidden] { display: none !important; }` en `@layer base` dans `src/ui/tailwind.css`, qui ne contient aujourd'hui que les trois directives Tailwind
- trois constantes de gabarit d'alerte dans `src/ui/config/constants.ts`, une par niveau, plus la structure commune

---

## 7. Ce que je signale au lead

**Je m'étais trompé de mécanisme sur la cause racine.** J'avais conclu à un `static/` périmé au déploiement, le lead a vérifié que le déploiement est correct. La vraie cause est le cache navigateur, `max-age=86400` sur des noms de fichiers stables, qui fait cohabiter un HTML neuf et des assets vieux de moins de 24 heures. Le raisonnement reliant les six symptômes à une cause unique tenait, l'inférence sur le mécanisme non : j'ai conclu d'un rendu faux à un déploiement faux sans vérifier la production, alors que la question « quel navigateur voit quoi » restait ouverte. Le cache-busting est le correctif de fond et il est au bon endroit.

**Cela ne périme pas le correctif de conception.** Un cache-busting empêche la désynchronisation d'arriver, il n'empêche pas la mise en page de s'effondrer quand elle arrive. Toute désynchronisation future entre balisage et feuille de style reproduirait les cinq symptômes. Le test 3 de la section 5, mesurer après suppression des règles, reste la garantie, et il passe.

**Les deux arbitrages du dev sont justes, je confirme les deux.** Le `py-2` sur `RESULT_COPY_BTN_CLASS` est correct et mon `py-1.5` était faux : ces boutons sont en `text-xs`, dont l'interligne vaut 16 px et non 20. Ma règle donnait des valeurs de padding fixes en supposant un interligne constant. Elle est remplacée par une soustraction et une table à six entrées, section 1.4. **Le même défaut existe en sens inverse sur `#btn-byok-copy`**, en `text-xs` à l'échelle 38 avec `py-2`, qui vaut donc 34 et doit passer à `py-2.5`. Le dev ne l'a pas vu parce que l'étirement du groupe le masque en nominal.

Le `self-start` sur `#byok-actions` est également correct, et ma spec se contredisait : le tableau disait les boutons, le JSX disait le conteneur. Le conteneur fait foi, le tableau est corrigé. La règle générale est maintenant écrite : `self-*` se pose sur l'élément qui participe à la rangée du champ, et l'étirement mutuel entre boutons frères d'un même groupe est un mécanisme voulu, pas une dépendance subie.

**Sur les deux écarts résiduels, j'en ferme un et je documente l'autre.** Le bouton de suppression est une erreur de ma spec, qui réservait la bordure transparente aux boutons à fond plein alors qu'elle vaut pour tout contrôle sans bordure visible, boutons fantômes compris. Mesuré : 36 px sans, 38 px avec. Fermé.

Les 1,5 px des `select` deviennent une tolérance écrite. La boîte de contenu d'un `select` dérive de la police et non de l'interligne, et aucun cran Tailwind ne tombe sur 38. Fermer l'écart demanderait une valeur arbitraire calculée pour une police donnée, ce qui réintroduirait exactement la fragilité que ce lot supprime, pour 1,5 px. La tolérance ne vaut **que pour l'état dégradé** : en nominal la classe de hauteur impose 38 et l'écart est nul. C'est le seul type de contrôle dans ce cas, et c'est écrit pour que personne ne le prenne plus tard pour un oubli.

**Le correctif `[hidden] { display: none !important }` est la bonne réponse et il retire une de mes règles.** Au lot précédent j'avais tranché le conflit du badge par une règle d'évitement, ne jamais poser de classe de `display` sur un élément piloté par `hidden`. Le gabarit d'alerte la rend intenable, puisqu'il a besoin de `flex` et que trois blocs ont besoin de `hidden`. La couche de base rend l'attribut inconditionnellement prioritaire, ce que tout le monde suppose déjà, et supprime la charge mentale de vérifier à chaque ajout de classe. **Elle remplace ma règle d'évitement**, qui n'était qu'un contournement.

**Sur le titre « Attention », je confirme sa disparition.** Dans un bloc qui porte déjà un triangle et une rampe ambre, le mot ne transporte rien que l'icône et la couleur ne disent pas, et il consomme une ligne sur les deux du budget. La règle qui en découle est qu'un bloc d'alerte n'a pas de titre : si un bloc en a besoin pour être compris, son texte relève de la documentation. C'est du copy, le PO tranche derrière moi, en sachant qu'un titre coûte une troisième ligne et fait sortir du budget fixé au lot précédent.

**Un point de forme corrigé** : l'en-tête renvoyait à une section 7 inexistante. L'inventaire des identifiants est maintenant en section 6, et il est le contrat de sélecteurs de ce lot.
