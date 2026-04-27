import { useEffect, useState } from "react";
import type { CategorySummary } from "../types/api";

export function useCategories() {
  const [categories, setCategories] = useState<CategorySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await fetch("/api/categories");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { categories: CategorySummary[] };
        if (alive) setCategories(data.categories);
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (alive) setIsLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return { categories, error, isLoading };
}
