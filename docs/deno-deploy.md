# Deployer FGP sur Deno Deploy

Guide de deploiement de Fine-Grained Proxy sur [Deno Deploy](https://deno.com/deploy).

## Compatibilite

FGP est compatible avec Deno Deploy :

- **Entry point** : `src/main.ts` exporte `{ port, fetch }` (pattern `deno serve` standard)
- **Web Crypto API** : AES-256-GCM et PBKDF2 supportes nativement
- **CompressionStream** : gzip supporte nativement
- **Deno.env.get()** : fonctionne pour les variables d'environnement

## Pre-requis : build des assets

Le CSS et le JS client sont compiles depuis les sources. Ces fichiers sont gitignored, ils doivent etre build avant chaque deploy :

```bash
deno task build
```

Cela compile :
- `src/ui/tailwind.css` → `static/styles.css` (Tailwind CSS 3, minifie)
- `src/ui/client.ts` → `static/client.js` (esbuild, minifie)

## Limitations

| Limite | Valeur (Free) | Impact FGP |
|--------|---------------|------------|
| Requetes/jour | 100 000 | Suffisant pour un usage modere |
| Memoire | 512 MB | OK, le cache bearer est la seule consommation RAM |
| CPU time | ~20h/mois | PBKDF2 100k iterations consomme du CPU par requete. A surveiller. |
| Outbound data | 100 GiB/mois | Depend du volume proxy |

Le plan Pro ($20/mois) leve ces limites.

## Variables d'environnement

Configurer dans la console Deno Deploy ([console.deno.com](https://console.deno.com) > Project > Settings > Environment Variables) :

| Variable | Requis | Description |
|----------|--------|-------------|
| `FGP_SALT` | Oui | Salt serveur pour PBKDF2 |
| `SCALINGO_API_URL` | Non | URL API Scalingo (defaut: `https://api.osc-fr1.scalingo.com`) |
| `SCALINGO_AUTH_URL` | Non | URL auth Scalingo (defaut: `https://auth.scalingo.com`) |
| `FGP_GITHUB_REPO` | Non | Repo GitHub `owner/name` pour le SHA de build (defaut: `lsagetlethias/fine-grained-proxy`) |
| `FGP_EGRESS_ALLOW_PRIVATE` | Non | **Ne jamais activer en production.** Voir l'avertissement ci-dessous |
| `FGP_TRUSTED_PROXY_HOPS` | Non | Nombre de proxys de confiance en amont pour lire `X-Forwarded-For` (defaut `0`, l'en-tete est ignore) |

`PORT` n'est pas necessaire (gere par Deno Deploy).

> **SHA de build** : git n'est pas disponible sur Deno Deploy. Le script `build:version` fallback sur l'API GitHub pour resoudre le SHA du dernier commit. Si vous deployez un fork, positionnez `FGP_GITHUB_REPO` sur votre repo pour que le lien dans le footer pointe au bon endroit.

> **`FGP_EGRESS_ALLOW_PRIVATE=1` annule la garantie de destination.**
> Il desactive le refus des adresses non publiques. Une instance qui tourne avec cet interrupteur redevient une SSRF non authentifiee : n'importe qui lui fait emettre des requetes vers le reseau prive de l'hebergeur, service de metadonnees compris, et en recupere la reponse. Il existe pour le developpement local et les tests. Sur une instance publique, il ne doit pas etre positionne.

## Limitation de debit

**FGP n'implemente aucune limitation de debit, et c'est un choix documente** (ADR-0010). Un limiteur en memoire du processus est quasi inoperant sur Deno Deploy : l'etat est par isolate, les isolates sont ephemeres, et les requetes se repartissent entre eux. Livrer un limiteur qui ne fonctionne que sur une cible de deploiement sur deux donnerait une fausse couverture, ce qui est pire que pas de couverture.

**La borne doit donc etre posee devant l'instance**, dans un CDN ou un WAF.

L'ordre de grandeur qui justifie de ne pas s'en passer : avant les correctifs de l'ADR-0010, **1 900 requetes suffisaient a epuiser les 20 heures de CPU mensuelles du plan gratuit**. Les correctifs ont supprime le cout unitaire aberrant, ils n'ont pas supprime le besoin d'une borne sur le nombre de requetes. Une vingtaine d'heures d'inondation suffit toujours a consommer le quota mensuel.

A configurer en frontal :

- une limite par IP sur `/api/*`, ou vivent les endpoints de generation et les helpers ;
- une limite plus large sur la route proxy `/{blob}/*`, qui porte le trafic utile ;
- un plafond de taille de requete, en complement des plafonds applicatifs.

**Le filtrage d'egress au niveau reseau** est par ailleurs la seule defense reelle contre le rebinding DNS, que la politique de sortie ne ferme pas (specs section 18.2). Si votre frontal ou votre reseau le permet, restreindre les destinations sortantes de l'instance complete utilement la politique applicative.

## Deployer via CLI

```bash
# Build le client
deno task build

# Creer le projet et deployer
deno deploy create \
  --app fgp-proxy \
  --source local \
  --build-timeout 5 \
  --org my-org \
  --region eu

# Deployments suivants
deno deploy \
  --app fgp-proxy
```

## Deployer via GitHub (console)

1. [console.deno.com](https://console.deno.com) > New Project
2. Connecter le repo GitHub
3. Entry point : `src/main.ts`
4. Build command : `deno task build`
5. Framework preset : aucun
6. Configurer les variables d'environnement
7. Chaque push sur `main` declenche un deploiement automatique

Ou via le bouton deploy :

```
https://console.deno.com/new?clone=REPO_URL&build=deno%20task%20build:client
```

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
        run: deno task build

      - name: Run tests
        run: deno task verify

      - name: Deploy
        uses: denoland/deployctl@v1
        with:
          project: fgp-proxy
          entrypoint: src/main.ts
          include: src,static,deno.json,deno.lock
```

## Verifier

```bash
curl https://fgp-proxy.deno.dev/healthz
# {"status":"ok"}

curl https://fgp-proxy.deno.dev/api/docs
# Swagger UI
```

## Domaines custom

Configurables depuis [console.deno.com](https://console.deno.com) > Project > Settings > Domains.
