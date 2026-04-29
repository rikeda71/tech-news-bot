import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";
import type { StaleFeed } from "../../client/hooks/useStats";

const { StaleFeedsWarning } = await import("../../client/components/StaleFeedsWarning");

const makeStale = (id: string, name: string, overrides: Partial<StaleFeed> = {}): StaleFeed => ({
  id,
  name,
  last_status: "error",
  last_fetched_at: "2024-01-01T00:00:00Z",
  last_error: null,
  ...overrides,
});

describe("StaleFeedsWarning", () => {
  it("renders nothing when staleFeeds is empty", () => {
    const { container } = render(<StaleFeedsWarning staleFeeds={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("shows the count of stale feeds in summary", () => {
    const feeds = [makeStale("f1", "Feed A"), makeStale("f2", "Feed B")];
    render(<StaleFeedsWarning staleFeeds={feeds} />);
    expect(screen.getByText(/2 件の収集に問題があります/)).toBeTruthy();
  });

  it("renders feed name for each stale feed", () => {
    const feeds = [makeStale("f1", "Tech Blog"), makeStale("f2", "Dev Blog")];
    render(<StaleFeedsWarning staleFeeds={feeds} />);
    expect(screen.getByText("Tech Blog")).toBeTruthy();
    expect(screen.getByText("Dev Blog")).toBeTruthy();
  });

  it("shows 'error' label for feeds with error status", () => {
    const feeds = [makeStale("f1", "Error Feed", { last_status: "error" })];
    render(<StaleFeedsWarning staleFeeds={feeds} />);
    // "· error" テキストが含まれている
    const listItem = screen.getByRole("list").firstChild as HTMLElement;
    expect(listItem?.textContent).toContain("error");
  });

  it("shows 'stale' label for feeds with non-error status", () => {
    const feeds = [makeStale("f1", "Stale Feed", { last_status: "stale" })];
    render(<StaleFeedsWarning staleFeeds={feeds} />);
    const listItem = screen.getByRole("list").firstChild as HTMLElement;
    expect(listItem?.textContent).toContain("stale");
  });

  it("shows '未取得' when last_fetched_at is null", () => {
    const feeds = [makeStale("f1", "Never Fetched", { last_fetched_at: null })];
    render(<StaleFeedsWarning staleFeeds={feeds} />);
    expect(screen.getByText(/未取得/)).toBeTruthy();
  });

  it("renders last_error message when present", () => {
    const feeds = [makeStale("f1", "Error Feed", { last_error: "connection timeout" })];
    render(<StaleFeedsWarning staleFeeds={feeds} />);
    expect(screen.getByText("connection timeout")).toBeTruthy();
  });

  it("uses details/summary pattern (collapsible)", () => {
    const feeds = [makeStale("f1", "Feed A")];
    const { container } = render(<StaleFeedsWarning staleFeeds={feeds} />);
    expect(container.querySelector("details")).toBeTruthy();
    expect(container.querySelector("summary")).toBeTruthy();
  });
});
