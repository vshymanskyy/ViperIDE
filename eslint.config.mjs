import globals from "globals";
import pluginJs from "@eslint/js";

export default [
  { ignores: ["build/"] },
  { languageOptions: { globals: globals.browser }},
  pluginJs.configs.recommended,
  {
    rules: {
      "no-unused-vars": [ "error",
          { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-undef": "error",
      "no-empty": "warn",
    },
    languageOptions: {
      globals: {
        analytics:  "readonly",
        toastr:     "readonly",
      }
    }
  }
]
