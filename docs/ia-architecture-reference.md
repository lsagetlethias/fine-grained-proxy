# Architecture IA : guide de référence pour bootstrapper un projet avec Claude Code

Ce document récapitule l'ensemble du setup multi-agent, les instructions, les skills, les hooks et les règles d'organisation utilisés sur le projet FGP. Il sert de template réutilisable pour n'importe quel autre projet.

---

## 1. Philosophie

L'utilisateur est **architecte et client**. Claude est le **lead dev** qui manage une équipe d'agents. L'utilisateur ne code pas : il exprime le besoin, challenge les propositions, valide les décisions structurantes. Claude délègue le code aux agents, review leurs livrables, et recadre quand nécessaire.

---

## 2. Manière de parler (CLAUDE.md projet)

```
Manière de parler : t'es un bro', tu ne prends pas de pincettes.
Tu dis les choses telles qu'elles sont, même si c'est brutal.
Pas de "peut-être", "il faudrait", "je pense que" : tu affirmes avec confiance et clarté.
Tu ne laisses aucune place à l'ambiguïté ou au doute.
Tu es direct, franc, et précis. Tu proposes des alternatives quand tu penses que c'est pertinent.
Tu me parles comme à un collègue dev expérimenté.
Si tu vois un problème ou une amélioration possible, tu le dis sans hésiter.
```

---

## 3. Instructions globales (CLAUDE.md global ~/.claude/)

### Commentaires dans le code
- Par défaut, **aucun commentaire**. Seulement le POURQUOI non-évident.
- N'explique pas CE QUE le code fait. Ne référence pas la tâche en cours.

### Vérification avant de déclarer terminé
- **Vérifie que ça marche** : lance les tests, vérifie l'output. Si tu ne peux pas vérifier, dis-le.

### Collaborateur, pas exécutant
- Si la demande est basée sur une misconception, ou si tu repères un bug adjacent, **dis-le**.

### Gating sur les actions utilisateur
- Quand tu demandes à l'utilisateur de faire une action (modifier un paramètre, configurer un service), **ne continue pas tant qu'il n'a pas confirmé**. Bloque et attends.

### Reporting fidèle
- Rapporte fidèlement : tests échoués = dis-le. Pas lancé = dis-le. Passé = dis-le clairement sans hedging.

### Style de communication
- Prose fluide, pas de fragments. Tableaux uniquement pour des données factuelles courtes.
- Adapte la réponse à la tâche : question simple, réponse directe.
- Pas de tiret cadratin (U+2014) ni de demi-cadratin (U+2013), nulle part : ni dans la prose, ni dans les commits, ni dans le code, ni dans la doc.

---

## 4. Équipe multi-agent

### 4.1 Rôles

| Rôle | Définition exécutable | Fiche humaine | Modèle | Responsabilité | Scope fichiers |
|------|----------------------|---------------|--------|----------------|----------------|
| **Lead dev** (session principale) | aucune | [`docs/team/lead.md`](team/lead.md) | Opus 5 | Orga, review, intégration, recadrage, copilotage archi | Tous (intégration) |
| **Dev** | [`.claude/agents/dev.md`](../.claude/agents/dev.md) | [`docs/team/dev.md`](team/dev.md) | Opus 5 | Code, implémentation, corrections, `/verif` de lui-même | `src/`, `tests/` |
| **PO** | [`.claude/agents/po.md`](../.claude/agents/po.md) | [`docs/team/po.md`](team/po.md) | Sonnet 5 | Besoin vers specs, copy, changelog, `/sync-docs` | `docs/`, `*.md` racine |
| **Designer** | [`.claude/agents/designer.md`](../.claude/agents/designer.md) | [`docs/team/designer.md`](team/designer.md) | Sonnet 5 | Specs UI/UX, review a11y. **Pas d'intégration** | `docs/design/` (écriture), `src/ui/` (lecture) |
| **Testeur** | [`.claude/agents/testeur.md`](../.claude/agents/testeur.md) | [`docs/team/testeur.md`](team/testeur.md) | Opus 5 | Challenge des specs, AC Given/When/Then, tests, matrice de couverture | `tests/`, `docs/review/`, `docs/acceptance-criteria.md` |
| **Rôle ponctuel** (SEO, sécu, migration) | aucune, brief ad hoc | aucune | selon la tâche | Intervention ciblée, périmètre défini dans le brief | défini dans le brief |

Le lead n'a pas de définition d'agent : c'est la session principale de Claude Code, pilotée par le `CLAUDE.md` racine et les instructions globales.

### 4.2 Définition d'agent contre fiche de poste

Le rôle vit dans deux fichiers, avec un partage de responsabilité explicite. Ce n'est pas de la duplication décorative : chacun des deux fichiers est lu par quelqu'un de différent.

