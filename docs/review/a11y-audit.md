# Audit Accessibilite (a11y) — FGP Config UI

**Date** : 2026-04-09
**Fichiers audites** : `src/ui/config-page.tsx`, `src/ui/layout.tsx`, `src/ui/client/body-filters.ts`, `src/ui/client/apps.ts`, `src/ui/client/generate.ts`, `src/ui/client/scopes.ts`, `src/ui/client/clipboard.ts`, `src/ui/client/ttl.ts`, `src/ui/client/presets.ts`

---

## Critiques

### C1 — Aucun `aria-live` sur les zones dynamiques

**Fichiers** : `config-page.tsx` (l.284 `#result-section`, l.359 `#error-banner`), `apps.ts`, `body-filters.ts`

Aucun `aria-live` n'existe dans toute la codebase. Les zones suivantes sont mises a jour dynamiquement par JS sans etre annoncees aux lecteurs d'ecran :

- `#result-section` : l'URL generee apparait apres soumission du formulaire. Un utilisateur de screen reader n'a aucune indication que le resultat est arrive.
- `#error-banner` : les messages d'erreur sont injectes via `textContent` et le `role="alert"` est present, ce qui est bien. Mais la div est `hidden` au chargement et son contenu est vide. Le `role="alert"` ne se declenche que si le contenu change pendant que l'element est visible. Quand on passe de `hidden` a visible + injection de texte dans le meme tick, certains screen readers ne l'annoncent pas.
- `#apps-list` : la liste des apps Scalingo est remplie dynamiquement apres un fetch. Aucune annonce.
- `#scope-chips` : les chips body-filter apparaissent/disparaissent sans annonce.
- `#body-filters-panel` : tout le contenu du panel est re-rendu a chaque interaction (re-render complet via `textContent = ""`).

**Correction** :
- Ajouter `aria-live="polite"` sur `#result-section`.
- Pour `#error-banner` : ajouter `aria-live="assertive"` en complement du `role="alert"`, et s'assurer que l'element est rendu visible AVANT d'injecter le texte (deux ticks separes), ou utiliser un pattern ou le texte est toujours dans le DOM et seul le contenu change.
- Ajouter `aria-live="polite"` sur `#apps-list`.
- Ajouter `aria-live="polite"` sur `#scope-chips`.

### C2 — Focus pas gere apres ajout/suppression dynamique

**Fichiers** : `body-filters.ts`, `apps.ts`

Apres suppression d'un filtre body ou d'une valeur, le focus est perdu (il retourne au `<body>`). Exceptions positives a noter : `renderFilterBlock` (l.711-712) place bien le focus sur le bouton "Ajouter" apres suppression d'un filtre, et `renderValuesBlock` (l.659-660) place le focus sur le nouvel input apres ajout d'une valeur. Mais :

- Suppression d'une valeur dans `renderValuesBlock` (l.630-638) : le re-render complet via `renderPanel()` detruit le DOM, le focus est perdu.
- Suppression d'une condition AND dans `renderAndBlock` (l.207-211) : `renderPanel()` + `renderChips()` sans gestion du focus.
- Apres generation reussie (`generate.ts` l.264) : `#result-section` est rendu visible mais le focus ne s'y deplace pas. L'utilisateur ne sait pas qu'un resultat est apparu.

**Correction** :
- Apres suppression d'une valeur : placer le focus sur la valeur precedente, ou sur le bouton "Ajouter une valeur" s'il n'en reste qu'une.
- Apres suppression d'une condition AND : placer le focus sur le bouton "Ajouter une condition".
- Apres generation reussie : deplacer le focus vers `#result-section` ou vers `#result-url`.

### C3 — Labels "ET" entre filtres non accessibles aux screen readers

**Fichiers** : `body-filters.ts` (l.678-688, l.180-186)

Les labels "ET" visuels entre les blocs de filtres sont affiches comme du texte decoratif. Dans `renderAndBlock` (l.184-185), le "ET" entre conditions est correctement marque `aria-hidden="true"`, et le wrapper a un `role="group"` avec `aria-label="Groupe de conditions ET"` — c'est bien.

Mais dans `renderFilterBlock` (l.678-688), le "ET" entre les filtres de premier niveau n'a qu'un `aria-label="et aussi"` sur un `<span>`. Un `<span>` n'est pas un element interactif ni un landmark, donc `aria-label` est ignore par la plupart des screen readers (ARIA spec : `aria-label` n'est supporte que sur les elements interactifs ou les elements avec un role explicite).

**Correction** :
- Soit donner un `role="separator"` au div parent du "ET" entre filtres, avec `aria-label="et aussi"`.
- Soit envelopper chaque groupe de filtres dans un container avec `role="group"` et un `aria-label` descriptif (ex: "Filtres body pour POST:/v1/apps/my-app/deployments").

---

## Importants

### I1 — Pas de skip link

**Fichier** : `layout.tsx`

