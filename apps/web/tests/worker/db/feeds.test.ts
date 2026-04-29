import { beforeEach, describe, expect, it } from "vite-plus/test";
import { env } from "cloudflare:test";
import { syncFeeds } from "../../../worker/db/feeds";
import type { FeedConfig } from "../../../worker/types";

const FEED_A: FeedConfig = {
  id: "feed-a",
  name: "Feed A",
  url: "https://x.test/a",
  category: "bigtech",
  lang: "en",
  enabled: true,
};

const FEED_B: FeedConfig = {
  id: "feed-b",
  name: "Feed B",
  url: "https://x.test/b",
  category: "ai",
  lang: "en",
  enabled: true,
};

beforeEach(async () => {
  await syncFeeds(env.DB, [FEED_A, FEED_B]);
});

describe("syncFeeds — soft-delete orphan feeds", () => {
  it("yaml から消えたフィードは enabled=0 になる", async () => {
    // A だけの yaml で再 sync → B が soft-delete される
    await syncFeeds(env.DB, [FEED_A]);

    const b = await env.DB.prepare("SELECT enabled FROM feeds WHERE id = ?1")
      .bind("feed-b")
      .first<{ enabled: number }>();
    expect(b?.enabled).toBe(0);

    // A は変わらず有効
    const a = await env.DB.prepare("SELECT enabled FROM feeds WHERE id = ?1")
      .bind("feed-a")
      .first<{ enabled: number }>();
    expect(a?.enabled).toBe(1);
  });

  it("yaml に再登場したフィードは enabled=1 に戻る", async () => {
    // まず B を soft-delete する
    await syncFeeds(env.DB, [FEED_A]);
    const b = await env.DB.prepare("SELECT enabled FROM feeds WHERE id = ?1")
      .bind("feed-b")
      .first<{ enabled: number }>();
    expect(b?.enabled).toBe(0);

    // B を yaml に戻す → enabled=1 に復活する
    await syncFeeds(env.DB, [FEED_A, FEED_B]);
    const bRestored = await env.DB.prepare("SELECT enabled FROM feeds WHERE id = ?1")
      .bind("feed-b")
      .first<{ enabled: number }>();
    expect(bRestored?.enabled).toBe(1);
  });

  it("既に enabled=0 のフィードは soft-delete で変化しない (idempotent)", async () => {
    // B を soft-delete
    await syncFeeds(env.DB, [FEED_A]);
    // もう一度 A だけで sync しても B は enabled=0 のまま
    await syncFeeds(env.DB, [FEED_A]);

    const b = await env.DB.prepare("SELECT enabled FROM feeds WHERE id = ?1")
      .bind("feed-b")
      .first<{ enabled: number }>();
    expect(b?.enabled).toBe(0);
  });
});