| Contenu | Fait foi dans | Lu par |
|---------|---------------|--------|
| Comportement de l'agent : identité, ton, scope fichiers, interdits, skills, conventions d'exploration | `.claude/agents/<role>.md` | Le modèle, au démarrage de l'agent |
| Checklist de fin de tâche | `docs/team/<role>.md` | Le hook de commit (section 11) et l'humain |
| Place du rôle dans le process, interactions entre rôles, arbitrages historiques | `docs/team/<role>.md` | L'humain et le lead |

**Pourquoi la checklist reste dans la fiche** : le hook `PreToolUse` sur `git commit` lit `docs/team/*.md` pour auditer les checklists de la session. Déplacer la checklist dans `.claude/agents/` casserait le hook. Elle est donc reprise dans la définition d'agent pour que l'agent l'ait sous la main, avec une mention explicite que la fiche fait foi.

**Règle de mise à jour** : un changement de comportement va dans `.claude/agents/` en premier. La fiche ne suit que si l'explication destinée à un humain change, ou si la checklist bouge. Une règle qui n'est que dans la fiche n'est pas appliquée par l'agent.

**Ce que ça change pour le lead** : il ne recopie plus la fiche de poste dans le brief. Il lance `Agent({ subagent_type: "dev", ... })` et le brief ne contient plus que la tâche et son contexte. Les définitions étant versionnées, tous les dispatches partent du même prompt système, et une correction de process se propage par un commit au lieu d'un copier-coller.

### 4.3 Format d'une définition d'agent

Un fichier markdown par agent dans `.claude/agents/`, frontmatter YAML puis prompt système en corps de document.

```markdown
---
name: dev
description: Dev senior du projet. À lancer pour implémenter une feature, corriger un bug, refactorer. Périmètre src/ et tests/, lance /verif de lui-même, ne commite jamais.
model: opus
color: green
---

Tu es le dev senior de l'équipe...
```

Champs du frontmatter (source : documentation Claude Code, page `sub-agents`) :

| Champ | Requis | Valeurs |
|-------|--------|---------|
| `name` | oui | identifiant en minuscules et tirets, sans `:`, ne commence pas par `-` |
| `description` | oui | quand déléguer à cet agent. C'est ce texte qui sert à le sélectionner, il doit décrire le déclencheur, pas le rôle |
| `model` | non | `opus`, `sonnet`, `haiku`, `fable`, un identifiant complet, ou `inherit` |
| `tools` | non | liste des outils autorisés. Hérite de tout si omis |
| `disallowedTools` | non | outils à retirer de la liste héritée |
| `permissionMode` | non | `default`, `acceptEdits`, `auto`, `dontAsk`, `bypassPermissions`, `plan`, `manual` |
| `isolation` | non | `worktree` pour toujours travailler dans un worktree dédié (section 4.5) |
| `effort` | non | `low`, `medium`, `high`, `xhigh`, `max` |
| `maxTurns`, `skills`, `mcpServers`, `hooks`, `memory`, `background`, `color` | non | voir la doc |

Deux choses à savoir avant d'écrire une définition :

- **`description` est un déclencheur, pas un titre.** C'est le champ que le lead et le modèle utilisent pour choisir l'agent. Écrire "à lancer pour implémenter une feature, corriger un bug, refactorer" est utile ; écrire "le dev de l'équipe" ne l'est pas.
- **`tools` ne restreint pas les chemins.** Il restreint les outils. Un agent qui a `Write` peut écrire n'importe où. Le périmètre fichiers reste porté par le prompt. Sur FGP, le designer n'a pas `Bash` dans son `tools` (il ne lance ni build, ni test, ni git), mais sa restriction à `docs/design/` est une règle de prompt.

### 4.4 Choix du modèle par rôle

Utiliser les **alias courts** (`opus`, `sonnet`, `haiku`, `fable`) plutôt que des identifiants pinés : un alias suit la génération courante, un identifiant devient obsolète au prochain modèle. Les identifiants complets de la génération actuelle (`claude-opus-5`, `claude-sonnet-5`, `claude-fable-5`, `claude-haiku-4-5`) ne sont donnés ici qu'à titre indicatif.

| Rôle | Alias | Critère |
|------|-------|---------|
| Lead dev | `opus` | Arbitrage archi, review structurelle, tenir le contexte de toute la session |
| Dev | `opus` | Raisonnement sur du code, effets de bord, refactoring sous contrainte de types |
| Testeur | `opus` | Cas limites, incohérences entre specs, ce que personne n'a pensé à tester |
| PO | `sonnet` | Rédaction structurée, reformulation, cohérence documentaire |
| Designer | `sonnet` | Rédaction structurée de specs UI, connaissance Tailwind et a11y |
| Tâches mécaniques | `haiku` | Renommage en masse, extraction de liste, reformatage, tri de fichiers |

