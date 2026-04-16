# Review UI — Onglets Doc/Changelog

## Points positifs
- Balisage ARIA correct : `role="tablist"`, `role="tab"`, `role="tabpanel"`, `aria-selected`, `aria-controls`, `aria-labelledby` -- tout est en place.
- Cohérence visuelle : les deux panels partagent les mêmes classes Tailwind pour le texte (`text-sm text-gray-600 dark:text-gray-400`), pas de rupture de style entre les onglets.
- Dark mode couvert sur les tabs actifs et inactifs, avec des variantes `dark:` explicites pour border et text.
- Le switch JS est simple et lisible : `activate()` bascule les classes et le `hidden` de manière symétrique.

## Issues

### #1 — Pas de navigation clavier sur les onglets
Le pattern WAI-ARIA Tabs recommande la navigation par fleches gauche/droite entre les onglets (`role="tab"`). Actuellement, seul le clic est geré dans `tabs.ts`. Un utilisateur clavier doit tabber entre les deux boutons (pas bloquant mais non conforme au pattern).

### #2 — tabindex manquant sur l'onglet inactif
L'onglet inactif devrait avoir `tabindex="-1"` pour etre exclu de l'ordre de tabulation, et l'actif `tabindex="0"`. Actuellement aucun `tabindex` n'est posé, donc les deux boutons sont tabulables en permanence.

### #3 — Remplacement brutal de `className` dans `activate()`
La fonction `activate()` remplace tout le `className` en dur (`px-4 py-2 text-sm font-medium border-b-2 ${classes}`). Si un designer ajoute une classe sur le bouton cote HTML (ex: `mr-2`), elle sera ecrasee au premier clic. Il faudrait toggler uniquement les classes qui changent (active/inactive) plutot que tout remplacer.

### #4 — Pas de `role="tablist"` geré coté JS
Le JS ne gere pas le lien semantique entre le tablist et les tabs. Ce n'est pas un bug (le HTML statique est correct), mais si jamais le DOM est regenere dynamiquement, le contrat ARIA ne sera pas maintenu.

### #5 — Panel changelog masqué par `hidden` au lieu de `display` conditionnel
Le panel changelog utilise `class="hidden"` en HTML initial. C'est correct, mais pour l'a11y, un `aria-hidden="true"` sur le panel inactif renforcerait la semantique (les screen readers pourraient quand meme acceder au contenu hidden via certains moyens).

## Recommandations
- Ajouter un `keydown` listener sur le tablist pour les fleches gauche/droite + Home/End (pattern WAI-ARIA Tabs).
- Gerer `tabindex="0"` sur l'onglet actif et `tabindex="-1"` sur l'inactif dans `activate()`.
- Refactorer `activate()` pour toggler les classes differentielles plutot que remplacer tout le `className`.
- Ajouter `aria-hidden` sur le panel inactif dans `activate()`.
- Si le nombre d'onglets grandit, extraire le pattern dans un composant generique reutilisable.
