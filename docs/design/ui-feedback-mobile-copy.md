# Design Document : retours d'usage, mobile et densité de copy

**Branche** : `fix/ui-feedback-mobile-copy`
**Date** : 2026-09-04
**Auteur** : Designer FGP
**Statut** : Draft, prêt à intégrer
**Portée** : 6 retours de l'architecte après usage réel, dont 4 visibles surtout sur mobile
**Fichiers impactés (intégration dev)** : `src/ui/config/constants.ts`, `src/ui/config/form-auth.tsx`, `src/ui/config/form-delivery.tsx`, `src/ui/config/form-identity.tsx`, `src/ui/config/form-scopes.tsx`, `src/ui/config/sidebar-doc.tsx`, `src/ui/config-page.tsx`, `src/ui/client/tabs.ts`

> **Aucun identifiant HTML n'est renommé.** Tous les `id` consommés par `assertElement` sont conservés à l'identique. Certains éléments changent de **position** dans le DOM sans changer d'`id`, et des `id` sont **ajoutés**. La **section 8 est l'inventaire faisant foi** : c'est elle qui sert de contrat de sélecteurs pour l'intégration, aucune autre liste de ce document n'est exhaustive.

---

## 0. Méthode

Tout ce document est basé sur des mesures prises dans le navigateur sur la page réelle servie en local, pas sur une lecture du code. Viewport mobile émulé à 375 x 812, viewport large à 1280. Les hauteurs sont des `getBoundingClientRect().height` arrondies.

Ce préambule a son importance sur le point 6 : deux des trois causes du problème de hauteur ne sont pas visibles en lisant les classes Tailwind, elles n'apparaissent qu'à la mesure.

---

## 1. Badge « Clé personnalisée active » sur mobile

### 1.1 Constat mesuré

À 375 px, badge affiché :

| Élément | Hauteur |
| --- | --- |
| `#byok-summary` | 76 px |
| `#byok-active-badge` | 52 px, soit 3 lignes de texte |

Le titre passe sur 2 lignes, le badge sur 3. Le badge ne déborde pas la page (`scrollWidth` reste à 375, son bord droit est à 342 pour un conteneur qui finit à 358), mais il déborde visuellement de sa forme de pilule : une pilule arrondie sur 3 lignes ne se lit plus comme un badge.

La cause est la combinaison `flex` sans `flex-wrap` sur le `summary`, `ml-auto` sur le badge, et aucune contrainte de retour à la ligne. Le badge est compressé par le titre jusqu'à ce qu'il casse à chaque mot.

### 1.2 Wireframe

Avant, 375 px :

```
  ┌──────────────────────────────────────────────────┐
  │  ⌄ Utiliser ma propre        ┌────────────────┐  │
  │    clé client (avancé)       │ Clé            │  │
  │                              │ personnalisée  │  │
  │                              │ active         │  │
  │                              └────────────────┘  │
  └──────────────────────────────────────────────────┘
```

Après, 375 px, titre court :

```
  ┌──────────────────────────────────────────────────┐
  │  ⌄ Ma propre clé client        ┌──────────┐      │
  │                                │  Active  │      │
  │                                └──────────┘      │
  └──────────────────────────────────────────────────┘
```

Après, 375 px, si le titre reste long :

```
  ┌──────────────────────────────────────────────────┐
  │  ⌄ Utiliser ma propre     ┌────────────────────┐ │
  │    clé client (avancé)    │ Clé perso. active  │ │
  │                           └────────────────────┘ │
  └──────────────────────────────────────────────────┘
```

### 1.3 Correctif structurel

Trois changements sur le `summary`, aucun sur les identifiants.

```jsx
<summary
  id="byok-summary"
  class="flex flex-wrap cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium text-fgp-700 ..."
>
  <svg class="h-3.5 w-3.5 shrink-0 ..." />
  <span class="min-w-0 flex-1">Ma propre cl&eacute; client</span>
  <span
    id="byok-active-badge"
    hidden
    class="shrink-0 whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
  >
    Active
  </span>
</summary>
```

Ce qui change et pourquoi :

- `flex-wrap` sur le `summary` : le badge peut passer sous le titre au lieu d'être écrasé
- `min-w-0 flex-1` sur le titre : il occupe la place disponible et cède le reste, `min-w-0` étant indispensable pour qu'un enfant flex accepte de rétrécir sous sa largeur de contenu
- `shrink-0 whitespace-nowrap` sur le badge : il garde sa forme de pilule sur une ligne, quoi qu'il arrive
- `ml-auto` est retiré, remplacé par le `flex-1` du titre qui pousse naturellement le badge à droite. `ml-auto` combiné à `flex-wrap` produit un décalage erratique quand le badge se retrouve seul sur sa ligne
- `inline-flex` devient... rien du tout, voir la section 2, c'est le même élément et le même bug

### 1.4 Mesures de validation

Correctif appliqué et mesuré à 375 px :

| Titre | Badge | Hauteur `summary` | Lignes |
| --- | --- | --- | --- |
| `Utiliser ma propre clé client (avancé)` (37) | `Clé personnalisée active` (24) | 64 px | 2 |
| `Utiliser ma propre clé client (avancé)` (37) | `Active` (6) | 64 px | 2 |
| `Fournir ma propre clé client` (28) | `Clé fournie` (11) | 44 px | 1 |
| `Ma propre clé client (avancé)` (29) | `Active` (6) | 44 px | 1 |
| `Ma propre clé client` (20) | `Active` (6) | 44 px | 1 |

Le badge ne fait plus jamais que 20 px, donc une ligne, dans tous les cas. Le correctif structurel suffit à supprimer le bug.

### 1.5 Budget de caractères pour le PO

Pour que le bloc tienne **sur une seule ligne** à 375 px, le budget mesuré est de **40 caractères cumulés titre plus badge**, avec une marge de sécurité conseillée à **36** puisque les accents et les espaces déplacent légèrement le seuil. Au-delà, le titre passe sur deux lignes, ce qui reste correct et lisible mais coûte 20 px.

Ce n'est pas une contrainte bloquante, c'est un budget. Je recommande de le dépenser côté titre plutôt que côté badge : le titre est lu à chaque visite, le badge n'apparaît que dans un cas sur dix.

---

## 2. Le badge s'affiche alors qu'aucune clé n'est saisie

### 2.1 Confirmation

Mesuré au chargement, sans aucune saisie :

