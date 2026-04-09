# Scalingo Preset Mapping -- Permissions UI vers Scopes

**Feature** : Preset Scalingo enrichi (cf. body-filters-ui.md section 2.3)
**Date** : 2026-04-09
**Auteur** : PO FGP
**Statut** : Draft -- a valider par le lead avant implementation

---

## 1. Contexte

L'UI du preset Scalingo propose des checkboxes de permissions par app. Ce document definit le mapping exact entre chaque permission cochee et les scopes generes dans le blob. Le dev doit pouvoir lire ce document et implementer sans ambiguite.

API cible : `https://api.osc-fr1.scalingo.com`
Mode auth : `scalingo-exchange`

---

## 2. Scope de base : app cochee sans permission specifique

Quand une app est cochee mais qu'aucune permission granulaire n'est selectionnee, on genere un acces lecture total sur cette app (comportement actuel preserve).

```
GET:/v1/apps/{app}/*
```

C'est le fallback. Des qu'au moins une permission granulaire est cochee, ce scope wildcard est remplace par les scopes specifiques de chaque permission (cf. section 3).

---

## 3. Scope global obligatoire

**Regle** : des qu'au moins une app est selectionnee (ou "toutes les apps"), le scope suivant est toujours ajoute :

```
GET:/v1/apps
```

Ce scope autorise le listing des apps (`GET /v1/apps`). Sans lui, un client ne peut pas verifier qu'il a acces aux bonnes apps. Il est ajoute automatiquement, invisible dans les checkboxes, non supprimable par l'utilisateur.

Le code actuel (`apps.ts` ligne 80) fait deja `lines.unshift("GET:/v1/apps")`. Ce comportement est preserve.

---

## 4. Mapping des permissions

### 4.1 Lecture (GET)

**Checkbox** : `[x] Lecture`
**Description** : Acces en lecture a toutes les ressources de l'app (info, containers, addons, logs...).
**Dependances** : aucune.

**Scopes generes** :

```
GET:/v1/apps/{app}
GET:/v1/apps/{app}/*
```

