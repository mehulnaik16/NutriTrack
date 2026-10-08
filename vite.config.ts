import { defineConfig, loadEnv } from "vite";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";

export default defineConfig(({ command, mode }) => {
  // Expose VITE_* env vars in both client and SSR bundles.
  const envDefine: Record<string, string> = {};
  for (const [key, value] of Object.entries(
    loadEnv(mode, process.cwd(), "VITE_"),
  )) {
    envDefine[`import.meta.env.${key}`] = JSON.stringify(value);
  }

  return {
    define: envDefine,
    // PORT lets a second copy (the preview pane) run beside one on 8080.
    server: {
      host: true,
      port: Number(process.env.PORT) || 8080,
      allowedHosts: true,
    },
    resolve: {
      alias: {
        "@": `${process.cwd()}/src`,
      },
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
      ],
    },
    plugins: [
      tailwindcss(),
      tsConfigPaths({ projects: ["./tsconfig.json"] }),
      tanstackStart({
        importProtection: {
          behavior: "error",
          client: {
            // `**/server/**` matches a directory segment, so it covers
            // src/server/* but not the .server.ts *suffix* — which is where the
            // service-role key lives. Both globs, or client.server.ts is guarded
            // only by createServerFn stripping its handler.
            files: ["**/server/**", "**/*.server.ts"],
            specifiers: ["server-only"],
          },
        },
        // Redirect TanStack Start's bundled server entry to src/server.ts
        // (our SSR error wrapper) and target Vercel for deployment.
        server: {
          // @ts-expect-error — TanStack Start types don't include preset yet
          preset: "vercel",
          entry: "server",
        },
      }),
      // Nitro packages the server output for Vercel on production builds.
      ...(command === "build"
        ? [
            nitro({
              preset: "vercel",
              // Browsers keep /images for a year without asking Vercel again.
              // immutable: to change an image, give it a NEW filename, or
              // returning users keep the old one.
              routeRules: {
                "/images/**": {
                  headers: {
                    "cache-control": "public, max-age=31536000, immutable",
                  },
                },
              },
              output: {
                dir: "dist",
                serverDir: "dist/server",
                publicDir: "dist/client",
              },
            }),
          ]
        : []),
      viteReact(),
    ],
  };
});
