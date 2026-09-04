# Design Document : Query Filters UI (blob v5)

**Feature** : axe `queryFilters` sur `ScopeEntry`, formulaire de configuration + diagnostic dans le testeur de scopes
**Date** : 2026-09-04
**Auteur** : Designer FGP
**Statut** : Draft v2, passe de réconciliation après retour lead et challenge testeur
**Prérequis** : `body-filters-ui.md` (gabarit repris), `and-filter-ui.md` (palette d'imbrication reprise à l'identique)

---

## 0. Note sur les sources, à lire avant tout

**Historique de ce document, en deux temps.** La version 1 a été écrite dans un worktree dont le HEAD était antérieur au commit de la spec du PO : ni §19, ni §12.14 n'existaient. J'avais construit le mécanisme sur le seul socle disponible, ADR-0009 §4, en le signalant explicitement plutôt que d'inventer une copy. Le lead a confirmé après coup que ce choix était le bon et que le socle tenait.

Cette version 2 est une **passe de réconciliation**, pas une réécriture : elle intègre `docs/specs.md` §19 (structure et sémantique complètes) et §12.14 (copy réelle du formulaire), lus intégralement avant la coupure de session, ainsi que les corrections issues du challenge du testeur (`docs/review/challenge-query-filters-v5.md`), en particulier ses points B3, B4, B5, T1 et T2, qui changent des points que la v1 tenait pour acquis. `docs/limits.md` n'a en revanche pas été relu dans sa version révisée (§11.5, et point 8 de la liste des points ouverts en §12) : je m'appuie sur les chiffres transmis directement par le lead pour le plafond à deux paliers, pas sur le fichier lui-même.

**Ce qui reste ouvert au moment où j'écris cette version.** Le PO révise actuellement §12.5 et §12.14 pour intégrer les arbitrages de l'architecte sur B3 (quatre causes de refus, pas trois) et B5 (plafond d'occurrences à deux paliers). J'ai donc travaillé en deux temps : d'abord tout ce qui ne dépend pas du texte exact (mécanismes, conditions d'affichage, structure), puis la substitution de copy, en n'insérant du texte définitif que là où le challenge le confirme stable (l'alerte de bascule de §5.3, qualifiée de « meilleure page de la spec » par le testeur en A7 ; le texte de la case « Requis »). Les messages qui dépendent directement des arbitrages en cours (le quatrième message de diagnostic, le texte du nouvel indice au choix de `regex`) restent marqués `[DRAFT, texte PO à venir]`, avec la sémantique et le nombre exact de mots-clés déjà fixés pour ne pas bloquer le dev sur la forme.

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

