import feedsJson from "../../config/feeds.json";
import type { FeedConfig, FeedsFile } from "../../shared/types";

const file = feedsJson as FeedsFile;

export function loadAllFeeds(): FeedConfig[] {
  return file.feeds;
}

export function loadEnabledFeeds(): FeedConfig[] {
  return file.feeds.filter((f) => f.enabled);
}
