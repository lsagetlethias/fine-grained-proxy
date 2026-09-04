# Design Document : clé client personnalisée (BYOK)

**Feature** : possibilité optionnelle de fournir sa propre clé client au lieu de laisser le serveur la générer
**Date** : 2026-09-03
**Auteur** : Designer FGP
**Statut** : Draft, en attente de review lead
**Fichiers impactés (intégration dev)** : `src/ui/config-page.tsx`, `src/ui/client/generate.ts`, `src/ui/client/presets.ts`, `src/ui/client/elements.ts`, `src/routes/ui.tsx` (validation serveur de la clé fournie)

---

## 1. Contexte et cadrage

Aujourd'hui, la clé client (`X-FGP-Key`) est générée par le serveur à la génération et affichée dans `#result-key`. Chaque blob a donc sa propre clé.

Le besoin : partager une seule clé entre plusieurs blobs, pour ne stocker qu'un secret en CI au lieu de N.

C'est une **dégradation volontaire du modèle de sécurité**. Le double secret blob + clé perd son isolation : une clé partagée compromise rend exploitables tous les blobs générés avec elle. L'interface doit donc rendre ce choix explicite, coûteux en intention, et impossible à activer par inadvertance.

Trois conséquences de design :

1. le bloc est **replié par défaut** dans un `<details>`, la génération automatique reste le chemin nominal
2. l'avertissement est **plus appuyé** que celui du TTL « Pas d'expiration » : couleur rouge, icône, titre en gras, et il est rattaché au champ par `aria-describedby` pour être lu au moment de la saisie
3. l'état « clé personnalisée active » **reste visible quand le bloc est replié**, sinon l'utilisateur croit avoir annulé son choix en refermant la section

---

## 2. Placement

Le bloc se situe **après la section TTL et avant le bouton « Générer l'URL »**.

Raisonnement : le TTL et la clé client portent tous deux sur l'artefact produit, pas sur ce que le proxy autorise. Les grouper en fin de formulaire garde la progression logique « quoi (cible, auth, scopes), puis comment (durée, clé) ». Le placer plus haut le mettrait sur le chemin de lecture nominal, ce qui est exactement ce qu'on veut éviter pour une option dégradante.

---

## 3. Wireframes ASCII

### 3.1 État par défaut, replié

```
  Durée de validité
  [1 heure] [24 heures] [7 jours] [30 jours] [Personnalisé] [Pas d'expiration]

  ▶ Utiliser ma propre clé client (avancé)

  ┌──────────────────────────────────────────────────────────┐
  │                    Générer l'URL                         │
  └──────────────────────────────────────────────────────────┘
```

### 3.2 Déplié, champ vide

```
  ▼ Utiliser ma propre clé client (avancé)
  ┌────────────────────────────────────────────────────────────┐
  │ ⚠  Risque élevé : une clé partagée compromise expose       │
  │    tous les blobs générés avec elle.                       │
  │    Sans cette option, chaque blob reçoit sa propre clé et  │
  │    une fuite ne concerne qu'un seul blob. N'utilisez une   │
  │    clé partagée que si votre CI ne peut pas stocker un     │
  │    secret par blob.                                        │
  └────────────────────────────────────────────────────────────┘

   Clé client                                    Générer une clé forte
   ┌──────────────────────────────────────────────────┐ ┌───┐ ┌────────┐
   │                                                  │ │ 👁 │ │ Copier │
   └──────────────────────────────────────────────────┘ └───┘ └────────┘
   ▭▭▭▭▭  ▭▭▭▭▭  ▭▭▭▭▭
   Laissez vide pour que le serveur génère une clé unique.
   24 caractères minimum, ASCII imprimable, sans espace.
```

### 3.3 Saisie trop courte

```
   ┌──────────────────────────────────────────────────┐ ┌───┐ ┌────────┐
   │ ••••••••••                                       │ │ 👁 │ │ Copier │
   └──────────────────────────────────────────────────┘ └───┘ └────────┘
   █████  ▭▭▭▭▭  ▭▭▭▭▭      (rouge)
   ⚠ 24 caractères minimum.                        10/24 caractères
```

Bordure rouge, `aria-invalid="true"`, la génération est bloquée.

### 3.4 Saisie dégénérée (longueur atteinte, diversité insuffisante)

```
   ┌──────────────────────────────────────────────────┐ ┌───┐ ┌────────┐
   │ aaaaaaaaaaaaaaaaaaaaaaaaaa                       │ │ 👁 │ │ Copier │
   └──────────────────────────────────────────────────┘ └───┘ └────────┘
   █████  ▭▭▭▭▭  ▭▭▭▭▭      (rouge)
   Diversité : faible. Cette clé contient très peu de caractères
   distincts. Préférez une clé aléatoire.
```

La génération n'est **pas** bloquée (la contrainte formelle est la longueur), mais la jauge est explicite.