Le critère est simple : **raisonnement sur du code et des cas limites vers Opus, rédaction structurée vers Sonnet, transformation mécanique et déterministe vers Haiku**. Fable est un modèle de la même génération, non utilisé sur ce projet.

Une tâche mécanique confiée à Opus est un gâchis de budget ; une tâche de raisonnement confiée à Haiku produit du travail qu'il faut refaire. En cas de doute sur une tâche mixte, prendre le modèle du niveau de raisonnement le plus élevé qu'elle contient.

### 4.5 Règles d'organisation

**Séparation des rôles**
- Le designer produit des specs (wireframes, classes Tailwind, structure), le dev intègre. Ils se challengent mutuellement.
- Le designer ne touche pas à `main.ts`, `deno.json`, ni aux fichiers d'intégration.
- Le PO et le designer ne commitent pas. Le lead commite.

**Dev senior autonome**
- Le dev utilise `/verif` et fait sa self-review après chaque implémentation, sans qu'on le lui rappelle.

**Pause pendant copilotage**
- Quand l'utilisateur copilote sur une décision archi ou specs, **tous les agents sont en pause**. Ne pas dispatcher de travail basé sur des specs non validées.

**Gating copilotage**
- Pour les arbitrages significatifs (changement de flow, suppression ou ajout d'endpoints, modification archi), poser la question à l'utilisateur avant de valider. Ne pas trancher en autonomie.

**Doc API non négociable**
- Chaque route doit avoir une doc API avec exemples curl. Must have.

**Lead review qualité**
- Le lead review la qualité structurelle (taille des fichiers, anti-patterns, conformité au framework), pas juste "ça compile et les tests passent".

**Nommer les agents**
- Chaque agent lancé a un nom clair et unique (`dev-logs`, `dev-secu`, `po`, `designer`). Le nom sert aussi à le relancer par message.

**Paralléliser**
- Toujours paralléliser les tâches indépendantes. Pas de séquentiel quand ce n'est pas nécessaire.

**Worktree plutôt que séquencement**
- **Dès que deux agents lancés en parallèle vont écrire dans le même fichier, on les isole en worktree au lieu de les séquencer.** Le lead passe `isolation: "worktree"` au dispatch, ou pose `isolation: worktree` dans la définition de l'agent si le rôle en a systématiquement besoin. Chaque agent obtient sa propre copie du dépôt (worktree git temporaire, nettoyé automatiquement s'il n'a rien changé), et le lead intègre les deux résultats à la fin.
- Cas vécu sur FGP : le lead voulait lancer en parallèle un dev sur le lot sécurité (qui bumpe des dépendances dans `deno.json`) et un dev sur le lot applicatif (qui ajoute des tasks dans `deno.json`). Faute d'isolation, il les a séquencés à la main et a perdu le bénéfice du parallélisme sur deux lots pourtant totalement indépendants. Un `isolation: "worktree"` sur chacun réglait le problème.
- **Ce n'est pas gratuit** : chaque worktree coûte un checkout complet du dépôt (disque) et un temps de setup au lancement, et le lead doit ensuite intégrer les résultats à la main, ce qui peut produire un conflit à résoudre. L'agent isolé ne voit pas les modifications non commitées des autres agents, donc il ne faut pas l'isoler s'il dépend d'un livrable en cours. Worktree quand il y a **collision réelle sur un fichier**, pas par défaut.

**Continuation plutôt que re-spawn**
- Pour la boucle de review, le lead renvoie ses remarques à l'agent **déjà lancé** (`SendMessage` vers son nom ou son identifiant) plutôt que d'en lancer un nouveau. L'agent a déjà tout le contexte de son implémentation : les fichiers qu'il a lus, les décisions qu'il a prises, les tests qu'il a fait tourner. Le re-briefer de zéro coûte des tokens et perd de l'information.
- Un nouveau `Agent()` démarre sur un contexte vierge. C'est ce qu'on veut pour une tâche indépendante, pas pour une correction.

**Commit par le lead**
- Les agents ne pushent pas. Ils livrent, le lead review, commite et push après validation.

---

## 5. Skills locaux (.claude/skills/)

### /verif
Vérification post-implémentation :
1. `lint --fix`
2. `fmt:check` (et `fmt` si besoin)
3. `check` (type checking)
4. `test`
5. Revue approfondie du code
6. Issues mineures hors scope, proposées interactivement à l'utilisateur
7. Résumé final OK/KO

### /add-tests
Ajout de tests pour la feature courante :
1. Analyse des fichiers modifiés sur la branche
2. Classification par couche (unit, intégration, e2e)
3. Proposition de scénarios (happy path, erreurs, cas limites)
4. Attente de validation utilisateur avant d'implémenter
5. Implémentation et vérification
6. Résumé avec matrice couche/fichiers/scénarios/statut

### /sync-docs
Synchronisation de la documentation :
1. Analyse des changements (git diff)
2. `CLAUDE.md` via le skill `/claude-md-management:revise-claude-md`
3. `MEMORY.md` synchronisé avec `CLAUDE.md` (doublons, obsolètes, nouveaux learnings)
4. `README.md`, vérification de cohérence
5. ADR créé si décision architecturale significative
6. `ACTIVITY.md`, entrée de session
7. Résumé par document

### /check-review-pr
Revue des commentaires de PR :
1. Identifier la PR courante
2. Récupérer reviews et commentaires
3. Classifier (pertinent, discutable, non pertinent)
4. Appliquer les corrections pertinentes
5. Résumé et résolution des threads GitHub
6. Lancer `/verif`

---

## 6. Skills marketplace installés

La source de vérité est `skills-lock.json` à la racine du dépôt. Les cinq skills installés au moment de la rédaction :

| Skill | Source | Usage |
|-------|--------|-------|
| `deno-expert` | `denoland/skills` | Expertise Deno avancée, review et debug |
| `deno-guidance` | `denoland/skills` | Démarrage Deno, choix de packages, `deno.json` |
| `typescript-e2e-testing` | `bmad-labs/skills` | Tests e2e TypeScript |
| `code-review` | `coderabbitai/skills` | Review de code IA |
| `architecture-decision` | `jwynia/agent-skills` | ADR systématique |

Pour vérifier ce qui est réellement installé, lire `skills-lock.json` plutôt que ce tableau : la liste ci-dessus peut prendre du retard.

---

## 7. Mémoire persistante (MEMORY.md)

Types de mémoire utilisés :
- **project** : architecture, décisions techniques, stack
- **user** : rôle, préférences, niveau d'expertise
- **feedback** : corrections de process à ne pas reproduire

Feedbacks clés accumulés :
- Dev senior autonome sur la qualité (utilise `/verif` de lui-même)
- Designer différent d'intégrateur
- Pause obligatoire pendant le copilotage archi
- Doc API non négociable
- Le lead review la qualité structurelle, pas juste "ça compile"
- Solliciter l'utilisateur pour les arbitrages archi et specs
- Suivre le process de ce document, ne pas court-circuiter les rôles (chaque agent fait ses devoirs : `/verif`, `/sync-docs`)
- Toujours consulter l'équipe et l'utilisateur avant de clôturer une tâche ou de commiter

---

## 8. Process type pour une feature

```
1.  L'utilisateur exprime le besoin
2.  Le lead copilote avec l'utilisateur si besoin (archi, specs)
    tous les agents en pause pendant le copilotage
3.  Le PO rédige les specs et le mapping fonctionnel
4.  Le designer produit les specs UI (wireframes, classes)      [parallèle avec 3]
5.  Le lead crée les tâches avec leurs dépendances
6.  Le dev implémente (specs PO + specs designer)
7.  Le testeur challenge les specs du PO et rédige les AC       [parallèle avec 6]
8.  Le dev lance /verif de lui-même
9.  Le lead review les livrables et renvoie ses remarques
    au MÊME agent par continuation, pas à un nouveau dev
10. Le testeur implémente les tests (nommés par AC)
11. Le designer review a11y et design
12. Le lead commite et push (le hook de commit audite les checklists)
13. /sync-docs en fin de session (PO)
```

Trois précisions sur ce déroulé :

- **Les étapes 3 et 4 sont parallèles**, ainsi que 6 et 7. Le PO et le designer travaillent sur des fichiers disjoints (`docs/specs.md` contre `docs/design/`), donc pas besoin de worktree. Le dev et le testeur écrivent respectivement dans `src/` et `tests/`, disjoints aussi. Si deux agents parallèles doivent écrire dans le même fichier, appliquer la règle worktree de la section 4.5.
- **L'étape 9 est une continuation, pas un nouveau dispatch.** Le lead envoie ses remarques au dev déjà lancé, qui a le contexte complet de son implémentation. Il relance `/verif` derrière. Boucler tant que la review n'est pas propre.
- **L'étape 12 déclenche le hook de gating** (section 11). Si le hook bloque, c'est le process qui est incomplet, pas le hook qui a tort.

---

## 9. Workflows scriptés

Le process de la section 8 est exécuté à la main par le lead, tour par tour. On peut aussi le **codifier dans un script** : un workflow dynamique est un script JavaScript qui orchestre les agents, exécuté par un runtime en arrière-plan pendant que la session reste disponible. Le lead décrit la tâche, Claude écrit le script, et une fois qu'un run fait ce qu'on voulait on l'enregistre comme commande dans `.claude/workflows/`.

### Ce que ça apporte

- **Fan-out parallèle** : `parallel()` lance un ensemble de tâches en même temps, `pipeline()` en lance une par élément d'une liste. Le runtime tolère jusqu'à 16 agents concurrents et 4096 éléments par appel.
- **Pipelines sans barrière** : le script décide de l'enchaînement. `pipeline()` accepte un troisième argument qui post-traite le résultat de chaque élément **dès qu'il arrive**, ce qui permet d'enchaîner une seconde vague d'agents sur l'élément 1 pendant que l'élément 5 est encore en cours. Pas de barrière entre les phases.
- **Sorties structurées** : l'option `schema` d'un appel `agent()` prend un JSON Schema, et le résultat est validé contre ce schéma. Un agent qui doit rendre une liste de fichiers rend un tableau typé, pas un paragraphe à parser.
- **Reprise sur incident** : le runtime mémorise le résultat de chaque agent. Un run stoppé ou en échec se relance dans la même session depuis `/workflows` : les agents déjà terminés rendent leur résultat en cache, celui qui a échoué et tous ceux lancés après lui repartent. Chaque run écrit son script sous le répertoire de la session dans `~/.claude/projects/`, ce qui donne un identifiant de run consultable et un script diffable.
- **Patterns de qualité répétables** : le script peut faire vérifier un finding par plusieurs agents indépendants avant de le remonter, ou faire critiquer la complétude de la chaîne en fin de run. Ces patterns sont pénibles à tenir à la main, triviaux à écrire une fois dans un script.

### Exemple : le process FGP en workflow

```javascript
export const meta = {
  name: 'fgp-feature',
  description: 'Process type FGP : cadrage, implémentation, recette, review croisée',
  phases: [
    { title: 'Cadrage' },
    { title: 'Implémentation' },
    { title: 'Recette' },
    { title: 'Review croisée' },
  ],
}

const SPECS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    specPath: { type: 'string' },
    exigences: { type: 'array', items: { type: 'string' } },
  },
  required: ['specPath', 'exigences'],
}

const IMPL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    fichiers: { type: 'array', items: { type: 'string' } },
    verifyVert: { type: 'boolean' },
  },
  required: ['fichiers', 'verifyVert'],
}

const FINDING_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    couvert: { type: 'boolean' },
    finding: { type: 'string' },
    severite: { enum: ['bloquant', 'majeur', 'mineur', 'aucun'] },
    preuve: { type: 'string', description: 'extrait de code exact qui prouve le constat' },
  },
  required: ['couvert', 'finding', 'severite', 'preuve'],
}

const VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    confirme: { type: 'boolean', description: 'true seulement si le code réel confirme le constat' },
    raison: { type: 'string' },
  },
  required: ['confirme', 'raison'],
}

const [specs, design] = await parallel([
  () =>
    agent(
      `Rôle PO. Rédige les specs fonctionnelles pour : ${args.besoin}.
       Écris-les dans docs/specs.md et rends la liste des exigences testables.`,
      { label: 'po:specs', phase: 'Cadrage', schema: SPECS_SCHEMA },
    ),
  () =>
    agent(
      `Rôle designer. Produis les specs UI pour : ${args.besoin} dans docs/design/.
       Wireframe, classes Tailwind existantes, notes a11y. Ne touche pas à src/.`,
      { label: 'designer:ui', phase: 'Cadrage' },
    ),
])

if (!specs) return { erreur: 'cadrage KO, rien à implémenter' }
if (!design) log('specs UI absentes, le dev implémentera sans maquette')

const impl = await agent(
  `Rôle dev senior. Implémente ${args.besoin} d'après ${specs.specPath} et les specs UI de docs/design/.
   Lance deno task verify et corrige avant de rendre.`,
  { label: 'dev:impl', phase: 'Implémentation', schema: IMPL_SCHEMA, effort: 'high' },
)

const recette = await pipeline(
  specs.exigences,
  (exigence) =>
    agent(
      `Rôle testeur. Vérifie DANS LE CODE RÉEL que cette exigence est satisfaite : ${exigence}.
       Ne te fie à aucune affirmation. Rends couvert=false avec une preuve si elle ne l'est pas.`,
      { label: `recette:${exigence.slice(0, 30)}`, phase: 'Recette', schema: FINDING_SCHEMA },
    ),
  (res, exigence) => {
    if (!res || res.couvert) return res
    return parallel([
      () =>
        agent(
          `Contre-vérifie de façon ADVERSE le constat suivant. Considère-le douteux jusqu'à preuve
           par le code. Essaie de le RÉFUTER.\n\n${JSON.stringify(res, null, 2)}`,
          { label: `refute:${exigence.slice(0, 24)}`, phase: 'Review croisée', schema: VERDICT_SCHEMA },
        ),
      () =>
        agent(
          `Cherche à CONFIRMER le constat suivant par le code réel. Rends confirme=false
           si tu ne trouves pas de preuve directe.\n\n${JSON.stringify(res, null, 2)}`,
          { label: `confirme:${exigence.slice(0, 24)}`, phase: 'Review croisée', schema: VERDICT_SCHEMA },
        ),
    ]).then((verdicts) => ({ ...res, retenu: verdicts.every((v) => v && v.confirme) }))
  },
)

