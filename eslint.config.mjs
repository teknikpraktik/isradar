import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // _-prefix = medvetet oanvänd parameter (t.ex. ej anslutna datakällor)
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // ISRADAR: researchdata, python-miljö och genererade/kopierade filer
    ".venv/**",
    "isradar_koldmangd/**",
    "public/vendor/**",
    "public/data/**",
  ]),
]);

export default eslintConfig;
