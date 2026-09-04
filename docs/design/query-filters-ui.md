# Design Document : Query Filters UI (blob v5)

**Feature** : axe `queryFilters` sur `ScopeEntry`, formulaire de configuration + diagnostic dans le testeur de scopes
**Date** : 2026-09-04
**Auteur** : Designer FGP
**Statut** : Draft, en attente de review lead et confirmation copy PO
**Prérequis** : `body-filters-ui.md` (gabarit repris), `and-filter-ui.md` (palette d'imbrication reprise à l'identique)

---

## 0. Note sur les sources, à lire avant tout

Cette spec part d'une contrainte de travail que je signale tout de suite plutôt que de la cacher dans le corps du document.

Dans ce worktree, `docs/specs.md` est encore en version 4.0 : il n'y a ni §19 (« Query filters »), ni §12.14 (copy PO), et §12.5 / §18.4 décrivent encore l'état où la query n'est pas contrainte. Le seul artefact committé qui porte la décision `queryFilters` est **ADR-0009 §4** (« Query : un axe de contrainte dans `ScopeEntry`, décision prise, implémentation différée »), qui est le texte que j'ai pris comme socle sémantique : interface `QueryFilter { param, values, required }`, opt-in, déni par défaut à l'intérieur du scope dès le premier filtre, bump en v5. `src/middleware/scopes.ts` confirme cet état : `AccessVerdict.denialReason` porte déjà la valeur `"query"` dans son union de types, mais rien ne la produit encore, et le commentaire au-dessus dit explicitement `// Toujours false tant que queryFilters n'est pas livre`.

Deux conséquences pour la suite de ce document :

- **Le modèle de données, la mécanique de la bascule et la structure du formulaire** : je les tiens pour solides, ils sont directement dérivés d'ADR-0009 §4 et du brief de tâche (restriction du type `any` aux chaînes, §19.3 cité dans le brief).
- **Le texte exact des messages** (l'alerte de bascule §12.14, le contenu de la ligne de diagnostic dans le testeur) : je ne l'ai pas. Le brief est explicite sur le fait que la copy est déjà écrite par le PO et que ma tâche porte sur le **mécanisme**, pas le texte. J'ai donc écrit des textes d'illustration, marqués `[DRAFT]`, qui tiennent la place et respectent le ton du produit (cf. §12.13, phrase déclarative qui porte sa propre gravité), mais qui doivent être remplacés par le texte réel de §12.14 à l'intégration. Je détaille ce point dans mon rapport au lead.

Le reste du document est actionnable tel quel : aucun des deux points ouverts qui m'ont été confiés (mécanisme de la bascule, forme du diagnostic) ne dépend du texte manquant.

---

## 1. Philosophie

Le body filters a posé le gabarit : un panneau avancé, replié par scope, une ligne compacte par scope avec un badge de comptage, un clic pour éditer. Les query filters ne réinventent rien de cette mécanique. Ce qui change, c'est le contenu et le poids sémantique.

Trois principes directeurs pour ce lot :

1. **Un scope, un seul endroit pour le configurer.** Body et query filters portent tous les deux sur le même `ScopeEntry`. Les traiter dans deux panneaux séparés casserait ce lien et doublerait le coût de hauteur pour un bénéfice nul. Ils vivent dans la même ligne de scope, en deux sous-sections.
2. **Le formulaire query est plus simple que son modèle, pas un décalque.** La restriction du type `any` aux chaînes (§19.3) supprime le sélecteur Texte / Nombre / Booléen / Null partout où il apparaissait dans les body filters. Une valeur query, c'est un input texte. Point. C'est moins de largeur par ligne, ce qui aide aussi le rendu mobile.
3. **L'avertissement de bascule n'est pas un texte d'aide, c'est une propriété affichée de l'état du scope.** Il n'apparaît pas parce qu'on l'a décidé une fois pour toutes en haut du formulaire, il apparaît parce que le scope est, à cet instant précis, dans l'état qu'il décrit. Détail développé au §5.

---

## 2. Modèle de données (rappel ADR-0009 §4, adapté)

```
interface QueryFilter {
  param: string;
  values: ObjectValue[];   // même union que les body filters, mais "any" ne porte que des chaînes
  required?: boolean;      // défaut false
}

