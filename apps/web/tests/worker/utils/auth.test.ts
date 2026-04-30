import { describe, expect, it } from "vite-plus/test";
import { isValidAdminToken, timingSafeEqual } from "../../../worker/utils/auth";
import type { Env } from "../../../worker/types";

// テスト用の最小限 Env スタブ (認証に関係するフィールドのみ)
function makeEnv(overrides: Partial<Pick<Env, "ADMIN_TOKEN" | "ADMIN_TOKEN_NEXT">> = {}): Env {
  return {
    DB: {} as D1Database,
    ASSETS: {} as Fetcher,
    COLLECTOR_CONCURRENCY: "4",
    COLLECTOR_TIMEOUT_MS: "500",
    COLLECTOR_RETRIES: "2",
    SUMMARY_MAX_LENGTH: "200",
    RETENTION_DAYS: "90",
    CORS_ALLOWED_ORIGINS: "",
    ...overrides,
  };
}

describe("timingSafeEqual", () => {
  it("同じ文字列は true を返す", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
  });

  it("異なる文字列は false を返す", () => {
    expect(timingSafeEqual("abc", "xyz")).toBe(false);
  });

  it("長さが異なる場合は false を返す", () => {
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
    expect(timingSafeEqual("abcd", "abc")).toBe(false);
  });

  it("空文字同士は true を返す", () => {
    expect(timingSafeEqual("", "")).toBe(true);
  });

  it("片方が空文字の場合は false を返す", () => {
    expect(timingSafeEqual("abc", "")).toBe(false);
    expect(timingSafeEqual("", "abc")).toBe(false);
  });
});

describe("isValidAdminToken", () => {
  it("現行 ADMIN_TOKEN と一致する場合は true を返す", () => {
    const env = makeEnv({ ADMIN_TOKEN: "current-token" });
    expect(isValidAdminToken("current-token", env)).toBe(true);
  });

  it("ADMIN_TOKEN_NEXT と一致する場合は true を返す (ローテーション対応)", () => {
    const env = makeEnv({ ADMIN_TOKEN: "current-token", ADMIN_TOKEN_NEXT: "next-token" });
    expect(isValidAdminToken("next-token", env)).toBe(true);
  });

  it("どちらにも一致しない場合は false を返す", () => {
    const env = makeEnv({ ADMIN_TOKEN: "current-token", ADMIN_TOKEN_NEXT: "next-token" });
    expect(isValidAdminToken("wrong-token", env)).toBe(false);
  });

  it("ADMIN_TOKEN が未設定の場合は false を返す", () => {
    const env = makeEnv();
    expect(isValidAdminToken("any-token", env)).toBe(false);
  });

  it("ADMIN_TOKEN_NEXT が未設定でも現行 token が一致すれば true を返す", () => {
    const env = makeEnv({ ADMIN_TOKEN: "current-token" });
    expect(isValidAdminToken("current-token", env)).toBe(true);
  });
});
