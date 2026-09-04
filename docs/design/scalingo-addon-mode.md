# Design Document : mode d'auth « Scalingo Database API »

**Feature** : mode d'authentification pour la Database API de Scalingo, avec sélecteur de région, chargement dynamique des bases de données d'une application, et preset dédié
**Date** : 2026-09-03
**Auteur** : Designer FGP
**Statut** : Révision 2, mono-base
**Fichiers impactés (intégration dev)** : `src/ui/config-page.tsx`, `src/ui/client/addons.ts`, `src/ui/client/elements.ts`, `src/ui/client/presets.ts`, `src/ui/client/generate.ts`, `src/ui/client/share-config.ts`

---

## Révision 2 : ce qui change et pourquoi

L'architecte a tranché l'abandon du multi-addon après le veto argumenté du testeur : la documentation Scalingo est contradictoire sur la résolution d'une base à partir du chemin de la requête, et nos tests ne pouvaient vérifier que la conformité du code à une hypothèse, pas la conformité à l'API réelle. **On livre le mono-base.**

| Révision 1 | Révision 2 |
| --- | --- |
| Liste répétable de 1 à 10 couples app / base, puis 5 avec avertissement au-delà de 3 | **Une application, une base.** Plus de liste, plus de compteur, plus de boutons ajouter et retirer, plus de limite ni d'avertissement |
| `resourceId` transporté dans l'`<option>` puis dans le blob | **Plus de `resourceId` dans le blob.** Un seul identifiant de base, `addonId`. Le `resourceId` sert uniquement de libellé lisible et ne quitte jamais le navigateur |
| Réponse supposée `{id, name, plan, type}` | Réponse réelle `{id, resourceId, provider, plan}` |
| Scope de départ `GET:/api/databases/*` supposé | **Confirmé** par le lead, tous les endpoints de la Database API partagent ce préfixe |
| Libellés « Scalingo exchange » et « Scalingo + addon token » | **« Scalingo API »** et **« Scalingo Database API »** |
| Deux `<fieldset>` (région, bases) | **Un seul `<fieldset>`**, voir section 2 |

Le **pattern « liste répétable »** posé dans `custom-headers-multi.md` ne s'applique plus ici. Il reste normatif pour les headers custom, qui restent multiples.

Ce qui ne change pas : le sélecteur de région, le bouton de chargement des bases, le preset « Scalingo DB », et l'intégralité des états d'erreur de chargement.

---

## 1. Contexte

La Database API de Scalingo (`https://db-api.<region>.scalingo.com`) s'authentifie avec un token propre à une base de données, obtenu en trois temps depuis l'API de compte (`https://api.<region>.scalingo.com`). L'utilisateur devait aller chercher l'identifiant de la base à la main dans le dashboard ou via la CLI. C'est le point de friction que ce bloc supprime.

Entrées dans `AUTH_MODES` :

```ts
{ label: "Scalingo API", value: "scalingo-exchange" },
{ label: "Scalingo Database API", value: "scalingo-addon" },
```

Les deux libellés ont été arbitrés depuis ma rédaction de révision 1, qui signalait que « Scalingo exchange » et « Scalingo + addon token » se ressemblaient trop pour qui ne connaît pas la différence. Point clos.

---

## 2. Faut-il encore une section à part entière ?

Question posée par le lead. **Oui, mais une seule, au lieu des deux `<fieldset>` de la révision 1.**

### Pourquoi pas une dissolution en champs libres

Faire de la région, de l'application et de la base « trois champs de plus sous le sélecteur de mode » serait une erreur pour deux raisons.

La première est l'**apparition conditionnelle**. Ces contrôles ne sont visibles que dans un mode d'auth sur cinq. Trois champs qui se matérialisent isolément au milieu d'un formulaire linéaire, entre « Mode d'authentification » et « Token », se lisent comme un glitch : rien ne signale qu'ils forment un tout et qu'ils sont apparus ensemble. Un bloc qui apparaît est parsé comme un bloc. Trois champs qui apparaissent sont parsés comme un formulaire qui a changé de forme.

