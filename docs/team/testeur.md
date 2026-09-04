# Testeur / QA

> **Définition exécutable** : [`.claude/agents/testeur.md`](../../.claude/agents/testeur.md)
> Le lead lance ce rôle avec `subagent_type: "testeur"`. Le prompt système est déjà dans la définition d'agent.

## Source de vérité

| Contenu | Fait foi dans | Pourquoi |
|---------|---------------|----------|
| Comportement de l'agent (identité, ton, scope fichiers, interdits, skills, nommage des tests) | `.claude/agents/testeur.md` | C'est le texte que l'agent reçoit réellement au démarrage. |
| Checklist de fin de tâche | Cette fiche | Le hook PreToolUse de commit lit `docs/team/*.md` pour auditer les checklists de la session. |
| Place du rôle dans le process, interactions, arbitrages historiques | Cette fiche | Doc destinée à un humain. |

**Quand tu changes quelque chose** : le comportement va dans `.claude/agents/testeur.md` en premier. Cette fiche suit si l'explication humaine ou la checklist change.

## Rôle

Le testeur est le garde-fou qualité avant la review du lead. Son job n'est pas de valider ce qu'on lui donne, c'est de chercher activement ce qui casse : cas limites, incohérences entre specs, comportements non spécifiés.

## Place dans le process

Il intervient à l'étape 7 du process type (section 8 de [`../ia-architecture-reference.md`](../ia-architecture-reference.md)) pour challenger les specs et rédiger les AC, puis à l'étape 10 pour implémenter les tests nommés par AC. Le challenge des specs se fait **en parallèle** de l'implémentation du dev, pas après : un problème de spec détecté tôt coûte moins cher.

## Interactions

- **PO** : le testeur challenge ses specs. Les désaccords remontent au lead, qui arbitre ou copilote avec l'architecte.
- **Dev** : le dev corrige les tests que ses changements cassent, le testeur écrit les scénarios. Si un test révèle un bug applicatif, le testeur ne corrige pas `src/` : il documente et le lead dispatche au dev.
- **Lead** : review de la matrice de couverture, arbitrage sur les AC contestés.

## Scope fichiers

`tests/` (`testu/`, `testi/`, `teste2e/`), `docs/review/`, `docs/acceptance-criteria.md`. Pas `src/`.

## Convention de nommage des tests

Format `AC-XX.Y: description`, numérotation séquentielle par feature. Vérifier le dernier AC existant dans `docs/acceptance-criteria.md` avant de numéroter, pour éviter les collisions quand plusieurs features avancent en parallèle.

## Points de vigilance

- **Jamais assouplir un test pour le faire passer**, jamais supprimer un check qui échoue. Un test rouge qui révèle un vrai problème est un livrable valide.
- **Exploration** : LSP avant grep pour comprendre ce qu'il faut tester. Grep reste utile pour les fixtures et les chaînes littérales.
- **Pause** : un message de pause du lead arrête le testeur immédiatement.

## Checklist de fin de tâche

- [ ] AC rédigés et validés avec le PO/lead
- [ ] Tests implémentés et nommés par AC
- [ ] `/verif` lancé et vert (tous les tests passent)
- [ ] Matrice couverture AC/tests produite
- [ ] Rapport fidèle : tests passés, échoués, non couverts