```
byok-key.value          = ""
badge.hasAttribute      = true      (l'attribut hidden EST présent)
getComputedStyle.display = "flex"   (l'élément EST affiché)
badge height            = 52 px
```

Le diagnostic de l'architecte est exact. `[hidden] { display: none }` du preflight Tailwind a une spécificité de `(0,1,0)`, l'utilitaire `.inline-flex` aussi, et l'utilitaire est déclaré **après** le preflight dans la feuille compilée. À spécificité égale, le dernier déclaré gagne. L'attribut `hidden` ne masque donc rien.

Note de détail : le `display` calculé remonte `flex` et non `inline-flex`, parce que le badge est lui-même un enfant flex du `summary` et que sa valeur est blockifiée. Cela ne change rien au fond.

### 2.2 Ma préférence : corriger par la classe

**Retirer `inline-flex` du badge, garder l'attribut `hidden`.**

Le badge n'a pas besoin de `flex` : il ne contient qu'un texte. `inline-flex` y était pour aligner un éventuel point ou une icône, il n'y en a pas. Un `<span>` en `display: inline` par défaut rend exactement la même pilule, et l'attribut `hidden` reprend son rôle.

Pourquoi ce sens plutôt que passer à `classList.toggle("hidden")` :

- l'attribut `hidden` est la sémantique correcte pour « cet élément n'existe pas pour l'utilisateur ». Il est repris par les technologies d'assistance sans dépendre du CSS et il survit si la feuille de style tarde à charger
- les trois autres éléments du même panneau (`#addon-target-warning`, `#logs-feature-off`, `#logs-detailed-warning`) utilisent déjà l'attribut et fonctionnent. Basculer ce seul badge sur une classe créerait deux conventions concurrentes dans le même formulaire
- `byok.ts` pilote déjà le badge par `badge.hidden = ...`. Retirer la classe ne demande aucune modification du code client

**Règle générale à retenir** : ne jamais poser une classe utilitaire de `display` sur un élément dont la visibilité est pilotée par l'attribut `hidden`. C'est le seul endroit du formulaire où les deux coexistent, et c'est le seul qui casse.

---

## 3. Verbosité du bloc BYOK

### 3.1 Constat mesuré, 375 px, bloc ouvert

| Élément | Hauteur | Équivalent |
| --- | --- | --- |
| `#byok-warning` | 174 px | environ 9 lignes |
| `#byok-strength` + `#byok-strength-label` | 20 px | 1 ligne |
| `#byok-hint` | 64 px | 4 lignes |
| `#byok-details` ouvert, total | **473 px** | plus de la moitié d'un écran de téléphone |

Pour un bloc explicitement étiqueté « avancé », replié par défaut, c'est disproportionné. L'encadré rouge à lui seul fait plus de deux fois la hauteur du champ qu'il commente.

### 3.2 Répartition : ce qui reste, ce qui part

Le contenu détaillé **existe déjà** dans le panneau Doc, section « Infos sur les champs », entrée « Clé client » : mutualisation CI, non récupérabilité, indépendance des scopes, justification du plancher de 24 caractères lié au salt public. Le PO a déjà fait la migration. Il n'y a donc rien à écrire ailleurs, il y a seulement à **cesser de le dupliquer en ligne**.

| Contenu | Destination |
| --- | --- |
| La conséquence directe : une clé partagée qui fuite expose tous les blobs générés avec elle | **Reste en ligne**, c'est le seul message qui doit être lu avant de saisir |
| Réservez la mutualisation aux secrets de CI | Doc |
| La clé n'est jamais stockée, FGP ne peut ni la retrouver ni la réinitialiser | Doc |
| Sans elle le blob est inexploitable | Doc |
| Mutualiser ne partage pas les autorisations | Doc, déjà présent |
| Justification du plancher de 24 caractères | Doc, déjà présent |
| Contraintes de format (24 à 256, ASCII imprimable sans espace) | **Reste en ligne**, condensé sur une ligne |
| « Laissez vide pour que le serveur génère une clé unique » | **Reste en ligne**, c'est le comportement par défaut, il doit être dit là où on peut le subir |
| « La jauge mesure la variété des caractères, pas la sécurité réelle » | Doc, avec un renvoi |

### 3.3 Structure cible

```
  ┌──────────────────────────────────────────────────┐
  │  ⌄ Ma propre clé client            ┌──────────┐  │
  │                                    │  Active  │  │
  │  ┌────────────────────────────────────────────┐  │
  │  │ ⚠ Une clé partagée qui fuite expose tous   │  │
  │  │   les blobs générés avec elle.             │  │
  │  └────────────────────────────────────────────┘  │
  │                                                  │
  │  Clé personnalisée          Générer une clé forte│
  │  ┌──────────────────────────┐ ┌───┐ ┌─────────┐  │
  │  │ 24 caractères minimum    │ │ 👁 │ │ Copier  │  │
  │  └──────────────────────────┘ └───┘ └─────────┘  │
  │  ▭▭▭▭▭  ▭▭▭▭▭  ▭▭▭▭▭                             │
  │  Vide = clé générée. 24 à 256 caractères ASCII.  │
  │  En savoir plus sur la clé client                │
  └──────────────────────────────────────────────────┘
```

Objectif de hauteur : **`#byok-warning` sur 2 lignes maximum (environ 56 px avec le padding), `#byok-hint` sur 1 ligne (16 px)**, soit un bloc ouvert autour de 250 px au lieu de 473. Le PO écrit le texte, le budget est celui-là.

Le wireframe ci-dessus montre le champ, l'oeil et Copier **sur une seule ligne**. Ce n'est pas une licence de dessin, c'est une contrainte de mise en page à tenir, et elle demande deux corrections décrites en 3.4.

### 3.4 La rangée du champ : arbitrage tranché

#### Le constat du dev est exact

À 375 px, la rangée qui porte le champ, l'oeil et Copier fait **84 px au lieu de 38**. Les trois contrôles demandent 381 px pour 309 disponibles, et même en ramenant le champ à son plancher de `min-w-[12rem]` il en faut 310. Il manque **1 pixel**. Copier bascule seul sur une deuxième ligne, ce qui coûte 46 px des 73 px d'écart avec la cible.

#### Ce que le plancher change réellement

Point qui n'est pas intuitif et que j'ai vérifié à la mesure : **le plancher ne fixe pas la largeur du champ, il fixe seulement le seuil de retour à la ligne.** Le champ est en `flex-1`, il prend donc tout l'espace restant dès qu'il tient sur la ligne.

