# Prez FGP : forum secu

Deck [Slidev](https://sli.dev) pour la presentation technique de Fine-Grained Proxy.
Format ~25 min, public mixte dev/secu, demo integree UI + terminal.

## Lancer le deck

```bash
cd presentation
pnpm install
pnpm dev      # http://localhost:3030
```

Presenter mode + notes : touche `p` dans Slidev, ou `/presenter` sur l'URL.

## Export

```bash
pnpm export:pdf   # slides en PDF (partage post-talk)
pnpm export:png   # une PNG par slide
```

## Format

`slides.md` est formate par Prettier via `prettier-plugin-slidev` (parser `slidev`, scope sur `slides.md` dans `.prettierrc.json`). Deno fmt n'est pas utilise ici : il casserait les separateurs de slides.

```bash
pnpm format        # formate slides.md
pnpm format:check  # verifie sans ecrire
```

## Demo live

Le deck reference une demo en 4 temps. **Zero dependance reseau** : un mock upstream
local en Deno (`demo-upstream/server.ts`) tient lieu d'API cible, protege par une cle
API bidon. Tout tourne en local. Le script `demo.ts` affiche chaque requete envoyee
(methode, URL, headers, body) et pretty-print les reponses JSON, pour une demo lisible.

Trois terminaux. Les commandes sont dispo en script pnpm (`pnpm demoN`) ou en direct
(`deno run -A demo.ts <cmd>`) :

1. **Mock upstream** (API cible locale sur `:9000`) :
   ```bash
   pnpm demo:upstream
   ```
2. **FGP** (proxy sur `:8000`, `FGP_SALT` requis dans `.env`) :
   ```bash
   cd .. && deno task dev
   ```
3. **Terminal de demo** :
   ```bash
   pnpm demo1                    # generer un blob (target=mock local, auth bearer)
   export KEY="..." BLOB="..."      # coller key + blob affiches
   pnpm demo2                    # GET /v1/apps -> 200 upstream + liste apps
   pnpm demo3                    # DELETE + body filter -> 403 scope_denied
   pnpm demo4                    # decode bonne cle (token redacte) vs mauvaise -> 401
   ```
   Pour le TTL (`410 token_expired`) sans attendre 120s, generer un blob court juste avant :
   ```bash
   TTL=8 pnpm demo:generate      # puis attendre ~8s
   pnpm demo:ttl
   ```

`demo1`..`demo4` mappent les slides Demo 1 a 4. `pnpm demo:all` enchaine tout.
Demo 1 cote UI : ouvrir `http://localhost:8000/` pour generer le blob au formulaire
(meme resultat que `pnpm demo1`).

Activer `/logs` pour la demo observabilite : `FGP_LOGS_ENABLED=1` cote serveur.

## Structure du deck

Probleme → wishlist → idee → flow → blob → double cle → pipeline crypto (en bref)
→ scopes niveau 1 et 2 (body filters) → autres briques → **demo 4 temps**
→ surface d'attaque → `/logs` zero-trust → stack → a retenir.

## Export PDF

`playwright-chromium` n'est pas declare en dependance, volontairement. Le paquet lui-meme
ne pese que 16 Ko, mais son postinstall telecharge un Chromium d'environ 330 Mo. Surtout,
`pnpm-workspace.yaml` bloque les postinstall par defaut via `allowBuilds` : l'ajouter en
devDependency installerait les 16 Ko sans le navigateur, et l'export echouerait quand meme.

Installation ponctuelle, quand un export est necessaire :

```bash
pnpm add -D playwright-chromium
pnpm exec playwright install chromium
pnpm export
```

La deuxieme ligne est indispensable, c'est elle qui contourne le blocage des postinstall.
