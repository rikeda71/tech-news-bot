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
      "**/playwright-report/**",
      "**/test-results/**",
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
      // res.json() は any を返すため、テストコードでの型アサーションは必要。
      // また rssParser や xml utils のような外部ライブラリ由来の any も同様。
      // CI 環境での typeAware lint が大量 warning → stdout overflow → panic するため無効化。
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
      "@typescript-eslint/no-unsafe-type-assertion": "off",
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
      "**/playwright-report/**",
      "**/test-results/**",
      "**/*.d.ts",
      "**/worker-configuration.d.ts",
    ],
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
});
