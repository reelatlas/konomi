import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Experiment scratch space (see CLAUDE.md) — already git/cursor-ignored,
    // but ESLint doesn't read .gitignore. Without this, `npm run lint`
    // crawls the playground's built Vite bundle (_sandbox/playground/dist/,
    // minified) and drowns real output in thousands of warnings. Sandbox
    // code gets linted at graduation time, when it lands in src/.
    "_sandbox/**",
  ]),
]);

export default eslintConfig;
