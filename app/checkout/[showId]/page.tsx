import Link from "next/link";

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ showId: string }>;
}) {
  const { showId } = await params;

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-xl font-semibold">Checkout</h1>
      <p className="max-w-sm text-[var(--page-fg)]/70">
        Booking confirmation, payment summary, and your ticket QR code land here in the next phase.
      </p>
      <Link href={`/shows/${showId}`} className="rounded border border-[var(--border-subtle)] px-4 py-2 text-sm">
        Back to seat map
      </Link>
    </main>
  );
}
