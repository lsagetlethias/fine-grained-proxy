# Plan d'implémentation : politique de sortie du proxy (ADR-0009)

**Ref ADR** : `docs/adr/0009-politique-de-sortie-du-proxy.md`
**Branche** : `fix/security-hardening`
**Auteur** : architecte sécurité
**Date** : 2026-09-04

Le plan est ordonné : chaque étape ne dépend que des précédentes. **Les étapes 0 à 9 sont le lot de sécurité, et elles seules.** Il ferme les fail-open, ne touche pas au format de blob, et doit partir vite : deux vulnérabilités critiques sont en production sur une instance publique.

**Frontière de périmètre, arbitrée par le lead.** L'axe query est tranché dans l'ADR (§4) mais son implémentation est différée : `queryFilters` et le blob v5 sont une **feature**, pas un durcissement, et mélanger une évolution de format avec un correctif urgent rallonge la review et élargit la surface de régression. Le lot de sécurité prend uniquement le minimum qui ferme le mensonge sans changer le format, décrit à l'étape 8. La feature est décrite en fin de document, sous « Hors lot », pour que le dev sache exactement où s'arrête sa PR.

Ce qui n'est **pas** dans ce plan non plus, et part dans le lot anti-abus : PBKDF2 avant validation, absence de `bodyLimit`, `/api/share/decode` sans plafond, ReDoS, égalité par `JSON.stringify` sensible à l'ordre des clés, 500 sur `/api/test-proxy`.

---

## Étape 0 : variables d'environnement (préalable bloquant)

**Fichiers** : `deno.json` (toutes les tasks `--allow-env`), `Dockerfile` (CMD), `.env.example`.

**Ce qui change** : ajout de `FGP_EGRESS_ALLOW_PRIVATE` et `FGP_TRUSTED_PROXY_HOPS` à **chaque** liste `--allow-env` (`dev:server`, `start`, `test`, `test:unit`, `test:integration`, `test:e2e`) et au `CMD` du Dockerfile.

**Pourquoi en premier** : sans ça, le premier `Deno.env.get` lève `NotCapable` et toute la suite échoue avec une erreur qui ne ressemble pas à sa cause.

**Test** : aucun test dédié, mais `deno task test` doit passer avant de continuer, sinon l'étape est ratée.

---

## Étape 1 : le point de sortie unique

**Fichier** : `src/net/egress.ts` (nouveau).

**Ce qui change** : création du module. API publique proposée :

```typescript
export type EgressDenial = { code: "invalid_target" | "target_forbidden"; message: string };

// Étape 1 de la politique : forme, purement syntaxique, sans réseau.
export function parseTargetUrl(raw: string): { url: URL } | { error: EgressDenial };

// Étape 2 : classification d'une adresse littérale.
export function isBlockedAddress(ip: string): boolean;

// Étape 2 : classification d'un hôte, avec résolution si c'est un nom.
export async function assertPublicHost(hostname: string): Promise<EgressDenial | null>;

// Point de sortie unique : parseTargetUrl + assertPublicHost + fetch(redirect: "manual").
export async function egressFetch(url: URL, init: RequestInit): Promise<Response>;

// Construction déterministe de l'URL sortante, jamais par concaténation.
export function buildUpstreamUrl(target: URL, proxyPath: string, search: string): URL;

export function _setResolverForTests(fn: typeof Deno.resolveDns | null): void;
```