### 3.5 Saisie correcte

```
   ┌──────────────────────────────────────────────────┐ ┌───┐ ┌────────┐
   │ ••••••••••••••••••••••••••••••••                 │ │ 👁 │ │ Copier │
   └──────────────────────────────────────────────────┘ └───┘ └────────┘
   █████  █████  █████      (vert)
   Diversité : élevée. 21 caractères distincts, 3 familles.
```

### 3.6 Après « Générer une clé forte »

```
   ┌──────────────────────────────────────────────────┐ ┌───┐ ┌────────┐
   │ K7x_qP2mVz9-tRbN4wYsH1jGcE8aLdFu                 │ │ 🚫👁│ │ Copier │
   └──────────────────────────────────────────────────┘ └───┘ └────────┘
   █████  █████  █████      (vert)
   Diversité : élevée. Clé générée localement, 192 bits d'entropie.
   Copiez-la maintenant : elle ne sera plus affichée après la génération.
```

La valeur est révélée automatiquement (le toggle bascule sur « Masquer »), parce qu'on vient de produire un secret que l'utilisateur doit copier.

### 3.7 Replié avec une clé active

```
  ▼ Utiliser ma propre clé client (avancé)   [ Clé personnalisée active ]
```

Le badge ambre reste visible sur la ligne de résumé quand le `<details>` est refermé. C'est le garde-fou principal contre le « je croyais avoir annulé ».

### 3.8 Bloc résultat

```
  Clé (header X-FGP-Key)                        [ fournie par vous ]
  ┌──────────────────────────────────────────────┐ ┌────────┐
  │ K7x_qP2mVz9-tRbN4wYsH1jGcE8aLdFu             │ │ Copier │
  └──────────────────────────────────────────────┘ └────────┘
```

Un badge distingue une clé fournie d'une clé générée par le serveur. Sans lui, l'utilisateur qui reprend une session ne sait plus lequel des deux modes a produit l'URL.

---

## 4. Identifiants HTML

| Élément | Identifiant / attribut | Type |
| --- | --- | --- |
| Disclosure | `#byok-details` | `<details>` |
| Résumé cliquable | `#byok-summary` | `<summary>` |
| Badge « clé personnalisée active » | `#byok-active-badge` | `<span>` |
| Bloc d'avertissement | `#byok-warning` | `<div>` |
| Champ clé | `#byok-key` | `<input type="password">` |
| Toggle visibilité | `#btn-byok-reveal` | `<button aria-pressed>` |
| Bouton copier | `#btn-byok-copy` | `<button class="copy-btn" data-copy="byok-key">` |
| Bouton générer | `#btn-byok-generate` | `<button type="button">` |
| Jauge (3 segments) | `#byok-strength` | `<div aria-hidden="true">` |
| Segment | `[data-byok-segment]` | `<span>` |
| Libellé de force | `#byok-strength-label` | `<p role="status">` |
| Hint statique | `#byok-hint` | `<p>` |
| Badge d'origine dans le résultat | `#result-key-origin` | `<span>` |

---

## 5. Structure JSX partielle

