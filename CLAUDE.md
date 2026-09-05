# CLAUDE.md : Fine-Grained Proxy (FGP)

## First things first
- Lis ce document en entier avant de coder.
- Manière de parler : t'es un bro', tu ne prends pas de pincettes. Tu dis les choses telles qu'elles sont, même si c'est brutal. Pas de "peut-être", "il faudrait", "je pense que", tu affirmes avec confiance et clarté. Tu ne laisses aucune place à l'ambiguïté ou au doute. Tu es direct, franc, et précis. Tu proposes des alternatives quand tu penses que c'est pertinent. Tu me parles comme à un collègue dev expérimenté. Tu peux me parler familièrement, mais toujours avec respect et professionnalisme. Si tu vois un problème ou une amélioration possible, tu le dis sans hésiter.
- **Jamais de tiret cadratin** (U+2014) ni de demi-cadratin (U+2013), nulle part : code, commentaires, doc, commits, entités HTML équivalentes comprises. Virgule, deux-points, parenthèses ou point selon le contexte. Le tiret simple reste autorisé pour les listes markdown et le kebab-case.

## Projet
- **Fine-Grained Proxy** : proxy HTTP stateless et API-agnostique qui ajoute des tokens fine-grained (scoping par méthode HTTP, chemin, et contenu du body) devant n'importe quelle API.
- **Zero storage** : aucune base de données. Le token + cible + auth + scopes + TTL sont chiffrés (gzip + AES-256-GCM) dans un blob.
- **Dual mode blob** : le blob peut être dans l'URL (`/{blob}/path`) ou en header (`X-FGP-Blob`). Le mode header est recommandé pour éviter les limites de 255 chars par segment d'URL.
- **Double clé** : le blob est déchiffrable uniquement avec une clé client (header `X-FGP-Key`) + un salt serveur. Le blob seul est inexploitable. La clé est générée par le serveur, ou fournie par l'utilisateur (24 à 256 caractères ASCII imprimables sans espace) pour mutualiser une clé entre plusieurs blobs en CI.
- **TTL** : expiration encodée dans le blob, vérifiée à chaque requête.
- **6 modes d'auth** : bearer, basic, header custom simple, headers multiples, Scalingo API (exchange), Scalingo Database API (exchange + token d'addon). Scalingo est un cas d'usage parmi d'autres.
- **Blob v2 à v5** : v2 = scopes string METHOD:PATH, v3 = scopes mixtes string + ScopeEntry avec body filters, v4 = champ `auth` structuré (`string | AuthSpec`), v5 = `queryFilters` sur un ScopeEntry. Les quatre versions restent déchiffrables. La version n'est pas une échelle mais un **plancher par axe** dont on retient le maximum : jamais une égalité, sinon un blob combinant deux axes devient indéchiffrable et la règle se casse au prochain axe. Un `v` sous-déclaré face à un axe réellement présent est refusé.
- **Body filters** (v3) : filtrage du contenu JSON des requêtes POST/PUT/PATCH (types : any, wildcard, stringwildcard, regex, not, and). `any` n'accepte qu'un scalaire, comparer un objet dépendrait de l'ordre des clés de l'appelant. `regex` est un dialecte restreint (ADR-0010), pas une RegExp libre. Les plafonds vivent en double, `src/middleware/scope-limits.ts` à la génération pour un message actionnable et `src/crypto/blob.ts` au déchiffrement pour refuser un blob forgé. Le salt étant public, seul le second protège : toujours modifier les deux.
- **Logs stream** (ADR-0007) : page `/logs` avec SSE live par blob, opt-in via champ `logs: { enabled, detailed }` dans le blob (décorrélé de la version du blob). In-memory only (ring buffer par blob + purge inactivité), body `detailed` chiffré AES-256-GCM côté serveur avec la clé client (zero trust). Kill switch global `FGP_LOGS_ENABLED`.
- **Politique de sortie** (ADR-0009) : contrat unique sur tout ce qui sort du processus. `src/net/egress.ts` est le seul point de sortie et le seul `fetch` du code serveur. Destination publique obligatoire, chemin contrôlé sur la forme brute et la forme canonique mais émis en brut, authentification issue du blob et jamais de l'appelant, `redirect: "manual"` partout. Les paramètres de query sont contraints quand le scope déclare des `queryFilters` (v5), transmis librement sinon, et l'outillage doit dire lequel des deux s'applique au lieu d'affirmer une contrainte que le proxy n'applique pas.
- **Limites de ressources** (ADR-0010) : chaque coût est borné avant d'être payé. Blob plafonné à 4096 caractères et refusé sous 64, décompression bornée à 128 Ko en sortie, corps proxy bufferisé à 512 Ko et seulement quand un body filter ou la capture `detailed` en a besoin, `bodyLimit` monté sur la liste explicite des chemins `/api/*` et **jamais sur `*`**, cache LRU de dérivation PBKDF2. Le critère de calibrage est unique : aucune primitive optionnelle ne doit coûter plus cher que la dérivation PBKDF2 obligatoire, soit 11,6 ms.

