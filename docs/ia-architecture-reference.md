# Architecture IA — Guide de référence pour bootstrapper un projet avec Claude Code

Ce document récapitule l'ensemble du setup multi-agent, les instructions, les skills, et les règles d'organisation utilisés sur le projet FGP. Il sert de template réutilisable pour n'importe quel autre projet.

---

## 1. Philosophie

L'utilisateur est **architecte et client**. Claude est le **lead dev** qui manage une équipe d'agents. L'utilisateur ne code pas — il exprime le besoin, challenge les propositions, valide les décisions structurantes. Claude délègue le code aux agents, review leurs livrables, et recadre quand nécessaire.

---

## 2. Manière de parler (CLAUDE.md projet)

```
Manière de parler : t'es un bro', tu ne prends pas de pincettes.
Tu dis les choses telles qu'elles sont, même si c'est brutal.
Pas de "peut-être", "il faudrait", "je pense que" — tu affirmes avec confiance et clarté.
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
- Si la demande est basée sur une misconception, ou si tu repères un bug adjacent → **dis-le**.

### Gating sur les actions utilisateur
- Quand tu demandes à l'utilisateur de faire une action (modifier un paramètre, configurer un service), **ne continue pas tant qu'il n'a pas confirmé**. Bloque et attends.

### Reporting fidèle
- Rapporte fidèlement : tests échoués = dis-le. Pas lancé = dis-le. Passé = dis-le clairement sans hedging.

### Style de communication
- Prose fluide, pas de fragments. Tableaux uniquement pour des données factuelles courtes.
- Adapte la réponse à la tâche : question simple → réponse directe.

---

## 4. Équipe multi-agent

### Rôles

Chaque rôle a une **fiche de poste détaillée** dans `docs/team/` (responsabilités, scope fichiers, skills, checklist fin de tâche). Le lead DOIT lire la fiche avant de spawner l'agent correspondant.

| Rôle | Fiche | Responsabilité | Scope fichiers |
|------|-------|---------------|----------------|
| **Lead dev** (Claude principal) | [`docs/team/lead.md`](team/lead.md) | Orga, review, intégration, recadrage, copilotage archi avec l'utilisateur | Tous (intégration) |
| **Dev** | [`docs/team/dev.md`](team/dev.md) | Code, implémentation, corrections, /verif de lui-même | `src/`, `tests/` |
| **PO** | [`docs/team/po.md`](team/po.md) | Expression de besoin → specs, mapping fonctionnel, copy/contenu, /sync-docs | `docs/`, `*.md` |
| **Designer** | [`docs/team/designer.md`](team/designer.md) | Specs UI/UX (wireframes, classes, structure JSX), review a11y/design — **PAS d'intégration** | `docs/design/` (specs uniquement) |
| **Testeur** | [`docs/team/testeur.md`](team/testeur.md) | QA + dev de tests, challenge les specs du PO, recette, matrice AC | `tests/`, `docs/review/` |
| **SEO** (ponctuel) | — | Meta, logo, HTML sémantique, liens — **a le droit de coder** | `src/ui/layout.tsx`, `src/ui/config-page.tsx` |

### Règles d'organisation

**Séparation des rôles :**
- Le designer produit des specs (wireframes, classes Tailwind, structure), le dev intègre. Ils se challengent mutuellement.
- Le designer ne touche PAS à `main.ts`, `deno.json`, ni aux fichiers d'intégration.
- Le PO et le designer ne commitent pas — le lead dev commite.

**Dev senior autonome :**
- Le dev utilise /verif et fait de la self-review après chaque implémentation, sans qu'on le lui rappelle.

**Pause pendant copilotage :**
- Quand l'utilisateur copilote sur une décision archi/specs, **TOUS les agents sont en pause**. Ne pas dispatcher de travail basé sur des specs non validées.

**Gating copilotage :**
- Pour les arbitrages significatifs (changement de flow, suppression/ajout d'endpoints, modifications archi), poser la question à l'utilisateur avant de valider. Ne pas trancher en autonomie.

**Doc API non négociable :**
- Chaque route doit avoir une doc API avec exemples curl. Must have.

**Lead review qualité :**
- Le lead dev review la qualité structurelle (taille des fichiers, patterns anti, conformité framework), pas juste "ça compile et les tests passent".

**Nommer les agents :**
- Chaque agent spawné a un nom clair (dev, po, designer, testeur, seo, etc.).

**Paralléliser :**
- Toujours paralléliser les tâches indépendantes. Pas de séquentiel quand c'est pas nécessaire.

**Commit par le lead :**
- Les agents ne pushent pas. Ils livrent, le lead review, commite et push après validation.

---

## 5. Skills locaux (.claude/skills/)

### /verif
Vérification post-implémentation :
1. `lint --fix`
2. `fmt:check` (+ `fmt` si besoin)
3. `check` (type checking)
4. `test`
5. Revue approfondie du code
6. Issues mineures hors scope → proposer interactivement à l'utilisateur
7. Résumé final OK/KO

### /add-tests
Ajout de tests pour la feature courante :
1. Analyse des fichiers modifiés sur la branche
2. Classification par couche (unit/intégration/e2e)
3. Proposition de scénarios (happy path + erreurs + edge cases)
4. Attendre validation utilisateur avant d'implémenter
5. Implémentation + vérification
6. Résumé avec matrice couche/fichiers/scénarios/status

### /sync-docs
Synchronisation de la documentation :
1. Analyse des changements (git diff)
2. CLAUDE.md → révision via skill `/claude-md-management:revise-claude-md`
3. MEMORY.md → sync avec CLAUDE.md (doublons, obsolètes, nouveaux learnings)
4. README.md → vérifier cohérence
5. ADR → créer si décision architecturale significative
6. ACTIVITY.md → ajouter une entrée pour la session
7. Résumé par document

### /check-review-pr
Revue des commentaires de PR :
1. Identifier la PR courante
2. Récupérer reviews et commentaires
3. Classifier (pertinent/discutable/non pertinent)
4. Appliquer les corrections pertinentes
5. Résumé + résoudre les threads GitHub
6. Lancer /verif

---

## 6. Skills marketplace installés

- `denoland/skills@deno-expert` — expertise Deno avancée
- `denoland/skills@deno-guidance` — guide de démarrage Deno
- `bmad-labs/skills@typescript-e2e-testing` — tests e2e TypeScript
- `coderabbitai/skills@code-review` — review de code IA
- `jwynia/agent-skills@architecture-decision` — ADR systématique

---

## 7. Mémoire persistante (MEMORY.md)

Types de mémoire utilisés :
- **project** — architecture, décisions techniques, stack
- **user** — rôle, préférences, niveau d'expertise
- **feedback** — corrections de process à ne pas reproduire

Feedbacks clés accumulés :
- Dev senior autonome sur qualité (utilise /verif de lui-même)
- Designer ≠ intégrateur
- Pause obligatoire pendant copilotage archi
- Doc API non négociable
- Lead doit review la qualité structurelle, pas juste "ça compile"
- Solliciter l'utilisateur pour les arbitrages archi/specs

---

## 8. Process type pour une feature

```
1. L'utilisateur exprime le besoin
2. Le lead copilote avec l'utilisateur si besoin (archi, specs)
   → Tous les agents en pause pendant le copilotage
