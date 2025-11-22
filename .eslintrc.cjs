module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    project: ["./tsconfig.json", "./tsconfig.test.json"],
  },
  plugins: ["@typescript-eslint", "import", "prettier"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/recommended-requiring-type-checking",
    "plugin:import/recommended",
    "plugin:import/typescript",
    "prettier",
  ],
  rules: {
    // TypeScript specific rules
    "@typescript-eslint/explicit-module-boundary-types": "warn",
    "@typescript-eslint/no-explicit-any": "off", // Allow 'any' in this project due to API nature
    "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }],
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
  settings: {
    "import/resolver": {
      typescript: true,
      node: true,
    },
  },
  ignorePatterns: ["dist", "node_modules", "*.js", "!.eslintrc.js"],
  overrides: [
    {
      // Specific config for test files
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
  ],
};