La seconde est l'**interdépendance forte**. La région détermine l'API interrogée et invalide la base déjà chargée. L'application détermine la liste des bases. La base dépend des deux. Ce sont trois contrôles dont deux pilotent le troisième, ce qui est la définition même d'un groupe de champs liés, donc d'un `<fieldset>`. Un lecteur d'écran qui annonce « Base de données Scalingo, région, osc-fr1 » donne le contexte gratuitement, là où trois champs plats obligent l'utilisateur à le reconstruire.

### Pourquoi un seul fieldset au lieu de deux

En révision 1, la région et la liste de couples étaient deux préoccupations distinctes parce que la liste pouvait contenir dix lignes et vivait sa propre vie. Avec une seule base, ce n'est plus vrai : région, application et base forment une seule question, « quelle base de données ». Deux `<legend>` pour trois contrôles, dont un `<legend>` « Bases de données autorisées » qui coifferait un unique `<select>`, sur-structure le formulaire et fait préfixer chaque champ d'un intitulé de groupe redondant.

**Décision : un `<section id="scalingo-addon-section">`, un `<fieldset>`, un `<legend>` « Base de données Scalingo ».** Le sous-groupe de radios de région garde son `role="radiogroup"` avec un label visible associé par `aria-labelledby`, ce qui évite un `<fieldset>` imbriqué tout en gardant un nom accessible correct.

C'est une section, mais la plus légère possible : elle a perdu un `<legend>`, un compteur, deux boutons et un bloc d'avertissement par rapport à la révision 1.

---

## 3. Wireframes ASCII

### 3.1 État par défaut, mode sélectionné, rien de chargé

```
  Mode d'authentification
  ┌──────────────────────────────────────────────────────────┐
  │ Scalingo Database API                                  ▾ │
  └──────────────────────────────────────────────────────────┘

  ┌─ Base de données Scalingo ───────────────────────────────┐
  │                                                          │
  │  Région                                                  │
  │  ┌──────────┐ ┌────────────────┐                         │
  │  │ osc-fr1  │ │ osc-secnum-fr1 │                         │
  │  └──────────┘ └────────────────┘                         │
  │  Détermine l'API interrogée : https://api.osc-fr1…       │
  │  Cible attendue : https://db-api.osc-fr1.scalingo.com    │
  │                                                          │
  │  Application                            Base de données  │
  │  ┌────────────────────┐ ┌─────────┐ ┌──────────────────┐ │
  │  │ mon-app            │ │ Charger │ │ Choisissez…    ▾ │ │
  │  └────────────────────┘ └─────────┘ └──────────────────┘ │
  │                                                          │
  │  FGP échange votre token de compte contre un bearer,     │
  │  puis obtient un token de base valable 1 heure.          │
  └──────────────────────────────────────────────────────────┘
```

Le select est désactivé tant que rien n'est chargé. Plus aucun bouton d'ajout ni de retrait.

### 3.2 Chargement en cours

```
  ┌────────────────────┐ ┌────────────┐ ┌──────────────────┐
  │ mon-app            │ │ Chargement…│ │ Choisissez…    ▾ │
  └────────────────────┘ └────────────┘ └──────────────────┘
   Chargement des bases de données...
```

### 3.3 Succès, plusieurs bases

```
  ┌────────────────────┐ ┌─────────┐ ┌────────────────────────┐
  │ mon-app            │ │ Charger │ │ mon-db-123 · PostgreSQL│
  └────────────────────┘ └─────────┘ └────────────────────────┘
   ✓ 3 bases de données trouvées.
```

### 3.4 Succès, base unique

