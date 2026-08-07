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
    server: { host: "::", port: 8080 },
    resolve: {
      alias: {
        "@": `${process.cwd()}/src`,
      },
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },
    plugins: [
      tailwindcss(),
      tsConfigPaths({ projects: ["./tsconfig.json"] }),
      tanstackStart({
        importProtection: {
          behavior: "error",
          client: {
            files: ["**/server/**"],
            specifiers: ["server-only"],
          },
        },
        // Redirect TanStack Start's bundled server entry to src/server.ts
        // (our SSR error wrapper) and target Vercel for deployment.
        server: {
          preset: "vercel",
          entry: "server",
        },
      }),
      // Nitro packages the server output for Vercel on production builds.
      ...(command === "build"
        ? [
            nitro({
              preset: "vercel",
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
