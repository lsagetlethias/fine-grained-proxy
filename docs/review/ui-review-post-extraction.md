# UI Review Post-Extraction

Date: 2026-04-09
Fichiers : `src/ui/config-page.tsx`, `src/ui/layout.tsx`, `src/ui/client.js`

---

## CRITICAL

### C1 — Tailwind CDN en production (render-blocking + bundle)

`layout.tsx` charge Tailwind via `<script src="https://cdn.tailwindcss.com">` sans `defer` ni `async`. C'est le runtime JIT complet de Tailwind qui parse le DOM au chargement. Problemes :
- **Render-blocking** : le navigateur bloque le rendu tant que le script n'est pas charge/execute.
- **Bundle size** : ~300 KB de runtime JS telecharge a chaque page load, alors que l'UI n'utilise qu'une poignee de classes utilitaires.
- **Fiabilite** : dependance a un CDN tiers en prod. Si le CDN tombe, l'UI est sans style.

Le TODO dans le code le mentionne deja. C'est le point le plus impactant a regler : passer a un build-time Tailwind (CLI ou PostCSS) qui genere un fichier CSS statique de quelques KB. La config custom (palette `fgp-*`, dark mode) marche parfaitement en build-time.

### C2 — client.js : fichier monolithique de 1680 lignes, non type

Le fichier `client.js` est un bloc imperiatif unique dans une IIFE. 1680 lignes de `document.createElement()` enchaines avec des closures imbriquees sur 3-4 niveaux. Le `deno-lint-ignore-file` en premiere ligne confirme qu'il echappe a tout controle qualite.

Problemes concrets :
- **Maintenabilite** : les fonctions `renderBodyFiltersPanel` et ses sous-blocs (not, and, conditions) representent ~800 lignes de code quasi-duplique. Chaque type de filtre (exact, wildcard, not, and) re-cree les memes patterns de select/input/label avec les memes classes CSS. Le moindre changement de style implique de modifier une dizaine d'endroits.
- **Pas de types** : du JS brut dans un projet TypeScript strict. Les structures `filterData`, `bodyFiltersData`, `andConditions` sont des objets a forme libre sans aucun contrat.
- **Pas de tests** : impossible de tester unitairement la logique de serialisation (`buildScopes`) sans monter un DOM complet.

Plan de decoupe suggere :
1. Extraire la logique de serialisation (`buildScopes`, `parseScope`, etc.) dans un module TS pur (testable sans DOM).
2. Extraire les factory de composants DOM (creation de select, input, filter block) dans des fonctions utilitaires.
3. Convertir en `.ts` avec des interfaces pour `FilterData`, `BodyFiltersData`, `AndCondition`.

### C3 — Pas de gestion d'erreur sur les `getElementById`

Les 20+ appels `document.getElementById()` en debut de fichier ne sont jamais null-checkes. Si le HTML change (id renomme, element supprime), ca produit des erreurs silencieuses au runtime (`Cannot read property 'classList' of null`). Avec du TS, un simple `as HTMLInputElement` ou un helper assert resoudrait ca.

---

## IMPORTANT

### I1 — Accessibilite : label "Preset" sans association

La section Preset (ligne 36-55 de config-page.tsx) a un `<label>` sans attribut `for` et sans element de formulaire associe. Les deux boutons "Scalingo" et "Vide" en dessous n'ont pas de `role="group"` ni d'`aria-label` sur le conteneur. Un utilisateur de lecteur d'ecran entend "Preset" sans comprendre ce qui est cliquable.

Fix : wrapper les boutons dans un `<div role="group" aria-label="Presets">` ou utiliser un `<fieldset>/<legend>`.

### I2 — Accessibilite : focus visible insuffisant

Tous les boutons utilisent `focus:outline-none focus:ring-2 focus:ring-fgp-500`. Le `focus:outline-none` supprime l'outline natif, ce qui est OK quand le ring est visible. Mais en mode high-contrast ou sur certains navigateurs, le ring Tailwind peut ne pas etre rendu. Le ratio de contraste du ring `fgp-500` (#4c6ef5) sur fond blanc (`fgp-50` / #f0f4ff) est d'environ 3.2:1, ce qui est sous le seuil WCAG AA de 3:1 pour les focus indicators... mais juste. A verifier avec un outil de mesure sur les fonds reels.

