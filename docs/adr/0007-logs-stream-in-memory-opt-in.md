# ADR 0007 — Logs stream in-memory, opt-in par blob, body chiffré côté client

- **Date** : 2026-04-22
- **Statut** : Accepted

## Contexte

Les utilisateurs de FGP demandent un moyen de consulter les requêtes passées par un blob donné : savoir qui a tapé quel endpoint, avec quel status, à quel moment, et dans certains cas inspecter le body pour comprendre un refus de scope ou un comportement inattendu.

Aujourd'hui FGP n'a que `console.log` via le middleware `logger()` Hono global, qui :

- Mélange toutes les requêtes de tous les blobs, aucun scoping possible.
- Dépend de la plateforme de déploiement (Deno Deploy, Scalingo, etc.) pour la consultation, dont les interfaces varient en qualité.
- Ne donne aucun accès aux bodies.
- Est inaccessible à l'utilisateur final du blob (ops, CI/CD, prestataire), seulement à l'opérateur de l'instance FGP.

Le besoin : une page `/logs` accessible avec le blob + la clé client, qui donne une vue live des requêtes de **ce blob uniquement**, avec un court historique. Avec la contrainte forte que FGP reste zero storage et zero trust.

Le projet a plusieurs contraintes qui cadrent fortement les choix :

1. **Zero storage** (ADR-0002, ADR-0003) : pas de DB, pas de filesystem, pas de queue externe. Tout est éphémère, porté par la requête.
2. **Zero trust serveur** : la clé client n'est jamais stockée. Le salt seul ne suffit pas à lire un blob.
3. **Multi-instance sans état partagé** : Deno Deploy fait tourner des isolates indépendants. FGP ne doit pas dépendre de leurs internes.
4. **Pas d'équivalent API public** : la feature doit être UI only pour rester inspectable et limitée.

## Décision

Ajouter une feature `/logs` **opt-in par blob**, en **mémoire uniquement**, avec **chiffrement du body par la clé client avant stockage**, streamée via **SSE** avec **cursor de reconnect**, gating par kill switch env var.

Les sept choix structurants :

1. **In-memory only, per isolate**. Les logs d'un blob sont visibles uniquement depuis l'isolate qui a capturé la requête. Pas de DB, pas de cache distribué, pas de bus externe. Conséquence assumée : sur une instance multi-isolate (Deno Deploy), un utilisateur peut ne pas voir tout son trafic immédiatement s'il tombe sur un autre isolate au reconnect. C'est acceptable pour une feature de monitoring court terme.

2. **Opt-in par blob via un flag `logs: { enabled, detailed }`**, ajouté au `BlobConfig` **sans bump de version** (v3 reste v3). Les anciens blobs continuent de fonctionner sans modification : le champ est optionnel, absent = logs off. Non-cassant rétro et forward (un proxy v3 sans la feature ignore le champ).

3. **Kill switch global `FGP_LOGS_ENABLED`**. Quand off (défaut), les routes `/logs` et `/logs/stream` répondent 404 et aucune capture n'est effectuée. Permet à un opérateur de désactiver la feature à chaud (redémarrage) sans toucher aux blobs émis. Seul un endpoint léger `GET /logs/health` reste disponible en toutes circonstances : il répond `{"enabled": bool}` et permet à l'UI de configuration d'afficher un message informatif (« Les logs sont désactivés sur cette instance ») plutôt que de laisser l'utilisateur découvrir le 404 en cliquant.

4. **Chiffrement body detailed côté capture avec la clé client**. Le body compressé est chiffré AES-256-GCM avec la même clé dérivée que le blob (`PBKDF2(client_key + server_salt)`) avant d'être stocké en mémoire. Le serveur ne peut pas le relire, même en dump mémoire. Le déchiffrement se fait dans le JS de la page `/logs` à la réception SSE. Cohérent avec la philo zero-trust de FGP.

5. **SSE via `fetch` streaming, pas `EventSource`**. L'API `EventSource` native ne permet pas d'envoyer des headers custom (`X-FGP-Blob`, `X-FGP-Key`). On utilise donc `fetch` en mode streaming et on parse le format SSE côté client. Un heartbeat `event: ping` toutes les 15 secondes évite les idle kills des reverse proxies.

6. **Cursor `?since=<ts>` pour les reconnects**. Le client track le timestamp du dernier event reçu. À la reconnexion, il passe `since` au serveur qui filtre le ring buffer. Pas de doublons, pas de perte — tant que la déconnexion est plus courte que la durée du ring buffer.

7. **Ring buffer court + purge sur inactivité**. Par blob : 50 entries network + 10 detailed, purge après 10 minutes sans nouvel event. Tout est configurable par env var. Le ring buffer sert le monitoring temps réel et les reconnects courts, pas l'audit historique.

## Options envisagées

### Option A — Logs persistés en base (rejeté)

Stocker les entries dans une DB (PostgreSQL, SQLite, KV store). Permet l'audit historique, les requêtes arbitraires, la survie inter-isolates.

