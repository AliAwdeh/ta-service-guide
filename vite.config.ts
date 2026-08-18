import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ command }) => ({
  // The SSR bundle is served by a Bun process (server/serve.ts). Bundle npm deps
  // in for the production build so the output is self-contained; keep Bun
  // runtime builtins (bun:sqlite) external — Bun provides them, they must NOT
  // be bundled.
  ssr: {
    // Bundle-everything only applies to the production build; the dev server
    // leaves CJS deps (react) external or the ESM module runner chokes on them
    // ("module is not defined").
    noExternal: command === "build" ? true : undefined,
    external: ["bun:sqlite"],
  },
  build: {
    // Keep `bun:*` builtins external in the SSR rollup pass too — `noExternal`
    // above would otherwise try to resolve + bundle them and fail.
    rollupOptions: { external: [/^bun:/] },
  },
  plugins: [
    // TanStack Start plugin must run before React's plugin. Rendering happens on
    // the server per request, so site code must be SSR-safe: never touch
    // browser-only globals (window, document, localStorage) during render or at
    // module top level — only inside effects/handlers.
    tanstackStart({ server: { entry: "server" } }),
    react(),
    tailwindcss(),
    tsconfigPaths(),
  ],
}));