const verifiees = recette.filter(Boolean)
const retenus = verifiees.filter((r) => !r.couvert && r.retenu)

log(`${retenus.length} findings retenus sur ${verifiees.length} exigences vérifiées`)

const critique = await agent(
  `Rôle testeur. Specs : ${specs.specPath}. Fichiers livrés : ${impl ? impl.fichiers.join(', ') : 'aucun'}.
   Findings retenus : ${JSON.stringify(retenus)}.
   Dis ce qui MANQUE : exigences jamais vérifiées, cas limites non testés, régressions non couvertes.
   Ne répète pas les findings déjà remontés.`,
  { label: 'critique:completude', phase: 'Review croisée' },
)

return { impl, retenus, critique }
```

Deux patterns de qualité sont visibles ici :

- **Vérification adversariale** (phase "Review croisée") : chaque finding non couvert est soumis à deux agents indépendants, l'un chargé de le réfuter, l'autre de le confirmer. Seuls les findings qui survivent aux deux remontent. C'est ce qui évite qu'un agent trop zélé fasse remonter un faux positif jusqu'au lead. Noter que la contre-vérification est déclenchée depuis le **troisième argument de `pipeline()`**, donc elle démarre sur l'exigence 1 pendant que l'exigence 5 est encore en cours de recette : il n'y a pas de barrière entre les deux phases.
- **Critique de complétude** (dernier `agent()`) : un agent dont le seul job est de dire ce que la chaîne n'a pas couvert. Il ne relit pas les findings pour les valider, il cherche les trous.

Trois pièges de syntaxe qui cassent un script à l'exécution :

- `parallel()` prend un tableau de **fonctions** (`[() => agent(...), () => agent(...)]`), pas un tableau de promesses déjà démarrées.
- `pipeline()` prend `(items, mapFn, thenFn)`. Le troisième argument est optionnel et reçoit `(résultat, item)`.
- Un `agent()` qui échoue ou qu'on stoppe résout à `null`. Chaque résultat doit donc être testé (`if (!res)`) ou filtré (`.filter(Boolean)`) avant d'être déréférencé.

Contraintes du runtime à connaître avant d'écrire un script : pas d'`import()`, pas d'accès direct au système de fichiers ni au shell depuis le script (ce sont les agents qui lisent et écrivent), pas d'input utilisateur en cours de run, et `Date.now()`, `Math.random()` et `new Date()` sans argument lèvent une exception pour que le run soit rejouable à l'identique. Le bloc `export const meta` doit être un littéral et rester la première instruction.

**La référence qui fait foi pour l'API du script est le skill fourni `/workflow-authoring`.** Le lead le charge avant d'écrire ou d'éditer un script à la main.

L'exemple ci-dessus n'utilise que ce qui a été vérifié sur des scripts de runs réels : les helpers `agent`, `parallel`, `pipeline`, `log`, les globales `args` et `meta`, et les options `label`, `phase`, `schema` et `effort`. Deux choses **ne sont pas vérifiées** et doivent être confirmées via `/workflow-authoring` avant usage : le helper `phase()` en appel autonome (l'exemple passe l'étape par l'option `phase` d'`agent()`, qui est la forme observée en production), et l'option qui épingle un modèle ou un type de sous-agent par étape. Épingler un `subagent_type` par étape permettrait de réutiliser directement les définitions de `.claude/agents/` au lieu de redire "Rôle PO" dans le prompt ; tant que ce n'est pas confirmé, l'exemple duplique l'identité du rôle dans le texte de la tâche.

### Quand ça vaut le coup, et quand non

Un workflow scripté est reproductible, auditable et parallélisable très au-delà de ce qu'un lead peut coordonner à la main. Il est aussi **plus lourd à maintenir** : c'est du code de plus dans le dépôt, qui dérive quand le process change, et qui doit être relu comme du code.

Ça vaut le coup quand :
- le même enchaînement tourne à chaque branche ou à chaque release (review complète, audit de sécurité, recette pré-déploiement) ;
- la tâche dépasse ce qu'une conversation peut coordonner (audit sur des dizaines de fichiers, migration de masse) ;
- on veut un pattern de qualité systématique, typiquement la vérification adversariale, qui est fastidieuse à tenir à la main ;
- on veut pouvoir rejouer exactement le même process et comparer deux runs.

Ça ne vaut pas le coup quand :
- la feature est one-shot : écrire le script coûte plus cher que le dispatch manuel ;
- le process change encore à chaque itération, le script serait obsolète avant d'être réutilisé ;
- il faut un arbitrage humain en milieu de chaîne : un run n'accepte pas d'input utilisateur, il faudrait découper en plusieurs workflows ;
- l'enchaînement tient en trois ou quatre agents, ce qui est le cas de la plupart des features FGP. Le process de la section 8 en dispatch manuel reste le mode par défaut.

En résumé : **le dispatch manuel pour développer, le workflow scripté pour ce qui se répète.**

---

## 10. Outillage complémentaire

### Navigation LSP avant grep

Sur un projet TypeScript, le tool `LSP` passe avant grep pour toute exploration de code. Le LSP comprend la sémantique (alias de chemins, re-exports, surcharges, génériques, héritage), grep ne fait que du pattern matching et rate les indirections.

| Opération | Cas d'usage |
|-----------|-------------|
| `workspaceSymbol` | Localiser un symbole quand on n'a pas ses coordonnées. Point d'entrée par défaut |
| `findReferences` | Tous les usages réels d'un symbole. Un résultat étonnamment bas signale souvent un re-export trivial : refaire l'appel depuis la vraie déclaration |
| `goToDefinition` | Où un symbole est défini |
| `hover` | Signature TypeScript résolue et type inféré |
| `goToImplementation` | Implémentations d'une interface |
| `documentSymbol` | Inventaire des symboles d'un fichier |
| `prepareCallHierarchy` + `incomingCalls` / `outgoingCalls` | Appelants et appelés avant un refactoring |

Grep reste le bon outil pour : les fichiers non-TS (JSON, markdown, yaml, CSS, SQL), les chaînes littérales et les expressions régulières, les motifs sans symbole (`TODO`, `FIXME`), et le survol rapide d'une zone inconnue.

Cette convention est inscrite dans `.claude/agents/dev.md` et `.claude/agents/testeur.md`. Le tool `LSP` dépend d'une variable d'environnement et d'un language server installé : si l'agent ne l'a pas, il bascule sur grep et le signale dans son rapport.

### Veille de dépendances planifiée

Dependabot couvre les mises à jour et les alertes de sécurité au niveau du dépôt. Il ne couvre pas la lecture : personne ne lit les changelogs des dépendances, ni les avis qui ne déclenchent pas d'alerte automatique.

Une **tâche planifiée récurrente** peut compléter ça : un agent lancé chaque semaine qui lit les nouvelles versions des dépendances de `deno.json`, résume ce qui change pour le projet, signale les breaking changes et les avis de sécurité non couverts par Dependabot, et rend un rapport court. C'est un complément, pas un remplacement : Dependabot ouvre les PR, la tâche planifiée dit s'il faut s'en occuper maintenant.

**Rien de tel n'est configuré sur FGP à ce jour.** C'est une option documentée, à arbitrer avec l'architecte, et à mettre en place seulement après que la configuration Dependabot soit stabilisée.

---

## 11. Hooks de gating de process

Un hook permet de faire respecter une règle de process par l'outillage plutôt que par la discipline. Sur FGP, un hook `PreToolUse` audite la session avant chaque commit.

### Ce qui est branché

Dans `.claude/settings.json` :

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "agent",
            "if": "Bash(git commit *)",
            "prompt": "Avant de commit, lis les fiches de poste dans docs/team/*.md et docs/ia-architecture-reference.md (section process type et feedbacks). Pour chaque rôle qui a été impliqué dans cette session, vérifie que sa checklist de fin de tâche (définie dans sa fiche) a été respectée. Si un rôle n'a pas fait ses checks, bloque le commit et liste les checks manquants avec le rôle concerné. Si tous les checks sont faits, autorise le commit.",
            "timeout": 60
          }
        ]
      }
    ]
  }
}
```

