import {
  createRootRoute,
  HeadContent,
  Link,
  Scripts,
} from "@tanstack/react-router";
import { AppShell } from "@/client/components/AppShell";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { Button } from "@/client/components/ui/button";
import type { ReactNode } from "react";
import { Toaster } from "sonner";
import {
  themePreferenceInitScript,
  useThemePreference,
} from "@/client/lib/theme";
import appCss from "@/client/styles/app.css?url";
import { getGatewayUrl } from "@/serverFunctions/gateway";

export const Route = createRootRoute({
  // Where the Gateway is: the way back to it (AppShell), and the theme pick
  // the app shares with the launcher and every other app.
  loader: () => getGatewayUrl(),
  staleTime: Infinity,
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/icon.svg", type: "image/svg+xml" },
    ],
  }),
  shellComponent: RootDocument,
  notFoundComponent: NotFound,
});

function NotFound() {
  return (
    <AppShell>
      <PageHeader title="Page not found" />
      <EmptyState
        kind="filtered"
        title="Nothing here"
        action={
          <Button render={<Link to="/" />} variant="outline">
            Back to matters
          </Button>
        }
      />
    </AppShell>
  );
}

/** Toasts ("Copied") in the app's theme. */
function ThemedToaster() {
  const { themePreference } = useThemePreference();
  return <Toaster theme={themePreference} position="bottom-right" />;
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Sets the theme before the first paint: dark never flashes light. */}
        <script
          dangerouslySetInnerHTML={{ __html: themePreferenceInitScript }}
        />
        <HeadContent />
      </head>
      <body>
        {children}
        <ThemedToaster />
        <Scripts />
      </body>
    </html>
  );
}