| Plancher | Hauteur de rangée | Largeur réelle du champ | Caractères visibles | Bloc BYOK |
| --- | --- | --- | --- | --- |
| `min-w-[12rem]` | 84 px | 263 px | 28 | 313 px |
| `min-w-[11rem]` | **38 px** | **191 px** | **19** | **267 px** |
| `min-w-[10rem]` | 38 px | 191 px | 19 | 267 px |

10rem et 11rem donnent **exactement le même rendu** : une fois que la rangée tient, le `flex-1` reprend la main et le plancher ne sert plus à rien. Descendre sous 11rem n'achète donc aucune largeur, seulement une tolérance sur des écrans plus étroits.

#### Décision : `min-w-[11rem]`, plus un regroupement des deux boutons

**J'applique la réduction du plancher.** Le `12rem` d'origine vient de ma propre spec de la révision 1, où c'était un nombre rond posé sans mesure, pas une décision étayée. Le corriger n'annule aucun arbitrage, cela remplace une valeur arbitraire par une valeur mesurée.

Le coût est de **19 caractères visibles au lieu de 28**, et il est acceptable. Ma spec `byok-client-key.md` §7.1.2 pose déjà la doctrine : le champ défile horizontalement, une clé de 256 caractères n'est de toute façon jamais lisible en entier, et **le bouton Copier est le moyen de récupérer la valeur, pas la sélection à la souris**. Dans ces conditions, le nombre de caractères visibles n'est pas un critère de décision, c'est un confort de vérification. 19 caractères sur les 32 d'une clé générée, soit 59 %, suffisent largement à un contrôle visuel.

L'argument qui emporte la décision est ailleurs. Après un clic sur « Générer une clé forte », la valeur est révélée et le focus part sur Copier. C'est le moment le plus important du bloc, et un Copier orphelin sur une deuxième ligne casse précisément le lien visuel entre « voici votre clé » et « copiez-la ». Une seule ligne renforce le seul geste qui compte.

**Deuxième correction, indispensable** : envelopper l'oeil et Copier dans un conteneur `shrink-0`.

```jsx
<div class="flex flex-wrap gap-2">
  <input id="byok-key" class="min-w-[11rem] flex-1 ..." />
  <div id="byok-actions" class="flex shrink-0 gap-2">
    <button id="btn-byok-reveal" ... />
    <button id="btn-byok-copy" ... />
  </div>
</div>
```

Sans ce conteneur, le retour à la ligne reste possible sur les écrans plus étroits que 360 px, et il se produit alors de la pire façon : l'oeil reste collé au champ, Copier part seul en dessous, et le champ n'y gagne même pas de largeur. Avec le conteneur, la dégradation devient intentionnelle.

Mesuré à 336 px de large :

| Structure | Champ | Caractères | Boutons |
| --- | --- | --- | --- |
| sans conteneur | 208 px | 21 | Copier orphelin sous l'oeil |
| **avec conteneur** | **254 px, pleine largeur** | **27** | **groupés ensemble sous le champ** |

Le repli donne donc un champ plus large et une rangée de boutons cohérente, au lieu d'un bouton égaré.

#### Seuil de bascule mesuré

Une seule ligne est tenue tant que le conteneur du bloc fait au moins **294 px**, ce qui correspond à un viewport d'environ **360 px**.

| Viewport | Rendu |
| --- | --- |
| 360 px et au-delà | une ligne, 38 px, de 19 à 28 caractères visibles selon la largeur |
| en dessous de 360 px | deux lignes, champ en pleine largeur, boutons groupés dessous |

360 px couvre la quasi-totalité du parc mobile actuel. En dessous, on trouve surtout les anciens iPhone SE à 320 px, qui obtiennent une dégradation propre. C'est un bien meilleur compromis que de viser le pixel près à 375 px.

#### Ce que je n'ai pas retenu

**Grappiller le pixel manquant** en réduisant `gap-2` à `gap-1.5` ou le padding de Copier à `px-2.5`. Cela passe à 306 px pour 309 disponibles, donc ça tient, mais avec 3 px de marge dépendant du rendu exact du mot « Copier » dans la police courante. Ce serait refaire exactement l'erreur du `mt-[1.375rem]` que je viens de faire retirer en section 6.2 : une constante calée sur le rendu du jour, qui casse au premier changement de police ou de libellé. `11rem` laisse 15 px de marge, c'est une tolérance, pas un ajustement.

**Passer Copier en bouton à icône seule** pour gagner 26 px. Cela ferait tenir la rangée avec `12rem` et un champ de 217 px. Rejeté pour deux raisons : l'affordance d'un mot est supérieure à celle d'un pictogramme de presse-papiers, et surtout `clipboard.ts` implémente son retour visuel en remplaçant `btn.textContent` par « Copié ! ». Sur un bouton à icône, cela détruirait le SVG de façon définitive, puisque le contenu d'origine restauré serait une chaîne vide. Le correctif déborderait sur les trois boutons de copie du bloc résultat.

**Déplacer Copier sur la ligne du label**, à côté de « Générer une clé forte ». Le champ gagnerait 28 caractères sur une ligne de 38 px, mais la ligne du label déborderait à son tour à 375 px, et un bouton qui agit sur le champ n'a rien à faire dans son intitulé.

#### Hauteur attendue après correction

Le bloc passe de 313 à **267 px** mesurés, avec l'avertissement encore sur 3 lignes. La troisième ligne que le PO est en train de retirer vaut 16 px, ce qui amène le bloc à environ **251 px** pour une cible de 250. La cible est donc atteinte par la conjonction des deux correctifs, et l'écart restant avec mon estimation d'origine venait bien de la rangée, pas du texte.

### 3.5 JSX de l'avertissement raccourci

L'encadré garde sa gravité visuelle, il perd sa longueur. Le `border-l-4` rouge et l'icône restent, c'est ce qui porte le niveau de danger, pas le nombre de mots.

```jsx
<p
  id="byok-warning"
  class="flex items-start gap-2 rounded-md border border-red-300 border-l-4 border-l-red-500 bg-red-50 p-2 text-xs text-red-800 dark:border-red-700 dark:border-l-red-500 dark:bg-red-900/30 dark:text-red-300"
>
  <svg class="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
    <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
  </svg>
  <span>{/* copy PO, 2 lignes max */}</span>
</p>
```