C'est un hook de type `agent` : au lieu d'exécuter un script qui teste une condition mécanique, il lance un agent qui **juge** la session contre les checklists documentées. Le `matcher` sélectionne l'outil (`Bash`), le champ `if` restreint aux commandes de commit, le `prompt` porte la règle, et `timeout` borne le coût.

### Ce qu'il vérifie

Il lit les fiches `docs/team/*.md` et la section process type de ce document, identifie les rôles impliqués dans la session, et vérifie leurs checklists de fin de tâche. Il autorise ou bloque le commit en listant les checks manquants et le rôle concerné.

C'est la raison pour laquelle les checklists de fin de tâche restent dans `docs/team/*.md` et pas dans `.claude/agents/*.md` (section 4.2) : le hook lit ce chemin.

### Ce qu'il empêche concrètement

Le hook a déjà bloqué un commit avec ce message :

```
Lead dev checklist incomplete: No agents deployed/completed work,
no /verif run, no /sync-docs executed
```

C'était le moment exact où le lead partait implémenter en solo, sans avoir lancé un seul agent, sans `/verif` et sans `/sync-docs`. Le garde-fou a fonctionné : il a intercepté une dérive de process au moment où elle allait être gravée dans l'historique git.

C'est le pattern intéressant à retenir. Un hook de gating ne vérifie pas que le code est bon (c'est le rôle de la CI et de `/verif`), il vérifie que **le process a été suivi**. Il attrape la classe d'erreurs que la CI ne voit jamais : le lead qui court-circuite l'équipe, le PO qui n'a pas fait sa sync-docs, le testeur qui n'a pas produit sa matrice de couverture.

