---
name: check-review-pr
description: Review PR comments and suggestions, evaluate relevance, apply fixes, then run verification
---

# Revue des commentaires de PR

Analyse les commentaires et reviews de la PR en cours, évalue leur pertinence, applique les corrections nécessaires, puis lance la vérification.

## 1. Identification de la PR

```bash
gh pr view --json number,title,url,state
```

Si aucune PR n'est trouvée, informe l'utilisateur et arrête.

## 2. Récupération des reviews et commentaires

```bash
gh pr view --json reviews,comments
gh api repos/{owner}/{repo}/pulls/{number}/comments
```

Classe-les par type :
- **Review comments** (inline sur du code)
- **PR comments** (discussion générale)
- **Review verdicts** (approved, changes_requested, commented)

## 3. Analyse détaillée de chaque commentaire

Pour chaque commentaire :
1. **Contexte** : lis le fichier et les lignes concernées
2. **Pertinence** : évalue si le commentaire est pertinent ou non
3. **Classification** :
   - Commentaire d'IA (Copilot, etc.) → mesurer sur 100% la pertinence, corriger si pertinent
   - Pertinent et actionnable → à corriger
   - Pertinent mais discutable → à signaler pour décision
   - Non pertinent → à ignorer avec justification

## 4. Application des corrections

Pour chaque commentaire classé "à corriger" :
1. Applique la correction
2. Vérifie que ça ne casse rien
3. Note la correction effectuée

Pas de corrections pour les "discutables" ou "non pertinents" sans validation explicite.

## 5. Résumé intermédiaire

Pour chaque commentaire :
- **Auteur** et **date**
- **Fichier:ligne** concerné
- **Résumé** du commentaire
- **Verdict** : Corrigé / Discutable / Ignoré
- **Justification**

Pour les discutables, propose des suggestions et demande une décision.

## 6. Vérification

Lance le skill `/verif` pour valider que les corrections n'introduisent pas de régressions.

## 7. Finalisation

Une fois un commentaire adressé, résoudre le thread sur GitHub :
1. Poster un commentaire de réponse via `gh api`
2. Résoudre via GraphQL :
   ```bash
   gh api graphql -f query='mutation { resolveReviewThread(input: {threadId: "THREAD_ID"}) { thread { isResolved } } }'
   ```

ATTENTION : ne jamais mentionner `@copilot-pull-request-reviewer` dans les commentaires.
