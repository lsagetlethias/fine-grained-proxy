# Review UI — Section "Tester un scope"

## Resume

La section est bien integree visuellement dans le formulaire et le `<details>` est coherent avec les accordeons de la sidebar doc. En revanche, l'accessibilite des indicateurs visuels (checkmark/cross) et du verdict est quasi absente : aucun `aria-live`, aucun `sr-only`, aucun `role` dans le code client. C'est le point bloquant principal. Quelques ecarts mineurs de coherence Tailwind avec le reste du formulaire.

## Points positifs

- Le `<details>` reprend le meme pattern que les accordeons de doc dans l'aside (meme `cursor-pointer`, meme `text-sm font-medium text-fgp-700 dark:text-fgp-300`).
- Les inputs utilisent les memes classes arrondies, bordures et focus ring que le reste du formulaire (`rounded-md border border-gray-300`, `dark:bg-gray-800 dark:border-gray-600`).
- La logique de debounce (150ms) sur le highlight temps reel est un bon choix UX, evite le flickering.
- Le body textarea s'affiche/masque dynamiquement selon la methode HTTP selectionnee.
- Le bouton "Tester" a un `disabled = true` pendant le fetch, ce qui evite le double-click.
- Dark mode present sur les elements statiques (TSX).

## Issues trouvees

### Issue #1 — Indicateurs sans alternative textuelle pour screen readers

- **Fichier** : `src/ui/client/test-scope.ts`, lignes 76-90 (`createResultRow`)
- **Severite** : critique
- **Description** : Les indicateurs `\u2713` et `\u2717` sont de simples caracteres Unicode dans un `<span>`. Aucun `aria-label`, aucun texte `sr-only`, aucun `role="img"`. Un screen reader va annoncer "check mark" ou rien du tout selon le moteur, ce qui est non deterministe et inutilisable.
- **Correction proposee** : Ajouter `role="img"` et `aria-label` sur le `<span>` icone :
  ```ts
  icon.setAttribute("role", "img");
  icon.setAttribute("aria-label", match ? "Scope autorise" : "Scope refuse");
  ```
  Ou alternativement, ajouter un `<span class="sr-only">` avec le texte equivalent.

### Issue #2 — Le verdict n'est pas annonce aux screen readers (aria-live manquant)

- **Fichier** : `src/ui/config-page.tsx`, ligne 349 (`#test-scope-verdict`)
- **Severite** : critique
- **Description** : Le `<span id="test-scope-verdict">` n'a ni `aria-live="polite"` ni `role="status"`. Quand le verdict "Acces autorise"/"Acces refuse" est injecte par JS, les screen readers ne l'annoncent pas. C'est le resultat principal de l'interaction et il est invisible pour les utilisateurs non-voyants.
- **Correction proposee** : Ajouter `aria-live="polite"` ou `role="status"` sur le span :
  ```tsx
  <span id="test-scope-verdict" class="text-sm font-medium" aria-live="polite" role="status"></span>
  ```
  Note : le reste du formulaire utilise deja `aria-live="polite"` sur `#apps-section`, `#scope-chips` et `#result-section`. C'est le meme pattern a suivre.

### Issue #3 — Le container de resultats n'a pas d'aria-live

