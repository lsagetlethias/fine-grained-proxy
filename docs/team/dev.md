# Dev senior

> **Définition exécutable** : [`.claude/agents/dev.md`](../../.claude/agents/dev.md)
> Le lead lance ce rôle avec `subagent_type: "dev"`. Il n'a plus à recopier la fiche dans le brief : le prompt système est déjà dans la définition d'agent.

## Source de vérité

Ce rôle vit dans deux fichiers, avec un partage clair :

| Contenu | Fait foi dans | Pourquoi |
|---------|---------------|----------|
| Comportement de l'agent (identité, ton, scope fichiers, interdits, skills, conventions d'exploration) | `.claude/agents/dev.md` | C'est le texte que l'agent reçoit réellement au démarrage. Une règle absente de ce fichier n'est pas appliquée. |
| Checklist de fin de tâche | Cette fiche | Le hook PreToolUse de commit lit `docs/team/*.md` pour auditer les checklists de la session. Déplacer la checklist casserait le hook. |
| Place du rôle dans le process, interactions, arbitrages historiques | Cette fiche | Doc destinée à un humain, pas au modèle. |

**Quand tu changes quelque chose** : un changement de comportement va dans `.claude/agents/dev.md` en premier. Cette fiche n'est mise à jour que si l'explication destinée à un humain change, ou si la checklist bouge. La checklist est reprise dans la définition d'agent pour que le dev l'ait sous la main, avec une mention explicite que cette fiche fait foi.

## Rôle

Le dev senior implémente à partir des specs du PO et des specs UI du designer. Il est autonome sur la qualité : il lance `/verif` de lui-même et corrige avant de rapporter. Il n'attend pas que le lead trouve ses erreurs.

## Place dans le process

Il intervient à l'étape 6 du process type (section 8 de [`../ia-architecture-reference.md`](../ia-architecture-reference.md)), après les specs PO et designer, et il repasse à l'étape 9 quand le lead lui renvoie ses remarques de review. Cette boucle de review se fait par **continuation** (`SendMessage` vers l'agent déjà lancé), pas par un nouveau dispatch : le dev a déjà tout le contexte de son implémentation.

## Interactions

- **PO** : lui fournit les specs. Le dev le challenge si une spec est infaisable ou incohérente, via le lead.
- **Designer** : lui fournit les specs UI dans `docs/design/`. Le dev les intègre et remonte les problèmes de faisabilité.
- **Testeur** : rédige les AC et les tests. Le dev corrige les tests que ses changements cassent, il ne rédige pas les scénarios.
- **Lead** : review structurelle, commit, arbitrages de scope.

## Scope fichiers

`src/` et `tests/` (correction uniquement). Tout le reste passe par un feu vert du lead.

## Points de vigilance

- **Changelog** : le dev ne touche jamais au contenu de `docs/changelog.md`. Il peut modifier le renderer JSX. S'il livre une feature user-facing, il signale au lead qu'elle mérite une entrée, le lead relaie au PO.
- **Exploration** : LSP avant grep sur ce projet TypeScript. `workspaceSymbol`, `findReferences`, `goToDefinition`, `hover`. Grep reste le bon outil pour les fichiers non-TS, les chaînes littérales et les TODO/FIXME.
- **Parallélisation** : quand deux devs tournent en parallèle et touchent le même fichier (typiquement `deno.json`), le lead les lance avec `isolation: "worktree"` au lieu de les séquencer.
- **Pause** : un message de pause du lead arrête le dev immédiatement, tâche en cours non terminée.

## Checklist de fin de tâche

- [ ] Code implémenté selon les specs
- [ ] `/verif` lancé et vert (lint + fmt + check + tests)
- [ ] Si `/verif` a trouvé des erreurs, corrigées avant de rapporter
- [ ] Rapport fidèle : ce qui a été fait, ce qui passe, ce qui ne passe pas