```jsx
{/* BYOK */}
<details id="byok-details" class="group rounded-md border border-gray-200 dark:border-gray-700">
  <summary
    id="byok-summary"
    class="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium text-fgp-700 hover:text-fgp-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fgp-500 focus-visible:ring-offset-2 rounded-md dark:text-fgp-300 dark:focus-visible:ring-offset-gray-900 [&::-webkit-details-marker]:hidden"
  >
    <svg
      class="h-3.5 w-3.5 shrink-0 transition-transform duration-150 group-open:rotate-90"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fill-rule="evenodd"
        d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
        clip-rule="evenodd"
      />
    </svg>
    <span>Utiliser ma propre cl&eacute; client (avanc&eacute;)</span>
    <span
      id="byok-active-badge"
      hidden
      class="ml-auto inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
    >
      Cl&eacute; personnalis&eacute;e active
    </span>
  </summary>

  <div class="space-y-3 border-t border-gray-200 px-4 py-3 dark:border-gray-700">
    <div
      id="byok-warning"
      class="flex items-start gap-2 rounded-md border border-red-300 border-l-4 border-l-red-500 bg-red-50 p-3 dark:border-red-700 dark:border-l-red-500 dark:bg-red-900/30"
    >
      <svg
        class="h-5 w-5 shrink-0 text-red-600 dark:text-red-400"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          fill-rule="evenodd"
          d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
          clip-rule="evenodd"
        />
      </svg>
      <div class="text-xs text-red-800 dark:text-red-300">
        <p class="font-semibold">
          Risque &eacute;lev&eacute; : une cl&eacute; partag&eacute;e compromise expose tous les
          blobs g&eacute;n&eacute;r&eacute;s avec elle.
        </p>
        <p class="mt-1">
          Sans cette option, chaque blob re&ccedil;oit sa propre cl&eacute; et une fuite ne
          concerne qu'un seul blob. N'utilisez une cl&eacute; partag&eacute;e que si votre CI ne
          peut pas stocker un secret par blob.
        </p>
      </div>
    </div>

    <div>
      <div class="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <label
          for="byok-key"
          class="block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Cl&eacute; client
        </label>
        <button
          type="button"
          id="btn-byok-generate"
          class="text-xs font-medium text-fgp-600 hover:text-fgp-800 focus:outline-none focus:underline dark:text-fgp-400 dark:hover:text-fgp-200"
        >
          G&eacute;n&eacute;rer une cl&eacute; forte
        </button>
      </div>

      <div class="flex flex-wrap gap-2">
        <input
          type="password"
          id="byok-key"
          placeholder="24 caract&egrave;res minimum"
          autocomplete="off"
          data-1p-ignore
          data-lpignore="true"
          spellcheck={false}
          aria-describedby="byok-warning byok-strength-label byok-hint"
          class="min-w-[12rem] flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-mono focus:border-fgp-500 focus:ring-1 focus:ring-fgp-500 outline-none aria-[invalid=true]:border-red-400 aria-[invalid=true]:focus:border-red-500 aria-[invalid=true]:focus:ring-red-500 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-400 dark:aria-[invalid=true]:border-red-500"
        />
        <button
          type="button"
          id="btn-byok-reveal"
          aria-pressed="false"
          aria-label="Afficher la cl&eacute;"
          class="shrink-0 rounded-md border border-gray-300 p-2 text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-fgp-500 dark:border-gray-600 dark:hover:text-gray-200"
        >
          <svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
            <path
              fill-rule="evenodd"
              d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
              clip-rule="evenodd"
            />
          </svg>
        </button>
        <button
          type="button"
          id="btn-byok-copy"
          data-copy="byok-key"
          class="copy-btn shrink-0 rounded-md border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-fgp-500 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          Copier
        </button>
      </div>

      {/* Trois segments pour trois niveaux, cf. section 8.1 */}
      <div id="byok-strength" class="mt-2 flex gap-1" aria-hidden="true">
        <span data-byok-segment class="h-1 flex-1 rounded-full bg-gray-200 dark:bg-gray-700"></span>
        <span data-byok-segment class="h-1 flex-1 rounded-full bg-gray-200 dark:bg-gray-700"></span>
        <span data-byok-segment class="h-1 flex-1 rounded-full bg-gray-200 dark:bg-gray-700"></span>
      </div>

      <p
        id="byok-strength-label"
        class="mt-1 text-xs text-gray-500 dark:text-gray-400"
        role="status"
        aria-live="polite"
      >
      </p>

      <p id="byok-hint" class="mt-1 text-xs text-gray-500 dark:text-gray-400">
        Laissez vide pour que le serveur g&eacute;n&egrave;re une cl&eacute; unique. 24
        caract&egrave;res minimum, 256 maximum, ASCII imprimable, sans espace.
      </p>
    </div>
  </div>
</details>
```

### 5.1 Badge d'origine dans le bloc résultat

Ajouté dans le `<label>` existant de `#result-key` :

```jsx
<label class="mb-1 flex flex-wrap items-center gap-2 text-xs font-medium text-green-700 dark:text-green-300">
  <span>Cl&eacute; (header <code class="font-mono">X-FGP-Key</code>)</span>
  <span
    id="result-key-origin"
    class="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/40 dark:text-green-300"
  >
    g&eacute;n&eacute;r&eacute;e par le serveur
  </span>
</label>
```

En BYOK, le badge devient `fournie par vous` avec les classes ambre (`bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300`), pour porter la même charge visuelle que le badge du disclosure.

---

## 6. Activation et cycle de vie

### 6.1 Ce qui active BYOK

**Le champ `#byok-key` non vide, rien d'autre.** Pas de case à cocher supplémentaire, pas d'état lié à l'ouverture du `<details>`.

Ouvrir le disclosure sans rien saisir puis le refermer ne change strictement rien : la génération reste automatique. C'est le comportement attendu par quelqu'un qui est venu voir ce que fait l'option.

### 6.2 Ce qui rend l'état visible quand le bloc est replié

Dès que `#byok-key` contient au moins un caractère, `#byok-active-badge` perd son attribut `hidden`. Il reste affiché sur la ligne du `<summary>` même quand le `<details>` est fermé. Le vider fait disparaître le badge.

C'est la réponse au piège principal du pattern disclosure : refermer une section n'annule pas ce qu'on y a saisi, et l'interface doit le dire.

### 6.3 Réinitialisation

`#btn-preset-clear` vide `#byok-key`, referme `#byok-details`, masque le badge, remet la jauge à zéro et le libellé de force à vide. Les presets Scalingo ne touchent pas à ce bloc : la clé client est orthogonale à la cible.

