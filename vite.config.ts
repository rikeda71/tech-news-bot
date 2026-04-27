import { defineConfig } from "vite-plus";

export default defineConfig({
  fmt: {
    printWidth: 100,
    tabWidth: 2,
    useTabs: false,
    semi: true,
    singleQuote: false,
    trailingComma: "all",
    bracketSpacing: true,
    arrowParens: "always",
    endOfLine: "lf",
    ignorePatterns: [
      "**/dist/**",
      "**/.wrangler/**",
      "**/node_modules/**",
      "**/.claude/worktrees/**",
      "pnpm-lock.yaml",
      "**/*.d.ts",
    ],
  },
  lint: {
    plugins: ["typescript", "unicorn", "oxc", "react", "react-perf", "promise", "import"],
    categories: {
      correctness: "error",
      suspicious: "warn",
    },
    env: {
      builtin: true,
      browser: true,
      node: true,
      es2024: true,
    },
    rules: {
      "no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "react/react-in-jsx-scope": "off",
      "import/no-unassigned-import": "off",
    },
    overrides: [
      {
        files: ["**/tests/**/*.ts", "**/tests/**/*.tsx", "**/*.test.ts", "**/*.test.tsx"],
        plugins: ["vitest"],
      },
    ],
    ignorePatterns: [
      "**/dist/**",
      "**/node_modules/**",
      "**/.wrangler/**",
      "**/.claude/worktrees/**",
      "**/*.d.ts",
      "**/worker-configuration.d.ts",
    ],
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
});
