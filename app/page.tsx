import Link from "next/link";
import { LinkButton } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ENABLE_DEMO_ROUTES, DEMO_RESET_ENABLED } from "@/lib/config";
import { prisma } from "@/lib/prisma";
import { activeAllocationWhere } from "@/lib/allocations";
import { OneClickSignIn, ResetDemoDataButton } from "./LandingClient";

const REPO_URL = "https://github.com/PrithviSinghNathawat/ticket-booking-system";

async function findShowcaseShows() {
  const now = new Date();
  const shows = await prisma.show.findMany({
    where: { event: { NOT: { title: { endsWith: "(internal)" } } } },
    orderBy: { startsAt: "asc" },
    include: {
      event: true,
      venue: { include: { seats: { select: { id: true } } } },
      allocations: { where: activeAllocationWhere(now) },
    },
  });

  let bookable: (typeof shows)[number] | null = null;
  let soldOut: (typeof shows)[number] | null = null;

  for (const show of shows) {
    const total = show.venue.seats.length;
    const active = show.allocations.length;
    const isSoldOut = total > 0 && active >= total;
    if (isSoldOut && !soldOut) soldOut = show;
    if (!isSoldOut && !bookable) bookable = show;
    if (bookable && soldOut) break;
  }

  return { bookable, soldOut };
}

export default async function Home() {
  const { bookable, soldOut } = await findShowcaseShows();

  return (
    <main className="flex flex-1 flex-col gap-8 p-6">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Ticket Booking</h1>
          <p className="mt-2 text-[var(--page-fg)]/70">
            A movies-and-concerts booking platform where two customers racing for the same seat get
            one winner and one honest rejection, never a double-booked seat.
          </p>
        </div>

        <Card className="flex flex-col gap-3">
          <h2 className="font-semibold">Sign in</h2>
          <p className="text-sm text-[var(--page-fg)]/70">
            One click, no password to copy. Each account is seeded and safe to use.
          </p>
          <OneClickSignIn />
        </Card>

        <Card className="flex flex-col gap-3">
          <h2 className="font-semibold">Explore</h2>
          <div className="flex flex-col gap-2">
            {bookable && (
              <Link href={`/shows/${bookable.id}`} className="hover:underline">
                Book a seat — {bookable.event.title}
              </Link>
            )}
            {soldOut && (
              <Link href={`/shows/${soldOut.id}`} className="hover:underline">
                A sold-out show and its waitlist — {soldOut.event.title}
              </Link>
            )}
            {ENABLE_DEMO_ROUTES && (
              <Link href="/demo" className="hover:underline">
                /demo — live concurrency race and waitlist cascade
              </Link>
            )}
            <Link href={REPO_URL} className="hover:underline">
              README on GitHub
            </Link>
            <Link href={`${REPO_URL}/blob/main/DESIGN.md`} className="hover:underline">
              DESIGN.md
            </Link>
            <Link href="/api/health" className="hover:underline">
              /api/health
            </Link>
          </div>
        </Card>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <LinkButton href="/events">Browse all events</LinkButton>
          {DEMO_RESET_ENABLED && <ResetDemoDataButton />}
        </div>
      </div>
    </main>
  );
}
