import { FgpLogo } from "../layout.tsx";
import { GithubMarkIcon } from "./icons.tsx";

export function PageHeader() {
  return (
    <header class="mb-8">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <FgpLogo size={36} />
          <h1 class="text-2xl font-bold text-fgp-900 dark:text-fgp-100 tracking-tight">
            Fine-Grained Proxy
          </h1>
        </div>
        <a
          href="https://github.com/lsagetlethias/fine-grained-proxy"
          target="_blank"
          rel="noopener"
          class="text-gray-400 hover:text-fgp-600 dark:hover:text-fgp-400 transition-colors"
          aria-label="Voir le code source sur GitHub"
        >
          <GithubMarkIcon size={24} />
        </a>
      </div>
      <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Générer une URL proxy avec des permissions granulaires pour n'importe quelle API.
      </p>
    </header>
  );
}

export function PageFooter({ commitHash }: { commitHash: string }) {
  return (
    <footer class="mt-12 border-t border-gray-200 dark:border-gray-700 pt-6 pb-4 text-center text-sm text-gray-400 dark:text-gray-500">
      <div class="inline-flex items-center gap-2">
        <a
          href="https://github.com/lsagetlethias/fine-grained-proxy"
          target="_blank"
          rel="noopener"
          class="inline-flex items-center gap-1.5 hover:text-fgp-600 dark:hover:text-fgp-400 transition-colors"
        >
          <GithubMarkIcon size={16} />
          Fine-Grained Proxy sur GitHub
        </a>
        <span>&middot;</span>
        {/^[0-9a-f]{7,}$/i.test(commitHash)
          ? (
            <a
              href={`https://github.com/lsagetlethias/fine-grained-proxy/commit/${commitHash}`}
              target="_blank"
              rel="noopener"
              class="font-mono hover:text-fgp-600 dark:hover:text-fgp-400 transition-colors"
            >
              {commitHash.slice(0, 7)}
            </a>
          )
          : <span class="font-mono">{commitHash.slice(0, 7)}</span>}
      </div>
    </footer>
  );
}
