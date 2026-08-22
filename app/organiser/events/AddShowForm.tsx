"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Venue = {
  id: string;
  name: string;
  categories: { id: string; name: string; seatCount: number }[];
};

export function AddShowForm({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [venueId, setVenueId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/venues")
      .then((res) => res.json())
      .then((body) => setVenues(body.venues ?? []));
  }, []);

  const selectedVenue = venues.find((v) => v.id === venueId);

  function handleVenueChange(id: string) {
    setVenueId(id);
    setPrices({});
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/events/${eventId}/shows`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venueId,
          startsAt: new Date(startsAt).toISOString(),
          prices: Object.entries(prices).map(([categoryId, price]) => ({
            categoryId,
            price: Number(price),
          })),
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Could not create show");
        return;
      }
      setStartsAt("");
      setPrices({});
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-lg border border-[var(--border-subtle)] p-3 text-sm">
      <h3 className="font-semibold">Add a show</h3>
      <select
        value={venueId}
        onChange={(e) => handleVenueChange(e.target.value)}
        required
        className="rounded border border-[var(--border-subtle)] px-2 py-1"
      >
        <option value="">Select venue</option>
        {venues.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name}
          </option>
        ))}
      </select>
      <input
        type="datetime-local"
        value={startsAt}
        onChange={(e) => setStartsAt(e.target.value)}
        required
        className="rounded border border-[var(--border-subtle)] px-2 py-1"
      />
      {selectedVenue && (
        <div className="flex flex-col gap-1">
          {selectedVenue.categories.map((c) => (
            <label key={c.id} className="flex items-center gap-2">
              <span className="w-24">{c.name}</span>
              <input
                type="number"
                min={0}
                step="0.01"
                placeholder="Price"
                value={prices[c.id] ?? ""}
                onChange={(e) => setPrices((prev) => ({ ...prev, [c.id]: e.target.value }))}
                required
                className="w-28 rounded border border-[var(--border-subtle)] px-2 py-1"
              />
            </label>
          ))}
        </div>
      )}
      {error && <p className="text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={submitting || !selectedVenue}
        className="w-fit rounded bg-[var(--accent)] px-3 py-1 font-semibold text-[var(--accent-fg)] disabled:opacity-50"
      >
        {submitting ? "Adding..." : "Add show"}
      </button>
    </form>
  );
}