- Avantages : historique long, requêtes SQL, visibilité multi-instance.
- Inconvénients : casse la philo zero storage de FGP. Introduit une dépendance infra (DB à provisioner, à sauvegarder, à sécuriser). Impose des choix de rétention. Exfiltration de la DB = exposition des bodies et des patterns d'accès. Rejeté pour cohérence architecturale.

### Option B — Logs globaux non scopés par blob (rejeté)

Étendre le `logger()` Hono global, le rendre accessible via une route admin protégée par auth basique.

- Avantages : très simple, pas de nouvelle infra mémoire.
- Inconvénients : pas de scoping par blob donc l'utilisateur final ne peut pas consulter les siens. Nécessite une auth admin séparée. Logs mélangés = pas exploitables. Rejeté, ne répond pas au besoin.

### Option C — Opt-in in-memory + chiffrement body client-side (retenu)

Flag dans le blob + kill switch env + ring buffer par blob + body chiffré côté serveur avec la clé client, déchiffré côté client.

- Avantages : cohérent avec zero storage (rien ne survit au redémarrage), zero trust (le serveur ne voit pas les bodies), scoping naturel par blob, kill switch immédiat, aucun coût sur un blob qui ne l'active pas.
- Inconvénients : visibilité limitée à un isolate (acceptable, cf. décision 1). Pas d'audit long terme (hors scope, cf. US). RAM consommée sur les blobs actifs (estime ~330 KB/blob worst case, largement sous les 512 MB d'un isolate).

### Option D — `EventSource` plutôt que `fetch` streaming (rejeté)

API plus standard, reconnect automatique géré par le navigateur.

- Avantages : code client plus simple.
- Inconvénients : pas de support des headers custom. Le blob et la clé devraient passer en query string, ce qui les expose dans les logs access des reverse proxies et dans l'historique navigateur. Rédhibitoire. Rejeté.

### Option E — Bump de version blob (v4) pour intégrer `logs` (rejeté)

Au lieu d'un champ optionnel sur v3, créer une version v4 dédiée.

- Avantages : clean break, validation stricte possible.
- Inconvénients : force tous les blobs existants à être régénérés si les utilisateurs veulent activer les logs. Casse la compat. Pour un ajout non-cassant, un champ optionnel suffit largement — la bump serait gratuite. Rejeté pour YAGNI.

## Conséquences

- **Nouvelle surface de stockage mémoire** : ~330 KB par blob actif worst case avec la config par défaut. Purge 10 min garde ça borné. Monitor RAM recommandé pour les instances à fort trafic.

- **Nouveau contrat blob non-cassant** : le champ optionnel `logs: { enabled, detailed }` est ajouté au `BlobConfig`. v3 reste v3. Les blobs sans ce champ sont traités comme « logs off ». Les anciens proxies ignorent le champ gracieusement.

- **Dépendance au header `X-FGP-Blob` côté UI `/logs`** : le mode header (ADR-0005) devient la voie recommandée pour cette feature, puisque SSE via `fetch` ne peut pas facilement mettre le blob dans le path tout en respectant le routing Hono `/logs/stream`.

- **Kill switch opérationnel** : `FGP_LOGS_ENABLED` permet à un admin de désactiver la feature à chaud (redémarrage). Les blobs qui portent `logs.enabled: true` continuent de fonctionner comme proxy normal, seule la capture est court-circuitée. Idempotent côté blob.

- **Limite 1 stream par blob** : protection contre les abus sans rate limiter IP (IP spoofable). Trade-off : un opérateur qui oublie un onglet ouvert bloque les autres. Accepté pour simplicité.

- **Exclusions assumées** : multipart, headers de requête, body de réponse, target upstream. Ces exclusions sont documentées dans specs §14.11 et doivent rester stables pour ne pas créer de vecteur de fuite par accident.

- **Risque d'abus mémoire** : un blob `logs.enabled: true` qui reçoit du trafic forte fréquence remplit son ring buffer et puis reste en éviction FIFO constante. Pas de DoS possible car la taille est bornée par les env vars. À surveiller en prod.

- **Pas d'audit légal** : cette feature n'est pas un logging d'audit. Pas de garantie d'intégrité, pas de signature, pas de rétention garantie. Documenter clairement aux utilisateurs pour éviter les mauvais usages.

- **Évolution possible** : si un jour un besoin d'audit long terme émerge, ce serait un ADR séparé avec probablement un backend externe (Loki, Datadog, etc.) et un opt-in différent. La feature `/logs` actuelle reste scoped au monitoring temps réel.

## Liens

- ADR-0002 : Chiffrement côté serveur (réutilisation du pipeline `deriveKey` pour chiffrer le body detailed)
- ADR-0003 : Proxy agnostique (la feature ne doit rien introduire qui recouple à Scalingo)
- ADR-0005 : Dual mode blob URL/header (mode header utilisé pour `/logs/stream`)
- ADR-0006 : Proxy transparent (cohérence sur le header `X-FGP-Source` pour les erreurs FGP côté `/logs`)
- `docs/specs.md` §14 : spécification fonctionnelle détaillée
- `docs/changelog.md` : entrée utilisateur du 22 avril 2026
