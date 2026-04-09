# Recette visuelle UI — FGP

**Date** : 2026-04-09
**Environnement** : `FGP_SALT=test-recette deno task start` (localhost:8000)
**Méthode** : curl brut (`/usr/bin/curl`) + analyse HTML statique (Playwright bloqué par permissions MCP)

---

## Résultats par fonctionnalité

### 1. `GET /` — Layout split (form + doc)

| Critère | Verdict | Détail |
|---------|---------|--------|
| Page HTML valide | OK | `<!DOCTYPE html><html lang="fr">`, 16890 bytes |
| Grid layout split | OK | `grid grid-cols-1 lg:grid-cols-5 gap-8` : col-span-3 (form) + col-span-2 (aside doc) |
| Header titre + description | OK | `<h1>Fine-Grained Proxy</h1>` + sous-titre |
| Aside doc (guide, infos champs, lien API) | OK | `<aside>` avec sections Guide, Utilisation URL, Infos champs, Documentation API |
| Dark mode | OK | Classes `dark:bg-gray-900`, `dark:text-gray-100`, `darkMode: 'media'` dans tailwind config |
| Tailwind CSS chargé | OK | `<script src="https://cdn.tailwindcss.com">` + config custom palette `fgp-*` |

**Verdict global : OK**

### 2. `GET /api/docs` — Swagger UI

| Critère | Verdict | Détail |
|---------|---------|--------|
| HTTP 200 | OK | Confirmé |
| Contient `swagger-ui` div | OK | Vérifié par parsing |
| Référence `openapi.json` | OK | Pointe vers `/api/openapi.json` |
| Page HTML complète | OK | Balise `<html>` présente |

**Verdict global : OK**

### 3. `GET /static/client.js` — JS client

| Critère | Verdict | Détail |
|---------|---------|--------|
| HTTP 200 | OK | Confirmé |
| Non vide | OK | 75443 bytes |
| Référencé dans la page | OK | `<script defer src="/static/client.js">` dans le HTML de `/` |

**Verdict global : OK**

### 4. `POST /api/generate` — Génération URL + clé

| Critère | Verdict | Détail |
|---------|---------|--------|
| HTTP 200 avec body valide | OK | Testé avec token, target, auth, scopes, ttl |
| Champ `url` présent | OK | URL de 306 caractères avec blob chiffré |
| Champ `key` présent | OK | UUID v4 (`fcb0420b-51ca-4ec5-b6a6-fdb67a14332e`) |
| URL contient le blob | OK | `http://localhost:8000/NGCcDvOgJz.../` |

**Verdict global : OK**

### 5. `GET /api/openapi.json` — Spec OpenAPI

| Critère | Verdict | Détail |
|---------|---------|--------|
| Retourne du JSON | OK | Schemas Error, GenerateBody, GenerateResponse, etc. |
| Version OpenAPI 3.0 | OK | Confirmé dans la route `openapi: "3.0.0"` |

**Verdict global : OK**

### 6. Éléments UI dans `GET /` — Vérification HTML

| Élément | Verdict | Détail |
|---------|---------|--------|
| Presets (Scalingo + Vide) | OK | `id="btn-preset-scalingo"` + `id="btn-preset-clear"` |
| Champ URL cible | OK | `<input type="url" id="target">` |
| Select mode auth | OK | `<select id="auth">` avec 4 options : bearer, basic, scalingo-exchange, header: |
| Champ token | OK | `<input type="password" id="token">` avec hint sécurité |
| Bouton "Charger les apps" | OK | `id="btn-load-apps"` (hidden par défaut, affiché en mode scalingo-exchange) |
| Section apps Scalingo | OK | `id="apps-section"` (hidden par défaut) |
| Textarea scopes | OK | `<textarea id="scopes" rows="4">` avec placeholder exemples |
| Bouton body filters | OK | `id="btn-add-body-filters"` (hidden, affiché quand scopes POST/PUT/PATCH) |
| Panel body filters | OK | `id="body-filters-panel"` avec bouton fermer |
| TTL radios (6 options) | OK | 1h (3600), 24h (86400, checked par défaut), 7j (604800), 30j (2592000), Personnalisé, Pas d'expiration |
| TTL custom input | OK | `id="custom-ttl-wrapper"` (hidden par défaut) |
| TTL warning no-expiration | OK | `id="ttl-warning"` avec message amber |
| Bouton "Générer l'URL" | OK | `id="btn-generate"` full-width, style `bg-fgp-700` |
| Section résultat | OK | `id="result-section"` (hidden) avec URL, clé, exemple curl, boutons copier |
| Bannière erreur | OK | `id="error-banner"` (hidden) avec style red |
| Scope chips container | OK | `id="scope-chips"` (hidden par défaut) |

**Verdict global : OK**

---

## Synthèse

| # | Fonctionnalité | Verdict |
|---|----------------|---------|
| 1 | Layout split (form + doc) | **OK** |
| 2 | Swagger UI | **OK** |
| 3 | Client JS | **OK** |
| 4 | POST /api/generate | **OK** |
| 5 | OpenAPI spec | **OK** |
| 6 | Éléments UI (presets, filters, scopes, TTL) | **OK** |

**Verdict final : RECETTE OK**

---

## Limites de cette recette

- **Pas de screenshots visuels** : Playwright MCP était bloqué par permissions. L'analyse est purement HTML/structurelle.
- **Pas de test d'interaction JS** : les comportements dynamiques (afficher body filters, charger apps, TTL custom toggle) n'ont pas été testés en live. Seule la présence des éléments HTML et du JS client (75KB) a été vérifiée.
- **Pas de test dark mode rendu** : les classes CSS dark mode sont présentes mais le rendu visuel n'a pas été inspecté.
- Pour une recette complète avec interactions, relancer avec Playwright autorisé.
