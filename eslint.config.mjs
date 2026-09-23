import globals from "globals"
import pluginJs from "@eslint/js"

export default [
  { ignores: [
    "build/", 
    "src/websocket_relay.cjs", 
    "mcp/",
    "results/playwright/", 
    "results/playwright-report/"
] },
  { languageOptions: { globals: globals.browser }},
  { files: ["**/*.mjs"], languageOptions: { globals: globals.node }},
  { files: ["test/**/*.{js,mjs}"], languageOptions: { globals: { ...globals.node, ...globals.mocha }}},
  { files: ["src/typechecking/**/*.js"], rules: { indent: ["error", 2, { SwitchCase: 1 }] }},
  pluginJs.configs.recommended,
  {
    rules: {
      "no-unused-vars": [ "warn", {
          argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_"
      }],
      "no-use-before-define": [ "error", {
          functions: false,
          variables: false,
      }],
      "no-undef": "error",
      "no-empty": "warn",
    },
    languageOptions: {
      globals: {
        analytics:          "readonly",
        VIPER_IDE_VERSION:  "readonly",
        VIPER_IDE_BUILD:    "readonly",
        VIPER_IDE_BASE_URL: "readonly",
        VIPER_TOOLS_STUBS_FILENAME: "readonly",
        VIPER_TOOLS_STUBS_SIZE:     "readonly",
        VIPER_TOOLS_STUBS_SHA256:   "readonly",
      }
    }
  }
]
