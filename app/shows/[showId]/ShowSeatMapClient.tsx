"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSeatMapPolling } from "@/hooks/useSeatMapPolling";
import { SeatMap } from "@/components/SeatMap";
import { SeatLegend } from "@/components/SeatLegend";
import { CountdownTimer } from "@/components/CountdownTimer";
import { MAX_HOLD_SEATS_PER_REQUEST } from "@/lib/config";
import type { SeatMapSeat } from "@/lib/types";

type MyWaitlistEntry = {
  showId: string;
  categoryId: string;
  status: "WAITING" | "OFFERED";
  position: number | null;
  offer: { token: string; expiresAt: string; rowLabel: string; seatNumber: number } | null;
};

export function ShowSeatMapClient({
  showId,
  isAuthenticated,
  canHold,
}: {
  showId: string;
  isAuthenticated: boolean;
  canHold: boolean;
}) {
  const router = useRouter();
  const { data, reconnecting, refetchNow } = useSeatMapPolling(showId);

  const [selectedSeatIds, setSelectedSeatIds] = useState<Set<string>>(new Set());
  const [justLostSeatIds, setJustLostSeatIds] = useState<Set<string>>(new Set());
  const [lostNotice, setLostNotice] = useState<string | null>(null);
  const [holdError, setHoldError] = useState<string | null>(null);
  const [capNotice, setCapNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const prevSeatsRef = useRef<Map<string, SeatMapSeat> | null>(null);

  const mySeats = useMemo(() => data?.seats.filter((s) => s.mine) ?? [], [data]);
  const activeHold =
    mySeats.length > 0 ? { seatIds: mySeats.map((s) => s.seatId), expiresAt: mySeats[0].expiresAt! } : null;

  const [myWaitlist, setMyWaitlist] = useState<MyWaitlistEntry[]>([]);
  const [waitlistBusy, setWaitlistBusy] = useState<string | null>(null);

  const loadMyWaitlist = useCallback(() => {
    if (!isAuthenticated || !canHold) return;
    fetch("/api/waitlist/me")
      .then((res) => res.json())
      .then((body) => {
        setMyWaitlist((body.entries ?? []).filter((e: MyWaitlistEntry) => e.showId === showId));
      })
      .catch(() => {});
  }, [isAuthenticated, canHold, showId]);

  useEffect(() => {
    fetch(`/api/shows/${showId}/waitlist/process`, { method: "POST" }).catch(() => {});
    loadMyWaitlist();
  }, [showId, loadMyWaitlist]);

  useEffect(() => {
    if (!data) return;
    const currentSeatsById = new Map(data.seats.map((s) => [s.seatId, s]));

    if (prevSeatsRef.current) {
      const lostNow: string[] = [];
      setSelectedSeatIds((prevSelected) => {
        const next = new Set(prevSelected);
        for (const seatId of prevSelected) {
          const seat = currentSeatsById.get(seatId);
          if (!seat || (seat.status !== "AVAILABLE" && !seat.mine)) {
            next.delete(seatId);
            lostNow.push(seatId);
          }
        }
        return next;
      });

      if (lostNow.length > 0) {
        const labels = lostNow
          .map((id) => currentSeatsById.get(id))
          .filter((s): s is SeatMapSeat => !!s)
          .map((s) => `${s.rowLabel}${s.seatNumber}`)
          .join(", ");
        setLostNotice(
          `Seat${lostNow.length > 1 ? "s" : ""} ${labels} ${lostNow.length > 1 ? "were" : "was"} just taken by another customer.`
        );
        setJustLostSeatIds(new Set(lostNow));
        const timeout = setTimeout(() => setJustLostSeatIds(new Set()), 3000);
        return () => clearTimeout(timeout);
      }
    }

    prevSeatsRef.current = currentSeatsById;
  }, [data]);

  function toggleSeat(seat: SeatMapSeat) {
    if (!isAuthenticated) {
      router.push(`/login?returnUrl=${encodeURIComponent(`/shows/${showId}`)}`);
      return;
    }
    if (!canHold || activeHold || seat.status !== "AVAILABLE") return;

    setCapNotice(null);
    setSelectedSeatIds((prev) => {
      const next = new Set(prev);
      if (next.has(seat.seatId)) {
        next.delete(seat.seatId);
        return next;
      }
      if (next.size >= MAX_HOLD_SEATS_PER_REQUEST) {
        setCapNotice(`You can hold at most ${MAX_HOLD_SEATS_PER_REQUEST} seats per request.`);
        return prev;
      }
      next.add(seat.seatId);
      return next;
    });
  }

  async function handleHold() {
    setHoldError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/shows/${showId}/holds`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seatIds: Array.from(selectedSeatIds) }),
      });
      const body = await res.json();
      if (!res.ok) {
        setHoldError(body.error ?? "Could not hold those seats");
      } else {
        setSelectedSeatIds(new Set());
      }
    } finally {
      setBusy(false);
      refetchNow();
    }
  }

  async function handleRelease() {
    setBusy(true);
    try {
      await fetch(`/api/shows/${showId}/holds`, { method: "DELETE" });
    } finally {
      setBusy(false);
      refetchNow();
    }
  }

  async function handleJoinWaitlist(categoryId: string) {
    setWaitlistBusy(categoryId);
    try {
      await fetch(`/api/shows/${showId}/waitlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId }),
      });
    } finally {
      setWaitlistBusy(null);
      loadMyWaitlist();
    }
  }

  async function handleLeaveWaitlist(categoryId: string) {
    setWaitlistBusy(categoryId);
    try {
      await fetch(`/api/shows/${showId}/waitlist?categoryId=${encodeURIComponent(categoryId)}`, {
        method: "DELETE",
      });
    } finally {
      setWaitlistBusy(null);
      loadMyWaitlist();
    }
  }

  if (!data) {
    return <main className="flex-1 p-8">Loading seat map...</main>;
  }

  const priceByCategoryId = new Map(data.prices.map((p) => [p.categoryId, p]));
  const selectionBreakdown = new Map<string, { categoryName: string; price: number; count: number }>();
  for (const seatId of selectedSeatIds) {
    const seat = data.seats.find((s) => s.seatId === seatId);
    if (!seat) continue;
    const priceInfo = priceByCategoryId.get(seat.categoryId);
    const price = priceInfo ? Number(priceInfo.price) : 0;
    const existing = selectionBreakdown.get(seat.categoryId);
    if (existing) existing.count += 1;
    else selectionBreakdown.set(seat.categoryId, { categoryName: seat.categoryName, price, count: 1 });
  }
  const runningTotal = Array.from(selectionBreakdown.values()).reduce(
    (sum, b) => sum + b.price * b.count,
    0
  );

  const waitlistByCategory = new Map(myWaitlist.map((e) => [e.categoryId, e]));
  const categorySoldOut = new Map<string, boolean>();
  for (const price of data.prices) {
    const seatsInCategory = data.seats.filter((s) => s.categoryId === price.categoryId);
    const soldOut = seatsInCategory.length > 0 && seatsInCategory.every((s) => s.status !== "AVAILABLE");
    categorySoldOut.set(price.categoryId, soldOut);
  }

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">{data.show.title}</h1>
          <p className="text-sm text-[var(--page-fg)]/70">
            {data.show.venueName} · {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(data.show.startsAt))}
          </p>
        </div>
        {reconnecting && (
          <span className="rounded bg-amber-100 px-2 py-1 text-xs text-amber-800">Reconnecting…</span>
        )}
      </div>

      <SeatLegend />

      <SeatMap
        seats={data.seats}
        selectedSeatIds={selectedSeatIds}
        justLostSeatIds={justLostSeatIds}
        onToggleSeat={toggleSeat}
        selectionDisabledReason={
          activeHold
            ? `you already hold ${activeHold.seatIds.length} seat${activeHold.seatIds.length > 1 ? "s" : ""} on this show; release them to choose different ones`
            : undefined
        }
      />

      {canHold && (
        <div className="flex flex-col gap-2">
          {data.prices
            .filter((p) => categorySoldOut.get(p.categoryId))
            .map((p) => {
              const entry = waitlistByCategory.get(p.categoryId);
              return (
                <div
                  key={p.categoryId}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--border-subtle)] p-3 text-sm"
                >
                  <span className="font-semibold">{p.categoryName} is sold out</span>
                  {!entry && (
                    <button
                      onClick={() => handleJoinWaitlist(p.categoryId)}
                      disabled={waitlistBusy === p.categoryId}
                      className="rounded bg-[var(--accent)] px-3 py-1 font-semibold text-[var(--accent-fg)] disabled:opacity-50"
                    >
                      Join waitlist
                    </button>
                  )}
                  {entry?.status === "WAITING" && (
                    <>
                      <span className="rounded bg-[var(--held)] px-2 py-0.5 text-xs font-semibold text-white">
                        Position {entry.position}
                      </span>
                      <button
                        onClick={() => handleLeaveWaitlist(p.categoryId)}
                        disabled={waitlistBusy === p.categoryId}
                        className="rounded border border-[var(--border-subtle)] px-3 py-1 disabled:opacity-50"
                      >
                        Leave waitlist
                      </button>
                    </>
                  )}
                  {entry?.status === "OFFERED" && entry.offer && (
                    <>
                      <span className="rounded bg-[var(--mine)] px-2 py-0.5 text-xs font-semibold text-white">
                        Seat offered: {entry.offer.rowLabel}
                        {entry.offer.seatNumber}
                      </span>
                      <CountdownTimer
                        expiresAt={entry.offer.expiresAt}
                        serverNow={data.serverNow}
                        onExpire={loadMyWaitlist}
                      />
                      <Link
                        href={`/waitlist/claim/${entry.offer.token}`}
                        className="rounded bg-[var(--accent)] px-3 py-1 font-semibold text-[var(--accent-fg)]"
                      >
                        Claim seat
                      </Link>
                    </>
                  )}
                </div>
              );
            })}
        </div>
      )}

      {lostNotice && (
        <p role="status" className="rounded bg-red-50 px-3 py-2 text-sm text-red-800">
          {lostNotice}
        </p>
      )}
      {capNotice && (
        <p role="status" className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {capNotice}
        </p>
      )}

      {activeHold ? (
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-[var(--mine)] bg-[var(--mine)]/10 p-4">
          <div>
            <p className="font-semibold">
              You hold {activeHold.seatIds.length} seat{activeHold.seatIds.length > 1 ? "s" : ""} on this
              show
            </p>
            <p className="text-sm text-[var(--page-fg)]/70">
              Time remaining:{" "}
              <CountdownTimer expiresAt={activeHold.expiresAt} serverNow={data.serverNow} onExpire={refetchNow} />
            </p>
          </div>
          <button
            onClick={handleRelease}
            disabled={busy}
            className="rounded border border-[var(--border-subtle)] px-4 py-2 text-sm disabled:opacity-50"
          >
            Release my seats
          </button>
          <button
            onClick={() => router.push(`/checkout/${showId}`)}
            className="rounded bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-fg)]"
          >
            Continue to checkout
          </button>
        </div>
      ) : (
        selectedSeatIds.size > 0 && (
          <div className="flex flex-wrap items-center gap-4 rounded-xl border border-[var(--border-subtle)] p-4">
            <div className="text-sm">
              {Array.from(selectionBreakdown.values()).map((b) => (
                <p key={b.categoryName}>
                  {b.count} × {b.categoryName} @ {b.price} = {b.price * b.count}
                </p>
              ))}
              <p className="font-semibold">Total: {runningTotal}</p>
            </div>
            {holdError && <p className="text-sm text-red-600">{holdError}</p>}
            <button
              onClick={handleHold}
              disabled={busy || !canHold}
              className="rounded bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-fg)] disabled:opacity-50"
            >
              Hold {selectedSeatIds.size} seat{selectedSeatIds.size > 1 ? "s" : ""}
            </button>
          </div>
        )
      )}
    </main>
  );
}
