---
name: verif
description: Verify implementation by running lint, format check, type check, and post-implementation review
---

# Vérification de l'implémentation

Effectue les vérifications suivantes dans l'ordre :

## 1. Lint + Format + Type check

Lance les commandes suivantes :

```bash
deno task lint
deno task fmt:check
deno task check
```

Si des erreurs de lint persistent, corrige-les manuellement.
Si le formatage est incorrect, lance `deno task fmt` puis re-vérifie.

## 2. Tests

Lance `deno task test` pour vérifier que tous les tests passent.

Si des tests échouent, analyse si le problème vient du test ou de l'implémentation.

## 3. Vérification post-implémentation

Fais une revue approfondie de l'implémentation pour vérifier que les changements sont conformes aux attentes, que les fonctionnalités sont bien implémentées, et que le code est propre et maintenable.

## 4. Issues mineures hors scope

Si la revue relève des issues mineures hors du scope direct de la session, utilise `AskUserQuestion` pour les présenter interactivement avec des propositions de correction :

Pour chaque issue trouvée :
- Affiche le fichier, la ligne, la description courte, la sévérité et la correction proposée
- Utilise `AskUserQuestion` avec des suggestions : `["Corrige tout", "Corrige seulement #1, #3", "Ignore tout"]`
- Si l'utilisateur valide, applique les corrections et relance la vérification
- Si l'utilisateur refuse, note-les dans le résumé comme "non corrigées (hors scope)"

## 5. Résumé

Affiche un résumé clair :
- Erreurs lint/fmt/check trouvées et corrigées (ou aucune)
- Tests : passés / échoués
- Rapport de vérification post-implémentation
- Issues mineures hors scope proposées et leur statut
- Statut final : OK ou KO avec détails
