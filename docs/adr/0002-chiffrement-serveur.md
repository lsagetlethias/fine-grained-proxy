# ADR 0002 — Chiffrement du blob côté serveur

- **Date** : 2026-04-08
- **Statut** : Accepted

## Contexte

L'UI de configuration génère des URLs FGP contenant un blob chiffré (token Scalingo + scopes). La question est : qui fait le chiffrement, le navigateur (client-side) ou le serveur FGP ?

Les specs v1.1 avaient proposé un chiffrement 100% côté client (Web Crypto API navigateur), supprimant les endpoints `/api/generate` et `/api/list-apps`. Cette proposition a été challengée par l'architecte.

## Décision

Le chiffrement du blob est fait **côté serveur**, via `POST /api/generate`. Le serveur expose aussi `POST /api/list-apps` pour lister les apps Scalingo.

Le client (navigateur) envoie le token + la config au serveur FGP via HTTPS POST. Le serveur génère la clé client, chiffre le blob, et retourne l'URL + la clé.

## Options envisagées

### Option A — Chiffrement côté client (rejetée)
- Avantages : le serveur ne voit jamais le token à la génération, pureté architecturale
- Inconvénients :
  - **XSS** : 100 lignes de crypto JS inline manipulant le token en clair dans le DOM. Une injection et le token est exfiltré avant chiffrement.
  - Pas d'usage CLI/curl sans reimplémenter la crypto
  - Dépendance CORS Scalingo pour le listing des apps
  - Duplication du pipeline crypto (serveur + navigateur)
  - CompressionStream pas supporté partout (Safari < 16.4)

### Option B — Chiffrement côté serveur (choisi)
- Avantages :
  - Le token transite en POST HTTPS, jamais dans le DOM au-delà de l'input
  - Usage CLI/curl natif
  - Code crypto centralisé (un seul endroit)
  - Pas de dépendance CORS
  - Cohérence avec caldav2ics (même pattern)
- Inconvénients :
  - Le serveur voit le token brièvement à la génération (en plus du runtime proxy, où il le voit de toute façon)

## Conséquences

- Les endpoints `POST /api/generate` et `POST /api/list-apps` sont restaurés
- L'UI est simplifiée (pas de crypto JS, formulaire POST classique)
- Le JS client se limite à de l'interactivité DOM (copier, toggle scopes)
- Le serveur est la seule source de vérité pour le pipeline crypto

## Liens

- ADR 0001 — Stack technique
- Référence : caldav2ics utilise le même pattern (chiffrement serveur)