interface ScopeEntry {
  methods: string[];
  pattern: string;
  bodyFilters?: BodyFilter[];
  queryFilters?: QueryFilter[];   // v5
}
```

Sémantique (ADR-0009 §4, inchangée) :

- **Opt-in.** Un scope sans `queryFilters` se comporte comme aujourd'hui : la query passe librement.
- **Déni par défaut à l'intérieur du scope, dès le premier filtre.** Tout paramètre présent dans la requête et non couvert par un `QueryFilter` fait échouer le scope. Ce n'est pas une contrainte additive sur le paramètre visé, c'est un changement de mode pour tout le scope.
- **Occurrences multiples.** Un paramètre répété n'est autorisé que si chacune de ses occurrences satisfait le filtre.
- **`required`** : si vrai, le paramètre doit être présent, sinon son absence fait échouer le scope. Si faux (défaut), le paramètre reste optionnel, mais s'il est présent, sa valeur doit satisfaire `values`.

Différence avec les body filters, qui structure tout ce document : côté body, `objectValue` peut porter n'importe quel type JSON (texte, nombre, booléen, null), d'où le sélecteur de sous-type. Côté query, une valeur de paramètre HTTP est toujours une chaîne. Le type `any` d'un `QueryFilter` n'a donc qu'une seule forme, un input texte, sans sélecteur de sous-type. Les autres types de filtre (`stringwildcard`, `regex`, `wildcard`, `not`, `and`) sont déjà purement textuels dans les body filters, ils ne changent pas.

---

## 3. Décision structurelle : un panneau unifié, pas deux

**Décision** : le panneau `body-filters-panel` existant devient le panneau des filtres avancés d'un scope, avec deux sous-sections par scope déplié, **Filtres body** puis **Filtres query**, dans cet ordre (« sous les body filters », comme demandé). Un seul bouton d'entrée, un seul panneau, une seule liste de chips.

**Ce qui change dans le panneau existant :**

- Le texte du bouton d'ouverture passe de « + Ajouter des filtres body sur un scope... » à **« + Ajouter des filtres sur un scope... »**.
- Le titre du panneau passe de « Body Filters (avancé) » à **« Filtres avancés »**.
- Je recommande de **garder les IDs existants** (`btn-add-body-filters`, `body-filters-panel`, `body-filters-list`, `bf-*`) : c'est du code déjà testé et câblé, changer les IDs pour un problème purement textuel ferait courir un risque de régression pour zéro bénéfice utilisateur. Seuls le texte visible et l'`aria-label` de fermeture (« Fermer le panel de filtres avancés ») changent. Point à confirmer avec le dev, cf. §12.
- L'éligibilité d'une ligne de scope change de nature : aujourd'hui seuls les scopes POST/PUT/PATCH/`*` apparaissent dans la liste (parce que seuls eux peuvent porter des body filters). Les query filters s'appliquent à **toute méthode**, une requête GET a une query comme une requête POST a un body. La liste de scopes affichée dans le panneau doit donc inclure tous les scopes déclarés, pas seulement ceux éligibles aux body filters. Conséquence et compromis discutés au §11.

**Option écartée : deux panneaux séparés (un pour body, un pour query).**

Avantage : zéro risque sur le code existant, addition pure. Rejetée parce qu'elle double la charpente (deux boutons, deux panneaux, deux jeux de chips, deux messages d'état vide) pour deux axes qui décrivent la même entité `ScopeEntry`, et parce qu'elle éclate la configuration d'un scope donné en deux endroits qu'il faut ouvrir séparément pour avoir la vue complète. C'est exactement le genre de coût que le budget de hauteur de ce produit ne s'autorise pas pour un bénéfice de risque quasi nul (l'ajout d'une sous-section dans une ligne déjà dépliable est un changement localisé, pas structurel).

---

## 4. Wireframes ASCII

### 4.1 Ligne de scope repliée, avec indicateurs body et query

```
┌─────────────────────────────────────────────────────────────┐
│ ▶ GET:/v1/items                          0 filtre           │  <- aucun filtre, méthode GET
│ ▶ POST:/v1/apps/my-app/deployments    2 body · 1 query [●●] │  <- les deux axes actifs
│ ▶ DELETE:/v1/items/*                        1 filtre  [●]   │  <- query seul, méthode sans body
└─────────────────────────────────────────────────────────────┘
```

Le badge texte distingue les deux axes dès qu'au moins un des deux est actif (`N body · M query`). Quand un seul axe est actif, on garde le texte compact existant (`N filtre(s)`) pour ne pas complexifier inutilement le cas majoritaire actuel. Deux points au lieu d'un seul quand les deux axes sont actifs :

- point `bg-fgp-500` (existant, inchangé) : au moins un body filter
- point `bg-violet-500 dark:bg-violet-400` (nouveau) : au moins un query filter

Violet n'est utilisé nulle part ailleurs dans la palette actuelle (amber = exclusion/`not`, sky = groupe `and`, rouge = danger, bleu = info). Couleur de la palette Tailwind par défaut, disponible sans toucher `tailwind.config.js`.

### 4.2 Ligne dépliée, scope éligible aux deux axes

```
┌─────────────────────────────────────────────────────────────┐
│ ▼ POST:/v1/apps/my-app/deployments      2 body · 1 query [●●]│
│                                                               │
│   FILTRES BODY                                               │
│   ┌───────────────────────────────────────────────────────┐ │
│   │ Filtre 1                                        [bin] │ │
│   │ ...(inchangé, cf. body-filters-ui.md)...               │ │
│   └───────────────────────────────────────────────────────┘ │
│   [+ Ajouter un filtre body]                                 │
│                                                               │
│   FILTRES QUERY                                               │
│   ┌─ [ ! ] Ce scope refuse maintenant tout paramètre de     ┐ │
│   │        query non listé ci-dessous, y compris un         │ │
│   └        `utm_source` de navigateur ou un `_` de cache-  ─┘ │
│            busting.                            [DRAFT §12.14] │
│                                                               │
│   ┌───────────────────────────────────────────────────────┐ │
│   │ Filtre 1                                        [bin] │ │
│   │ Paramètre : [ git_ref                               ] │ │
│   │ Type      : [ Pattern (wildcard)                |v]   │ │
│   │ Valeurs (une des suivantes) :                          │ │
│   │   [ release/*                                  ] [x]  │ │
│   │ [+ Ajouter une valeur]                                 │ │
│   │ ─────────────────────────────────────────────────────  │ │
│   │ [ ] Requis                                              │ │
│   └───────────────────────────────────────────────────────┘ │
│   [+ Ajouter un filtre query]                                │
└─────────────────────────────────────────────────────────────┘
```

Points clés :

- Titres de sous-section `FILTRES BODY` / `FILTRES QUERY` : `text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500`, même registre que les séparateurs `ET` existants (cohérent avec la palette déjà en place, pas une nouvelle catégorie visuelle).
- **Le bloc d'alerte apparaît seulement si `queryFilters.length > 0` pour ce scope**, en première position de la sous-section, avant tout filtre. Développé au §5.
- Le bloc de filtre query reprend la structure exacte d'un bloc body filter (`rounded-md border border-gray-200 bg-gray-50 p-3 space-y-2`), avec deux différences : le label « Paramètre » au lieu de « Champ (dot-path) », et l'absence de sélecteur de sous-type sur les valeurs.
- La case « Requis » est en bas de bloc, séparée par un filet (`border-t border-gray-200 dark:border-gray-700 pt-2 mt-2`), parce qu'elle porte sur le filtre entier, pas sur une valeur en particulier.

### 4.3 Ligne dépliée, scope GET (pas de body possible)

```
┌─────────────────────────────────────────────────────────────┐
│ ▼ GET:/v1/items                                    1 filtre [●]│
│                                                               │
│   FILTRES QUERY                                               │
│   ┌─ [ ! ] Ce scope refuse maintenant tout paramètre de   ┐  │
│   │        query non listé ci-dessous...      [DRAFT §12.14]│
│   └──────────────────────────────────────────────────────┘  │
│   ┌───────────────────────────────────────────────────────┐ │
│   │ Filtre 1                                        [bin] │ │
│   │ Paramètre : [ status                                ] │ │
│   │ Type      : [ Valeur exacte                     |v]   │ │
│   │ Valeurs (une des suivantes) :                          │ │
│   │   [ open                                       ] [x]  │ │
│   │   [ pending                                    ] [x]  │ │
│   │ [+ Ajouter une valeur]                                 │ │
│   │ ─────────────────────────────────────────────────────  │ │
│   │ [x] Requis                                              │ │
│   │     Si actif, la requête doit inclure ce paramètre.     │ │
│   │     Sinon, il reste optionnel mais sa valeur doit        │ │
│   │     correspondre s'il est présent.                       │ │
│   └───────────────────────────────────────────────────────┘ │
│   [+ Ajouter un filtre query]                                │
└─────────────────────────────────────────────────────────────┘
```

**Pas de sous-section « FILTRES BODY » du tout** pour un scope GET, pas un bloc grisé/désactivé. Une section vide et grisée coûte de la hauteur pour ne rien dire ; l'absence pure et simple de la section dit la même chose (« sans objet ici ») avec zéro coût.

### 4.4 Mobile (< 640px)

Le bloc de filtre query est déjà plus étroit qu'un bloc body filter (pas de sélecteur de sous-type à côté de l'input valeur), donc le passage en mobile est plus favorable que pour les body filters. Le stack vertical déjà en place (`space-y-2`, inputs `w-full`) s'applique sans changement structurel. Le bloc d'alerte passe en pleine largeur, padding réduit, comme tout autre bloc d'alerte du formulaire.

---

## 5. Le mécanisme anti-piège : rendre la bascule inratable

C'est le point le plus important de cette tâche, je le traite à part de l'inventaire de wireframes ci-dessus.

### 5.1 Le problème à résoudre

Un utilisateur ajoute un `QueryFilter` sur `status` en pensant contraindre `status`. Il vient, sans le savoir, de refuser tout autre paramètre sur ce scope. S'il teste dans le testeur de scopes avec exactement `?status=open`, tout marche. Le piège se déclenche en production, sur un `utm_source` collé par un navigateur, un `_` de cache-busting ajouté par une librairie, ou un paramètre de pagination qu'il avait oublié qu'il utilisait. Le testeur de scopes ne le sauve pas non plus s'il ne pense pas à tester avec un paramètre parasite, ce qui est précisément le genre de test que personne ne pense à écrire.

### 5.2 Ce qui ne marche pas : un texte d'aide statique

Un `HINT_CLASS` sous le champ « Paramètre » type « Ajouter un filtre restreint tous les autres paramètres du scope » ne suffit pas, pour deux raisons :
1. Il est présent **avant** que l'utilisateur ait ajouté quoi que ce soit, donc il n'est pas encore vrai au moment où on le lit, et le lecteur n'a aucune raison de le relire au bon moment (juste après avoir cliqué sur « + Ajouter un filtre query »).
2. Un hint se fond visuellement dans la masse de hints du formulaire (`text-xs text-gray-500`), il n'a pas le poids visuel d'un changement de comportement aussi radical (opt-in → déni par défaut de tout un axe).

### 5.3 Décision : un bloc d'alerte piloté par l'état, pas par un événement

Le bloc `ALERT_CAUTION_CLASS` (déjà défini dans `constants.ts`, icône `AlertTriangleIcon`, sans titre conformément à §12.13) s'affiche **si et seulement si** `queryFiltersData[scopeKey].length > 0`, en première position de la sous-section « Filtres query », avant la liste des blocs de filtre.

Propriétés qui répondent directement à la consigne :

- **Il apparaît au bon moment sans logique dédiée à détecter.** Comme le panneau se re-rend entièrement à chaque mutation (`renderPanel()`, pattern déjà en place dans `body-filters.ts`), le clic sur « + Ajouter un filtre query » qui fait passer `queryFilters.length` de 0 à 1 provoque, dans le même re-rendu, l'apparition du bloc de filtre **et** du bloc d'alerte juste au-dessus. L'utilisateur voit les deux dans le même geste, sans scroll, sans notification séparée qui pourrait être manquée.
- **Il ne se ferme pas.** Ce n'est pas une bannière dismissible : il n'y a pas de bouton « x » dessus. Il reste affiché tant que le fait qu'il décrit reste vrai (`queryFilters.length > 0`), y compris si l'utilisateur quitte la ligne et y revient plus tard, y compris après un import de config existante. C'est la différence structurelle avec « un texte d'aide qu'il aura fermé » : il n'y a rien à fermer, l'état persiste tant que la cause persiste.
- **Il ne mine pas le formulaire.** Il n'existe que dans la sous-section « Filtres query » d'un scope qui a **déjà** au moins un filtre query, donc uniquement pour les scopes concernés, et seulement quand ce scope est déplié. Un utilisateur qui n'utilise que des body filters, ou qui n'a pas encore ouvert le panneau, n'en voit jamais la couleur. Ce n'est pas un avertissement ambiant, c'est une propriété affichée de l'état exact où l'utilisateur se trouve.
- **La gravité tient dans le texte seul** (§12.13, l'icône et la couleur ne sont pas le seul porteur du niveau). Le texte doit énoncer la conséquence, pas la catégoriser. Mon brouillon (`[DRAFT]`, à remplacer par la copy réelle de §12.14) :

  > Ce scope refuse maintenant tout paramètre de query non listé ci-dessous, y compris un `utm_source` de navigateur ou un `_` de cache-busting.

  Structure : conséquence d'abord (« refuse maintenant »), exemples concrets ensuite pour ancrer le risque dans du réel plutôt que de l'abstrait. Zéro qualificatif de catégorie (« Attention », « Important »), conforme à la règle des blocs d'alerte.

- **Accessibilité de l'alerte.** La sous-section « Filtres query » (le conteneur qui englobe l'alerte et les blocs de filtre) porte `aria-live="polite"`, comme `#scope-chips` et `#test-scope-results` déjà dans le produit. L'apparition du bloc d'alerte au moment où `queryFilters` passe de 0 à 1 est donc annoncée aux lecteurs d'écran, indépendamment du déplacement de focus vers le nouveau champ « Paramètre » (comportement existant conservé, focus sur le nouvel input après ajout).

### 5.4 Pourquoi ce n'est pas un remplacement pour la doc

Le panneau Doc (sidebar) et `/llms.txt` doivent aussi porter cette règle en toutes lettres, avec sa portée complète (§18.4 dans la version actuelle de specs.md, à réécrire par le PO pour la version livrée). L'alerte contextuelle ne remplace pas la documentation de référence, elle intervient au bon moment pour l'utilisateur qui ne l'a pas lue.

---

## 6. Testeur de scopes : diagnostic sous un scope refusé

### 6.1 Le problème

`checkRequestAccess` retourne déjà `denialReason: "query"` dans son union de types (`src/middleware/scopes.ts`), non encore produit par le code actuel. Une fois `queryFilters` livré, un scope refusé pour cette raison doit le dire : sinon l'utilisateur qui voit « Accès refusé » sur une ligne de scope va corriger son chemin ou sa méthode au hasard, alors que le scope matchait très bien et que c'est un paramètre de query précis qui bloque.

Le PO a fixé le contenu et la condition d'affichage (que je n'ai pas pu lire dans ce worktree, cf. §0). Ma tâche porte sur la forme, je la traite intégralement ici, avec un texte d'illustration en attendant le texte réel.

### 6.2 Décision : sous-ligne indentée, pas badge, pas tooltip

**Badge** écarté : un badge est fait pour un état court et catégorique (« 2 filtres », « refusé »), pas pour porter un nom de paramètre variable en longueur. Un badge qui doit s'étirer pour contenir `X-Requested-With` perd son affordance de badge.

**Tooltip** écarté, pour une raison qui n'est pas esthétique : un tooltip n'atteint ni le clavier ni les lecteurs d'écran sans un travail d'implémentation dédié (trigger focusable, `aria-describedby`, gestion `Escape`), pour un produit qui n'a par ailleurs aucun tooltip existant à répliquer. Ajouter un pattern d'interaction entièrement nouveau pour un seul cas d'usage, alors qu'un mécanisme plus simple couvre le besoin nativement, est le genre d'inconsistance que ce produit évite déjà ailleurs (cf. `title` sur les chips, qui est un attribut natif, pas un tooltip fabriqué).

**Sous-ligne indentée retenue**, parce qu'elle prolonge un pattern déjà présent dans le produit à trois endroits : le texte de résumé des chips (`filterSummary`, un texte descriptif à côté du scope), les labels `ET`/`Condition N sur M` des body filters, et plus généralement l'usage de `ml-3`/`pl-4` pour montrer une relation parent-enfant par l'indentation. C'est aussi la plus accessible par construction : c'est du texte simple dans le DOM, lu naturellement par un lecteur d'écran comme suite du contenu de la région `aria-live`, sans JS de positionnement, sans état de survol à gérer.

### 6.3 Emplacement exact

`createResultRow()` (`src/ui/client/test-scope.ts`) construit aujourd'hui une seule `<div class="flex items-center gap-2 text-xs font-mono">` par scope, avec l'icône ✓/✗ et le label du scope. Je propose d'envelopper cette ligne et une éventuelle ligne de détail dans un conteneur commun :

```
┌ (wrapper "space-y-0.5", un par scope, remplace l'append direct de createResultRow) ┐
│  ✗  POST:/v1/apps/my-app/deployments [1 body filter(s)]                            │
│     └ [DRAFT contenu PO] Paramètre bloquant : git_ref                          │
└──────────────────────────────────────────────────────────────────────────────────┘
```

- La ligne de détail est indentée pour s'aligner sous le **label** du scope, pas sous l'icône (`pl-5`, largeur de l'icône + son `gap-2`, à ajuster en intégration selon le rendu réel).
- Style : `text-xs text-gray-500 dark:text-gray-400 pl-5`, même registre que les hints existants (contraste corrigé selon I2 de l'audit a11y, cf. §9.5).
- Le connecteur visuel (`└` ou équivalent) est décoratif, `aria-hidden="true"`, exactement comme les chevrons et labels `ET` existants. Le texte utile porte l'information seul.
- **Condition d'affichage** que je pose comme hypothèse de travail, à confirmer avec le dev puisqu'elle touche la forme du verdict que je ne code pas : la ligne apparaît quand `verdict.denialReason === "query"` pour ce scope précis. Le champ exact qui porte le ou les paramètres bloquants (nom proposé : `blockedQueryParams: string[]`) reste à définir par le dev en cohérence avec `AccessVerdict`, mais la forme d'affichage ci-dessus reste valable quel que soit le nom retenu côté types.
- **Plusieurs paramètres bloquants à la fois** : je recommande de les lister sur la même sous-ligne, séparés par une virgule, plutôt qu'une sous-ligne par paramètre. Le cas réel (un `utm_source` en trop) est presque toujours un seul paramètre ; une liste à une seule sous-ligne évite de faire grossir la hauteur du testeur pour un cas limite.

### 6.4 Et la note globale « la query n'est pas contrainte » ?

`#test-query-note` (`ALERT_INFO_CLASS`, texte actuel : « La query n'est pas contrainte par les scopes : tous les paramètres passent. ») existe **précisément** parce que la query n'était pas contrainte. Le texte de specs.md qui la documente le dit lui-même : « La note sur la query est permanente tant que `queryFilters` n'est pas livré » (§12.5 dans la version 4.0). Une fois `queryFilters` livré, l'affirmation blanket devient fausse par construction (un scope peut désormais contraindre la query), donc le bloc dans sa forme actuelle doit disparaître : ce n'est pas une hypothèse de ma part, c'est la conséquence directe de la phrase qui le documente déjà.

Je recommande de retirer `#test-query-note` tel quel et de laisser le diagnostic par scope (§6.2-6.3) porter seul l'information, pour deux raisons : ça évite de maintenir deux mécanismes qui se recouvrent partiellement, et ça retire une ligne d'`ALERT_INFO_CLASS` systématique dès qu'un `?` apparaît dans le chemin testé, ce qui est un gain net sur le budget de hauteur du testeur.

Un raffinement possible, non bloquant, que je pose en question ouverte plutôt qu'en décision (§12) : pour un scope qui **matche** mais dont `queryFilters` est absent, faut-il une sous-ligne informative « query non contrainte pour ce scope » à côté du ✓, pour éviter une fausse confiance ? Ce serait le même mécanisme de sous-ligne, réutilisé en registre neutre plutôt qu'en alerte. Je ne le tranche pas ici : ça dépend de la copy réelle et de l'avis du PO sur le niveau de bruit acceptable pour un cas qui n'est pas un problème.

---

## 7. Interactions

### 7.1 Ajouter le premier filtre query d'un scope (la bascule)

1. Scope déplié, sous-section « Filtres query » visible, vide (pas encore de bloc d'alerte).
2. Clic sur « + Ajouter un filtre query ».
3. Re-rendu : le bloc d'alerte (§5.3) apparaît en tête de sous-section, suivi du nouveau bloc de filtre (type par défaut « Valeur exacte », une valeur vide).
4. Focus sur le champ « Paramètre » du nouveau filtre (identique au comportement body filters existant).
5. Badge de la ligne de scope repliée passe de « 0 filtre » à « 1 filtre » (ou `N body · 1 query` si des body filters existent déjà), point violet ajouté.

### 7.2 Ajouter une valeur à un filtre existant

Identique au pattern body filters : bouton « + Ajouter une valeur », nouvel input texte vide, focus dessus. Pas de sélecteur de sous-type à gérer (différence avec body filters, cf. §2).

### 7.3 Supprimer le dernier filtre query d'un scope

Le bloc d'alerte disparaît dans le même re-rendu que la suppression du dernier filtre (`queryFilters.length` repasse à 0). C'est cohérent avec le principe « piloté par l'état » : l'alerte ne ment jamais sur l'état courant, y compris en repassant à absent.

### 7.4 Bascule de la case « Requis »

Changement d'état immédiat, pas de re-rendu de panneau nécessaire (contrairement à un changement de type), donc pas de perte de focus. Le résumé de chip (§8) doit refléter le changement au prochain re-rendu des chips.

### 7.5 Changer le type d'un filtre query

Même comportement que les body filters : passer à `wildcard` vide les valeurs, passer à `not`/`and` ouvre le bloc imbriqué correspondant (même palette amber/sky que les body filters, cf. §9.2), perte des valeurs précédentes sans confirmation (cohérent avec l'existant).

---

## 8. Chips et résumé combiné

Le chip d'un scope (`#scope-chips`) doit désormais pouvoir résumer les deux axes. Format proposé, dans l'esprit de `filterSummary()` existant :

```
truncatePath(scopeKey) + " → " + [résumé body, résumé query].filter(Boolean).join(" · ")
```

Le résumé query reprend la syntaxe déjà en place pour `filterSummary` (`param = val1 | val2`, `param exists`, `param ≠ val`, `param = (cond1 ET cond2)`), avec un marqueur compact pour `required` : suffixe `*` sur le nom du paramètre dans le texte tronqué visible (`status* = open | pending`), et la mention complète « (requis) » dans l'attribut `title` du chip, qui porte déjà le texte non tronqué (pattern existant, aucune nouveauté d'implémentation).

Exemple de chip complet :

```
┌────────────────────────────────────────────────────────────────────┐
│ POST:.../deployments → git_ref = release/*  ·  status* = open|pend… │
│                                                              [e] [x]│
└────────────────────────────────────────────────────────────────────┘
```

Le bouton « × » (« Supprimer le scope X et ses filtres ») doit vider les deux structures de données (body **et** query) pour ce scope, pas seulement l'une des deux. Note d'implémentation, pas une décision de design, mais je la signale pour ne pas laisser de données orphelines.

---

## 9. Accessibilité

Passe complète sur le nouveau formulaire, pas seulement sur la case « Requis », en cohérence avec `docs/review/a11y-audit.md`.

### 9.1 Case « Requis » : le point demandé explicitement

Le pattern toggle existant (`sidebar-panels.tsx`, `#logs-enabled`/`#logs-detailed`) est un gros interrupteur visuel, pensé pour un réglage global rare. Une case « Requis » se répète une fois par filtre, dans un formulaire déjà dense : je recommande une **case à cocher native compacte**, pas le pattern toggle, pour rester dans le même registre de densité que le reste du bloc de filtre. Les principes d'accessibilité du pattern existant sont conservés à l'identique, seule la peau change :

```jsx
<label class="flex items-start gap-2 mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 cursor-pointer">
  <input
    type="checkbox"
    id={`qf-required-${filterData.id}`}
    class="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 accent-fgp-600 focus:outline-none focus:ring-2 focus:ring-fgp-500 focus:ring-offset-1 dark:border-gray-600 dark:bg-gray-700 dark:focus:ring-offset-gray-800"
    aria-describedby={`qf-required-help-${filterData.id}`}
  />
  <span class="flex-1">
    <span class="text-sm text-gray-700 dark:text-gray-300">Requis</span>
    <p id={`qf-required-help-${filterData.id}`} class={HINT_CLASS}>
      Si actif, la requ&ecirc;te doit inclure ce param&egrave;tre. Sinon, il reste
      optionnel mais sa valeur doit correspondre s'il est pr&eacute;sent.
    </p>
  </span>
</label>
```

Points d'association :

- **Label natif** : `<input>` est un enfant de `<label>`, l'association est implicite et robuste (pas besoin de `for`/`id` séparés, bien que l'`id` existe pour l'`aria-describedby`).
- **`aria-describedby`** pointe vers le texte d'aide, qui est un `<p>` toujours présent dans le DOM (pas injecté/retiré), donc pas de risque de référence cassée pendant un re-rendu.
- **`accent-fgp-600`** : utilitaire natif Tailwind 3 (accent-color CSS), pas besoin du plugin `@tailwindcss/forms` qui n'est pas installé sur ce projet. Vérifié contre `tailwind.config.js` (aucun plugin déclaré) et `deno.json` (`npm:tailwindcss@3`, version récente du 3.x où `accent-*` est disponible en core plugin).
- **Focus visible** : `focus:ring-2 focus:ring-fgp-500`, cohérent avec tous les contrôles du formulaire.
- ID dynamique par `filterData.id`, même pattern que `bf-field-${filterData.id}` existant, garantit l'unicité même avec plusieurs filtres query sur la page.

### 9.2 Reprise des correctifs déjà identifiés par l'audit

Ce nouveau formulaire est un bon endroit pour ne **pas** réintroduire les défauts déjà documentés :

- **C1 (aria-live)** : la sous-section « Filtres query » d'un scope porte `aria-live="polite"` dès sa création (§5.3). Ce n'est pas une nouveauté, c'est l'application au nouveau code de la correction déjà prescrite pour `#scope-chips`.
- **C2 (focus après suppression)** : suppression d'un filtre query → focus sur le bouton « + Ajouter un filtre query » (même pattern que `btnDelete` existant pour les body filters, l.706-714 de `body-filters.ts`). Suppression d'une valeur → focus sur la valeur précédente, ou sur « + Ajouter une valeur » s'il n'en reste qu'une.
- **C3 (labels « ET » non accessibles)** : si le formulaire query reprend les blocs `and`/`not` (§7.5), il reprend le `role="group"` + `aria-label="Groupe de conditions ET"` déjà en place pour le `and`, pas le pattern `aria-label` sur un `<span>` nu identifié comme défaillant pour le séparateur `ET` de premier niveau. Autrement dit : ne pas copier le défaut, copier le correctif recommandé par l'audit (`role="separator"` sur le conteneur du `ET` entre filtres).
- **I2 (contraste des hints)** : tous les textes `HINT_CLASS`/gris de ce formulaire (aide « Requis », labels de sous-section, texte des sous-lignes de diagnostic) utilisent `text-gray-500 dark:text-gray-400`, le pattern jugé correct par l'audit, jamais `text-gray-400` en light ou `text-gray-500` en dark seul.
- **I3 (bouton sans état)** : le bouton « + Ajouter des filtres sur un scope... » (renommé, §3) doit porter `aria-expanded` + `aria-controls="body-filters-panel"`. C'est un correctif déjà dû sur le bouton existant, indépendant de cette feature, mais comme ce lot touche déjà ce bouton pour son texte, c'est le moment de l'ajouter plutôt que de le manquer une seconde fois.
- **I4 (chips sans rôle de liste)** : si le dev applique aussi cette correction en marge, `role="list"` sur `#scope-chips` et `role="listitem"` par chip couvrent aussi les nouveaux chips combinés body+query sans traitement spécial.
- **I6 (selects imbriqués sans label)** : tout select de type dans un bloc `not`/`and` imbriqué côté query filters porte un `aria-label` explicite (« Type de la condition d'exclusion », etc.), comme recommandé pour le défaut équivalent côté body filters.

### 9.3 Nouveaux éléments propres à ce formulaire

- **Champ « Paramètre »** : `<label for={...}>Paramètre</label>` associé nativement, comme le « Champ (dot-path) » des body filters.
- **Select « Type »** : label associé, mêmes 6 options texte que les body filters (§2), pas de changement d'accessibilité par rapport à l'existant.
- **Bloc d'alerte de bascule (§5.3)** : icône `<AlertTriangleIcon />` déjà `aria-hidden="true"` dans son composant (`icons.tsx`, vérifié), donc rien à ajouter à ce niveau. Le texte seul porte le sens, conforme à §12.13.
- **Ligne de diagnostic du testeur (§6.3)** : connecteur visuel `aria-hidden="true"`, texte simple dans le flux normal du DOM, hérite de `aria-live="polite"` déjà présent sur `#test-scope-results`.
- **Points violet/fgp des badges de ligne repliée (§4.1)** : décoratifs, `aria-hidden="true"`, l'information est déjà portée par le texte du badge (« N body · M query »), exactement le principe déjà appliqué au point `bg-fgp-500` existant.

---

## 10. Tableau Tailwind classes

| Élément | Classes |
|---|---|
| Titre de sous-section (« FILTRES BODY » / « FILTRES QUERY ») | `text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1` (première occurrence sans `mt`, seconde avec `mt-3`) |
| Point de comptage body (inchangé) | `w-2 h-2 rounded-full bg-fgp-500 inline-block` |
| Point de comptage query (nouveau) | `w-2 h-2 rounded-full bg-violet-500 dark:bg-violet-400 inline-block` |
| Bloc de filtre query (parent) | identique au body filter : `rounded-md border border-gray-200 bg-gray-50 p-3 space-y-2 dark:bg-gray-700/50 dark:border-gray-600` |
| Séparateur avant case « Requis » | `mt-2 pt-2 border-t border-gray-200 dark:border-gray-700` |
| Checkbox « Requis » | `mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 accent-fgp-600 focus:outline-none focus:ring-2 focus:ring-fgp-500 focus:ring-offset-1 dark:border-gray-600 dark:bg-gray-700 dark:focus:ring-offset-gray-800` |
| Alerte de bascule (réutilise `ALERT_CAUTION_CLASS` de `constants.ts`) | `flex items-start gap-2 rounded-md border border-l-4 p-2 text-xs border-amber-200 border-l-amber-500 bg-amber-50 text-amber-800 dark:border-amber-700 dark:border-l-amber-500 dark:bg-amber-900/30 dark:text-amber-300` |
| Sous-ligne de diagnostic (testeur de scopes) | `pl-5 text-xs text-gray-500 dark:text-gray-400` |
| Connecteur décoratif de la sous-ligne | `aria-hidden="true"`, pas de classe de couleur propre, hérite du parent |

Aucune classe hors du jeu déjà compilé par `tailwind.config.js` : `violet-*` et `accent-*` font partie de la palette et des utilitaires par défaut de Tailwind 3, aucune extension de config nécessaire.

---

## 11. Limites UX et éligibilité

### 11.1 Tous les scopes deviennent éligibles au panneau

Avec les body filters seuls, le panneau ne montrait que les scopes POST/PUT/PATCH/`*` (rare, opt-in visible seulement quand pertinent). Avec les query filters, **tout scope est éligible**, puisque toute méthode peut porter une query. Concrètement, le panneau listera potentiellement une ligne par scope déclaré dès qu'il est ouvert, y compris des scopes qui ne seront jamais enrichis.

Le coût réel reste borné : chaque ligne repliée fait une seule ligne compacte (`~36px`), le panneau lui-même reste caché tant que le bouton n'est pas cliqué, et rien ne s'ouvre automatiquement. Je pose quand même la question en §12 plutôt que de trancher unilatéralement, parce que ça change la population par défaut d'un panneau qui était jusqu'ici clairsemé.

### 11.2 Profondeur `not`/`and` inchangée

Les mêmes limites que les body filters (`and-filter-ui.md` §4.1) s'appliquent : 2 niveaux visuels max (filtre → `and`/`not` → `not` imbriqué dans un `and`), pas de `and` dans un `and`. Rien de spécifique à la query qui justifierait une limite différente.

### 11.3 Pas de dot-path

Contrairement aux body filters, un paramètre de query est une clé plate (`status`, `per_page`), jamais un chemin imbriqué. Le champ s'appelle « Paramètre », pas « Champ (dot-path) », et n'a pas besoin du hint mentionnant la notation par points.

---

## 12. Points ouverts, pour le lead et pour le dev

1. **Copy réelle manquante (§0, §5.3, §6.3).** Je n'ai pas pu lire `docs/specs.md` §19/§12.14 dans ce worktree. Tous les textes marqués `[DRAFT]` doivent être remplacés par le texte PO réel avant intégration. Si le texte réel diverge fortement en longueur de mes brouillons, revalider que le bloc d'alerte (§5.3, actuellement 2-3 lignes en `text-xs`) reste dans un gabarit raisonnable : c'est un bloc qui doit rester lisible d'un coup d'œil, pas devenir un paragraphe.

2. **Champ exact du verdict pour le diagnostic (§6.3).** J'ai supposé `denialReason === "query"` (déjà dans l'union de types) plus un champ à créer portant le ou les paramètres bloquants. Le nom et la forme exacte de ce champ sont une décision dev, pas designer ; ma spec de forme (sous-ligne indentée) reste valable quel que soit le nom retenu, mais le dev doit confirmer la donnée disponible avant l'implémentation.

3. **Renommage des IDs du panneau (§3).** Je recommande de garder les IDs existants et de ne changer que le texte visible, pour limiter le risque de régression sur du code déjà testé. Si le dev préfère renommer pour la clarté du code (`btn-add-body-filters` porte mal son nouveau rôle), c'est un arbitrage de coût qui lui revient.

4. **Éligibilité totale des scopes dans le panneau (§11.1).** Je documente le changement de population plutôt que de le limiter artificiellement, mais si le lead ou le PO juge qu'un panneau qui liste soudain tous les scopes (même ceux sans aucun filtre) est un problème de bruit visuel, une alternative existe : n'afficher une ligne pour un scope sans aucun filtre que si l'utilisateur clique un contrôle dédié plutôt que de les lister toutes par défaut. Je ne le recommande pas spontanément (ça complexifie l'entrée dans le panneau pour un gain de compacité modeste), mais je le signale.

5. **Sous-ligne informative pour un scope qui passe sans contrainte de query (§6.4, fin).** Non tranché : dépend du niveau de bruit jugé acceptable une fois la copy réelle connue.

6. **Suppression de `#test-query-note` (§6.4).** Je la recommande fortement, avec la justification tirée du texte même de specs.md v4.0, mais c'est un changement de comportement visible qui mérite un accord explicite du PO avant que le dev ne la retire, puisque c'est un texte que le PO a lui-même écrit et daté comme temporaire.
