import { Layout } from "./layout.tsx";
import { PageFooter, PageHeader } from "./config/page-chrome.tsx";
import { NameSection, PresetSection, TargetSection } from "./config/form-identity.tsx";
import {
  AuthModeSection,
  CustomHeadersSection,
  ScalingoAddonSection,
  ScalingoAppsSection,
  TokenSection,
} from "./config/form-auth.tsx";
import { ScopesSection, TestScopeSection } from "./config/form-scopes.tsx";
import { ByokSection, GenerateSection, TtlSection } from "./config/form-delivery.tsx";
import { ErrorBanner, ResultSection } from "./config/result.tsx";
import { Sidebar } from "./config/sidebar.tsx";

export function ConfigPage({ commitHash = "dev" }: { commitHash?: string }) {
  return (
    <Layout>
      <PageHeader />

      <main>
        <div class="grid grid-cols-1 lg:grid-cols-5 gap-8">
          <div class="lg:col-span-3">
            <form id="fgp-form" class="space-y-6" autocomplete="off">
              <NameSection />
              <PresetSection />
              <TargetSection />
              <AuthModeSection />
              <CustomHeadersSection />
              <ScalingoAddonSection />
              <TokenSection />
              <ScalingoAppsSection />
              <ScopesSection />
              <TtlSection />
              <ByokSection />
              <GenerateSection />
              <TestScopeSection />
            </form>

            <ResultSection />

            <ErrorBanner />

            <script defer src="/static/client.js" />
          </div>

          <Sidebar />
        </div>
      </main>

      <PageFooter commitHash={commitHash} />
    </Layout>
  );
}
