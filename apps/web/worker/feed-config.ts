import type { FeedConfig, FeedsFile } from "./types";
import feedsYaml from "./feeds.yaml";

const file = feedsYaml as FeedsFile;

export function getFeedsVersion(): number {
  return file.version;
}

export function loadAllFeeds(): FeedConfig[] {
  return file.feeds;
}

export function loadEnabledFeeds(): FeedConfig[] {
  return file.feeds.filter((f) => f.enabled);
}