Le premier scope autorise `GET /v1/apps/{app}` (info de l'app). Le second autorise tous les sous-endpoints en lecture.

**Body filters** : aucun (GET n'a pas de body).

---

### 4.2 Deploiement

**Checkbox** : `[x] Deploiement`
**Champ additionnel** : `Branches : [ master, main ]` (input texte, virgule-separee, optionnel)
**Description** : Autoriser le deploiement de l'app, optionnellement restreint a certaines branches.
**Dependances** : necessite implicitement `GET:/v1/apps/{app}` pour que le client puisse verifier l'app. Ce scope est ajoute automatiquement quand "Deploiement" est coche, meme si "Lecture" n'est pas coche.

**Scopes generes** :

| Cas | Scopes |
|-----|--------|
| Branches renseignees | `GET:/v1/apps/{app}` + ScopeEntry deploiement avec body filter |
| Branches vides | `GET:/v1/apps/{app}` + `POST:/v1/apps/{app}/deployments` (scope string, pas de body filter) |

**Avec branches** -- ScopeEntry genere :

```json
{
  "methods": ["POST"],
  "pattern": "/v1/apps/{app}/deployments",
  "bodyFilters": [
    {
      "objectPath": "deployment.git_ref",
      "objectValue": [
        { "type": "any", "value": "master" },
        { "type": "any", "value": "main" }
      ]
    }
  ]
}
```

Regles de generation des objectValue :
- Chaque branche saisie produit un `{ "type": "any", "value": "<branche>" }`.
- Si une branche contient un `*` (ex: `release/*`), utiliser `{ "type": "stringwildcard", "value": "release/*" }` a la place de `any`.
- Les branches sont trimmees et les doublons supprimes.
- Un champ branches vide apres trim = pas de body filter (scope string simple).

**Sans branches** -- scope string :

```
POST:/v1/apps/{app}/deployments
```

---

### 4.3 Variables (lecture)

**Checkbox** : `[x] Variables (lecture)`
**Description** : Lire les variables d'environnement de l'app.
**Dependances** : aucune.

**Scopes generes** :

```
GET:/v1/apps/{app}/variables
```

**Body filters** : aucun.

---

### 4.4 Variables (ecriture)

**Checkbox** : `[x] Variables (ecriture)`
**Description** : Creer, modifier et supprimer les variables d'environnement de l'app.
**Dependances** : cocher "Variables (ecriture)" coche automatiquement "Variables (lecture)". L'utilisateur ne peut pas decocher "Variables (lecture)" tant que "Variables (ecriture)" est cochee. L'UI disable la checkbox lecture avec un tooltip explicatif ("Requis par Variables ecriture").

**Justification** : un workflow d'ecriture de variables necessite de lire l'etat courant pour eviter les ecrasements. Forcer la lecture empeche les erreurs de config.

**Scopes generes** :

```
GET:/v1/apps/{app}/variables
POST:/v1/apps/{app}/variables
PUT:/v1/apps/{app}/variables/*
DELETE:/v1/apps/{app}/variables/*
```

Le `PUT` et `DELETE` utilisent le wildcard car l'API Scalingo adresse les variables individuellement par ID (`/variables/{variable_id}`).

**Body filters** : aucun. Le filtrage fin du contenu des variables (ex: interdire de modifier `DATABASE_URL`) est un use case possible mais pas prevu dans cette version. Le scope `POST` autorise la creation, `PUT` la modification, `DELETE` la suppression.

---

### 4.5 Scale / Restart

**Checkbox** : `[x] Scale / Restart`
**Description** : Modifier le scaling (nombre de containers, taille) et redemarrer l'app.
**Dependances** : aucune.

**Scopes generes** :

```
POST:/v1/apps/{app}/scale
POST:/v1/apps/{app}/restart
GET:/v1/apps/{app}/containers
```

Le `GET` sur `/containers` est necessaire pour que le client puisse lire l'etat actuel des containers avant de scaler. Il est ajoute implicitement.

**Body filters** : aucun dans cette version. Le design doc (body-filters-ui.md section 2.3) mentionne le filtrage de `containers.*.amount` comme extension future. Pas dans le scope v1.

---

## 5. Comportement "Toutes les apps (*)"

L'UI propose une option "Toutes les apps" (ou un wildcard). Quand elle est selectionnee :

- Le `{app}` dans les patterns est remplace par `*`.
- Les permissions granulaires s'appliquent de la meme facon, mais avec des paths wildcard.

**Exemples** :

| Permission | Scope avec app nommee | Scope avec wildcard |
|---|---|---|
| Lecture | `GET:/v1/apps/my-app/*` | `GET:/v1/apps/*/*` |
| Deploiement | `POST:/v1/apps/my-app/deployments` | `POST:/v1/apps/*/deployments` |
| Variables (lecture) | `GET:/v1/apps/my-app/variables` | `GET:/v1/apps/*/variables` |
| Scale / Restart | `POST:/v1/apps/my-app/scale` | `POST:/v1/apps/*/scale` |

Le scope global `GET:/v1/apps` est toujours ajoute.

Note : `GET:/v1/apps/*/*` (wildcard app + wildcard sous-resource) est correct car le `*` en premiere position matche n'importe quel nom d'app, et le `*` en seconde position matche les sous-endpoints.

---

## 6. Combinaisons de permissions

Les permissions sont additives. Cocher plusieurs permissions combine leurs scopes. Voici un exemple complet.

**Config UI** :

```
[x] my-app
    [x] Lecture
    [x] Deploiement    Branches : [main, release/*]
    [ ] Variables (lecture)
    [ ] Variables (ecriture)
    [x] Scale / Restart

[x] staging-app
    [x] Lecture
    [ ] Deploiement
    [x] Variables (lecture)
    [ ] Variables (ecriture)
    [ ] Scale / Restart
```

**Scopes generes (blob)** :

```json
{
  "scopes": [
    "GET:/v1/apps",

    "GET:/v1/apps/my-app",
    "GET:/v1/apps/my-app/*",
    {
      "methods": ["POST"],
      "pattern": "/v1/apps/my-app/deployments",
      "bodyFilters": [
        {
          "objectPath": "deployment.git_ref",
          "objectValue": [
            { "type": "any", "value": "main" },
            { "type": "stringwildcard", "value": "release/*" }
          ]
        }
      ]
    },
    "POST:/v1/apps/my-app/scale",
    "POST:/v1/apps/my-app/restart",
    "GET:/v1/apps/my-app/containers",

    "GET:/v1/apps/staging-app",
    "GET:/v1/apps/staging-app/*",
    "GET:/v1/apps/staging-app/variables"
  ]
}
```

Note : quand "Lecture" est deja cochee, `GET:/v1/apps/{app}/*` couvre deja `GET:/v1/apps/{app}/variables` et `GET:/v1/apps/{app}/containers`. Les scopes specifiques sont quand meme generes pour la lisibilite et parce que les scopes sont additifs (OR) -- un scope redondant ne pose aucun probleme fonctionnel.

---

## 7. Tableau de synthese

| Permission | Scopes string | ScopeEntry (body filter) | Dependances |
|---|---|---|---|
| App cochee (aucune perm) | `GET:/v1/apps/{app}/*` | non | -- |
| Lecture | `GET:/v1/apps/{app}`, `GET:/v1/apps/{app}/*` | non | -- |
| Deploiement (sans branches) | `GET:/v1/apps/{app}`, `POST:/v1/apps/{app}/deployments` | non | -- |
| Deploiement (avec branches) | `GET:/v1/apps/{app}` | oui : `deployment.git_ref` filtre par branches | -- |
| Variables (lecture) | `GET:/v1/apps/{app}/variables` | non | -- |
| Variables (ecriture) | `GET:/v1/apps/{app}/variables`, `POST:/v1/apps/{app}/variables`, `PUT:/v1/apps/{app}/variables/*`, `DELETE:/v1/apps/{app}/variables/*` | non | Variables (lecture) auto-cochee |
| Scale / Restart | `POST:/v1/apps/{app}/scale`, `POST:/v1/apps/{app}/restart`, `GET:/v1/apps/{app}/containers` | non | -- |

Scope global ajoute systematiquement : `GET:/v1/apps`

---

## 8. Regles d'implementation pour le dev

1. **Ordre des scopes dans le blob** : `GET:/v1/apps` en premier, puis les scopes groupes par app (lisibilite du debug).

2. **Deduplication** : si "Lecture" est cochee, ne pas generer un `GET:/v1/apps/{app}/variables` supplementaire pour "Variables (lecture)" car `GET:/v1/apps/{app}/*` le couvre deja. Exception : si "Lecture" n'est PAS cochee et "Variables (lecture)" est cochee, generer le scope specifique.

3. **Detection du type de branche** : une branche contient un wildcard si elle contient le caractere `*`. Pas de detection plus fine (pas de regex, pas de glob avance).

4. **Branches vides** : si le champ branches est vide ou ne contient que des espaces/virgules, pas de body filter. Le deploiement est autorise sans restriction de branche.

5. **Version du blob** : si au moins un deploiement a des branches (= au moins un ScopeEntry avec bodyFilters), le blob est v3. Sinon v2.

6. **Dependance Variables** : l'UI doit gerer le couplage ecriture -> lecture cote client (checkbox disable + auto-check). Le backend n'a pas a valider cette contrainte, c'est purement UX.

7. **Fallback app sans permission** : si l'utilisateur coche une app mais ne coche aucune permission, generer `GET:/v1/apps/{app}/*` (lecture wildcard). C'est le comportement actuel et il doit etre preserve pour la retro-compat.

---

## 9. Cas limites

| Situation | Comportement |
|---|---|
| App cochee, toutes permissions cochees | Generer tous les scopes (pas de shortcut `*:/v1/apps/{app}/*`). L'utilisateur voit exactement ce qui est autorise. |
| Aucune app cochee | Pas de scope genere. Le bouton "Generer" est disable. |
| Deploiement coche, branche = `*` | Genere `{ "type": "stringwildcard", "value": "*" }`. Fonctionnellement equivalent a pas de body filter, mais l'intention est explicite. Le dev peut optimiser en supprimant le body filter si la seule branche est `*`. |
| Meme app selectionnee via checkbox ET via textarea manuel | Le preset ecrase le textarea (comportement actuel). Pas de merge. L'UI doit avertir si le textarea a du contenu custom. |
