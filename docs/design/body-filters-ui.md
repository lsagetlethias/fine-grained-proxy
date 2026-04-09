# Design Document -- Body Filters UI

**Feature** : ADR 0004 -- Body filters sur les scopes structurés (blob v3)
**Date** : 2026-04-09
**Auteur** : Designer FGP
**Statut** : Draft -- en attente de review lead

---

## Philosophie

L'UI actuelle est minimaliste et fonctionne bien. Les body filters sont une feature avancée que 80% des utilisateurs n'utiliseront pas. Le design suit donc le principe de **progressive disclosure** : le textarea des scopes reste le point d'entrée principal, et les body filters se greffent dessus de manière opt-in sans alourdir le parcours de base.

---

## 1. Wireframes ASCII

### 1.1 Etat de base -- aucun body filter (identique a aujourd'hui)

```
┌─────────────────────────────────────────────────────────────────┐
│  Scopes (patterns METHOD:PATH)                                  │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ GET:/v1/apps/*                                            │  │
│  │ POST:/v1/apps/my-app/deployments                          │  │
│  │ GET:/v1/apps/my-app/variables                             │  │
│  │                                                           │  │
│  └───────────────────────────────────────────────────────────┘  │
│  Un pattern par ligne. Wildcard * pour tout matcher.            │
│                                                                 │
│  ┌──────────────────────────────────────────────┐               │
│  │ + Ajouter des filtres body sur un scope...   │               │
│  └──────────────────────────────────────────────┘               │
└─────────────────────────────────────────────────────────────────┘
```

Le bouton "Ajouter des filtres body" est un bouton texte discret sous le hint du textarea (style `text-sm text-fgp-600`). Il ne s'affiche que si au moins un scope POST/PUT/PATCH existe dans le textarea.

### 1.2 Transition -- scope avec body filter ajouté

Quand l'utilisateur clique sur "Ajouter des filtres body", un panel apparait sous le textarea. Il liste les scopes eligibles (POST/PUT/PATCH) extraits du textarea et permet d'attacher des filtres a chacun.

