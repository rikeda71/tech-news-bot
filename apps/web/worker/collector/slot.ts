import { loadEnabledFeeds } from "../feed-config";

/**
 * enabled feed を id 昇順でソートし `total` 等分した上で `slot` 番目のグループの id を返す。
 *
 * Free plan の subrequest 上限 (50 / invocation) を満たすため、3 cron に分けて
 * 1 cron あたり ≒ feeds.length / 3 個のフィードだけを収集する。
 *
 * - id 昇順 + 連続 chunk により、feed を追加してもメンバー入れ替えが局所化される
 *   (中間に挟まると後続 chunk が 1 つずつ右にずれる程度)
 * - chunk 境界の計算は ceil で「先頭 slot を多め」に詰める。total=3 / feeds=43 のときは 15 / 14 / 14
 */
export function pickFeedSlot(slot: number, total: number): string[] {
  const feeds = loadEnabledFeeds().toSorted((a, b) => a.id.localeCompare(b.id));
  const chunkSize = Math.ceil(feeds.length / total);
  const start = slot * chunkSize;
  const end = Math.min(start + chunkSize, feeds.length);
  return feeds.slice(start, end).map((f) => f.id);
}
