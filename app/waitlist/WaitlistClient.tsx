"use client";

import { useEffect, useState, useCallback } from "react";
import { CountdownTimer } from "@/components/CountdownTimer";
import { Button, LinkButton } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ListSkeleton } from "@/components/ui/Skeleton";

type WaitlistEntry = {
  id: string;
  showId: string;
  eventTitle: string;
  venueName: string;
  startsAt: string;
  categoryId: string;
  categoryName: string;
  status: "WAITING" | "OFFERED";
  position: number | null;
  offer: { token: string; expiresAt: string; rowLabel: string; seatNumber: number } | null;
};

export function WaitlistClient() {
  const [entries, setEntries] = useState<WaitlistEntry[] | null>(null);
  const [serverNow, setServerNow] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/waitlist/me")
      .then((res) => res.json())
      .then((body) => {
        setEntries(body.entries);
        setServerNow(body.serverNow);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleLeave(showId: string, categoryId: string) {
    await fetch(`/api/shows/${showId}/waitlist?categoryId=${encodeURIComponent(categoryId)}`, {
      method: "DELETE",
    });
    load();
  }

  if (!entries) {
    return (
      <main className="flex flex-1 flex-col gap-6 p-6">
        <h1 className="text-2xl font-bold">Your waitlist</h1>
        <ListSkeleton rows={2} />
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <h1 className="text-2xl font-bold">Your waitlist</h1>

      {entries.length === 0 ? (
        <EmptyState
          title="You're not waiting for anything right now"
          body="Sold-out shows offer a waitlist. Join one from its seat map and you'll see it here."
          action={<LinkButton href="/events">Browse events</LinkButton>}
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {entries.map((entry) => (
            <li key={entry.id} className="rounded-xl border border-[var(--border-subtle)] p-4">
              <p className="font-semibold">{entry.eventTitle}</p>
              <p className="text-sm text-[var(--page-fg)]/70">
                {entry.venueName} ·{" "}
                {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
                  new Date(entry.startsAt)
                )}
              </p>
              <p className="mt-1 text-sm">{entry.categoryName}</p>

              {entry.status === "WAITING" && (
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <span className="rounded bg-[var(--held)] px-2 py-0.5 text-xs font-semibold text-white">
                    Position {entry.position}
                  </span>
                  <Button variant="secondary" onClick={() => handleLeave(entry.showId, entry.categoryId)} className="px-3 py-1">
                    Leave waitlist
                  </Button>
                </div>
              )}

              {entry.status === "OFFERED" && entry.offer && serverNow && (
                <div className="mt-2 flex flex-wrap items-center gap-3 rounded-lg bg-[var(--mine)]/10 p-3">
                  <span className="rounded bg-[var(--mine)] px-2 py-0.5 text-xs font-semibold text-white">
                    Seat offered: {entry.offer.rowLabel}
                    {entry.offer.seatNumber}
                  </span>
                  <span className="text-sm">
                    Claim within <CountdownTimer expiresAt={entry.offer.expiresAt} serverNow={serverNow} onExpire={load} />
                  </span>
                  <LinkButton href={`/waitlist/claim/${entry.offer.token}`} className="px-3 py-1">
                    Claim seat
                  </LinkButton>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