### 6.4 Après une génération réussie

Le champ n'est **pas** vidé : régénérer plusieurs blobs avec la même clé est précisément le cas d'usage. Le badge d'origine dans le bloc résultat rappelle laquelle des deux voies a été empruntée.

---

## 7. Validation

### 7.1 Règles

| Règle | Bloquante | Message |
| --- | --- | --- |
| Vide | non | mode automatique, aucun message |
| Longueur < 24 | **oui** | `24 caractères minimum.` |
| Longueur > 256 | **oui** | `256 caractères maximum.` |
| Caractère hors `[\x21-\x7E]` (espace, accent, saut de ligne, tabulation) | **oui** | `Caractères ASCII imprimables sans espace uniquement.` |
| Diversité faible | non | jauge rouge et libellé, mais la génération passe |

L'ensemble revient à `^[\x21-\x7E]{24,256}$`, aligné sur `CLIENT_KEY_MIN_LENGTH` et `CLIENT_KEY_MAX_LENGTH`. Les textes sont ceux de la copy PO (specs §12.9), qui fait foi.

La contrainte ASCII imprimable sans espace vient du fait que la valeur transite dans un header HTTP : un espace en tête ou en queue serait silencieusement rogné par certaines stacks, et un caractère non ASCII est purement et simplement invalide dans une valeur de header. Un copier-coller depuis un gestionnaire de mots de passe amène très souvent une espace finale, donc **trimmer la valeur à la saisie** avant de valider, sans le signaler comme une erreur.

### 7.1.1 Pas de `maxlength` sur le champ, et c'est important

**`maxlength` doit être retiré de `#byok-key`.** Tant qu'il est présent, coller une clé de plus de 256 caractères la fait **tronquer silencieusement** par le navigateur : l'utilisateur obtient un champ qui contient 256 caractères parfaitement valides, la jauge passe au vert, la génération réussit, et le blob produit est chiffré avec une clé qui n'est pas la sienne. Il ne s'en apercevra qu'au premier appel, avec un échec de déchiffrement inexplicable. C'est la pire défaillance possible sur ce champ : silencieuse, tardive, et sans piste de diagnostic.

Le `maxlength` a un second effet, moins grave mais révélateur : il rend **inatteignable** la branche `too-long` de `checkClientKey()` et le message « 256 caractères maximum. » de la copy PO. Un message d'erreur spécifié et implémenté qui ne peut jamais s'afficher est le symptôme que la contrainte est posée au mauvais endroit.

La règle générale : sur un champ où la troncature produit une valeur **plausible mais fausse**, on laisse saisir et on refuse explicitement. `maxlength` reste légitime là où la troncature est visible et sans conséquence, comme le nom de header à 64 caractères de `custom-headers-multi.md`, où l'utilisateur voit immédiatement que son nom est coupé.

### 7.1.2 Conséquences d'une clé de 256 caractères sur le champ

Le champ reste une `<input>` sur une seule ligne, `min-w-[12rem] flex-1`, donc environ 40 caractères visibles à la fois. Une clé de 256 caractères défile horizontalement, en clair comme en masqué. C'est acceptable et il ne faut pas chercher à corriger cet affichage.

Passer en `<textarea>` pour tout voir serait une régression : on perd `type="password"`, donc le masquage, et on gagne un champ qui accepte les sauts de ligne, précisément le caractère interdit par le charset. Ajouter une troncature visuelle avec des points de suspension serait pire encore, puisque c'est exactement l'ambiguïté que la section précédente cherche à éliminer.

Le bon geste est déjà spécifié : le bouton « Copier » est le moyen de récupérer la valeur, pas la sélection à la souris. Le compteur de caractères de la copy PO joue le rôle de confirmation de longueur, et c'est lui qui permet à l'utilisateur de vérifier qu'une clé longue est arrivée entière, sans avoir à la lire. C'est un argument de plus pour l'intégrer.

### 7.2 Pas de validation native

**Ne pas mettre `required`, `minlength` ni `pattern` sur `#byok-key`.**

Le champ vit dans un `<details>` qui peut être fermé au moment du submit. Un champ invalide au sens de la validation native, à l'intérieur d'un conteneur non rendu, fait échouer `reportValidity()` avec `An invalid form control is not focusable` et rend le formulaire non soumettable sans message visible. Même classe de piège que le champ `#token` masqué décrit dans `custom-headers-multi.md` section 5.2.

Validation entièrement en JS. En cas d'erreur au submit :

1. ouvrir `#byok-details` (`details.open = true`)
2. poser `aria-invalid="true"` sur `#byok-key`
3. donner le focus au champ
4. afficher le message dans `#byok-strength-label` avec les classes rouges

L'ordre compte : ouvrir avant de focuser, sinon le focus est posé sur un élément non rendu et le navigateur le perd.

### 7.3 Validation serveur