Trois changements structurels : le `<div>` à deux `<p>` devient un `<p>` unique, `p-3` passe à `p-2`, et l'icône passe de `h-5 w-5` à `h-4 w-4` pour rester proportionnée à un bloc de deux lignes. Le `font-semibold` disparaît : sur deux lignes, tout le texte est important, le gras sur la totalité ne hiérarchise plus rien.

L'`aria-describedby` de `#byok-key` reste `"byok-warning byok-strength-label byok-hint"`. Il est plus court à écouter, ce qui est un bénéfice direct pour les lecteurs d'écran.

### 3.6 Le renvoi vers la documentation

Le bloc porte un renvoi vers le panneau Doc. Le mécanisme complet, qui répond au §12.11 des specs, est spécifié en **section 9**. En résumé, côté `form-delivery.tsx` :

```jsx
<button
  type="button"
  id="byok-doc-link"
  data-goto-doc="doc-client-key"
  data-return-label="Cl&eacute; personnalis&eacute;e"
  class="mt-1 text-xs font-medium text-fgp-600 hover:text-fgp-800 focus:outline-none focus:underline dark:text-fgp-400 dark:hover:text-fgp-200"
>
  En savoir plus sur la cl&eacute; client
</button>
```

---

## 4. Verbosité du mode Scalingo Database API

### 4.1 Constat mesuré, 375 px

| Élément | Hauteur | Équivalent |
| --- | --- | --- |
| `#addon-region-urls` | 48 px | 3 lignes |
| `#addon-hint` | 96 px | 6 lignes |
| `#scalingo-addon-section` total | 423 px | |

Le paragraphe d'aide explique tout le flow d'échange en trois temps, à un endroit où l'utilisateur cherche simplement à désigner une base.

### 4.2 Répartition

Le panneau Doc contient déjà, sous « Mode d'auth », l'entrée « Scalingo Database API : token d'addon obtenu en trois temps, valable 1h et renouvelé automatiquement ».

| Contenu | Destination |
| --- | --- |
| Le mécanisme d'échange en trois temps | Doc, déjà présent |
| Le token valable 1 heure, renouvelé automatiquement | Doc, déjà présent |
| Le consommateur de l'URL ne voit ni le token de compte ni le token de base | Doc, à compléter |
| Une requête qui ne vise pas cette base est refusée | **Reste en ligne**, c'est la portée effective de l'URL générée |
| Les suggestions d'applications viennent de la liste déjà chargée | **Reste en ligne**, condensé, c'est une aide à la saisie du champ juste au-dessus |

Cible : **`#addon-hint` sur 2 lignes maximum**, plus un `#addon-doc-link` identique dans son principe à `#byok-doc-link`, pointant vers l'ancre `#doc-auth-modes` à créer sur l'entrée « Mode d'auth ».

### 4.3 `#addon-region-urls` passe de 3 lignes à 1

Le texte actuel répète l'API de compte et la cible attendue. La première information est redondante avec le libellé « Région » juste au-dessus, la seconde est la seule utile puisque c'est elle que l'utilisateur doit recopier dans le champ cible.

Cible : une ligne, la cible attendue seule. L'API de compte n'a pas besoin d'être affichée, elle est déduite de la région et l'utilisateur ne la saisit jamais.

Attention : cet élément est en `role="status"` et `aria-live="polite"`, il est annoncé à chaque changement de région. Le raccourcir améliore aussi cette annonce, qui fait aujourd'hui trois lignes lues à chaque clic sur une pilule.

---

## 5. Ordre des champs du mode Scalingo Database API

### 5.1 Le problème, confirmé à l'écran

Ordre actuel rendu : Mode, **Région**, **Application avec son bouton Charger**, **Base de données**, puis `#addon-hint`, puis **Token**.

L'utilisateur doit donc faire défiler l'écran vers le bas, saisir le token, remonter, puis cliquer sur Charger. Sur mobile, le token est hors de l'écran au moment où le bouton Charger est visible.

### 5.2 Ce que fait le mode Scalingo API, et pourquoi c'est le bon modèle

Enchaînement existant en mode `scalingo-exchange` :

```
Mode d'authentification
Token / Clé API            [ Charger les apps ]     <- credential et action sur la même ligne
Applications Scalingo                               <- résultat, juste dessous
Scopes
```

Le motif est : **credential, puis l'action qui le consomme, puis le résultat de l'action**. Le mode Database API le viole en plaçant l'action avant le credential.

### 5.3 Correctif retenu : une inversion de deux sections

Dans `config-page.tsx`, échanger `TokenSection` et `ScalingoAddonSection` :

```jsx
<AuthModeSection />
<CustomHeadersSection />
<TokenSection />            {/* remonte */}
<ScalingoAddonSection />    {/* descend */}
<ScalingoAppsSection />
<ScopesSection />
```

Ordre rendu en mode Database API : **Mode, Token, Région, Application avec Charger, Base de données.**

Vérification des autres modes, aucun n'est dégradé :

- `bearer` et `basic` : seul le Token est visible, il remonte de deux sections masquées, donc rien ne bouge à l'écran
- `scalingo-exchange` : Token avec « Charger les apps », puis `#scalingo-addon-section` masquée qui n'occupe aucune place, puis `#apps-section`. La liste des apps reste visuellement collée au token, le motif est préservé
- `header:` : `CustomHeadersSection` visible, Token masqué, aucun changement perceptible

### 5.4 Écart assumé avec la demande

La demande était **Région, Token, Application, Base**. Je livre **Token, Région, Application, Base**.

Trois raisons.

C'est **une inversion de deux lignes** dans `config-page.tsx`, contre un découpage de `ScalingoAddonSection` en deux composants avec deux `<fieldset>` et deux `<legend>` séparés par la section Token. J'ai argumenté en révision 2 de `scalingo-addon-mode.md` qu'un seul `<fieldset>` était la bonne structure pour trois contrôles interdépendants, et couper ce fieldset en deux pour insérer un champ étranger au milieu annulerait cette décision.

Le token n'est pas un prérequis du seul bouton Charger, c'est le **prérequis de tout le bloc Scalingo**. Le placer avant le bloc entier est plus juste que de l'insérer au milieu.

Cela **aligne les deux modes Scalingo** sur exactement la même séquence, credential d'abord, ce qui était la moitié de la demande.

Si l'architecte tient à Région en premier, l'alternative est le découpage en deux sections, et je veux qu'on tranche explicitement le renoncement au fieldset unique avant que le dev commence.

### 5.5 Déplacement de `#addon-status`, corollaire indispensable

