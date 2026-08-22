export function SeatLegend() {
  const items: { status: string; label: string; glyph: string }[] = [
    { status: "AVAILABLE", label: "Available", glyph: "" },
    { status: "HELD", label: "Held by others", glyph: "•" },
    { status: "BOOKED", label: "Booked", glyph: "×" },
    { status: "SELECTED", label: "Selected by you", glyph: "✓" },
    { status: "HELD_BY_YOU", label: "Held by you", glyph: "⏱" },
  ];

  return (
    <ul className="flex flex-wrap gap-4 text-xs text-[var(--panel-dark-fg)]">
      {items.map((item) => (
        <li key={item.status} className="flex items-center gap-1.5">
          <span className="seat-btn !h-5 !w-5 !text-[0.6rem]" data-status={item.status} aria-hidden>
            {item.glyph}
          </span>
          {item.label}
        </li>
      ))}
    </ul>
  );
}