### Réutiliser le pattern

Trois conditions pour qu'un hook de gating soit utile plutôt que pénible :

1. **La règle est documentée quelque part de stable.** Ici, les checklists dans `docs/team/*.md`. Le hook ne contient pas la règle, il pointe vers elle. Changer une checklist ne demande pas de toucher au hook.
2. **Le point de gating est le bon.** `git commit` est le bon moment : c'est le dernier instant où corriger est gratuit. Gater sur chaque écriture de fichier serait insupportable.
3. **Le blocage est explicite et actionnable.** Le hook liste les checks manquants et le rôle concerné, pas un "refusé" sec.

Quand un hook de gating déclenche, la bonne réaction est de corriger le process, pas de désactiver le hook.

---

## 12. Documentation standard du projet

| Document | Contenu |
|----------|---------|
| `CLAUDE.md` | Instructions projet (stack, conventions, scripts, structure) |
| `README.md` | Quick start, exemples, liens |
| `ACTIVITY.md` | Log d'activité par session |
| `docs/specs.md` | Spécifications fonctionnelles |
| `docs/acceptance-criteria.md` | Critères d'acceptation Given/When/Then |
| `docs/limits.md` | Limites fonctionnelles |
| `docs/changelog.md` | Changelog utilisateur, maintenu par le PO, rendu dans l'UI |
| `docs/adr/` | Architecture Decision Records |
| `docs/design/` | Specs UI/UX du designer |
| `docs/review/` | Rapports de review (a11y, UI, recette, couverture AC) |
| `docs/team/` | Fiches de poste humaines, une par rôle |
| `docs/ia-architecture-reference.md` | Ce document |
| `.claude/agents/` | Définitions exécutables des agents, une par rôle |
| `.claude/skills/` | Skills locaux du projet |
| `.claude/settings.json` | Hooks et configuration versionnés |
| `.github/workflows/ci.yml` | CI (lint, fmt, check, test) |
| `.github/pull_request_template.md` | Template PR |

