import Link from "next/link";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function BookingsPage() {
  const session = await getSession();

  if (!session || session.role !== "CUSTOMER") {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-xl font-semibold">Sign in as a customer to see your bookings</h1>
        <Link href="/login" className="rounded bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-fg)]">
          Log in
        </Link>
      </main>
    );
  }

  const bookings = await prisma.booking.findMany({
    where: { userId: session.userId },
    orderBy: { createdAt: "desc" },
    include: { show: { include: { event: true, venue: true } } },
  });

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <h1 className="text-2xl font-bold">Your bookings</h1>

      {bookings.length === 0 ? (
        <p className="text-[var(--page-fg)]/70">You haven&apos;t booked anything yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {bookings.map((b) => (
            <li key={b.id}>
              <Link
                href={`/bookings/${b.reference}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border-subtle)] p-4 hover:border-[var(--accent)]"
              >
                <div>
                  <p className="font-semibold">{b.show.event.title}</p>
                  <p className="text-sm text-[var(--page-fg)]/70">
                    {b.show.venue.name} ·{" "}
                    {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
                      b.show.startsAt
                    )}
                  </p>
                  <p className="text-xs text-[var(--page-fg)]/60">{b.reference}</p>
                </div>
                <span
                  className={`rounded px-2 py-1 text-xs font-semibold ${
                    b.status === "CONFIRMED" ? "bg-[var(--mine)] text-white" : "bg-[var(--booked)] text-white"
                  }`}
                >
                  {b.status}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