```
  ┌────────────────────┐ ┌─────────┐ ┌────────────────────────┐
  │ mon-app            │ │ Charger │ │ mon-db-123 · PostgreSQL│
  └────────────────────┘ └─────────┘ └────────────────────────┘
   ✓ 1 base de données trouvée, sélectionnée automatiquement.
```

### 3.5 Aucune base sur l'application

```
  ┌────────────────────┐ ┌─────────┐ ┌──────────────────┐
  │ mon-app-statique   │ │ Charger │ │ Choisissez…    ▾ │
  └────────────────────┘ └─────────┘ └──────────────────┘
   Cette application n'a aucune base de données.
```

Select désactivé, message en ambre. Ce n'est pas une faute de l'utilisateur.

### 3.6 Erreur de chargement

```
  ┌────────────────────┐ ┌───────────┐ ┌──────────────────┐
  │ mon-aap            │ │ Réessayer │ │ Choisissez…    ▾ │
  └────────────────────┘ └───────────┘ └──────────────────┘
   ⚠ Impossible de récupérer les bases de données. Vérifiez le
     nom de l'application, il est sensible à la casse.
```

### 3.7 Cible incohérente avec le mode

```
  URL cible de l'API
  ┌──────────────────────────────────────────────────────────┐
  │ https://api.osc-fr1.scalingo.com                         │
  └──────────────────────────────────────────────────────────┘
  ...
  ⚠ Cette cible ne ressemble pas à une Database API Scalingo.
    Vérifiez l'URL cible.
```

Avertissement ambre non bloquant sous le bloc région, déclenché quand `#target` ne commence pas par `https://db-api.`. Il rattrape le cas où l'utilisateur choisit le mode Database API mais garde la cible de l'API de compte, qui produirait un blob qui échoue au premier appel.

### 3.8 Empilement mobile

```
  ┌─ Base de données Scalingo ─────────────┐
  │  Région                                │
  │  ┌──────────┐ ┌────────────────┐       │
  │  │ osc-fr1  │ │ osc-secnum-fr1 │       │
  │  └──────────┘ └────────────────┘       │
  │  Détermine l'API interrogée : …        │
  │                                        │
  │  ┌────────────────────────────────┐    │
  │  │ mon-app                        │    │
  │  └────────────────────────────────┘    │
  │  ┌─────────┐                           │
  │  │ Charger │                           │
  │  └─────────┘                           │
  │  ┌────────────────────────────────┐    │
  │  │ Choisissez une base…         ▾ │    │
  │  └────────────────────────────────┘    │
  └────────────────────────────────────────┘
```

`flex flex-wrap` avec `min-w-[12rem]` sur les deux champs larges, aucun breakpoint dédié. Le bouton « Charger » ne se retrouve jamais seul sur une ligne parce qu'il est dans un sous-groupe `flex gap-2 min-w-[14rem] flex-1` avec l'input application.

### 3.9 Section preset

```
  Preset
  ┌──────────┐ ┌───────────────┐
  │ Scalingo │ │ Scalingo DB   │        Réinitialiser
  └──────────┘ └───────────────┘
  Pré-remplit le formulaire. « Scalingo » cible l'API de compte
  (apps, déploiements), « Scalingo DB » cible la Database API.
```

---

## 4. Identifiants HTML

Les identifiants perdent le suffixe d'uid, qui n'a plus d'objet sans liste.

