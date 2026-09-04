# Design Document : headers custom multiples

**Feature** : le mode d'auth « Header custom » devient une liste répétable de paires nom/valeur
**Date** : 2026-09-03
**Auteur** : Designer FGP
**Statut** : Draft, en attente de review lead
**Fichiers impactés (intégration dev)** : `src/ui/config-page.tsx`, `src/ui/client/elements.ts`, `src/ui/client/generate.ts`, `src/ui/client/presets.ts`, `src/ui/client/share-config.ts`, `src/ui/client/import-config.ts`, `src/ui/client/test-scope.ts`

> Ce document définit le **pattern « liste répétable »** : conventions d'uid, de focus après suppression, d'annonce et de compteur. Elles sont normatives.
>
> **Périmètre du pattern, mis à jour.** Il ne s'applique plus qu'aux headers custom. La spec `scalingo-addon-mode.md` s'y référait en révision 1, mais l'architecte a tranché l'abandon du multi-base : le mode Scalingo Database API est passé en mono-base (une application, une base), sans liste, sans compteur ni boutons d'ajout et de retrait. Les headers custom restent le seul usage de ce pattern dans le projet.

---

## 1. Contexte et décision

Aujourd'hui :

- `#auth` (select) a 4 options, dont `header:` labellisée « Header custom »
- quand `header:` est sélectionné, `#auth-header-name` (input texte `w-40`) apparaît à droite du select
- la valeur du header est prise dans `#token` (le champ global « Token / Clé API »)
- à la génération, `generate.ts` recompose `auth = "header:" + headerName`

Décision validée avec l'architecte : **une seule entrée dans le select**. « Header custom » devient une liste de 1 à 8 lignes nom/valeur. Une seule ligne reproduit exactement le comportement actuel.

Conséquences directes sur l'UI :

1. `#auth-header-name` **disparaît**. Le select `#auth` reprend toute la largeur.
2. Une nouvelle section `#custom-headers-section` apparaît, positionnée **juste après la section Auth et avant la section Token**.
3. Le champ `#token` n'a plus de sens dans ce mode : sa section entière est masquée (voir section 5).

### 1.1 Dépendance hors périmètre design

Le format `auth` du blob est aujourd'hui une string `header:X-Name`. Supporter N headers implique un changement de modèle côté blob (par exemple `headers:` + tableau, ou un champ dédié). **Ce choix appartient à l'architecte / au dev**, il n'est pas tranché ici. La spec UI ci-dessous est indépendante de l'encodage retenu, sauf pour l'état « importé » (section 6.4) qui suppose que le décodage d'un ancien blob `header:X-Name` reste possible.

---

## 2. Wireframes ASCII

### 2.1 État par défaut, mode « Header custom » sélectionné, une ligne

```
  Mode d'authentification
  ┌──────────────────────────────────────────────────────────┐
  │ Header custom                                          ▾ │
  └──────────────────────────────────────────────────────────┘

  Headers d'authentification            1 / 8   Afficher les valeurs
  ┌────────────────────┐ ┌──────────────────────────────┐ ┌───┐
  │ X-API-Key          │ │ ••••••••••••••••••           │ │ 🗑 │
  └────────────────────┘ └──────────────────────────────┘ └───┘
   Nom du header          Valeur

  + Ajouter un header

  Ces headers sont envoyés tels quels à l'API cible. Les valeurs
  sont chiffrées dans le blob, elles ne sont jamais stockées.
```

Le bouton corbeille de la ligne unique est **désactivé** (au moins un header est requis).

### 2.2 Trois lignes, valeurs masquées

```
  Headers d'authentification            3 / 8   Afficher les valeurs
  ┌────────────────────┐ ┌──────────────────────────────┐ ┌───┐
  │ X-API-Key          │ │ ••••••••••••••••••           │ │ 🗑 │
  └────────────────────┘ └──────────────────────────────┘ └───┘
  ┌────────────────────┐ ┌──────────────────────────────┐ ┌───┐
  │ X-Tenant-Id        │ │ ••••••••                     │ │ 🗑 │
  └────────────────────┘ └──────────────────────────────┘ └───┘
  ┌────────────────────┐ ┌──────────────────────────────┐ ┌───┐
  │ X-Signature        │ │ ••••••••••••••••••••••       │ │ 🗑 │
  └────────────────────┘ └──────────────────────────────┘ └───┘

  + Ajouter un header
```

