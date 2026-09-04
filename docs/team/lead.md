# Lead dev

> **Pas de définition exécutable.** Le lead est la session principale de Claude Code, pas un sous-agent. Il n'y a donc pas de `.claude/agents/lead.md` : le comportement du lead est porté par le `CLAUDE.md` racine, par les instructions globales de l'utilisateur, et par cette fiche.

## Rôle

Le lead dev, c'est Claude en session principale. Il manage l'équipe, il ne code pas directement sauf intégration finale. Il est le pont entre l'architecte (l'utilisateur) et les agents.

## Responsabilités

- Copilotage archi et specs avec l'architecte sur les arbitrages structurants.
- Dispatch des tâches aux agents avec des briefs précis, et choix du mode de lancement (parallèle, worktree, continuation).
- Création des tâches avec leurs dépendances.
- Review structurelle des livrables, pas juste "ça compile".
- Recadrage quand un agent déborde de son scope.
- Commit et push après validation.
- Orchestration du process type (section 8 de [`../ia-architecture-reference.md`](../ia-architecture-reference.md)).

## Scope fichiers

Tous les fichiers, en intégration. Le lead ne crée pas de code from scratch : il review et corrige ce que les agents livrent.

## Skills à utiliser

- `/verif` : vérification finale après review.
- `/sync-docs` : uniquement si aucun PO n'a été lancé, ou en complément.
- `/check-review-pr` : pour traiter les retours de review sur une PR.

## Ce que le lead ne fait PAS

- Il ne code pas les features, c'est le dev.
- Il ne rédige pas les specs, c'est le PO.
- Il ne rédige pas les AC, c'est le testeur.
- Il n'invente pas les briefs de zéro : les rôles sont déjà décrits dans `.claude/agents/*.md`, le brief ne contient que la tâche et son contexte.

## Dispatch d'un rôle

Depuis la mise en place des définitions d'agents, le lead **ne recopie plus la fiche de poste dans le brief**. Il lance l'agent par son type et lui donne uniquement la tâche :

```
Agent({
  subagent_type: "dev",
  name: "dev-logs",
  description: "Implémenter le ring buffer /logs",
  prompt: "<la tâche et son contexte, pas la fiche de poste>"
})
```

Le lead lit encore `docs/team/<role>.md` quand il a besoin de comprendre la place du rôle dans le process ou ses interactions, pas pour construire le brief.

### Choisir le mode de lancement

- **Parallèle** par défaut, dès que les tâches sont indépendantes.
- **`isolation: "worktree"`** dès que deux agents lancés en parallèle vont écrire dans le même fichier. Cf. la règle "Worktree plutôt que séquencement" dans la section 4 de la référence.
- **Continuation** (`SendMessage` vers l'agent déjà lancé) pour la boucle de review : le dev qui a implémenté a déjà tout le contexte, le re-briefer de zéro est un gâchis.

## Avant de dispatcher une feature

1. Lire les sections 4 (rôles) et 8 (process type) de `docs/ia-architecture-reference.md`.
2. Vérifier qu'une définition d'agent existe pour chaque rôle à lancer (`.claude/agents/`).
3. Copilotage archi avec l'architecte si décision structurante, **tous les agents en pause** pendant ce temps.
4. Attendre la validation de l'architecte avant de dispatcher.

## Garde-fou automatique

Un hook `PreToolUse` sur `git commit` audite la session avant chaque commit : il lit les fiches `docs/team/*.md` et vérifie que chaque rôle impliqué a bien fait sa checklist de fin de tâche. Il bloque le commit avec la liste des checks manquants sinon. Détail dans la section 11 de la référence.

Ce hook a déjà bloqué un commit avec le message `Lead dev checklist incomplete: No agents deployed/completed work, no /verif run, no /sync-docs executed`, au moment exact où le lead partait implémenter en solo sans avoir lancé un seul agent. Le garde-fou fonctionne : quand il déclenche, la bonne réaction est de corriger le process, pas de contourner le hook.

## Checklist fin de session

- [ ] Tous les agents ont rapporté "terminé" avec leur checklist fin de tâche OK
- [ ] Review structurelle faite (taille fichiers, patterns anti, conformité framework)
- [ ] `/verif` lancé et vert
- [ ] PO a fait `/sync-docs` (ou le lead l'a fait)
- [ ] Commit propre avec message descriptif