Le message « Renseignez d'abord une application. » s'affiche aujourd'hui **sous le select des bases de données**, alors qu'il concerne le champ Application situé deux contrôles plus haut. Vérifié : le message n'apparaît qu'au clic sur Charger, mais il apparaît au mauvais endroit, ce qui donne exactement l'impression décrite par l'architecte, une erreur surgie sous un champ qu'on n'a pas touché.

**`#addon-status` doit passer sous le champ Application**, à l'intérieur du sous-groupe `flex min-w-[14rem] flex-1`, et non plus après le `<datalist>` en fin de fieldset.

Contraintes à respecter au déplacement :

- l'`id` reste `addon-status`, il est consommé par `assertElement`
- `aria-describedby="addon-status addon-hint"` sur `#addon-app` continue de fonctionner sans modification, la relation est portée par l'`id` et ne dépend pas de la position dans le DOM
- l'élément reste **monté en permanence**, vide par défaut. Une région live insérée au moment où elle reçoit son texte n'est pas annoncée de façon fiable
- il conserve `role="status"` et `aria-live="polite"`
- il prend `w-full` pour occuper sa propre ligne dans le conteneur `flex flex-wrap` parent

Wireframe cible, 375 px :

```
  Base de données Scalingo
  Région
  ┌───────────────┐ ┌──────────────────────────┐
  │ Paris         │ │ SecNumCloud              │
  └───────────────┘ └──────────────────────────┘
  Cible attendue : https://db-api.osc-fr1.scalingo.com

  Application
  ┌──────────────────────────┐ ┌─────────┐
  │ mon-app                  │ │ Charger │
  └──────────────────────────┘ └─────────┘
  ⚠ Renseignez d'abord une application.      <- ici, pas 2 champs plus bas

  Base de données
  ┌──────────────────────────────────────────┐
  │ Choisissez une base de données         ▾ │
  └──────────────────────────────────────────┘
  Une requête qui ne vise pas cette base est refusée.
  En savoir plus sur les modes d'auth
```

---

## 6. Hauteur des contrôles

C'est le point où je tranche, et le diagnostic change la réponse.

### 6.1 Mesures

Toutes les paires champ / contrôle adjacent de la page, mesurées :

| Paire | Champ | Contrôle | Écart |
| --- | --- | --- | --- |
| `#addon-app` / `#btn-addon-load` | 38 | 36 | 2 px, plus 2 px de décalage vertical |
| `#addon-app` / `#addon-select` | 38 | 37 | 1 px |
| `#header-value-h1` / `[data-header-remove]` | 38 | 36 | 2 px |
| `#byok-key` / `#btn-byok-reveal` | 38 | 38 | 0, même ligne flex |
| `#byok-key` / `#btn-byok-copy` à 375 px | 38 | **34** | **4 px**, le bouton passe seul sur sa ligne |
| `#token` / `#btn-load-apps` | 38 | 38 | 0, même ligne flex |
| `#import-blob` / `#btn-import-decode` | 34 | 32 | 2 px |
| `#test-path` / `#test-method` | 34 | 33 | 1 px |

Deux échelles coexistent dans la page et c'est volontaire : **38 px** pour le formulaire principal, **34 px** pour les sous-formulaires dans un `<details>` (import, test de scope). La hiérarchie est bonne, il faut la garder.

### 6.2 Trois causes, dont deux invisibles à la lecture du code

**Cause 1, la bordure.** Un champ porte `border` (1 px de chaque côté), un bouton à fond plein n'en a pas. À padding identique, le bouton est structurellement 2 px plus court. C'est l'écart `#btn-addon-load`, `[data-header-remove]`, `#btn-import-decode`.

**Cause 2, le rendu natif du `<select>`.** À padding et bordure identiques, un `<select>` mesure 1 px de moins qu'un `<input>`. C'est l'écart `#addon-select` et `#test-method`, que personne n'avait signalé et qui est pourtant systématique.

**Cause 3, et c'est la vraie.** Là où les hauteurs coïncident aujourd'hui, elles coïncident **par accident**. `align-items: stretch` est la valeur par défaut d'un conteneur flex : tant que le bouton partage sa ligne avec le champ, il est étiré à la hauteur de la ligne et l'écart des causes 1 et 2 est masqué. L'égalité disparaît dès que l'une de ces conditions tombe :

- le bouton **passe sur sa propre ligne** en `flex-wrap`. C'est `#btn-byok-copy` à 375 px, qui retombe à sa hauteur intrinsèque de 34 px. C'est exactement ce que l'architecte a vu
- la ligne porte `items-start`, ou le bouton porte une marge sur l'axe transversal. C'est `#btn-addon-load` et son `mt-[1.375rem]`, qui est **mon propre correctif de révision 1** pour compenser la hauteur du label. Un nombre magique calé sur une hauteur de label, qui casse l'étirement et fige le bouton 2 px trop court, 2 px trop bas. Je l'assume, il faut le retirer

### 6.3 Décision : agrandir les boutons, hauteur explicite, et cesser de dépendre de `stretch`

**J'aligne les contrôles sur la hauteur des champs, en posant une hauteur explicite plutôt qu'en comptant sur l'étirement.**

Agrandir plutôt que réduire, pour quatre raisons.

**Le rayon d'impact.** 38 px est la hauteur de *tous* les champs du formulaire principal : nom, cible, token, clé, application, headers. Réduire les champs pour aligner quelques boutons ferait payer à l'ensemble du formulaire un défaut qui concerne six contrôles.

**La cible tactile.** Le critère 2.5.8 de WCAG 2.2 exige 24 x 24 px minimum, le 2.5.5 recommande 44 x 44. Passer de 36 à 38 va dans le bon sens, passer de 38 à 34 va dans le mauvais. Ce sont les boutons **à icône seule** qui en dépendent le plus, l'oeil et la corbeille, dont la largeur est déjà égale à la hauteur : les faire passer de 38 x 38 à 34 x 34 dégraderait directement l'utilisabilité tactile.

**La lisibilité.** 34 px avec du `text-sm` est serré, et `#btn-byok-copy` est en `text-xs` dans une boîte qui devrait faire 38.

**La hiérarchie des deux échelles.** L'échelle compacte à 34 px existe déjà pour les sous-formulaires. Réduire l'échelle principale à 34 fusionnerait les deux et supprimerait la distinction visuelle entre le formulaire et ses panneaux repliés.

### 6.4 Implémentation

Deux jetons dans `src/ui/config/constants.ts` :

