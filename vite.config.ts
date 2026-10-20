// vite.config.ts: the review UI, served by `taste review` (bun --bun vite). TanStack Start in SPA mode: the server
// only answers server functions and the shell; every screen renders in the browser.
import { unplugin as stylexUnplugin } from "@stylexjs/unplugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, type PluginOption } from "vite";

// @stylexjs/unplugin types every bundler entry as `(options?) => any`; the binding confines that `any`.
const stylexVitePlugin: PluginOption = stylexUnplugin.vite({ devMode: "full" });

export default defineConfig({
  root: import.meta.dirname,
  // The store lives wherever TASTE_STORE points; its files change under Vite and must never trigger a reload.
  server: { watch: { ignored: ["**/.taste/**", "**/*demo-store/**", "**/.index/**"] } },
  plugins: [
    stylexVitePlugin,
    tanstackStart({
      spa: { enabled: true },
      // The trust boundary: core touches the filesystem and SQLite, so only `*.server.ts` doors may reach it, and no
      // browser module may import a door.
      importProtection: {
        behavior: "error",
        client: {
          specifiers: ["bun:sqlite", /^node:/],
          files: ["**/*.server.*", "**/src/core/**"],
        },
      },
    }),
    viteReact(),
  ],
});
