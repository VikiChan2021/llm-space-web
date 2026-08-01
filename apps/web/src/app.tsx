import type { ThreadConnector } from "@llm-space/core";
import { createGistConnector, GIST_CONNECTOR_ID } from "@llm-space/core/storage";
import { ModelProvider } from "@llm-space/ui/components/model-provider";
import {
  ThemeProvider,
  useTheme,
} from "@llm-space/ui/components/theme-provider";
import { HostServicesProvider } from "@llm-space/ui/host";
import { Toaster } from "@llm-space/ui/ui/sonner";
import { TooltipProvider } from "@llm-space/ui/ui/tooltip";
import { lazy, Suspense } from "react";
import { Navigate, Route, Routes, useParams } from "react-router-dom";

import { GuestWorkbench } from "@/guest/guest-workbench";
import {
  GUEST_WORKBENCH_ENABLED,
  webHost,
  webModelClient,
} from "@/host/web-host";
import { App as Landing } from "@/landing/app";
import { I18nProvider } from "@/landing/lib/i18n";
import { NotFound } from "@/not-found";
import { ThreadViewer } from "@/thread-viewer";

const WebDocsPage = lazy(() =>
  import("@/docs/web-docs-page").then((module) => ({
    default: module.WebDocsPage,
  }))
);

/** The connectors this site can read shared threads through, keyed by id. */
const CONNECTORS: Record<string, ThreadConnector> = {
  [GIST_CONNECTOR_ID]: createGistConnector(),
};

// Dev-only offline fixture: `#/shared/gist/threads/mock` serves a bundled sample
// thread with no GitHub API call (handy when rate-limited). Dead-code-eliminated
// from production builds, so the mock module + fixture never ship.
if (import.meta.env.DEV) {
  const { withMockThread } = await import("@/dev/mock-thread");
  CONNECTORS[GIST_CONNECTOR_ID] = withMockThread(
    CONNECTORS[GIST_CONNECTOR_ID]
  );
}

/**
 * The shared-thread route: `#/shared/:connectorId/threads/:threadId`. Hash
 * routing keeps deep links working on GitHub Pages at HTTP 200 with no
 * `404.html` fallback. An unknown connector renders the not-found page.
 */
function SharedThreadRoute() {
  const { connectorId, threadId } = useParams();
  const connector = connectorId ? CONNECTORS[connectorId] : undefined;
  if (!connector || !threadId) return <NotFound />;
  return <ThreadViewer connector={connector} threadId={threadId} />;
}

export function App() {
  return (
    <ThemeProvider>
      <ThemedApp />
    </ThemeProvider>
  );
}

function ThemedApp() {
  const { resolvedTheme } = useTheme();
  return (
      <ModelProvider client={webModelClient}>
        <HostServicesProvider value={webHost}>
          <TooltipProvider delayDuration={800}>
            <Toaster theme={resolvedTheme} position="top-center" closeButton />
            <I18nProvider>
              <Routes>
                <Route
                  path="/shared/:connectorId/threads/:threadId"
                  element={<SharedThreadRoute />}
                />
                <Route path="/shared/*" element={<NotFound />} />
                {GUEST_WORKBENCH_ENABLED ? (
                  <>
                    <Route path="/" element={<Navigate to="/workbench" replace />} />
                    <Route path="/workbench" element={<GuestWorkbench />} />
                    <Route
                      path="/docs/:slug"
                      element={
                        <Suspense
                          fallback={
                            <div className="grid h-dvh place-items-center bg-background text-sm text-muted-foreground">
                              正在加载使用说明…
                            </div>
                          }
                        >
                          <WebDocsPage />
                        </Suspense>
                      }
                    />
                    <Route path="/docs" element={<Navigate to="/docs/quick-start" replace />} />
                    <Route path="/about" element={<Landing />} />
                    <Route path="*" element={<NotFound />} />
                  </>
                ) : (
                  <Route path="*" element={<Landing />} />
                )}
              </Routes>
            </I18nProvider>
          </TooltipProvider>
        </HostServicesProvider>
      </ModelProvider>
  );
}