| Élément | Identifiant / attribut | Type |
| --- | --- | --- |
| Section entière | `#scalingo-addon-section` | `<section hidden>` |
| Fieldset unique | `#scalingo-addon-fieldset` + `data-addon-state` | `<fieldset>` |
| Label visible du groupe région | `#addon-region-label` | `<span>` |
| Radiogroup région | `[role="radiogroup"]` + `aria-labelledby="addon-region-label"` | `<div>` |
| Radios | `name="addon-region"`, valeurs `osc-fr1` / `osc-secnum-fr1` | `<input type="radio">` |
| URL résolues | `#addon-region-urls` | `<p role="status">` |
| Avertissement de cible | `#addon-target-warning` | `<p hidden>` |
| Input application | `#addon-app` | `<input type="text" list="addon-apps-datalist">` |
| Datalist des apps connues | `#addon-apps-datalist` | `<datalist>` |
| Bouton charger | `#btn-addon-load` | `<button type="button">` |
| Select base de données | `#addon-select` | `<select>` |
| Statut | `#addon-status` | `<p role="status">` |
| Hint | `#addon-hint` | `<p>` |
| Preset | `#btn-preset-scalingo-db` | `<button type="button">` |

**Supprimés par rapport à la révision 1** : `#addons-list`, `#addons-count`, `#btn-add-addon`, `#addons-warning`, `#addons-status`, `#addons-fieldset`, `#addon-region-fieldset`, et les attributs `data-addon-row`, `data-addon-uid`, `data-addon-remove`, `data-addon-resource-id`.

`data-addon-state` migre de la ligne vers `#scalingo-addon-fieldset`. Il reste le point d'accroche unique pour le CSS et les tests.

---

## 5. Structure JSX

```jsx
{/* Scalingo Database API */}
<section id="scalingo-addon-section" hidden>
  <fieldset id="scalingo-addon-fieldset" data-addon-state="idle">
    <legend class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
      Base de donn&eacute;es Scalingo
    </legend>

    <span
      id="addon-region-label"
      class="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1"
    >
      R&eacute;gion
    </span>
    <div class="flex flex-wrap gap-2" role="radiogroup" aria-labelledby="addon-region-label">
      {SCALINGO_REGIONS.map((region) => (
        <label
          key={region.value}
          class="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm cursor-pointer hover:border-fgp-500 has-[:checked]:bg-fgp-600 has-[:checked]:text-white has-[:checked]:border-fgp-600 transition-colors dark:border-gray-600 dark:text-gray-300 dark:hover:border-fgp-400"
        >
          <input
            type="radio"
            name="addon-region"
            value={region.value}
            checked={region.value === "osc-fr1"}
            class="sr-only"
          />
          {region.label}
        </label>
      ))}
    </div>

    <p
      id="addon-region-urls"
      class="mt-2 text-xs text-gray-500 dark:text-gray-400"
      role="status"
      aria-live="polite"
    >
      D&eacute;termine l'API interrog&eacute;e :{" "}
      <code class="font-mono">https://api.osc-fr1.scalingo.com</code>. Cible attendue pour la
      Database API : <code class="font-mono">https://db-api.osc-fr1.scalingo.com</code>
    </p>
    <p
      id="addon-target-warning"
      hidden
      class="mt-2 text-xs text-amber-700 dark:text-amber-300"
    >
      Cette cible ne ressemble pas &agrave; une Database API Scalingo. V&eacute;rifiez l'URL
      cible.
    </p>

    <div class="mt-4 flex flex-wrap items-start gap-2">
      <div class="flex min-w-[14rem] flex-1 gap-2">
        <div class="min-w-0 flex-1">
          <label
            for="addon-app"
            class="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Application
          </label>
          <input
            type="text"
            id="addon-app"
            list="addon-apps-datalist"
            maxlength={64}
            placeholder="mon-app"
            autocomplete="off"
            spellcheck={false}
            aria-describedby="addon-status addon-hint"
            class={FIELD_CLASS}
          />
        </div>
        <button
          type="button"
          id="btn-addon-load"
          class="mt-[1.375rem] shrink-0 rounded-md bg-fgp-600 px-3 py-2 text-sm font-medium text-white hover:bg-fgp-700 focus:outline-none focus:ring-2 focus:ring-fgp-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:cursor-not-allowed dark:focus:ring-offset-gray-900"
        >
          Charger
        </button>
      </div>

      <div class="min-w-[12rem] flex-1">
        <label
          for="addon-select"
          class="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1"
        >
          Base de donn&eacute;es
        </label>
        <select
          id="addon-select"
          disabled
          class="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-fgp-500 focus:ring-1 focus:ring-fgp-500 outline-none disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 dark:disabled:bg-gray-800/50 dark:disabled:text-gray-500"
        >
          <option value="">Choisissez une base de donn&eacute;es</option>
        </select>
      </div>
    </div>

    <datalist id="addon-apps-datalist"></datalist>

    <p
      id="addon-status"
      class="mt-2 text-xs text-gray-500 dark:text-gray-400"
      role="status"
      aria-live="polite"
    >
    </p>

    <p id="addon-hint" class="mt-1 text-xs text-gray-500 dark:text-gray-400">
      FGP &eacute;change votre token de compte contre un bearer, puis obtient un token de base de
      donn&eacute;es valable 1 heure, renouvel&eacute; automatiquement. Le consommateur de l'URL ne
      voit ni l'un ni l'autre. Une requ&ecirc;te qui ne vise pas cette base est refus&eacute;e.
      Suggestions d'applications disponibles si vous avez d&eacute;j&agrave; charg&eacute; la liste
      des applications.
    </p>
  </fieldset>
</section>
```

