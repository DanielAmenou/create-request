const js = require("@eslint/js");
const tseslint = require("@typescript-eslint/eslint-plugin");
const tsparser = require("@typescript-eslint/parser");
const importPlugin = require("eslint-plugin-import");
const prettierConfig = require("eslint-config-prettier");
const prettierPlugin = require("eslint-plugin-prettier");
const globals = require("globals");

module.exports = [
  // Global ignores
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "coverage/**",
      "*.json",
      "*.js",
      "!eslint.config.cjs",
      "!rollup.config.js",
    ],
  },
  // Base ESLint recommended config
  js.configs.recommended,
  // TypeScript ESLint flat configs
  ...tseslint.configs["flat/recommended"],
  ...tseslint.configs["flat/recommended-type-checked"],
  // Main configuration
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        project: ["./tsconfig.json", "./tsconfig.test.json"],
      },
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
      import: importPlugin,
      prettier: prettierPlugin,
    },
    settings: {
      "import/resolver": {
        typescript: true,
        node: true,
      },
    },
    rules: {
      // TypeScript specific rules
      "@typescript-eslint/explicit-module-boundary-types": "warn",
      "@typescript-eslint/no-explicit-any": "off", // Allow 'any' in this project due to API nature
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/return-await": "error",

      // General best practices
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "no-duplicate-imports": "warn",
      "prefer-const": "error",
      "no-debugger": "error",
      "no-alert": "error",

      "import/no-duplicates": "warn",

      // Prettier integration
      "prettier/prettier": "warn",
    },
  },
  // Prettier config (must be last to override other configs)
  prettierConfig,
  // Test files override
  {
    files: ["test/**/*.ts"],
    rules: {
      // Rules for test files
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/only-throw-error": "off", // Allow throwing non-Error objects in tests
      "@typescript-eslint/prefer-promise-reject-errors": "off", // Allow rejecting with non-Error objects in tests
      "@typescript-eslint/no-misused-promises": [
        "error",
        {
          checksVoidReturn: false,
        },
      ],
    },
  },
];

