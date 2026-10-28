import js from "@eslint/js";
import noUnsanitized from "eslint-plugin-no-unsanitized";
import globals from "globals";

export default [
  { ignores: ["dist", "reports", "coverage", "playwright-report", "test-results", ".stryker-tmp"] },
  js.configs.recommended,
  {
    files: ["web/**/*.js"],
    languageOptions: { globals: globals.browser },
    plugins: { "no-unsanitized": noUnsanitized },
    rules: {
      // Security: nothing may write raw HTML or run strings as code.
      "no-unsanitized/method": "error",
      "no-unsanitized/property": "error",
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      // Same limits as CodeScene's code health checks, so they fail here first.
      complexity: ["error", 9],
      "max-lines-per-function": ["error", { max: 120, skipBlankLines: true, skipComments: true }],
      "max-params": ["error", 4],
    },
  },
  {
    files: ["tools/**/*.mjs", "tests/**/*.mjs", "*.config.{js,mjs}"],
    languageOptions: { globals: globals.node },
  },
];