Deux points d'attention pour le dev.

Les labels « Application » et « Base de données » deviennent **visibles**, alors qu'ils étaient en `sr-only` dans la version liste. Avec une ligne unique, il n'y a plus de répétition à éviter et le placeholder seul ne suffit pas : un placeholder disparaît à la saisie, ce qui laisse un champ sans intitulé permanent. Conséquence de mise en page, le bouton « Charger » doit être décalé vers le bas pour rester aligné sur les champs, d'où le `mt-[1.375rem]` qui compense la hauteur du label plus sa marge.

Le `<p id="addon-status">` est **toujours monté**, vide par défaut. Une région live insérée dans le DOM au moment où elle reçoit son texte n'est pas annoncée de façon fiable.

### 5.1 Preset « Scalingo DB »

Ce que fait `#btn-preset-scalingo-db` :

| Champ | Valeur |
| --- | --- |
| `#target` | `https://db-api.osc-fr1.scalingo.com` |
| `#auth` | `scalingo-addon` |
| radio `addon-region` | `osc-fr1` |
| `#addon-app`, `#addon-select` | vides, état `idle` |
| `#scopes` | `GET:/api/databases/*` |
| `#token` placeholder | `tk-us-...` |
| `#btn-load-apps` | masqué, il appartient au mode `scalingo-exchange` |

Le scope `GET:/api/databases/*` est **confirmé** par le lead : tous les endpoints de la Database API partagent ce préfixe. Il couvre donc la totalité de la surface en lecture, ce qui est le bon défaut pour un preset.

---

## 6. États de chargement

`data-addon-state` sur `#scalingo-addon-fieldset` porte l'état courant.

| État | `data-addon-state` | Bouton | Select | Statut |
| --- | --- | --- | --- | --- |
| Vierge | `idle` | « Charger » | `disabled`, option « Choisissez une base de données » | vide |
| Chargement | `loading` | « Chargement… », `aria-disabled` | `disabled` | `Chargement des bases de données...`, gris |
| Succès | `loaded` | « Charger » | activé, options peuplées | `3 bases de données trouvées.`, vert |
| Succès unique | `loaded` | « Charger » | activé, option présélectionnée | `1 base de données trouvée, sélectionnée automatiquement.`, vert |
| Aucune base | `empty` | « Charger » | `disabled` | `Cette application n'a aucune base de données.`, ambre |
| Token refusé | `error` | « Réessayer » | `disabled` | `Token refusé par Scalingo. Vérifiez votre token de compte.`, rouge |
| Autre erreur | `error` | « Réessayer » | `disabled` | `Impossible de récupérer les bases de données. Vérifiez le nom de l'application, il est sensible à la casse.`, rouge |