```ts
export const CONTROL_H = "h-[2.375rem]";
export const CONTROL_H_SM = "h-[2.125rem]";
```

2,375 rem valent 38 px et 2,125 rem valent 34 px pour une racine à 16 px, ce qui est le cas ici.

Règle d'application, à suivre partout où le motif se répète :

1. tout **bouton** adjacent à un champ reçoit la hauteur de l'échelle de son contexte, **plus `inline-flex items-center justify-center`**, et **perd son `py-*`**. Le padding vertical et la hauteur fixe se contrarient, la hauteur gagne et le padding devient un piège de débordement. Le centrage par flex rend le résultat indépendant de la taille de police, ce qui règle au passage le cas de `#btn-byok-copy` en `text-xs` dans une boîte de 38 px
2. tout **`<select>`** adjacent à un champ reçoit la même hauteur et perd son `py-*`, ce qui neutralise la cause 2
3. `#btn-addon-load` **perd son `mt-[1.375rem]`**, et sa rangée passe de l'alignement par défaut à `items-end`. Le bouton s'aligne alors sur le bas du champ quelle que soit la hauteur du label, sans nombre magique
4. **ne plus jamais compter sur `align-items: stretch`** pour égaliser un bouton et un champ. C'est ce qui rend le défaut invisible en développement sur écran large et visible en usage réel sur téléphone

Exemple sur le bouton de chargement :

```jsx
<div class="flex items-end min-w-[14rem] flex-1 gap-2">
  <div class="min-w-0 flex-1">
    <label for="addon-app" class={SUB_LABEL_CLASS}>Application</label>
    <input type="text" id="addon-app" ... class={FIELD_CLASS} />
  </div>
  <button
    type="button"
    id="btn-addon-load"
    class={`${CONTROL_H} shrink-0 inline-flex items-center justify-center rounded-md bg-fgp-600 px-3 text-sm font-medium text-white hover:bg-fgp-700 focus:outline-none focus:ring-2 focus:ring-fgp-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:cursor-not-allowed dark:focus:ring-offset-gray-900`}
  >
    Charger
  </button>
</div>
```

### 6.5 Inventaire à traiter

| Contrôle | Fichier | Jeton |
| --- | --- | --- |
| `#btn-addon-load` | `form-auth.tsx` | `CONTROL_H`, retirer `mt-[1.375rem]`, rangée en `items-end` |
| `#addon-select` | `form-auth.tsx` | `CONTROL_H`, retirer `py-2` |
| `[data-header-remove]` via `REMOVE_BTN_CLASS` | `constants.ts` | `CONTROL_H` plus `w-[2.375rem]`, retirer `p-2`, centrer l'icône |
| `#btn-load-apps` | `form-auth.tsx` | `CONTROL_H`, retirer `py-2`. Correct aujourd'hui par étirement, à figer |
| `#btn-byok-reveal` | `form-delivery.tsx` | `CONTROL_H` plus `w-[2.375rem]`, retirer `p-2` |
| `#btn-byok-copy` | `form-delivery.tsx` | `CONTROL_H`, retirer `py-2`. **Le cas le plus visible** |
| `#btn-import-decode` | `form-identity.tsx` | `CONTROL_H_SM` |
| `#test-method` | `form-scopes.tsx` | `CONTROL_H_SM`, retirer `py-1.5` |
| `#btn-test-scope` | `form-scopes.tsx` | `CONTROL_H_SM` |
| `.copy-btn` du bloc résultat via `RESULT_COPY_BTN_CLASS` | `constants.ts` | `CONTROL_H_SM` pour les trois collés à un `<input>`. Ceux collés à un `<pre>` gardent `self-start` |

Le bouton de génération `#btn-generate` n'est pas concerné : il est seul sur sa ligne en pleine largeur, sa hauteur est un choix de proéminence.

### 6.6 Vérification attendue du dev

Le défaut se cache sur écran large. La vérification doit se faire **à 375 px de large**, bloc BYOK ouvert et mode Database API sélectionné, en comparant les hauteurs mesurées et pas à l'oeil. Toutes les paires de la section 6.1 doivent tomber à 0 px d'écart.

---

## 7. Récapitulatif des hauteurs visées

| Élément | Avant, 375 px | Après |
| --- | --- | --- |
| `#byok-summary` | 76 px | 44 px avec un titre court, 64 px sinon |
| `#byok-active-badge` | 52 px, affiché à tort | 20 px, et masqué quand le champ est vide |
| `#byok-warning` | 174 px | environ 56 px |
| `#byok-hint` | 64 px | 16 px |
| `#byok-details` ouvert | 473 px | 267 px mesurés, environ 251 une fois l'avertissement à 2 lignes |
| Rangée du champ BYOK | 84 px | 38 px, voir 3.4 |
| `#addon-hint` | 96 px | environ 32 px |
| `#addon-region-urls` | 48 px | 16 px |
| Écarts de hauteur des contrôles | 1 à 4 px | 0 |

---

## 8. Identifiants : ce qui change, ce qui ne change pas

**Inventaire faisant foi.** Cette section est le contrat de sélecteurs de ce lot. Toute mention d'identifiant ailleurs dans le document est une illustration locale, pas un décompte : en cas d'écart, c'est cette liste qui fait référence, et c'est ici qu'il faut ajouter une entrée quand le lot évolue.

**Aucun renommage.** Tous les `id` consommés par `assertElement` sont préservés.

**Changent de position dans le DOM, `id` inchangé :**

- `#addon-status` passe sous le champ Application, section 5.5
- `#scalingo-addon-section` passe après `#token-section`, section 5.3

**Ajoutés :**

- `#byok-doc-link`, bouton de renvoi vers la doc
- `#addon-doc-link`, idem
- `#doc-client-key` et `#doc-auth-modes`, ancres cibles dans `sidebar-doc.tsx`, avec `tabindex="-1"`, `role="group"` et `aria-labelledby`
- `#doc-client-key-title` et `#doc-auth-modes-title` sur les `<dt>` correspondants, cibles de l'`aria-labelledby`
- `#doc-return`, contrôle de retour injecté à l'exécution, section 9.5
- `#byok-actions`, conteneur `shrink-0` groupant l'oeil et Copier, section 3.4

**Supprimés :** aucun.

**Attribut retiré :** la classe `inline-flex` de `#byok-active-badge`, section 2.2.

---

## 9. Mécanisme des renvois vers le panneau Doc

