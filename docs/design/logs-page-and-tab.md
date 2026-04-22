# Design Document -- Page `/logs` et onglet « Logs »

**Feature** : `/logs` — Logs par blob (specs.md §14)
**Date** : 2026-04-22
**Auteur** : Designer FGP
**Statut** : Draft -- en attente de review lead

---

## Philosophie

La feature `/logs` a deux surfaces distinctes mais complémentaires :

1. **Page dédiée `/logs`** : console de consultation live, optimisée pour le monitoring. L'utilisateur y passe potentiellement des minutes, il faut donc une UI de type « observabilité » : statut clair, flux lisible, pas de bruit visuel, aucun frein à la lecture en temps réel.
2. **Onglet « Logs » dans `/`** : c'est juste un switch de configuration au milieu du flow de génération d'un blob. L'utilisateur y passe 10 secondes. La priorité est la lisibilité des warnings et l'évidence de l'opt-in.

Le principe directeur est **zero storage visible** : partout on rappelle que les logs vivent en mémoire, courts, per-isolate, et que la feature peut être coupée. Le ton est volontairement sobre et transparent, pas commercial.

Le design réutilise intégralement la palette `fgp-*` existante, le dark mode `media`, et les patterns déjà en place dans `config-page.tsx` (sections, tabs, badges d'alerte, buttons). Pas de composant exotique, pas de dépendance nouvelle.

---

## 1. Page `/logs`

### 1.1 Structure globale

La page réutilise `Layout` (header FGP + logo + lien GitHub + container `max-w-7xl`). Le `<main>` est un `max-w-4xl mx-auto` plus étroit que la page de config parce qu'il n'y a qu'une colonne : le flux est vertical.

Deux états mutés par JS côté client :
- `state="auth"` → formulaire visible, vue stream cachée
- `state="stream"` → formulaire caché, vue stream visible

Un seul DOM servi par le serveur, les deux blocs coexistent avec `hidden` toggled. Zero SPA framework.

### 1.2 État 1 — Formulaire d'auth initial

```
┌────────────────────────────────────────────────────────────────┐
│   [Logo FGP]  Fine-Grained Proxy                   [GitHub]   │
│   Logs d'un blob                                              │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│   Logs d'un blob                                               │
│                                                                │
│   Consultez en direct les requêtes passées par votre blob     │
│   FGP. Saisissez votre blob et votre clé client pour ouvrir   │
│   le flux.                                                    │
│                                                                │
│   ┌──────────────────────────────────────────────────────┐    │
│   │                                                      │    │
│   │  Blob chiffré                                        │    │
│   │  [ Collez le blob base64url ici               ]      │    │
│   │                                                      │    │
│   │  Clé client (X-FGP-Key)                              │    │
│   │  [ La clé retournée à la génération           ]      │    │
│   │                                                      │    │
│   │  [ Connecter ]                                       │    │
│   │                                                      │    │
│   │  (zone status aria-live="polite")                    │    │
│   │                                                      │    │
│   └──────────────────────────────────────────────────────┘    │
│                                                                │
│   Astuce : le blob et la clé sont gardés le temps de          │
│   l'onglet uniquement (sessionStorage). F5 sans re-saisir,    │
│   fermer l'onglet = tout oublié.                              │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

**Copy reprise du §14.13 mot pour mot** :
- Titre page : « Logs d'un blob »
- Sous-titre : « Consultez en direct les requêtes passées par votre blob FGP. Saisissez votre blob et votre clé client pour ouvrir le flux. »
- Label champ blob : « Blob chiffré »
- Placeholder blob : « Collez le blob base64url ici »
- Label champ clé : « Clé client (X-FGP-Key) »
- Placeholder clé : « La clé retournée à la génération »
- Bouton : « Connecter »
- État chargement : « Connexion en cours... »

**Comportement** :
- `<input type="password">` sur la clé client (évite le shoulder-surfing, toggle optionnel œil/barré visible pour révéler).
- Les deux champs sont `required`. Bouton désactivé tant qu'un des deux est vide (`:disabled` via `input:invalid` sibling + JS léger).
- À la soumission : bouton passe en état loading (« Connexion en cours... » + spinner inline), puis en cas de succès → bascule sur vue stream. En cas d'erreur → message sous le bouton dans la zone status, champs re-activés.
- Pré-remplissage depuis `sessionStorage` au `DOMContentLoaded` si des valeurs existent, avec auto-submit optionnel (comportement décidé par le dev — je recommande **pas d'auto-submit**, on pré-remplit juste pour éviter la re-saisie après un F5 accidentel, et l'utilisateur clique Connecter).

### 1.3 État 2 — Vue stream

```
┌────────────────────────────────────────────────────────────────┐
│   [Logo FGP]  Fine-Grained Proxy                   [GitHub]   │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│   Logs d'un blob       [● Connecté]         [Se déconnecter]  │
│   Blob: a1b2c3d4…  (8 premiers chars du blobId, title=full)   │
│                                                                │
│   ┌──── Requêtes ─────────────────────────────────────────┐   │
│   │                                                        │   │
│   │  14:23:18.423  [GET]  /v1/apps/my-app/containers      │   │
│   │                [200]  142ms  · 203.0.113.0/24         │   │
│   │                                                        │   │
│   │  14:23:15.100  [POST] /v1/apps/my-app/deployments     │   │
│   │                [201]  389ms  · 203.0.113.0/24         │   │
│   │                                                        │   │
│   │  14:23:12.011  [GET]  /v1/apps                        │   │
│   │                [403]  12ms   · 198.51.100.0/24        │   │
│   │                                                        │   │
│   │  ...                                                   │   │
│   │                                                        │   │
│   │  [↓ Reprendre le défilement auto]  (si scroll-up)     │   │
│   └────────────────────────────────────────────────────────┘  │
│                                                                │
│   ┌──── Bodies détaillés  ▼ ──────────────────────────────┐   │
│   │                                                        │   │
│   │  14:23:15.100  POST /v1/apps/my-app/deployments        │   │
│   │  {                                                     │   │
│   │    "deployment": {                                     │   │
│   │      "git_ref": "main",                                │   │
│   │      "source_url": "https://github.com/..."            │   │
│   │    }                                                   │   │
│   │  }                                                     │   │
│   │  ─────────────────────────────                        │   │
│   │  14:22:01.840  POST /v1/apps/my-app/scale              │   │
│   │  [Body trop volumineux — non stocké]                  │   │
│   │                                                        │   │
│   └────────────────────────────────────────────────────────┘  │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

**Header de la vue stream** :
- Titre « Logs d'un blob » (h1), déjà présent en haut.
- À droite du titre, **indicateur de statut** : un pastille + label. Trois états :
  - `● Connecté` (vert — `text-green-600` / `dark:text-green-400`)
  - `● Reconnexion...` (orange pulsant — `text-amber-500` + `animate-pulse`)
  - `● Erreur` (rouge — `text-red-600` / `dark:text-red-400`)
- Ligne sous-titre : `blob: <8 chars>...` avec `title` contenant l'identifiant partiel complet (jamais le blob plein en clair dans le DOM visible — principe paranoia légère).
- Bouton « Se déconnecter » à droite : outline rouge, ferme le stream + purge `sessionStorage` + retour à l'état formulaire.

**Section « Requêtes » (events network)** :
- Liste verticale, ordre chronologique inverse (plus récent en haut) — décision de design : le lecteur qui arrive voit le plus récent sans scroller, cohérent avec les consoles d'observabilité (Datadog, Grafana Loki). Le stream pousse en haut.
- Chaque event = une carte compacte à deux lignes :
  - Ligne 1 : `timestamp HH:MM:SS.mmm` (police monospace, gris) · `METHOD` (badge couleur) · `path` (mono)
  - Ligne 2 : `status` (badge coloré) · `duration` · `ipPrefix`
- Séparateur léger entre events (border-top `border-gray-100 dark:border-gray-800`).

**Section « Bodies détaillés »** (pliable via `<details>` natif) :
- Par défaut **dépliée** si au moins un detailed est arrivé, sinon **repliée** avec count = 0.
- Le titre `Bodies détaillés (3)` montre le nombre courant en mémoire côté client.
- Chaque body = une carte avec timestamp + method + path en header, puis body JSON `pretty-printed` dans un `<pre>`, gris clair.
- Si `truncated: true` → affiche « Body trop volumineux — non stocké » en italique gris à la place du body.
- Si déchiffrement client-side échoue → « Déchiffrement impossible — vérifiez votre clé » en texte rouge.
- Si `logs.detailed` n'est pas activé pour ce blob (aucun event detailed ne viendra jamais) → message info statique : « Les bodies détaillés ne sont pas activés pour ce blob. Activez-les dans l'onglet Logs de votre configuration. »

### 1.4 Empty state

Quand l'utilisateur vient de connecter et qu'aucun event n'est encore arrivé :

```
┌──── Requêtes ─────────────────────────────────────────┐
│                                                        │
│              [icône activité pulsante]                 │
│                                                        │
│     Aucun événement pour l'instant.                    │
│     Les requêtes apparaîtront ici en direct.           │
│                                                        │
└────────────────────────────────────────────────────────┘
```

Centré dans la zone de la liste, texte gris, petite icône discrète (un `<svg>` d'activité ou un simple `·` animé). Disparaît dès le premier event network reçu.

### 1.5 Erreurs

Toutes les erreurs SSE listées au §14.13 sont affichées **à la place** de l'état connecté dans le header, et **remplacent** le contenu des deux sections par une carte d'erreur unique :

```
┌────────────────────────────────────────────────────────┐
│   Logs d'un blob       [● Erreur]      [Retour au    │
│                                         formulaire]   │
│                                                        │
│   ┌──────────────────────────────────────────────┐    │
│   │  [icône alerte]                              │    │
│   │                                              │    │
│   │  Un flux de logs est déjà actif pour ce      │    │
│   │  blob. Fermez l'autre onglet avant de        │    │
│   │  réessayer.                                  │    │
│   │                                              │    │
│   │  [ Réessayer ]  [ Retour au formulaire ]    │    │
│   └──────────────────────────────────────────────┘    │
│                                                        │
└────────────────────────────────────────────────────────┘
```

Mapping error → message (copy reprise §14.13) :
- 404 → « Les logs sont désactivés sur cette instance. » → bouton unique « Retour au formulaire »
- 401 → « Blob ou clé invalide — impossible de déchiffrer. » → « Retour au formulaire »
- 403 → « Les logs ne sont pas activés pour ce blob. Activez-les dans la configuration avant de réessayer. » → « Retour au formulaire »
- 409 → « Un flux de logs est déjà actif pour ce blob. Fermez l'autre onglet avant de réessayer. » → « Réessayer » + « Retour au formulaire »
- 410 → « Ce blob est expiré. » → « Retour au formulaire »

Le bouton `Réessayer` (uniquement en 409) relance le `fetch` vers `/logs/stream` avec les valeurs en `sessionStorage`. Les autres codes d'erreur forcent le retour au formulaire parce que la saisie ou la config doit changer.

### 1.6 Transitions entre états

- **Auth → Stream** : formulaire fade-out (`opacity-0` + `pointer-events-none` 150ms), vue stream fade-in. Pas de transition exotique, juste un swap simple.
- **Stream → Erreur** : le header et le badge de statut mutent in-place, le contenu des deux sections est remplacé par la card d'erreur. Pas de changement de layout pour éviter le reflow.
- **Stream → Reconnexion (transitoire)** : le badge devient orange pulsant, un toast mince sous le header apparaît brièvement (« Reconnexion... depuis 14:23:18 » — le `since` est affiché en clair pour que l'utilisateur voit que rien n'a été perdu). Le toast disparaît quand la reconnexion réussit.
- **Stream → Déconnexion volontaire** : modale de confirmation légère (`<dialog>` natif) : « Fermer le flux et oublier le blob ? » Oui → reset `sessionStorage` → retour au formulaire (vide).
- **Erreur → Formulaire** : bouton « Retour au formulaire » fait exactement la même chose qu'une déconnexion volontaire mais sans modale.

### 1.7 Classes Tailwind suggérées

**Conteneur page** :
```
<main class="max-w-4xl mx-auto space-y-6">
```

**Formulaire d'auth** :
```
<form class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm
             dark:border-gray-700 dark:bg-gray-800/50 space-y-4">
```

**Champs** : identiques au pattern `config-page.tsx` :
```
<input class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm
              font-mono shadow-sm focus:border-fgp-500 focus:ring-1
              focus:ring-fgp-500 outline-none
              dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100
              dark:placeholder-gray-400" />
```

**Bouton Connecter** (primary fgp) :
```
<button class="rounded-md bg-fgp-600 px-4 py-2 text-sm font-semibold
               text-white hover:bg-fgp-700 focus:outline-none
               focus:ring-2 focus:ring-fgp-500 focus:ring-offset-2
               disabled:opacity-50 disabled:cursor-not-allowed
               dark:focus:ring-offset-gray-900">
```

**Bouton Se déconnecter** (outline danger soft) :
```
<button class="rounded-md border border-red-300 bg-white px-3 py-1.5
               text-sm font-medium text-red-700 hover:bg-red-50
               focus:outline-none focus:ring-2 focus:ring-red-500
               focus:ring-offset-2 dark:bg-gray-900 dark:border-red-800
               dark:text-red-300 dark:hover:bg-red-950
               dark:focus:ring-offset-gray-900">
```

**Badge statut connecté** :
```
<span class="inline-flex items-center gap-1.5 rounded-full bg-green-50
             px-2.5 py-0.5 text-xs font-medium text-green-700
             dark:bg-green-900/30 dark:text-green-400">
  <span class="h-2 w-2 rounded-full bg-green-500" aria-hidden="true"></span>
  Connecté
</span>
```

Variantes :
- Reconnexion : `bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400` + `animate-pulse` sur le dot.
- Erreur : `bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400`.

**Section list events** :
```
<section aria-labelledby="logs-network-title"
         aria-live="polite"
         aria-relevant="additions"
         aria-atomic="false"
         class="rounded-lg border border-gray-200 bg-white
                dark:border-gray-700 dark:bg-gray-800/50">
  <header class="border-b border-gray-200 px-4 py-3
                 dark:border-gray-700">
    <h2 id="logs-network-title" class="text-sm font-semibold
                                        text-gray-900 dark:text-gray-100">
      Requêtes
    </h2>
  </header>
  <ul class="divide-y divide-gray-100 dark:divide-gray-800
             max-h-[60vh] overflow-y-auto" role="log">
    …
  </ul>
</section>
```

**Card event network** :
```
<li class="px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/70">
  <div class="flex items-center gap-3 text-xs">
    <time class="font-mono text-gray-500 dark:text-gray-400 shrink-0">
      14:23:18.423
    </time>
    <span class="inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5
                 font-mono font-medium text-gray-700
                 dark:bg-gray-700 dark:text-gray-200">GET</span>
    <span class="font-mono text-gray-900 dark:text-gray-100 truncate">
      /v1/apps/my-app/containers
    </span>
  </div>
  <div class="mt-1 flex items-center gap-3 text-xs pl-[calc(theme(spacing.12))]">
    <span class="inline-flex items-center rounded bg-green-50 px-1.5 py-0.5
                 font-mono font-medium text-green-700
                 dark:bg-green-900/30 dark:text-green-400">200</span>
    <span class="text-gray-500 dark:text-gray-400">142ms</span>
    <span class="text-gray-400 dark:text-gray-500 font-mono">
      203.0.113.0/24
    </span>
  </div>
</li>
```

**Status code coloration** :
- 2xx : `bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400`
- 3xx : `bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400`
- 4xx : `bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400`
- 5xx : `bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400`

**Method coloration (discrète, pour aider le scan)** :
- GET : `text-gray-700`
- POST : `text-fgp-700`
- PUT/PATCH : `text-amber-700`
- DELETE : `text-red-700`
(dark mode miroir en `-400` au lieu de `-700`)

**Section bodies détaillés** (via `<details>` natif pour pliage accessible) :
```
<details class="rounded-lg border border-gray-200 bg-white
                dark:border-gray-700 dark:bg-gray-800/50 group" open>
  <summary class="cursor-pointer list-none px-4 py-3 flex items-center
                   justify-between">
    <h2 class="text-sm font-semibold text-gray-900 dark:text-gray-100">
      Bodies détaillés
      <span class="ml-1 text-xs font-normal text-gray-500
                   dark:text-gray-400">(<span id="detailed-count">0</span>)</span>
    </h2>
    <svg class="h-4 w-4 transition-transform group-open:rotate-90
                text-gray-500" ... />
  </summary>
  <ul class="divide-y divide-gray-100 dark:divide-gray-800
             max-h-[50vh] overflow-y-auto" role="log"
      aria-live="polite" aria-relevant="additions">
    …
  </ul>
</details>
```

**Card body detailed dépliée** :
```
<li class="px-4 py-3 space-y-2">
  <div class="flex items-center gap-3 text-xs">
    <time class="font-mono text-gray-500 dark:text-gray-400">
      14:23:15.100
    </time>
    <span class="font-mono font-medium text-fgp-700
                 dark:text-fgp-400">POST</span>
    <span class="font-mono text-gray-900 dark:text-gray-100 truncate">
      /v1/apps/my-app/deployments
    </span>
  </div>
  <pre class="rounded-md bg-gray-100 dark:bg-gray-800/80 p-3 font-mono
              text-xs text-gray-800 dark:text-gray-200 overflow-x-auto
              whitespace-pre">{ pretty-printed JSON }</pre>
</li>
```

**Card truncated ou erreur déchiffrement** :
```
<div class="rounded-md border border-dashed border-gray-300 p-3
            text-xs italic text-gray-500 dark:border-gray-600
            dark:text-gray-400">
  Body trop volumineux — non stocké
</div>
```
(en rouge pour déchiffrement : `border-red-300 text-red-700` / dark `border-red-800 text-red-400`)

### 1.8 Structure JSX partielle

**Composant racine** :

```tsx
export function LogsPage({ commitHash }: { commitHash: string }) {
  return (
    <Layout>
      <header class="mb-8">
        <div class="flex items-center gap-3">
          <FgpLogo size={36} />
          <h1 class="text-2xl font-bold text-fgp-900 dark:text-fgp-100
                     tracking-tight">
            Logs d'un blob
          </h1>
        </div>
      </header>

      <main class="max-w-4xl mx-auto space-y-6">
        <section id="logs-auth-state" aria-label="Authentification au flux">
          <AuthForm />
        </section>

        <section id="logs-stream-state" aria-label="Flux de logs en direct" hidden>
          <StreamHeader />
          <NetworkList />
          <DetailedList />
        </section>

        <section id="logs-error-state" aria-label="Erreur de flux" hidden>
          <ErrorCard />
        </section>

        <script defer src="/static/logs-client.js" />
      </main>
    </Layout>
  );
}
```

**AuthForm** :

```tsx
function AuthForm() {
  return (
    <form id="logs-auth-form"
          class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm
                 dark:border-gray-700 dark:bg-gray-800/50 space-y-4">
      <p class="text-sm text-gray-600 dark:text-gray-400">
        Consultez en direct les requêtes passées par votre blob FGP.
        Saisissez votre blob et votre clé client pour ouvrir le flux.
      </p>

      <div>
        <label for="logs-blob"
               class="block text-sm font-medium text-gray-700
                      dark:text-gray-300 mb-1">
          Blob chiffré
        </label>
        <input type="text" id="logs-blob" name="blob" required
               autocomplete="off" spellcheck={false}
               placeholder="Collez le blob base64url ici"
               class="w-full rounded-md border border-gray-300 px-3 py-2
                      text-sm font-mono shadow-sm focus:border-fgp-500
                      focus:ring-1 focus:ring-fgp-500 outline-none
                      dark:bg-gray-800 dark:border-gray-600
                      dark:text-gray-100 dark:placeholder-gray-400" />
      </div>

      <div>
        <label for="logs-key"
               class="block text-sm font-medium text-gray-700
                      dark:text-gray-300 mb-1">
          Clé client (X-FGP-Key)
        </label>
        <input type="password" id="logs-key" name="key" required
               autocomplete="off" spellcheck={false}
               placeholder="La clé retournée à la génération"
               class="w-full rounded-md border border-gray-300 px-3 py-2
                      text-sm font-mono shadow-sm focus:border-fgp-500
                      focus:ring-1 focus:ring-fgp-500 outline-none
                      dark:bg-gray-800 dark:border-gray-600
                      dark:text-gray-100 dark:placeholder-gray-400" />
      </div>

      <div class="flex items-center gap-3">
        <button type="submit" id="logs-connect"
                class="rounded-md bg-fgp-600 px-4 py-2 text-sm
                       font-semibold text-white hover:bg-fgp-700
                       focus:outline-none focus:ring-2 focus:ring-fgp-500
                       focus:ring-offset-2 disabled:opacity-50
                       disabled:cursor-not-allowed
                       dark:focus:ring-offset-gray-900">
          Connecter
        </button>
        <span id="logs-auth-status"
              class="text-sm font-medium"
              aria-live="polite" role="status"></span>
      </div>

      <p class="text-xs text-gray-500 dark:text-gray-400">
        Le blob et la clé sont gardés le temps de l'onglet uniquement.
      </p>
    </form>
  );
}
```

**StreamHeader** :

```tsx
function StreamHeader() {
  return (
    <header class="flex items-center justify-between flex-wrap gap-3">
      <div>
        <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Flux en direct
        </h2>
        <p class="text-xs text-gray-500 dark:text-gray-400 font-mono">
          blob: <span id="logs-blob-id" title="">--------</span>
        </p>
      </div>
      <div class="flex items-center gap-3">
        <span id="logs-status" role="status" aria-live="polite"
              class="inline-flex items-center gap-1.5 rounded-full
                     bg-green-50 px-2.5 py-0.5 text-xs font-medium
                     text-green-700 dark:bg-green-900/30
                     dark:text-green-400">
          <span class="h-2 w-2 rounded-full bg-green-500"
                aria-hidden="true"></span>
          <span id="logs-status-label">Connecté</span>
        </span>
        <button type="button" id="logs-disconnect"
                class="rounded-md border border-red-300 bg-white px-3 py-1.5
                       text-sm font-medium text-red-700 hover:bg-red-50
                       focus:outline-none focus:ring-2 focus:ring-red-500
                       focus:ring-offset-2 dark:bg-gray-900
                       dark:border-red-800 dark:text-red-300
                       dark:hover:bg-red-950
                       dark:focus:ring-offset-gray-900">
          Se déconnecter
        </button>
      </div>
    </header>
  );
}
```

**NetworkList** — le `<ul>` est alimenté côté client, le SSR envoie seulement l'empty state :

```tsx
function NetworkList() {
  return (
    <section class="rounded-lg border border-gray-200 bg-white
                    dark:border-gray-700 dark:bg-gray-800/50">
      <header class="border-b border-gray-200 px-4 py-3
                     dark:border-gray-700">
        <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Requêtes
        </h3>
      </header>
      <div id="logs-network-empty"
           class="px-4 py-12 text-center text-sm text-gray-500
                  dark:text-gray-400">
        Aucun événement pour l'instant. Les requêtes apparaîtront ici
        en direct.
      </div>
      <ul id="logs-network-list"
          role="log"
          aria-live="polite"
          aria-relevant="additions"
          aria-atomic="false"
          aria-label="Requêtes passées par le blob"
          class="divide-y divide-gray-100 dark:divide-gray-800
                 max-h-[60vh] overflow-y-auto" hidden>
      </ul>
    </section>
  );
}
```

**DetailedList** — même principe :

```tsx
function DetailedList() {
  return (
    <details id="logs-detailed-section"
             class="rounded-lg border border-gray-200 bg-white
                    dark:border-gray-700 dark:bg-gray-800/50 group" open>
      <summary class="cursor-pointer list-none px-4 py-3 flex
                       items-center justify-between
                       [&::-webkit-details-marker]:hidden">
        <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Bodies détaillés
          <span class="ml-1 text-xs font-normal text-gray-500
                       dark:text-gray-400">
            (<span id="logs-detailed-count">0</span>)
          </span>
        </h3>
        <svg class="h-4 w-4 transition-transform group-open:rotate-90
                    text-gray-500" viewBox="0 0 20 20"
             fill="currentColor" aria-hidden="true">
          <path fill-rule="evenodd"
                d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                clip-rule="evenodd" />
        </svg>
      </summary>

      <div id="logs-detailed-disabled"
           class="px-4 py-6 text-center text-sm text-gray-500
                  dark:text-gray-400" hidden>
        Les bodies détaillés ne sont pas activés pour ce blob.
        Activez-les dans l'onglet Logs de votre configuration.
      </div>

      <ul id="logs-detailed-list"
          role="log" aria-live="polite" aria-relevant="additions"
          class="divide-y divide-gray-100 dark:divide-gray-800
                 max-h-[50vh] overflow-y-auto">
      </ul>
    </details>
  );
}
```

---

## 2. Onglet « Logs » dans la page de configuration

### 2.1 Position dans la barre d'onglets

Ajout d'un 4e onglet **après Changelog**, même pattern que les autres (classes copiées de `tab-changelog`). Ordre final : Doc / Exemples / Changelog / Logs.

```
┌───────────────────────────────────────────────────────────┐
│ [ Doc ] [ Exemples ] [ Changelog ] [ Logs ]              │
│ ─────                                                     │
└───────────────────────────────────────────────────────────┘
```

Remarque : le onglet « Logs » doit apparaître **indépendamment** de la valeur de `FGP_LOGS_ENABLED`. Le kill switch serveur affecte le comportement (route 404) mais pas la visibilité de l'onglet côté UI — l'utilisateur doit pouvoir voir pourquoi la feature est désactivée. La page `/` n'a de toute façon pas accès à l'état du kill switch côté client (on ne leak pas cette info), donc l'onglet est toujours rendu. L'info « feature off » s'affiche si la génération ultérieure révèle un problème, ou via un check initial au montage de l'onglet (voir §2.5).

### 2.2 Contenu du panel Logs

```
┌───────────────────────────────────────────────────────────┐
│  Logs                                                     │
│                                                           │
│  Activez la capture in-memory des requêtes passant par   │
│  ce blob. Les logs sont visibles uniquement via /logs    │
│  et ne sont jamais persistés.                            │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  [  ] Activer les logs pour ce blob                │ │
│  │                                                     │ │
│  │   Chaque requête est journalisée en mémoire        │ │
│  │   (méthode, chemin, status, durée, IP tronquée)    │ │
│  │   pendant quelques minutes.                         │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  [  ] Capturer aussi les bodies détaillés           │ │
│  │       (POST/PUT/PATCH JSON)           (grisé)       │ │
│  │                                                     │ │
│  │   Le body request est compressé puis chiffré avec  │ │
│  │   votre clé client avant d'être stocké. Le serveur │ │
│  │   ne peut pas le lire. Multipart exclu.            │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                           │
│  ┌─── ⚠ Attention ─────────────────────────────────────┐│
│  │  Activez uniquement si vous avez besoin d'inspecter ││
│  │  les payloads. Le body peut contenir des            ││
│  │  informations sensibles — n'ouvrez /logs que sur    ││
│  │  un poste de confiance.                             ││
│  └─────────────────────────────────────────────────────┘│
│  (visible uniquement quand detailed est coché)           │
│                                                           │
│  → Ouvrir la console /logs (ouvre nouvel onglet)         │
│                                                           │
└───────────────────────────────────────────────────────────┘
```

**Copy reprise §14.13** (intégralement, mot pour mot) :
- Titre onglet : « Logs »
- Intro : « Activez la capture in-memory des requêtes passant par ce blob. Les logs sont visibles uniquement via `/logs` et ne sont jamais persistés. »
- Toggle principal : « Activer les logs pour ce blob »
- Aide toggle principal : « Chaque requête est journalisée en mémoire (méthode, chemin, status, durée, IP tronquée) pendant quelques minutes. »
- Toggle detailed : « Capturer aussi les bodies détaillés (POST/PUT/PATCH JSON) »
- Aide toggle detailed : « Le body request est compressé puis chiffré avec votre clé client avant d'être stocké. Le serveur ne peut pas le lire. Multipart exclu. »
- Warning detailed : « Activez uniquement si vous avez besoin d'inspecter les payloads. Le body peut contenir des informations sensibles — n'ouvrez `/logs` que sur un poste de confiance. »
- Lien : « Ouvrir la console `/logs` »
- Feature off globalement : « Les logs sont désactivés sur cette instance FGP. Contactez l'administrateur pour activer `FGP_LOGS_ENABLED`. »

### 2.3 Comportement des toggles

- Les deux toggles sont des `<input type="checkbox">` stylisés en switch visuel. Pattern Tailwind classique (peer + sibling styling).
- `logs.detailed` est **désactivé** (attribut `disabled` + opacité réduite) tant que `logs.enabled` est faux. Le label associé reçoit aussi `text-gray-400` pour bien signaler l'indispo.
- Quand l'utilisateur décoche `logs.enabled`, `logs.detailed` est forcé à faux et le warning disparaît.
- Quand `logs.detailed` est coché, le warning apparaît en dessous (transition douce optionnelle, pas critique).
- L'état des checkboxes est persisté dans le même flow que les autres champs de config (même mécanique que TTL presets, auth mode, etc. — serialization dans le blob à la génération et dans le param `?c=` de partage).
- Par défaut (aucune coche), le champ `logs` est **omis du blob** (cf. §14.4 : blob identique à un blob sans feature logs). Seul un toggle explicite produit `logs: { enabled: true, detailed: ... }`.

### 2.4 Lien vers `/logs`

Bouton texte discret `text-fgp-600` avec icône `external-link`. Ouvre `/logs` dans un nouvel onglet (`target="_blank"` + `rel="noopener"`). N'inclut **pas** de pré-remplissage URL (ne jamais passer blob/clé dans l'URL — ni query string ni fragment — c'est un principe de sécurité). L'utilisateur devra re-coller manuellement ses credentials dans le formulaire `/logs`. C'est explicite et sûr.

### 2.5 Cas « feature off globalement »

Au montage du panel, un petit `fetch('/logs/health')` (ou `HEAD /logs/stream` sans body) détecte si la route existe (200/401/403/409 = feature active ; 404 = kill switch off). Si 404 :

```
┌───────────────────────────────────────────────────────────┐
│  Logs                                                     │
│                                                           │
│  Activez la capture in-memory des requêtes passant par   │
│  ce blob. Les logs sont visibles uniquement via /logs    │
│  et ne sont jamais persistés.                            │
│                                                           │
│  ┌─── ℹ Information ───────────────────────────────────┐ │
│  │  Les logs sont désactivés sur cette instance FGP.  │ │
│  │  Contactez l'administrateur pour activer           │ │
│  │  FGP_LOGS_ENABLED.                                  │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                           │
│  (toggles grisés et désactivés)                          │
│                                                           │
└───────────────────────────────────────────────────────────┘
```

Les toggles restent visibles mais tous désactivés, message info en haut de panel. Décision : ne pas les cacher permet à l'utilisateur de comprendre ce qu'il rate, et de savoir quoi demander à l'admin. Je suggère un endpoint dédié léger `GET /logs/health` qui renvoie `{ enabled: boolean }` sans toucher aucun état — à confirmer avec le dev (voir Questions ouvertes §5).

### 2.6 Classes Tailwind suggérées

**Bouton onglet** (strictement copié de `tab-changelog` avec nouveau `id` et `aria-controls`) :
```tsx
<button type="button" id="tab-logs" role="tab" aria-selected="false"
        aria-controls="panel-logs" tabindex={-1}
        class="px-4 py-2 text-sm font-medium border-b-2 border-transparent
               text-gray-500 hover:text-gray-700 dark:text-gray-400
               dark:hover:text-gray-200">
  Logs
</button>
```

**Panel** :
```tsx
<div id="panel-logs" role="tabpanel" aria-labelledby="tab-logs" hidden
     class="space-y-6 text-sm text-gray-600 dark:text-gray-400">
  …
</div>
```

**Toggle switch (pattern peer)** :
```tsx
<label class="flex items-start gap-3 cursor-pointer">
  <input type="checkbox" id="logs-enabled" class="peer sr-only" />
  <span class="relative inline-block h-5 w-9 shrink-0 rounded-full
               bg-gray-300 transition-colors
               peer-checked:bg-fgp-600
               peer-focus-visible:ring-2 peer-focus-visible:ring-fgp-500
               peer-focus-visible:ring-offset-2
               dark:bg-gray-600 dark:peer-checked:bg-fgp-500
               dark:peer-focus-visible:ring-offset-gray-900
               after:absolute after:top-0.5 after:left-0.5 after:h-4 after:w-4
               after:rounded-full after:bg-white after:transition-transform
               peer-checked:after:translate-x-4" aria-hidden="true"></span>
  <div class="flex-1">
    <span class="font-medium text-gray-900 dark:text-gray-100">
      Activer les logs pour ce blob
    </span>
    <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
      Chaque requête est journalisée en mémoire (méthode, chemin,
      status, durée, IP tronquée) pendant quelques minutes.
    </p>
  </div>
</label>
```

**Toggle detailed (disabled si enabled off)** : même pattern mais ajouter `:disabled` + opacity-50 sur le label parent via attribut `data-disabled` ou une classe conditionnelle.

**Card warning** (reprend le pattern `bg-fgp-50` existant mais en amber) :
```tsx
<div id="logs-detailed-warning" hidden
     class="rounded-md bg-amber-50 border border-amber-200 p-3
            dark:bg-amber-900/20 dark:border-amber-800">
  <div class="flex gap-2">
    <svg class="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400"
         aria-hidden="true">...</svg>
    <div>
      <p class="text-xs font-semibold text-amber-800 dark:text-amber-300">
        Attention
      </p>
      <p class="mt-1 text-xs text-amber-700 dark:text-amber-400">
        Activez uniquement si vous avez besoin d'inspecter les payloads.
        Le body peut contenir des informations sensibles — n'ouvrez
        /logs que sur un poste de confiance.
      </p>
    </div>
  </div>
</div>
```

**Lien vers /logs** :
```tsx
<a href="/logs" target="_blank" rel="noopener"
   class="inline-flex items-center gap-1.5 text-sm font-medium
          text-fgp-600 hover:text-fgp-800 dark:text-fgp-400
          dark:hover:text-fgp-200 focus:outline-none focus:underline">
  <span>Ouvrir la console <code class="font-mono">/logs</code></span>
  <svg class="h-3.5 w-3.5" aria-hidden="true">...</svg>
</a>
```

**Card info feature off** :
```tsx
<div class="rounded-md bg-blue-50 border border-blue-200 p-3
            dark:bg-blue-900/20 dark:border-blue-800">
  <p class="text-xs text-blue-800 dark:text-blue-300">
    Les logs sont désactivés sur cette instance FGP. Contactez
    l'administrateur pour activer <code class="font-mono">FGP_LOGS_ENABLED</code>.
  </p>
</div>
```

### 2.7 Structure JSX partielle du panel

```tsx
function LogsTabPanel() {
  return (
    <div id="panel-logs" role="tabpanel" aria-labelledby="tab-logs" hidden
         class="space-y-6 text-sm text-gray-600 dark:text-gray-400">
      <section>
        <h3 class="text-base font-semibold text-gray-900
                   dark:text-gray-100 mb-2">Logs</h3>
        <p>
          Activez la capture in-memory des requêtes passant par ce blob.
          Les logs sont visibles uniquement via <code class="font-mono">/logs</code>
          {" "}et ne sont jamais persistés.
        </p>
      </section>

      <div id="logs-feature-off" hidden>
        {/* Card info feature off */}
      </div>

      <fieldset id="logs-toggles" class="space-y-4">
        <legend class="sr-only">Configuration des logs pour ce blob</legend>
        {/* Toggle enabled */}
        {/* Toggle detailed (disabled sibling) */}
      </fieldset>

      <div id="logs-detailed-warning" hidden>
        {/* Warning amber */}
      </div>

      <hr class="border-gray-200 dark:border-gray-700" />

      <section>
        <a href="/logs" target="_blank" rel="noopener">
          Ouvrir la console <code class="font-mono">/logs</code>
        </a>
      </section>
    </div>
  );
}
```

---

## 3. Notes a11y (obligatoire)

### 3.1 Page `/logs`

- **Form** : chaque `input` a son `<label for="...">`. Les placeholders ne remplacent pas les labels.
- **Zone de statut submit** : `<span role="status" aria-live="polite">` à côté du bouton Connecter.
- **Indicateur de statut stream** : `<span role="status" aria-live="polite">` contenant « Connecté » / « Reconnexion... » / « Erreur ». La pastille colorée est décorative (`aria-hidden="true"`) parce que le label texte porte déjà l'info — ne pas doubler l'annonce.
- **Live region events** : la `<ul>` des events est `role="log" aria-live="polite" aria-relevant="additions" aria-atomic="false"`. Règle critique : `aria-live` doit être sur le **conteneur des items**, pas sur chaque `<li>`. Ça laisse le navigateur annoncer juste la nouveauté, pas toute la liste.
- **Anti-spam screen reader** : un stream live peut générer 10 events/s sur un burst, ce qui est insupportable à l'oreille. Le dev doit implémenter un **batching côté client** : toutes les nouvelles entries arrivées dans une fenêtre de 2 secondes sont annoncées sous forme agrégée (« 5 nouvelles requêtes »), plutôt que chacune individuellement. Technique : insérer dans la live region un `<span class="sr-only">` unique toutes les 2s qui résume les adds. Les items visuels peuvent s'ajouter normalement en dehors de la zone aria-live active (ou marquer les `<li>` comme `aria-hidden="true"` pour que seul le span sr-only soit annoncé).
- **Scroll auto vs ancrage** : si l'utilisateur scroll vers le haut pour lire un event ancien, le scroll auto doit être **désactivé** jusqu'à ce qu'il revienne en bas. Détection via `element.scrollTop > 0`. Un bouton flottant « ↓ Reprendre le défilement auto » (fixed bottom-right de la liste) réactive le comportement. Sans ça, l'utilisateur perd le fil dès qu'il essaie de lire.
- **Focus order** : blob → clé → bouton connecter (état auth). Stream : bouton déconnexion → premier event (optionnel via `tabindex="0"` sur la liste) → toggle détails. Les events eux-mêmes ne sont pas focusables (cards passives).
- **Raccourcis clavier** : `Esc` = déconnexion (depuis la vue stream, avec confirmation). `Ctrl/Cmd+K` optionnel pour focus sur le formulaire (pas critique, à évaluer par le dev).
- **Contraste dark mode** : les couleurs amber/green/red en dark mode sont toutes en `-400` ou `-300` sur `-900/30` → ratios vérifiés > 4.5:1 dans la palette Tailwind standard. Le vert du dot en `bg-green-500` est purement décoratif, pas de texte dessus.
- **Truncation** : les paths longs doivent `truncate` avec `title` contenant le path complet pour la souris, et rester accessibles au screen reader via le texte complet dans le DOM (CSS-only truncation ne cache pas au screen reader).

### 3.2 Onglet Logs dans config

- Toggles : labels cliquables cohérents avec les autres toggles de la page. Le switch visuel est `aria-hidden="true"` parce que le checkbox natif est masqué via `sr-only` mais reste la source de vérité.
- Toggle disabled : utiliser l'attribut HTML `disabled` (pas juste une classe), pour que screen readers l'annoncent comme « non disponible ». Idéalement ajouter `aria-describedby` pointant vers un texte court « Activez d'abord la capture de base ».
- Navigation clavier : l'onglet Logs rejoint le cycle existant des tabs (flèches gauche/droite, Home/End). Le dev doit juste ajouter le nouveau bouton dans le pattern déjà en place dans `src/ui/client/tabs.ts`.

---

## 4. Spécificités live-stream

### 4.1 Scroll auto et ancrage

Déjà couvert §3.1 : auto-scroll au top (nouveaux events en haut) **sauf si** l'utilisateur a scrollé vers le bas (lire du vieux). Un bouton « reprendre le défilement auto » réactive. Détection simple : `if (list.scrollTop === 0)` → on peut auto-prepend sans rompre la lecture.

**Alternative considérée puis rejetée** : scroll reverse (oldest at top, newest at bottom) avec auto-scroll bas. Pb : sur mobile et sur beaucoup de setups, le premier event visible sans scroll est le plus ancien, pas le plus récent. L'ordre « nouveau en haut » est plus conforme aux consoles d'observabilité modernes (Grafana, Datadog).

### 4.2 Pagination virtuelle / cap côté client

**Cap proposé** : 200 events network + 50 events detailed côté client (indépendant du ring buffer serveur qui est à 50/10). Quand le cap est atteint, on drop le plus ancien avant d'insérer le nouveau. FIFO simple, pas de virtualisation (overkill pour ces volumes).

Si un jour on dépasse ~1000 items visibles, on basculera sur une virtualisation type `@tanstack/virtual` — mais zero dépendance pour l'instant, on reste au DOM direct.

### 4.3 Distinction visuelle network vs detailed

Séparation nette : deux sections distinctes (boxes différentes). **Pas de mélange** dans une même liste. Raisons :
- Les detailed sont toujours redondants avec un network (même `ts`, même path).
- Les detailed ont un rendu volumineux (pre JSON) qui casserait la lecture des lignes network compactes.
- La section detailed peut être pliée entièrement pour un utilisateur qui veut juste scanner les requêtes.

Les deux listes partagent le même `ts` et l'utilisateur peut corréler par timestamp (même format partout : `HH:MM:SS.mmm`).

### 4.4 Format timestamp

`HH:MM:SS.mmm` en heure **locale** (pas UTC). Raison : un opérateur qui monitore son propre trafic pense en heure locale. La précision milliseconde est nécessaire pour distinguer des events sub-secondes sur un burst.

Conversion côté client : `new Date(ts).toLocaleTimeString('fr-FR', { hour12: false })` + `.toString().padStart(3, '0')` pour les ms. Pas de lib `dayjs`/`date-fns` — `toLocaleTimeString` suffit.

Pas de date affichée par défaut (gain de place). Si le stream reste ouvert au-delà de minuit, le dev peut afficher la date au premier event du jour suivant (« — 23 avril — » comme séparateur). Pas critique v1.

### 4.5 Status code colorisé

Déjà couvert §1.7 (classes Tailwind). Résumé :
- 2xx vert
- 3xx bleu (rare en proxy, mais possible si l'upstream redirige)
- 4xx ambre (pas rouge — les 4xx sont « clients errors » normaux, pas des alertes critiques, réserve le rouge pour 5xx)
- 5xx rouge

Le code numérique reste toujours visible (pas juste la couleur) pour les daltoniens. La couleur est un accent, pas l'info principale.

### 4.6 Reconnexion et `since`

Côté client, on track `lastTs = max(ts des events log reçus)`. En cas de `readableStream.reader.read()` qui reject ou de timeout heartbeat (30s sans ping alors qu'on en attend un toutes les 15s), on coupe le stream et on refetch `/logs/stream?since=<lastTs>` avec les mêmes headers. Pendant la reconnexion, le badge de statut passe en « Reconnexion... » pulsant. Si la reconnexion échoue après 3 tentatives (backoff 1s, 3s, 10s), on bascule en état Erreur avec le message approprié et le bouton « Réessayer » manuel.

---

## 5. Décisions d'arbitrage (tranchées par le lead 2026-04-22)

Les 8 points ouverts du draft initial ont été tranchés :

1. **Détection du kill switch côté UI config** → **(a) endpoint dédié `GET /logs/health`** retenu. Réponse `{"enabled": bool}`, toujours 200 (même quand kill switch off), pas d'auth. Specs.md §10 et §14.12 mis à jour. L'onglet config utilise cet endpoint au chargement de la page pour décider d'afficher le message info « Les logs sont désactivés sur cette instance » ou les toggles actifs.

2. **Auto-submit sur `/logs` si sessionStorage présent** → **oui, auto-submit**. Si l'utilisateur a déjà renseigné blob+clé (F5, ouverture depuis un autre onglet de la même session), on tente la connexion SSE automatiquement avec état « Connexion en cours... » propre (pas de flicker, le formulaire reste visuellement la surface tant que la connexion n'est pas établie). En cas d'échec, retour au formulaire pré-rempli avec message d'erreur. Cf. AC-31.

3. **Ordre des events** → **nouveau en haut** confirmé, cohérent Datadog/Grafana.

4. **Raccourci Esc = déconnexion** → **non v1**. Risque d'interaction avec d'autres modals / focus pour un gain marginal. Bouton « Se déconnecter » suffit. À réévaluer si demande utilisateur réelle.

5. **Date affichée au passage de minuit** → **ne rien faire v1**. Format `HH:MM:SS.mmm` suffit. YAGNI.

6. **Bouton œil pour révéler la clé** → **oui**, cohérent avec page `/`. Input initial en `type="password"`, bouton icône œil qui toggle vers `type="text"`. Placé à droite du champ clé, dans le conteneur de l'input. Cf. AC-33.

7. **Dot vert « Connecté »** en dark mode → **`bg-green-400` en dark**, `bg-green-500` en light. Ajustement trivial à l'intégration.

8. **Format `blobId` affiché** → **8 chars visibles, 16 en `title` attribute**.

**Ajout lead post-arbitrage : identification visuelle du blob connecté**

Une fois le blob déchiffré côté client, l'UI extrait le champ `name` (« Nom de la configuration ») et l'affiche en en-tête de la vue stream au format :

```
<Nom de la configuration> · <blobId 8 chars>
```

avec `title` attribute portant le `blobId` 16 chars complet. Si le blob n'a pas de champ `name` (blob ancien), fallback sur `<blobId 8 chars>` seul. Remplace le titre générique « Stream actif » prévu dans les wireframes initiaux §1.3. Le dev doit ajuster le header de la vue stream en conséquence.

---

## 6. Variantes de copy (suggestions non intégrées)

Le PO a tranché la copy au §14.13. Je flag juste une suggestion que je trouverais plus forte mais qui n'est **pas** intégrée dans les wireframes ci-dessus :

- **Warning detailed** actuel : « Activez uniquement si vous avez besoin d'inspecter les payloads. Le body peut contenir des informations sensibles — n'ouvrez `/logs` que sur un poste de confiance. »
- **Variante suggérée** : « Les payloads peuvent contenir des données sensibles (tokens, emails, payloads métier). Ouvrez `/logs` uniquement sur un poste de confiance et désactivez cette option dès que vous n'en avez plus l'usage. »

Ma variante est plus directe sur le quoi (« tokens, emails »), plus explicite sur l'action à prendre après l'inspection (« désactivez dès que vous n'en avez plus l'usage »). À arbitrer par le PO si pertinent.