Classes de statut, toutes déjà employées ailleurs dans la page, aucune couleur nouvelle :

- gris `text-xs text-gray-500 dark:text-gray-400`
- vert `text-xs text-green-700 dark:text-green-300`
- ambre `text-xs text-amber-700 dark:text-amber-300`
- rouge `text-xs text-red-700 dark:text-red-300`

### 6.1 Règles de transition

Le bouton charger est inopérant tant que `#token` ou `#addon-app` est vide, avec un message de statut explicite plutôt qu'un bouton mort et silencieux : « Renseignez d'abord une application. » ou « Renseignez votre token Scalingo et le nom de l'application. »

Modifier `#addon-app` depuis un état autre que `idle` ramène à `idle` : le select est vidé et redésactivé, le statut est effacé, `aria-invalid` est retiré. Laisser sélectionnée une base qui appartient à une autre application est le pire bug possible ici, il produit un blob silencieusement faux.

Changer de région ramène également à `idle`, pour la même raison : les identifiants de bases ne sont pas valides d'une région à l'autre. Annoncer dans `#addon-status` : « Région modifiée, la base chargée a été réinitialisée. »

### 6.2 « Application introuvable » n'est pas distinguable aujourd'hui

La route `POST /api/list-addons` expose trois familles d'erreurs : `invalid_body` en 400, `token_exchange_failed` en 401, `upstream_unreachable` et `upstream_list_addons_failed` en 502. **Aucun code ne distingue une application inexistante d'une panne amont.** L'état `not-found` que je décrivais en révision 1 n'est donc pas implémentable en l'état.

Deux conséquences.

À court terme, le message générique doit rester **actionnable** : « Impossible de récupérer les bases de données. Vérifiez le nom de l'application, il est sensible à la casse. » Il couvre le cas majoritaire (faute de frappe) sans mentir sur les autres. C'est ce qui est spécifié en section 6.

À moyen terme, je recommande d'ajouter un code `app_not_found` à `ListAddonsError404Schema` quand Scalingo renvoie un 404 sur l'application. L'UI pourrait alors poser `aria-invalid` sur `#addon-app`, y renvoyer le focus, et afficher un message exact. C'est une décision architecte, hors de mon périmètre, mais c'est le seul écart restant entre la spec et ce qui est atteignable.

### 6.3 Libellé des options

`option.value = addon.id`, **et rien d'autre**. C'est le seul identifiant qui part dans le blob.

Le texte de l'option est `resourceId · provider`, par exemple `mon-db-123 · PostgreSQL`.

Le `resourceId` vient en premier parce que c'est le nom que l'utilisateur voit dans son dashboard Scalingo : c'est la clé de correspondance mentale entre l'écran FGP et l'écran Scalingo. Le `provider` le suit parce qu'il départage une application qui aurait à la fois une PostgreSQL et une Redis. Le `plan` est volontairement exclu du libellé : il parle de taille et de facturation, pas d'identité, et il alourdit une option déjà longue. Il ne sert qu'à départager une collision, avec les 6 derniers caractères de l'`id` en dernier recours.

Repli défensif si `resourceId` est vide malgré le schéma : `provider`, puis `id`.

Le `provider` et le `plan` sont marqués `display-only and never stored in a blob` dans le schéma OpenAPI. Le `resourceId` rejoint désormais cette catégorie : il est affiché, il n'est jamais stocké.

### 6.4 Datalist des applications

Si l'utilisateur a déjà utilisé « Charger les apps » dans la même session, la liste est en mémoire côté client. La réemployer pour peupler `#addon-apps-datalist` supprime la majorité des fautes de frappe, ce qui compense en partie l'absence de code `app_not_found`.

