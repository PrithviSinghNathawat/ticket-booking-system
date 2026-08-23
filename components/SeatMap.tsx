import type { SeatMapSeat } from "@/lib/types";

const STATUS_LABEL: Record<string, string> = {
  AVAILABLE: "available",
  HELD: "held by another customer",
  BOOKED: "booked",
  SELECTED: "selected by you",
  HELD_BY_YOU: "held by you",
};

const STATUS_GLYPH: Record<string, string> = {
  AVAILABLE: "",
  HELD: "•",
  BOOKED: "×",
  SELECTED: "✓",
  HELD_BY_YOU: "⏱︎",
};

function displayStatus(seat: SeatMapSeat, selected: boolean): keyof typeof STATUS_LABEL {
  if (seat.status === "AVAILABLE" && selected) return "SELECTED";
  return seat.status;
}

export function SeatMap({
  seats,
  selectedSeatIds,
  justLostSeatIds,
  onToggleSeat,
  selectionDisabledReason,
}: {
  seats: SeatMapSeat[];
  selectedSeatIds: Set<string>;
  justLostSeatIds: Set<string>;
  onToggleSeat: (seat: SeatMapSeat) => void;
  selectionDisabledReason?: string;
}) {
  const rows = new Map<string, SeatMapSeat[]>();
  for (const seat of seats) {
    const list = rows.get(seat.rowLabel) ?? [];
    list.push(seat);
    rows.set(seat.rowLabel, list);
  }

  return (
    <div className="overflow-x-auto rounded-xl bg-[var(--panel-dark)] p-6">
      <div className="mb-6 min-w-max text-center">
        <div className="mx-auto h-2 w-2/3 rounded-full bg-[var(--panel-dark-fg)]/20" />
        <p className="mt-1 text-xs tracking-widest text-[var(--panel-dark-fg)]/50">SCREEN / STAGE</p>
      </div>

      <div className="flex min-w-max flex-col gap-2">
        {Array.from(rows.entries()).map(([rowLabel, rowSeats]) => {
          const midpoint = Math.ceil(rowSeats.length / 2);
          const categoryName = rowSeats[0]?.categoryName ?? "";

          return (
            <div key={rowLabel} className="flex items-center gap-3">
              <span
                className="w-20 shrink-0 rounded px-2 py-1 text-center text-xs font-semibold"
                style={{
                  background: categoryName === "Premium" ? "var(--accent)" : "#4a5568",
                  color: categoryName === "Premium" ? "var(--accent-fg)" : "#fff",
                }}
              >
                {rowLabel} · {categoryName}
              </span>
              <div className="flex gap-1.5">
                {rowSeats.map((seat, index) => {
                  const selected = selectedSeatIds.has(seat.seatId);
                  const status = displayStatus(seat, selected);
                  const clickable = seat.status === "AVAILABLE" && !selectionDisabledReason;

                  return (
                    <div key={seat.seatId} className="flex items-center">
                      {index === midpoint && <div className="w-4" aria-hidden />}
                      <button
                        type="button"
                        className="seat-btn"
                        data-status={status}
                        data-just-lost={justLostSeatIds.has(seat.seatId) ? "true" : undefined}
                        disabled={!clickable}
                        title={
                          clickable
                            ? `Row ${rowLabel}, seat ${seat.seatNumber} · ${seat.categoryName} · ${seat.price}`
                            : seat.status === "AVAILABLE" && selectionDisabledReason
                              ? `Row ${rowLabel}, seat ${seat.seatNumber}: ${selectionDisabledReason}`
                              : `Row ${rowLabel}, seat ${seat.seatNumber}: ${STATUS_LABEL[status]}`
                        }
                        aria-label={`Row ${rowLabel}, seat ${seat.seatNumber}, ${seat.categoryName}, ${STATUS_LABEL[status]}`}
                        onClick={() => onToggleSeat(seat)}
                      >
                        {STATUS_GLYPH[status] || seat.seatNumber}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