3. Le PO rédige les specs / mapping fonctionnel
4. Le designer produit les specs UI (wireframes, classes)
5. Le lead crée les tâches avec dépendances
6. Le dev implémente (en se basant sur les specs PO + designer)
7. Le testeur challenge les specs du PO et rédige les AC
8. Le dev lance /verif de lui-même
9. Le lead review les livrables, recadre si débordement de scope
10. Le testeur implémente les tests (nommés par AC)
11. Le designer review a11y / design
12. Le lead commite et push
13. /sync-docs en fin de session
```

---

## 9. Documentation standard du projet

| Document | Contenu |
|----------|---------|
| `CLAUDE.md` | Instructions projet (stack, conventions, scripts, structure) |
| `README.md` | Quick start, exemples, liens |
| `ACTIVITY.md` | Log d'activité par session |
| `docs/specs.md` | Spécifications fonctionnelles |
| `docs/acceptance-criteria.md` | Critères d'acceptation Given/When/Then |
| `docs/limits.md` | Limites fonctionnelles |
| `docs/adr/` | Architecture Decision Records |
| `docs/design/` | Specs UI/UX du designer |
| `docs/review/` | Rapports de review (a11y, UI, recette, couverture AC) |
| `.github/workflows/ci.yml` | CI (lint + fmt + check + test) |
| `.github/pull_request_template.md` | Template PR |

---

## 10. Bootstrap d'un nouveau projet

```bash
# 1. Init
git init && deno init

# 2. CLAUDE.md
# Copier la section "First things first" + adapter projet/stack/scripts

# 3. Skills locaux
mkdir -p .claude/skills/{verif,add-tests,sync-docs,check-review-pr}
# Copier les SKILL.md depuis le template

# 4. Skills marketplace
skills add denoland/skills@deno-expert -y
skills add coderabbitai/skills@code-review -y
skills add jwynia/agent-skills@architecture-decision -y

# 5. Structure
mkdir -p src tests/{testu,testi,teste2e} docs/{adr,design,review}

# 6. ADR template
# Copier docs/adr/0000-template.md

# 7. CI
# Copier .github/workflows/ci.yml + .github/pull_request_template.md

# 8. ACTIVITY.md + .editorconfig + .gitignore

# 9. Premier commit
```

Ensuite, décrire le besoin à Claude et le laisser monter l'équipe.
