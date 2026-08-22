"use client";

import { useEffect, useMemo, useState } from "react";
import { SeatMap } from "@/components/SeatMap";
import type { SeatMapSeat } from "@/lib/types";

type Venue = {
  id: string;
  name: string;
  address: string;
  categories: { id: string; name: string; seatCount: number }[];
};

type RowDraft = { label: string; seatCount: number; categoryName: string };

export function AdminVenuesClient() {
  const [venues, setVenues] = useState<Venue[] | null>(null);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [categoryNames, setCategoryNames] = useState<string[]>(["Premium", "Standard"]);
  const [rows, setRows] = useState<RowDraft[]>([{ label: "A", seatCount: 10, categoryName: "Premium" }]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function load() {
    fetch("/api/venues")
      .then((res) => res.json())
      .then((body) => setVenues(body.venues))
      .catch(() => {});
  }

  useEffect(() => {
    load();
  }, []);

  const previewSeats: SeatMapSeat[] = useMemo(() => {
    const seats: SeatMapSeat[] = [];
    for (const row of rows) {
      for (let seatNumber = 1; seatNumber <= row.seatCount; seatNumber++) {
        seats.push({
          seatId: `${row.label}-${seatNumber}`,
          rowLabel: row.label,
          seatNumber,
          categoryId: row.categoryName,
          categoryName: row.categoryName,
          price: null,
          status: "AVAILABLE",
          expiresAt: null,
          mine: false,
        });
      }
    }
    return seats;
  }, [rows]);

  function updateRow(index: number, patch: Partial<RowDraft>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((prev) => [
      ...prev,
      { label: "", seatCount: 10, categoryName: categoryNames[0] ?? "" },
    ]);
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/venues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          address,
          categories: categoryNames.filter((c) => c.trim().length > 0).map((c) => ({ name: c })),
          rows: rows.map((r) => ({ label: r.label, seatCount: r.seatCount, categoryName: r.categoryName })),
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Could not create venue");
        return;
      }
      setName("");
      setAddress("");
      setRows([{ label: "A", seatCount: 10, categoryName: categoryNames[0] ?? "" }]);
      load();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <h1 className="text-2xl font-bold">Venues</h1>

      <div className="rounded-xl border border-[var(--border-subtle)] p-4">
        <h2 className="mb-2 font-semibold">Existing venues</h2>
        {!venues ? (
          <p>Loading...</p>
        ) : venues.length === 0 ? (
          <p className="text-[var(--page-fg)]/70">No venues yet.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {venues.map((v) => (
              <li key={v.id} className="rounded border border-[var(--border-subtle)] p-2">
                <p className="font-semibold">{v.name}</p>
                <p className="text-[var(--page-fg)]/70">{v.address}</p>
                <p className="text-xs text-[var(--page-fg)]/60">
                  {v.categories.map((c) => `${c.name} (${c.seatCount})`).join(" · ")}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <form onSubmit={handleCreate} className="flex flex-col gap-4 rounded-xl border border-[var(--border-subtle)] p-4">
        <h2 className="font-semibold">Create a venue</h2>

        <input
          type="text"
          placeholder="Venue name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="rounded border border-[var(--border-subtle)] px-3 py-2 text-sm"
        />
        <input
          type="text"
          placeholder="Address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          required
          className="rounded border border-[var(--border-subtle)] px-3 py-2 text-sm"
        />

        <div>
          <label className="mb-1 block text-sm font-semibold">Categories (comma separated)</label>
          <input
            type="text"
            value={categoryNames.join(", ")}
            onChange={(e) => setCategoryNames(e.target.value.split(",").map((s) => s.trim()))}
            className="w-full rounded border border-[var(--border-subtle)] px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-semibold">Rows</label>
          <div className="flex flex-col gap-2">
            {rows.map((row, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  placeholder="Row label (e.g. A)"
                  value={row.label}
                  onChange={(e) => updateRow(i, { label: e.target.value })}
                  className="w-28 rounded border border-[var(--border-subtle)] px-2 py-1 text-sm"
                />
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={row.seatCount}
                  onChange={(e) => updateRow(i, { seatCount: Number(e.target.value) })}
                  className="w-24 rounded border border-[var(--border-subtle)] px-2 py-1 text-sm"
                />
                <select
                  value={row.categoryName}
                  onChange={(e) => updateRow(i, { categoryName: e.target.value })}
                  className="rounded border border-[var(--border-subtle)] px-2 py-1 text-sm"
                >
                  {categoryNames.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={() => removeRow(i)} className="text-sm text-red-600">
                  Remove
                </button>
              </div>
            ))}
            <button type="button" onClick={addRow} className="w-fit rounded border border-[var(--border-subtle)] px-3 py-1 text-sm">
              + Add row
            </button>
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-fit rounded bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-fg)] disabled:opacity-50"
        >
          {submitting ? "Creating..." : "Create venue"}
        </button>
      </form>

      <div>
        <h2 className="mb-2 font-semibold">Live preview</h2>
        <SeatMap
          seats={previewSeats}
          selectedSeatIds={new Set()}
          justLostSeatIds={new Set()}
          onToggleSeat={() => {}}
        />
      </div>
    </main>
  );
}
