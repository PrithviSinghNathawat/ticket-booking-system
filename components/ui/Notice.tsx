const tones = {
  error: "border-red-200 bg-red-50 text-red-800",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  success: "border-[var(--mine)]/30 bg-[var(--mine)]/10 text-[var(--mine)]",
  info: "border-[var(--border-subtle)] bg-[var(--border-subtle)]/20 text-[var(--page-fg)]",
} as const;

export function Notice({
  tone = "info",
  children,
}: {
  tone?: keyof typeof tones;
  children: React.ReactNode;
}) {
  return (
    <p role="status" className={`rounded-lg border px-3 py-2 text-sm ${tones[tone]}`}>
      {children}
    </p>
  );
}