Règles à implémenter, toutes détaillées dans l'ADR §2 :
- schéma `http`/`https` uniquement, pas de userinfo, pas de query, pas de fragment sur le `target`, chemin de base sans `%2f`, `..` ni `\` ;
- plages refusées : `0.0.0.0/8`, `10/8`, `100.64/10`, `127/8`, `169.254/16`, `172.16/12`, `192.0.0/24`, `192.168/16`, `198.18/15`, `224/4`, `240/4`, `255.255.255.255`, `::`, `::1`, `fc00::/7`, `fe80::/10`, `ff00::/8`, et leurs formes IPv4-mapped ;
- suffixes refusés : `.internal`, `.local`, `.localhost`, `.home.arpa`, plus les noms sans point ;
- `Deno.resolveDns` en A **et** AAAA, toutes les réponses doivent être publiques ;
- échec de résolution : **pas** un refus, on laisse passer et `fetch` échouera en `upstream_unreachable` ;
- `FGP_EGRESS_ALLOW_PRIVATE=1` désactive l'étape 2 uniquement, avec un `console.warn` au premier appel ;
- `redirect: "manual"` sur tous les appels sortants.

**Tests** : `tests/testu/net/egress.test.ts` (nouveau), résolveur injecté, échappatoire désactivée.
- AC-43.1 schéma : `file:`, `data:`, `ftp:`, `javascript:` refusés en `invalid_target`.
- AC-43.2 forme : userinfo, query, fragment sur le `target` refusés ; `..` et `%2f` dans le chemin de base refusés.
- AC-43.3 IP littérales : table exhaustive des plages ci-dessus refusées, plus `2130706433`, `0x7f.0.0.1`, `::ffff:127.0.0.1`, `[::1]`. Une IP publique (`93.184.216.34`, `2606:2800::1`) acceptée.
- AC-43.4 noms : résolveur renvoyant `10.0.0.5` refusé ; renvoyant une adresse publique accepté ; renvoyant une adresse publique **et** une privée refusé (la règle porte sur toutes les réponses).
- AC-43.5 suffixes : `metadata.google.internal`, `db.local`, `redis` (sans point) refusés sans même résoudre.
- AC-43.6 échec de résolution : ne produit pas de refus.
- AC-43.7 `FGP_EGRESS_ALLOW_PRIVATE=1` : `127.0.0.1` accepté, mais `file:` toujours refusé.
- AC-43.8 `buildUpstreamUrl` : un `target` avec chemin de base concatène correctement, et le chemin proxy ne peut jamais être avalé par une query ou un fragment.

---

## Étape 2 : validation du `target` au déchiffrement

**Fichier** : `src/crypto/blob.ts`, fonction `decryptBlob`.

**Ce qui change** : après le contrôle `typeof config.target === "string"`, appel à `parseTargetUrl`. En cas de refus, `throw new Error("Invalid blob: malformed BlobConfig")`, donc 401 `invalid_credentials` côté proxy, cohérent avec le traitement des autres champs invalides.

**Cassant** : un blob dont le `target` porte une query, un fragment ou un userinfo devient invalide. Ces blobs étaient déjà cassés fonctionnellement, leur chemin scopé n'atteignait pas l'upstream.

**Tests** : `tests/testu/crypto/blob-validation.test.ts` (existant, à étendre).
- AC-43.9 : blob avec `target: "https://api.example.com/#"` rejeté.
- AC-43.10 : blob avec `target: "file:///etc/passwd"` rejeté.
- AC-43.11 : blob avec `target: "https://user:pw@api.example.com"` rejeté.
- AC-43.12 : blob avec `target: "https://api.example.com/base"` accepté (chemin de base légitime, non-régression).

---

## Étape 3 : les endpoints qui sortent sur le réseau

**Fichier** : `src/routes/ui.tsx`.

**Ce qui change** :
- `/api/generate` : `parseTargetUrl(body.target)` avant chiffrement, 400 `invalid_target` en cas de refus. Nouveau code d'erreur à ajouter à l'enum de réponse de la route (convention CLAUDE.md).
- `/api/test-proxy` : la requête sortante passe par `egressFetch` et `buildUpstreamUrl`. Refus de politique renvoyé dans la forme existante de l'endpoint, `{ allowed: true, reason: "target_forbidden" }`, pour ne pas changer la shape de réponse.
- `/api/list-apps` et `/api/list-addons` : le champ `target` fourni par l'appelant doit avoir un hôte en `.scalingo.com`, sinon 400 `invalid_target`. La valeur issue de `SCALINGO_API_URL` n'est pas soumise à cette règle.

**Tests** : `tests/testi/egress-policy.test.ts` (nouveau).
- AC-43.13 : `POST /api/generate` avec `target: "http://169.254.169.254"` renvoie 400 `invalid_target`.
- AC-43.14 : `POST /api/test-proxy` avec `target: "http://10.0.0.1"` n'émet **aucune** requête sortante (compteur de `fetch` stubbé à 0) et renvoie `reason: "target_forbidden"`.
- AC-43.15 : `POST /api/list-addons` avec `target: "https://collecteur.example"` renvoie 400 `invalid_target`.
- AC-43.16 : les mêmes endpoints avec une cible publique légitime fonctionnent comme avant.

---

## Étape 4 : le bearer Scalingo ne part plus n'importe où

**Fichier** : `src/auth/client.ts`, fonctions `resolveScalingoApiUrl` et `fetchAddonToken`.

**Ce qui change** : `fetchAddonToken` vérifie que l'hôte résolu se termine par `.scalingo.com` avant d'émettre, et passe par `egressFetch`. Le refus lève, ce qui remonte en 502 `auth_addon_failed` par le chemin existant de `src/middleware/proxy.ts`. Idem pour la validation à la génération : un `AuthSpec` `scalingo-addon` dont l'`apiUrl` n'est pas Scalingo est refusé en 400 `invalid_body` par `validateAuthSpecShape`.

**Justification** : ce mode est spécifique à Scalingo par construction (ADR-0008). La contrainte d'agnosticisme porte sur `target`, pas sur un mode d'auth propriétaire.

**Tests** : `tests/testi/scalingo-addon.test.ts` (existant, à étendre).
- AC-43.17 : blob v4 `scalingo-addon` avec `apiUrl: "https://collecteur.example"` renvoie 502 `auth_addon_failed` et aucun `fetch` ne porte le bearer vers cet hôte.
- AC-43.18 : `POST /api/generate` avec le même `apiUrl` renvoie 400.
- AC-43.19 : `apiUrl: "https://api.osc-secnum-fr1.scalingo.com"` continue de fonctionner.

---

## Étape 5 : une seule fonction d'autorisation

**Fichier** : `src/middleware/scopes.ts`.

**Ce qui change** : deux ajouts, aucune suppression.

```typescript
export function canonicalizePath(rawPath: string): string;