La règle `^[\x21-\x7E]{24,256}$` doit être **répliquée côté serveur**. Une validation uniquement client sur un paramètre de sécurité n'est pas une validation.

C'est fait : `validateClientKey()` dans `src/crypto/client-key.ts` porte les mêmes bornes et le même charset, et `/api/generate` l'appelle avant de chiffrer. Les constantes `CLIENT_KEY_MIN_LENGTH` et `CLIENT_KEY_MAX_LENGTH` sont partagées entre le client et le serveur, ce qui est la bonne façon d'éviter que les deux barèmes divergent. Point clos.

---

## 8. Jauge de diversité

### 8.1 Trois segments pour trois niveaux, et pas quatre

L'intégration livrée a quatre segments et quatre niveaux (faible, moyenne, forte, excellente), la copy PO en annonce trois (faible, moyenne, élevée). Le lead m'a demandé de trancher. **Je tranche à trois segments et trois niveaux**, donc la jauge s'aligne sur la copy, pas l'inverse.

Trois raisons, par ordre d'importance.

**La mesure n'a pas la résolution d'un quatrième niveau.** Le seuil qui séparait « forte » d'« excellente » était `n >= 32 && u >= 16 && familles >= 3`. Il ne recouvre rien de réel : une clé de 24 caractères avec 14 caractères distincts et 2 familles n'est pas moins bonne qu'une clé de 32 avec 16 distincts et 3 familles. Les deux sont parfaitement acceptables. Graduer là où il n'y a pas de gradient, c'est exactement le travers que je dénonçais en refusant le mot « Force », juste déplacé du vocabulaire vers la géométrie. Une jauge à quatre crans affirme quatre degrés de qualité, et nous n'en mesurons pas quatre.

**Quatre niveaux créent une incitation contre-productive.** Un utilisateur qui voit trois segments sur quatre allume l'envie d'atteindre le quatrième, donc de retoucher sa clé saisie à la main jusqu'à ce qu'elle passe au vert. C'est précisément le comportement à ne pas encourager : la protection réelle, c'est le bouton « Générer une clé forte », pas l'optimisation d'une clé tapée au clavier. Avec trois niveaux, une clé correcte est verte du premier coup et l'utilisateur passe à la suite.

**Le segment bleu entrait en collision avec la couleur de marque.** Le niveau « forte » utilisait `bg-fgp-500`, la couleur des éléments interactifs de toute la page. L'insérer dans une échelle rouge, ambre, vert casse la lecture de l'échelle et affaiblit la signification du bleu ailleurs dans l'interface. Trois niveaux donnent une échelle rouge, ambre, vert canonique, lisible sans apprentissage.

Note : trois segments plus larges se lisent aussi mieux que quatre segments étroits sur la largeur de cette colonne de formulaire, mais c'est un bénéfice secondaire, pas la raison.

### 8.2 Ce que la jauge mesure vraiment, et ce qu'elle ne détecte pas

Avec un plancher à 24 caractères, toute clé réellement aléatoire dépasse déjà largement les 128 bits d'entropie. La jauge ne dit donc rien de la solidité cryptographique. Elle détecte **un seul cas** de façon fiable : la clé dégénérée, très répétitive, du type `aaaaaaaaaaaaaaaaaaaaaaaa` ou `121212121212121212121212`.

Les specs §12.9 annoncent un second cas détecté, la phrase de passe en langue naturelle. **C'est inexact et il faut le corriger.** Une heuristique de diversité de caractères ne repère pas une phrase de passe : `correcthorsebatterystaple1` fait 26 caractères, 13 caractères distincts et 2 familles, donc elle sort en « élevée », au même rang qu'une clé aléatoire. Détecter une phrase de passe demanderait un dictionnaire et une estimation à la zxcvbn, hors de portée d'un bundle client sans dépendances, et hors sujet ici.

Il vaut mieux l'assumer que le prétendre. Une jauge qui annonce détecter les phrases de passe et n'en détecte aucune est le même mensonge que le mot « Force », logé dans la documentation au lieu de l'écran. Le libellé reste **« Diversité »**, l'aide de la jauge reste « La jauge mesure la variété des caractères saisis, pas la sécurité réelle de la clé », et la vraie protection reste le bouton de génération.

### 8.3 Règles de calcul

Sans dépendance externe, le bundle client est compilé par esbuild sans libs tierces.

```
n        = longueur après trim
u        = nombre de caractères distincts
familles = nombre de familles présentes parmi : minuscules, majuscules, chiffres, autres
```