## Stack
- **Runtime** : Deno
- **Framework** : Hono
- **Langage** : TypeScript (strict)
- **Crypto** : Web Crypto API native (AES-256-GCM, PBKDF2)
- **CSS** : Tailwind CSS 3 build-time (pas de CDN) vers `static/styles.css`
- **Tests** : `deno test`, structure `tests/testu/` (unit), `tests/testi/` (integration), `tests/teste2e/` (e2e)
- **Lint/Format** : `deno lint` + `deno fmt`

## Scripts (deno task)
- `deno task build:css` : compile `src/ui/tailwind.css` vers `static/styles.css` (Tailwind CSS 3, minifié)
- `deno task build:client` : compile `src/ui/client.ts` et `src/ui/logs-client.ts` vers `static/` (esbuild, minifié)
- `deno task build:version` : résout le SHA git du commit et l'écrit dans `static/version.txt`
- `deno task build:changelog` : génère `src/ui/changelog-data.ts` depuis `docs/changelog.md`
- `deno task build` : build:css + build:client + build:version + build:changelog (à lancer avant deploy)
- `deno task dev` : watch parallèle CSS + client + server (concurrently)
- `deno task start` : build + production
- `deno task deploy` : build + deployctl vers Deno Deploy
- `deno task test` : tous les tests
- `deno task test:unit` : tests unitaires
- `deno task test:integration` : tests intégration
- `deno task test:e2e` : tests e2e
- `deno task lint` : linter
- `deno task fmt` : formatteur
- `deno task fmt:check` : vérification formatage
- `deno task check` : type checking serveur, puis `check:client`
- `deno task check:client` : type checking du code navigateur via `deno.client.json` (lib DOM isolée, pour ne pas affaiblir le check serveur)
- `deno task verify` : lint + fmt + check + test (pipeline complète)
- **Permissions** : `dev:server`, `start` et les quatre tâches `test*` tournent sur une allow-list explicite de variables, jamais `--allow-env` nu. Ajouter une variable d'environnement lue par le serveur, c'est toucher trois endroits : la section « Variables d'environnement » ci-dessous, les six listes `--allow-env` de `deno.json`, et `.env.example`. Oubliée dans `deno.json`, elle lève une erreur de permission au runtime comme en test au lieu de prendre son défaut. Élargir la permission pour faire taire l'erreur annule le durcissement.