Aucun lien "skip to content" n'existe. Le formulaire principal est precede d'un header. Un utilisateur clavier doit tab a travers tout le header + les boutons de preset avant d'atteindre le premier champ du formulaire.

**Correction** : Ajouter un lien invisible (visible au focus) en tout debut de `<body>` qui pointe vers `#fgp-form` :
```html
<a href="#fgp-form" class="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 ...">
  Aller au formulaire
</a>
```

### I2 — Contraste insuffisant des textes "hint"

**Fichiers** : `config-page.tsx`, `body-filters.ts`

Plusieurs textes utilisent `text-gray-400` en light mode ou `text-gray-500` en dark mode. Les couleurs Tailwind par defaut :

| Classe | Couleur | Fond typique | Ratio estime |
|---|---|---|---|
| `text-gray-400` light | #9ca3af | #f9fafb (gray-50) | ~2.9:1 |
| `text-gray-500` dark | #6b7280 | #111827 (gray-900) | ~4.0:1 |
| `text-gray-400` dark | #9ca3af | #111827 (gray-900) | ~6.5:1 (ok) |

Endroits concernes :
- `config-page.tsx` l.42 : description du projet `text-gray-500 dark:text-gray-400` — ok en dark, fail en light (gray-500 sur gray-50 = ~4.2:1, juste a la limite).
- `config-page.tsx` l.72-74 : hint du preset `text-gray-400 dark:text-gray-500` — fail en light (~2.9:1), fail en dark (~4.0:1).
- `config-page.tsx` l.149 : hint du token `text-gray-400 dark:text-gray-500` — meme probleme.
- `config-page.tsx` l.189 : hint des scopes `text-gray-400 dark:text-gray-500` — meme probleme.
- `body-filters.ts` l.171-172 : texte "(aucune condition)" `text-gray-400 dark:text-gray-500` — meme probleme.
- `body-filters.ts` l.524 : label "Valeurs" `text-gray-500 dark:text-gray-400` — light borderline.

WCAG AA exige 4.5:1 pour du texte normal. Ces hints sont en `text-xs` (12px) ce qui les rend encore plus difficiles a lire.

**Correction** :
- En light mode, remplacer `text-gray-400` par `text-gray-500` minimum (ratio ~4.6:1 sur gray-50), idealement `text-gray-600` pour de la marge.
- En dark mode, remplacer `text-gray-500` par `text-gray-400` (ratio ~6.5:1 sur gray-900).
- Pattern recommande : `text-gray-500 dark:text-gray-400` partout pour les hints.

### I3 — Bouton "Ajouter des filtres body" sans indication de l'etat

**Fichier** : `config-page.tsx` (l.193-199)

Le bouton `#btn-add-body-filters` ouvre le panel body-filters mais n'a aucun attribut `aria-expanded` ni `aria-controls` pour indiquer qu'il controle une zone depliable. Il est aussi style comme un lien texte (`text-sm text-fgp-600`) sans affordance de bouton.

