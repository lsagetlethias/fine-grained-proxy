# Guide contextuel — Exemples pour le panel doc UI

Contenu destiné aux accordéons du panel latéral droit de la page de configuration.
Chaque section = un accordéon. Ton concis, orienté action.

---

## 1. Scopes — Exemples courants

### Lecture seule sur toutes les apps

```
GET:/v1/apps/*
```

- **Autorise** : `GET /v1/apps/my-app`, `GET /v1/apps/my-app/containers`, `GET /v1/apps/other-app/addons`
- **Bloque** : `POST /v1/apps/my-app/scale`, `DELETE /v1/apps/my-app`, `GET /v1/users/self`

### Lecture + scale sur une app précise

```
GET:/v1/apps/my-app/*
POST:/v1/apps/my-app/scale
```

- **Autorise** : `GET /v1/apps/my-app/containers`, `POST /v1/apps/my-app/scale`
- **Bloque** : `GET /v1/apps/other-app/containers`, `POST /v1/apps/my-app/deployments`, `DELETE /v1/apps/my-app`

### Full access (toutes méthodes, toutes routes)

```
*:*
```

- **Autorise** : tout
- **Bloque** : rien — à utiliser uniquement pour du debug ou des tokens très courts (TTL 1h)

### Multi-méthodes avec pipe

```
GET|POST:/v1/apps/*
```

- **Autorise** : `GET /v1/apps/my-app`, `POST /v1/apps/my-app/deployments`
- **Bloque** : `DELETE /v1/apps/my-app`, `PATCH /v1/apps/my-app`

---

## 2. Scopes — Edge cases

### Wildcard mid-path

```
GET:/v1/apps/*/containers
```

Matche tous les containers de toutes les apps, mais uniquement la route `/containers` exacte.

- **Autorise** : `GET /v1/apps/my-app/containers`, `GET /v1/apps/prod-api/containers`
- **Bloque** : `GET /v1/apps/my-app/containers/web-1`, `GET /v1/apps/my-app/addons`

### Exact match (pas de wildcard)

```
GET:/v1/apps/my-app
```

Matche uniquement cette route exacte, pas les sous-routes.

- **Autorise** : `GET /v1/apps/my-app`
- **Bloque** : `GET /v1/apps/my-app/containers`, `GET /v1/apps/my-app/addons`

### Trailing wildcard

```
GET:/v1/apps/*
```

Matche tout ce qui commence par `/v1/apps/` suivi d'au moins un caractère.

- **Autorise** : `GET /v1/apps/my-app`, `GET /v1/apps/my-app/containers/web-1`
- **Bloque** : `GET /v1/apps` (pas de segment après `/apps/`), `GET /v1/users/self`

---

## 3. Body filters — Exemples courants

Les body filters s'appliquent aux scopes POST, PUT, PATCH. Ils contraignent le contenu JSON du body de la requête.

### Déploiement scopé par branche

Scope : `POST:/v1/apps/my-app/deployments`
Filtre : `deployment.git_ref` = `master` | `main`

- **Autorise** : body `{"deployment": {"git_ref": "main", "source_url": "..."}}`
- **Bloque** : body `{"deployment": {"git_ref": "develop", "source_url": "..."}}`

### Source restreinte (wildcard string)

Scope : `POST:/v1/apps/my-app/deployments`
Filtre : `deployment.source_url` = `https://github.com/my-org/*` (type stringwildcard)

- **Autorise** : body `{"deployment": {"source_url": "https://github.com/my-org/api/archive/main.tar.gz"}}`
- **Bloque** : body `{"deployment": {"source_url": "https://github.com/hacker/malicious/archive/main.tar.gz"}}`

### Vérifier qu'un champ existe

Filtre : `deployment.git_ref` = wildcard (type "exists")

- **Autorise** : tout body contenant le champ `deployment.git_ref`, quelle que soit la valeur
- **Bloque** : body sans le champ `deployment.git_ref`

---

## 4. Body filters — Edge cases

### Type exact (boolean)

