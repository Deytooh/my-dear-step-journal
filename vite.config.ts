// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  vite: {
    server: {
      // Keep the canonical Lovable asset pointer working in local previews too.
      proxy: {
        "/__l5e/assets-v1/": {
          target: "https://id-preview--0e8ecf7b-bcc5-435d-a927-f51d157f4667.lovable.app",
          changeOrigin: true,
          configure(proxy) {
            proxy.on("proxyReq", (request) => {
              request.removeHeader("cookie");
              request.removeHeader("authorization");
            });
          },
        },
      },
    },
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
