# PO (Product Owner)

> **Définition exécutable** : [`.claude/agents/po.md`](../../.claude/agents/po.md)
> Le lead lance ce rôle avec `subagent_type: "po"`. Le prompt système est déjà dans la définition d'agent, il n'y a plus à recopier la fiche dans le brief.

## Source de vérité

| Contenu | Fait foi dans | Pourquoi |
|---------|---------------|----------|
| Comportement de l'agent (identité, ton, scope fichiers, interdits, skills, règles changelog) | `.claude/agents/po.md` | C'est le texte que l'agent reçoit réellement au démarrage. |
| Checklist de fin de tâche | Cette fiche | Le hook PreToolUse de commit lit `docs/team/*.md` pour auditer les checklists de la session. |
| Place du rôle dans le process, interactions, arbitrages historiques | Cette fiche | Doc destinée à un humain. |

**Quand tu changes quelque chose** : le comportement va dans `.claude/agents/po.md` en premier. Cette fiche suit si l'explication humaine ou la checklist change. Les règles de format du changelog sont détaillées dans la définition d'agent parce que le PO doit les avoir sous les yeux au moment d'écrire ; cette fiche n'en garde que le résumé.

## Rôle

Le PO traduit le besoin de l'architecte en specs fonctionnelles exploitables par le dev et le testeur. Il est aussi le propriétaire de la documentation du projet et du changelog utilisateur.

## Place dans le process

Il intervient à l'étape 3 du process type (section 8 de [`../ia-architecture-reference.md`](../ia-architecture-reference.md)), après le copilotage archi et avant le designer et le dev. Il repasse en fin de session pour `/sync-docs` (étape 13), avant le commit du lead. Le lead n'a pas besoin de lui demander : `/sync-docs` fait partie de sa checklist.

## Interactions

- **Architecte / lead** : reçoit le besoin, remonte les zones floues et les arbitrages à trancher.
- **Designer** : le PO fournit le contenu et le copy, le designer fournit la structure et le visuel.
- **Dev** : le PO fournit les specs, il challenge le dev si l'implémentation s'éloigne du besoin.
- **Testeur** : le testeur challenge les specs du PO, c'est attendu et sain. Le PO arbitre ou remonte au lead.

## Scope fichiers

`docs/` (y compris `docs/changelog.md`) et le markdown racine (`README.md`, `ACTIVITY.md`, `CLAUDE.md`). Pas `docs/design/` (designer), pas `docs/review/` ni `docs/acceptance-criteria.md` (testeur).

## Résumé des règles changelog

Une ligne par item, orientée utilisateur, `**Breaking** :` en tête quand c'est cassant, ordre antéchronologique. Le renderer JSX ne gère que cinq features markdown : `## DATE`, `- item`, `**gras**`, `` `code` ``, `[texte](url)`. Le détail complet est dans la définition d'agent.

## Points de vigilance

- **Doc API non négociable** : chaque route doit avoir une doc avec exemples curl.
- **Pause** : un message de pause du lead arrête le PO immédiatement. Ne pas produire de specs sur des arbitrages non validés.
- **Rétro-édition du changelog** : le PO a le droit de reformuler ou fusionner des entrées passées pour garder l'ensemble cohérent.

## Checklist de fin de tâche

- [ ] Specs à jour dans `docs/specs.md` si nouvelles fonctionnalités
- [ ] `/sync-docs` lancé et résumé produit
- [ ] ACTIVITY.md mis à jour avec l'entrée de session
- [ ] ADR créé si décision architecturale significative
- [ ] README.md vérifié pour cohérence
- [ ] **Changelog à jour dans `docs/changelog.md`** si feature user-facing ou breaking, formulé de manière concise, orienté utilisateur, format markdown strict
