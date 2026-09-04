import { DocPanel } from "./sidebar-doc.tsx";
import { ChangelogPanel, ExamplesPanel, LogsPanel } from "./sidebar-panels.tsx";

export function Sidebar() {
  return (
    <aside
      class="lg:col-span-2 lg:border-l lg:border-gray-200 lg:pl-8 dark:lg:border-gray-700 mt-8 lg:mt-0"
      aria-label="Documentation et aide"
    >
      <div class="sticky top-8">
        <div class="flex border-b border-gray-200 dark:border-gray-700 mb-6" role="tablist">
          <button
            type="button"
            id="tab-doc"
            role="tab"
            aria-selected="true"
            aria-controls="panel-doc"
            class="px-4 py-2 text-sm font-medium border-b-2 border-fgp-600 text-fgp-700 dark:text-fgp-300 dark:border-fgp-400"
          >
            Doc
          </button>
          <button
            type="button"
            id="tab-examples"
            role="tab"
            aria-selected="false"
            aria-controls="panel-examples"
            tabindex={-1}
            class="px-4 py-2 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            Exemples
          </button>
          <button
            type="button"
            id="tab-changelog"
            role="tab"
            aria-selected="false"
            aria-controls="panel-changelog"
            tabindex={-1}
            class="px-4 py-2 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            Changelog
          </button>
          <button
            type="button"
            id="tab-logs"
            role="tab"
            aria-selected="false"
            aria-controls="panel-logs"
            tabindex={-1}
            class="px-4 py-2 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            Logs
          </button>
        </div>

        <DocPanel />

        <ExamplesPanel />

        <ChangelogPanel />

        <LogsPanel />
      </div>
    </aside>
  );
}
