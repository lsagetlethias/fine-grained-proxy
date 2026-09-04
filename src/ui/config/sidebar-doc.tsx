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
        </div>
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
          <div>
            <dt class="font-medium text-gray-800 dark:text-gray-200">Mode d'auth</dt>
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