Une `<datalist>` reste une suggestion, l'input accepte toute saisie libre. Ne pas la transformer en `<select>` : le mode doit rester utilisable sans avoir chargé la liste des applications au préalable. Le support lecteur d'écran de `<datalist>` étant inégal, `#addon-hint` mentionne explicitement la disponibilité des suggestions et est référencé par `aria-describedby`.

---

## 7. Validation au submit

- `#addon-app` non vide et `#addon-select` renseigné, sinon la génération est bloquée
- messages : « Renseignez le nom de l'application. » et « Sélectionnez une base de données. »
- `aria-invalid="true"` sur le champ manquant, focus sur ce champ
- `#token` reste requis dans ce mode, il porte le token de compte Scalingo
- l'avertissement de cible (`#addon-target-warning`) est **non bloquant** : il signale une incohérence probable, il ne présume pas d'une erreur. Un utilisateur qui pointe une instance Scalingo non standard doit pouvoir passer

La disparition de la liste supprime au passage deux règles de la révision 1 : plus de contrôle de doublon de couple, plus de gestion de lignes partiellement remplies.

---

## 8. Notes a11y

### 8.1 Structure

Un `<fieldset>` unique, `<legend>` enfant direct. Le groupe de radios de région est un `<div role="radiogroup">` nommé par `aria-labelledby="addon-region-label"`, pas un `<fieldset>` imbriqué : deux niveaux de fieldset pour trois contrôles feraient annoncer « Base de données Scalingo, Région, osc-fr1 » à chaque radio, ce qui est verbeux sans rien apporter.

Le `aria-labelledby` pointe sur le texte visible « Région », donc le nom accessible et le texte affiché coïncident, critère 2.5.3.

### 8.2 Régions live

Deux régions, aucune de niveau liste puisqu'il n'y a plus de liste.

`#addon-status` porte le résultat du chargement et les erreurs de validation. Il est monté en permanence, `role="status"` plus `aria-live="polite"`, et référencé par `aria-describedby` depuis `#addon-app` pour qu'un retour sur le champ permette de réentendre le statut.

`#addon-region-urls` annonce le changement d'URL résolue au changement de région.

Un même message réécrit deux fois de suite n'est pas annoncé. Le contournement déjà en place côté dev, l'ajout d'un caractère invisible quand le texte est identique au précédent, est le bon réflexe et doit être conservé.

### 8.3 Ordre de tabulation

```
#auth
  → radiogroup région        (un seul arrêt, les flèches changent la valeur)
  → #addon-app
  → #btn-addon-load
  → #addon-select
  → #token
```

Quatre arrêts au lieu de quatre par ligne fois N. **La simplification ne casse rien** : l'ordre du DOM est l'ordre logique, le bouton « Charger » reste entre l'input application et le select, ce qui suit l'enchaînement « je saisis, je charge, je choisis ». Aucun `tabindex` nulle part.

Le point de vigilance de la révision 1 sur le nombre d'arrêts de tabulation disparaît entièrement avec le mono-base.

### 8.4 Focus pendant le chargement

Le bouton passe en `aria-disabled="true"` et non `disabled` pendant la requête, et le `<fieldset>` porte `aria-busy="true"`. Un `disabled` réel ferait perdre le focus au navigateur au moment précis où le résultat va être annoncé, et le message de `#addon-status` serait lu hors contexte.

C'est l'exception à la règle posée pour les boutons d'ajout dans `custom-headers-multi.md` : ici l'état bloquant est transitoire et le focus doit survivre, là il est durable et le `disabled` réel est correct.

À la fin du chargement, le statut se remplit et est annoncé en `polite`, sans déplacer le focus. Seules les erreurs de validation au submit déplacent le focus, vers le champ fautif.

### 8.5 Libellés

Les libellés perdent leur numérotation, qui n'avait de sens qu'en liste. « Application », « Base de données », « Charger ». Le bouton « Charger » garde un `aria-label` enrichi du nom saisi quand il y en a un, « Charger les bases de données de mon-app », parce qu'un bouton nommé « Charger » seul reste ambigu en navigation par liste de boutons, même unique.

