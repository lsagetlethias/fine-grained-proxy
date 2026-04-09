# UI Review -- Fine-Grained Proxy (config-page + layout)

**Date** : 2026-04-09
**Fichiers** : `src/ui/layout.tsx`, `src/ui/config-page.tsx`
**Grille** : Vercel React Best Practices, Frontend Design Best Practices, WCAG 2.1 AA

---

## CRITIQUE

### C1 -- Tailwind CDN en production (Performance / bundle-defer-third-party)

**Fichier** : `layout.tsx:14`

Le `<script src="https://cdn.tailwindcss.com">` est un script **render-blocking** qui fait environ 110 kB et parse + JIT-compile toutes les classes au runtime dans le navigateur. C'est explicitement interdit par Tailwind en production (le script affiche un warning console).

**Impacts** :
- FOUC (Flash of Unstyled Content) si le CDN est lent ou indisponible
- Le parsing JIT bloque le rendu initial
- Aucun tree-shaking : les classes inutilisees restent
- Pas de cache-busting versionne

**Fix** : Build-time Tailwind CSS via `deno task` (Tailwind CLI standalone ou PostCSS). Le TODO dans le code le reconnait, mais c'est reste en l'etat.

---

### C2 -- 1400 lignes de JS inline non minifie dans un string template (Performance / bundle-dynamic-imports + Maintenabilite)

**Fichier** : `config-page.tsx:478-1867` (fonction `clientScript()`)

