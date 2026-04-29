import { useEffect, useState } from "react";
import type { ReportDetail, ReportListItem, ReportKind } from "../types/api";

interface ListState {
  data: ReportListItem[];
  loading: boolean;
  error: string | null;
}

interface DetailState {
  data: ReportDetail | null;
  loading: boolean;
  error: string | null;
}

export function useReportsList(kind?: ReportKind) {
  const [state, setState] = useState<ListState>({ data: [], loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    setState({ data: [], loading: true, error: null });

    const params = new URLSearchParams();
    if (kind) params.set("kind", kind);
    params.set("limit", "50");

    void (async () => {
      try {
        const res = await fetch(`/api/reports?${params.toString()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { reports: ReportListItem[] };
        if (!cancelled) setState({ data: json.reports, loading: false, error: null });
      } catch (err) {
        if (!cancelled)
          setState({
            data: [],
            loading: false,
            error: err instanceof Error ? err.message : String(err),
          });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [kind]);

  return state;
}

export function useReport(id: number) {
  const [state, setState] = useState<DetailState>({ data: null, loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    setState({ data: null, loading: true, error: null });

    void (async () => {
      try {
        const res = await fetch(`/api/reports/${id}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { report: ReportDetail };
        if (!cancelled) setState({ data: json.report, loading: false, error: null });
      } catch (err) {
        if (!cancelled)
          setState({
            data: null,
            loading: false,
            error: err instanceof Error ? err.message : String(err),
          });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  return state;
}