export interface AccessVerdict {
  allowed: boolean;
  denialReason?: "method" | "path" | "path_encoded" | "body" | "query";
  queryConstrained: boolean;   // toujours false dans ce lot, voir « Hors lot »
}

export function checkRequestAccess(
  scopes: Scope[],
  method: string,
  rawPathWithQuery: string,
  body?: unknown,
): AccessVerdict;
```

`canonicalizePath` : décodage percent jusqu'au point fixe (3 tours max, `decodeURIComponent` qui lève arrête la boucle), puis `\` remplacé par `/`, puis écrasement des slashes répétés, puis résolution RFC 3986 des segments `.` et `..`.

`checkRequestAccess` : découpe sur le premier `?`, évalue `checkAccess` sur la forme brute **et** sur la forme canonique quand elles diffèrent, autorise seulement si les deux passent. `checkAccess` reste exportée telle quelle pour ne pas casser les tests unitaires existants.

**Attention** : ce fichier est bundlé côté client (`src/ui/client/test-scope.ts` l'importe). Pas d'API Deno, pas de `Deno.env`, rien qui ne compile pas sous `deno.client.json`. `deno task check:client` est le garde-fou.

**Tests** : `tests/testu/middleware/scopes-path-encoding.test.ts` (nouveau).
- AC-44.1 : scope `GET:/v1/public/*`, chemin `/v1/public/..%2f..%2fadmin` refusé, `denialReason: "path_encoded"`.
- AC-44.2 : même scope, `/v1/public/..%5c..%5cadmin` refusé.
- AC-44.3 : double encodage `%252f` refusé.
- AC-44.4 : scope `GET:/api/v4/projects/*`, chemin `/api/v4/projects/groupe%2Fprojet` **autorisé** (non-régression agnosticisme, cas GitLab).
- AC-44.5 : `canonicalizePath` sur une table de cas, dont `/v1//a//b` vers `/v1/a/b` et `/v1/./a/../b` vers `/v1/b`.
- AC-44.6 : chemin contenant `%00` ou un caractère de contrôle après décodage, refusé.
- AC-44.7 : un chemin sans percent-encoding produit exactement le même verdict qu'avant (non-régression sur la totalité de `tests/testu/middleware/scopes.test.ts`).

---

## Étape 6 : le forward

**Fichier** : `src/middleware/proxy.ts`.

**Ce qui change**, dans l'ordre du pipeline :

1. `proxyMiddleware` cesse de reconstruire le chemin par `segments.slice(1).join("/")`. Le chemin est découpé du `pathname` brut après le premier segment, ce qui aligne le mode URL sur le mode header. Le 400 `invalid_request` actuel sur `/{blob}` et `/{blob}/` est **conservé tel quel** : le changer relèverait du routage, pas de la sécurité, et c'est un sujet à part (voir « points à arbitrer »).
2. `handleProxy` appelle `checkRequestAccess` au lieu de `checkAccess`.
3. Nouvelle étape entre la vérification des scopes et l'obtention des credentials : `assertPublicHost` sur l'hôte du `target`, refus en 403 `target_forbidden`. Placée là parce qu'aucun appel réseau, DNS compris, ne doit précéder la vérification des scopes, et parce qu'il est inutile de payer un échange Scalingo pour une cible refusée. La spec §8.4 devient une liste de douze étapes.
4. `forwardRequest` construit l'URL avec `buildUpstreamUrl` et sort par `egressFetch`, donc `redirect: "manual"`.
5. La construction des en-têtes applique la denylist par classe de l'ADR §5, en conservant l'ordre existant : en-têtes d'auth du blob, puis strip transport en dernier.
6. `extractClientIp` est déplacée dans `src/logs/ip.ts` et applique `FGP_TRUSTED_PROXY_HOPS`.

**Cassant** : `Authorization` et `Cookie` de l'appelant, redirections non suivies, cibles non publiques. Détaillé dans l'ADR.

**Tests** :

`tests/testi/proxy-headers-policy.test.ts` (nouveau) :
- AC-45.1 : un appelant qui envoie `Authorization: Bearer attaquant` sur un blob en mode `header:X-API-Key` ne voit pas cet en-tête arriver upstream.
- AC-45.2 : `Cookie` de l'appelant non transmis.
- AC-45.3 : `Connection`, `Transfer-Encoding`, `TE`, `Upgrade`, `Proxy-Authorization`, `Keep-Alive` non transmis.
- AC-45.4 : `X-Forwarded-For`, `X-Real-IP`, `Forwarded`, `X-Forwarded-Host`, `X-Forwarded-Proto` non transmis.
- AC-45.5 : tout en-tête `X-FGP-*` non transmis.
- AC-45.6 : un en-tête applicatif quelconque (`Accept`, `X-GitHub-Api-Version`, `Idempotency-Key`) **est** transmis (non-régression agnosticisme).
- AC-45.7 : l'ordre est préservé, l'en-tête d'auth du blob écrase celui de l'appelant portant le même nom.

`tests/testi/proxy-egress.test.ts` (nouveau) :
- AC-43.20 : blob dont le `target` est `http://169.254.169.254`, réponse 403 `target_forbidden` avec `X-FGP-Source: proxy`, aucun appel sortant.
- AC-43.21 : le refus intervient **après** le refus de scope. Un blob hors scope sur une cible interdite renvoie 403 `scope_denied`, et le DNS n'est pas résolu.
- AC-43.22 : un upstream répondant 302 fait remonter le 302 au client avec son `Location` et `X-FGP-Source: upstream`, sans que la redirection soit suivie.

`tests/testi/proxy.test.ts` et suivants (existants) :
- AC-44.8 : mode URL et mode header produisent le même verdict sur `/v1//public//x` et sur un chemin à slash final.
- AC-43.23 : les 20 fichiers d'intégration qui ciblent `https://api.mock.local` posent `FGP_EGRESS_ALLOW_PRIVATE=1` dans leur `setup()` et le retirent dans leur `teardown()`. Sans ça, le suffixe `.local` les fait tous échouer.

---

## Étape 7 : provenance de l'IP dans les logs

**Fichier** : `src/logs/ip.ts`.

**Ce qui change** : `extractClientIp` y est déplacée et lit `FGP_TRUSTED_PROXY_HOPS` (entier, défaut `0`). À `0`, `X-Forwarded-For` et `X-Real-IP` sont ignorés au profit de `remoteAddr`. À `n > 0`, l'IP retenue est la n-ième en partant de la droite de la liste `X-Forwarded-For`. `truncateIp` est inchangée.

**Cassant** : côté logs uniquement, et seulement sur la précision de l'IP.

**Tests** : `tests/testu/logs-ip.test.ts` (existant, à étendre).
- AC-45.8 : hops à 0, `X-Forwarded-For: 1.2.3.4` ignoré, `remoteAddr` utilisée.
- AC-45.9 : hops à 1, `X-Forwarded-For: 1.2.3.4, 203.0.113.7` retient `203.0.113.7`, pas `1.2.3.4`.
- AC-45.10 : hops à 1 avec une liste d'un seul élément forgé, retombe sur `remoteAddr`.
- AC-45.11 : `tests/testi/logs-endpoints.test.ts` ligne 458 assertait la confiance en `X-Forwarded-For`, l'assertion doit être reprise avec `FGP_TRUSTED_PROXY_HOPS=1`.

---

## Étape 8 : le minimum query, sans toucher au format de blob

C'est l'étape qui matérialise la frontière de périmètre. Trois changements, aucun ne touche au blob.

**Fichiers** : `src/routes/ui.tsx` (`/api/test-scope` et `/api/generate`), `src/middleware/scope-limits.ts`, `src/ui/client/test-scope.ts`, `src/ui/config/form-scopes.tsx` (copie du verdict).

**Ce qui change** :

1. **L'endpoint de test et le highlight client appellent `checkRequestAccess`.** Plus aucune lecture des scopes en dehors de cette fonction. C'est ce qui supprime la divergence entre le testeur et la production, et c'est la raison pour laquelle le mensonge ne peut pas revenir.
2. **Le verdict expose la query.** Quand le chemin de test en contient une, l'UI affiche qu'elle est transmise sans contrainte. Le champ existe dès maintenant dans `AccessVerdict` et vaut toujours « non contrainte » dans ce lot. La feature `queryFilters` se branchera dessus sans nouveau point de décision. La copie exacte est à valider par le PO, l'exigence architecturale est qu'aucun affichage ne puisse dire « refusé » là où le proxy répond 200.
3. **Un `?` dans un `pattern` est refusé à la génération**, 400 `invalid_scope`, via `validateScopeLimits` ou une validation voisine, avec un message qui dit que la query n'est pas contrainte par les scopes. Au déchiffrement, rien ne change : un pattern portant un `?` reste accepté et n'est jamais matché. Casser des blobs vivants pour un pattern qui ne peut rien autoriser serait un coût sans gain.

**Ce qui ne change pas, volontairement** : aucun `queryFilters`, aucune version de blob, aucune nouvelle structure de scope. Voir « Hors lot ».

**Tests** : `tests/testi/test-scope.test.ts` (existant, à étendre), `tests/testi/api.test.ts` (existant, à étendre).
- AC-46.1 : `POST /api/test-scope` avec `path: "/v1/items?action=delete"` et scope `GET:/v1/items` renvoie `allowed: true` et un indicateur de query non contrainte. C'est le correctif du mensonge fail-open, et c'est le test le plus important de l'étape.
- AC-46.2 : le verdict de l'endpoint est identique à celui du proxy sur une table de cas partagée, chemins percent-encodés inclus. Garde-fou anti-divergence, il doit exister même s'il paraît redondant.
- AC-46.3 : `deno task check:client` passe, la fonction partagée compile côté navigateur.
- AC-46.4 : `POST /api/generate` avec un scope `GET:/v1/items?safe=1` renvoie 400 `invalid_scope`.
- AC-46.5 : un blob existant portant un tel pattern se déchiffre toujours, et le pattern ne matche jamais (non-régression, aucun blob invalidé).

---

## Étape 9 : documentation

**Fichiers** : `docs/specs.md`, `docs/limits.md`, `README.md`, `src/routes/llms.ts`, `src/ui/config/sidebar-doc.tsx`, `docs/changelog.md`, `CLAUDE.md`, `docs/deno-deploy.md`, `docs/scalingo-deploy.md`, `ACTIVITY.md`.

**Ce qui change** :
- specs, nouvelle section « Politique de sortie », les quatre garanties et les non-garanties, en tête des sections proxy ;
- specs §7, la règle des deux formes du chemin et l'alignement des deux modes de livraison ;
- specs §8.4, la liste passe à douze étapes avec la vérification de la destination ;
- specs §11.2, la denylist par classe et sa justification ;
- specs §13, les non-garanties ajoutées aux non-goals ;
- limits.md, les nouvelles variables d'environnement et les plages refusées ;
- **`FGP_EGRESS_ALLOW_PRIVATE`, partout où il apparaît** (limits.md, CLAUDE.md, `.env.example`, guides de déploiement), présenté comme un **interrupteur de développement** et accompagné de sa conséquence écrite sans euphémisme : le laisser actif en production annule G1 et rend l'instance à l'état de SSRF non authentifiée que ce lot corrige, réseau privé de l'hébergeur et service de métadonnées compris ;
- la non-contrainte de la query, dans les specs, le panneau Doc et `/llms.txt`, avec sa conséquence : un blob scopé `GET:/v1/items` autorise n'importe quelle query sur ce chemin ;
- guides de déploiement, le filtrage d'egress réseau, présenté comme la vraie défense contre le rebinding ;
- panneau Doc et `/llms.txt`, les nouveaux codes `target_forbidden` et `invalid_target` ;
- changelog, les cassants listés dans l'ADR.

**Responsable** : PO, via `/sync-docs`, avant le push du lead.

---

## Hors lot : feature `queryFilters` et blob v5

**Ne fait pas partie de la PR de sécurité.** Cette section est le point de départ de la feature, pas une étape du plan. Elle est écrite ici pour que la décision de l'ADR §4 ne soit pas rejouée, et pour que le découpage soit lisible par le relecteur de la PR de sécurité.

**Préalable** : les étapes 5 et 8 du lot de sécurité doivent être livrées. La feature se branche sur `AccessVerdict` et sur `checkRequestAccess`, elle n'a rien à réécrire.

**Fichiers** : `src/middleware/scopes.ts`, `src/middleware/scope-limits.ts`, `src/crypto/blob.ts`, `src/routes/ui.tsx`, `src/ui/client/body-filters.ts` et voisins, specs et limits.

**Ce qui change** :
- type `QueryFilter { param, values: ObjectValue[], required? }` sur `ScopeEntry` ;
- sémantique de déni par défaut à l'intérieur du scope : tout paramètre présent et non couvert fait échouer le scope ; un paramètre répété n'est autorisé que si chaque occurrence satisfait le filtre ;
- version de blob 5 dès qu'un `queryFilters` est présent, sur la règle multi-axes d'ADR-0008 ;
- limites alignées sur les body filters : 8 filtres par scope, 16 valeurs OR par filtre, réutilisation intégrale de `validateObjectValue` ;
- UI, un bloc query filters jumeau du bloc body filters.

**Tests** (à écrire avec la feature, pas dans ce lot) :
- AC-46.6 : scope avec `queryFilters` sur `action` valant `any("read")`, requête `?action=delete` refusée, `?action=read` autorisée.
- AC-46.7 : paramètre non couvert, `?action=read&force=true` refusée.
- AC-46.8 : `required: true`, requête sans le paramètre refusée.
- AC-46.9 : paramètre répété, `?a=1&a=2` refusée si une seule occurrence satisfait le filtre.
- AC-46.10 : blob portant des `queryFilters` sérialisé en `v: 5` ; blob v5 refusé par les proxies qui n'acceptent que 2, 3 et 4, tant que la feature n'est pas déployée.
- AC-46.11 : blob v3 ou v4 sans `queryFilters` inchangé, query transmise librement (non-régression).

---

## Récapitulatif des changements cassants (lot de sécurité)

| Changement | Étape | Qui casse | Porte de sortie |
|---|---|---|---|
| `Authorization` et `Cookie` de l'appelant strippés | 6 | intégrations qui repassaient leur propre credential | `AuthSpec` `headers` du blob (v4) |
| Redirections non suivies | 1, 6 | appelants qui comptaient sur le suivi silencieux | viser directement l'URL finale |
| Cibles non publiques refusées | 1, 2, 6 | instances proxyfiant une API du réseau privé | `FGP_EGRESS_ALLOW_PRIVATE=1`, avec l'exposition que ça implique |
| `target` avec query, fragment ou userinfo refusé | 2, 3 | blobs déjà cassés fonctionnellement | regénérer avec un `target` propre |
| Scopes exacts portant du percent-encoding | 5, 6 | scopes sans wildcard contenant `%2f` | couvrir aussi la forme décodée |
| IP des logs par défaut non issue de `X-Forwarded-For` | 7 | précision des logs derrière un routeur | `FGP_TRUSTED_PROXY_HOPS=1` |
| `?` dans un pattern refusé à la génération | 8 | formulaires qui en produisaient un scope mort | aucun blob invalidé, le pattern était sans effet |

---

## Points à arbitrer avant de coder

1. **`/{blob}/` renvoie 400 aujourd'hui**, alors que c'est exactement l'URL que produit `/api/generate` (`${origin}/${blob}/`). Le découpage brut du chemin de l'étape 6 rendrait naturel de traiter ce cas comme le chemin `/`. Le plan conserve délibérément le 400 : c'est un changement de routage, il n'a rien à faire dans un lot de sécurité. À traiter à part.
2. **Cache de résolution DNS.** Non prévu dans ce lot. Un cache de décision de sécurité se conçoit, il ne s'improvise pas. À rouvrir si la latence du forward le justifie, avec un TTL borné et une clé identique à celle de la classification.
3. **Périmètre query : tranché, plus à arbitrer.** `queryFilters` et le blob v5 sortent du lot de sécurité et partent en feature séparée. Le lot prend l'étape 8 et rien de plus sur cet axe. Conséquence à assumer et à documenter : entre les deux livraisons, un blob scopé sur un chemin autorise toutes les querys de ce chemin. Le lot rend ce trou visible, il ne le ferme pas.
