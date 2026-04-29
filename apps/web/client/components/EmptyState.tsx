interface Props {
  icon: string;
  title: string;
  body: string;
}

export function EmptyState({ icon, title, body }: Props) {
  return (
    <div className="text-center text-[var(--fg-muted)] py-[var(--space-8)] px-[var(--space-3)] border border-dashed border-[var(--border-subtle)] rounded-[var(--radius-lg)] mt-[var(--space-4)] text-[var(--font-size-base)] leading-[var(--line-height-relaxed)]">
      <span className="text-[2.5rem] block mb-[var(--space-3)] leading-none" aria-hidden="true">{icon}</span>
      <div className="text-[var(--font-size-md)] font-semibold text-[var(--fg-secondary)] mb-[var(--space-1)]">
        {title}
      </div>
      <div className="text-[var(--font-size-sm)] text-[var(--fg-muted)]">{body}</div>
    </div>
  );
}
