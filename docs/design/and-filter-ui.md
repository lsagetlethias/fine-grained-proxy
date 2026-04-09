# Design Document -- And Filter UI

**Feature** : type `and` dans les body filters (composition de conditions)
**Date** : 2026-04-09
**Auteur** : Designer FGP
**Statut** : Draft -- en attente de review lead
**Prerequis** : `body-filters-ui.md` (implem actuelle), type `not` deja en place

---

## Philosophie

Le `not` a pose le precedent : un sous-filtre imbrique dans un bloc encadre amber. Le `and` suit le meme pattern visuel (bloc encadre + enfants) mais avec N conditions au lieu d'une seule. Le challenge est de garder l'UI lisible quand on empile des sous-conditions, surtout quand un `and` contient lui-meme des `not`.

Principe directeur : **l'arbre logique visible doit toujours etre interpretable en 2 secondes**. Si l'utilisateur doit compter les niveaux d'indentation pour comprendre ce qui se passe, on a echoue.

---

## 1. Wireframes ASCII

### 1.1 Selecteur de type -- ajout de l'option "and"

Le select "Type" du filtre gagne une nouvelle entree :

```
  Type  : ┌────────────────────────────┐
          │ Valeur exacte          [*] │  --> type: "any"
          │ Pattern (wildcard)         │  --> type: "stringwildcard"
          │ Existe (toute valeur)      │  --> type: "wildcard"
          │ Exclure (not)              │  --> type: "not"
          │ Toutes les conditions (ET) │  --> type: "and"
          └────────────────────────────┘
```

Le label "Toutes les conditions (ET)" est explicite sur la semantique AND. Le "(ET)" en suffixe est coherent avec le "(not)" existant.

### 1.2 Bloc `and` vide -- etat initial

Quand l'utilisateur selectionne "Toutes les conditions (ET)", le bloc values disparait (meme comportement que `not` et `wildcard`) et un wrapper bleu apparait :

