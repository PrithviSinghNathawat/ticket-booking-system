export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-[var(--border-subtle)] p-10 text-center">
      <p className="font-semibold">{title}</p>
      {body && <p className="max-w-sm text-sm text-[var(--page-fg)]/70">{body}</p>}
      {action}
    </div>
  );
}