### 2.3 Limite atteinte

```
  Headers d'authentification            8 / 8   Afficher les valeurs
  ...8 lignes...

  [ + Ajouter un header ]   (grisé, non focusable)
  Maximum de 8 headers atteint.
```

### 2.4 Ligne en erreur

```
  ┌────────────────────┐ ┌──────────────────────────────┐ ┌───┐
  │ X-API Key          │ │ ••••••••••••••••••           │ │ 🗑 │   <- bordure rouge sur le nom
  └────────────────────┘ └──────────────────────────────┘ └───┘
   ⚠ Nom de header invalide : espaces et caractères spéciaux interdits.
```

### 2.5 Empilement mobile (< 640 px)

```
  Headers d'authentification
  1 / 8                        Afficher les valeurs
  ┌──────────────────────────────────────────────┐
  │ X-API-Key                                    │
  └──────────────────────────────────────────────┘
  ┌────────────────────────────────────────┐ ┌───┐
  │ ••••••••••••••••••                     │ │ 🗑 │
  └────────────────────────────────────────┘ └───┘
  ─────────────────────────────────────────────────
  ┌──────────────────────────────────────────────┐
  │ X-Tenant-Id                                  │
  └──────────────────────────────────────────────┘
  ┌────────────────────────────────────────┐ ┌───┐
  │ ••••••••                               │ │ 🗑 │
  └────────────────────────────────────────┘ └───┘
```

Le layout est en `flex flex-wrap`, pas en grid à colonnes fixes : la colonne du formulaire fait environ 570 px entre 1024 et 1280 px de viewport, et 100 % en dessous. Le `flex-wrap` gère les deux cas sans breakpoint dédié, un séparateur horizontal apparaît entre les lignes quand elles s'empilent.

---

## 3. Identifiants HTML

| Élément | Identifiant / attribut | Type |
| --- | --- | --- |
| Section entière | `#custom-headers-section` | `<section>` |
| Fieldset | `#custom-headers-fieldset` | `<fieldset>` |
| Conteneur de lignes | `#custom-headers-list` | `<div>` |
| Ligne | `[data-header-row]` + `data-header-uid="<uid>"` | `<div>` |
| Input nom | `#header-name-<uid>` + `data-header-name` | `<input type="text">` |
| Input valeur | `#header-value-<uid>` + `data-header-value` | `<input type="password">` |
| Bouton supprimer | `[data-header-remove]` | `<button type="button">` |
| Message d'erreur de ligne | `#header-error-<uid>` | `<p>` |
| Bouton ajouter | `#btn-add-header` | `<button type="button">` |
| Compteur | `#custom-headers-count` | `<span>` |
| Toggle visibilité global | `#btn-toggle-header-values` | `<button type="button" aria-pressed>` |
| Région d'annonce | `#custom-headers-status` | `<span class="sr-only" role="status">` |
| Hint bas de section | `#custom-headers-hint` | `<p>` |

`<uid>` est un identifiant stable généré à la création de la ligne (compteur incrémental jamais réutilisé, par exemple `h1`, `h2`, `h3`). **Il ne suit pas la position** : après suppression de la ligne 2, la ligne 3 garde son uid `h3`. Seuls les `aria-label` sont renumérotés selon la position visible (voir section 7.2).

---

## 4. Structure JSX partielle

### 4.1 Select auth simplifié

Le wrapper `<div class="flex gap-2">` disparaît, `#auth-header-name` est supprimé.

```jsx
{/* Auth */}
<section>
  <label
    for="auth"
    class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
  >
    Mode d'authentification
  </label>
  <select
    id="auth"
    name="auth"
    class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-fgp-500 focus:ring-1 focus:ring-fgp-500 outline-none dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
  >
    {AUTH_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
  </select>
</section>
```

### 4.2 Section headers custom

Rendue serveur avec **une ligne initiale** en dur (le JS clone cette ligne pour les suivantes). La section porte `hidden` par défaut, le JS la révèle quand `#auth` vaut `header:`.