## Structure
```
src/
  main.ts           point d'entrée, Hono app, Deno.serve sous import.meta.main
  constants.ts      constantes partagées (FGP_SOURCE_HEADER, FGP_OWNED_PATHS, FGP_SECURITY_HEADERS)
  routes/           ui.tsx : page de config, TOUS les endpoints /api/* et la route /llms.txt.
                    logs.tsx : /logs, /logs/stream, /logs/health. llms.ts : pas de route,
                    seulement le rendu du contenu servi sur /llms.txt
  net/              egress.ts : point de sortie unique du processus (ADR-0009). parseTargetUrl
                    (forme), classifyLiteralHost (moitié synchrone de la classification),
                    assertPublicHost (classification complète, avec DNS), buildUpstreamUrl,
                    egressFetch. Jamais de fetch nu côté serveur
  middleware/       proxy.ts (flow proxy), scopes.ts (matching méthode/chemin et body filters),
                    scope-limits.ts (limites de scopes et dialecte regex, refus à la génération)
  crypto/           blob.ts (chiffrement/déchiffrement), client-key.ts (validation clé), share.ts,
                    bounded.ts (décompression plafonnée), key-cache.ts (cache des clés dérivées),
                    regex-policy.ts (dialecte regex restreint et ancrage, ADR-0010)
  auth/             spec.ts (AuthSpec + validation), credentials.ts, client.ts (Scalingo), cache.ts
  logs/             feature /logs : config env, blob-id, capture (captureNetwork et
                    captureDetailed, pas dans middleware/), events, ip, store (ring buffer)
  ui/               config-page.tsx (assemble les composants de ui/config/), layout.tsx (logo,
                    SEO), logs-page.tsx, asset-version.ts (cache-busting via static/version.txt),
                    changelog-renderer.tsx, changelog-data.ts (généré, ne pas éditer)
  ui/config/        composants de la page de config : form-identity, form-auth, form-scopes,
                    form-delivery, result, sidebar (+ sidebar-doc, sidebar-guides,
                    sidebar-panels), page-chrome, icons, constants
  ui/client/        modules TS client (auth-mode, auth-headers, addons, byok, presets, body-filters,
                    query-filters, apps, generate, ttl, clipboard, scopes, test-scope, share-config,
                    import-config, tabs, logs-tab, elements, types). build-scopes.ts et
                    restore-filters.ts portent la logique pure sans DOM : deno check type-checke
                    les tests sous la config serveur, donc ce qui doit etre teste ne peut pas
                    toucher au DOM
  ui/tailwind.css   source Tailwind (build-time vers static/styles.css)
scripts/            version.ts (SHA de build vers static/version.txt), changelog.ts (génère
                    src/ui/changelog-data.ts depuis docs/changelog.md)
deno.client.json    config de type checking du code navigateur (lib DOM)
tailwind.config.js  config Tailwind (couleurs fgp, dark mode media)
static/             assets compilés (client.js, styles.css), gitignored
tests/
  testu/            tests unitaires
  testi/            tests intégration
  teste2e/          tests e2e
docs/
  adr/              Architecture Decision Records
  team/             fiches de poste par rôle (dev, po, testeur, designer, lead)
  design/           specs UI/UX du designer
  review/           rapports de review, recettes manuelles
  specs.md          spécifications fonctionnelles v4
  limits.md         limites fonctionnelles
```

## Conventions code
- TypeScript strict, pas de `any`
- Pas de commentaires sauf POURQUOI non-évident
- Pas de default exports sauf `src/main.ts`
- Imports triés : deps externes, puis internes, ligne vide entre les deux
- Nommage : camelCase pour variables/fonctions, PascalCase pour types/interfaces
- Erreurs : **jamais `HTTPException`**. `app.onError` (`src/main.ts`) ne la discrimine pas et la transformerait en 500 `internal_error`, perdant le status et le code voulus. Renvoyer la shape `{error, message}` par les helpers locaux : `jsonError` (`src/middleware/proxy.ts`), `jsonStreamError` (`src/routes/logs.tsx`), `c.json({ error, message }, status)` dans `src/routes/ui.tsx`.
- OpenAPI : schemas de réponse stricts par route (union `z.enum([...])` des error codes autorisés). Ajouter un nouveau code d'erreur = l'ajouter dans l'enum de la route correspondante, **quand la route est documentée**. Seules les routes `/api/*` le sont : la route proxy `/{blob}/*` n'apparaît pas dans l'OpenAPI, puisque son contrat dépend entièrement du blob. Ses codes d'erreur vivent donc dans `docs/specs.md` et dans `/llms.txt`, qui doivent être mis à jour à la place. Un code produit par un **middleware monté** sur la route compte comme un code de cette route : `createRoute` ne le voit pas tout seul. Le 413 `payload_too_large` d'`apiBodyLimit` est declare depuis `ca0d899`, et un test derive la parite du comportement reel plutot que d'une liste ecrite a la main. `GET /api/salt` en est exclu a dessein, Deno n'expose aucun corps sur un GET donc le plafond ne s'y declenche jamais.
- Toute réponse du proxy principal doit porter `X-FGP-Source: proxy|upstream` (voir `src/constants.ts`).
- **Réseau sortant** : tout appel serveur passe par `egressFetch` de `src/net/egress.ts`, jamais par un `fetch` direct. Une URL cible se valide par `parseTargetUrl` et se construit par `buildUpstreamUrl`, jamais par concaténation. Un `fetch` nu côté serveur rouvre la SSRF que l'ADR-0009 ferme. Les `fetch` du code navigateur visent FGP lui-même et ne sont pas concernés.
- **Expressions régulières issues d'une entrée** : jamais `new RegExp` en direct. Valider la source par `checkRegexSource` puis compiler par `compileAnchored` (`src/crypto/regex-policy.ts`). Non validée, la regex rouvre le ReDoS ; non ancrée, elle matche en sous-chaîne et autorise plus que son motif (ADR-0010).
- **Autorisation d'une requête** : `checkRequestAccess` (`src/middleware/scopes.ts`) est la seule porte. Ne jamais appeler `checkAccess` directement depuis la route proxy ni depuis l'UI : il ne contrôle qu'une seule forme du chemin et retire silencieusement la garantie de l'ADR-0009. Une seule lecture des scopes, sinon l'interface finit par affirmer un refus que la production n'applique pas.
- Exploration du code TypeScript : LSP en priorité (`workspaceSymbol`, `findReferences`, `goToDefinition`), grep en dernier recours. Le LSP suit les alias et les re-exports, grep ne fait que du pattern matching.