Réponse aux quatre questions laissées au designer par le §12.11 des specs. Tout ce qui suit a été prototypé et mesuré sur la page réelle, y compris les deux pièges des sections 9.2 et 9.3 qui ne se voient pas à la lecture du code.

### 9.1 Verdict sur les libellés du PO : ils sont validés, sa règle 3 tient

La question déterminante était : bascule d'onglet ou vraie navigation par ancre ?

**C'est une bascule d'onglet, pas une navigation.** Le mécanisme retenu ne touche ni à l'URL, ni à l'historique. En particulier, **il n'écrit pas de hash**, pour deux raisons :

- une entrée d'historique par consultation de la doc pollue le bouton Retour, qui devrait servir à revenir à la page précédente et pas à défaire un défilement
- l'URL de la page **porte déjà l'état du formulaire** via `share-config.ts`, qui appelle `history.replaceState`. Ajouter un fragment ferait cohabiter deux écritures concurrentes sur la même URL, avec un risque direct sur le partage et l'import de configuration

Par conséquent l'utilisateur ne quitte rien, la règle 3 du §12.11 s'applique telle quelle, et **les libellés « En savoir plus sur {sujet} » et « Voir {section} dans la doc » sont définitifs**, sous réserve du point 9.5 qui ajoute un troisième libellé, celui du retour.

### 9.2 Question 1 : bascule, ouverture, défilement, ou tout

**Les quatre, dans cet ordre strict**, dans un gestionnaire délégué unique sur `[data-goto-doc]` :

1. **activer l'onglet** de destination, quel que soit l'onglet courant
2. **ouvrir tous les `<details>` fermés**, en partant de la cible elle-même et en remontant jusqu'à la racine
3. **faire défiler** la cible dans la vue
4. **déplacer le focus** sur la cible

**Piège 1, l'ordre est contraignant.** `activate()` dans `tabs.ts` se termine par `tabs[index].focus()`. Vérifié : après un clic sur un onglet, `document.activeElement` vaut `tab-logs`. Si le dev déplace le focus avant de basculer l'onglet, la bascule le lui reprend et l'utilisateur atterrit sur le bouton d'onglet au lieu du contenu. L'activation doit précéder le focus.

**Piège 2, le parcours des `<details>` doit démarrer sur la cible, pas sur son parent.** Vérifié : avec un parcours qui commence à `target.parentElement`, une cible qui **est elle-même** un `<details>` reste fermée, le focus se pose dessus et l'utilisateur voit un `summary` replié. Le panneau Doc en contient un (« Les erreurs de FGP ») et le panneau Exemples en contient quatre, donc le cas est courant, pas théorique.

Un simple `<a href="#doc-client-key">` ne convient dans aucun de ces cas : dès que l'utilisateur n'est pas sur l'onglet Doc, la cible est dans un panneau `hidden` et le navigateur ne peut pas l'atteindre. Comme l'onglet Doc est actif par défaut, le défaut ne se manifesterait qu'une fois sur quatre, ce qui est la pire configuration pour le repérer en recette.

### 9.3 Question 2 : le comportement sur mobile

**Le même, sans variante conditionnelle.** Le panneau est le même DOM, seule sa position change : à droite au-dessus de 1024 px, sous le formulaire en dessous. Brancher le comportement sur le viewport ajouterait un chemin de code pour aucun gain.

Ce qui change, c'est **l'ampleur du déplacement**, et elle est décisive pour la question 4 :

| Viewport | Défilement au départ | À l'arrivée | Distance | Hauteur de page |
| --- | --- | --- | --- | --- |
| 639 px | 707 | 3154 | **2447 px** | |
| 375 px | 869 | 5368 | **4499 px** | 6180 px |

À 375 px, le lien projette l'utilisateur de 4499 px, soit environ cinq hauteurs et demie d'écran, depuis le milieu du formulaire jusqu'au bas de la page. Revenir à la main est un travail de pouce déraisonnable.

**Corollaire de libellé** : ne jamais écrire « voir la documentation à droite ». Le panneau n'est à droite que pour les écrans larges, et une formule de position serait fausse précisément pour les utilisateurs mobiles, à qui ce lot est destiné. Le §12.11 est déjà positionnel-neutre, rien à corriger.

### 9.4 Question 3 : le focus se déplace, et la cible a besoin d'un titre

**Oui, le focus se déplace.** Sans cela, on déclenche un changement de contenu à un endroit de la page où l'utilisateur ne se trouve pas : un utilisateur clavier ou lecteur d'écran reste au milieu du formulaire sans savoir que quoi que ce soit s'est produit. C'est le critère 3.2.2 sur les changements de contexte.

Le PO a raison sur la conséquence : **la cible a besoin d'un titre lisible à l'arrivée**. Poser `tabindex="-1"` sur le `<div>` qui enveloppe le `<dt>` et ses `<dd>` fait annoncer tout le groupe d'un bloc, sans dire d'abord de quoi il s'agit.

Correctif, sans restructurer la liste de définitions :

```jsx
<div
  id="doc-client-key"
  tabindex={-1}
  role="group"
  aria-labelledby="doc-client-key-title"
  class="focus:outline-none focus-visible:ring-2 focus-visible:ring-fgp-500 rounded-md"
>
  <dt id="doc-client-key-title" class="font-medium text-gray-800 dark:text-gray-200">
    Cl&eacute; client
  </dt>
  ...
</div>
```

À l'arrivée, un lecteur d'écran annonce « Clé client, groupe », puis le contenu. Le titre visible et le nom accessible coïncident, critère 2.5.3.

Le `focus-visible:ring` est nécessaire : un élément qui reçoit le focus par programme sans indicateur visible laisse un utilisateur voyant naviguant au clavier sans repère. `focus:outline-none` seul, sans anneau de remplacement, serait un échec du critère 2.4.7.

Note de mesure : la cible arrive à 35 px du haut du viewport, pas à 0, parce que le conteneur du panneau porte `sticky top-8`. Aucun `scroll-mt` n'est nécessaire.

**Cela ne change pas les libellés d'origine.** Le titre à l'arrivée est le `<dt>` existant, et la règle 2 du §12.11 impose déjà que le sujet du lien reprenne le mot du label. Les deux coïncident naturellement : le lien dit « la clé client », le titre d'arrivée dit « Clé client ».

### 9.5 Question 4 : oui, un retour est nécessaire

Avec 4499 px de déplacement sur mobile, un aller sans retour est un piège. **Il faut un retour, et il doit être visible, pas seulement accessible au clavier.**

