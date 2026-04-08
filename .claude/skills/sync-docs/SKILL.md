---
name: sync-docs
description: Synchronise la documentation du projet (CLAUDE.md, memory, README, ADR, ACTIVITY) avec les features implémentées
---

# Synchronisation de la documentation

Met à jour l'ensemble de la documentation du projet en cohérence avec les features implémentées dans la session courante.

## 1. Analyse des changements

Identifie les fichiers modifiés/créés dans la session et la branche courante :

```bash
git diff main --name-only
git log main..HEAD --oneline
```

Résume les features et décisions architecturales nouvelles.

## 2. CLAUDE.md — Révision via skill

Lance le skill `/claude-md-management:revise-claude-md` avec un résumé des learnings de la session.

Si le skill propose des modifications, les appliquer après validation utilisateur.

## 3. Memory — Synchronisation

Lis MEMORY.md et compare avec CLAUDE.md :
- **Doublons** : retirer de MEMORY.md (CLAUDE.md fait foi)
- **Memory-only** : évaluer si ça mérite d'être dans CLAUDE.md
- **Obsolètes** : supprimer
- **Nouveaux learnings** : ajouter au bon endroit

MEMORY.md doit rester sous 200 lignes.

## 4. README.md — Mise à jour

Vérifie la cohérence avec l'état actuel :
- Stack & versions à jour
- Variables d'environnement documentées
- Structure de répertoires
- Scripts utiles
- Référence aux ADR

Ne modifier que ce qui est factuellement incorrect ou manquant.

## 5. ADR — Architecture Decision Records

Un ADR est justifié si :
- Décision architecturale significative (nouveau pattern, choix technique structurant)
- La décision affecte la structure du code durablement
- Il existe des alternatives envisagées

Un ADR n'est PAS justifié pour : simple feature CRUD, bugfix, refactoring mineur.

Si un ADR est justifié :
1. Prochain numéro séquentiel : `ls docs/adr/*.md | sort | tail -1`
2. Utiliser le template `docs/adr/0000-template.md`
3. Rédiger en français : Contexte, Décision, Options envisagées, Conséquences
4. Date du jour, statut `Accepted`

## 6. ACTIVITY.md — Log d'activité

Ajouter une entrée pour la session courante :
```markdown
## YYYY-MM-DD — [Titre court]
- **Changements** : liste des modifications significatives
- **Décisions** : décisions prises et pourquoi
- **ADR** : référence si créé
- **Prochaines étapes** : ce qui reste à faire
```

## 7. Résumé

| Document | Action |
|---|---|
| CLAUDE.md | Modifié / Inchangé |
| MEMORY.md | Modifié / Inchangé |
| README.md | Modifié / Inchangé |
| ADR | Créé (numéro + titre) / Aucun nouveau |
| ACTIVITY.md | Mis à jour |