```
┌─────────────────────────────────────────────────────────┐
│  Filtre 1                                         [bin] │
│  Champ : [ deployment.git_ref                        ]  │
│  Type  : [ Toutes les conditions (ET) |v]               │
│                                                         │
│  ┌─ ET ─────────────────────────────────────────────┐   │
│  │                                                   │   │
│  │  (aucune condition)                               │   │
│  │                                                   │   │
│  │  [+ Ajouter une condition]                        │   │
│  │                                                   │   │
│  └───────────────────────────────────────────────────┘   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

Le wrapper bleu utilise la palette blue/sky pour se distinguer du amber du `not` :
- Light : `border-sky-200 bg-sky-50/50`
- Dark : `border-sky-700/50 bg-sky-900/10`

Le label "ET" en haut du bloc est `text-sky-700 dark:text-sky-400 font-medium text-xs`.

### 1.3 Bloc `and` avec deux conditions simples

Use case : "le git_ref doit commencer par `release/`" ET "le git_ref ne doit pas etre `release/broken`".

```
┌─────────────────────────────────────────────────────────┐
│  Filtre 1                                         [bin] │
│  Champ : [ deployment.git_ref                        ]  │
│  Type  : [ Toutes les conditions (ET) |v]               │
│                                                         │
│  ┌─ ET ─────────────────────────────────────────────┐   │
│  │                                                   │   │
│  │  Condition 1                                 [x]  │   │
│  │  Type  : [ Pattern (wildcard) |v]                 │   │
│  │  Valeur : [ release/*                          ]  │   │
│  │                                                   │   │
│  │                       ET                          │   │
│  │                                                   │   │
│  │  Condition 2                                 [x]  │   │
│  │  Type  : [ Exclure (not)      |v]                 │   │
│  │  ┌─ Exclure ─────────────────────────────────┐    │   │
│  │  │  Type  : [ Valeur exacte |v]              │    │   │
│  │  │  Valeur : [ release/broken              ] │    │   │
│  │  └───────────────────────────────────────────┘    │   │
│  │                                                   │   │
│  │  [+ Ajouter une condition]                        │   │
│  │                                                   │   │
│  └───────────────────────────────────────────────────┘   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

Points cles :
- Chaque condition dans le `and` a son propre select de type (meme options que le select parent, moins `and` lui-meme -- cf section 4 Limites UX)
- Le label "ET" entre les conditions est le meme separateur que celui entre les filtres du scope
- Le `[x]` a droite de chaque condition la supprime (avec confirmation si c'est un `not` ou un type avec des valeurs remplies -- non, en fait pas de confirmation, c'est un formulaire pas un delete en prod)
- Le `not` imbrique dans le `and` garde son wrapper amber existant, tel quel

### 1.4 Bloc `and` avec trois conditions (cas reel)

"Le git_ref doit commencer par `release/`, ne pas etre `release/broken`, et le champ doit exister" :

```
│  ┌─ ET ─────────────────────────────────────────────┐   │
│  │                                                   │   │
│  │  Condition 1                                 [x]  │   │
│  │  Type  : [ Pattern (wildcard) |v]                 │   │
│  │  Valeur : [ release/*                          ]  │   │
│  │                                                   │   │
│  │                       ET                          │   │
│  │                                                   │   │
│  │  Condition 2                                 [x]  │   │
│  │  Type  : [ Exclure (not)      |v]                 │   │
│  │  ┌─ Exclure ─────────────────────────────────┐    │   │
│  │  │  Type  : [ Valeur exacte |v]              │    │   │
│  │  │  Valeur : [ release/broken              ] │    │   │
│  │  └───────────────────────────────────────────┘    │   │
│  │                                                   │   │
│  │                       ET                          │   │
│  │                                                   │   │
│  │  Condition 3                                 [x]  │   │
│  │  Type  : [ Existe (toute valeur) |v]              │   │
│  │                                                   │   │
│  │  [+ Ajouter une condition]                        │   │
│  │                                                   │   │
│  └───────────────────────────────────────────────────┘   │
```

### 1.5 Mobile (< 640px)

Le wrapper `and` passe en pleine largeur avec un padding reduit. Le label "ET" separateur reste centre. Les conditions gardent le stack vertical deja utilise en mobile pour les filtres.

```
┌──────────────────────────────────┐
│ Filtre 1                   [bin] │
│ Champ :                          │
│ [deployment.git_ref           ]  │
│ Type :                           │
│ [Toutes les conditions (ET) |v]  │
│                                  │
│ ┌─ ET ────────────────────────┐  │
│ │ Condition 1            [x]  │  │
│ │ Type :                      │  │
│ │ [Pattern (wildcard)   |v]   │  │
│ │ Valeur :                    │  │
│ │ [release/*               ]  │  │
│ │                             │  │
│ │            ET               │  │
│ │                             │  │
│ │ Condition 2            [x]  │  │
│ │ Type :                      │  │
│ │ [Exclure (not)        |v]   │  │
│ │ ┌─ Exclure ─────────────┐  │  │
│ │ │ Type :                 │  │  │
│ │ │ [Valeur exacte    |v]  │  │  │
│ │ │ Valeur :               │  │  │
│ │ │ [release/broken     ]  │  │  │
│ │ └────────────────────────┘  │  │
│ │                             │  │
│ │ [+ Condition]               │  │
│ └─────────────────────────────┘  │
└──────────────────────────────────┘
```

---

## 2. Interactions

### 2.1 Creer un `and`

1. L'utilisateur a deja un filtre avec un champ rempli (ex: `deployment.git_ref`)
2. Il change le select Type de "Valeur exacte" vers "Toutes les conditions (ET)"
3. L'UI efface les valeurs existantes (meme comportement que le switch vers `not` ou `wildcard`)
4. Le wrapper bleu apparait avec "(aucune condition)" et le bouton "+ Ajouter une condition"
5. Le focus va sur le bouton "+ Ajouter une condition"

### 2.2 Ajouter une condition dans le `and`

1. Clic sur "[+ Ajouter une condition]"
2. Un bloc condition apparait avec : un select Type (defaut "Valeur exacte") et un input Valeur vide
3. Le focus va sur le select Type de la nouvelle condition
4. L'utilisateur choisit son type et remplit la valeur

### 2.3 Supprimer une condition du `and`

1. Clic sur le `[x]` a droite de la condition
2. La condition disparait immediatement (pas de confirmation)
3. Si c'etait la derniere condition, on revient a l'etat "(aucune condition)"
4. Le focus va sur la condition precedente, ou sur "[+ Ajouter une condition]" s'il n'en reste aucune
5. Les labels "ET" entre conditions se reajustent

### 2.4 Supprimer le filtre parent

Supprimer le filtre entier (bouton `[bin]` en haut a droite du filtre) supprime le `and` et toutes ses conditions d'un coup. Meme comportement que la suppression d'un filtre `not`.

### 2.5 Changer le type du filtre depuis `and` vers autre chose

Si l'utilisateur repasse de "Toutes les conditions (ET)" a "Valeur exacte" par exemple, toutes les conditions du `and` sont perdues. L'UI ne demande pas de confirmation (coherent avec le switch `not` -> autre type qui perd aussi les donnees).

### 2.6 Re-render apres chaque mutation

Chaque action (ajout, suppression, changement de type d'une condition) declenche `renderBodyFiltersPanel()` + `renderChips()`, exactement comme le `not` aujourd'hui.

---

## 3. Imbrication

### 3.1 Niveaux visuels

La hierarchie se lit par les couleurs de bordure et le retrait (`ml-3`) :

```
Niveau 0 : filtre standard (fond blanc/gray, pas de bordure speciale)
  └── Niveau 1 : and (bordure sky, fond sky-50/50)
        └── Niveau 2 : not (bordure amber, fond amber-50/50)
```

En dark mode :

```
Niveau 0 : fond gray-800
  └── Niveau 1 : and (bordure sky-700/50, fond sky-900/10)
        └── Niveau 2 : not (bordure amber-700/50, fond amber-900/10)
```

Le retrait de chaque niveau est `ml-3` (12px), coherent avec le `not` actuel. Chaque niveau ajoute un `ml-3` par rapport a son parent.

### 3.2 Combinaisons supportees dans l'UI

| Filtre parent | Peut contenir | Exemple |
|---|---|---|
| `and` | `any`, `stringwildcard`, `wildcard`, `not` | release/* ET pas release/broken |
| `and` > `not` | `any`, `stringwildcard` | (identique au `not` standalone) |

Le `and` dans l'UI **ne peut pas contenir un autre `and`** (cf section 4). Le `not` dans un `and` ne peut pas non plus contenir un `and` ou un `not`. Ca donne une profondeur max de 2 niveaux visuels apres le filtre de base.

### 3.3 Differenciateur visuel

Le contraste sky vs amber suffit a distinguer les deux types de blocs imbriques. Pas besoin d'icones ou de badges supplementaires : le label en haut de chaque bloc ("ET" vs "Exclure :") identifie clairement le type.

Palette recapitulative :

| Bloc | Bordure light | Fond light | Bordure dark | Fond dark | Label |
|---|---|---|---|---|---|
| `and` | `border-sky-200` | `bg-sky-50/50` | `border-sky-700/50` | `bg-sky-900/10` | `text-sky-700` / `dark:text-sky-400` |
| `not` | `border-amber-200` | `bg-amber-50/50` | `border-amber-700/50` | `bg-amber-900/10` | `text-amber-700` / `dark:text-amber-400` |

---

## 4. Limites UX

### 4.1 Profondeur max : 2 niveaux

Le backend supporte 10 niveaux de recursion (`depth > 10` dans `isValidObjectValue`). L'UI limite a **2 niveaux** :

- Niveau 0 : le filtre (champ + type)
- Niveau 1 : le `and` (liste de conditions) ou le `not` (une condition)
- Niveau 2 : un `not` dans un `and` (une condition dans une condition)

Concretement :
- Un `and` ne propose **pas** `and` dans le select de type de ses conditions enfants
- Un `not` dans un `and` propose uniquement `any` et `stringwildcard` (identique au `not` standalone actuel)
- Un `not` standalone ne propose pas `and` non plus

Ca couvre le use case reel (release/* ET pas release/broken) sans creer d'arbre illisible.

### 4.2 Nombre de conditions dans le `and`

Pas de limite dure cote UI, mais au-dela de 5 conditions, le wrapper commence a etre imposant visuellement. Le bouton "[+ Ajouter une condition]" reste toujours present. Si le besoin d'aller au-dela de 5 se manifeste, on reevaluera avec un pattern type "collapse/expand" sur le wrapper.

### 4.3 Power users

Les utilisateurs qui ont besoin de structures plus profondes (and dans and, not dans not) restent servis par l'edition directe du blob JSON. L'UI couvre 95% des cas reels, le reste passe par l'API.

---

## 5. Serialisation

### 5.1 Structure de donnees en memoire (bodyFiltersData)

Quand le filtre est de type `and`, l'objet filterData prend cette forme :

```js
{
  id: 42,
  objectPath: "deployment.git_ref",
  filterType: "and",
  values: [],         // vide -- les valeurs sont dans andConditions
  valueSubTypes: [],  // vide
  andConditions: [
    {
      id: 100,
      conditionType: "stringwildcard",   // type de la condition enfant
      value: "release/*",                // valeur pour stringwildcard/any
      valueSubType: "text",              // sous-type pour any (text/number/boolean/null)
      // si conditionType === "not" :
      notInnerType: null,                // type interne du not (any/stringwildcard)
      notInnerSubType: null,             // sous-type du not (text/number/boolean/null)
      notInnerValue: null                // valeur du not
    },
    {
      id: 101,
      conditionType: "not",
      value: "",
      valueSubType: "text",
      notInnerType: "any",
      notInnerSubType: "text",
      notInnerValue: "release/broken"
    }
  ]
}
```

### 5.2 Serialisation vers ObjectValue[]

Dans `buildScopes()`, le cas `and` se serialise comme suit :

```js
if (f.filterType === "and") {
  var andSubs = [];
  for (var ai = 0; ai < f.andConditions.length; ai++) {
    var cond = f.andConditions[ai];
    if (cond.conditionType === "any") {
      // serialiser selon valueSubType (text/number/boolean/null)
      andSubs.push({ type: "any", value: /* resolved value */ });
    } else if (cond.conditionType === "stringwildcard") {
      if (cond.value && cond.value.trim()) {
        andSubs.push({ type: "stringwildcard", value: cond.value.trim() });
      }
    } else if (cond.conditionType === "wildcard") {
      andSubs.push({ type: "wildcard", value: "*" });
    } else if (cond.conditionType === "not") {
      // reutiliser la meme logique que le not standalone
      var inner = serializeNotInner(cond);
      if (inner) andSubs.push({ type: "not", value: inner });
    }
  }
  if (andSubs.length > 0) {
    objValues.push({ type: "and", value: andSubs });
  }
}
```

### 5.3 Exemple concret de serialisation

**Input UI :**
- Champ : `deployment.git_ref`
- Type : Toutes les conditions (ET)
- Condition 1 : Pattern = `release/*`
- Condition 2 : Exclure > Valeur exacte = `release/broken`

**Output blob :**

```json
{
  "objectPath": "deployment.git_ref",
  "objectValue": [
    {
      "type": "and",
      "value": [
        { "type": "stringwildcard", "value": "release/*" },
        { "type": "not", "value": { "type": "any", "value": "release/broken" } }
      ]
    }
  ]
}
```

Le `and` est un seul element dans le tableau `objectValue`. Les autres elements de `objectValue` (s'il y en a -- cas OU implicite au niveau du filtre) restent a cote du `and`.

---

## 6. Chips

### 6.1 Resume dans la chip

La fonction `filterSummary()` doit gerer le nouveau type `and`. Le format :

```
field = (cond1 ET cond2 ET cond3)
```

Exemples concrets :

| Conditions | Chip |
|---|---|
| stringwildcard `release/*` + not any `release/broken` | `git_ref = (release/* ET pas release/broken)` |
| any `master` + any `main` (dans le and) | `git_ref = (master ET main)` |
| stringwildcard `release/*` + wildcard | `git_ref = (release/* ET exists)` |
| une seule condition stringwildcard `release/*` | `git_ref = (release/*)` |

Les parentheses et le " ET " sont le differenciateur visuel par rapport au OR implicite (qui utilise ` | ` sans parentheses).

### 6.2 Logique de filterSummary

```js
} else if (f.filterType === "and") {
  var andParts = [];
  for (var ai = 0; ai < f.andConditions.length; ai++) {
    var cond = f.andConditions[ai];
    if (cond.conditionType === "wildcard") {
      andParts.push("exists");
    } else if (cond.conditionType === "not") {
      var nv = (cond.notInnerValue || "").trim();
      andParts.push("pas " + (nv || "?"));
    } else {
      var cv = (cond.value || "").trim();
      andParts.push(cv || "?");
    }
  }
  if (andParts.length > 0) {
    parts.push(field + " = (" + andParts.join(" ET ") + ")");
  } else {
    parts.push(field + " = (vide)");
  }
}
```

### 6.3 Rendu visuel de la chip

```
┌─────────────────────────────────────────────────────────────────────┐
│ POST:.../deployments -> git_ref = (release/* ET pas release/broken) │
│                                                              [e] [x]│
└─────────────────────────────────────────────────────────────────────┘
```

Meme style que les chips existantes (`bg-fgp-50 border-fgp-200`, etc.). Pas de traitement special pour le `and` -- la chip est deja un resume textuel, les parentheses suffisent a montrer la composition.

### 6.4 Troncature

Si le resume du `and` depasse la largeur dispo, le `truncate` CSS existant sur le `textSpan` de la chip fait le travail. Le `title` (tooltip au hover) contient le texte complet.

---

## 7. Accessibilite

- Le wrapper `and` a `role="group"` avec `aria-label="Groupe de conditions ET"`
- Chaque condition a `aria-label="Condition N sur M"`
- Le label "ET" entre les conditions a `aria-hidden="true"` car le `role="group"` + le label du wrapper transmettent deja la semantique
- Le bouton "[+ Ajouter une condition]" a `aria-label="Ajouter une condition au groupe ET"`
- Le `[x]` de suppression d'une condition a `aria-label="Supprimer la condition N"`
- Focus management : memes regles que les filtres existants (focus sur le premier input apres ajout, focus sur le precedent ou le bouton add apres suppression)

---

## 8. Tableau Tailwind classes

| Element | Classes |
|---|---|
| Wrapper `and` | `mt-2 ml-3 rounded-md border border-sky-200 bg-sky-50/50 p-3 space-y-2 dark:bg-sky-900/10 dark:border-sky-700/50` |
| Label "ET" (header du wrapper) | `block text-xs font-medium text-sky-700 dark:text-sky-400` |
| Separateur "ET" entre conditions | `text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider text-center py-1` |
| Condition header | `flex items-center justify-between text-xs text-gray-600 dark:text-gray-400` |
| Bouton supprimer condition `[x]` | `text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400 text-xs` |
| Bouton ajouter condition | `text-sm text-sky-600 hover:text-sky-800 dark:text-sky-400 dark:hover:text-sky-200` |
| Not imbrique dans and | (identique au not standalone, pas de changement) |

---

## 9. Questions ouvertes pour le lead

1. **Label du select** : "Toutes les conditions (ET)" est explicite mais un peu long. Alternative : "Combiner (ET)". Preference ?

2. **Condition par defaut** : quand on cree un `and`, est-ce qu'on demarre avec 0 conditions (l'utilisateur clique + pour ajouter), ou avec 2 conditions vides (puisqu'un `and` avec une seule condition n'a pas de sens logique) ? Je recommande 0 -- c'est coherent avec le `not` qui demarre vide, et ca evite de forcer 2 blocs vides qui font "formulaire admin lourd".

3. **`and` avec une seule condition** : si l'utilisateur ne met qu'une seule condition dans le `and`, on serialise quand meme `{ type: "and", value: [single] }` ? Ou on unwrap vers juste `single` ? Le backend accepte les deux, mais unwrapper serait plus propre. Je recommande de serialiser tel quel (le backend gere), et d'ajouter un hint visuel type "Un groupe ET avec une seule condition equivaut a cette condition seule" en `text-xs text-gray-400`.