Un lien `sr-only` ne suffit pas : l'utilisateur tactile voyant qui vient d'être téléporté est exactement celui qui a le plus besoin du retour, et il ne verrait rien.

**Forme retenue** : un contrôle de retour **injecté juste après le titre de la cible**, donc à l'endroit précis où l'utilisateur atterrit, et non en haut du panneau qu'il faudrait aller chercher au-dessus du point d'arrivée.

```jsx
<button
  type="button"
  id="doc-return"
  class="mb-2 inline-flex items-center gap-1 text-xs font-medium text-fgp-600 hover:text-fgp-800 focus:outline-none focus:underline dark:text-fgp-400 dark:hover:text-fgp-200"
>
  &larr; Revenir &agrave; Cl&eacute; personnalis&eacute;e
</button>
```

Comportement : défile jusqu'au lien d'origine et lui rend le focus. Il est retiré à la bascule d'onglet suivante ou au renvoi suivant, pour qu'il n'en subsiste jamais deux.

Le libellé nomme le champ d'origine, ce qui suppose que le lien de départ le déclare. D'où l'attribut `data-return-label` sur chaque `[data-goto-doc]`, visible dans le JSX de la section 3.6. Sans lui le retour dirait « Revenir au formulaire », ce qui viole la règle 1 du §12.11 dès qu'il y a plusieurs renvois sur la page.

**Ceci ajoute un troisième libellé à faire valider par le PO** : la forme « Revenir à {label du champ} », avec le label repris tel quel, majuscule comprise, puisqu'il s'agit de citer le champ et non de le décrire.

### 9.6 Récapitulatif pour le dev

| Élément | Emplacement | Rôle |
| --- | --- | --- |
| `[data-goto-doc="<id cible>"]` plus `data-return-label` | boutons dans le formulaire et le changelog | déclenche le renvoi |
| gestionnaire délégué unique | nouveau module client, ou `tabs.ts` | les 4 étapes de 9.2, dans l'ordre |
| `id`, `tabindex="-1"`, `role="group"`, `aria-labelledby` | cibles dans `sidebar-doc.tsx` | réception du focus et titre à l'arrivée |
| `#doc-return` | injecté après le titre de la cible | retour au point de départ |

Le gestionnaire a besoin d'activer un onglet depuis l'extérieur de `tabs.ts`. Le plus simple est de déclencher un `click()` sur le bouton d'onglet, ce que le prototype fait et qui fonctionne, plutôt que d'exporter `activate()`. Cela garde `tabs.ts` fermé et évite une dépendance croisée.

---

## 10. Ce que je signale au lead

**Le point 6 n'est pas un problème de valeurs de padding, c'est une dépendance à `align-items: stretch`.** Tant que l'égalité des hauteurs repose sur l'étirement flex, elle est correcte sur écran large et fausse dès qu'un contrôle passe sur sa propre ligne. C'est pour cela que le défaut n'a été vu qu'en usage mobile réel. Corriger uniquement les deux endroits signalés laisserait le mécanisme en place. La règle « hauteur explicite, jamais d'étirement implicite » est la partie qui compte.

**Le `mt-[1.375rem]` de `#btn-addon-load` vient de ma spec de révision 1 et c'était une erreur.** Un nombre magique calé sur la hauteur d'un label casse l'étirement et fige un décalage de 2 px. `items-end` fait le travail sans constante.

**Deux défauts non signalés sont réels et systématiques** : le `<select>` rend 1 px plus court que l'`<input>` à padding égal, sur `#addon-select` et `#test-method`. Ils sont inclus dans le correctif.

**Le libellé du renvoi vers la doc ne doit jamais être positionnel.** Le panneau Doc est à droite au-dessus de 1024 px et sous le formulaire en dessous. Écrire « voir à droite » serait faux pour tous les utilisateurs mobiles, c'est-à-dire ceux à qui ce lot s'adresse.

**Le renvoi vers la doc doit déplacer le focus**, pas seulement faire défiler. Sans cela on déclenche un changement de contenu ailleurs dans la page sans en informer un utilisateur clavier ou lecteur d'écran. Et il doit être un `<button>`, pas un `<a href="#...">` : la cible est dans un panneau `hidden` dès que l'utilisateur n'est pas sur l'onglet Doc, cas qui se produit une fois sur quatre et qui serait difficile à repérer en recette.

**Écart assumé sur le point 5**, Token avant Région au lieu de Région avant Token, pour préserver le fieldset unique décidé en révision 2 et rester sur une inversion de deux lignes. Détail et alternative en 5.4, à trancher explicitement si l'architecte n'est pas d'accord.

**Sur la rangée du champ BYOK, j'applique `min-w-[11rem]` et je maintiens le wireframe.** Le `12rem` était un nombre rond de ma révision 1, posé sans mesure ; le corriger ne renie aucun arbitrage. Le coût réel est de 19 caractères visibles au lieu de 28, ce qui est un confort de vérification et pas un critère, ma propre doctrine posant déjà que le bouton Copier est le chemin de récupération de la valeur. Le gain est de 46 px et surtout le maintien du lien visuel entre la clé générée et son bouton Copier, qui est le moment le plus important du bloc. Détail et alternatives écartées en 3.4.

**J'ai refusé de grappiller le pixel manquant** en réduisant les `gap` ou le padding de Copier. Cela tiendrait avec 3 px de marge dépendant du rendu du mot « Copier » dans la police courante, c'est-à-dire exactement l'erreur du `mt-[1.375rem]` que je viens de faire retirer. `11rem` laisse 15 px, c'est une tolérance et non un ajustement.

**Une deuxième correction accompagne la première et elle n'est pas optionnelle** : grouper l'oeil et Copier dans un conteneur `shrink-0`. En dessous de 360 px de viewport la rangée retourne à la ligne quoi qu'on fasse, et sans ce conteneur elle le fait mal, avec un Copier orphelin et un champ qui n'y gagne rien. Mesuré à 336 px : 254 px de champ et boutons groupés avec le conteneur, contre 208 px et un bouton égaré sans lui.

**Pour le PO, en réponse au §12.11** : ses deux libellés sont **définitifs**, le mécanisme est bien une bascule d'onglet et non une navigation, sa règle 3 tient. Il lui reste **un troisième libellé à écrire**, celui du retour, forme « Revenir à {label du champ} ». Détail en section 9, réponses point par point en 9.2 à 9.5.
