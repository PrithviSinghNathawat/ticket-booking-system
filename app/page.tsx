import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold">Ticket Booking</h1>
      <p className="text-[var(--page-fg)]/70">Movies and concerts, seat by seat.</p>
      <Link
        href="/events"
        className="rounded bg-[var(--accent)] px-4 py-2 font-semibold text-[var(--accent-fg)]"
      >
        Browse events
      </Link>
    </main>
  );
}
