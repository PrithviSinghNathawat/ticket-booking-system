"use client";

import { useEffect, useMemo, useState } from "react";
import { SeatMap } from "@/components/SeatMap";
import type { SeatMapSeat } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { Notice } from "@/components/ui/Notice";
import { EmptyState } from "@/components/ui/EmptyState";
import { ListSkeleton } from "@/components/ui/Skeleton";

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

      <Card>
        <h2 className="mb-2 font-semibold">Existing venues</h2>
        {!venues ? (
          <ListSkeleton rows={2} />
        ) : venues.length === 0 ? (
          <EmptyState title="No venues yet" body="Create one below to start scheduling shows." />
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {venues.map((v) => (
              <li key={v.id} className="rounded-lg border border-[var(--border-subtle)] p-2">
                <p className="font-semibold">{v.name}</p>
                <p className="text-[var(--page-fg)]/70">{v.address}</p>
                <p className="text-xs text-[var(--page-fg)]/60">
                  {v.categories.map((c) => `${c.name} (${c.seatCount})`).join(" · ")}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <form onSubmit={handleCreate}>
        <Card className="flex flex-col gap-4">
          <h2 className="font-semibold">Create a venue</h2>

          <Input label="Venue name" type="text" value={name} onChange={(e) => setName(e.target.value)} required />
          <Input label="Address" type="text" value={address} onChange={(e) => setAddress(e.target.value)} required />

          <Input
            label="Categories (comma separated)"
            type="text"
            value={categoryNames.join(", ")}
            onChange={(e) => setCategoryNames(e.target.value.split(",").map((s) => s.trim()))}
          />

          <div>
            <p className="mb-2 text-sm font-medium">Rows</p>
            <div className="flex flex-col gap-2">
              {rows.map((row, i) => (
                <div key={i} className="flex flex-wrap items-end gap-2">
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="font-medium">Row label</span>
                    <input
                      type="text"
                      placeholder="e.g. A"
                      value={row.label}
                      onChange={(e) => updateRow(i, { label: e.target.value })}
                      className="w-28 rounded-lg border border-[var(--border-subtle)] bg-[var(--page-bg)] px-2 py-1.5 text-sm focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="font-medium">Seats</span>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={row.seatCount}
                      onChange={(e) => updateRow(i, { seatCount: Number(e.target.value) })}
                      className="w-24 rounded-lg border border-[var(--border-subtle)] bg-[var(--page-bg)] px-2 py-1.5 text-sm focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="font-medium">Category</span>
                    <select
                      value={row.categoryName}
                      onChange={(e) => updateRow(i, { categoryName: e.target.value })}
                      className="rounded-lg border border-[var(--border-subtle)] bg-[var(--page-bg)] px-2 py-1.5 text-sm focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
                    >
                      {categoryNames.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button type="button" variant="danger" onClick={() => removeRow(i)} className="px-3 py-1.5">
                    Remove
                  </Button>
                </div>
              ))}
              <Button type="button" variant="secondary" onClick={addRow} className="w-fit px-3 py-1.5">
                Add row
              </Button>
            </div>
          </div>

          {error && <Notice tone="error">{error}</Notice>}

          <Button type="submit" disabled={submitting} className="w-fit">
            {submitting ? "Creating..." : "Create venue"}
          </Button>
        </Card>
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
