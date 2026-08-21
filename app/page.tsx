import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold">Ticket Booking</h1>
      <p className="text-zinc-600">Movies and concerts, seat by seat.</p>
      <Link
        href="/login"
        className="rounded bg-black px-4 py-2 text-white hover:bg-zinc-800"
      >
        Log in
      </Link>
    </main>
  );
}
