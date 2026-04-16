# Design Document -- Presets Reorganization

**Feature** : reorganisation de la section "Preset" du formulaire FGP
**Date** : 2026-04-16
**Auteur** : Designer FGP
**Statut** : Draft -- en attente de review lead

---

## Problemes identifies

1. Les 3 boutons (Scalingo, Reinitialiser, Importer) sont sur le meme plan visuel alors qu'ils ont des roles radicalement differents :
   - **Scalingo** = preset (pre-remplit le formulaire)
   - **Reinitialiser** = action destructive (vide tout)
   - **Importer** = toggle un sous-formulaire de decodage
2. Le bouton "Importer" ne change pas d'apparence quand la section import est ouverte. L'utilisateur n'a aucun feedback visuel de l'etat toggle.
3. Le label de section "Charger un preset" englobe les 3 boutons alors que seul "Scalingo" est un preset.

---

## Proposition

Trois changements :

1. **Regroupement semantique** : separer presets (Scalingo) et actions utilitaires (Reinitialiser, Importer) en deux zones visuelles distinctes.
2. **Reinitialiser = lien discret** au lieu d'un bouton au meme niveau que Scalingo. C'est une action secondaire/destructive, pas un preset.
3. **Importer = `<details>/<summary>` natif** avec chevron rotatif. Plus de JS custom pour toggle `hidden` : le navigateur gere l'ouverture/fermeture, le chevron donne le feedback visuel, et c'est accessible out-of-the-box.

---

## 1. Wireframe ASCII

### Etat ferme (defaut)

```
  Preset
  ┌──────────┐
  │ Scalingo │        Reinitialiser
  └──────────┘
  Pre-remplit le formulaire. Le bouton « Charger les apps »
  est disponible avec le mode d'auth Scalingo exchange.

  ▶ Importer une config existante
```

### Etat ouvert (details open)

```
  Preset
  ┌──────────┐
  │ Scalingo │        Reinitialiser
  └──────────┘
  Pre-remplit le formulaire. Le bouton « Charger les apps »
  est disponible avec le mode d'auth Scalingo exchange.

  ▼ Importer une config existante
  ┌─────────────────────────────────────────────┐
  │  URL FGP ou blob                            │
  │  ┌─────────────────────────────────────────┐│
  │  │ https://fgp.example.com/eyJhbGci...     ││
  │  └─────────────────────────────────────────┘│
  │  Cle client (X-FGP-Key)                     │
  │  ┌─────────────────────────────────────────┐│
  │  │ a7f2c9d4-1234-5678-...                  ││
  │  └─────────────────────────────────────────┘│
  │  ┌──────────┐                               │
  │  │ Decoder  │   status message              │
  │  └──────────┘                               │
  └─────────────────────────────────────────────┘
```

---

## 2. Structure JSX

### 2.1 Section complete