**Correction** :
- Ajouter `aria-expanded="false/true"` (mis a jour cote JS quand le panel s'ouvre/se ferme).
- Ajouter `aria-controls="body-filters-panel"`.

### I4 — Chips scope : elements "editer" et "x" sans contexte structurel

**Fichier** : `body-filters.ts` (l.993-1061)

Les chips ont des boutons "editer" et "x" avec des `aria-label` corrects (incluant le scope key). Le texte visible du chip est tronque via `truncatePath` ce qui pourrait rendre le label visuel incomplet, mais les `aria-label` compensent correctement. Cependant :

- Le chip lui-meme (`<div>`) n'a pas de `role`. Un screen reader le voit comme un conteneur generique. Il faudrait un `role="listitem"` sur chaque chip et `role="list"` sur `#scope-chips`.

**Correction** :
- Ajouter `role="list"` sur `#scope-chips` et `role="listitem"` sur chaque chip div.

### I5 — Branches input sans label

**Fichier** : `apps.ts` (l.135-140)

L'input de branches de deploiement (`branchInput`) n'a ni `<label>` associe, ni `aria-label`. Son `placeholder` ("master, main") ne constitue pas un label accessible.

**Correction** : Ajouter `aria-label="Branches autorisees pour le deploiement"` sur cet input. Idealement inclure le nom de l'app : `"Branches de deploiement pour " + name`.

### I6 — Selects generes dynamiquement sans labels (body-filters)

**Fichier** : `body-filters.ts`

La plupart des selects dans `renderFilterBlock` ont des labels corrects (l.719-722 pour "Champ", l.738-741 pour "Type"). Cependant, dans `renderConditionNotBlock` (l.49-67), le select de type pour la condition "not" imbriquee n'a aucun label ni `aria-label`. Idem pour les selects de sous-type dans `renderConditionNotBlock` (l.73-92).

**Correction** : Ajouter `aria-label="Type de la condition d'exclusion"` sur `condNotTypeSelect` (l.49), et `aria-label="Type de la valeur"` sur `cnSubSelect` (l.73).

### I7 — `#result-section` n'a pas de role region

**Fichier** : `config-page.tsx` (l.284)

La section resultat est un `<section>` sans heading ni `aria-label`. Un `<section>` sans nom accessible est traite comme un conteneur generique par les screen readers — il ne constitue pas un landmark. Le `<h2>` "URL generee" (l.287) est present a l'interieur, mais comme la section est `hidden` au chargement, ajouter un `aria-label` serait plus robuste.

**Correction** : Ajouter `aria-labelledby` pointant vers le `<h2>`, ou un `aria-label="Resultat de la generation"` sur la section.

---

## Mineurs

### M1 — `<header>` sans role banner explicite

**Fichier** : `config-page.tsx` (l.22)

Le `<header>` est AVANT `<main>` (l.22-45 puis `<main>` l.47). En tant qu'enfant direct du body (via le div wrapper), `<header>` a implicitement le role `banner`. Pas de probleme, mais a verifier que les screen readers le reconnaissent bien a travers le div intermediaire.

### M2 — Landmarks presents et corrects

`<main>` (l.47), `<aside aria-label="Documentation et aide">` (l.369-371), `<nav>` (l.373), `<footer>` (l.505) : tous presents et correctement structures. Le `<aside>` a un `aria-label`. La `<nav>` est dans l'aside pour le guide d'utilisation, ce qui est semantiquement acceptable.

### M3 — Boutons "Copier" : feedback non accessible

**Fichier** : `clipboard.ts` (l.12-15)

Apres copie, le texte du bouton change de "Copier" a "Copie !" pendant 1.5s. Ce changement de texte est annonce par les screen readers car c'est le contenu textuel du bouton qui change — c'est acceptable. Mais les `aria-label` des boutons (ex: "Copier l'URL") ne sont pas mis a jour en parallele, ce qui cree une discordance entre le texte visible et le label annonce. Mineur car temporaire (1.5s).

**Correction possible** : Mettre a jour `aria-label` en meme temps que `textContent`, ou retirer les `aria-label` au profit du `textContent` seul (puisque "Copier" est deja descriptif avec le contexte du label visible au-dessus).

### M4 — Logo SVG sans `aria-hidden`

**Fichier** : `layout.tsx` (l.14-25)

Le composant `FgpLogo` injecte un SVG dans un `<span>`. Le SVG n'a pas de `role="img"` ni d'`aria-hidden`. Comme il est decoratif (le texte "Fine-Grained Proxy" est juste a cote), il devrait avoir `aria-hidden="true"`.

**Correction** : Ajouter `aria-hidden="true"` sur le `<span>` wrapper du logo.

### M5 — Radios TTL visuellement custom mais fonctionnellement ok

**Fichier** : `config-page.tsx` (l.233-248)

Les radios TTL utilisent `class="sr-only"` pour masquer le vrai radio et styliser le label parent. Le pattern `has-[:checked]` permet le style visuel. Du point de vue clavier, les radios natifs sont focusables et navigables avec les fleches. Le `<fieldset>` + `<legend>` est present. Le `role="radiogroup"` est explicite. Tout est correct.

### M6 — Footer link GitHub : pas d'indication "nouvelle fenetre"

**Fichier** : `config-page.tsx` (l.506-516)

Le lien GitHub dans le footer a `target="_blank"` mais aucune indication que le lien ouvre dans une nouvelle fenetre (ni visuellement ni pour les screen readers). Le lien GitHub du header (l.30-39) a un `aria-label` qui ne mentionne pas non plus l'ouverture externe.

**Correction** : Ajouter "(nouvelle fenetre)" dans les `aria-label` ou ajouter un indicateur visuel (icone "external link" avec texte sr-only).

---

## Resume

| Severite | Count | IDs |
|---|---|---|
| Critique | 3 | C1, C2, C3 |
| Important | 7 | I1, I2, I3, I4, I5, I6, I7 |
| Mineur | 6 | M1, M2, M3, M4, M5, M6 |

**Points forts de l'implementation actuelle** :
- Labels `for`/`id` sur les inputs principaux du formulaire (target, auth, token, scopes, custom-ttl) : corrects
- `aria-label` sur les inputs dynamiques des body-filters (valeurs, sous-types) : bien fait
- `aria-expanded` + `aria-controls` sur les headers de scope dans le panel body-filters : corrects
- `role="alert"` sur `#error-banner` et `#ttl-warning` : present
- `role="radiogroup"` + `fieldset`/`legend` pour les TTL : correct
- `role="group"` sur le bloc AND avec `aria-label` : correct
- `aria-hidden="true"` sur les chevrons et les dots decoratifs : correct
- `aria-label` sur les boutons de suppression avec contexte (numero du filtre/valeur) : correct
- Keyboard handling explicite sur les headers de scope (Enter + Space) : correct
