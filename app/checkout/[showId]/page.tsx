import Link from "next/link";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CheckoutClient } from "./CheckoutClient";

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ showId: string }>;
}) {
  const { showId } = await params;
  const session = await getSession();

  if (!session) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-xl font-semibold">Sign in required</h1>
        <Link
          href={`/login?returnUrl=${encodeURIComponent(`/checkout/${showId}`)}`}
          className="rounded bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-fg)]"
        >
          Log in
        </Link>
      </main>
    );
  }

  if (session.role !== "CUSTOMER") {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-xl font-semibold">Customers only</h1>
        <p className="max-w-sm text-[var(--page-fg)]/70">
          Only customer accounts can hold and book seats.
        </p>
        <Link href={`/shows/${showId}`} className="rounded border border-[var(--border-subtle)] px-4 py-2 text-sm">
          Back to seat map
        </Link>
      </main>
    );
  }

  const user = await prisma.user.findUnique({ where: { id: session.userId } });

  return (
    <CheckoutClient
      showId={showId}
      defaultContactName={user?.name ?? ""}
      defaultContactEmail={user?.email ?? ""}
    />
  );
}