### I3 — Accessibilite : role="radiogroup" sur un div

Les radios TTL sont dans un `<div role="radiogroup">` mais les `<input type="radio">` sont visuellement caches (`sr-only`). L'interaction est faite via les labels. Ca fonctionne, mais le pattern est fragile : si un utilisateur clavier Tab dans le group, seul le premier radio recoit le focus (comportement natif radio group). Il faut que les fleches directionnelles fonctionnent aussi, ce qui est le cas nativement mais merite un test reel avec VoiceOver/NVDA.

### I4 — Accessibilite : error banner sans live region

Le `<div id="error-banner" role="alert">` a bien le `role="alert"`, c'est correct. Mais il est `hidden` au chargement et son contenu est modifie via `textContent` + toggle de classe. Sur certains lecteurs d'ecran, changer le contenu d'un element qui vient d'etre rendu visible n'est pas toujours annonce. Ajouter `aria-live="assertive"` en complement du role pour etre safe.

### I5 — Performance : re-render complet du panel body filters

Chaque interaction dans le panel body filters (changement de type, ajout de valeur, modification d'un champ) appelle `renderBodyFiltersPanel()` qui detruit et re-cree tout le DOM du panel. C'est un pattern acceptable pour un petit nombre de filtres, mais si un utilisateur en a 10+ avec des conditions AND, ca peut devenir lent et surtout ca perd le focus a chaque keystroke sur les selects (pas sur les inputs grace au re-render post-change, mais la logique est fragile).

### I6 — Design : look generique "Tailwind default"

L'UI ressemble a un template Tailwind UI standard. Pas de personnalite visuelle au-dela de la palette `fgp-*` (qui est un bleu indigo standard). Pas de typographie distinctive, pas de texture, pas de motion. L'aside avec le guide d'utilisation est un mur de texte. Ca fonctionne, c'est lisible, mais c'est indistinguable de n'importe quel autre outil admin genere par AI.

Pistes (sans overhaul complet) :
- Une typo display pour le titre "Fine-Grained Proxy" (une serif, une geometric sans, n'importe quoi qui ne soit pas la default sans de Tailwind).
- Un element visuel signature : une bordure gauche coloree sur les sections, un motif geometrique subtil en fond, un badge/logo.
- Micro-animation sur le bouton "Generer" et sur l'apparition du resultat (un simple `transition` + `opacity` suffit).

---

## MINOR

### M1 — Entites HTML dans du JSX

Plusieurs endroits dans `config-page.tsx` utilisent des entites HTML (`&eacute;`, `&agrave;`, `&rarr;`, `&mdash;`) dans du JSX. JSX supporte directement les caracteres UTF-8. Pas un bug, mais c'est un bruit visuel dans le code qui rend la lecture plus penible.

### M2 — `var` partout dans client.js

Le fichier utilise `var` au lieu de `const`/`let`. Ca fonctionne dans une IIFE, mais ca masque des bugs potentiels (hoisting, re-assignation accidentelle). Lors de la conversion en TS, passer a `const`/`let`.

### M3 — Timeout magique sur showError

`showError()` fait un `setTimeout` de 8 secondes pour masquer l'erreur. Si l'utilisateur n'a pas eu le temps de lire, le message disparait. Mieux : ajouter un bouton de fermeture et laisser le message visible jusqu'a action utilisateur (ou jusqu'a la prochaine soumission).

### M4 — Script client positionne dans le body du formulaire

Le `<script defer src="/static/client.js" />` est place a l'interieur du `<div class="lg:col-span-3">` (ligne 338). Ca marche grace au `defer`, mais c'est semantiquement bizarre. Le placer dans le `<head>` du Layout (avec `defer`) ou en fin de `<body>` serait plus conventionnel.

### M5 — Copy button pas de fallback clipboard

`navigator.clipboard.writeText()` peut echouer (contexte non-secure, permission refusee). Le `.then()` ne gere pas le cas d'erreur (pas de `.catch()`). L'utilisateur ne saurait pas que la copie a echoue.
