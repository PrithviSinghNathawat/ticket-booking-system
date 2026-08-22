"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type EventListItem = {
  eventId: string;
  title: string;
  type: "MOVIE" | "CONCERT";
  description: string;
  venueName: string;
  nextShowAt: string;
  priceMin: number | null;
  priceMax: number | null;
  soldOut: boolean;
  showCount: number;
};

export default function EventsPage() {
  const [type, setType] = useState("");
  const [date, setDate] = useState("");
  const [q, setQ] = useState("");
  const [events, setEvents] = useState<EventListItem[] | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    if (type) params.set("type", type);
    if (date) params.set("date", date);
    if (q) params.set("q", q);

    const controller = new AbortController();
    fetch(`/api/events?${params.toString()}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((body) => setEvents(body.events))
      .catch(() => {});

    return () => controller.abort();
  }, [type, date, q]);

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <h1 className="text-2xl font-bold">Browse events</h1>

      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search by title"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="rounded border border-[var(--border-subtle)] px-3 py-2 text-sm"
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="rounded border border-[var(--border-subtle)] px-3 py-2 text-sm"
        >
          <option value="">All types</option>
          <option value="MOVIE">Movies</option>
          <option value="CONCERT">Concerts</option>
        </select>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded border border-[var(--border-subtle)] px-3 py-2 text-sm"
        />
      </div>

      {!events ? (
        <p>Loading…</p>
      ) : events.length === 0 ? (
        <p className="text-[var(--page-fg)]/70">No events match those filters.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((event) => (
            <li key={event.eventId}>
              <Link
                href={`/events/${event.eventId}`}
                className="block rounded-xl border border-[var(--border-subtle)] p-4 hover:border-[var(--accent)]"
              >
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-semibold">{event.title}</h2>
                  {event.soldOut && (
                    <span className="rounded bg-[var(--booked)] px-2 py-0.5 text-xs font-semibold text-white">
                      SOLD OUT
                    </span>
                  )}
                </div>
                <p className="text-xs uppercase tracking-wide text-[var(--page-fg)]/60">{event.type}</p>
                <p className="mt-1 text-sm text-[var(--page-fg)]/70">{event.venueName}</p>
                <p className="text-sm text-[var(--page-fg)]/70">
                  Next:{" "}
                  {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
                    new Date(event.nextShowAt)
                  )}
                </p>
                {event.priceMin !== null && (
                  <p className="mt-1 text-sm font-medium">
                    {event.priceMin === event.priceMax
                      ? `${event.priceMin}`
                      : `${event.priceMin}–${event.priceMax}`}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
