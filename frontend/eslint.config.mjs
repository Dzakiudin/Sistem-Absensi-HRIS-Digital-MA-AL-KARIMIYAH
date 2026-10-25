import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/js/**/*.js"],
    rules: {
      // Classic scripts share globals and expose handlers to inline HTML, so
      // file-local unused checks report false positives until modules are split.
      "@typescript-eslint/no-unused-vars": "off",
      "no-dupe-keys": "error",
      "no-unreachable": "error",
      "valid-typeof": "error",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "public/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