Filtre : `container.enabled` = `true` (type boolean)

Le match est strict sur le type JSON. La string `"true"` ne matche pas le boolean `true`.

- **Autorise** : body `{"container": {"enabled": true}}`
- **Bloque** : body `{"container": {"enabled": "true"}}`, `{"container": {"enabled": false}}`

### Exclusion (NOT)

Filtre : `deployment.git_ref` != `develop` (type not)

- **Autorise** : body `{"deployment": {"git_ref": "main"}}`, `{"deployment": {"git_ref": "release/v2"}}`
- **Bloque** : body `{"deployment": {"git_ref": "develop"}}`

### Combinaison AND

Filtre : `deployment.git_ref` = AND(`release/*` (stringwildcard), NOT `release/broken`)

Toutes les conditions doivent être vraies simultanément.

- **Autorise** : body `{"deployment": {"git_ref": "release/v1.2.0"}}`
- **Bloque** : body `{"deployment": {"git_ref": "release/broken"}}`, `{"deployment": {"git_ref": "main"}}`

### Regex

Filtre : `deployment.git_ref` = regex `^v\d+\.\d+\.\d+$` (semver tags)

- **Autorise** : body `{"deployment": {"git_ref": "v1.2.3"}}`, `{"deployment": {"git_ref": "v0.10.0"}}`
- **Bloque** : body `{"deployment": {"git_ref": "v1.2"}}`, `{"deployment": {"git_ref": "main"}}`, `{"deployment": {"git_ref": "v1.2.3-beta"}}`

Limite : le pattern regex est limité à 200 caractères. Le match s'applique uniquement sur des valeurs string. Par défaut le regex est partiel (pas besoin de matcher toute la string) — utilisez `^...$` pour un match exact.

---

## 5. Auth modes — Quand utiliser quoi

### bearer

Le proxy envoie `Authorization: Bearer <token>` à l'API cible.

Usage : la majorité des APIs REST modernes (GitHub, Stripe, etc.).

### basic

Le proxy envoie `Authorization: Basic <base64(:token)>` à l'API cible.

Usage : APIs legacy avec Basic Auth, services internes, registries Docker.

### scalingo-exchange

Le proxy échange le token API Scalingo (`tk-us-...`) contre un bearer temporaire (1h), le cache en mémoire chiffré, et le renouvelle automatiquement.

Usage : exclusivement pour l'API Scalingo. Le preset "Scalingo" configure ce mode automatiquement.

### header:X-API-Key

Le proxy envoie le token dans un header custom `X-API-Key: <token>` (le nom du header est configurable).

Usage : APIs qui attendent l'authentification dans un header spécifique autre que `Authorization` (Algolia, SendGrid, etc.).

---

## 6. Regex — Mini-guide

### Patterns courants

| Pattern | Matche | Ne matche pas |
|---|---|---|
| `^release/.*` | `release/v1`, `release/hotfix` | `feature/release/v1`, `main` |
| `v\d+` | `v1`, `v12`, `release-v3` | `main`, `version` |
| `^(main\|master)$` | `main`, `master` | `main-backup`, `my-master` |
| `^v\d+\.\d+\.\d+$` | `v1.2.3`, `v0.10.0` | `v1.2`, `v1.2.3-beta` |
| `.*-prod$` | `api-prod`, `web-prod` | `prod`, `prod-api` |

### Pièges fréquents

**Match partiel par défaut** : le pattern `release` matche `release`, mais aussi `my-release-branch`. Pour un match exact, encadrez avec `^...$` : `^release$`.

**Pas d'échappement du pipe** : dans un regex, `main|master` signifie "main OU master". Si vous voulez matcher le caractère `|` littéral, échappez-le : `main\|master`. Mais dans le champ scopes (multi-méthodes), le pipe sépare les méthodes HTTP — ce sont deux contextes différents.

**Limite** : max 200 caractères par pattern. Testées uniquement sur des valeurs string dans le body JSON. Une valeur numérique ou boolean ne sera jamais matchée par un regex.