```tsx
{/* Preset */}
<section>
  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
    Preset
  </label>
  <div class="flex items-center gap-3">
    <button
      type="button"
      id="btn-preset-scalingo"
      class="rounded-md border border-fgp-500 bg-fgp-50 px-3 py-1.5 text-sm font-medium text-fgp-700 hover:bg-fgp-100 focus:outline-none focus:ring-2 focus:ring-fgp-500 focus:ring-offset-2 dark:bg-fgp-900 dark:text-fgp-200 dark:border-fgp-600 dark:hover:bg-fgp-800 dark:focus:ring-offset-gray-900"
    >
      Scalingo
    </button>
    <button
      type="button"
      id="btn-preset-clear"
      class="text-sm text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 focus:outline-none focus:underline"
    >
      R&eacute;initialiser
    </button>
  </div>
  <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
    Pr&eacute;-remplit le formulaire. Le bouton &laquo; Charger les apps &raquo; est
    disponible avec le mode d'auth Scalingo exchange.
  </p>

  <details id="import-details" class="mt-3">
    <summary
      id="btn-preset-import"
      class="cursor-pointer text-sm font-medium text-fgp-600 hover:text-fgp-800 dark:text-fgp-400 dark:hover:text-fgp-200 focus:outline-none focus:underline select-none list-none [&::-webkit-details-marker]:hidden"
    >
      <span class="inline-flex items-center gap-1.5">
        <svg
          class="h-3.5 w-3.5 transition-transform duration-150 [[open]>summary_&]:rotate-90"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fill-rule="evenodd"
            d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
            clip-rule="evenodd"
          />
        </svg>
        Importer une config existante
      </span>
    </summary>
    <div
      id="import-section"
      class="mt-2 rounded-md border border-gray-200 dark:border-gray-700 p-3 space-y-3"
    >
      <div>
        <label
          class="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1"
          for="import-blob"
        >
          URL FGP ou blob
        </label>
        <input
          type="text"
          id="import-blob"
          placeholder="https://fgp.example.com/eyJhbGci.../ ou eyJhbGci..."
          class="w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-mono focus:border-fgp-500 focus:ring-1 focus:ring-fgp-500 outline-none dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200 dark:placeholder-gray-400"
        />
      </div>
      <div>
        <label
          class="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1"
          for="import-key"
        >
          Cl&eacute; client (X-FGP-Key)
        </label>
        <input
          type="text"
          id="import-key"
          placeholder="a7f2c9d4-1234-5678-..."
          class="w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-mono focus:border-fgp-500 focus:ring-1 focus:ring-fgp-500 outline-none dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200 dark:placeholder-gray-400"
        />
      </div>
      <div class="flex items-center gap-3">
        <button
          type="button"
          id="btn-import-decode"
          class="rounded-md bg-fgp-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-fgp-700 focus:outline-none focus:ring-2 focus:ring-fgp-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed dark:focus:ring-offset-gray-900"
        >
          D&eacute;coder
        </button>
        <span
          id="import-status"
          class="text-sm font-medium"
          aria-live="polite"
          role="status"
        >
        </span>
      </div>
    </div>
  </details>
</section>
```

---

## 3. Decisions visuelles detaillees

### 3.1 Bouton "Scalingo" -- inchange

Style conserve tel quel : `border-fgp-500 bg-fgp-50 text-fgp-700` (light), `bg-fgp-900 text-fgp-200` (dark). C'est un preset, il garde son traitement "bouton primaire outline fgp".

### 3.2 "Reinitialiser" -- degrade en lien textuel

**Avant** : bouton gris `border border-gray-300 px-3 py-1.5` -- meme poids visuel que Scalingo.

**Apres** : lien textuel discret, rouge au hover pour signaler la nature destructive.

Classes :
```
text-sm text-gray-500 hover:text-red-600
dark:text-gray-400 dark:hover:text-red-400
focus:outline-none focus:underline
```

Rationale : "Reinitialiser" n'est pas un preset, c'est une action secondaire destructive. Le traiter comme un lien textuel le met en retrait par rapport a Scalingo, et le rouge au hover previent l'utilisateur avant le clic.

### 3.3 "Importer" -- `<details>/<summary>` avec chevron

**Avant** : bouton gris identique a "Reinitialiser", toggle `hidden` via JS.

**Apres** : `<details>` natif, `<summary>` style comme un lien fgp (meme traitement que le lien "+ Ajouter des filtres body" existant dans la section scopes), avec un chevron SVG qui tourne a 90 degres quand le details est `[open]`.

Pourquoi `<details>` plutot que le toggle JS actuel :
- Feedback visuel gratuit (le chevron tourne)
- Accessible nativement (clavier, screen readers)
- Moins de JS a maintenir
- Le pattern `<details>` est deja utilise dans le formulaire (section "Tester un scope")

Classes du `<summary>` :
```
cursor-pointer text-sm font-medium
text-fgp-600 hover:text-fgp-800
dark:text-fgp-400 dark:hover:text-fgp-200
focus:outline-none focus:underline
select-none list-none [&::-webkit-details-marker]:hidden
```

Le `list-none` + `[&::-webkit-details-marker]:hidden` supprime le triangle natif du navigateur pour le remplacer par notre chevron SVG custom, coherent avec le design system.

### 3.4 Chevron SVG

```html
<svg
  class="h-3.5 w-3.5 transition-transform duration-150 [[open]>summary_&]:rotate-90"
  viewBox="0 0 20 20"
  fill="currentColor"
  aria-hidden="true"
>
  <path
    fill-rule="evenodd"
    d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
    clip-rule="evenodd"
  />
</svg>
```

