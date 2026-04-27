import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { CategoriesResponse } from "../../client/types/api";

const { useCategories } = await import("../../client/hooks/useCategories");

const sampleResponse: CategoriesResponse = {
  categories: [
    {
      id: "bigtech",
      label: "Big Tech",
      feeds_count: 5,
      articles_30d: 120,
      last_published_at: "2024-01-15T10:00:00Z",
    },
    {
      id: "ai",
      label: "AI",
      feeds_count: 8,
      articles_30d: 200,
      last_published_at: "2024-01-15T09:00:00Z",
    },
  ],
};

describe("useCategories", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("成功時に categories を返す", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(sampleResponse),
      }),
    );

    const { result } = renderHook(() => useCategories());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.categories).toHaveLength(2);
    expect(result.current.categories?.[0].id).toBe("bigtech");
    expect(result.current.error).toBeNull();
  });

  it("HTTP エラー時に error を返す", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      }),
    );

    const { result } = renderHook(() => useCategories());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBeTruthy();
    expect(result.current.categories).toBeNull();
  });

  it("初期状態では isLoading が true", () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));

    const { result } = renderHook(() => useCategories());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.categories).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("/api/categories を fetch する", async () => {
    const mockFetch = vi.fn<() => Promise<Response>>().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(sampleResponse),
    } as unknown as Response);
    vi.stubGlobal("fetch", mockFetch);

    const { result } = renderHook(() => useCategories());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockFetch).toHaveBeenCalledWith("/api/categories");
  });
});