```jsx
{/* Headers custom */}
<section id="custom-headers-section" hidden>
  <fieldset id="custom-headers-fieldset">
    {/* legend enfant DIRECT du fieldset, cf. section 8.1 */}
    <legend class="text-sm font-medium text-gray-700 dark:text-gray-300">
      Headers d'authentification
    </legend>
    <div class="mb-2 flex flex-wrap items-baseline justify-end gap-3">
      <div class="flex items-center gap-3">
        <span
          id="custom-headers-count"
          class="text-xs tabular-nums text-gray-500 dark:text-gray-400"
        >
          1 / 8
        </span>
        <button
          type="button"
          id="btn-toggle-header-values"
          aria-pressed="false"
          class="inline-flex items-center gap-1.5 text-xs font-medium text-fgp-600 hover:text-fgp-800 dark:text-fgp-400 dark:hover:text-fgp-200 focus:outline-none focus:underline"
        >
          <svg class="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
            <path
              fill-rule="evenodd"
              d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
              clip-rule="evenodd"
            />
          </svg>
          <span data-toggle-label>Afficher les valeurs</span>
        </button>
      </div>
    </div>

    <div id="custom-headers-list" class="space-y-3">
      {/* Ligne modèle, dupliquée par le client */}
      <div
        data-header-row
        data-header-uid="h1"
        class="flex flex-wrap items-start gap-2 border-t border-gray-100 pt-3 first:border-t-0 first:pt-0 sm:border-t-0 sm:pt-0 dark:border-gray-800"
      >
        <div class="w-full sm:w-44 sm:shrink-0">
          <label for="header-name-h1" class="sr-only">Nom du header 1</label>
          <input
            type="text"
            id="header-name-h1"
            data-header-name
            maxlength={64}
            placeholder="X-API-Key"
            autocomplete="off"
            spellcheck={false}
            class="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-mono focus:border-fgp-500 focus:ring-1 focus:ring-fgp-500 outline-none aria-[invalid=true]:border-red-400 aria-[invalid=true]:focus:border-red-500 aria-[invalid=true]:focus:ring-red-500 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-400 dark:aria-[invalid=true]:border-red-500"
          />
        </div>
        <div class="min-w-[12rem] flex-1">
          <label for="header-value-h1" class="sr-only">Valeur du header 1</label>
          <input
            type="password"
            id="header-value-h1"
            data-header-value
            maxlength={1024}
            placeholder="Valeur du header"
            autocomplete="off"
            data-1p-ignore
            data-lpignore="true"
            spellcheck={false}
            class="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-mono focus:border-fgp-500 focus:ring-1 focus:ring-fgp-500 outline-none aria-[invalid=true]:border-red-400 aria-[invalid=true]:focus:border-red-500 aria-[invalid=true]:focus:ring-red-500 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-400 dark:aria-[invalid=true]:border-red-500"
          />
        </div>
        <button
          type="button"
          data-header-remove
          disabled
          aria-label="Supprimer le header 1"
          title="Au moins un header est requis"
          class="shrink-0 rounded-md p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-fgp-500 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-gray-400 disabled:hover:bg-transparent dark:hover:text-red-400 dark:hover:bg-red-900/30"
        >
          <svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path
              fill-rule="evenodd"
              d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
              clip-rule="evenodd"
            />
          </svg>
        </button>
        {/* Injecté par le JS uniquement en cas d'erreur, en fin de ligne, w-full */}
      </div>
    </div>

    <button
      type="button"
      id="btn-add-header"
      class="mt-3 inline-flex items-center gap-1 text-sm font-medium text-fgp-600 hover:text-fgp-800 dark:text-fgp-400 dark:hover:text-fgp-200 focus:outline-none focus:underline disabled:text-gray-400 disabled:cursor-not-allowed disabled:no-underline dark:disabled:text-gray-500"
    >
      + Ajouter un header
    </button>

    <p id="custom-headers-hint" class="mt-1 text-xs text-gray-500 dark:text-gray-400">
      Ces headers sont envoy&eacute;s tels quels &agrave; l'API cible. Les valeurs sont
      chiffr&eacute;es dans le blob, elles ne sont jamais stock&eacute;es. Maximum 8 headers,
      nom 64 caract&egrave;res, valeur 1024 caract&egrave;res.
    </p>

    <span id="custom-headers-status" class="sr-only" role="status" aria-live="polite"></span>
  </fieldset>
</section>
```

