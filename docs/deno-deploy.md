# Deployer FGP sur Deno Deploy

Guide de deploiement de Fine-Grained Proxy sur [Deno Deploy](https://deno.com/deploy).

## Compatibilite

FGP est compatible avec Deno Deploy. Les points cles :

- **Entry point** : `src/main.ts` utilise `Deno.serve()` via `import.meta.main` et exporte `app` par defaut (pattern Hono standard). Deno Deploy supporte les deux approches.
- **Web Crypto API** : supportee nativement sur Deno Deploy. AES-256-GCM et PBKDF2 fonctionnent sans modification.
- **CompressionStream / DecompressionStream** : supportes nativement sur Deno Deploy (gzip, deflate).
- **JSR imports** : natifs sur Deno Deploy. Les imports `jsr:@hono/hono`, `jsr:@std/encoding`, etc. du `deno.json` fonctionnent directement.
- **`Deno.env.get()`** : fonctionne sur Deno Deploy pour lire les variables d'environnement.

## Limitations a connaitre

| Limite | Valeur (Free) | Impact FGP |
|--------|---------------|------------|
| Requetes/jour | 100 000 | Suffisant pour un usage modere |
| Memoire | 512 MB | OK, FGP est stateless (seul le cache bearer Scalingo consomme de la RAM) |
| CPU time | ~20h/mois | PBKDF2 (100k iterations) consomme du CPU par requete. A surveiller sous forte charge. |
| Outbound data | 100 GiB/mois | Transparent, depend du volume proxy |

Le plan Pro ($20/mois) leve la plupart de ces limites.

**Point d'attention** : PBKDF2 avec 100 000 iterations est CPU-intensive. Sur le free tier, chaque requete proxyfiee declenche une derivation de cle. Sous forte charge, le budget CPU peut etre atteint rapidement. A monitorer.

## Prerequis

- Un compte [Deno Deploy](https://dash.deno.com)
- [Deno CLI](https://deno.com) >= 2.x installe localement

## Variables d'environnement

Configurer dans le dashboard Deno Deploy (Project > Settings > Environment Variables) :

| Variable | Requis | Description |
|----------|--------|-------------|
| `FGP_SALT` | Oui | Salt serveur pour la derivation de cle (PBKDF2) |
| `SCALINGO_API_URL` | Non | URL de l'API Scalingo (defaut: `https://api.osc-fr1.scalingo.com`) |
| `SCALINGO_AUTH_URL` | Non | URL du service auth Scalingo (defaut: `https://auth.scalingo.com`) |

`PORT` n'est pas necessaire sur Deno Deploy (gere automatiquement).

## Deployer via CLI

### Premiere fois

```bash
# Authentification (ouvre le navigateur)
deno deploy

# Creer le projet et deployer
deno deploy create --app fgp-proxy --entrypoint src/main.ts
```

Ou via token pour CI :

```bash
export DENO_DEPLOY_TOKEN="ddp_xxxxxxxxxxxx"
```

### Deploiements suivants

```bash
deno deploy --app fgp-proxy
```

Le CLI detecte automatiquement le `deno.json` et uploade le repertoire courant.

### Configurer les env vars via CLI

```bash
deno deploy env set FGP_SALT "votre-salt-secret" --app fgp-proxy
```

### Verifier

```bash
curl https://fgp-proxy.deno.dev/healthz
# {"status":"ok"}
```

## Deployer via GitHub Integration

1. Aller sur [dash.deno.com](https://dash.deno.com) > New Project
2. Connecter le repo GitHub
3. Configurer l'entry point : `src/main.ts`
4. Framework preset : aucun (laisser vide)
5. Configurer les variables d'environnement dans le dashboard
6. Chaque push sur `main` declenche un deploiement automatique
7. Chaque PR obtient une preview URL

## Deployer via GitHub Actions

```yaml
name: Deploy to Deno Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: read
    steps:
      - uses: actions/checkout@v4
      - uses: denoland/setup-deno@v2
      - run: deno task verify
      - uses: denoland/deployctl@v1
        with:
          project: fgp-proxy
          entrypoint: src/main.ts
```

## Notes

- Le `export default app` dans `src/main.ts` est le pattern standard pour Deno Deploy avec Hono. Le guard `import.meta.main` fait que `Deno.serve()` n'est appele qu'en execution directe.
- Les domaines custom sont configurables depuis le dashboard Deno Deploy.
- Pas de stockage persistant sur Deno Deploy, ce qui colle avec l'architecture zero-storage de FGP.
