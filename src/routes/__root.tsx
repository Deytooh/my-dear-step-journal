import { RouteRecovery } from "@/components/app/RouteRecovery";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { JournalProvider } from "@/lib/journal";
import { AppShell } from "@/components/app/AppShell";
import { Toaster } from "@/components/ui/sonner";
import { APP_FONT_STYLESHEETS } from "@/lib/fonts";

function NotFoundComponent() {
  return <RouteRecovery kind="not-found" embedded />;
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);
  return (
    <RouteRecovery
      kind="error"
      onRetry={() => {
        router.invalidate();
        reset();
      }}
    />
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#FFF8E9" },
      { title: "my dear step" },
      { name: "description", content: "나의 GLP-1 여정을 가볍게 기록하는 개인 저널." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  // Keep third-party font CSS off the first-render path. The print-only links
  // download without blocking the app; hydration enables them even if their
  // load events fired before React attached its listeners.
  useEffect(() => {
    document.querySelectorAll<HTMLLinkElement>("link[data-app-fonts]").forEach((link) => {
      link.media = "all";
    });
  }, []);
  return (
    <html lang="ko">
      <head>
        <HeadContent />
        {APP_FONT_STYLESHEETS.map((href) => (
          <link key={href} data-app-fonts rel="stylesheet" href={href} media="print" />
        ))}
        <noscript>
          {APP_FONT_STYLESHEETS.map((href) => (
            <link key={href} rel="stylesheet" href={href} />
          ))}
        </noscript>
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <JournalProvider>
        <AppShell>
          <Outlet />
        </AppShell>
        <Toaster position="top-center" />
      </JournalProvider>
    </QueryClientProvider>
  );
}
