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

/** Splits a row into (narrow side, wide centre, narrow side) blocks, like a real auditorium aisle layout. */
function splitRow<T>(rowSeats: T[]): [T[], T[], T[]] {
  const n = rowSeats.length;
  const sideSize = n >= 8 ? 2 : n >= 5 ? 1 : 0;
  return [rowSeats.slice(0, sideSize), rowSeats.slice(sideSize, n - sideSize), rowSeats.slice(n - sideSize)];
}

function SeatButton({
  seat,
  rowLabel,
  status,
  clickable,
  justLost,
  selectionDisabledReason,
  onToggleSeat,
}: {
  seat: SeatMapSeat;
  rowLabel: string;
  status: keyof typeof STATUS_LABEL;
  clickable: boolean;
  justLost: boolean;
  selectionDisabledReason?: string;
  onToggleSeat: (seat: SeatMapSeat) => void;
}) {
  return (
    <button
      type="button"
      className="seat-btn"
      data-status={status}
      data-just-lost={justLost ? "true" : undefined}
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
  );
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
  const rowEntries = Array.from(rows.entries());
  const centreIndex = (rowEntries.length - 1) / 2;

  return (
    <div className="overflow-x-auto rounded-xl bg-[var(--panel-dark)] p-6">
      <div className="mx-auto flex w-fit flex-col items-center gap-2">
        <div className="mb-4 w-full text-center">
          <div className="mx-auto h-2 w-full rounded-full bg-[var(--panel-dark-fg)]/20" />
          <p className="mt-1 text-xs tracking-widest text-[var(--panel-dark-fg)]/50">SCREEN / STAGE</p>
        </div>

        {rowEntries.map(([rowLabel, rowSeats], rowIndex) => {
          const categoryName = rowSeats[0]?.categoryName ?? "";
          const [left, centre, right] = splitRow(rowSeats);
          const arcOffset = Math.round(Math.abs(rowIndex - centreIndex) * 1.5);

          const renderSeat = (seat: SeatMapSeat) => {
            const selected = selectedSeatIds.has(seat.seatId);
            const status = displayStatus(seat, selected);
            const clickable = seat.status === "AVAILABLE" && !selectionDisabledReason;
            return (
              <SeatButton
                key={seat.seatId}
                seat={seat}
                rowLabel={rowLabel}
                status={status}
                clickable={clickable}
                justLost={justLostSeatIds.has(seat.seatId)}
                selectionDisabledReason={selectionDisabledReason}
                onToggleSeat={onToggleSeat}
              />
            );
          };

          return (
            <div
              key={rowLabel}
              className="flex items-center gap-3"
              style={{ transform: `translateY(${arcOffset}px)` }}
            >
              <span
                className="w-20 shrink-0 rounded px-2 py-1 text-center text-xs font-semibold"
                style={{
                  background: categoryName === "Premium" ? "var(--accent)" : "#4a5568",
                  color: categoryName === "Premium" ? "var(--accent-fg)" : "#fff",
                }}
              >
                {rowLabel} · {categoryName}
              </span>

              <div className="flex items-center gap-3">
                {left.length > 0 && (
                  <>
                    <div className="flex gap-1.5">{left.map(renderSeat)}</div>
                    <div className="w-3" aria-hidden />
                  </>
                )}
                <div className="flex gap-1.5">{centre.map(renderSeat)}</div>
                {right.length > 0 && (
                  <>
                    <div className="w-3" aria-hidden />
                    <div className="flex gap-1.5">{right.map(renderSeat)}</div>
                  </>
                )}
              </div>

              <span
                className="w-8 shrink-0 rounded px-1 py-1 text-center text-xs font-semibold text-[var(--panel-dark-fg)]/60"
                aria-hidden
              >
                {rowLabel}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