### 4.3 Message d'erreur de ligne (injecté par le JS)

Ajouté en dernier enfant de la ligne, avec `w-full` pour forcer un retour à la ligne dans le `flex-wrap`.

```jsx
<p
  id="header-error-h1"
  class="w-full flex items-start gap-1.5 text-xs text-red-700 dark:text-red-300"
>
  <svg class="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
    <path
      fill-rule="evenodd"
      d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
      clip-rule="evenodd"
    />
  </svg>
  <span>Nom de header invalide : espaces et caract&egrave;res sp&eacute;ciaux interdits.</span>
</p>
```

Quand ce bloc existe, l'input fautif porte `aria-invalid="true"` et `aria-describedby="header-error-<uid>"`. Quand l'erreur est corrigée, le bloc est retiré et les deux attributs aussi.

---

## 5. Neutralisation du champ Token

C'est le point le plus délicat du bloc. Trois contraintes se cumulent : ne pas casser le layout, ne pas perdre le focus clavier, ne pas casser la validation native du formulaire.

### 5.1 Règle

Quand `#auth` vaut `header:` :

1. La `<section>` qui contient `#token` reçoit l'attribut `hidden`. On masque **la section entière**, pas seulement l'input : masquer l'input seul laisserait le label « Token / Clé API » et le hint orphelins.
2. `#token` perd son attribut `required` et sa valeur est vidée (`value = ""`).
3. La section headers, elle, prend la place laissée libre. Comme elle est positionnée **avant** la section token dans le DOM, le flux vertical ne saute pas : le contenu qui suit remonte simplement.

Quand `#auth` repasse sur un autre mode : `required` est restauré sur `#token`, la section token est révélée, la section headers est masquée. Les valeurs saisies dans les lignes sont **conservées en DOM** (on ne détruit pas les lignes) pour qu'un aller-retour dans le select ne perde pas la saisie.

### 5.2 Pourquoi retirer `required`

Un champ `required` invalide à l'intérieur d'un conteneur `hidden` fait échouer `form.reportValidity()` et Chrome loggue `An invalid form control with name='token' is not focusable`. Le formulaire devient **impossible à soumettre**, sans aucun message visible pour l'utilisateur. C'est un blocage fonctionnel total, pas un détail. Le dev doit impérativement retirer `required` en même temps qu'il pose `hidden`.

### 5.3 Gestion du focus

Le changement de mode se produit sur l'événement `change` de `#auth`, donc le focus est sur le select au moment du masquage : dans le cas nominal il n'y a rien à faire.

Cas résiduels à couvrir quand même, parce qu'ils existent (import d'une config, clic sur un preset, restauration depuis l'URL de partage) :

