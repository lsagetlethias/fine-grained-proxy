# Deployer FGP sur Deno Deploy

Guide de deploiement de Fine-Grained Proxy sur [Deno Deploy](https://deno.com/deploy).

## Compatibilite

FGP est compatible avec Deno Deploy :

- **Entry point** : `src/main.ts` exporte `{ port, fetch }` (pattern `deno serve` standard)
- **Web Crypto API** : AES-256-GCM et PBKDF2 supportes nativement
- **CompressionStream** : gzip supporte nativement
- **Deno.env.get()** : fonctionne pour les variables d'environnement

## Pre-requis : build du client

Le JS client (`static/client.js`) est compile depuis TypeScript via esbuild. Ce fichier est gitignore — il doit etre build avant chaque deploy :

```bash
deno task build:client
```

Cela compile `src/ui/client.ts` → `static/client.js` (minifie, ~32KB).

## Limitations

| Limite | Valeur (Free) | Impact FGP |
|--------|---------------|------------|
| Requetes/jour | 100 000 | Suffisant pour un usage modere |
| Memoire | 512 MB | OK, le cache bearer est la seule consommation RAM |
| CPU time | ~20h/mois | PBKDF2 100k iterations consomme du CPU par requete. A surveiller. |
| Outbound data | 100 GiB/mois | Depend du volume proxy |

Le plan Pro ($20/mois) leve ces limites.

## Variables d'environnement

Configurer dans le dashboard (Project > Settings > Environment Variables) :

| Variable | Requis | Description |
|----------|--------|-------------|
| `FGP_SALT` | Oui | Salt serveur pour PBKDF2 |
| `SCALINGO_API_URL` | Non | URL API Scalingo (defaut: `https://api.osc-fr1.scalingo.com`) |
| `SCALINGO_AUTH_URL` | Non | URL auth Scalingo (defaut: `https://auth.scalingo.com`) |

`PORT` n'est pas necessaire (gere par Deno Deploy).

## Deployer via CLI

```bash
# Build le client
deno task build:client

# Deploy
deployctl deploy --project=fgp-proxy --entrypoint=src/main.ts --include=src,static,deno.json,deno.lock
```

Le `--include` est important pour inclure le dossier `static/` (build output) dans le deploy.

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

      - name: Build client
        run: deno task build:client

      - name: Run tests
        run: deno task verify

      - name: Deploy
        uses: denoland/deployctl@v1
        with:
          project: fgp-proxy
          entrypoint: src/main.ts
          include: src,static,deno.json,deno.lock
```

## Deployer via GitHub Integration (dashboard)

1. [dash.deno.com](https://dash.deno.com) > New Project > connecter le repo GitHub
2. Entry point : `src/main.ts`
3. Build command : `deno task build:client`
4. Framework preset : aucun
5. Configurer les variables d'environnement
6. Chaque push sur `main` declenche un deploiement automatique

## Verifier

```bash
curl https://fgp-proxy.deno.dev/healthz
# {"status":"ok"}

curl https://fgp-proxy.deno.dev/api/docs
# Swagger UI
```