| Condition (première qui s'applique) | Segments | Couleur | Libellé |
| --- | --- | --- | --- |
| `n === 0` | 0 | gris | (vide) |
| `n < 24` | 1 | rouge | `24 caractères minimum.` (bloquant) |
| `n > 256` | 1 | rouge | `256 caractères maximum.` (bloquant) |
| charset invalide | 1 | rouge | `Caractères ASCII imprimables sans espace uniquement.` (bloquant) |
| `u < 8` | 1 | rouge | `Diversité : faible. Cette clé contient très peu de caractères distincts. Préférez une clé aléatoire.` |
| `u < 12 \|\| familles < 2` | 2 | ambre | `Diversité : moyenne. Ajoutez des caractères variés ou générez une clé.` |
| sinon | 3 | vert | `Diversité : élevée. <u> caractères distincts, <familles> familles.` |

Les branches « forte » et « excellente » fusionnent en « élevée ». La condition `n >= 32 && u >= 16 && familles >= 3` disparaît entièrement.

Deux cas de contrôle qui valident le nouveau barème :

- une clé hexadécimale de 32 caractères (`u = 16`, une seule famille de lettres plus les chiffres, donc 2 familles) sort en **élevée**. C'est correct, et cela lève le faux positif que je signalais en révision 1 sur le barème à quatre niveaux
- `aaaaaaaaaaaaaaaaaaaaaaaa` (`u = 1`) sort en **faible** avec l'alerte de clé dégénérée. C'est le seul cas que la jauge sait vraiment détecter, et elle le détecte

Après un clic sur « Générer une clé forte », le libellé devient `Diversité : élevée. Clé générée localement, 192 bits d'entropie.` suivi de `Copiez-la maintenant : elle ne sera plus affichée après la génération.` Le verdict est le même que pour une bonne clé manuelle, **et c'est voulu** : les deux sont effectivement bonnes. Ce qui distingue la clé générée n'est pas une note plus haute, c'est la mention factuelle des 192 bits d'entropie.

### 8.4 Rendu des segments

Classe de base d'un segment : `h-1 flex-1 rounded-full`. Le JS applique la couleur sur les `k` premiers segments et remet `bg-gray-200 dark:bg-gray-700` sur les autres.

| Niveau | Classes actives |
| --- | --- |
| rouge | `bg-red-500 dark:bg-red-400` |
| ambre | `bg-amber-500 dark:bg-amber-400` |
| vert | `bg-green-500 dark:bg-green-400` |

Le niveau bleu `bg-fgp-500` est supprimé, voir 8.1.

La barre est purement décorative : `aria-hidden="true"` sur `#byok-strength`. Toute l'information est dans `#byok-strength-label`, qui est la seule source pour un lecteur d'écran. Un utilisateur en vision monochrome ou daltonien lit le mot (« faible », « moyenne », « élevée »), il ne dépend jamais de la couleur seule, critère 1.4.1.

### 8.5 Fréquence de mise à jour

Recalcul à chaque `input`. Mais `#byok-strength-label` est une région `aria-live="polite"` : la réécrire à chaque frappe produit un flot d'annonces insupportable.

Mitigation obligatoire : **debounce de 500 ms sur l'écriture du texte** dans la région live. La barre visuelle, elle, se met à jour immédiatement puisqu'elle est `aria-hidden`. On obtient un retour visuel instantané et une annonce vocale qui n'arrive qu'à la pause de frappe.

---

## 9. Génération d'une clé forte

- source : `crypto.getRandomValues(new Uint8Array(24))`, encodé en base64url sans padding, soit 32 caractères pour 192 bits d'entropie
- l'alphabet base64url (`A-Z a-z 0-9 - _`) est intégralement dans `[\x21-\x7E]`, ne contient ni espace ni caractère problématique en header HTTP, et 32 caractères tiennent très largement sous le plafond de 256. Aucun échappement nécessaire, aucun risque de mauvaise copie
- après génération :
  - la valeur est écrite dans `#byok-key`
  - le champ passe en `type="text"` et `#btn-byok-reveal` bascule sur `aria-pressed="true"` et `aria-label="Masquer la clé"`
  - la jauge passe à 3 segments verts
  - `#byok-strength-label` reçoit le message de la section 8.3
  - le focus va sur `#btn-byok-copy` : l'action suivante attendue est de copier la clé
- `crypto.getRandomValues` est disponible partout où le reste de la page fonctionne (la page utilise déjà la Web Crypto API). Aucun fallback `Math.random` : générer un secret avec un PRNG non cryptographique est pire que ne rien proposer. Si l'API est absente, désactiver le bouton et afficher « Génération indisponible sur ce navigateur, saisissez une clé manuellement. »

---

## 10. Notes a11y

### 10.1 Le disclosure

- `<details>` / `<summary>` natifs. Le contenu replié est hors de l'ordre de tabulation sans manipulation de `tabindex`, et le `<summary>` est annoncé comme un bouton avec son état développé ou replié. C'est le pattern déjà employé par `#import-details` dans la page, la cohérence est acquise
- `list-none` + `[&::-webkit-details-marker]:hidden` pour masquer le triangle natif, remplacé par le chevron SVG rotatif. Identique à `#btn-preset-import`
- le `<summary>` porte `focus-visible:ring-2` : un `<summary>` sans indicateur de focus visible est un échec du critère 2.4.7, et l'anneau par défaut disparaît avec `focus:outline-none`
- **ne pas** ajouter `role="button"` sur le `<summary>` : cela écraserait la sémantique native de disclosure et supprimerait l'annonce de l'état développé

### 10.2 Le badge « clé personnalisée active »

- il est dans le `<summary>`, donc lu dans la foulée du libellé : « Utiliser ma propre clé client, avancé, Clé personnalisée active, développé »
- il apparaît et disparaît via l'attribut `hidden`, sans `aria-live` : son apparition suit directement une frappe de l'utilisateur dans le champ, il n'y a rien à annoncer de façon asynchrone, et une annonce à chaque première frappe serait du bruit
- contraste : `text-amber-800` sur `bg-amber-100` atteint 6,4:1, `dark:text-amber-300` sur `dark:bg-amber-900/40` reste au-dessus de 7:1

### 10.3 L'avertissement

- rattaché au champ par `aria-describedby="byok-warning byok-strength-label byok-hint"`. Un utilisateur de lecteur d'écran qui prend le focus dans le champ entend le risque, puis l'état de diversité, puis la contrainte de format. C'est verbeux mais c'est exactement l'ordre d'importance, et c'est le seul moyen de garantir que l'avertissement ne soit pas sauté par une navigation directe aux champs de formulaire
- **pas de `role="alert"`** : le contenu est statique et présent au chargement, `role="alert"` déclencherait une interruption à l'insertion (donc à l'ouverture du disclosure dans certains moteurs) sans rien apporter. `aria-describedby` couvre le besoin proprement
- contraste : `text-red-800` sur `bg-red-50` atteint 7,6:1, `dark:text-red-300` sur `dark:bg-red-900/30` dépasse 7:1. L'icône est `aria-hidden`, elle ne porte aucune information exclusive
- la barre latérale `border-l-4 border-l-red-500` est le marqueur de gravité qui distingue ce bloc de `#ttl-warning` (simple bordure 1 px ambre). La hiérarchie visuelle rouge + barre + titre gras contre ambre + une ligne est immédiatement lisible