- **Fichier** : `src/ui/config-page.tsx`, ligne 339 (`#test-scope-results`)
- **Severite** : moyenne
- **Description** : `<div id="test-scope-results">` recoit du contenu dynamique (les lignes de resultats par scope) mais n'a pas `aria-live="polite"`. Les resultats du highlight temps reel ne sont donc pas annonces. C'est moins critique que le verdict (Issue #2) car c'est un detail intermediaire, mais ca reste un feedback dynamique que les screen readers devraient pouvoir capturer.
- **Correction proposee** : Ajouter `aria-live="polite"` sur le container :
  ```tsx
  <div id="test-scope-results" class="space-y-1" aria-live="polite"></div>
  ```

### Issue #4 — Le body filter match indicator `(body \u2713)` / `(body \u2717)` sans alternative

- **Fichier** : `src/ui/client/test-scope.ts`, lignes 122-126 (`renderResults`)
- **Severite** : moyenne
- **Description** : Quand un scope a des body filters, le texte affiche contient `(body \u2713)` ou `(body \u2717)`. Ces caracteres Unicode sont injectes dans le `textContent` du label, donc un screen reader les lira de facon brute. Ce n'est pas catastrophique (le screen reader peut dire "body check mark") mais c'est fragile et inconsistant.
- **Correction proposee** : Remplacer les caracteres Unicode par du texte clair dans le label :
  ```ts
  text += r.bodyMatch ? " (body OK)" : " (body refuse)";
  ```
  Ou creer un second `<span>` avec `role="img"` et `aria-label` comme pour l'Issue #1.

### Issue #5 — Le bouton "Tester" n'a pas de focus ring offset en dark mode

- **Fichier** : `src/ui/config-page.tsx`, ligne 345 (`#btn-test-scope`)
- **Severite** : mineure
- **Description** : Le bouton utilise `focus:ring-2 focus:ring-fgp-500` mais pas `focus:ring-offset-2 dark:focus:ring-offset-gray-900`. Le bouton "Generer l'URL" (ligne 277) et le bouton "Charger les apps" (ligne 144) ont tous les deux `focus:ring-offset-2 dark:focus:ring-offset-gray-900`. Le bouton "Tester" casse la coherence.
- **Correction proposee** : Ajouter `focus:ring-offset-2 dark:focus:ring-offset-gray-900` aux classes du bouton.

### Issue #6 — Le select "Methode" n'a pas de focus ring

- **Fichier** : `src/ui/config-page.tsx`, lignes 296-305 (`#test-method`)
- **Severite** : mineure
- **Description** : Le select utilise `rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200` mais pas les classes `focus:border-fgp-500 focus:ring-1 focus:ring-fgp-500 outline-none` qu'on retrouve sur tous les autres selects et inputs du formulaire (cf. `#auth` ligne 108, `#target` ligne 92).
- **Correction proposee** : Ajouter les classes focus :
  ```
  focus:border-fgp-500 focus:ring-1 focus:ring-fgp-500 outline-none
  ```

### Issue #7 — L'input "Chemin de test" n'a pas de focus ring

- **Fichier** : `src/ui/config-page.tsx`, lignes 314-319 (`#test-path`)
- **Severite** : mineure
- **Description** : Meme probleme que l'Issue #6. L'input n'a pas les classes `focus:border-fgp-500 focus:ring-1 focus:ring-fgp-500 outline-none`.
- **Correction proposee** : Ajouter les memes classes focus que les autres inputs du formulaire.

### Issue #8 — Le textarea "Body JSON" n'a pas de focus ring

- **Fichier** : `src/ui/config-page.tsx`, lignes 330-335 (`#test-body`)
- **Severite** : mineure
- **Description** : Idem Issues #6 et #7.
- **Correction proposee** : Ajouter les classes focus standard.

### Issue #9 — Pas de feedback visuel (spinner ou texte) pendant le chargement du test

- **Fichier** : `src/ui/client/test-scope.ts`, lignes 195-230
- **Severite** : mineure
- **Description** : Le bouton "Tester" passe en `disabled = true` pendant le fetch, ce qui est bien, mais visuellement il n'y a pas de `disabled:opacity-50 disabled:cursor-not-allowed` dans les classes TSX (ligne 345). Le bouton disabled est identique visuellement au bouton actif. L'utilisateur ne sait pas que c'est en cours.
- **Correction proposee** : Ajouter `disabled:opacity-50 disabled:cursor-not-allowed` aux classes du bouton, comme c'est deja fait sur `#btn-generate` (ligne 277) et `#btn-load-apps` (ligne 144).

## Accessibilite (a11y)

| Critere | Statut | Detail |
|---------|--------|--------|
| Labels explicites (for/id) | OK | Les 3 champs (methode, chemin, body) ont des `<label for="">` corrects |
| Indicateurs visuels avec alternatives | KO | Issues #1 et #4 — les checkmark/cross sont purement visuels |
| Verdict annonce aux AT | KO | Issue #2 — pas d'`aria-live` sur le verdict |
| Focus visible sur tous les interactifs | KO | Issues #5, #6, #7, #8 — focus ring manquant ou incomplet |
| Etat disabled perceptible | KO | Issue #9 — pas de style `disabled:` |
| Contraste couleurs | OK | `text-green-500`/`text-red-400` sur fond blanc/gris-800 passe les ratios WCAG AA |
| Navigation clavier | OK | Tous les elements sont tabbables nativement (`<select>`, `<input>`, `<button>`, `<details>`) |
| Semantique HTML | OK | `<details>/<summary>` est semantiquement correct, `<label>` bien lies |

## Recommandations

1. **Priorite haute** : Corriger les Issues #1 et #2 avant toute release. Les indicateurs visuels et le verdict sont le coeur de cette feature, et ils sont totalement invisibles aux screen readers.
2. **Priorite haute** : Ajouter les styles `disabled:opacity-50 disabled:cursor-not-allowed` sur le bouton "Tester" (Issue #9). C'est 2 classes Tailwind et ca change l'experience pour tout le monde.
3. **Priorite moyenne** : Uniformiser les focus rings sur les 3 inputs + le bouton (Issues #5-8). C'est de la coherence pure, le pattern existe deja partout dans le formulaire.
4. **Optionnel** : Pour le highlight temps reel (debounce), envisager d'ajouter `aria-relevant="additions removals"` sur `#test-scope-results` pour eviter que le screen reader n'annonce chaque mise a jour intermediaire. Ou alors ne mettre `aria-live` que sur le verdict et pas sur le container de resultats intermediaires (approche plus minimaliste et probablement meilleure pour l'UX AT).
5. **Optionnel** : Ajouter un `aria-describedby` sur le textarea body pointant vers une description type "Format JSON attendu" pour guider les utilisateurs de lecteurs d'ecran.