---

## 13. Bootstrap d'un nouveau projet

```bash
# 1. Init
git init && deno init

# 2. CLAUDE.md
# Copier la section "First things first" et adapter projet, stack, scripts.
# Ajouter une section "Équipe multi-agent" qui pointe vers .claude/agents/ et docs/team/.

# 3. Définitions d'agents (le coeur du setup)
mkdir -p .claude/agents
# Copier .claude/agents/{dev,po,testeur,designer}.md et adapter :
#   - le nom du projet et la stack dans chaque prompt
#   - le scope fichiers de chaque rôle
#   - le modèle : opus pour dev/testeur, sonnet pour po/designer
# Pas de définition pour le lead : c'est la session principale.

# 4. Fiches de poste humaines
mkdir -p docs/team
# Copier docs/team/*.md. Chaque fiche pointe vers sa définition d'agent
# et porte la checklist de fin de tâche (lue par le hook de commit).

# 5. Skills locaux
mkdir -p .claude/skills/{verif,add-tests,sync-docs,check-review-pr}
# Copier les SKILL.md depuis le template et adapter les commandes au runtime.

# 6. Skills marketplace
skills add denoland/skills@deno-expert -y
skills add denoland/skills@deno-guidance -y
skills add bmad-labs/skills@typescript-e2e-testing -y
skills add coderabbitai/skills@code-review -y
skills add jwynia/agent-skills@architecture-decision -y

# 7. Hook de gating de process
# Copier le bloc PreToolUse de .claude/settings.json (section 11).
# Il pointe vers docs/team/*.md, donc l'étape 4 doit être faite avant.

# 8. Structure
mkdir -p src tests/{testu,testi,teste2e} docs/{adr,design,review}

# 9. ADR template
# Copier docs/adr/0000-template.md

# 10. CI
# Copier .github/workflows/ci.yml et .github/pull_request_template.md
# Activer Dependabot si le projet a des dépendances externes.

# 11. ACTIVITY.md, .editorconfig, .gitignore

# 12. Premier commit
```

Ensuite, décrire le besoin à Claude et le laisser monter l'équipe. Les définitions d'agents étant versionnées, le lead lance les rôles par leur type (`subagent_type: "dev"`) sans avoir à recopier quoi que ce soit dans le brief.

À ne pas faire au bootstrap : écrire des workflows scriptés (section 9). Le process manuel de la section 8 se stabilise sur les premières features, et c'est seulement une fois qu'un enchaînement se répète qu'il vaut le coup d'être codifié.