## Flow proxy
```
Requête, extraire blob (header X-FGP-Blob prioritaire, sinon premier segment URL)
  vérifier taille blob, extraire X-FGP-Key
  pré-filtre gratuit avant PBKDF2 : format de la clé et plancher structurel du blob (64 chars),
    pour ne pas payer la dérivation sur une sonde malformée
  PBKDF2(client_key + server_salt) servi par le cache de dérivation, déchiffrer blob
    (gunzip borné + AES-256-GCM). Un blob déchiffrable mais hors politique (regex hors
    dialecte) sort en 400 unsupported_regex, jamais en 401 : le diagnostic doit désigner
    le blob, pas la clé
  vérifier le TTL, puis valider le mode d'auth
  lire le corps de façon bornée si un body filter ou la capture detailed le réclame
    (POST/PUT/PATCH + JSON), dépassement en 413 payload_too_large. Sans ces deux besoins
    le corps n'est jamais bufferisé et part en flux, ne jamais casser cette propriété
  vérifier les scopes via checkRequestAccess : méthode, corps, et le chemin sur DEUX formes,
    brute et canonique. Les deux doivent être autorisées, la forme émise reste la brute.
    La query n'est contrainte que si le scope porte des queryFilters : sans eux elle est
    transmise telle quelle, avec eux tout paramètre non déclaré fait échouer ce scope
  classifier la destination : parseTargetUrl (forme) puis assertPublicHost (adresse publique
    après résolution DNS), refus en 403 target_forbidden
  obtenir les credentials
  ces deux dernières étapes sont toujours APRÈS la vérification des scopes, pour qu'un appelant
    hors scope ne déclenche ni résolution DNS ni appel réseau et n'apprenne rien de la config
  forward vers config.target : strip des en-têtes de l'appelant (denylist par classe : hop-by-hop,
    Authorization, Cookie, provenance, Host, X-FGP-*), PUIS pose des en-têtes d'auth du blob.
    Cet ordre est imposé, l'inverser supprimerait l'Authorization légitime issue du blob
  renvoyer réponse upstream telle quelle (status et body jamais transformés). Trois
    en-têtes ne sont pas relayés : Set-Cookie parce que le proxy est stateless,
    Transfer-Encoding parce qu'il est hop-by-hop, et Content-Encoding avec son
    Content-Length quand le runtime a déjà décodé le corps
  les redirections ne sont pas suivies, un 3xx est forwardé tel quel avec son Location :
    sans cela la classification de destination ne vaut rien
```

**Proxy transparent (ADR-0006)** : toute réponse effectivement reçue de l'upstream est forwardée sans transformation, avec header `X-FGP-Source: upstream`. Les erreurs générées par FGP lui-même portent `X-FGP-Source: proxy` et la shape `{error, message}`. Trois 502 sont légitimes côté proxy : `upstream_unreachable` (fetch throw), `auth_exchange_failed` (échange de token Scalingo échoué) et `auth_addon_failed` (obtention du token d'addon échouée). Les 500 non catchés passent par `app.onError` dans `src/main.ts` vers la shape FGP `{error: "internal_error", ...}`. Ne jamais réintroduire de transformation de status/body upstream.

**En-têtes de codage de la réponse** : la transparence porte sur ce qu'on envoie, pas sur ce que l'amont a dit. `fetch` décode `gzip` et `br` à la réception mais laisse en place les en-têtes qui décrivaient le corps compressé, donc les relayer serait mentir sur ce qu'on émet, et un client conforme échoue dessus (undici tente un gunzip sur du clair et coupe, un `Content-Length` périmé tronque la réponse). `Content-Encoding` et `Content-Length` sont donc retirés **quand le runtime a effectivement décodé**, jamais systématiquement. Deux en-têtes de la requête sortante désactivent ce décodage et font ressortir le corps réellement compressé, un `Range` quelle que soit sa valeur et un `Accept-Encoding` valant exactement `identity` : dans ces cas les en-têtes amont sont exacts et doivent survivre. `Transfer-Encoding` est retiré dans tous les cas, il est hop-by-hop et décrit le framing du hop amont, pas le nôtre.