### 10.4 Le toggle de visibilité

- `aria-pressed` porte l'état, pas d'`aria-live`
- `aria-label` réécrit en même temps : « Afficher la clé » puis « Masquer la clé ». Ne pas se contenter de `aria-pressed` sur un bouton icône sans nom accessible
- l'icône passe de l'oeil à l'oeil barré, elle reste `aria-hidden`

### 10.5 Ordre de tabulation

```
(dernier contrôle du bloc TTL)
  → #byok-summary
  → [si ouvert] #btn-byok-generate → #byok-key → #btn-byok-reveal → #btn-byok-copy
  → #btn-generate
```

Le bouton « Générer une clé forte » est **avant** le champ dans le DOM parce qu'il est visuellement aligné à droite du label. C'est un léger décalage avec la logique d'action, mais l'alternative (le placer après le bouton copier) l'éloignerait du champ auquel il se rapporte et casserait l'alignement avec le label. Le libellé est explicite, l'ordre reste compréhensible.

### 10.6 Le bouton copier

Il réutilise `class="copy-btn"` + `data-copy="byok-key"`, donc le handler délégué existant dans `src/ui/client/clipboard.ts` le prend en charge sans ligne de code supplémentaire. Ce handler remplace le texte du bouton par « Copié ! » pendant 1,5 s. Sur un bouton textuel, le changement de contenu n'est pas annoncé : ajouter `role="status"` au bouton serait incorrect. Si le lead veut une confirmation accessible, la faire passer par la région `#byok-strength-label`, ce qui reste hors du périmètre minimal.

---

## 11. Points tranchés