- avant de poser `hidden`, tester `tokenSection.contains(document.activeElement)`
- si vrai, déplacer le focus sur `#auth` (l'élément qui gouverne la visibilité), pas sur le premier input de la liste headers. Sauter directement dans la nouvelle section désoriente : l'utilisateur perd le repère de l'endroit d'où vient le changement
- `hidden` retire l'élément du calcul d'accessibilité et de l'ordre de tabulation, donc aucun piège de focus fantôme une fois cette précaution prise

### 5.4 `hidden` plutôt que `class="hidden"`

Le reste de la page utilise `classList.add("hidden")`. Pour les sections qui contiennent des contrôles de formulaire, **préférer l'attribut `hidden`** : il est repris par les technologies d'assistance sans dépendre du CSS, et il survit si la feuille de style tarde à charger. Les blocs `#logs-feature-off` et `#logs-detailed-warning` utilisent déjà l'attribut `hidden`, le précédent existe donc dans le projet. Il faut juste veiller à ce que Tailwind Preflight n'écrase pas `[hidden]` : ce n'est pas le cas, Preflight ne touche pas à cette règle du user agent, mais une classe utilitaire `display` appliquée en même temps la battrait. Ne pas cumuler `hidden` (attribut) et une classe `flex`/`grid` sur le même élément.

---

## 6. États et comportements

### 6.1 Ajout d'une ligne

- clic sur `#btn-add-header` : clone de la ligne modèle, uid neuf, champs vides, insertion en fin de liste
- le focus va sur le **nouvel input nom** (`#header-name-<uid>`). C'est le seul cas où le déplacement automatique du focus est justifié : l'utilisateur vient d'exprimer l'intention de saisir
- le compteur passe à `n / 8`
- `#custom-headers-status` annonce « Header 3 ajouté. 3 headers sur 8. »
- si `n === 8`, `#btn-add-header` passe `disabled` et `#custom-headers-hint` prend le texte « Maximum de 8 headers atteint. Supprimez une ligne pour en ajouter une autre. »
- dès qu'une ligne existe en plus de la première, **tous** les boutons supprimer redeviennent actifs (`disabled` retiré, `title` retiré)

### 6.2 Suppression d'une ligne

- la ligne est retirée du DOM
- `#custom-headers-status` annonce « Header 2 supprimé. 2 headers sur 8. »
- le compteur et les `aria-label` sont recalculés
- **focus après suppression**, dans cet ordre de priorité :
  1. le bouton supprimer de la ligne qui a pris la place (la ligne suivante)
  2. sinon, le bouton supprimer de la ligne précédente
  3. si la ligne restante est unique, son bouton supprimer est désactivé donc non focusable : le focus va sur `#btn-add-header`
- ne jamais laisser le focus retomber sur `<body>` : le lecteur d'écran repart alors du haut du document et l'utilisateur clavier doit re-tabuler depuis le début

### 6.3 Toggle de visibilité

- `#btn-toggle-header-values` bascule **toutes** les valeurs entre `type="password"` et `type="text"`
- `aria-pressed` passe à `true`, le libellé devient « Masquer les valeurs », l'icône devient l'oeil barré
- l'état n'est **pas** persisté : à chaque chargement de page, les valeurs sont masquées
- ne pas mettre `aria-live` sur ce bouton, `aria-pressed` suffit à annoncer l'état

### 6.4 État « importé »

Quand une config est décodée (`import-config.ts`) ou restaurée depuis une URL de partage (`share-config.ts`), les valeurs de headers ne reviennent pas : la route de décodage renvoie `tokenRedacted`. Le comportement attendu :

- créer une ligne par header présent dans le blob, **nom pré-rempli, valeur vide**
- l'input valeur reçoit `placeholder="Valeur à ressaisir"` au lieu de `Valeur du header`
- `#custom-headers-hint` est complété par une phrase : « Les valeurs ne sont jamais renvoyées par le serveur, ressaisissez-les avant de régénérer. »
- ne pas afficher d'erreur rouge pour autant : c'est un état normal, pas une faute de l'utilisateur

Pour un ancien blob v3 avec `auth = "header:X-Name"`, on crée une ligne unique nommée `X-Name`. Rétro-compatibilité assurée sans cas particulier dans l'UI.

### 6.5 Preset et réinitialisation

`presets.ts` remplace ses appels `authHeaderName.classList.add("hidden")` par un appel à la fonction de synchronisation de visibilité du mode auth. Le bouton « Réinitialiser » (`#btn-preset-clear`) doit en plus :

- vider toutes les lignes headers sauf la première
- vider la première ligne (nom et valeur)
- remettre le compteur à `1 / 8`, réactiver `#btn-add-header`, remettre le toggle sur « Afficher les valeurs »

---

## 7. Validation

### 7.1 Règles

| Champ | Règle | Message |
| --- | --- | --- |
| Nom | non vide | `Nom de header requis.` |
| Nom | 64 caractères max (`maxlength` natif) | bloqué à la saisie, pas de message |
| Nom | `^[A-Za-z0-9!#$%&'*+.^_\`\|~-]+$` (token RFC 7230) | `Nom de header invalide : espaces et caractères spéciaux interdits.` |
| Nom | pas de doublon dans la liste, comparaison insensible à la casse | `Ce header est déjà défini (ligne 2).` |
| Nom | pas dans la liste réservée | `Header réservé, il ne peut pas être surchargé.` |
| Valeur | non vide | `Valeur requise.` |
| Valeur | 1024 caractères max (`maxlength` natif) | bloqué à la saisie, pas de message |
| Valeur | pas de `\r` ni `\n` | `La valeur ne peut pas contenir de saut de ligne.` |

Liste réservée (comparaison en minuscules) : `x-fgp-key`, `x-fgp-blob`, `x-fgp-source`, `host`, `content-length`, `connection`, `transfer-encoding`, `upgrade`, `te`, `trailer`, `keep-alive`, `proxy-authorization`. `authorization` reste **autorisé** : c'est un usage légitime du mode header custom.

### 7.2 Moment de la validation

- validation d'une ligne au `blur` de ses inputs, pas au `input` : afficher une erreur pendant que l'utilisateur tape encore un nom de header est agressif et bruyant pour les lecteurs d'écran
- validation complète au submit. Si au moins une ligne est en erreur, on bloque la génération, on marque toutes les lignes fautives, et on met le focus sur le **premier** input invalide
- le compteur de doublons se recalcule sur toute la liste à chaque `blur` : corriger la ligne 2 doit lever l'erreur affichée sur la ligne 5

### 7.3 Contraste des états d'erreur

- texte d'erreur : `text-red-700` sur fond clair (ratio 6,5:1 sur `#ffffff`), `dark:text-red-300` sur `gray-900` (ratio 7,4:1). Ce sont les teintes déjà utilisées par `#error-banner`, on ne descend pas à `text-red-600` qui passe tout juste en clair et échoue sur certains fonds gris
- bordure d'erreur : `border-red-400` en clair, `dark:border-red-500`. La bordure seule ne porte pas l'information (critère 1.4.1) : elle est toujours doublée du message texte et de `aria-invalid`
- l'icône triangle est `aria-hidden="true"`, l'information est dans le texte

---

## 8. Notes a11y

### 8.1 Structure sémantique

- la section est un `<fieldset>` avec `<legend>` : c'est un groupe de contrôles liés, le `<legend>` est annoncé en préfixe de chaque champ du groupe par la plupart des lecteurs d'écran
- **Le `<legend>` doit rester enfant direct du `<fieldset>`.** L'envelopper dans un `<div>` pour l'aligner en flex avec le compteur et le toggle casse la sémantique du groupe dans plusieurs navigateurs, et le `<legend>` cesse d'être annoncé. C'est pour cela que le JSX de la section 4.2 sort le `<legend>` et met le couple compteur / toggle dans un `<div>` frère aligné à droite (`justify-end`), légèrement sous la légende plutôt que sur la même ligne. Le décalage visuel d'une demi-ligne est le prix de la sémantique correcte, il est acceptable
- si le lead tient absolument à l'alignement sur une seule ligne, l'alternative valide est `<legend class="sr-only">` + un titre visuel `<p aria-hidden="true">` dans le flex. Elle duplique le texte, je ne la recommande pas
- chaque input a un `<label class="sr-only">` associé par `for`. Les en-têtes de colonne visuels ne sont pas nécessaires : les placeholders et les libellés masqués suffisent, et deux colonnes seulement ne justifient pas une ligne d'en-tête supplémentaire

### 8.2 Libellés numérotés

Les `aria-label` et les `<label class="sr-only">` portent le numéro de **position visible** :

- « Nom du header 1 », « Valeur du header 1 », « Supprimer le header 1 »
- après suppression ou ajout, une fonction `renumber()` réécrit ces trois libellés pour toutes les lignes, en repartant de 1
- le libellé du bouton supprimer est enrichi quand le nom est renseigné : `Supprimer le header 2, X-Tenant-Id`. Le simple « Supprimer » répété huit fois est inutilisable en navigation par liste de boutons

### 8.3 Annonces de changement d'état

- **une seule** région live, `#custom-headers-status`, `class="sr-only"`, `role="status"` + `aria-live="polite"`
- ne **pas** poser `aria-live` sur `#custom-headers-list` : chaque ajout ou suppression de ligne y déclencherait l'annonce de tout le contenu inséré, y compris les libellés des trois contrôles, ce qui est verbeux et se cumule avec l'annonce du focus déplacé
- messages : « Header 3 ajouté. 3 headers sur 8. » / « Header 2 supprimé. 2 headers sur 8. » / « Maximum de 8 headers atteint. »
- vider la région après 3 secondes n'est pas nécessaire avec `polite`, mais réécrire le même texte deux fois de suite n'est pas annoncé : si le message est identique, ajouter un caractère invisible ou repasser par une chaîne vide avant

### 8.4 Ordre de tabulation

Ordre naturel du DOM, aucune manipulation de `tabindex` :

```
#auth
  → [ligne 1] nom → valeur → supprimer
  → [ligne 2] nom → valeur → supprimer
  → ...
  → #btn-add-header
  → (champ suivant du formulaire)
```

Le toggle `#btn-toggle-header-values` se situe **avant** la première ligne dans le DOM (il est dans l'en-tête de section), donc avant les lignes dans l'ordre de tabulation. C'est cohérent : c'est un réglage de la liste entière.

Aucun `tabindex` positif nulle part. Les boutons désactivés (`disabled`) sortent d'eux-mêmes du parcours.

### 8.5 Gestionnaires de mots de passe

Huit champs `type="password"` empilés déclenchent systématiquement l'overlay de 1Password, Bitwarden ou du gestionnaire natif du navigateur, qui vient recouvrir les boutons de suppression. Mitigation à appliquer sur chaque input valeur :

- `autocomplete="off"` (déjà présent sur le `<form>`, mais les navigateurs l'ignorent sur les champs mot de passe, il faut le répéter au niveau du champ)
- `data-1p-ignore` (1Password)
- `data-lpignore="true"` (LastPass)

Ne **pas** contourner le problème avec un `type="text"` masqué en CSS (`-webkit-text-security` ou une police à points) : c'est non standard, non supporté par Firefox, et cela expose la valeur en clair dans les captures d'écran d'assistance et dans le copier-coller de certains lecteurs d'écran.

---

## 9. Points tranchés

| Point | Décision | Justification |
| --- | --- | --- |
| Toggle de visibilité par ligne ou global | **Global** | Huit lignes fois un bouton oeil, c'est huit arrêts de tabulation supplémentaires entre chaque valeur et le bouton supprimer. Le cas d'usage réel est « je vérifie ce que j'ai collé », qui est global. Le contre-argument (révéler tout par accident) est faible : c'est l'écran de l'utilisateur, avec ses propres secrets |
| État vide (zéro ligne) | **N'existe pas** | Le mode header custom sans header n'a pas de sens. La dernière ligne n'est pas supprimable, son bouton est `disabled` avec un `title` explicatif. Cela supprime un état entier de l'interface et le code de l'empty state qui va avec |
| Bouton ajouter à la limite | **`disabled` réel** | Le pattern `aria-disabled` + no-op garde le bouton focusable pour expliquer pourquoi il ne répond pas, mais crée un contrôle qui accepte le focus et ne fait rien, ce qui déroute autant. L'explication passe par le compteur `8 / 8` et le hint réécrit, tous deux lisibles avant d'atteindre le bouton |
| Position de la section | **Avant la section Token** | La section headers remplace fonctionnellement la section token. La placer avant évite un trou visuel puis un remplissage plus bas, et garde un ordre de lecture « mode d'auth, puis credentials » |
| Suppression de `#auth-header-name` | **Oui** | Le garder masqué pour la rétro-compatibilité du code client créerait deux sources de vérité pour le nom du header. Les cinq fichiers client qui le référencent sont listés en en-tête |

---

## 10. Ce que je signale au lead

1. **Le changement de format du blob n'est pas tranché.** L'UI est prête pour N headers, mais si l'encodage retenu ne supporte qu'une chaîne `header:X-Name`, cette spec n'est pas intégrable. À valider avant que le dev commence.
2. **`required` sur `#token`.** Si le dev pose `hidden` sans retirer `required`, le formulaire devient non soumettable de façon silencieuse dans les modes autres que header custom aussi, dès qu'un aller-retour a eu lieu. C'est le bug le plus probable de ce lot, à mettre dans les tests.
3. **Le `<legend>` reste enfant direct du `<fieldset>`** (section 8.1). Conséquence visuelle : le compteur et le toggle sont sur la ligne suivante, alignés à droite, pas sur la même ligne que le titre. Si ce décalage gêne, la seule alternative propre duplique le texte du titre, à arbitrer.
4. **Le wireframe de la section 2 montre le compteur et le toggle sur la même ligne que le titre.** C'est la version idéale, pas la version intégrable. Le JSX de la section 4.2 fait foi.