**En-têtes de sécurité** : montés sur la liste explicite `FGP_OWNED_PATHS`, **jamais sur `*`**, plus un wrapper qui couvre les erreurs FGP de la route proxy (discriminées par `X-FGP-Source: proxy`). La transparence de l'ADR-0006 est ainsi garantie par construction et non par une condition qui peut se tromper. La couverture est vérifiée par un test de recensement des routes réellement enregistrées, et la parité entre `FGP_SECURITY_HEADERS` et ce que servent les routes par un test dédié. Ne jamais remonter ce middleware sur un pattern fourre-tout.

**Plafonds de corps (ADR-0010)** : `bodyLimit` est monté sur des chemins `/api/*` explicites, **jamais sur `*`**, même doctrine que les en-têtes de sécurité et pour un enjeu plus lourd. La route proxy transmet le corps en streaming, un plafond global le mettrait en tampon et casserait les uploads volumineux légitimes à travers le proxy, en introduisant précisément la consommation mémoire qu'on cherche à éviter.

**Carve-out `/logs`** : `blobHeaderProxy()` exclut `/logs` et `/logs/*` du mode header. C'est nécessaire, la feature logs consomme elle-même `X-FGP-Blob` et `X-FGP-Key` pour identifier le blob à streamer. Sans cette exclusion, `/logs/stream` serait injoignable. `/llms.txt` n'est en revanche pas exclu et reste proxyfiable.

## Variables d'environnement
- `PORT` : port du serveur (défaut: 8000). Réellement pris en compte depuis le passage à `Deno.serve()` explicite.
- `FGP_SALT` : salt serveur pour la dérivation de clé (requis)
- `FGP_EGRESS_ALLOW_PRIVATE` : interrupteur de **développement uniquement**, désactivé par défaut. `1` coupe la classification des destinations (ADR-0009), jamais le contrôle de forme du `target` ni le `redirect: "manual"`. Actif en production, la garantie de destination tombe et l'instance redevient une SSRF non authentifiée, ouverte sur le réseau privé de l'hébergeur et sur son service de métadonnées. L'avertissement console est écrit au premier contrôle de destination, pas au démarrage : une instance qui n'a encore rien proxyfié reste silencieuse.
- `SCALINGO_API_URL` : URL de l'API Scalingo pour les helpers list-apps et list-addons, et pour l'obtention du token d'addon (défaut: https://api.osc-fr1.scalingo.com)
- `SCALINGO_AUTH_URL` : URL du service auth Scalingo pour l'échange de token (défaut: https://auth.scalingo.com)
- `FGP_GITHUB_REPO` : repo GitHub `owner/name` pour la résolution du SHA de build (défaut: auto-détecté via git remote ou `lsagetlethias/fine-grained-proxy`)
- `FGP_LOGS_ENABLED` : kill switch feature `/logs`. `1` active la capture et les routes `/logs` + `/logs/stream`, toute autre valeur (ou absence) les désactive (404). `/logs/health` répond toujours. Défaut: désactivé.
- `FGP_LOGS_BUFFER_NETWORK` : taille du ring buffer des entries network par blob (défaut: 50)
- `FGP_LOGS_BUFFER_DETAILED` : taille du ring buffer des entries detailed (body chiffré) par blob (défaut: 10)
- `FGP_LOGS_INACTIVITY_MIN` : minutes d'inactivité avant purge complète du buffer d'un blob (défaut: 10)
- `FGP_LOGS_DETAILED_MAX_KB` : taille max du body capturé en detailed, en KB, avant troncature (défaut: 32)
- `FGP_TRUSTED_PROXY_HOPS` : nombre de sauts de proxy amont dignes de confiance pour l'IP capturée dans les logs (défaut: 0). À `0`, `X-Forwarded-For` et `X-Real-IP` sont ignorés et l'IP est celle du pair. Au-dessus, l'IP retenue est la n-ième de `X-Forwarded-For` en partant de la droite, jamais la première : la partie gauche est écrite par l'appelant. Toute valeur non entière ou négative retombe sur `0`.