```
┌─────────────────────────────────────────────────────────────────┐
│  Scopes (patterns METHOD:PATH)                                  │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ GET:/v1/apps/*                                            │  │
│  │ POST:/v1/apps/my-app/deployments                          │  │
│  │ GET:/v1/apps/my-app/variables                             │  │
│  └───────────────────────────────────────────────────────────┘  │
│  Un pattern par ligne. Wildcard * pour tout matcher.            │
│                                                                 │
│  ┌ Body Filters (avancé) ─────────────────────────────── [x] ┐  │
│  │                                                           │  │
│  │  POST:/v1/apps/my-app/deployments              [replié >] │  │
│  │                                                           │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

Le panel "Body Filters (avancé)" a un header avec un bouton fermer `[x]`. Chaque scope eligible apparait comme une ligne repliable. A droite, un chevron `>` indique qu'on peut deplier.

### 1.3 Scope deplie -- edition des filtres

```
┌ Body Filters (avancé) ──────────────────────────────── [x] ┐
│                                                             │
│  ▼ POST:/v1/apps/my-app/deployments                        │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                                                     │    │
│  │  Filtre 1                                     [bin] │    │
│  │  Champ : [ deployment.git_ref              ]        │    │
│  │  Type  : [ Valeur exacte        |v]                 │    │
│  │  Valeurs :                                          │    │
│  │    [ master                     ] [x]               │    │
│  │    [ main                       ] [x]               │    │
│  │    [+ Ajouter une valeur]                           │    │
│  │                                                     │    │
│  │  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │    │
│  │                                                     │    │
│  │  Filtre 2                                     [bin] │    │
│  │  Champ : [ deployment.source_url           ]        │    │
│  │  Type  : [ Pattern (wildcard)    |v]                │    │
│  │  Valeurs :                                          │    │
│  │    [ https://github.com/my-org/* ] [x]              │    │
│  │                                                     │    │
│  │  [+ Ajouter un filtre]                              │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  > GET:/v1/apps/my-app/variables        (pas de body)       │
│                              grayed out, non depliable       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

Legende des elements :
- `[bin]` : icone poubelle pour supprimer un filtre
- `[x]` a cote d'une valeur : supprimer cette valeur
- `[+ Ajouter une valeur]` : bouton texte pour ajouter un champ valeur supplementaire
- `[+ Ajouter un filtre]` : bouton texte pour ajouter un nouveau filtre sur ce scope
- Le select "Type" propose : "Valeur exacte", "Pattern (wildcard)", "Existe (any value)"

### 1.4 Detail du selecteur de type

```
  Type  : ┌────────────────────────────┐
          │ Valeur exacte          [*] │  --> type: "any", saisie de valeurs
          │ Pattern (wildcard)         │  --> type: "stringwildcard", saisie de patterns
          │ Existe (toute valeur)      │  --> type: "wildcard", pas de saisie
          └────────────────────────────┘
```

Quand "Existe (toute valeur)" est selectionne, le bloc "Valeurs" disparait car le filtre valide simplement que le champ existe dans le body.

### 1.5 Vue compacte -- tous scopes replies avec indicateur

```
┌ Body Filters (avancé) ──────────────────────────────── [x] ┐
│                                                             │
│  > POST:/v1/apps/my-app/deployments          2 filtres  (*) │
│  > POST:/v1/apps/my-app/scale                0 filtre       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

Le badge `(*)` ou un petit point colore (classe `bg-fgp-500`) indique qu'un scope a des filtres configures. Le compteur "2 filtres" donne un apercu sans deplier.

### 1.6 Version mobile (< 640px)

```
┌──────────────────────────────────┐
│ ▼ POST:.../deployments           │
│ ┌──────────────────────────────┐ │
│ │ Filtre 1               [bin]│ │
│ │ Champ :                      │ │
│ │ [deployment.git_ref       ]  │ │
│ │ Type :                       │ │
│ │ [Valeur exacte         |v]   │ │
│ │ Valeurs :                    │ │
│ │ [master              ] [x]   │ │
│ │ [main                ] [x]   │ │
│ │ [+ Valeur]                   │ │
│ └──────────────────────────────┘ │
│ [+ Ajouter un filtre]           │
└──────────────────────────────────┘
```

En mobile, les inputs passent en full-width stack vertical. Le path du scope est tronque avec ellipsis. Labels au-dessus des inputs au lieu d'a cote.

---

## 2. Interactions

### 2.1 Detection automatique des scopes eligibles

Le textarea reste la source de verite. Un listener `input` sur le textarea parse les lignes et detecte les methodes POST, PUT, PATCH (et `*`). Le bouton "Ajouter des filtres body" n'apparait que si au moins un scope eligible existe.

Si l'utilisateur modifie le textarea et supprime un scope qui avait des filtres, le panel affiche un warning inline "Ce scope a ete supprime du textarea" et le filtre est grise. Le filtre est perdu a la generation (pas de scope parent = pas de filtre).

Si l'utilisateur modifie le path d'un scope dans le textarea, le panel tente un match fuzzy par methode+index pour garder les filtres attaches. Si le match echoue, meme comportement que la suppression.

### 2.2 Cycle de vie d'un filtre

1. L'utilisateur clique sur "+ Ajouter un filtre" sous un scope
2. Un bloc filtre vide apparait avec les 3 champs : Champ (vide), Type (defaut "Valeur exacte"), Valeurs (un input vide)
3. L'utilisateur tape le dot-path du champ (ex: `deployment.git_ref`)
4. L'utilisateur choisit le type dans le select
5. Si type = "Valeur exacte" ou "Pattern" : l'utilisateur saisit une ou plusieurs valeurs (OR implicite)
6. Si type = "Existe" : pas de saisie necessaire
7. Pour supprimer une valeur : clic sur le `[x]` a cote
8. Pour supprimer tout le filtre : clic sur `[bin]`

Les filtres sur un meme scope sont en AND implicite. L'UI l'indique via un separateur et un petit label "ET" entre les filtres :

```
  │  Filtre 1 ...                                        │
  │                         ET                            │
  │  Filtre 2 ...                                        │
```

Les valeurs au sein d'un filtre sont en OR implicite. L'UI l'indique via le label "une des valeurs suivantes :" au-dessus du groupe de valeurs.

### 2.3 Preset Scalingo enrichi

Quand le preset Scalingo est active et que l'utilisateur selectionne des apps, le comportement actuel genere des scopes `GET:/v1/apps/{app}/*`. Le preset enrichi ajoute des options supplementaires par app :

```
┌ Applications Scalingo ────────────────────────────────────────┐
│                                                               │
│  [x] my-app                                                  │
│      Permissions :                                            │
│      [x] Lecture (GET)                                        │
│      [ ] Deploiement    Branches : [ master, main         ]   │
│      [ ] Variables                                            │
│      [ ] Scale                                                │
│                                                               │
│  [ ] other-app                                                │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

Quand "Deploiement" est coche :
- Ajoute `POST:/v1/apps/{app}/deployments` dans le textarea
- Cree automatiquement un body filter avec `deployment.git_ref` et les branches saisies
- Le champ "Branches" est un input texte simple, virgule-separee, avec placeholder "master, main"

Quand "Variables" est coche sans plus de precision :
- Ajoute `GET:/v1/apps/{app}/variables` (lecture seule, pas de body filter)

Quand "Scale" est coche :
- Ajoute `POST:/v1/apps/{app}/scale` dans le textarea
- Pas de body filter par defaut (le filtre de range sur `containers.*.amount` est une extension future, cf ADR 0004)

### 2.4 Format lisible vs format structure

L'UI travaille en format structure (objets JS en memoire). Le textarea affiche le format lisible (option A de l'ADR) pour les scopes qui ont des body filters :

```
POST:/v1/apps/my-app/deployments -> git_ref = master | main
```

Mais cette representation n'est qu'un **affichage en lecture seule** dans le textarea. Les scopes avec body filters ne sont pas editables directement dans le textarea : ils sont grises avec un petit tag "filtre" et un lien "editer" qui scroll vers le panel body filters.

Les scopes simples (sans body filter) restent editables normalement dans le textarea.

A la generation du blob, l'UI convertit tout en format structure v3 (mix de strings et de ScopeEntry).

### 2.5 Gestion du textarea mixte

Le textarea contient donc deux types de lignes :
- **Lignes editables** : scopes simples (texte brut, le user tape directement)
- **Lignes read-only** : scopes avec body filters (affichage format lisible, non modifiables via le textarea)

Pour differencier visuellement, deux options :

**Option A (recommandee)** : les scopes avec filtres sortent du textarea et s'affichent comme des "chips" au-dessus du textarea, avec un badge et un bouton editer/supprimer. Le textarea ne contient que les scopes simples.

```
┌─────────────────────────────────────────────────────────────┐
│  Scopes                                                     │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ POST:.../deployments -> git_ref = master|main  [e][x]│   │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌───────────────────────────────────────────────────┐      │
│  │ GET:/v1/apps/*                                    │      │
│  │ GET:/v1/apps/my-app/variables                     │      │
│  │                                                   │      │
│  └───────────────────────────────────────────────────┘      │
│  Un pattern par ligne. Wildcard * pour tout matcher.        │
│                                                             │
│  [+ Ajouter des filtres body sur un scope...]               │
└─────────────────────────────────────────────────────────────┘
```

Les chips au-dessus du textarea sont des `<div>` stylisees avec la palette fgp-* (`bg-fgp-50 border-fgp-200 dark:bg-fgp-900/50 dark:border-fgp-700`). Le `[e]` ouvre le panel body filter dedie et scroll vers le scope. Le `[x]` supprime le scope et tous ses filtres.

**Option B** : tout dans le textarea, lignes avec filtres grisees. Plus simple cote implementation mais UX plus confuse (le user peut essayer d'editer une ligne read-only et rien ne se passe).

Je recommande l'option A.

---

## 3. Cas d'usage illustres

### 3.1 Deploy scope par branche

Scenario : un token CI/CD qui ne peut deployer que `master` ou `main` sur `my-app`.

**Scopes textarea :**
```
GET:/v1/apps/my-app
```

**Chip au-dessus :**
```
┌─────────────────────────────────────────────────────────────┐
│ POST:/v1/apps/my-app/deployments                   [e] [x] │
│   -> deployment.git_ref = master | main                     │
└─────────────────────────────────────────────────────────────┘
```

**Panel body filter deplie :**
```
▼ POST:/v1/apps/my-app/deployments

  Filtre 1
  Champ : [ deployment.git_ref              ]
  Type  : [ Valeur exacte        |v]
  Valeurs (une des suivantes) :
    [ master                     ] [x]
    [ main                       ] [x]
    [+ Ajouter une valeur]

  [+ Ajouter un filtre]
```

**Blob genere (extrait) :**
```json
{
  "methods": ["POST"],
  "pattern": "/v1/apps/my-app/deployments",
  "bodyFilters": [{
    "objectPath": "deployment.git_ref",
    "objectValue": [
      { "type": "any", "value": "master" },
      { "type": "any", "value": "main" }
    ]
  }]
}
```

### 3.2 Env vars read-only

Scenario : un token qui peut lire les variables d'environnement mais pas les modifier.

**Scopes textarea :**
```
GET:/v1/apps/my-app/variables
```

**Pas de chip, pas de body filter.** Le scope GET n'est pas eligible aux body filters. L'UI ne montre rien de special, c'est le parcours de base inchange.

### 3.3 Deploy avec contrainte source + branche

Scenario : un token qui ne peut deployer que depuis un repo Github specifique, et uniquement les branches `release/*`.

**Chip au-dessus :**
```
┌─────────────────────────────────────────────────────────────┐
│ POST:/v1/apps/my-app/deployments                   [e] [x] │
│   -> deployment.git_ref = release/*                         │
│   -> deployment.source_url = https://github.com/my-org/*    │
└─────────────────────────────────────────────────────────────┘
```

**Panel body filter deplie :**
```
▼ POST:/v1/apps/my-app/deployments

  Filtre 1
  Champ : [ deployment.git_ref              ]
  Type  : [ Pattern (wildcard)    |v]
  Valeurs (une des suivantes) :
    [ release/*                  ] [x]

                      ET

  Filtre 2
  Champ : [ deployment.source_url           ]
  Type  : [ Pattern (wildcard)    |v]
  Valeurs (une des suivantes) :
    [ https://github.com/my-org/* ] [x]

  [+ Ajouter un filtre]
```

Le label "ET" entre les filtres rend explicite le AND implicite du modele de donnees.

---

## 4. Propositions de design

### 4.1 Coherence visuelle

Le panel body filters utilise la meme palette que le reste de l'UI :

| Element | Classes Tailwind |
|---|---|
| Panel container | `rounded-md border border-gray-200 bg-white p-4 dark:bg-gray-800 dark:border-gray-600` |
| Scope header (replie) | `text-sm font-mono text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 px-3 py-2 rounded` |
| Scope header (deplie) | meme + `bg-fgp-50 dark:bg-fgp-900/30 border-l-2 border-fgp-500` |
| Badge "N filtres" | `text-xs text-fgp-600 dark:text-fgp-300 font-medium` |
| Dot actif | `w-2 h-2 rounded-full bg-fgp-500 inline-block` |
| Chip scope avec filtre | `rounded-md border border-fgp-200 bg-fgp-50 px-3 py-2 text-sm font-mono dark:bg-fgp-900/50 dark:border-fgp-700` |
| Label "ET" | `text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider` |
| Boutons d'action (+, bin) | `text-sm text-fgp-600 hover:text-fgp-800 dark:text-fgp-400 dark:hover:text-fgp-200` |
| Inputs de filtre | memes classes que les inputs existants (`rounded-md border border-gray-300 px-3 py-2 text-sm ...`) |
| Select type | memes classes que le select auth existant |

Les chips scope utilisent le meme `font-mono` que le textarea pour la coherence du contenu technique.

### 4.2 Accessibilite

- **Labels** : chaque input de filtre a un `<label>` explicite (`for`/`id`) ou un `aria-label`
- **Roles** : le panel utilise `role="region"` avec `aria-label="Filtres body avancés"`. Chaque scope depliable utilise un pattern disclosure (`aria-expanded`, `aria-controls`)
- **Keyboard** : les scopes depliables reagissent a Enter et Space. Tab navigue entre les filtres dans l'ordre logique. Le bouton supprimer est focusable
- **Screen readers** : le label "ET" entre les filtres est entoure d'un `<span aria-label="et aussi">ET</span>` pour que la logique soit comprise. Le badge "2 filtres" est suffisamment descriptif
- **Focus management** : quand on ajoute un filtre, le focus va sur le premier input (Champ) du nouveau filtre. Quand on supprime un filtre, le focus va sur le bouton "+ Ajouter un filtre"

### 4.3 Dark mode

Deja couvert par les classes Tailwind ci-dessus (prefixe `dark:`). Points specifiques :
- Le separateur "ET" entre filtres utilise `border-gray-700` en dark au lieu de `border-gray-200`
- Les chips scopes passent de `bg-fgp-50` a `bg-fgp-900/50` pour rester lisibles sur fond sombre
- Le bouton "Ajouter des filtres body" passe de `text-fgp-600` a `text-fgp-400`
- Le panel "Body Filters (avancé)" a un header en `border-b border-gray-200 dark:border-gray-700`

### 4.4 Responsive

- **Desktop (>= 768px)** : les labels "Champ", "Type", "Valeurs" sont sur la meme ligne que les inputs (layout grid 2 colonnes)
- **Tablet (640-768px)** : les labels passent au-dessus des inputs (stack vertical)
- **Mobile (< 640px)** : le panel body filters passe en pleine largeur, les chips scope utilisent un path tronque avec `truncate`, le bouton [e] et [x] deviennent des icones plus grandes pour le touch (min 44x44px)
- Le preset Scalingo enrichi avec les checkboxes permissions se reorganise en stack vertical sur mobile

### 4.5 Etats d'erreur et validation

- **Champ vide** : si l'utilisateur laisse le champ dot-path vide et lance la generation, un border rouge apparait sur l'input avec un message "Champ requis"
- **Valeur vide** : si type = "Valeur exacte" ou "Pattern" et aucune valeur saisie, meme traitement
- **Scope supprime** : si un scope dans le textarea est modifie/supprime et qu'il avait des filtres, la chip correspondante passe en etat "orphelin" avec un border orange (`border-amber-300`) et un message "Scope introuvable dans le textarea"
- **Coherence type/valeur** : pas de validation croisee pour l'instant (le proxy fera la validation finale)

---

## 5. Plan d'implementation suggere

L'ordre de priorite pour le dev :

1. **Phase 1** : Detection des scopes eligibles dans le textarea + bouton "Ajouter des filtres body"
2. **Phase 2** : Panel body filters avec ajout/suppression de filtres (Champ + Type + Valeurs)
3. **Phase 3** : Chips pour les scopes avec filtres (option A de la section 2.5)
4. **Phase 4** : Preset Scalingo enrichi (permissions par app)
5. **Phase 5** : Serialisation vers le format blob v3 a la generation

Les phases 1 a 3 constituent le MVP. Les phases 4 et 5 connectent l'UI au backend.

---

## 6. Questions ouvertes pour le lead

1. **Autocomplete dot-path** : est-ce qu'on veut proposer de l'autocomplete sur le champ dot-path base sur le schema connu de l'API Scalingo ? Ca ajouterait pas mal de complexite pour un gain UX modere.

2. **Import/export** : est-ce qu'un scope avec body filters doit etre exportable en format texte (pour copier-coller entre instances) ? Le format option A de l'ADR (`POST:/path -> field = val | val2`) pourrait servir de format d'echange.

3. **Type "and" compose** : l'ADR prevoit un type `{ type: "and", value: [...] }`. Est-ce qu'on le supporte dans l'UI v1 ou on le reserve au power-user qui edite le blob directement ? Ma recommandation : pas dans la v1, ca complique l'UI pour un use case rare.
