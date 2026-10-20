import { ColorSchemeScript, MantineProvider, mantineHtmlProps } from "@mantine/core";
import type { QueryClient } from "@tanstack/react-query";
import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { HeadContent, Outlet, Scripts, createRootRouteWithContext } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ReviewAppShell } from "../ui/review-app-shell.tsx";
import { tasteMantineTheme } from "../ui/theme.ts";
import appCss from "../styles.css?url";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Taste review" },
    ],
    // An empty icon, so every load doesn't ask for /favicon.ico and log its 404.
    links: [{ rel: "stylesheet", href: appCss }, { rel: "icon", href: "data:," }],
  }),
  shellComponent: RootDocument,
  component: () => (
    <ReviewAppShell>
      <Outlet />
    </ReviewAppShell>
  ),
});

/**
 * StyleX's Vite plugin injects its dev tags through `transformIndexHtml`, which Start never runs: it renders the
 * document from this route. The `/@id/` prefix sends the runtime through Vite's pipeline so HMR works.
 */
function StylexDevAssets() {
  return (
    <>
      <link rel="stylesheet" href="/virtual:stylex.css" suppressHydrationWarning />
      <script type="module" src="/@id/virtual:stylex:runtime" />
    </>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en" {...mantineHtmlProps}>
      <head>
        <ColorSchemeScript defaultColorScheme="light" />
        <HeadContent />
        <StylexDevAssets />
      </head>
      <body>
        <MantineProvider theme={tasteMantineTheme} defaultColorScheme="light">
          <HotkeysProvider>{children}</HotkeysProvider>
        </MantineProvider>
        <Scripts />
      </body>
    </html>
  );
}