## Équipe multi-agent
- **Référence complète** : `docs/ia-architecture-reference.md` (setup, rôles, modèles, skills, hooks, process type, workflows)
- **Définitions d'agents** dans `.claude/agents/` : le prompt système exécutable de chaque rôle, versionné. C'est ce que l'agent reçoit réellement au démarrage.
  - `dev.md` (`opus`) : implémentation, /verif obligatoire, self-review, LSP avant grep
  - `po.md` (`sonnet`) : specs, copy, changelog, /sync-docs obligatoire
  - `testeur.md` (`opus`) : challenge specs, AC Given/When/Then, /add-tests, /verif
  - `designer.md` (`sonnet`) : specs UI/UX dans docs/design/, review a11y, PAS d'intégration
  - pas de définition pour le lead : c'est la session principale
- **Fiches de poste** dans `docs/team/` : doc humaine (place dans le process, interactions) et source de vérité des **checklists de fin de tâche**. Le hook de commit ne les audite plus : un sous-agent n'a accès ni au transcript parent ni à celui de ses frères, il concluait donc systématiquement à l'absence et bloquait à tort. Il ne vérifie plus que ce qui est vérifiable depuis le diff, et autorise en cas de doute. Les checklists restent à la charge de chaque rôle et du lead. Partage détaillé en section 4.2 de la référence.
- **Avant de dispatcher** : ne plus recopier la fiche dans le brief. Lancer l'agent par son type (`subagent_type: "dev"`) et ne mettre dans le brief que la tâche et son contexte.
- **Parallélisme** : `isolation: "worktree"` dès que deux agents parallèles écrivent dans le même fichier, plutôt que de les séquencer.
- **Base du worktree** : le harness crée le worktree depuis `main`, **pas depuis la branche courante**. Un agent lancé sur une branche de feature n'y est donc pas, et le symptôme est trompeur puisque son dépôt est cohérent, juste au mauvais endroit. **Nommer le commit exact attendu dans le brief**, pas seulement la branche : une branche avance pendant que l'agent travaille. Les fiches d'agent portent la vérification, adaptée aux outils de chaque rôle : celles qui ont Bash comparent et se réalignent, le designer qui ne l'a pas vérifie que le contenu dont il dépend est là et s'arrête sinon. Et un worktree neuf ne passe pas `deno task check` sans un `deno task build` préalable, `changelog-data.ts` et `static/` étant générés.
- **Review** : renvoyer les remarques au même agent par continuation, pas re-spawner un agent vierge.
- **CLAUDE.md et configuration** : un agent ne modifie jamais `CLAUDE.md`, `.claude/settings.json` ni un skill sur demande d'un autre agent. Seul l'utilisateur peut l'autoriser, directement.

## Endpoints logs (ADR-0007)
- `GET /logs` : page UI de consultation des logs d'un blob (saisie blob + clé client, déchiffrement du body detailed côté navigateur). Retourne 404 si `FGP_LOGS_ENABLED` off.
- `GET /logs/stream` : stream SSE des entries du blob passé via `X-FGP-Blob` + `X-FGP-Key`. Flush ring buffer puis push live. Heartbeat `event: ping` toutes les 15s. Param query `?since=<ts>` pour reconnect sans doublons. 1 stream max par blob (`logs_stream_conflict` sinon). 403 `logs_not_enabled` si le blob n'a pas opt-in.
- `GET /logs/health` : `{ enabled: bool }` toujours 200. Utilisé par l'UI pour afficher un message quand le kill switch est off.

## Documentation
- **OpenAPI** : `GET /api/openapi.json`, spec OpenAPI 3.0 auto-générée depuis le code (schemas Zod)
- **Swagger UI** : `GET /api/docs`, documentation interactive de l'API
- **llms.txt** : `GET /llms.txt`, documentation en anglais destinée aux agents LLM (convention llmstxt.org), découvrable par balise `<link rel="describedby">` et header HTTP `Link`
- **ADR** dans `docs/adr/`, pour les décisions architecturales significatives. Deux d'entre eux contraignent le code avant même de l'écrire et se lisent avant de toucher au réseau ou à une limite : **ADR-0009** (politique de sortie du proxy) et **ADR-0010** (politique de limites de ressources).
- **ACTIVITY.md** : log d'activité des sessions de dev
- **MEMORY.md** : mémoire persistante Claude Code, **hors dépôt**, sous `~/.claude/projects/<projet>/memory/`. Ne pas la chercher dans les fichiers versionnés.