### 8.6 Contraste

Le vert `text-green-700` sur `bg-white` atteint 5,0:1, `dark:text-green-300` sur `gray-900` dépasse 8:1. L'ambre `text-amber-700` sur blanc est à 5,0:1. Les deux passent AA pour du texte normal, et le statut en `text-xs` est bien traité comme du texte normal, pas du large text. La marge est faible : ne pas descendre à `text-amber-600` (4,0:1) ni à `text-green-600` (3,9:1), qui échouent tous les deux.

Le select `disabled` avec `disabled:text-gray-400` passe sous le seuil, ce qui est admis par l'exception WCAG 1.4.3 pour les contrôles inactifs. L'information « aucune base chargée » ne repose donc jamais sur ce seul texte grisé, elle est toujours doublée par `#addon-status`.

---

## 9. Points tranchés

| Point | Décision | Justification |
| --- | --- | --- |
| Section à part entière ou champs libres | **Section, un seul fieldset** | Apparition conditionnelle d'un groupe, et trois contrôles dont deux pilotent le troisième. Voir section 2 |
| Deux fieldsets ou un | **Un** | Un `<legend>` coiffant un unique `<select>` sur-structure le formulaire et fait préfixer chaque champ d'un intitulé de groupe redondant |
| Labels des champs visibles ou `sr-only` | **Visibles** | Sans répétition à éviter, le placeholder seul laisse un champ sans intitulé permanent une fois la saisie commencée |
| Région en pills radio ou select | **Pills radio** | Deux options, pattern déjà en place pour le TTL, les deux valeurs visibles sans ouvrir de menu |
| Écrasement de `#target` au changement de région | **Oui, silencieux** | Le champ cible est visible juste au-dessus. `#addon-region-urls` en `aria-live` couvre le cas non visuel, et `#addon-target-warning` rattrape l'incohérence si l'utilisateur a saisi autre chose |
| Contenu du libellé d'option | **`resourceId · provider`** | Le `resourceId` est la clé de correspondance avec le dashboard Scalingo. Le `plan` parle de facturation, pas d'identité, il ne sert qu'à départager une collision |
| Base en select ou input libre | **Select uniquement** | C'est l'objet du bloc, supprimer le copier-coller d'identifiant. Un champ libre de secours réintroduirait le problème et créerait deux chemins à valider |
| `aria-disabled` sur le bouton charger | **Oui**, exception assumée | Voir 8.4 |
| Erreurs dans `#error-banner` ou en ligne | **En ligne** | `#error-banner` est en bas du formulaire, à plusieurs écrans sur mobile, et ne dit pas quel champ a échoué |
| Avertissement de cible bloquant | **Non** | Il signale une incohérence probable, pas une erreur certaine. Une instance Scalingo non standard doit rester utilisable |

---

## 10. Ce que je signale au lead

**Le seul écart restant entre cette spec et ce qui est atteignable est le code `app_not_found`.** Sans lui, une faute de frappe sur le nom de l'application et une panne amont produisent le même message. Le message générique reste actionnable, mais c'est une dégradation réelle du diagnostic. Décision architecte, voir 6.2.

**Le `resourceId` reste dans la réponse de l'API alors qu'il ne sert plus qu'à l'affichage.** C'est le bon choix, l'alternative serait un libellé illisible. Il mérite juste d'être marqué `display-only and never stored in a blob` dans le schéma OpenAPI, au même titre que `provider` et `plan`, pour que l'intention soit lisible par le prochain qui touche à la route.

**L'abandon du multi-base retire de ce document tout ce qui justifiait une revue produit.** Mon alerte de révision 1 sur les dix bases dans un seul blob, qui contredisaient l'esprit fine-grained du produit, est sans objet : un blob, une base, c'est exactement la granularité que le produit promet.