Tout le comportement client est dans une string litterale retournee par `clientScript()`. Ce JS est :
- **Non minifie** et envoye tel quel dans le HTML (environ 45 kB de texte brut)
- **Non cacheable** par le navigateur (inline = pas de hash, pas de 304)
- **Impossible a linter/type-checker** (c'est un string, pas du TypeScript)
- **Impossible a tester unitairement**
- Utilise du DOM manipulation par assignation directe de markup sans sanitization
- Pattern `var` partout au lieu de `const`/`let` : confusion de scope dans les closures IIFE

Ce fichier est le principal point de dette technique de l'UI.

**Fix** : Extraire dans un fichier `.ts` separe, servi en `<script src="/static/config.js" defer>`. Permet minification, cache, linting, type-checking, et tests.

---

### C3 -- Reset DOM complet comme pattern de re-render (Securite + Performance)

**Fichier** : `clientScript()` lignes environ 606, 664, 754

Les conteneurs `appsList`, `scopeChips`, `bodyFiltersList` sont vides puis reconstruits integralement a chaque changement. Ce pattern :
- Detruit et recree tout le DOM a chaque changement (pas de diffing)
- Perd le focus clavier a chaque re-render (l'utilisateur qui tab perd sa position)
- Risque XSS si un jour du `textContent` est remplace par du markup avec des donnees user

**Fix** : Utiliser un pattern de DOM diffing minimal, ou au minimum sauvegarder/restaurer le focus apres re-render.

---

### C4 -- Perte de focus au re-render du body filters panel (Accessibilite / WCAG 2.4.3)

Lie a C3. Chaque appel a `renderBodyFiltersPanel()` ou `renderChips()` detruit et reconstruit tout le DOM. Un utilisateur clavier ou lecteur d'ecran qui est en train de naviguer dans le panel body filters perd sa position a chaque interaction. Le focus est renvoye sur `<body>` sans prevenir.

Certains cas sont geres (ex: `btnAddFilter` fait un `.focus()` sur le nouveau champ), mais la majorite ne le sont pas (changement de type, suppression de valeur, etc.).

---

## IMPORTANT

### I1 -- Aucun etat de chargement visible pour la generation (UX)

Le bouton "Generer l'URL" passe a `disabled` + texte "Generation..." mais il n'y a pas de spinner ni d'indication visuelle forte. Sur une connexion lente, l'utilisateur ne sait pas si quelque chose se passe. Le bouton "Charger les apps" a le meme probleme.

**Fix** : Ajouter un spinner SVG inline ou une animation CSS sur le bouton pendant le fetch. Ou un `aria-busy="true"` sur le form avec un `role="status"` pour les screen readers.

---

### I2 -- Pas de skip-link ni de structure landmarks (Accessibilite / WCAG 2.4.1)

La page n'a pas de `<main>`, pas de `<nav>`, et pas de skip-link. Un utilisateur de screen reader doit traverser tout le header et le formulaire pour atteindre les resultats.

**Fix** : Wrapper le formulaire dans `<main>`, l'aside a un `<aside>` mais sans `aria-label`, et ajouter un skip-link "Aller au formulaire" en haut.

---

### I3 -- Dark mode : contrastes insuffisants sur certains elements

Plusieurs combinaisons ne passent pas le ratio WCAG AA (4.5:1 pour du texte small) :
- `text-gray-400 dark:text-gray-500` (hint sous le token, hint sous les scopes) : gray-500 sur gray-900 = environ 3.7:1. Fail.
- `text-fgp-600 dark:text-fgp-400` sur les liens "+" body filters : fgp-400 sur gray-800 depend de la teinte exacte, mais les bleus clairs sur fond sombre sont souvent limite.
- Les badges "0 filtre" en `text-fgp-600 dark:text-fgp-300` sur le hover `bg-gray-700` : a verifier empiriquement.

**Fix** : Remonter d'un cran les text colors en dark mode (`gray-500` -> `gray-400`, `fgp-400` -> `fgp-300`).

---

### I4 -- Le body filters panel n'est pas fermable au clavier par Escape (Accessibilite / WCAG 2.1.1)

Le panel body filters a un bouton "x" pour fermer, mais pas de handler `keydown` pour `Escape`. Un utilisateur clavier doit tab jusqu'au bouton x, alors que la convention standard est Escape pour fermer un panel/drawer.

**Fix** : Ajouter un listener `keydown` sur le panel (ou document quand le panel est visible) pour `Escape` -> fermer.

---

### I5 -- Les boutons preset "Scalingo" / "Vide" n'ont pas d'etat selectionne (UX)

Quand on clique sur "Scalingo", le bouton ne change pas d'apparence. L'utilisateur ne sait pas quel preset est actif. C'est un `aria-pressed` manquant.

**Fix** : Toggle `aria-pressed="true"` + style visuellement distinct (bg-fgp-600 text-white par ex.) sur le preset actif.

---

### I6 -- Les apps Scalingo (renderApps) ne gerent pas le dark mode (Design coherence)

**Fichier** : `clientScript()` environ ligne 1605-1624

Les labels dans `renderApps` utilisent `hover:bg-gray-50` sans variante dark. En dark mode, le hover affiche un fond blanc casse sur du texte clair.

**Fix** : Ajouter `dark:hover:bg-gray-800` aux labels et `dark:text-gray-200` aux spans.

---

### I7 -- Le resultat curl est hardcode "v1/apps" (UX / Correctness)

**Fichier** : `clientScript()` environ ligne 1838

```js
document.getElementById("result-curl").textContent =
  'curl -H "X-FGP-Key: ' + data.key + '" ' + data.url + "v1/apps";
```

Le path `v1/apps` est hardcode. Si l'utilisateur configure des scopes sur un autre path, l'exemple curl est faux.

**Fix** : Utiliser le premier scope comme path d'exemple, ou le path de la target.

---

### I8 -- Aucune validation en temps reel des champs (UX)

Les erreurs ne sont affichees qu'au submit. L'utilisateur peut remplir tout le formulaire avec une URL invalide et ne le decouvre qu'a la fin. Pas de validation inline (border rouge, message sous le champ).

**Fix** : Validation inline sur `blur` au minimum pour le champ URL et le token.

---

## MINEUR

### M1 -- Le `<pre>` du resultat curl ne gere pas bien l'overflow sur mobile

**Fichier** : `config-page.tsx:313-316`

Le `<pre>` a `overflow-x-auto` mais pas de max-width contraint. Sur mobile, le scroll horizontal n'est pas evident sans scrollbar visible. Les commandes curl longues sont tronquees visuellement.

**Fix** : Ajouter `whitespace-pre-wrap break-all` ou un wrapper avec des scrollbar-gutter visibles.

---

### M2 -- Les radio buttons TTL utilisent `checked={preset.value === "86400"}` en JSX server-side

**Fichier** : `config-page.tsx:217`

C'est du Hono JSX (server-rendered), donc le `checked` est un attribut HTML statique. Ca marche, mais si un preset "Vide" est clique et que le formulaire est soumis sans JS (progressive enhancement), le serveur ne recevra pas de TTL.

Mineur parce que le formulaire ne fonctionne pas sans JS de toute facon (le submit est intercepte), mais ca trahit un manque de progressive enhancement.

---

### M3 -- Les entites HTML sont melangees avec du texte UTF-8 direct

**Fichier** : config-page.tsx, passim

Certains textes utilisent `&eacute;` (ex: lignes 169, 353), d'autres utilisent directement le caractere accentue (ex: ligne 27). Pas de coherence.

**Fix** : Tout en UTF-8 direct, les entites HTML ne sont pas necessaires.

---

### M4 -- Le bouton delete filtre utilise un emoji comme icone

**Fichier** : `clientScript()` environ ligne 862

Le bouton de suppression utilise l'emoji poubelle (U+1F5D1). Le rendu est inconsistant entre OS/navigateurs. Les autres boutons delete utilisent le "x" (U+00D7).

**Fix** : Uniformiser sur "x" partout, ou utiliser un SVG icon consistant.

---

### M5 -- Pas de `<meta name="description">` ni `<meta name="robots">`

**Fichier** : `layout.tsx`

Si la page est indexable (pas de protection), un crawler verra un titre mais pas de description. Probablement pas un probleme pour un outil interne, mais bon a noter.

---

## SUGGESTION

### S1 -- Extraire un mini design system pour les classes Tailwind recurrentes

Les classes de form controls (input, select, button) sont dupliquees des dizaines de fois :
```
rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-fgp-500
focus:ring-1 focus:ring-fgp-500 outline-none dark:bg-gray-800 dark:border-gray-600
dark:text-gray-100
```

Ca apparait a environ 20 endroits dans le JSX et environ 30 fois dans le JS inline. Un `@apply` dans un fichier CSS ou des composants JSX partages reduiraient la duplication et rendraient les changements de style atomiques.

---

### S2 -- Le body filters panel pourrait beneficier d'un vrai composant accordion

L'implementation actuelle reconstruit manuellement un accordion pattern (chevron, expand/collapse, aria-expanded, aria-controls). Un composant dedie avec gestion propre du focus et des transitions serait plus maintenable et plus fiable en accessibilite.

---

### S3 -- Responsive : le sidebar "Guide d'utilisation" pourrait etre un details/summary sur mobile

Sur mobile, le sidebar passe en dessous du formulaire (grid 1 col). L'utilisateur doit scroller passe le formulaire + resultats pour voir le guide. Un `<details><summary>` ou un toggle en mobile-only ameliorerait l'acces.

---

### S4 -- Le timer de 8s sur le error banner est arbitraire et non interruptible

`setTimeout(function() { ... }, 8000)` fait disparaitre l'erreur apres 8 secondes. Si l'utilisateur n'a pas eu le temps de lire, c'est perdu. Pas de bouton "fermer" non plus.

**Fix** : Ajouter un bouton dismiss sur le banner, ou le laisser visible jusqu'au prochain submit.

---

### S5 -- Les body filters chips pourraient avoir un tooltip plus explicite

Le `title` attribute est utilise pour le tooltip natif, mais il ne s'affiche qu'au hover prolonge et n'est pas accessible au clavier/touch. Un vrai tooltip component ou un `aria-describedby` serait mieux.

---

## Bilan body filters specifiquement

**Lisibilite de l'imbrication and/not** : Acceptable visuellement grace aux bordures colorees (amber pour not, sky pour and), mais la profondeur and > not > value cree 3 niveaux d'imbrication visuelle qui peuvent perdre l'utilisateur. Le re-render complet a chaque interaction aggrave le probleme (C3/C4).

**Progressive disclosure** : Fonctionne bien dans le principe (le bouton "+ Ajouter des filtres body" n'apparait que quand pertinent). Le flow scope eligible -> bouton -> panel -> expand -> filtre est logique. Mais le panel qui s'ouvre n'a pas de transition (apparition brute), et l'absence de fermeture par Escape est un manque (I4).

**Chips** : Claires et informatives avec le summary. Le truncatePath est un bon touch. Mais les boutons "editer"/"x" sont petits (pas de min-width/min-height) et difficiles a toucher sur mobile (touch target < 44px, WCAG 2.5.5).

**Accessibilite clavier du panel** : Partiellement geree. Les headers de scope sont des `<button>` avec `aria-expanded`/`aria-controls` (bien). Mais le keydown handler duplique le click handler manuellement (ligne 815-820), alors qu'un `<button>` gere deja Enter/Space nativement. Et le re-render DOM casse le focus (C4).
