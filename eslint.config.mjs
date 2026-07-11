import eslint from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import importPlugin from "eslint-plugin-import";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default [
  {
    ignores: ["dist/**", "node_modules/**", "coverage/**"],
  },
  {
    files: ["src/**/*.ts", "tests/**/*.ts", "tools/**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: process.cwd(),
        sourceType: "module",
      },
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
      import: importPlugin,
    },
    rules: {
      ...eslint.configs.recommended.rules,
      ...tseslint.configs["strict-type-checked"].rules,
      ...tseslint.configs["stylistic-type-checked"].rules,
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/explicit-function-return-type": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/prefer-readonly": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        { allowNumber: true, allowBoolean: true },
      ],
      "import/no-cycle": "error",
      "import/no-self-import": "error",
      "import/no-unresolved": "off",
      eqeqeq: ["error", "always"],
      "no-console": ["warn", { allow: ["error", "warn", "info", "log"] }],
      "no-var": "error",
      "prefer-const": "error",
    },
  },
  {
    files: ["tests/**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-floating-promises": "off",
    },
  },
  {
    files: ["tools/**/*.ts"],
    rules: {
      "@typescript-eslint/no-floating-promises": "off",
      "no-console": "off",
    },
  },
  prettier,
];
