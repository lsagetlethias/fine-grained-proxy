# Deployer FGP sur Scalingo

Guide de deploiement de Fine-Grained Proxy sur [Scalingo](https://scalingo.com/).

## TL;DR

Scalingo ne supporte pas Deno nativement. La solution retenue est le buildpack [`betagouv/deno-buildpack`](https://github.com/betagouv/deno-buildpack), compatible Scalingo. Il installe Deno, cache les deps, et **execute automatiquement `deno task build`** si une task `build` existe dans `deno.json`, ce qui compile les assets CSS et client JS pendant la phase de build du slug, avant le demarrage du dyno.

## Etape par etape

### 1. Creer l'app Scalingo

```bash
scalingo create fgp-proxy
```

### 2. Configurer le buildpack

```bash
scalingo --app fgp-proxy env-set BUILDPACK_URL=https://github.com/betagouv/deno-buildpack.git
```

Le buildpack detecte automatiquement le projet via `deno.json` (affiche "Deno" + exit 0, compatible Scalingo). Pendant le build, il detecte la task `build` dans `deno.json` et execute `deno task build` : CSS, client JS, version et changelog sont compiles dans `static/` avant le demarrage du dyno. `static/` et `src/ui/changelog-data.ts` etant gitignores, ce build au deploy est indispensable.

Si besoin, la commande de build peut etre surchargee via la variable d'environnement `DENO_BUILD_CMD`.

### 3. Verifier le Procfile

Le `Procfile` a la racine du repo :

```
web: deno run --allow-net --allow-env=FGP_SALT,PORT,SCALINGO_API_URL,SCALINGO_AUTH_URL,FGP_LOGS_ENABLED,FGP_LOGS_BUFFER_NETWORK,FGP_LOGS_BUFFER_DETAILED,FGP_LOGS_INACTIVITY_MIN,FGP_LOGS_DETAILED_MAX_KB --allow-read=static src/main.ts
```

`deno run` et non `deno serve` : `src/main.ts` appelle `Deno.serve()` sous `import.meta.main` et n'exporte plus `default { fetch }`. Sous `deno serve`, le module afficherait un avertissement et sortirait en code 0, donc le dyno ne demarrerait jamais et Scalingo echouerait le health check TCP.

Pas de flag `--port` : `Deno.serve()` lit `PORT` directement. Les permissions sont les memes que celles du `Dockerfile` et de la task `start`, gardez les trois alignees.

### 4. Configurer les variables d'environnement

```bash
scalingo --app fgp-proxy env-set FGP_SALT="votre-salt-secret"
scalingo --app fgp-proxy env-set SCALINGO_API_URL="https://api.osc-fr1.scalingo.com"
scalingo --app fgp-proxy env-set SCALINGO_AUTH_URL="https://auth.scalingo.com"
```

`PORT` est automatiquement fourni par Scalingo.

### 5. Optionnel : fixer la version Deno

Creer un fichier `.deno-version` a la racine :

```
2.1.4
```

Sans ce fichier, le buildpack utilise sa version par defaut (2.1.4 au moment de l'ecriture).

### 6. Deployer

```bash
git remote add scalingo git@ssh.osc-fr1.scalingo.com:fgp-proxy.git
git push scalingo main
```

Le log de build doit montrer le build des assets avant le demarrage du dyno :

```
-----> Deno app detected
-----> Installing Deno ...
-----> Caching Deno dependencies
-----> Running build: deno task build
       ...
-----> Deno installation complete
```

### 7. Verifier

```bash
curl https://fgp-proxy.osc-fr1.scalingo.io/healthz
# {"status":"ok"}
```

## Risques et limites

### Buildpack community, pas officiel

`betagouv/deno-buildpack` est maintenu par l'equipe beta.gouv.fr. Il n'est pas officiel Scalingo. Risques :

- **Abandon** : si la maintenance s'arrete, pas de mise a jour Deno. Solution : forker.
- **Cache corrompu** : en cas de probleme entre deux builds, purger avec `scalingo --app fgp-proxy deployment-delete-cache`

### PORT

Scalingo injecte `PORT` comme variable d'environnement. FGP la lit via `Deno.env.get("PORT")` dans l'appel `Deno.serve()` de `src/main.ts`, avec un defaut a 8000. Aucun flag n'est necessaire dans le Procfile. Scalingo verifie que le process ecoute sur `$PORT` via un TCP SYN check au deploiement.

A noter : `deno serve` ignore la variable `PORT` et le champ `port` d'un export par defaut. C'est la raison pour laquelle le point d'entree utilise un `Deno.serve()` explicite.

### CompressionStream / Web Crypto

Ces APIs sont fournies par le runtime Deno. Tant que le buildpack installe une version recente de Deno (>= 1.38), tout fonctionne.

## Alternatives si le buildpack pose probleme

### Option A : Deployer sur Deno Deploy

C'est la cible naturelle pour FGP (voir [deno-deploy.md](./deno-deploy.md)). Zero config, support natif complet (JSR, Web Crypto, CompressionStream, `Deno.serve()`).

### Option B : Fly.io ou Railway avec Dockerfile

Ces plateformes supportent les Dockerfiles natifs. Le `Dockerfile` existant a la racine du repo est utilisable directement.

### Option C : Committer les assets buildes

Retirer `static/` et `src/ui/changelog-data.ts` du `.gitignore`, builder localement avant chaque push, committer les artifacts. Le Procfile reste `deno run ... src/main.ts` sans build.

## Recommandation

Pour FGP, **Deno Deploy est le choix naturel** : zero config, support natif complet. Scalingo reste viable via `betagouv/deno-buildpack`, avec une configuration minimale.

Si Scalingo est un hard requirement (contrainte infra, souverainete donnees FR, etc.), `betagouv/deno-buildpack` est la voie a suivre.
