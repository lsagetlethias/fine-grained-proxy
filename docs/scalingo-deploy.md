# Deployer FGP sur Scalingo

Guide de deploiement de Fine-Grained Proxy sur [Scalingo](https://scalingo.com/).

## TL;DR

Scalingo ne supporte pas Deno nativement. Pas de buildpack officiel, **pas de Dockerfile natif au build**. La seule option viable est le **buildpack Heroku pour Deno** (`chibat/heroku-buildpack-deno`), compatible avec Scalingo via la variable `BUILDPACK_URL`.

## Recherche : est-ce que Scalingo supporte Deno ?

### Runtimes natifs Scalingo

Scalingo supporte nativement : Node.js, Ruby, Python, PHP, Java, Go, Scala, Elixir, Clojure. **Deno n'est pas dans la liste.**

### Dockerfile natif ?

**Non.** Scalingo n'execute pas de Dockerfile au build. Le systeme de build est 100% base sur des buildpacks. Le "Docker Image Addon" permet d'**exporter** l'image buildee par Scalingo, pas de builder depuis un Dockerfile custom.

Un `Dockerfile` a la racine du repo sera simplement ignore par Scalingo.

### Buildpack custom : la seule option

Scalingo supporte les buildpacks Heroku via la variable d'environnement `BUILDPACK_URL`. Le buildpack [`chibat/heroku-buildpack-deno`](https://github.com/chibat/heroku-buildpack-deno) est le seul buildpack Deno maintenu.

## Etape par etape

### 1. Creer l'app Scalingo

```bash
scalingo create fgp-proxy
```

### 2. Configurer le buildpack Deno

```bash
scalingo --app fgp-proxy env-set BUILDPACK_URL=https://github.com/chibat/heroku-buildpack-deno.git
```

### 3. Ajouter un Procfile

Creer un fichier `Procfile` a la racine du repo :

```
web: deno run --allow-net --allow-env --allow-read src/main.ts
```

Le process `web` est obligatoire sur Scalingo. Il doit ecouter sur `$PORT` (FGP le fait deja via `Deno.env.get("PORT")`).

### 4. Optionnel : fixer la version Deno

Creer un fichier `runtime.txt` a la racine :

```
2.1.4
```

Sans ce fichier, le buildpack utilise la derniere version de Deno.

### 5. Configurer les variables d'environnement

```bash
scalingo --app fgp-proxy env-set FGP_SALT="votre-salt-secret"
scalingo --app fgp-proxy env-set SCALINGO_API_URL="https://api.osc-fr1.scalingo.com"
scalingo --app fgp-proxy env-set SCALINGO_AUTH_URL="https://auth.scalingo.com"
```

`PORT` est automatiquement fourni par Scalingo.

### 6. Deployer

```bash
git remote add scalingo git@ssh.osc-fr1.scalingo.com:fgp-proxy.git
git push scalingo main
```

### 7. Verifier

```bash
curl https://fgp-proxy.osc-fr1.scalingo.io/healthz
# {"status":"ok"}
```

## Risques et limites

### Buildpack community, pas officiel

Le buildpack `chibat/heroku-buildpack-deno` est maintenu par un contributeur individuel. Il n'est ni officiel Heroku, ni officiel Scalingo. Risques :

- **Abandon** : si le mainteneur arrete, pas de mise a jour Deno
- **Compatibilite** : le buildpack est fait pour Heroku, pas Scalingo. Il fonctionne grace a la compatibilite buildpack entre les deux plateformes, mais rien ne le garantit a long terme
- **Cache deps** : le buildpack cache les deps Deno. Si ca casse, il faut purger le cache (`scalingo --app fgp-proxy deployment-delete-cache`)

### Pas de JSR natif dans le buildpack

Le buildpack telecharge Deno et execute la commande du Procfile. Les imports JSR (`jsr:@hono/hono`, etc.) sont resolus au runtime via le `deno.json`. Ca devrait fonctionner, mais ce n'est pas un chemin teste par le mainteneur du buildpack.

### CompressionStream / Web Crypto

Ces APIs sont fournies par le runtime Deno, pas par Scalingo. Tant que le buildpack installe une version recente de Deno (>= 1.38), tout fonctionne.

### PORT

Scalingo injecte la variable `PORT`. FGP la lit via `Deno.env.get("PORT")` avec un defaut a 8000. Compatible out of the box. Scalingo verifie que le process ecoute sur `$PORT` via un TCP SYN check au deploiement.

## Alternatives si le buildpack pose probleme

### Option A : Deployer sur Deno Deploy

C'est la cible naturelle pour FGP (voir [deno-deploy.md](./deno-deploy.md)). Zero config, support natif de tout ce qu'utilise le projet (JSR, Web Crypto, CompressionStream, `Deno.serve()`).

### Option B : Fly.io ou Railway avec Dockerfile

Ces plateformes supportent les Dockerfile natifs. Creer un Dockerfile basique avec `denoland/deno` comme base image.

### Option C : Multi-buildpack avec apt-buildpack

Utiliser le multi-buildpack Scalingo pour installer Deno via le apt-buildpack :

```
# .buildpacks
https://github.com/Scalingo/apt-buildpack.git
https://github.com/Scalingo/nodejs-buildpack.git
```

Plus fragile que l'option buildpack Deno, pas recommande en production.

## Recommandation

Pour FGP, **Deno Deploy est le choix naturel** : zero config, support natif complet. Scalingo reste viable via le buildpack community, mais avec plus de friction et de risque de casse sur le long terme.

Si Scalingo est un hard requirement (contrainte infra, souverainete donnees FR, etc.), le buildpack `chibat/heroku-buildpack-deno` est la voie a suivre. Tester le deploiement en staging avant de se committer.
