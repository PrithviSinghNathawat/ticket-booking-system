"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSeatMapPolling } from "@/hooks/useSeatMapPolling";
import { CountdownTimer } from "@/components/CountdownTimer";
import { Button, LinkButton } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { Notice } from "@/components/ui/Notice";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";

export function CheckoutClient({
  showId,
  defaultContactName,
  defaultContactEmail,
}: {
  showId: string;
  defaultContactName: string;
  defaultContactEmail: string;
}) {
  const router = useRouter();
  const { data, refetchNow } = useSeatMapPolling(showId);

  const [contactName, setContactName] = useState(defaultContactName);
  const [contactEmail, setContactEmail] = useState(defaultContactEmail);
  const [contactPhone, setContactPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mySeats = useMemo(() => data?.seats.filter((s) => s.mine) ?? [], [data]);
  const priceByCategoryId = useMemo(
    () => new Map((data?.prices ?? []).map((p) => [p.categoryId, p])),
    [data]
  );

  if (!data) {
    return (
      <main className="flex flex-1 flex-col gap-6 p-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-40 w-full max-w-md" />
        <Skeleton className="h-64 w-full max-w-sm" />
      </main>
    );
  }

  if (mySeats.length === 0) {
    return (
      <main className="flex flex-1 items-center justify-center p-8">
        <EmptyState
          title="No active hold on this show"
          body="Your seat hold has expired or been released. Head back to the seat map to select seats again."
          action={<LinkButton href={`/shows/${showId}`}>Back to seat map</LinkButton>}
        />
      </main>
    );
  }

  const breakdown = new Map<string, { categoryName: string; price: number; count: number }>();
  for (const seat of mySeats) {
    const priceInfo = priceByCategoryId.get(seat.categoryId);
    const price = priceInfo ? Number(priceInfo.price) : 0;
    const existing = breakdown.get(seat.categoryId);
    if (existing) existing.count += 1;
    else breakdown.set(seat.categoryId, { categoryName: seat.categoryName, price, count: 1 });
  }
  const total = Array.from(breakdown.values()).reduce((sum, b) => sum + b.price * b.count, 0);
  const expiresAt = mySeats[0].expiresAt!;

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ showId, contactName, contactEmail, contactPhone }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Could not confirm booking");
        setSubmitting(false);
        refetchNow();
        return;
      }
      router.push(`/bookings/${body.reference}`);
    } catch {
      setError("Could not confirm booking. Please try again.");
      setSubmitting(false);
    }
  }

  async function handleRelease() {
    setReleasing(true);
    try {
      await fetch(`/api/shows/${showId}/holds`, { method: "DELETE" });
    } finally {
      setReleasing(false);
      refetchNow();
    }
  }

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <h1 className="text-2xl font-bold">Checkout</h1>
      <p className="text-sm text-[var(--page-fg)]/70">
        {data.show.title} · {data.show.venueName} ·{" "}
        {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
          new Date(data.show.startsAt)
        )}
      </p>

      <Card className="max-w-md">
        <h2 className="mb-2 font-semibold">Your seats</h2>
        <ul className="mb-3 text-sm">
          {mySeats.map((s) => (
            <li key={s.seatId}>
              {s.rowLabel}
              {s.seatNumber} · {s.categoryName}
            </li>
          ))}
        </ul>
        {Array.from(breakdown.values()).map((b) => (
          <p key={b.categoryName} className="text-sm">
            {b.count} × {b.categoryName} @ {b.price} = {b.price * b.count}
          </p>
        ))}
        <p className="mt-2 font-semibold">Total: {total}</p>
        <p className="mt-2 text-sm">
          Time remaining: <CountdownTimer expiresAt={expiresAt} serverNow={data.serverNow} onExpire={refetchNow} />
        </p>
        <Button variant="secondary" onClick={handleRelease} disabled={releasing} className="mt-3">
          Release my seats
        </Button>
      </Card>

      <form onSubmit={handleConfirm} className="max-w-sm">
        <Card className="flex flex-col gap-3">
          <h2 className="font-semibold">Contact details</h2>
          <Input
            label="Name on ticket"
            type="text"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            required
          />
          <Input
            label="Contact email"
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            required
          />
          <Input
            label="Contact phone"
            type="tel"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            required
          />
          {error && <Notice tone="error">{error}</Notice>}
          <Button type="submit" disabled={submitting}>
            {submitting ? "Confirming..." : "Confirm booking"}
          </Button>
        </Card>
      </form>
    </main>
  );
}
