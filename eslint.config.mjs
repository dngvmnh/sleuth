import js from "@eslint/js";
import nextPlugin from "@next/eslint-plugin-next";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

/** Dependency direction (see .kiro/steering/architecture.md), enforced as lint errors. */
const forbid = (...groups) => ({
  "no-restricted-imports": [
    "error",
    {
      patterns: [
        { group: groups, message: "This import breaks the package dependency direction." },
      ],
    },
  ],
});
const APPS = ["@sleuth/web", "@sleuth/web/*", "@sleuth/worker", "@sleuth/worker/*"];

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "packages/db/migrations/**",
      ".sleuth-out/**",
      "playwright-report/**",
      "test-results/**",
      "**/next-env.d.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    plugins: { "@next/next": nextPlugin, "react-hooks": reactHooks },
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      ...nextPlugin.configs["core-web-vitals"].rules,
      ...reactHooks.configs.recommended.rules,
      // App Router only: there is no pages/ directory to check against.
      "@next/next/no-html-link-for-pages": "off",
      ...forbid("@sleuth/worker", "@sleuth/worker/*"),
    },
  },
  // contracts and domain depend on nothing internal (domain may use contracts types).
  { files: ["packages/contracts/**/*.ts"], rules: forbid("@sleuth/*") },
  {
    files: ["packages/domain/**/*.ts"],
    rules: forbid(
      "@sleuth/db",
      "@sleuth/db/*",
      "@sleuth/media",
      "@sleuth/evidence-engine",
      ...APPS,
    ),
  },
  { files: ["packages/db/**/*.ts", "packages/media/**/*.ts"], rules: forbid(...APPS) },
  {
    files: ["packages/evidence-engine/**/*.ts"],
    rules: forbid("@sleuth/db", "@sleuth/db/*", ...APPS),
  },
  { files: ["apps/worker/**/*.ts"], rules: forbid("@sleuth/web", "@sleuth/web/*") },
);
