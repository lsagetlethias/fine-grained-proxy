# Deployer FGP sur Scalingo

Guide de deploiement de Fine-Grained Proxy sur [Scalingo](https://scalingo.com/). C'est la cible de deploiement principale du projet depuis la migration vers Node (ADR-0011). La seconde est Docker.

## TL;DR

Scalingo supporte Node nativement, par son buildpack officiel. Il lit `package.json`, installe les dependances depuis le lockfile, execute le script `build` pendant la phase de build du slug, puis demarre la commande `web` du `Procfile`. Aucun buildpack community n'est necessaire.

## Etape par etape

### 1. Creer l'app Scalingo

```bash
scalingo create fgp-proxy
```

### 2. Buildpack

Rien a configurer. La presence de `package.json` a la racine suffit a la detection du buildpack Node.

Le gestionnaire de paquets vient du champ `packageManager` de `package.json` (`pnpm@10.24.0`) et du `pnpm-lock.yaml`. **Verifiez dans le log de build que c'est bien pnpm qui installe**, et pas un `npm install` qui ignorerait le lockfile : le support de pnpm depend de la version du buildpack, et une installation hors lockfile n'est pas la meme que celle que la CI a verifiee.

### 3. La phase de build doit produire les assets ET le bundle serveur

`static/`, `src/ui/changelog-data.ts` et `dist/` ne sont pas commites. Tout est construit au deploiement, et il y a un piege.

- Le script `build` compile les assets de l'interface : CSS Tailwind, bundles client, `static/version.txt`, `src/ui/changelog-data.ts`.
- Le bundle serveur `dist/main.js` vient de `build:server`.
- `build:prod` enchaine les deux, c'est lui qui produit un slug complet.

**Le bundle serveur ne peut pas etre construit au demarrage du dyno.** Les `devDependencies` sont elaguees apres la phase de build : esbuild, Tailwind et tsx ne sont plus la au boot. Une commande `web` qui tenterait de builder echouerait, et le dyno ne passerait jamais le health check TCP. Verifiez dans le log de build que `dist/main.js` a ete produit avant le demarrage.

Corollaire agreable : le serveur tourne depuis un bundle unique qui embarque ses dependances, donc l'elagage ne lui retire rien.

### 4. Verifier le Procfile

Le `Procfile` a la racine du repo :

```
web: node --permission --allow-net --allow-fs-read=./static --allow-fs-read=./dist dist/main.js
```

Pas de flag de port : le serveur lit `PORT` directement, et Scalingo l'injecte.

`--permission` active le systeme de permissions de Node. Il refuse par defaut les processus fils, les threads, les addons natifs et le FFI, et il restreint la lecture disque aux deux repertoires declares. **Il n'y a aucun equivalent de `--allow-env` dans Node** : le processus lit tout `process.env`, et avec lui toutes les variables que Scalingo injecte. C'est le cout assume de la migration, documente dans l'ADR-0011. Ne retirez pas `--permission` pour faire taire une erreur d'acces : elargir une permission pour contourner un refus annule le durcissement.

### 5. Configurer les variables d'environnement

Les onze variables lues par le serveur, leur caractere requis et ce qui s'applique quand elles sont absentes. Le registre de reference est `ENV_NAMES` dans `src/env.ts`.

| Variable | Requis | Absente, le serveur applique |
|----------|--------|------------------------------|
| `FGP_SALT` | oui | rien. Le salt est indispensable a la derivation de cle, `GET /api/salt` repond `500` et le proxy ne peut pas dechiffrer |
| `PORT` | non | ecoute sur `8000`. Scalingo injecte la variable, ne la positionnez pas a la main |
| `SCALINGO_API_URL` | non | `https://api.osc-fr1.scalingo.com` |
| `SCALINGO_AUTH_URL` | non | `https://auth.scalingo.com` |
| `FGP_EGRESS_ALLOW_PRIVATE` | non | classification des destinations **active**. C'est le defaut sur, voir l'avertissement ci-dessous |
| `FGP_TRUSTED_PROXY_HOPS` | non | `0` : `X-Forwarded-For` et `X-Real-IP` sont ignores, l'IP des logs est celle du pair |
| `FGP_LOGS_ENABLED` | non | feature `/logs` **desactivee** : `/logs` et `/logs/stream` repondent 404, aucune capture n'a lieu. `/logs/health` repond toujours |
| `FGP_LOGS_BUFFER_NETWORK` | non | `50` entries network par blob |
| `FGP_LOGS_BUFFER_DETAILED` | non | `10` entries detailed par blob |
| `FGP_LOGS_INACTIVITY_MIN` | non | `10` minutes d'inactivite avant purge du buffer d'un blob |
| `FGP_LOGS_DETAILED_MAX_KB` | non | `32` KB de body capture avant troncature |

Une variable optionnelle absente retombe toujours sur son defaut, et **ce defaut est sur** : la classification des destinations reste active, `X-Forwarded-For` reste ignore, la feature logs reste eteinte. Aucune absence ne vaut opt-in a un comportement moins strict.

Le minimum a positionner :

```bash
scalingo --app fgp-proxy env-set FGP_SALT="votre-salt-secret"
```

Derriere le routeur Scalingo, pour que les logs voient l'IP reelle de l'appelant :

```bash
scalingo --app fgp-proxy env-set FGP_TRUSTED_PROXY_HOPS="1"
```

A `0`, l'en-tete est ignore et l'IP capturee est celle du routeur, pas celle du client. Au-dessus, l'IP retenue est la n-ieme de `X-Forwarded-For` en partant de la droite, jamais la premiere : la partie gauche est ecrite par l'appelant.

> **Ne jamais positionner `FGP_EGRESS_ALLOW_PRIVATE=1` sur une instance publique.**
> Cet interrupteur desactive le refus des destinations non publiques, donc la garantie de destination de la politique de sortie (ADR-0009). L'instance redevient une SSRF non authentifiee : n'importe qui lui fait emettre des requetes vers le reseau prive de l'hebergeur, service de metadonnees compris, et en recupere la reponse. Il existe pour le developpement local et la suite de tests, rien d'autre.

Une douzieme variable existe, elle n'est pas lue par le serveur mais par le build :

| Variable | Requis | Absente |
|----------|--------|---------|
| `FGP_GITHUB_REPO` | non | repo resolu depuis le remote `origin`, a defaut `lsagetlethias/fine-grained-proxy` |

`scripts/version.ts` resout le SHA affiche dans le pied de page de l'interface. Il essaie `git rev-parse`, puis l'API GitHub, puis retombe sur `dev`. Si vous deployez un fork et que le build n'a pas acces au `.git`, positionnez `FGP_GITHUB_REPO` pour que le lien pointe au bon endroit.

### 6. Version de Node

Le buildpack lit le champ `engines.node` de `package.json` (`>=26 <27`). Le `.nvmrc` a la racine porte la meme contrainte pour le developpement local. Les deux doivent rester d'accord.

### 7. Deployer

```bash
git remote add scalingo git@ssh.osc-fr1.scalingo.com:fgp-proxy.git
git push scalingo main
```

Le log de build doit montrer, dans cet ordre : la detection Node, l'installation depuis le lockfile, le script de build, et la production de `dist/main.js`.

### 8. Verifier

```bash
curl https://fgp-proxy.osc-fr1.scalingo.io/healthz
# {"status":"ok"}
```

Un `/healthz` vert ne dit pas que le flux proxy fonctionne. Faites passer une vraie requete proxy avec un blob de test : la panne de production du 14 septembre 2026 laissait precisement `/healthz` repondre pendant que toute requete proxy sortait en `500`.

## Le contrat d'ajout d'une variable d'environnement

**Ce guide fait partie du contrat, et aucun test ne le verifie.** C'est a la revue de le tenir.

Depuis la migration, l'ajout d'une variable lue par le serveur passe par trois endroits :

1. `ENV_NAMES` dans `src/env.ts`, le registre. Sans lui, `readEnv` refuse le nom au type-check.
2. `.env.example`, **commentee** si la variable est optionnelle. Non commentee, elle est toujours posee en developpement et l'environnement local cesse de ressembler a la production.
3. Le tableau de la section 5 ci-dessus, et le README.

Le point 1 face au point 2 est verrouille par le test de parite `tests/testu/env-registry.test.ts`, qui lit les fichiers reels. Le point 3 ne l'est pas, et ne peut pas l'etre.

Avant la migration, ce contrat comptait cinq endroits verrouilles : le registre, les six listes `--allow-env` de `deno.json`, le `Procfile`, le `Dockerfile` et `.env.example`. Les trois allow-lists ont disparu avec le modele de permissions de Deno sur l'environnement. **Le filet est plus mince qu'avant** : une variable lue sans etre declaree nulle part fonctionne en local et manque silencieusement en production. Voir l'ADR-0011.

## Limitation de debit

**FGP n'implemente aucune limitation de debit** (ADR-0010, D9). L'argument d'origine etait la portabilite : un limiteur en memoire est inoperant sur Deno Deploy, ou l'etat est par isolate, et livrer un limiteur efficace sur une cible sur deux aurait donne une fausse couverture.

Cette cible a disparu avec la migration. Les deux qui restent, Scalingo et Docker, ont un processus unique et durable, ou un limiteur en processus fonctionnerait reellement. **La decision n'est pas pour autant renversee** : elle attend d'etre reexaminee pour elle-meme (ADR-0011, Consequences). En attendant, la borne sur le debit est a poser en frontal.

Configuration recommandee sur le reverse proxy qui expose l'app :

- `limit_req` par IP sur `/api/*` ;
- une zone plus large sur la route proxy `/{blob}/*` ;
- un plafond de taille de corps, en complement des plafonds applicatifs.

**Une note qui compte pour cette cible** : sur un processus unique, une requete emballee n'est pas une requete lente, c'est une **indisponibilite totale**. Le runtime est mono-thread, toute milliseconde de CPU synchrone consommee par une requete est une milliseconde pendant laquelle aucune autre n'avance. Les plafonds de l'ADR-0010 bornent le cout d'une requete precisement pour cette raison, mais ils ne bornent pas leur nombre.

**Le filtrage d'egress au niveau reseau** complete par ailleurs la politique de sortie, et reste la seule defense reelle contre le rebinding DNS (specs section 18.2).

## Risques et limites

### Buildpack officiel

C'est un gain de la migration : le buildpack Node est maintenu par Scalingo, la ou `betagouv/deno-buildpack` etait un buildpack community dont l'abandon etait un risque identifie.

En cas de probleme de cache entre deux builds : `scalingo --app fgp-proxy deployment-delete-cache`.

### PORT

Scalingo injecte `PORT`. Le serveur la lit via `readEnv("PORT")`, avec un defaut a 8000. Aucun flag n'est necessaire dans le `Procfile`. Scalingo verifie que le process ecoute sur `$PORT` par un TCP SYN check au deploiement.

### CompressionStream et Web Crypto

Ces APIs sont fournies par le runtime. Elles sont natives dans Node : `crypto.subtle`, `CompressionStream` et `DecompressionStream` sont presents sans dependance, verifie sur Node 26.10.0. La contrainte `engines.node` de `package.json` est ce qui les garantit.

## Alternative : Docker

Le `Dockerfile` a la racine du repo construit la meme chose et se deploie tel quel sur toute plateforme qui accepte une image, Fly.io, Railway, Scalingo en mode Docker ou un hote nu. Les permissions du `CMD` sont les memes que celles du `Procfile`.
