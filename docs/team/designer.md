# Designer UI/UX

> **Définition exécutable** : [`.claude/agents/designer.md`](../../.claude/agents/designer.md)
> Le lead lance ce rôle avec `subagent_type: "designer"`. Le prompt système est déjà dans la définition d'agent.

## Source de vérité

| Contenu | Fait foi dans | Pourquoi |
|---------|---------------|----------|
| Comportement de l'agent (identité, ton, scope fichiers, interdits, jeu d'outils) | `.claude/agents/designer.md` | C'est le texte que l'agent reçoit réellement au démarrage, et c'est le seul endroit où le champ `tools` restreint effectivement ses capacités. |
| Checklist de fin de tâche | Cette fiche | Le hook PreToolUse de commit lit `docs/team/*.md` pour auditer les checklists de la session. |
| Place du rôle dans le process, interactions, arbitrages historiques | Cette fiche | Doc destinée à un humain. |

**Quand tu changes quelque chose** : le comportement va dans `.claude/agents/designer.md` en premier. Cette fiche suit si l'explication humaine ou la checklist change.

## Rôle

Le designer produit des specs visuelles et structurelles que le dev intègre. Il ne fait **pas** l'intégration lui-même. Cette séparation est un arbitrage explicite de l'architecte : designer et intégrateur sont deux métiers, et les mélanger a produit du débordement de scope par le passé.

## Place dans le process

Il intervient à l'étape 4 du process type (section 8 de [`../ia-architecture-reference.md`](../ia-architecture-reference.md)), en parallèle du PO, puis à l'étape 11 pour la review a11y et design du résultat intégré.

## Interactions

- **PO** : le PO fournit le contenu et le copy, le designer fournit la structure et le visuel.
- **Dev** : challenge mutuel. Le designer pousse sur le rendu et l'a11y, le dev pousse sur la faisabilité. C'est sain, ça ne remonte au lead que si ça bloque.
- **Lead** : arbitrage quand le désaccord designer/dev bloque.

## Scope fichiers

`docs/design/` en écriture, `src/ui/` en lecture seule pour la review. Rien d'autre.

Le jeu d'outils déclaré dans la définition d'agent ne contient volontairement pas `Bash` : le designer ne lance ni build, ni test, ni commande git. La restriction de chemins (`docs/design/` seulement) n'est pas exprimable via `tools`, elle reste portée par le prompt.

## Workflow

1. Le lead ou le PO décrit le besoin UI.
2. Le designer produit un document de specs dans `docs/design/` : wireframe, classes Tailwind, JSX partiel, notes a11y.
3. Le dev lit les specs et intègre.
4. Le designer review le résultat visuel et a11y.
5. Si corrections nécessaires, nouveau document de specs, le dev ré-intègre.

## Exception

Pour un changement UI trivial (ajout d'un champ dans un formulaire existant, modification d'un label), le dev le fait directement sans passer par le designer. Ne pas bloquer le flux sur ces cas.

## Points de vigilance

- Les classes Tailwind proposées doivent exister dans la configuration du projet (`tailwind.config.js`, couleurs `fgp`, dark mode par `prefers-color-scheme`). Tailwind est compilé au build, il n'y a pas de CDN pour rattraper une classe inventée.
- Le designer ne touche pas à `src/main.ts`, `deno.json`, ni aux fichiers de configuration.
- **Pause** : un message de pause du lead arrête le designer immédiatement.

## Checklist de fin de tâche

- [ ] Specs UI produites dans `docs/design/`
- [ ] Notes a11y incluses (aria-labels, structure sémantique)
- [ ] Review du résultat intégré par le dev (si applicable)