Le selecteur `[[open]>summary_&]:rotate-90` applique la rotation quand le `<details>` parent a l'attribut `open`. Tailwind genere la classe via l'arbitrary variant `[[open]>summary_&]`.

**Attention dev** : le selecteur Tailwind `[[open]>summary_&]` fonctionne avec Tailwind 3.x. Si ca ne compile pas correctement, l'alternative est d'utiliser le selecteur `group` : ajouter `group` sur le `<details>` et utiliser `group-open:rotate-90` sur le SVG. En Tailwind 3.2+, `group-open:` est supporte nativement via le `open` variant sur le groupe.

Alternative plus safe :

```tsx
<details id="import-details" class="mt-3 group">
  ...
    <svg class="h-3.5 w-3.5 transition-transform duration-150 group-open:rotate-90" ...>
  ...
</details>
```

Je recommande l'approche `group`/`group-open:` : c'est plus lisible, plus robuste, et plus repandue dans l'ecosysteme Tailwind.

---

## 4. Label de section

**Avant** : "Charger un preset" -- trompeur, car "Reinitialiser" et "Importer" ne sont pas des presets.

**Apres** : "Preset" -- court, juste. Le texte explicatif sous les boutons garde la mention "Pre-remplit le formulaire" qui clarifie le role.

---

## 5. Impact client-side JS

### Ce qui change dans `import-config.ts`

Le toggle JS `importSection.classList.toggle("hidden")` sur le bouton `btn-preset-import` **doit etre supprime**. Le `<details>` gere l'ouverture/fermeture nativement.

Le `querySelector` du `import-section` reste valide (c'est la div a l'interieur du `<details>`).

Si le code doit ouvrir/fermer l'import programmatiquement (par ex. apres un decode reussi), utiliser :
```ts
const details = document.getElementById("import-details") as HTMLDetailsElement;
details.open = true;  // ouvre
details.open = false; // ferme
```

L'ID du `<summary>` reste `btn-preset-import` pour ne pas casser les references existantes.

### Ce qui ne change PAS

- L'ID `btn-preset-clear` reste le meme, seul le style change.
- Les IDs `import-blob`, `import-key`, `btn-import-decode`, `import-status` restent identiques.
- Le listener `click` sur `btn-import-decode` et la logique de decode ne changent pas.

---

## 6. Notes a11y

- **`<details>/<summary>`** : nativement accessible. Les screen readers annoncent l'etat expanded/collapsed. Pas besoin d'`aria-expanded` custom.
- **Chevron `aria-hidden="true"`** : decoratif, le texte du summary suffit.
- **"Reinitialiser"** en lien textuel : garder un `type="button"` sur l'element. C'est un `<button>` style comme un lien, pas un `<a>`. Le role natif button est correct.
- **Couleur rouge au hover sur "Reinitialiser"** : le rouge n'est pas le seul indicateur (le texte "Reinitialiser" est explicite), donc pas de probleme de contraste/daltonisme. C'est du renfort visuel, pas de l'information unique.
- **Focus visible** sur "Reinitialiser" : `focus:underline` pour signaler le focus sans ring (coherent avec le traitement lien textuel).
- **Focus visible** sur le summary : `focus:underline` idem.

---

## 7. Checklist dev

- [ ] Remplacer le label "Charger un preset" par "Preset"
- [ ] Remplacer le `div.flex.gap-2` contenant les 3 boutons par `div.flex.items-center.gap-3` avec Scalingo + Reinitialiser
- [ ] Changer les classes de `btn-preset-clear` (bouton gris -> lien textuel discret)
- [ ] Sortir le bouton "Importer" et la `div#import-section` du `div.flex` vers un `<details>` en dessous
- [ ] Ajouter le chevron SVG dans le `<summary>` avec rotation `group-open:rotate-90`
- [ ] Supprimer le toggle `classList.toggle("hidden")` dans `import-config.ts`
- [ ] Supprimer la classe `hidden` de la div `import-section` (la visibilite est geree par `<details>`)
- [ ] Verifier que le decode fonctionne toujours (les IDs ne changent pas)
- [ ] Verifier dark mode
- [ ] Verifier navigation clavier (Tab sur Scalingo -> Reinitialiser -> summary -> champs internes quand open)
