import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Two logical projects keep the existing node environment for packages/worker/tests
    // and add a jsdom environment for web component tests (.test.tsx under apps/web).
    projects: [
      {
        // Node project: all existing unit and property tests
        test: {
          name: "node",
          environment: "node",
          include: [
            "packages/**/*.test.ts",
            "packages/**/*.property.test.ts",
            "apps/worker/**/*.test.ts",
            // All .test.ts files under apps/web (api routes, lib, features) run in Node.
            // Component tests (.test.tsx) are handled by the web/jsdom project below.
            "apps/web/**/*.test.ts",
            "tests/**/*.test.ts",
            // Unit tests for the scripts (keep-alive, prod-e2e). They import the script's helpers;
            // the scripts run only when called directly, so no test touches the network.
            "scripts/*.test.ts",
          ],
          exclude: ["**/node_modules/**", "tests/e2e/**"],
        },
      },
      {
        // jsdom project: React component tests in apps/web
        // @vitejs/plugin-react transforms JSX before vite:import-analysis,
        // bypassing the jsx:preserve setting in apps/web/tsconfig.json.
        plugins: [react()],
        test: {
          name: "web",
          environment: "jsdom",
          include: ["apps/web/**/*.test.tsx"],
          exclude: ["**/node_modules/**", "apps/web/.next/**"],
          setupFiles: ["./tests/setup/web.ts"],
        },
        resolve: {
          alias: {
            // Mirror the @/* path alias from apps/web/tsconfig.json
            "@": path.resolve(__dirname, "apps/web"),
          },
        },
      },
    ],
  },
});