| Point | Décision | Justification |
| --- | --- | --- |
| Rouge ou ambre pour l'avertissement | **Rouge** | Le TTL sans expiration est une imprudence, une clé partagée compromise est une compromission en chaîne. Réutiliser l'ambre placerait les deux au même niveau de gravité, ce qui est faux. L'ambre reste réservé aux mises en garde, le rouge marque le danger. La page n'utilise le rouge que pour `#error-banner` aujourd'hui, il n'y a pas de conflit sémantique fort |
| Case à cocher d'activation en plus du disclosure | **Non** | Deux gestes pour la même intention. La saisie non vide est l'activation, le badge sur le résumé porte l'état. Une case ajouterait un contrôle de plus dont l'état pourrait diverger du contenu du champ |
| Libellé de la jauge : « Force » ou « Diversité » | **Diversité** | Voir 8.2. Le mot « Force » sur un critère qui ne mesure pas la force réelle est une fausse assurance dans une interface de sécurité |
| Jauge à 4 segments ou copy à 4 niveaux | **3 segments, 3 niveaux** | La mesure n'a pas la résolution d'un quatrième cran, quatre niveaux poussent l'utilisateur à optimiser une clé tapée à la main au lieu de cliquer sur « Générer une clé forte », et le segment bleu `fgp-500` entrait en collision avec la couleur des éléments interactifs. Voir 8.1 |
| `maxlength` sur le champ clé | **Retiré** | Une troncature silencieuse à 256 produit une clé plausible mais fausse, et un blob indéchiffrable diagnostiqué au premier appel seulement. Elle rend en prime inatteignable le message « 256 caractères maximum. » pourtant spécifié et implémenté. Voir 7.1.1 |
| Diversité faible bloquante | **Non** | La contrainte formelle demandée est de 24 caractères. Bloquer sur une heuristique maison créerait des faux positifs sur des clés parfaitement valides (par exemple une clé hexadécimale de 32 caractères, `u = 16`, une seule famille, qui est pourtant une bonne clé). La jauge informe, la longueur contraint |
| Vider le champ après génération réussie | **Non** | Réutiliser la même clé sur plusieurs blobs est le cas d'usage entier de la feature. La vider forcerait un aller-retour dans le gestionnaire de secrets à chaque blob |
| Longueur de la clé générée | **32 caractères, 192 bits** | Base64url de 24 octets, sans padding donc sans `=` parasite en fin de header. Un multiple de 3 octets évite le padding, 24 est le plus petit multiple de 3 qui dépasse confortablement 128 bits. Aucune raison d'aller vers le plafond de 256 : au-delà de 192 bits on ajoute de la longueur à copier, pas de la sécurité |

---

## 12. Ce que je signale au lead

**Résolu depuis la révision 1.** La validation serveur existe : `validateClientKey()` dans `src/crypto/client-key.ts` est appelée par `/api/generate` avec les mêmes bornes 24 à 256 et le même charset que l'UI. Le partage de config n'embarque pas la clé. Les deux points bloquants que je signalais sont fermés.

**Le `maxlength` du champ est un bug silencieux, pas un détail de spec.** C'est le point à traiter en priorité dans cette passe. Tant qu'il est là, coller une clé de plus de 256 caractères la tronque sans rien dire, la jauge passe au vert, la génération réussit, et l'utilisateur repart avec un blob chiffré par une clé qui n'est pas la sienne. L'échec arrive au premier appel réel, sans piste. C'est aussi ce qui rend inatteignable le message « 256 caractères maximum. » que la copy PO spécifie et que `checkClientKey()` implémente déjà. Détail en 7.1.1, et il mérite un test de non-régression sur un collage de 300 caractères.

**Les specs §12.9 se trompent sur ce que la jauge détecte.** Elles annoncent deux cas dégénérés attrapés, la clé répétitive et la phrase de passe en langue naturelle. Une heuristique de diversité de caractères n'attrape que le premier : `correcthorsebatterystaple1` sort en « élevée », au même rang qu'une clé aléatoire. Il faut corriger la phrase côté specs, sinon on reproduit dans la documentation exactement le mensonge que le refus du mot « Force » avait écarté de l'écran. Détail en 8.2, c'est une correction PO.

**Trois éléments de la copy PO §12.9 n'ont pas d'équivalent dans l'intégration livrée**, et je les signale sans les spécifier de force parce que ce sont des ajouts de périmètre, pas des corrections. Le compteur de caractères « {n}/24 caractères », qui a une vraie utilité une fois le plafond passé à 256 puisqu'il permet de vérifier qu'une clé longue est arrivée entière sans avoir à la lire, voir 7.1.2. Le couple de choix explicites « Générer une clé (recommandé) » et « Utiliser ma propre clé », que ma spec remplace par la règle « champ non vide égale activation » plus le badge sur le résumé, décision tranchée en 11 et que je maintiens. Et le titre de bloc « Clé client », qui diverge de mon libellé de `<summary>` « Utiliser ma propre clé client (avancé) ». À arbitrer par le PO et le lead, aucun des trois n'est bloquant.

**La jauge reste cosmétique, et elle l'est encore plus à trois niveaux.** Elle attrape la clé répétitive, rien d'autre. Je l'ai gardée parce qu'elle a une valeur pédagogique réelle et qu'elle est demandée, mais si le lot doit maigrir, c'est toujours le premier élément à couper : le bouton « Générer une clé forte » apporte l'essentiel du bénéfice à lui seul.

**La feature dégrade le modèle de sécurité du produit, et aucun avertissement ne remplace une contrainte.** Deux garde-fous possibles si le lead veut aller plus loin, tous deux hors de ma décision : imposer un TTL maximum quand une clé est fournie, ou refuser BYOK sur les blobs qui ont `logs.detailed` activé, puisqu'un body chiffré avec une clé partagée est lisible par tout porteur de cette clé.
