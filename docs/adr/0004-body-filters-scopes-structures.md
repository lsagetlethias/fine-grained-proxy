# ADR 0004 — Body filters et scopes structurés (blob v3)

- **Date** : 2026-04-09
- **Statut** : Accepted

## Contexte

Les scopes actuels (v2) ne filtrent que `METHOD:PATH`. Un token scopé `POST:/v1/apps/my-app/deployments` permet de déployer n'importe quelle branche. Pour un use case CI/CD, on veut pouvoir restreindre le payload : "ne déployer que `master` ou `main`".

Plus généralement, le proxy doit pouvoir valider le contenu des requêtes (body JSON) en plus de la route.

## Décision

### Scopes structurés (blob v3)

Les scopes passent de `string[]` à `Array<string | ScopeEntry>` (backward compat v2 : un string reste un scope `METHOD:PATH` simple).

```typescript
interface ScopeEntry {
  methods: string[];
  pattern: string;
  bodyFilters?: BodyFilter[];  // AND implicite entre les filtres
}

interface BodyFilter {
  objectPath: string;          // dot-path dans le body JSON (ex: "deployment.git_ref")
  objectValue: ObjectValue[];  // OR implicite entre les valeurs
}

type ObjectValue =
  | { type: "any"; value: JsonValue }         // exact match sur une valeur JSON
  | { type: "wildcard" }                       // le champ doit exister, valeur quelconque
  | { type: "stringwildcard"; value: string }  // glob pattern sur une string (même algo que matchPath)
  | { type: "and"; value: ObjectValue[] };     // AND : toutes les conditions doivent matcher
```

### Conventions

- `objectValue: [...]` → OR implicite (au moins un doit matcher)
- `bodyFilters: [...]` → AND implicite (tous doivent matcher)
- `{ type: "and", value: [...] }` → AND explicite pour composer des conditions complexes
- Un scope sans `bodyFilters` ne vérifie pas le body (backward compat)
- Un body filter sur un champ absent du body → refusé (le champ doit exister)

### Extensibilité

Le discriminated union `type` permet d'ajouter de nouveaux filtres sans casser les existants :
- `{ type: "not"; value: ObjectValue }` — exclusion
- `{ type: "regex"; value: string }` — regex
- `{ type: "range"; value: [number, number] }` — intervalle numérique
- `{ type: "contains"; value: string }` — substring

Un type inconnu du proxy retourne 403 par défaut (deny-unknown).

### Affichage UI

L'UI affiche les scopes en format lisible (option A) :
```
POST:/v1/apps/my-app/deployments → git_ref = master | main | release/*
```

Et convertit vers/depuis le format structuré à la génération du blob.

## Exemple blob v3

```json
{
  "v": 3,
  "token": "tk-us-...",
  "target": "https://api.osc-fr1.scalingo.com",
  "auth": "scalingo-exchange",
  "scopes": [
    "GET:/v1/apps/*",
    {
      "methods": ["POST"],
      "pattern": "/v1/apps/my-app/deployments",
      "bodyFilters": [
        {
          "objectPath": "deployment.git_ref",
          "objectValue": [
            { "type": "any", "value": "master" },
            { "type": "any", "value": "main" },
            { "type": "stringwildcard", "value": "release/*" }
          ]
        },
        {
          "objectPath": "deployment.source_url",
          "objectValue": [
            { "type": "stringwildcard", "value": "https://github.com/my-org/*" }
          ]
        }
      ]
    }
  ],
  "ttl": 3600,
  "createdAt": 1712534400
}
```

## Options envisagées

### Option A — Body filter dans le string scope (rejeté pour le stockage)
`POST:/path:field=value|value2` — simple à afficher mais ambigu à parser, limité en expressivité. Gardé comme format d'affichage UI uniquement.

### Option B — Scopes structurés avec discriminated union (choisi)
Objet typé avec `type` discriminant. Pas d'ambiguïté, extensible, parsable sans heuristique.

### Option C — Body filters séparés des scopes (rejeté)
`bodyFilters` comme champ top-level du blob, dissocié des scopes. Moins cohérent car un filter est toujours lié à un scope spécifique.

## Conséquences

- Le blob passe en v3 (le proxy doit supporter v2 string scopes + v3 structured)
- `parseScope` et `checkAccess` dans `scopes.ts` doivent gérer les deux formats
- Le proxy doit parser le body JSON des requêtes POST/PUT/PATCH pour les scopes avec `bodyFilters`
- L'UI doit proposer une interface pour construire les body filters
- Le blob sera plus gros (JSON structuré) mais le gzip dans le pipeline crypto compense

## Liens

- ADR 0003 — Proxy agnostique, scopes METHOD:PATH génériques
- Use case : déploiement Scalingo scopé par branche (POST /v1/apps/{app}/deployments)
