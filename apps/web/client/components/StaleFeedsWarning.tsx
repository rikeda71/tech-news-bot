import type { StaleFeed } from "../hooks/useStats";
import { formatRelative } from "../lib/routing";

interface Props {
  staleFeeds: StaleFeed[];
}

export function StaleFeedsWarning({ staleFeeds }: Props) {
  if (staleFeeds.length === 0) return null;

  return (
    <details className="w-full mt-[var(--space-2)] py-[var(--space-2)] px-[var(--space-3)] border border-[rgba(207,34,46,0.4)] rounded-[var(--radius-md)] bg-[var(--danger-soft)] text-[var(--font-size-sm)] [&>summary]:cursor-pointer [&>summary]:text-[var(--danger)] [&>summary]:font-semibold [&>ul]:mt-[var(--space-2)] [&>ul]:mb-0 [&>ul]:pl-[20px] [&>ul>li]:mb-[var(--space-1)]">
      <summary>⚠ {staleFeeds.length} 件の収集に問題があります</summary>
      <ul>
        {staleFeeds.map((f) => (
          <li key={f.id}>
            <strong>{f.name}</strong>
            {f.last_status === "error" ? " · error" : " · stale"}
            {f.last_fetched_at ? ` · ${formatRelative(f.last_fetched_at)}` : " · 未取得"}
            {f.last_error && (
              <div className="text-[var(--fg-muted)] [font-family:ui-monospace,SFMono-Regular,monospace] text-[var(--font-size-xs)] mt-[2px]">
                {f.last_error}
              </div>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