**Réconciliation avec §12.14 : titres de sous-section, pas de panneau.** La copy PO (§12.14) décrit un bouton d'ouverture (« + Ajouter des filtres query sur un scope... ») et un titre de panel (« Query Filters (avancé) ») propres à l'axe query, formulés en miroir du gabarit body filters existant. Lus littéralement, ces deux libellés supposent un second bouton et un second panel, ce qui contredirait l'unification ci-dessus, que le lead a validée explicitement. Je résous cette tension en m'appuyant sur la répartition des rôles déjà écrite par le PO lui-même (§12.11, « le mécanisme relève du designer, la formulation de moi ») : je garde un seul bouton et un seul panel (mécanisme, mon domaine), et je réutilise le texte du PO tel quel, mais comme **titre de sous-section** plutôt que de panel. « Body Filters (avancé) » (le titre de panel actuel, qui devient disponible une fois le panel unifié sous un nom différent) et « Query Filters (avancé) » (texte du PO) deviennent donc les deux en-têtes de sous-section de la ligne dépliée (§4.2), remplaçant mes intitulés provisoires « FILTRES BODY » / « FILTRES QUERY » de la v1. Aucun mot n'est inventé, la totalité du texte visible reste soit déjà livré, soit écrit par le PO ; seul l'endroit où il atterrit change. Le bouton d'ouverture et le titre du panel englobant restent ma formulation de mécanisme (§3, « + Ajouter des filtres sur un scope... », « Filtres avancés »), à confirmer par le PO puisque c'est la seule copy de ce document qui n'existe dans aucune version de §12.14.

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
│   Body Filters (avancé)                                      │
│   ┌───────────────────────────────────────────────────────┐ │
│   │ Filtre 1                                        [bin] │ │
│   │ ...(inchangé, cf. body-filters-ui.md)...               │ │
│   └───────────────────────────────────────────────────────┘ │
│   [+ Ajouter un filtre body]                                 │
│                                                               │
│   Query Filters (avancé)                                     │
│   ┌─ [ ! ] Dès qu'un filtre query est ajouté à ce scope,    ┐ │
│   │        tout paramètre de query non déclaré ici fait     │ │
│   │        échouer la requête. Ce n'est pas une contrainte  │ │
│   └        en plus : c'est un refus par défaut sur tout le ─┘ │
│            reste de la query.                                │
│                                                               │
│   ┌───────────────────────────────────────────────────────┐ │
│   │ Filtre 1                                        [bin] │ │
│   │ Paramètre de query : [ git_ref                      ] │ │
│   │ Nom exact du paramètre, tel qu'il apparaît dans l'URL. │ │
│   │ Pas de notation par point.                             │ │
│   │ Type      : [ Pattern (wildcard)                |v]   │ │
│   │ Valeurs (une des suivantes) :                          │ │
│   │   [ release/*                                  ] [x]  │ │
│   │ [+ Ajouter une valeur]                                 │ │
│   │ ─────────────────────────────────────────────────────  │ │
│   │ [ ] Requis                                              │ │
│   │     Décochée (par défaut), ce paramètre peut être        │ │
│   │     absent de la requête, ce n'est pas un problème.       │ │
│   │     Cochée, la requête est refusée si ce paramètre        │ │
│   │     est absent.                                           │ │
│   └───────────────────────────────────────────────────────┘ │
│   [+ Ajouter un filtre query]                                │
└─────────────────────────────────────────────────────────────┘
```

Points clés :

- Titres de sous-section « Body Filters (avancé) » / « Query Filters (avancé) » : `text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500`, même registre que les séparateurs `ET` existants (cohérent avec la palette déjà en place, pas une nouvelle catégorie visuelle). Texte repris tel quel de §12.14, cf. §3 pour la réconciliation panel/sous-section.
- **Le bloc d'alerte apparaît seulement si `queryFilters.length > 0` pour ce scope**, en première position de la sous-section, avant tout filtre. Copy réelle de §12.14, développé au §5.
- Le bloc de filtre query reprend la structure exacte d'un bloc body filter (`rounded-md border border-gray-200 bg-gray-50 p-3 space-y-2`), avec les écarts fixés par §12.14 : label « Paramètre de query » (pas « Champ (dot-path) »), placeholder `status`, hint sous le champ précisant l'absence de notation par point, et l'absence de sélecteur de sous-type sur les valeurs.
- La case « Requis » est en bas de bloc, séparée par un filet (`border-t border-gray-200 dark:border-gray-700 pt-2 mt-2`), parce qu'elle porte sur le filtre entier, pas sur une valeur en particulier. Texte d'aide repris de §12.14 (§9.1 pour le composant complet).

### 4.3 Ligne dépliée, scope GET (pas de body possible)

```
┌─────────────────────────────────────────────────────────────┐
│ ▼ GET:/v1/items                                    1 filtre [●]│
│                                                               │
│   Query Filters (avancé)                                      │
│   ┌─ [ ! ] Dès qu'un filtre query est ajouté à ce scope,   ┐  │
│   │        tout paramètre de query non déclaré ici fait     │  │
│   │        échouer la requête. Ce n'est pas une contrainte  │  │
│   └        en plus : c'est un refus par défaut sur tout    ─┘  │
│            le reste de la query.                                │
│   ┌───────────────────────────────────────────────────────┐ │
│   │ Filtre 1                                        [bin] │ │
│   │ Paramètre de query : [ status                       ] │ │
│   │ Type      : [ Valeur exacte                     |v]   │ │
│   │ Une valeur de query est toujours du texte, y compris   │ │
│   │ pour un nombre ou un booléen.                           │ │
│   │ Valeurs (une des suivantes) :                          │ │
│   │   [ open                                       ] [x]  │ │
│   │   [ pending                                    ] [x]  │ │
│   │ [+ Ajouter une valeur]                                 │ │
│   │ ─────────────────────────────────────────────────────  │ │
│   │ [x] Requis                                              │ │
│   │     Décochée (par défaut), ce paramètre peut être        │ │
│   │     absent de la requête, ce n'est pas un problème.       │ │
│   │     Cochée, la requête est refusée si ce paramètre        │ │
│   │     est absent.                                           │ │
│   └───────────────────────────────────────────────────────┘ │
│   [+ Ajouter un filtre query]                                │
└─────────────────────────────────────────────────────────────┘
```

**Pas de sous-section « Body Filters (avancé) » du tout** pour un scope GET, pas un bloc grisé/désactivé. Une section vide et grisée coûte de la hauteur pour ne rien dire ; l'absence pure et simple de la section dit la même chose (« sans objet ici ») avec zéro coût.

### 4.4 Mobile (< 640px)

Le bloc de filtre query est déjà plus étroit qu'un bloc body filter (pas de sélecteur de sous-type à côté de l'input valeur), donc le passage en mobile est plus favorable que pour les body filters. Le stack vertical déjà en place (`space-y-2`, inputs `w-full`) s'applique sans changement structurel. Le bloc d'alerte passe en pleine largeur, padding réduit, comme tout autre bloc d'alerte du formulaire.

---

## 5. Le mécanisme anti-piège : rendre la bascule inratable

C'est le point le plus important de cette tâche, je le traite à part de l'inventaire de wireframes ci-dessus.

### 5.1 Le problème à résoudre

Un utilisateur ajoute un `QueryFilter` sur `status` en pensant contraindre `status`. Il vient, sans le savoir, de refuser tout autre paramètre sur ce scope. S'il teste dans le testeur de scopes avec exactement `?status=open`, tout marche. Le piège se déclenche en production, sur un `utm_source` collé par un navigateur, un `_` de cache-busting ajouté par une librairie, ou un paramètre de pagination qu'il avait oublié qu'il utilisait. Le testeur de scopes ne le sauve pas non plus s'il ne pense pas à tester avec un paramètre parasite, ce qui est précisément le genre de test que personne ne pense à écrire.

### 5.2 Ce qui ne marche pas : un texte d'aide statique

Un `HINT_CLASS` sous le champ « Paramètre de query » type « Ajouter un filtre restreint tous les autres paramètres du scope » ne suffit pas, pour deux raisons :
1. Il est présent **avant** que l'utilisateur ait ajouté quoi que ce soit, donc il n'est pas encore vrai au moment où on le lit, et le lecteur n'a aucune raison de le relire au bon moment (juste après avoir cliqué sur « + Ajouter un filtre query »).
2. Un hint se fond visuellement dans la masse de hints du formulaire (`text-xs text-gray-500`), il n'a pas le poids visuel d'un changement de comportement aussi radical (opt-in → déni par défaut de tout un axe).

### 5.3 Décision : un bloc d'alerte piloté par l'état, pas par un événement

Le bloc `ALERT_CAUTION_CLASS` (déjà défini dans `constants.ts`, icône `AlertTriangleIcon`, sans titre conformément à §12.13) s'affiche **si et seulement si** `queryFiltersData[scopeKey].length > 0`, en première position de la sous-section « Query Filters (avancé) », avant la liste des blocs de filtre.

Propriétés qui répondent directement à la consigne :

- **Il apparaît au bon moment sans logique dédiée à détecter.** Comme le panneau se re-rend entièrement à chaque mutation (`renderPanel()`, pattern déjà en place dans `body-filters.ts`), le clic sur « + Ajouter un filtre query » qui fait passer `queryFilters.length` de 0 à 1 provoque, dans le même re-rendu, l'apparition du bloc de filtre **et** du bloc d'alerte juste au-dessus. L'utilisateur voit les deux dans le même geste, sans scroll, sans notification séparée qui pourrait être manquée.
- **Il ne se ferme pas.** Ce n'est pas une bannière dismissible : il n'y a pas de bouton « x » dessus. Il reste affiché tant que le fait qu'il décrit reste vrai (`queryFilters.length > 0`), y compris si l'utilisateur quitte la ligne et y revient plus tard, y compris après un import de config existante. C'est la différence structurelle avec « un texte d'aide qu'il aura fermé » : il n'y a rien à fermer, l'état persiste tant que la cause persiste.
- **Il ne mine pas le formulaire.** Il n'existe que dans la sous-section « Query Filters (avancé) » d'un scope qui a **déjà** au moins un filtre query, donc uniquement pour les scopes concernés, et seulement quand ce scope est déplié. Un utilisateur qui n'utilise que des body filters, ou qui n'a pas encore ouvert le panneau, n'en voit jamais la couleur. Ce n'est pas un avertissement ambiant, c'est une propriété affichée de l'état exact où l'utilisateur se trouve.
- **La gravité tient dans le texte seul** (§12.13, l'icône et la couleur ne sont pas le seul porteur du niveau). Le texte doit énoncer la conséquence, pas la catégoriser. Copy réelle, §12.14 :

  > Dès qu'un filtre query est ajouté à ce scope, tout paramètre de query non déclaré ici fait échouer la requête. Ce n'est pas une contrainte en plus : c'est un refus par défaut sur tout le reste de la query.

  Le testeur l'a notée A7 dans son challenge, « la meilleure page de la spec » : conséquence d'abord (« fait échouer la requête »), puis la reformulation qui coupe court à la lecture additive (« ce n'est pas une contrainte en plus »), sans un seul mot de catégorie (« Attention », « Important »). Je n'ai rien à ajouter à ce texte, mon travail se limite à vérifier que le mécanisme ne le trahit pas (§5.5) et que le gabarit l'encaisse (deux phrases, ~34 mots, tient en 2 à 3 lignes en `text-xs` sur la largeur d'une sous-section repliable, cohérent avec le budget déjà observé sur `#byok-warning` qui est du même ordre de longueur).

- **Accessibilité de l'alerte.** La sous-section « Query Filters (avancé) » (le conteneur qui englobe l'alerte et les blocs de filtre) porte `aria-live="polite"`, comme `#scope-chips` et `#test-scope-results` déjà dans le produit. L'apparition du bloc d'alerte au moment où `queryFilters` passe de 0 à 1 est donc annoncée aux lecteurs d'écran, indépendamment du déplacement de focus vers le nouveau champ « Paramètre de query » (comportement existant conservé, focus sur le nouvel input après ajout).

### 5.4 Pourquoi ce n'est pas un remplacement pour la doc

Le panneau Doc (§12.10, bloc 2 bis) et `/llms.txt` portent aussi cette règle en toutes lettres, avec sa portée complète (§19.7). L'alerte contextuelle ne remplace pas la documentation de référence, elle intervient au bon moment pour l'utilisateur qui ne l'a pas lue.

### 5.5 Confrontation à la §19.2 : le piège d'articulation

Le lead m'a demandé de vérifier explicitement un point que §19.2 nomme « le piège d'articulation à ne pas laisser un lecteur reconstruire seul » : le déni par défaut est une propriété du `ScopeEntry` entier dès que `queryFilters` est non vide, elle **ne se désactive pas filtre par filtre**. `required: false` sur le filtre `page` ne rend jamais tolérable un paramètre `sort` non déclaré ailleurs. C'est exactement la confusion qu'un utilisateur qui vient des body filters (purement additifs) va commettre spontanément.

Le mécanisme du §5.3 tient cette ligne à deux niveaux, et je vérifie les deux séparément plutôt que de l'affirmer :

1. **Le texte.** La copy réelle le dit en toutes lettres, en seconde phrase : « Ce n'est pas une contrainte en plus : c'est un refus par défaut sur tout le reste de la query. » Rien à changer.
2. **Le placement, qui est ma part et que je dois vérifier plutôt que supposer.** L'alerte est posée **une fois par scope**, en tête de la sous-section « Query Filters (avancé) », et sa condition d'affichage est `queryFilters.length > 0` pour le `ScopeEntry`, un test qui **ne lit la propriété `required` d'aucun filtre**. Concrètement : cocher ou décocher « Requis » sur n'importe quel filtre du scope ne fait ni apparaître, ni disparaître, ni reformuler l'alerte, parce que le code qui la pilote n'a jamais accès à `required` pour décider de son affichage (§5.3, condition = longueur du tableau, pas un scan de ses propriétés). Il est donc **structurellement impossible** qu'un utilisateur lise l'alerte comme une propriété du filtre qu'il vient de cocher : elle est visuellement rattachée à la sous-section entière, au-dessus de la liste des filtres, pas encapsulée dans le bloc d'un filtre en particulier où elle pourrait sembler dépendre de ses réglages.

Je n'ajoute pas de rappel de la règle dans le texte d'aide de la case « Requis » elle-même (§9.1, texte de §12.14 qui n'en parle pas). Deux raisons : la copy du PO ne le fait pas, ce n'est donc pas à moi de la compléter unilatéralement ; et répéter l'articulation à chaque case « Requis » de chaque filtre alourdirait un formulaire déjà dense pour une information déjà portée, une fois, au bon endroit. Si le PO ou le lead juge après coup qu'un rappel local est nécessaire, c'est un ajout de copy, pas un changement de mécanisme.

### 5.6 Le second piège, révélé par le challenge : la regex qui enferme

B5 du challenge testeur a montré qu'un plafond uniforme de 4 occurrences évaluées par requête rend la feature inutilisable sur toute API à paramètres répétés (Stripe `expand[]`, Elasticsearch `fields`, JSON:API `include`), précisément la famille que §19.1 cite comme cas d'usage principal. L'architecte a tranché : le plafond passe à **deux paliers**, 4 occurrences si le `queryFilter` contient au moins une valeur de type `regex` à n'importe quelle profondeur (y compris sous `not` ou dans un `and`), 64 sinon.

Ce n'est pas qu'un chiffre qui change, c'est une **porte de sortie** qui doit devenir visible dans mon formulaire, parce que c'est elle qui débloque un utilisateur qui butera sur le plafond bas sans en connaître la cause : remplacer sa `regex` par un `stringwildcard` fait passer son filtre du palier à 4 au palier à 64, pour un coût de matching que le testeur a mesuré à un cinquantième de celui d'une regex (0,2 ms contre 10 à 16 ms pour 4 évaluations). C'est un choix de type dans le sélecteur « Type » de mon formulaire, donc c'est chez moi que la porte de sortie doit s'afficher, pas dans un guide qu'il faut aller chercher.

**Décision : un hint contextuel, pas une alerte.** Contrairement au déni par défaut (§5.3), ce n'est pas un risque de sécurité, c'est une information de capacité : je le traite donc au registre `HINT_CLASS` (`text-xs text-gray-500 dark:text-gray-400`), sans icône, cohérent avec tous les autres hints du formulaire, pas au registre `ALERT_CAUTION_CLASS`. Une alerte ici dévaluerait le vocabulaire visuel déjà établi pour le vrai risque du §5.3.

**Condition d'affichage et emplacement.** Le hint apparaît sous la zone d'édition des valeurs (après la liste de valeurs, ou après le bloc `not`/`and` s'il y en a un), avant le filet qui précède « Requis », **si et seulement si ce filtre contient au moins une valeur de type `regex` à n'importe quelle profondeur** : au niveau racine du filtre, dans l'exclusion d'un `not`, ou dans une condition d'un `and`. Un seul hint par bloc de filtre, quel que soit le nombre de `regex` qu'il contient, pour ne pas répéter le même message à chaque niveau d'imbrication et gonfler la hauteur d'un bloc déjà composite.

```
│   │ Type      : [ Expression régulière (regex)      |v]   │ │
│   │ Valeurs (une des suivantes) :                          │ │
│   │   [ ^\d+$                                      ] [x]  │ │
│   │ [+ Ajouter une valeur]                                 │ │
│   │ ⓘ [DRAFT, texte PO à venir] Avec une regex, ce         │ │
│   │   paramètre est limité à 4 occurrences par requête.     │ │
│   │   Remplacez la regex par un Pattern (wildcard) pour     │ │
│   │   un plafond à 64.                                       │ │
│   │ ─────────────────────────────────────────────────────  │ │
│   │ [ ] Requis                                              │ │
```

Le texte exact reste `[DRAFT, texte PO à venir]` : ce hint est une copy nouvelle, qui n'existait dans aucune version de §12.14 avant l'arbitrage du plafond à deux paliers, donc il n'y a pas de texte stable à substituer aujourd'hui. Ce qui est fixé, et qui ne bougera pas au prochain aller-retour avec le PO : les deux chiffres (4 et 64), la condition d'affichage (présence d'un `regex` à n'importe quelle profondeur), le registre visuel (hint, pas alerte), et le fait que le texte doit nommer l'alternative concrète (passer à `stringwildcard`), pas seulement constater la limite. §12 récapitule ce point comme ouvert.

**Ce hint ne concerne que les query filters.** Le plafond d'occurrences n'existe pas pour les body filters (une clé JSON répétée n'est pas le même objet qu'un paramètre de query répété), donc rien ne change au gabarit body filters existant.

---

## 6. Testeur de scopes : diagnostic sous un scope refusé

### 6.1 Le problème

`checkRequestAccess` retourne déjà `denialReason: "query"` dans son union de types (`src/middleware/scopes.ts`), non encore produit par le code actuel. Une fois `queryFilters` livré, un scope refusé pour cette raison doit le dire : sinon l'utilisateur qui voit « Accès refusé » sur une ligne de scope va corriger son chemin ou sa méthode au hasard, alors que le scope matchait très bien et que c'est un paramètre de query précis qui bloque.

Le PO a fixé le contenu et la condition d'affichage en §12.5. Ma tâche porte sur la forme, je la traite intégralement ici. Le challenge testeur (B3) a changé un paramètre important de cette forme depuis la v1 de ce document : il y a **quatre** causes de refus sur l'axe query, pas trois, détaillées en §6.3.

### 6.2 Décision : sous-ligne indentée, pas badge, pas tooltip

**Badge** écarté : un badge est fait pour un état court et catégorique (« 2 filtres », « refusé »), pas pour porter un nom de paramètre variable en longueur. Un badge qui doit s'étirer pour contenir `X-Requested-With` perd son affordance de badge.

**Tooltip** écarté, pour une raison qui n'est pas esthétique : un tooltip n'atteint ni le clavier ni les lecteurs d'écran sans un travail d'implémentation dédié (trigger focusable, `aria-describedby`, gestion `Escape`), pour un produit qui n'a par ailleurs aucun tooltip existant à répliquer. Ajouter un pattern d'interaction entièrement nouveau pour un seul cas d'usage, alors qu'un mécanisme plus simple couvre le besoin nativement, est le genre d'inconsistance que ce produit évite déjà ailleurs (cf. `title` sur les chips, qui est un attribut natif, pas un tooltip fabriqué).

**Sous-ligne indentée retenue**, parce qu'elle prolonge un pattern déjà présent dans le produit à trois endroits : le texte de résumé des chips (`filterSummary`, un texte descriptif à côté du scope), les labels `ET`/`Condition N sur M` des body filters, et plus généralement l'usage de `ml-3`/`pl-4` pour montrer une relation parent-enfant par l'indentation. C'est aussi la plus accessible par construction : c'est du texte simple dans le DOM, lu naturellement par un lecteur d'écran comme suite du contenu de la région `aria-live`, sans JS de positionnement, sans état de survol à gérer.

### 6.3 Emplacement exact, et les quatre messages (pas trois)

`createResultRow()` (`src/ui/client/test-scope.ts`) construit aujourd'hui une seule `<div class="flex items-center gap-2 text-xs font-mono">` par scope, avec l'icône ✓/✗ et le label du scope. Je propose d'envelopper cette ligne et une éventuelle ligne de détail dans un conteneur commun :

```
┌ (wrapper "space-y-0.5", un par scope, remplace l'append direct de createResultRow) ┐
│  ✗  POST:/v1/apps/my-app/deployments [1 body filter(s)]                            │
│     └ Paramètre "action" non déclaré : refusé par défaut dès qu'un filtre          │
│       query existe sur ce scope.                                                    │
└──────────────────────────────────────────────────────────────────────────────────┘
```

- La ligne de détail est indentée pour s'aligner sous le **label** du scope, pas sous l'icône (`pl-5`, largeur de l'icône + son `gap-2`, à ajuster en intégration selon le rendu réel).
- Style : `text-xs text-gray-500 dark:text-gray-400 pl-5`, même registre que les hints existants (contraste corrigé selon I2 de l'audit a11y, cf. §9.2).
- Le connecteur visuel (`└` ou équivalent) est décoratif, `aria-hidden="true"`, exactement comme les chevrons et labels `ET` existants. Le texte utile porte l'information seul.
- **Condition d'affichage** que je pose comme hypothèse de travail, à confirmer avec le dev puisqu'elle touche la forme du verdict que je ne code pas : la ligne apparaît quand `verdict.denialReason === "query"` pour ce scope précis. Le champ exact qui porte le paramètre concerné reste à définir par le dev en cohérence avec `AccessVerdict`, mais la forme d'affichage ci-dessous reste valable quel que soit le nom retenu côté types.

**Quatre cas, pas trois.** Le challenge testeur (B3) a montré que la v1 de ce document en oubliait un : le plafond d'occurrences (§5.6, §19.4) est une cause de refus à part entière, distincte des trois causes lisibles dans la configuration de l'utilisateur. §12.5 fixe les trois premiers textes, le quatrième est en cours d'écriture par le PO suite à l'arbitrage du plafond à deux paliers :

| # | Cause | Texte | Distinction visuelle |
|---|-------|-------|------------------------|
| 1 | Paramètre non déclaré (déni par défaut) | « Paramètre "{param}" non déclaré : refusé par défaut dès qu'un filtre query existe sur ce scope. » | Sous-ligne standard |
| 2 | Paramètre `required` absent | « Paramètre requis "{param}" absent. » | Sous-ligne standard |
| 3 | Valeur non couverte par `values` | « Valeur de "{param}" non autorisée par ce filtre. » | Sous-ligne standard |
| 4 | Occurrences en surnombre (§5.6, §19.4) | `[DRAFT, texte PO à venir]`, doit nommer explicitement le plafond (4 ou 64 selon présence d'un `regex`, §5.6) et dire qu'il ne dépend d'aucune valeur envoyée | Sous-ligne **+ icône** (ci-dessous) |

**Pourquoi le cas 4 a besoin d'un traitement à part, et pas seulement d'un texte différent.** Les trois premiers cas se lisent dans la configuration de l'utilisateur : il peut ouvrir son formulaire, regarder son `queryFilter`, et voir le nom déclaré, le `required`, ou la liste de valeurs qui ne couvre pas ce qu'il a envoyé. Le cas 4 ne se lit **nulle part** dans le blob, dans le formulaire, ou dans un message de génération (§19.4 le dit explicitement : ce plafond ne se vérifie qu'à la charge de la requête). Si sa sous-ligne a exactement la même apparence que les trois autres, un utilisateur qui envoie cinq occurrences d'un paramètre par ailleurs parfaitement configuré va relire son filtre en boucle en cherchant une valeur fautive qui n'existe pas, exactement le scénario concret que B5 documente pour la production (`?ids=1&ids=2&ids=3&ids=4&ids=5`, cinq valeurs toutes valides, refusé quand même).

**Décision : icône neutre uniquement sur le cas 4.** Une petite icône (`<AlertInfoIcon />` réutilisée à `h-3 w-3` au lieu de `h-4 w-4`, `aria-hidden="true"`, couleur héritée `text-gray-400 dark:text-gray-500`) précède le texte de la sous-ligne, uniquement pour ce cas. Je n'utilise ni une couleur d'alerte (ce n'est pas un risque de sécurité, c'est une limite de charge, même registre que le hint de §5.6) ni un badge ou un tooltip (écartés en §6.2, pour les mêmes raisons ici). L'icône ne porte pas seule l'information, conformément à §12.13 : le texte doit se suffire à lui-même une fois écrit par le PO (nommer le chiffre du plafond est ce qui rend le texte auto-suffisant, l'icône n'est qu'un repère visuel supplémentaire pour le survol rapide d'une liste de résultats). Les trois autres cas restent sans icône, du texte seul, pour ne pas diluer ce que l'icône signale : « ce n'est pas votre configuration, c'est une limite de charge ».

**Ordre d'évaluation, pas une décision d'UI mais une contrainte dont dépend l'exactitude de l'affichage.** B3 exige que le comptage d'occurrences soit évalué **avant** l'évaluation des valeurs, sans quoi le message affiché dépend arbitrairement de l'ordre des occurrences dans la requête. Mon mécanisme se contente d'afficher fidèlement le `denialReason` unique renvoyé par le verdict (§6.1, une seule fonction d'autorisation) : tant que le dev respecte cet ordre côté `checkRequestAccess`, ma sous-ligne l'affiche correctement sans logique supplémentaire côté client. Je le note ici pour que la dépendance soit visible, pas parce que j'ai quelque chose à en coder.

**Un seul paramètre bloquant à la fois.** Les quatre cas de §12.5 sont, comme les trois précédents, **jamais cumulés** : l'évaluation s'arrête au premier problème rencontré (§12.5). Une seule sous-ligne, un seul paramètre nommé, pas de liste à gérer.

### 6.4 La note globale : je reviens sur ma recommandation de suppression

**Ma v1 recommandait de retirer `#test-query-note`.** Le raisonnement tenait sur les informations que j'avais alors : la note existait uniquement parce que la query n'était jamais contrainte, et son propre texte de spec se qualifiait de « permanente tant que `queryFilters` n'est pas livré ». Deux choses ont changé depuis, et je les traite dans l'ordre où elles me font changer d'avis.

**D'abord §12.5 réel.** Il ne supprime pas la note, il la fait passer de un état permanent à **deux états conditionnels** selon qu'au moins un scope testé porte des `queryFilters` : « non contrainte » (texte inchangé) ou « contrainte par au moins un scope, voir le détail sous chaque scope concerné » (texte nouveau). Ma lecture initiale traitait la note comme un vestige à retirer ; la lecture du PO la traite comme un signal à faire évoluer. Sur le principe, je m'incline : contrairement à ce que je pensais, la note et la sous-ligne par scope (§6.3) ne répondent pas à la même question. La sous-ligne dit *pourquoi ce scope précis refuse*. La note dit, en un coup d'œil avant même de lire une seule ligne de résultat, *est-ce que ma query est vérifiée du tout dans ce que je viens de tester*. Un scope qui **passe** avec `queryFilters` actifs n'a aucune sous-ligne (§6.3 n'existe que pour les refus) : sans la note, rien ne dirait à l'utilisateur que sa query a réellement été filtrée plutôt que transmise par chance sur un scope qui ne regarde rien.

**Ensuite T2 du challenge, qui est la vraie raison de ne plus la supprimer.** Le testeur a trouvé que l'agrégation actuelle (`queryConstrained` vaut vrai dès qu'**au moins un** scope testé porte des `queryFilters`, peu importe lequel accorde l'accès) peut mentir dans le sens permissif, exactement le défaut que l'ADR-0009 §4 qualifie de « pire que pas d'outil ». Cas concret : un blob avec un scope string historique `GET:/v1/items` et un `ScopeEntry` à `queryFilters` sur le même chemin. `/v1/items?force=true` passe par le scope string (qui ne regarde rien), le verdict global dit « autorisé », et la note dit « contrainte » : l'utilisateur lit les deux côte à côte et conclut, à tort, que `force=true` a été validé.

**Décision : la note reste, à trois états, et nomme le scope qui accorde l'accès.**

| État | Condition | Registre | Texte |
|------|-----------|----------|-------|
| 1. Non contrainte | Aucun scope testé ne porte de `queryFilters` | `ALERT_INFO_CLASS`, `<AlertInfoIcon />` | « La query n'est pas contrainte par les scopes : tous les paramètres passent. » (inchangé) |
| 2. Contrainte, correctement | La requête est autorisée, **et le scope qui l'autorise** porte des `queryFilters` | `ALERT_INFO_CLASS`, `<AlertInfoIcon />` | `[DRAFT, texte PO à venir]`, doit confirmer que le scope qui a accordé l'accès a bien vérifié la query |
| 3. Autorisée par un scope qui ne contraint rien | La requête est autorisée, mais le scope qui l'autorise **ne porte pas** de `queryFilters`, alors qu'au moins un autre scope testé en porte | `ALERT_CAUTION_CLASS`, `<AlertTriangleIcon />` | `[DRAFT, texte PO à venir]`, doit nommer le scope qui a accordé l'accès (ex. `scopeLabel()`, déjà utilisé pour les lignes de résultat, §6.3) |

**Pourquoi l'état 3 change de registre visuel, et pas seulement de texte.** Les états 1 et 2 sont de la pure information : rien à corriger, le comportement est celui que l'utilisateur attend. L'état 3 révèle un écart entre ce que l'utilisateur croit avoir configuré (une contrainte active) et ce qui se passe réellement sur cette requête précise (aucune contrainte, parce qu'un autre scope plus permissif a tranché en premier). C'est un vrai gain d'information, pas une alerte de sécurité au sens du §5.3, mais c'est un cas où la couleur bleue neutre sous-vendrait le problème : je passe donc à `ALERT_CAUTION_CLASS` (ambre) et `AlertTriangleIcon`, cohérent avec le principe déjà établi que la gravité du bloc suit ce qu'il révèle, pas une échelle fixe par emplacement dans la page.

**Quand la requête est globalement refusée** (aucun scope ne matche), je ne calcule pas les états 2/3 : il n'y a pas de « scope qui accorde l'accès » à nommer. Je retombe sur l'état 1 si aucun scope testé ne porte de `queryFilters`, sinon je masque la note : les sous-lignes par scope (§6.3) portent déjà, cas par cas, un diagnostic plus précis qu'une note générique ne pourrait apporter. C'est ma propre extension, pas une exigence explicite de T2 (qui porte sur le cas autorisé), je la signale comme telle en §12.

**Ce que ça change pour le dev, en note d'implémentation, pas une décision de ma part.** La boucle actuelle de `doHighlight()` (`test-scope.ts`) calcule `queryConstrained` en agrégeant tous les scopes testés (`if (verdict.queryConstrained) queryConstrained = true`, sans distinguer lequel). Distinguer les trois états suppose de savoir, en plus, **lequel** des scopes a effectivement accordé l'accès (premier match, cohérent avec la sémantique OR déjà en place pour `checkAccess`), et si ce scope précis porte des `queryFilters`. C'est un changement de la boucle d'agrégation, pas seulement du texte affiché ensuite.

---

## 7. Interactions

### 7.1 Ajouter le premier filtre query d'un scope (la bascule)

1. Scope déplié, sous-section « Query Filters (avancé) » visible, vide (pas encore de bloc d'alerte).
2. Clic sur « + Ajouter un filtre query ».
3. Re-rendu : le bloc d'alerte (§5.3) apparaît en tête de sous-section, suivi du nouveau bloc de filtre (type par défaut « Valeur exacte », une valeur vide).
4. Focus sur le champ « Paramètre de query » du nouveau filtre (identique au comportement body filters existant).
5. Badge de la ligne de scope repliée passe de « 0 filtre » à « 1 filtre » (ou `N body · 1 query` si des body filters existent déjà), point violet ajouté.

### 7.2 Ajouter une valeur à un filtre existant

Identique au pattern body filters : bouton « + Ajouter une valeur », nouvel input texte vide, focus dessus. Pas de sélecteur de sous-type à gérer (différence avec body filters, cf. §2).

### 7.3 Supprimer le dernier filtre query d'un scope

Le bloc d'alerte disparaît dans le même re-rendu que la suppression du dernier filtre (`queryFilters.length` repasse à 0). C'est cohérent avec le principe « piloté par l'état » : l'alerte ne ment jamais sur l'état courant, y compris en repassant à absent.

### 7.4 Bascule de la case « Requis »

Changement d'état immédiat, pas de re-rendu de panneau nécessaire (contrairement à un changement de type), donc pas de perte de focus. Le résumé de chip (§8) doit refléter le changement au prochain re-rendu des chips.

### 7.5 Changer le type d'un filtre query

Même comportement que les body filters : passer à `wildcard` vide les valeurs, passer à `not`/`and` ouvre le bloc imbriqué correspondant (même palette amber/sky que les body filters, cf. §9.2), perte des valeurs précédentes sans confirmation (cohérent avec l'existant).

### 7.6 Choisir le type « Expression régulière (regex) » sur un filtre query

1. L'utilisateur change le select « Type » d'un filtre vers « Expression régulière (regex) », au niveau racine du filtre ou dans une sous-condition `not`/`and`.
2. Re-rendu du bloc de filtre (comportement déjà existant pour tout changement de type, §7.5). Le hint du §5.6 apparaît sous la zone de valeurs, parce que le filtre contient désormais au moins un `regex` à une profondeur quelconque.
3. Si l'utilisateur retire ensuite ce `regex` (change le type vers autre chose, ou supprime la seule condition qui le portait dans un `and`), le hint disparaît au re-rendu suivant, par le même principe que l'alerte de §5.3 : piloté par l'état réel du filtre, jamais par un événement à part.
4. Aucune conséquence sur le focus au-delà de ce que le changement de type provoque déjà (§7.5) : le hint est un texte statique, pas un contrôle interactif.

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
      D&eacute;coch&eacute;e (par d&eacute;faut), ce param&egrave;tre peut &ecirc;tre absent
      de la requ&ecirc;te, ce n'est pas un probl&egrave;me. Coch&eacute;e, la requ&ecirc;te
      est refus&eacute;e si ce param&egrave;tre est absent.
    </p>
  </span>
</label>
```

Texte réel de §12.14, substitué à mon brouillon de v1.

Points d'association :

- **Label natif** : `<input>` est un enfant de `<label>`, l'association est implicite et robuste (pas besoin de `for`/`id` séparés, bien que l'`id` existe pour l'`aria-describedby`).
- **`aria-describedby`** pointe vers le texte d'aide, qui est un `<p>` toujours présent dans le DOM (pas injecté/retiré), donc pas de risque de référence cassée pendant un re-rendu.
- **`accent-fgp-600`** : utilitaire natif Tailwind 3 (accent-color CSS), pas besoin du plugin `@tailwindcss/forms` qui n'est pas installé sur ce projet. Vérifié contre `tailwind.config.js` (aucun plugin déclaré) et `deno.json` (`npm:tailwindcss@3`, version récente du 3.x où `accent-*` est disponible en core plugin).
- **Focus visible** : `focus:ring-2 focus:ring-fgp-500`, cohérent avec tous les contrôles du formulaire.
- ID dynamique par `filterData.id`, même pattern que `bf-field-${filterData.id}` existant, garantit l'unicité même avec plusieurs filtres query sur la page.

### 9.2 Reprise des correctifs déjà identifiés par l'audit

Ce nouveau formulaire est un bon endroit pour ne **pas** réintroduire les défauts déjà documentés :

- **C1 (aria-live)** : la sous-section « Query Filters (avancé) » d'un scope porte `aria-live="polite"` dès sa création (§5.3). Ce n'est pas une nouveauté, c'est l'application au nouveau code de la correction déjà prescrite pour `#scope-chips`.
- **C2 (focus après suppression)** : suppression d'un filtre query → focus sur le bouton « + Ajouter un filtre query » (même pattern que `btnDelete` existant pour les body filters, l.706-714 de `body-filters.ts`). Suppression d'une valeur → focus sur la valeur précédente, ou sur « + Ajouter une valeur » s'il n'en reste qu'une.
- **C3 (labels « ET » non accessibles)** : si le formulaire query reprend les blocs `and`/`not` (§7.5), il reprend le `role="group"` + `aria-label="Groupe de conditions ET"` déjà en place pour le `and`, pas le pattern `aria-label` sur un `<span>` nu identifié comme défaillant pour le séparateur `ET` de premier niveau. Autrement dit : ne pas copier le défaut, copier le correctif recommandé par l'audit (`role="separator"` sur le conteneur du `ET` entre filtres).
- **I2 (contraste des hints)** : tous les textes `HINT_CLASS`/gris de ce formulaire (aide « Requis », labels de sous-section, texte des sous-lignes de diagnostic) utilisent `text-gray-500 dark:text-gray-400`, le pattern jugé correct par l'audit, jamais `text-gray-400` en light ou `text-gray-500` en dark seul.
- **I3 (bouton sans état)** : le bouton « + Ajouter des filtres sur un scope... » (renommé, §3) doit porter `aria-expanded` + `aria-controls="body-filters-panel"`. C'est un correctif déjà dû sur le bouton existant, indépendant de cette feature, mais comme ce lot touche déjà ce bouton pour son texte, c'est le moment de l'ajouter plutôt que de le manquer une seconde fois.
- **I4 (chips sans rôle de liste)** : si le dev applique aussi cette correction en marge, `role="list"` sur `#scope-chips` et `role="listitem"` par chip couvrent aussi les nouveaux chips combinés body+query sans traitement spécial.
- **I6 (selects imbriqués sans label)** : tout select de type dans un bloc `not`/`and` imbriqué côté query filters porte un `aria-label` explicite (« Type de la condition d'exclusion », etc.), comme recommandé pour le défaut équivalent côté body filters.

### 9.3 Nouveaux éléments propres à ce formulaire

- **Champ « Paramètre de query »** : `<label for={...}>Paramètre de query</label>` associé nativement, comme le « Champ (dot-path) » des body filters, plus le hint d'aide (§11.3) associé par `aria-describedby`.
- **Select « Type »** : label associé, mêmes 6 options texte que les body filters (§2), pas de changement d'accessibilité par rapport à l'existant.
- **Bloc d'alerte de bascule (§5.3)** : icône `<AlertTriangleIcon />` déjà `aria-hidden="true"` dans son composant (`icons.tsx`, vérifié), donc rien à ajouter à ce niveau. Le texte seul porte le sens, conforme à §12.13.
- **Ligne de diagnostic du testeur (§6.3)** : connecteur visuel `aria-hidden="true"`, texte simple dans le flux normal du DOM, hérite de `aria-live="polite"` déjà présent sur `#test-scope-results`. L'icône ajoutée pour le cas 4 (occurrences en surnombre) est également `aria-hidden="true"` : elle est un renfort visuel pour la lecture rapide, pas un porteur d'information propre, le texte doit rester auto-suffisant sans elle (§12.13), et c'est une obligation supplémentaire sur la copy que le PO doit écrire, pas une option.
- **Note à trois états du testeur (§6.4)** : `#test-query-note` garde son `aria-live="polite"` existant (déjà présent dans le code actuel, rien à ajouter). Les icônes `<AlertInfoIcon />` (états 1 et 2) et `<AlertTriangleIcon />` (état 3) sont déjà `aria-hidden="true"` dans leur composant. Point de vigilance propre à cette note, parce qu'elle change de classe dynamiquement selon l'état : la gravité de l'état 3 doit être lisible dans le texte seul, indépendamment du passage de `ALERT_INFO_CLASS` à `ALERT_CAUTION_CLASS`, exactement la même exigence que pour toute alerte de ce document (§12.13). C'est un point à vérifier une fois la copy réelle de l'état 3 connue, je ne peux pas le garantir sur un texte que je n'ai pas.
- **Hint du plafond d'occurrences (§5.6)** : texte simple `HINT_CLASS`, aucune icône, aucun `aria-live` : ce n'est pas une notification d'un changement d'état à annoncer, c'est une information de contexte permanente une fois affichée, au même titre que n'importe quel hint existant du formulaire (label, placeholder). Rien de spécifique à ajouter au-delà de ce que `HINT_CLASS` porte déjà.
- **Points violet/fgp des badges de ligne repliée (§4.1)** : décoratifs, `aria-hidden="true"`, l'information est déjà portée par le texte du badge (« N body · M query »), exactement le principe déjà appliqué au point `bg-fgp-500` existant.

---

## 10. Tableau Tailwind classes

| Élément | Classes |
|---|---|
| Titre de sous-section (« Body Filters (avancé) » / « Query Filters (avancé) ») | `text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1` (première occurrence sans `mt`, seconde avec `mt-3`) |
| Point de comptage body (inchangé) | `w-2 h-2 rounded-full bg-fgp-500 inline-block` |
| Point de comptage query (nouveau) | `w-2 h-2 rounded-full bg-violet-500 dark:bg-violet-400 inline-block` |
| Bloc de filtre query (parent) | identique au body filter : `rounded-md border border-gray-200 bg-gray-50 p-3 space-y-2 dark:bg-gray-700/50 dark:border-gray-600` |
| Séparateur avant case « Requis » | `mt-2 pt-2 border-t border-gray-200 dark:border-gray-700` |
| Checkbox « Requis » | `mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 accent-fgp-600 focus:outline-none focus:ring-2 focus:ring-fgp-500 focus:ring-offset-1 dark:border-gray-600 dark:bg-gray-700 dark:focus:ring-offset-gray-800` |
| Alerte de bascule (réutilise `ALERT_CAUTION_CLASS` de `constants.ts`) | `flex items-start gap-2 rounded-md border border-l-4 p-2 text-xs border-amber-200 border-l-amber-500 bg-amber-50 text-amber-800 dark:border-amber-700 dark:border-l-amber-500 dark:bg-amber-900/30 dark:text-amber-300` |
| Sous-ligne de diagnostic (testeur de scopes) | `pl-5 text-xs text-gray-500 dark:text-gray-400` |
| Connecteur décoratif de la sous-ligne | `aria-hidden="true"`, pas de classe de couleur propre, hérite du parent |
| Icône du cas 4 (occurrences en surnombre) | `<AlertInfoIcon />` réduite à `h-3 w-3 shrink-0 text-gray-400 dark:text-gray-500`, `aria-hidden="true"` |
| Hint du plafond d'occurrences (§5.6) | `mt-2 ${HINT_CLASS}` soit `mt-2 text-xs text-gray-500 dark:text-gray-400` |
| Note testeur, état 3 (`ALERT_CAUTION_CLASS`, §6.4) | identique à `ALERT_CAUTION_CLASS` de `constants.ts`, `<AlertTriangleIcon />` au lieu de `<AlertInfoIcon />` |

Aucune classe hors du jeu déjà compilé par `tailwind.config.js` : `violet-*` et `accent-*` font partie de la palette et des utilitaires par défaut de Tailwind 3, aucune extension de config nécessaire.

---

## 11. Limites UX et éligibilité

### 11.1 Tous les scopes deviennent éligibles au panneau

Avec les body filters seuls, le panneau ne montrait que les scopes POST/PUT/PATCH/`*` (rare, opt-in visible seulement quand pertinent). Avec les query filters, **tout scope est éligible**, puisque toute méthode peut porter une query. Concrètement, le panneau listera potentiellement une ligne par scope déclaré dès qu'il est ouvert, y compris des scopes qui ne seront jamais enrichis.

Le coût réel reste borné : chaque ligne repliée fait une seule ligne compacte (`~36px`), le panneau lui-même reste caché tant que le bouton n'est pas cliqué, et rien ne s'ouvre automatiquement. Je pose quand même la question en §12 plutôt que de trancher unilatéralement, parce que ça change la population par défaut d'un panneau qui était jusqu'ici clairsemé.

### 11.2 Profondeur `not`/`and` inchangée

Les mêmes limites que les body filters (`and-filter-ui.md` §4.1) s'appliquent : 2 niveaux visuels max (filtre → `and`/`not` → `not` imbriqué dans un `and`), pas de `and` dans un `and`. Rien de spécifique à la query qui justifierait une limite différente.

### 11.3 Pas de dot-path

Contrairement aux body filters, un paramètre de query est une clé plate (`status`, `per_page`), jamais un chemin imbriqué. Le champ s'appelle « Paramètre de query », pas « Champ (dot-path) », et porte au contraire un hint qui exclut explicitement la notation par points (§12.14), pour éviter qu'un utilisateur habitué aux body filters tente `user.id`.

### 11.4 Restriction du type `any` : confirmée à toute profondeur (B4)

Le challenge testeur (B4) a montré que ni §19.3 ni §12.14 ne rendaient la restriction du type `any` aux chaînes normative **en profondeur** : un `any` non-string glissé dans un `and` ou un `not` imbriqué resterait valide si la validation ne descend pas explicitement avec un drapeau de contexte. Le cas `not` est le plus grave des deux : `matchObjectValue` compare par `JSON.stringify`, donc `not({type:"any", value:1})` sur un paramètre de query (toujours une chaîne) retourne **toujours vrai**, puisque `JSON.stringify(1)` et `JSON.stringify("1")` ne sont jamais égaux. Un filtre censé exclure une valeur devient un filtre qui n'exclut jamais rien.

Ce n'est pas un bug d'UI, c'est un trou de validation, donc ce n'est pas moi qui le corrige. Mais mon formulaire est la première ligne de défense pratique : je confirme ici, pour qu'aucun doute ne subsiste côté forme, que **le sélecteur de sous-type Texte / Nombre / Booléen / Null n'apparaît nulle part dans le formulaire query filters, à aucune profondeur d'imbrication** (racine, `not`, `and`, `not` dans un `and`). Chaque type `any` du formulaire, où qu'il vive dans l'arbre, est un simple champ texte. C'est déjà ce que décrivait la v1 de ce document (§2, §4.2) ; je le rends normatif ici en le rattachant explicitement à B4, parce que c'est la garantie qui, côté UI, empêche l'auteur d'écrire lui-même un `1` numérique qui romprait la comparaison : il n'a tout simplement pas la possibilité de saisir autre chose qu'une chaîne, quel que soit le niveau d'imbrication où il se trouve.

### 11.5 Le plafond d'occurrences passe à deux paliers (B5)

Détaillé en §5.6 : 4 occurrences évaluées par requête si le `queryFilter` contient au moins un `regex` à n'importe quelle profondeur, 64 sinon. Je le rappelle ici parce que `docs/limits.md` documente ce chiffre en détail et que ce document doit rester cohérent avec lui une fois que le PO l'aura mis à jour ; au moment où j'écris cette réconciliation, `docs/limits.md` n'a pas encore été relu par mes soins dans sa version révisée, je m'appuie sur le chiffre donné directement par le lead (« 4 si le filtre contient une regex, 64 sinon », tranché par l'architecte) plutôt que sur le fichier, qui peut être en cours d'édition au même instant.

---

## 12. Points ouverts, pour le lead et pour le dev

**Résolus depuis la v1**, retirés de cette liste : le point 1 (copy manquante, substituée pour tout ce qui est stable) et le point 6 (suppression de `#test-query-note`, je reviens dessus en §6.4, elle reste et devient l'affichage à trois états demandé par T2). Le point 5 de la v1 (sous-ligne informative sur un scope qui passe) est absorbé par le même mécanisme à trois états : je ne le traite plus séparément.

1. **Copy encore manquante, propre à cette réconciliation.** Trois textes n'existaient dans aucune version de §12.14/§12.5 avant les arbitrages de ce tour, donc je ne peux pas les avoir substitués : le quatrième message de diagnostic pour les occurrences en surnombre (§6.3), le hint de la porte de sortie regex vers 4/64 occurrences (§5.6), et les textes des états 2 et 3 de la note à trois états du testeur (§6.4, l'état 3 doit nommer le scope qui accorde l'accès). Le nombre exact de mots-clés, le registre visuel et la condition d'affichage de chacun sont fixés dans ce document ; seul le texte final manque.

2. **Champ exact du verdict pour le diagnostic (§6.3).** J'ai supposé `denialReason === "query"` (déjà dans l'union de types) plus un champ à créer portant le paramètre concerné, et maintenant la distinction entre les quatre causes. Le nom et la forme exacte de ce champ restent une décision dev, ma spec de forme reste valable quel que soit le nom retenu.

3. **Logique d'agrégation « scope qui accorde l'accès » (§6.4), nouvelle depuis T2.** Distinguer les trois états de la note suppose de savoir, en plus du `queryConstrained` déjà agrégé sur tous les scopes testés, lequel des scopes a effectivement accordé l'accès (premier match qui matche). C'est un changement de la boucle de `doHighlight()` (`test-scope.ts`), pas seulement du texte affiché ensuite. Je le signale comme une dépendance d'implémentation réelle, pas une formalité.

4. **Comportement de la note à trois états sur un refus global (§6.4, fin).** Ma proposition (état 1 si aucun scope testé ne porte de `queryFilters`, sinon note masquée au profit des sous-lignes par scope) est une extension de ma part, au-delà de ce que T2 demandait explicitement pour le cas autorisé. À confirmer par le lead ou le PO.

5. **Renommage des IDs du panneau (§3).** Je recommande de garder les IDs existants et de ne changer que le texte visible, pour limiter le risque de régression sur du code déjà testé.

6. **Bouton d'ouverture et titre du panel englobant (§3).** « + Ajouter des filtres sur un scope... » et « Filtres avancés » sont ma formulation de mécanisme, pas une citation de §12.14 (qui décrit un bouton et un panel propres à l'axe query, absorbés dans mes sous-sections, cf. §3). C'est la seule copy visible de tout ce document qui n'a jamais été écrite par le PO sous cette forme précise : à faire confirmer avant intégration, même si le fond (une phrase d'ouverture, un titre de panel) est d'un enjeu mineur comparé au reste.

7. **Éligibilité totale des scopes dans le panneau (§11.1).** Je documente le changement de population plutôt que de le limiter artificiellement, mais si le lead ou le PO juge qu'un panneau qui liste soudain tous les scopes (même ceux sans aucun filtre) est un problème de bruit visuel, une alternative existe : n'afficher une ligne pour un scope sans aucun filtre que si l'utilisateur clique un contrôle dédié plutôt que de les lister toutes par défaut. Je ne le recommande pas spontanément, mais je le signale.

8. **`docs/limits.md` non relu dans sa version révisée (§11.5).** Je me suis appuyé sur les chiffres donnés directement par le lead (4/64) plutôt que sur le fichier, susceptible d'être édité en parallèle par le PO. À vérifier une fois sa révision stabilisée.

---

## 13. Journal de réconciliation (v1 → v2)

Récapitulatif court, pour que le lead retrouve chaque demande sans rouvrir tout le document.

| Demande | Traitement | Où |
|---------|------------|-----|
| Remplacer les `[DRAFT]` par la copy réelle de §12.14 | Fait pour tout ce qui est stable (alerte de bascule, aide « Requis », labels du champ paramètre) ; laissé en `[DRAFT, texte PO à venir]` pour les trois textes qui n'existaient dans aucune version de la spec avant ce tour d'arbitrages | §5.3, §9.1, §4.2/4.3, point 1 de la liste en §12 |
| Confronter le mécanisme d'alerte à la §19.2 (piège d'articulation) | Vérifié à deux niveaux, texte et placement ; le placement scope-level (pas filtre-level) rend la confusion structurellement impossible | §5.5 |
| Vérifier la §6.3 contre les messages de diagnostic réels de la §12.5 | Passé de trois à quatre cas (B3), quatrième cas différencié par une icône neutre, ordre d'évaluation documenté comme dépendance dev | §6.3 |
| Trancher le sort de `#test-query-note` | Recommandation de suppression de la v1 inversée : la note reste, passe à trois états, nomme le scope qui accorde l'accès quand il ne contraint rien (T2) | §6.4 |
| Quatre causes de refus, pas trois (B3) | Tableau des quatre cas, traitement visuel distinct du quatrième | §6.3 |
| Plafond à deux paliers (4 si regex, 64 sinon) et porte de sortie visible (B5) | Nouveau hint contextuel au choix du type `regex`, condition d'affichage à toute profondeur d'imbrication | §5.6 |
| Troisième état du testeur, nommer le scope qui accorde l'accès (T2) | Tableau à trois états, état 3 en `ALERT_CAUTION_CLASS` | §6.4 |
| Restriction de `any` aux chaînes : vérifier l'absence de sélecteur de sous-type dans le wireframe | Confirmé explicitement à toute profondeur d'imbrication (B4), rien à retirer, seulement à rendre normatif | §11.4 |
| Ne pas remettre en cause le panneau unifié, l'alerte pilotée par l'état, la sous-ligne indentée, la case native, la passe a11y | Conservés à l'identique, un point de réconciliation ajouté pour la copy du bouton/panel de §12.14 qui suppose littéralement deux entrées | §3, tout le document |
