import { AuthModesGuide, BodyFiltersGuide, RegexGuide, ScopesGuide } from "./sidebar-guides.tsx";

export function DocPanel() {
  return (
    <div
      id="panel-doc"
      role="tabpanel"
      aria-labelledby="tab-doc"
      class="space-y-6 text-sm text-gray-600 dark:text-gray-400"
    >
      <section>
        <h3 class="text-base font-semibold text-gray-900 dark:text-gray-100 mb-3">
          Guide d'utilisation
        </h3>
        <ol class="list-decimal list-inside space-y-2">
          <li>Choisissez un preset ou configurez manuellement les champs.</li>
          <li>Renseignez le token API de votre service cible.</li>
          <li>
            D&eacute;finissez les scopes (permissions par route et m&eacute;thode HTTP).
          </li>
          <li>Configurez la dur&eacute;e de validit&eacute; (TTL) de l'URL.</li>
          <li>G&eacute;n&eacute;rez l'URL et la cl&eacute; client.</li>
        </ol>
      </section>

      <hr class="border-gray-200 dark:border-gray-700" />

      <section>
        <h3 class="text-base font-semibold text-gray-900 dark:text-gray-100 mb-3">
          Utilisation de l'URL
        </h3>
        <pre class="rounded-md bg-gray-100 dark:bg-gray-800/50 p-3 font-mono text-xs text-gray-800 dark:text-gray-200 overflow-x-auto whitespace-pre">{`curl -H "X-FGP-Key: <clé>" \\
  <url>/v1/apps`}</pre>
        <p class="mt-2">
          Le header{" "}
          <code class="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">
            X-FGP-Key
          </code>{" "}
          est requis &agrave; chaque requ&ecirc;te. L'URL seule est inexploitable sans cette
          cl&eacute;.
        </p>

        <div class="mt-4 rounded-md bg-fgp-50 dark:bg-fgp-900/20 border border-fgp-200 dark:border-fgp-800 p-3">
          <p class="text-xs font-semibold text-fgp-700 dark:text-fgp-300 mb-2">
            Mode header (recommand&eacute;)
          </p>
          <pre class="rounded-md bg-gray-100 dark:bg-gray-800/50 p-3 font-mono text-xs text-gray-800 dark:text-gray-200 overflow-x-auto whitespace-pre">{`curl -H "X-FGP-Key: <clé>" \\\n  -H "X-FGP-Blob: <blob>" \\\n  <origin>/v1/apps`}</pre>
          <p class="mt-2 text-xs">
            Passez le blob via le header{" "}
            <code class="font-mono bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">
              X-FGP-Blob
            </code>{" "}
            plut&ocirc;t que dans l'URL. M&eacute;thode pr&eacute;f&eacute;r&eacute;e pour
            &eacute;viter les probl&egrave;mes de limite de 255 caract&egrave;res par segment d'URL
            impos&eacute;e par certains services.
          </p>
          <p class="mt-2 text-xs">
            Dans ce mode, <strong>tous</strong>{" "}
            les chemins sont transmis &agrave; l'API cible, y compris{" "}
            <code class="font-mono bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">
              /llms.txt
            </code>{" "}
            et{" "}
            <code class="font-mono bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">/api/*</code>.
            Seules les pages{" "}
            <code class="font-mono bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">/logs</code>
            {" "}
            restent servies par FGP. Pour consulter une page de FGP, envoyez la requ&ecirc;te sans
            le header{" "}
            <code class="font-mono bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">
              X-FGP-Blob
            </code>.
          </p>
        </div>
      </section>

      <hr class="border-gray-200 dark:border-gray-700" />

      <section>
        <h3 class="text-base font-semibold text-gray-900 dark:text-gray-100 mb-3">
          Codes d'erreur
        </h3>

        <p class="mb-2">
          Cette section couvre les erreurs re&ccedil;ues en <strong>consommant</strong>{" "}
          une URL FGP. Les erreurs de g&eacute;n&eacute;ration s'affichent directement sous le champ
          concern&eacute; du formulaire.
        </p>

        <p class="font-medium text-gray-800 dark:text-gray-200">D'o&ugrave; vient l'erreur</p>
        <p class="mt-1">
          Toute r&eacute;ponse renvoy&eacute;e par le proxy porte l'en-t&ecirc;te{" "}
          <code class="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">
            X-FGP-Source
          </code>. Il dit qui a r&eacute;pondu, avant m&ecirc;me de regarder le status.
        </p>
        <ul class="mt-1 list-disc list-inside space-y-0.5">
          <li>
            <code class="font-mono text-xs">proxy</code>{" "}
            : c'est FGP qui a r&eacute;pondu. Le corps a la forme{" "}
            <code class="font-mono text-xs">{"{error, message}"}</code>{" "}
            et le code figure dans la liste ci-dessous.
          </li>
          <li>
            <code class="font-mono text-xs">upstream</code>{" "}
            : la r&eacute;ponse vient de votre API cible. FGP n'a touch&eacute; ni au status ni au
            corps. Il ajoute cet en-t&ecirc;te et retire trois en-t&ecirc;tes au plus :{" "}
            <code class="font-mono text-xs">Set-Cookie</code> et{" "}
            <code class="font-mono text-xs">Transfer-Encoding</code> toujours,{" "}
            <code class="font-mono text-xs">Content-Encoding</code> et{" "}
            <code class="font-mono text-xs">Content-Length</code>{" "}
            uniquement si votre corps est arriv&eacute; compress&eacute; puis
            d&eacute;compress&eacute; avant de vous &ecirc;tre transmis (ils d&eacute;criraient
            alors un corps qui n'existe plus). Interpr&eacute;tez la r&eacute;ponse avec la
            documentation de cette API.
          </li>
        </ul>
        <p class="mt-1">
          Ajoutez <code class="font-mono text-xs">-i</code> &agrave; votre commande{" "}
          <code class="font-mono text-xs">curl</code> pour voir cet en-t&ecirc;te.
        </p>

        <details class="mt-3">
          <summary class="cursor-pointer text-sm font-medium text-fgp-700 dark:text-fgp-300 hover:text-fgp-500">
            Les erreurs de FGP
          </summary>

          <div class="mt-2">
            <p class="font-medium text-gray-700 dark:text-gray-300">La cl&eacute; ou le blob</p>
            <dl class="mt-1 space-y-2">
              <div>
                <dt class="font-medium text-gray-800 dark:text-gray-200">
                  <code class="font-mono text-xs">missing_key</code> (401)
                </dt>
                <dd>
                  L'en-t&ecirc;te <code class="font-mono text-xs">X-FGP-Key</code>{" "}
                  est absent de la requ&ecirc;te. Sans la cl&eacute; client, le blob ne peut pas
                  &ecirc;tre d&eacute;chiffr&eacute;.
                </dd>
              </div>
              <div>
                <dt class="font-medium text-gray-800 dark:text-gray-200">
                  <code class="font-mono text-xs">invalid_credentials</code> (401)
                </dt>
                <dd>
                  Le d&eacute;chiffrement a &eacute;chou&eacute;. La cl&eacute; ne correspond pas
                  &agrave; ce blob, le blob a &eacute;t&eacute; tronqu&eacute; ou modifi&eacute;, ou
                  il a &eacute;t&eacute; g&eacute;n&eacute;r&eacute; sur une autre instance FGP.
                </dd>
              </div>
              <div>
                <dt class="font-medium text-gray-800 dark:text-gray-200">
                  <code class="font-mono text-xs">blob_too_large</code> (414)
                </dt>
                <dd>
                  Le blob d&eacute;passe 4 Ko. R&eacute;duisez le nombre de scopes, de body filters
                  ou de headers d'authentification. Le mode en-t&ecirc;te ne contourne pas cette
                  limite : elle porte sur la taille du blob, pas sur son transport.
                </dd>
              </div>
              <div>
                <dt class="font-medium text-gray-800 dark:text-gray-200">
                  <code class="font-mono text-xs">unsupported_regex</code> (400)
                </dt>
                <dd>
                  Une expression r&eacute;guli&egrave;re de ce blob n'est plus autoris&eacute;e :
                  les groupes quantifi&eacute;s, les backr&eacute;f&eacute;rences et les lookarounds
                  sont refus&eacute;s. Le blob doit &ecirc;tre r&eacute;g&eacute;n&eacute;r&eacute;
                  avec un motif plus simple.
                </dd>
              </div>
            </dl>
          </div>

          <div class="mt-3">
            <p class="font-medium text-gray-700 dark:text-gray-300">
              Le p&eacute;rim&egrave;tre du blob
            </p>
            <dl class="mt-1 space-y-2">
              <div>
                <dt class="font-medium text-gray-800 dark:text-gray-200">
                  <code class="font-mono text-xs">scope_denied</code> (403)
                </dt>
                <dd>
                  La m&eacute;thode ou le chemin demand&eacute; ne correspond &agrave; aucun scope
                  du blob. Si des body filters sont configur&eacute;s, le contenu de la
                  requ&ecirc;te peut aussi &ecirc;tre en cause. La section &laquo; Tester un scope
                  &raquo; rejoue le cas sans consommer d'appel.
                </dd>
              </div>
              <div>
                <dt class="font-medium text-gray-800 dark:text-gray-200">
                  <code class="font-mono text-xs">token_expired</code> (410)
                </dt>
                <dd>
                  Le TTL du blob est d&eacute;pass&eacute;. Une URL expir&eacute;e ne se prolonge
                  pas, il faut en g&eacute;n&eacute;rer une nouvelle.
                </dd>
              </div>
              <div>
                <dt class="font-medium text-gray-800 dark:text-gray-200">
                  <code class="font-mono text-xs">invalid_body</code> (400)
                </dt>
                <dd>
                  Des body filters sont configur&eacute;s mais le corps de la requ&ecirc;te n'est
                  pas du JSON valide. V&eacute;rifiez aussi que l'en-t&ecirc;te{" "}
                  <code class="font-mono text-xs">Content-Type</code> vaut bien{" "}
                  <code class="font-mono text-xs">application/json</code>, sinon la requ&ecirc;te
                  est refus&eacute;e en <code class="font-mono text-xs">scope_denied</code>.
                </dd>
              </div>
              <div>
                <dt class="font-medium text-gray-800 dark:text-gray-200">
                  <code class="font-mono text-xs">payload_too_large</code> (413)
                </dt>
                <dd>
                  Le corps de la requ&ecirc;te d&eacute;passe la taille inspectable, 512 Ko, quand
                  un body filter ou la capture des logs d&eacute;taill&eacute;s est actif. Sans ces
                  deux fonctions, le corps est transmis en flux et n'est pas plafonn&eacute;.
                </dd>
              </div>
            </dl>
          </div>

          <div class="mt-3">
            <p class="font-medium text-gray-700 dark:text-gray-300">La cible du blob</p>
            <dl class="mt-1 space-y-2">
              <div>
                <dt class="font-medium text-gray-800 dark:text-gray-200">
                  <code class="font-mono text-xs">target_forbidden</code> (403)
                </dt>
                <dd>
                  La cible de ce blob n'est pas une adresse publique. FGP refuse de joindre les
                  r&eacute;seaux priv&eacute;s, la boucle locale et les adresses de
                  m&eacute;tadonn&eacute;es. V&eacute;rifiez l'URL cible du blob.
                </dd>
              </div>
            </dl>
          </div>

          <div class="mt-3">
            <p class="font-medium text-gray-700 dark:text-gray-300">
              FGP n'a pas pu obtenir de credentials ou joindre l'API cible
            </p>
            <p class="mt-1">
              Ces trois erreurs sont les seules 502 produites par FGP. Toute autre 502 vient de
              votre API cible : v&eacute;rifiez <code class="font-mono text-xs">X-FGP-Source</code>
              {" "}
              avant de conclure.
            </p>
            <dl class="mt-1 space-y-2">
              <div>
                <dt class="font-medium text-gray-800 dark:text-gray-200">
                  <code class="font-mono text-xs">upstream_unreachable</code> (502)
                </dt>
                <dd>
                  L'API cible n'a r&eacute;pondu &agrave; aucun moment : DNS, d&eacute;lai
                  d&eacute;pass&eacute;, connexion refus&eacute;e ou erreur TLS. V&eacute;rifiez
                  l'URL cible du blob.
                </dd>
              </div>
              <div>
                <dt class="font-medium text-gray-800 dark:text-gray-200">
                  <code class="font-mono text-xs">auth_exchange_failed</code> (502)
                </dt>
                <dd>
                  Mode Scalingo API : impossible de s'authentifier aupr&egrave;s de Scalingo. Le
                  token de compte du blob est invalide ou r&eacute;voqu&eacute;, ou l'API
                  d'authentification Scalingo est indisponible.
                </dd>
              </div>
              <div>
                <dt class="font-medium text-gray-800 dark:text-gray-200">
                  <code class="font-mono text-xs">auth_addon_failed</code> (502)
                </dt>
                <dd>
                  Mode Scalingo Database API : impossible d'obtenir un token de base de
                  donn&eacute;es. Le token de compte est invalide, ou il n'a pas acc&egrave;s
                  &agrave; la base configur&eacute;e dans ce blob.
                </dd>
              </div>
            </dl>
          </div>

          <div class="mt-3">
            <p class="font-medium text-gray-700 dark:text-gray-300">Anomalies</p>
            <p class="mt-1">
              <code class="font-mono text-xs">invalid_request</code>{" "}
              (400) quand l'URL ne contient pas de chemin apr&egrave;s le blob,{" "}
              <code class="font-mono text-xs">invalid_auth_mode</code>{" "}
              (400) quand le mode d'authentification du blob n'est pas reconnu par cette instance,
              et <code class="font-mono text-xs">internal_error</code>{" "}
              (500) qui signale un bug de FGP et m&eacute;rite un rapport.
            </p>
          </div>
        </details>

        <p class="mt-3 font-medium text-gray-800 dark:text-gray-200">
          Les param&egrave;tres de query ne sont pas contr&ocirc;l&eacute;s
        </p>
        <p class="mt-1">
          Les scopes contraignent la m&eacute;thode et le chemin, pas les param&egrave;tres de
          query. Un blob autoris&eacute; sur <code class="font-mono text-xs">/v1/items</code>{" "}
          accepte{" "}
          <code class="font-mono text-xs">/v1/items?action=delete</code>. Si votre API cible expose
          des actions par la query, scopez le chemin le plus &eacute;troitement possible.
        </p>

        <p class="mt-3 font-medium text-gray-800 dark:text-gray-200">
          Tout le reste vient de votre API
        </p>
        <p class="mt-1">
          Un code absent de cette liste n'a pas &eacute;t&eacute; produit par FGP. Un 401, un 404,
          un 429 ou un 500 portant <code class="font-mono text-xs">X-FGP-Source: upstream</code>
          {" "}
          sont la r&eacute;ponse de votre API cible : status et corps inchang&eacute;s, seuls{" "}
          <code class="font-mono text-xs">X-FGP-Source</code>{" "}
          est ajout&eacute; et quelques en-t&ecirc;tes de transport sont retir&eacute;s ({" "}
          <code class="font-mono text-xs">Set-Cookie</code>,{" "}
          <code class="font-mono text-xs">Transfer-Encoding</code>, et{" "}
          <code class="font-mono text-xs">Content-Encoding</code>/
          <code class="font-mono text-xs">Content-Length</code>{" "}
          si votre corps a &eacute;t&eacute; d&eacute;compress&eacute; en route). FGP ne les
          reformule pas et ne les traduit pas : c'est ce qui vous permet de traiter les erreurs de
          votre API exactement comme si vous l'appeliez en direct.
        </p>
      </section>

      <hr class="border-gray-200 dark:border-gray-700" />

      <section>
        <h3 class="text-base font-semibold text-gray-900 dark:text-gray-100 mb-3">
          Partage &amp; import
        </h3>
        <div class="space-y-3">
          <div>
            <p class="font-medium text-gray-800 dark:text-gray-200">
              URL de partage
            </p>
            <p>
              L'URL dans la barre d'adresse se met &agrave; jour automatiquement avec un
              param&egrave;tre{" "}
              <code class="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">
                ?c=
              </code>{" "}
              qui encode la configuration (sans le token). Copiez-la pour partager un template de
              config, le destinataire n'aura qu'&agrave; fournir son propre token.
            </p>
          </div>
          <div>
            <p class="font-medium text-gray-800 dark:text-gray-200">
              Importer une URL FGP
            </p>
            <p>
              Le bouton <strong>Importer</strong>{" "}
              dans les presets permet de d&eacute;coder une URL FGP existante (ou un blob brut) avec
              sa cl&eacute; client. La configuration est r&eacute;cup&eacute;r&eacute;e avec le
              token masqu&eacute;, fournissez le token manuellement pour g&eacute;n&eacute;rer ou
              tester.
            </p>
          </div>
        </div>
      </section>

      <hr class="border-gray-200 dark:border-gray-700" />

      <section>
        <h3 class="text-base font-semibold text-gray-900 dark:text-gray-100 mb-3">
          Infos sur les champs
        </h3>
        <dl class="space-y-3">
          <div>
            <dt class="font-medium text-gray-800 dark:text-gray-200">URL cible</dt>
            <dd>
              L'URL de base de l'API que vous souhaitez proxifier.
            </dd>
          </div>
          <div
            id="doc-auth-modes"
            tabindex={-1}
            role="group"
            aria-labelledby="doc-auth-modes-title"
            class="focus:outline-none focus-visible:ring-2 focus-visible:ring-fgp-500 rounded-md"
          >
            <dt
              id="doc-auth-modes-title"
              class="font-medium text-gray-800 dark:text-gray-200"
            >
              Mode d'auth
            </dt>
            <dd>
              Comment le proxy s'authentifie aupr&egrave;s de l'API cible.
            </dd>
            <dd class="mt-1">
              <ul class="list-disc list-inside space-y-0.5">
                <li>
                  <code class="font-mono text-xs">bearer</code> : token envoy&eacute; dans{" "}
                  <code class="font-mono text-xs">Authorization: Bearer</code>
                </li>
                <li>
                  <code class="font-mono text-xs">basic</code> : Basic Auth
                </li>
                <li>
                  Scalingo API (<code class="font-mono text-xs">scalingo-exchange</code>){" "}
                  : &eacute;change token Scalingo (tk-us-... &rarr; bearer)
                </li>
                <li>
                  Scalingo Database API : token d'addon obtenu en trois temps, valable 1h et
                  renouvel&eacute; automatiquement
                </li>
                <li>
                  Headers multiples : jusqu'&agrave; 8 headers d'authentification envoy&eacute;s
                  tels quels. Un seul header utilise la forme compacte{" "}
                  <code class="font-mono text-xs">header:X-Name</code>
                </li>
              </ul>
            </dd>
          </div>
          <div>
            <dt class="font-medium text-gray-800 dark:text-gray-200">Scopes</dt>
            <dd>
              Patterns au format{" "}
              <code class="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">
                METHOD:PATH
              </code>
              . Le wildcard{" "}
              <code class="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">
                *
              </code>{" "}
              matche tout.
            </dd>
            <dd class="mt-1">
              <pre class="rounded-md bg-gray-100 dark:bg-gray-800/50 p-2 font-mono text-xs text-gray-800 dark:text-gray-200">{`GET:/v1/apps/*
POST:/v1/apps/my-app/scale`}</pre>
            </dd>
          </div>
          <div>
            <dt class="font-medium text-gray-800 dark:text-gray-200">Body filters</dt>
            <dd>
              Pour les scopes POST/PUT/PATCH, filtrez le contenu du body de la requ&ecirc;te (champs
              autoris&eacute;s, valeurs contraintes).
            </dd>
          </div>
          <div>
            <dt class="font-medium text-gray-800 dark:text-gray-200">
              Dur&eacute;e de validit&eacute; (TTL)
            </dt>
            <dd>
              Dur&eacute;e pendant laquelle l'URL g&eacute;n&eacute;r&eacute;e est utilisable.
              Pass&eacute; ce d&eacute;lai, le proxy refuse les requ&ecirc;tes.
            </dd>
          </div>
          <div
            id="doc-client-key"
            tabindex={-1}
            role="group"
            aria-labelledby="doc-client-key-title"
            class="focus:outline-none focus-visible:ring-2 focus-visible:ring-fgp-500 rounded-md"
          >
            <dt
              id="doc-client-key-title"
              class="font-medium text-gray-800 dark:text-gray-200"
            >
              Cl&eacute; client
            </dt>
            <dd>
              Par d&eacute;faut, FGP tire une cl&eacute; al&eacute;atoire diff&eacute;rente pour
              chaque blob et vous la renvoie une seule fois. Le bloc &laquo; Utiliser ma propre
              cl&eacute; client &raquo; permet de fournir la v&ocirc;tre &agrave; la place.
            </dd>
            <dd class="mt-1">
              L'int&eacute;r&ecirc;t est la mutualisation : un pipeline CI qui utilise plusieurs
              URLs FGP ne g&egrave;re alors qu'un seul secret dans son coffre, au lieu d'une
              cl&eacute; par blob. En contrepartie, une cl&eacute; partag&eacute;e qui fuite rend
              d&eacute;chiffrables d'un coup tous les blobs g&eacute;n&eacute;r&eacute;s avec elle,
              y compris ceux cr&eacute;&eacute;s avant la fuite et encore valides.
            </dd>
            <dd class="mt-1">
              Mutualiser une cl&eacute; ne partage pas les autorisations : chaque blob garde ses
              propres scopes, son propre TTL et sa propre cible.
            </dd>
            <dd class="mt-1">
              Contrainte : 24 caract&egrave;res minimum, 256 maximum, ASCII imprimable sans espace.
              Le plancher de 24 vient du fait que le salt serveur est public, expos&eacute; par{" "}
              <code class="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">
                /api/salt
              </code>{" "}
              : la cl&eacute; client est donc la seule inconnue qui prot&egrave;ge un blob
              intercept&eacute; contre un cassage hors ligne.
            </dd>
            <dd class="mt-1">
              La jauge affich&eacute;e sous le champ mesure la vari&eacute;t&eacute; des
              caract&egrave;res saisis. Elle rep&egrave;re une cl&eacute; pauvre, par exemple une
              r&eacute;p&eacute;tition, mais elle ne mesure pas la s&eacute;curit&eacute;
              r&eacute;elle : une phrase de passe en langue naturelle y ressort au maximum.
            </dd>
          </div>
        </dl>
      </section>

      <hr class="border-gray-200 dark:border-gray-700" />

      <section class="space-y-3">
        <h3 class="text-base font-semibold text-gray-900 dark:text-gray-100">
          Exemples &amp; r&eacute;f&eacute;rences
        </h3>

        <ScopesGuide />
        <BodyFiltersGuide />
        <AuthModesGuide />
        <RegexGuide />
      </section>
    </div>
  );
}
