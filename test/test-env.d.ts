/// <reference types="vite/client" />
/// <reference types="@cloudflare/workers-types" />

declare module "cloudflare:test" {
  import type { D1Database } from "@cloudflare/workers-types";

  export interface ProvidedEnv {
    DB: D1Database;
    TEST_MIGRATIONS: D1Migration[];
  }

  export const env: ProvidedEnv;
  export const SELF: Fetcher;
  export function applyD1Migrations(
    db: D1Database,
    migrations: D1Migration[],
  ): Promise<void>;

  export interface D1Migration {
    name: string;
    queries: string[];
  }
}
