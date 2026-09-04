export function ScopesGuide() {
  return (
    <details>
      <summary class="cursor-pointer text-sm font-medium text-fgp-700 dark:text-fgp-300 hover:text-fgp-500">
        Scopes : exemples
      </summary>
      <div class="mt-2 text-xs space-y-4 text-gray-600 dark:text-gray-400">
        <div class="space-y-2">
          <p class="font-medium text-gray-700 dark:text-gray-300">Cas courants</p>

          <div>
            <p class="font-medium text-gray-700 dark:text-gray-300">
              Lecture seule sur toutes les apps
            </p>
            <pre class="rounded-md bg-gray-100 dark:bg-gray-800/50 p-2 font-mono text-gray-800 dark:text-gray-200 mt-1">GET:/v1/apps/*</pre>
            <ul class="mt-1 space-y-0.5">
              <li>
                Autorise : <code class="font-mono">GET /v1/apps/my-app</code>,{" "}
                <code class="font-mono">GET /v1/apps/my-app/containers</code>
              </li>
              <li>
                Bloque : <code class="font-mono">POST /v1/apps/my-app/scale</code>,{" "}
                <code class="font-mono">DELETE /v1/apps/my-app</code>
              </li>
            </ul>
          </div>

          <div>
            <p class="font-medium text-gray-700 dark:text-gray-300">
              Lecture + scale sur une app pr&eacute;cise
            </p>
            <pre class="rounded-md bg-gray-100 dark:bg-gray-800/50 p-2 font-mono text-gray-800 dark:text-gray-200 mt-1">{`GET:/v1/apps/my-app/*\nPOST:/v1/apps/my-app/scale`}</pre>
            <ul class="mt-1 space-y-0.5">
              <li>
                Autorise : <code class="font-mono">GET /v1/apps/my-app/containers</code>,{" "}
                <code class="font-mono">POST /v1/apps/my-app/scale</code>
              </li>
              <li>
                Bloque : <code class="font-mono">GET /v1/apps/other-app/containers</code>,{" "}
                <code class="font-mono">DELETE /v1/apps/my-app</code>
              </li>
            </ul>
          </div>

          <div>
            <p class="font-medium text-gray-700 dark:text-gray-300">Full access</p>
            <pre class="rounded-md bg-gray-100 dark:bg-gray-800/50 p-2 font-mono text-gray-800 dark:text-gray-200 mt-1">*:*</pre>
            <p class="mt-1">
              Autorise tout. R&eacute;server au debug ou tokens tr&egrave;s courts (TTL 1h).
            </p>
          </div>

          <div>
            <p class="font-medium text-gray-700 dark:text-gray-300">
              Multi-m&eacute;thodes avec pipe
            </p>
            <pre class="rounded-md bg-gray-100 dark:bg-gray-800/50 p-2 font-mono text-gray-800 dark:text-gray-200 mt-1">GET|POST:/v1/apps/*</pre>
            <ul class="mt-1 space-y-0.5">
              <li>
                Autorise : <code class="font-mono">GET /v1/apps/my-app</code>,{" "}
                <code class="font-mono">POST /v1/apps/my-app/deployments</code>
              </li>
              <li>
                Bloque : <code class="font-mono">DELETE /v1/apps/my-app</code>,{" "}
                <code class="font-mono">PATCH /v1/apps/my-app</code>
              </li>
            </ul>
          </div>
        </div>

        <hr class="border-gray-200 dark:border-gray-700" />

        <div class="space-y-2">
          <p class="font-medium text-gray-700 dark:text-gray-300">Edge cases</p>

          <div>
            <p class="font-medium text-gray-700 dark:text-gray-300">
              Wildcard mid-path
            </p>
            <pre class="rounded-md bg-gray-100 dark:bg-gray-800/50 p-2 font-mono text-gray-800 dark:text-gray-200 mt-1">GET:/v1/apps/*/containers</pre>
            <p class="mt-1">
              Matche tous les containers de toutes les apps, mais uniquement la route{" "}
              <code class="font-mono">/containers</code> exacte.
            </p>
          </div>

          <div>
            <p class="font-medium text-gray-700 dark:text-gray-300">
              Exact match (pas de wildcard)
            </p>
            <pre class="rounded-md bg-gray-100 dark:bg-gray-800/50 p-2 font-mono text-gray-800 dark:text-gray-200 mt-1">GET:/v1/apps/my-app</pre>
            <p class="mt-1">
              Matche uniquement cette route exacte, pas les sous-routes.
            </p>
          </div>

          <div>
            <p class="font-medium text-gray-700 dark:text-gray-300">
              Trailing wildcard
            </p>
            <pre class="rounded-md bg-gray-100 dark:bg-gray-800/50 p-2 font-mono text-gray-800 dark:text-gray-200 mt-1">GET:/v1/apps/*</pre>
            <p class="mt-1">
              Matche tout ce qui commence par <code class="font-mono">/v1/apps/</code>{" "}
              suivi d'au moins un caract&egrave;re. Bloque{" "}
              <code class="font-mono">GET /v1/apps</code> (pas de segment apr&egrave;s).
            </p>
          </div>
        </div>
      </div>
    </details>
  );
}

export function BodyFiltersGuide() {
  return (
    <details>
      <summary class="cursor-pointer text-sm font-medium text-fgp-700 dark:text-fgp-300 hover:text-fgp-500">
        Body filters : exemples
      </summary>
      <div class="mt-2 text-xs space-y-4 text-gray-600 dark:text-gray-400">
        <p>
          Les body filters s'appliquent aux scopes POST, PUT, PATCH. Ils contraignent le contenu
          JSON du body.
        </p>

        <div class="space-y-2">
          <p class="font-medium text-gray-700 dark:text-gray-300">Cas courants</p>

          <div>
            <p class="font-medium text-gray-700 dark:text-gray-300">
              D&eacute;ploiement scop&eacute; par branche
            </p>
            <p>
              Scope : <code class="font-mono">POST:/v1/apps/my-app/deployments</code>
            </p>
            <p>
              Filtre : <code class="font-mono">deployment.git_ref</code> ={" "}
              <code class="font-mono">master</code> | <code class="font-mono">main</code>
            </p>
            <ul class="mt-1 space-y-0.5">
              <li>
                Autorise : body avec <code class="font-mono">git_ref: "main"</code>
              </li>
              <li>
                Bloque : body avec <code class="font-mono">git_ref: "develop"</code>
              </li>
            </ul>
          </div>

          <div>
            <p class="font-medium text-gray-700 dark:text-gray-300">
              Source restreinte (wildcard string)
            </p>
            <p>
              Filtre : <code class="font-mono">deployment.source_url</code> ={" "}
              <code class="font-mono">https://github.com/my-org/*</code>
            </p>
            <ul class="mt-1 space-y-0.5">
              <li>
                Autorise : URL commen&ccedil;ant par{" "}
                <code class="font-mono">https://github.com/my-org/</code>
              </li>
              <li>
                Bloque : <code class="font-mono">https://github.com/hacker/malicious/...</code>
              </li>
            </ul>
          </div>

          <div>
            <p class="font-medium text-gray-700 dark:text-gray-300">
              V&eacute;rifier qu'un champ existe
            </p>
            <p>
              Filtre : <code class="font-mono">deployment.git_ref</code> = wildcard (type "exists")
            </p>
            <p class="mt-1">
              Autorise tout body contenant le champ, quelle que soit la valeur.
            </p>
          </div>
        </div>

        <hr class="border-gray-200 dark:border-gray-700" />

        <div class="space-y-2">
          <p class="font-medium text-gray-700 dark:text-gray-300">Edge cases</p>

          <div>
            <p class="font-medium text-gray-700 dark:text-gray-300">
              Type exact (boolean)
            </p>
            <p>
              Filtre : <code class="font-mono">container.enabled</code> ={" "}
              <code class="font-mono">true</code> (type boolean)
            </p>
            <p class="mt-1">
              Match strict sur le type JSON. La string <code class="font-mono">"true"</code>{" "}
              ne matche pas le boolean <code class="font-mono">true</code>.
            </p>
          </div>

          <div>
            <p class="font-medium text-gray-700 dark:text-gray-300">
              Exclusion (NOT)
            </p>
            <p>
              Filtre : <code class="font-mono">deployment.git_ref</code> !={" "}
              <code class="font-mono">develop</code>
            </p>
            <ul class="mt-1 space-y-0.5">
              <li>
                Autorise : <code class="font-mono">"main"</code>,{" "}
                <code class="font-mono">"release/v2"</code>
              </li>
              <li>
                Bloque : <code class="font-mono">"develop"</code>
              </li>
            </ul>
          </div>

          <div>
            <p class="font-medium text-gray-700 dark:text-gray-300">
              Combinaison AND
            </p>
            <p>
              Filtre : <code class="font-mono">deployment.git_ref</code>{" "}
              = AND(<code class="font-mono">release/*</code>, NOT{" "}
              <code class="font-mono">release/broken</code>)
            </p>
            <p class="mt-1">
              Toutes les conditions doivent &ecirc;tre vraies simultan&eacute;ment.
            </p>
          </div>

          <div>
            <p class="font-medium text-gray-700 dark:text-gray-300">
              Regex dans body filter
            </p>
            <p>
              Filtre : <code class="font-mono">deployment.git_ref</code> = regex{" "}
              <code class="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">
                {`^v\\d+\\.\\d+\\.\\d+$`}
              </code>
            </p>
            <p class="mt-1">
              Matche les tags semver (<code class="font-mono">v1.2.3</code>). Limit&eacute; &agrave;
              200 caract&egrave;res, string uniquement.
            </p>
          </div>
        </div>
      </div>
    </details>
  );
}

export function AuthModesGuide() {
  return (
    <details>
      <summary class="cursor-pointer text-sm font-medium text-fgp-700 dark:text-fgp-300 hover:text-fgp-500">
        Auth modes : quand utiliser quoi
      </summary>
      <div class="mt-2 text-xs space-y-3 text-gray-600 dark:text-gray-400">
        <div>
          <p class="font-medium text-gray-700 dark:text-gray-300">
            <code class="font-mono">bearer</code>
          </p>
          <p>
            Envoie{" "}
            <code class="font-mono">Authorization: Bearer &lt;token&gt;</code>. La majorit&eacute;
            des APIs REST modernes (GitHub, Stripe, etc.).
          </p>
        </div>
        <div>
          <p class="font-medium text-gray-700 dark:text-gray-300">
            <code class="font-mono">basic</code>
          </p>
          <p>
            Envoie{" "}
            <code class="font-mono">Authorization: Basic &lt;base64&gt;</code>. APIs legacy,
            services internes, registries Docker.
          </p>
        </div>
        <div>
          <p class="font-medium text-gray-700 dark:text-gray-300">
            <code class="font-mono">scalingo-exchange</code>
          </p>
          <p>
            &Eacute;change le token API Scalingo (<code class="font-mono">
              tk-us-...
            </code>) contre un bearer temporaire (1h), cach&eacute; en m&eacute;moire
            chiffr&eacute;, renouvel&eacute; automatiquement. Exclusivement pour l'API Scalingo.
          </p>
        </div>
        <div>
          <p class="font-medium text-gray-700 dark:text-gray-300">
            Scalingo Database API
          </p>
          <p>
            Acc&egrave;s &agrave; la Database API d'une base Scalingo (<code class="font-mono">
              https://db-api.&lt;r&eacute;gion&gt;.scalingo.com
            </code>) sans jamais exposer le token de compte. Un blob couvre une seule base : le
            token obtenu ne vaut que pour elle, et une requ&ecirc;te qui en vise une autre est
            rejet&eacute;e par Scalingo.
          </p>
        </div>
        <div>
          <p class="font-medium text-gray-700 dark:text-gray-300">
            Headers multiples
          </p>
          <p>
            Envoie un &agrave; huit headers d'authentification tels quels. APIs qui n'utilisent pas
            {" "}
            <code class="font-mono">Authorization</code>{" "}
            (Algolia, SendGrid, etc.) ou qui exigent plusieurs headers (cl&eacute; + identifiant de
            client + signature). Aucun appel r&eacute;seau suppl&eacute;mentaire.
          </p>
        </div>
      </div>
    </details>
  );
}

export function RegexGuide() {
  return (
    <details>
      <summary class="cursor-pointer text-sm font-medium text-fgp-700 dark:text-fgp-300 hover:text-fgp-500">
        Regex : mini-guide
      </summary>
      <div class="mt-2 text-xs space-y-3 text-gray-600 dark:text-gray-400">
        <div class="space-y-1.5">
          <p class="font-medium text-gray-700 dark:text-gray-300">
            Patterns courants
          </p>
          <div class="space-y-1">
            <div class="flex items-baseline gap-2">
              <code class="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded shrink-0">
                {`^release/.*`}
              </code>
              <span>
                matche <code class="font-mono">release/v1</code>,{" "}
                <code class="font-mono">release/hotfix</code>
              </span>
            </div>
            <div class="flex items-baseline gap-2">
              <code class="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded shrink-0">
                {`v\\d+`}
              </code>
              <span>
                matche <code class="font-mono">v1</code>, <code class="font-mono">v12</code>,{" "}
                <code class="font-mono">release-v3</code>
              </span>
            </div>
            <div class="flex items-baseline gap-2">
              <code class="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded shrink-0">
                {`^(main|master)$`}
              </code>
              <span>
                matche <code class="font-mono">main</code> ou <code class="font-mono">master</code>
                {" "}
                exactement
              </span>
            </div>
            <div class="flex items-baseline gap-2">
              <code class="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded shrink-0">
                {`^v\\d+\\.\\d+\\.\\d+$`}
              </code>
              <span>
                matche semver (<code class="font-mono">v1.2.3</code>)
              </span>
            </div>
            <div class="flex items-baseline gap-2">
              <code class="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded shrink-0">
                {`.*-prod$`}
              </code>
              <span>
                matche <code class="font-mono">api-prod</code>,{" "}
                <code class="font-mono">web-prod</code>
              </span>
            </div>
          </div>
        </div>

        <hr class="border-gray-200 dark:border-gray-700" />

        <div class="space-y-1.5">
          <p class="font-medium text-gray-700 dark:text-gray-300">
            Pi&egrave;ges fr&eacute;quents
          </p>
          <div>
            <p class="font-medium text-gray-700 dark:text-gray-300">
              Match partiel par d&eacute;faut
            </p>
            <p>
              Le pattern{" "}
              <code class="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">
                release
              </code>{" "}
              matche aussi <code class="font-mono">my-release-branch</code>. Pour un match exact :
              {" "}
              <code class="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">
                {`^release$`}
              </code>.
            </p>
          </div>
          <div>
            <p class="font-medium text-gray-700 dark:text-gray-300">
              Pipe dans les regex
            </p>
            <p>
              Dans un regex,{" "}
              <code class="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">
                main|master
              </code>{" "}
              = "main OU master". Dans le champ scopes, le pipe s&eacute;pare les m&eacute;thodes
              HTTP, deux contextes diff&eacute;rents.
            </p>
          </div>
          <div>
            <p class="font-medium text-gray-700 dark:text-gray-300">Limites</p>
            <p>
              Max 200 caract&egrave;res par pattern. Test&eacute; uniquement sur des valeurs string
              JSON (pas num&eacute;rique ni boolean).
            </p>
          </div>
        </div>
      </div>
    </details>
  );
}
