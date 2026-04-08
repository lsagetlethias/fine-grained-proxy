---
name: add-tests
description: Ajouter des tests (unit, integration, e2e) pour la feature en cours de développement
---

# Ajout de tests pour la feature courante

Analyse la feature développée dans la session/branche courante, détermine les couches de tests pertinentes, propose des scénarios, et implémente les tests après validation utilisateur.

## 1. Analyse de la feature

Identifie les fichiers modifiés/créés sur la branche courante :

```bash
git diff main --name-only
git log main..HEAD --oneline
```

Classe les changements par catégorie :
- **Crypto** (`src/crypto/`) → tests unitaires (`testu/`)
- **Middleware** (`src/middleware/`) → tests unitaires + intégration
- **Routes** (`src/routes/`) → tests intégration (`testi/`)
- **Scalingo client** (`src/scalingo/`) → tests intégration (mocks HTTP)
- **UI** (`src/ui/`) → tests e2e (`teste2e/`)
- **Flow complet** (proxy end-to-end) → tests e2e

## 2. Évaluation des couches de tests

### Tests unitaires (`testu/`)
- Fonctions crypto (encrypt/decrypt, dérivation clé, validation TTL)
- Parsing et validation des scopes
- Logique pure sans I/O
- Conventions : `tests/testu/{domaine}/{nom}.test.ts`

### Tests intégration (`testi/`)
- Routes Hono avec `app.request()` (pas de serveur réel)
- Client Scalingo avec mocks HTTP
- Middleware chain complète
- Conventions : `tests/testi/{domaine}/{nom}.test.ts`

### Tests E2E (`teste2e/`)
- Flow complet : serveur démarré, requêtes réelles
- UI de configuration
- Conventions : `tests/teste2e/{feature}.test.ts`

Résumé dans un tableau :

| Couche | Fichiers concernés | Pertinence | Justification |
|--------|-------------------|------------|---------------|
| testu | ... | Oui/Non | ... |
| testi | ... | Oui/Non | ... |
| teste2e | ... | Oui/Non | ... |

## 3. Proposition de scénarios

Pour chaque couche retenue, propose des scénarios de test :
- **Happy path** : cas nominal
- **Erreurs** : blob invalide, TTL expiré, scope insuffisant, bearer expiré, clé manquante
- **Edge cases** : blob corrompu, header absent, double déchiffrement, concurrence sur le cache

Présente les scénarios et demande validation avant d'implémenter.

## 4. Implémentation des tests

1. Vérifie les helpers existants dans `tests/`
2. Crée les fichiers de test en suivant les conventions
3. Implémente les scénarios validés
4. Lance les tests : `deno task test`

Règles :
- Utiliser `@std/assert` pour les assertions
- Suivre le style des tests existants
- Préférer les assertions précises (`assertEquals`, `assertThrows`) aux vagues (`assert`)

## 5. Vérification

Lance `deno task test` pour confirmer que tout passe.

Si des tests échouent, analyse et corrige. Lance ensuite /verif.

## 6. Résumé

| Couche | Fichiers créés | Scénarios | Status |
|--------|---------------|-----------|--------|
| testu | ... | N | OK/KO |
| testi | ... | N | OK/KO |
| teste2e | ... | N | OK/KO |

- Tests totaux ajoutés : N
- Edge cases couverts : N
