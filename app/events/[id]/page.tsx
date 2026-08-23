import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { activeAllocationWhere } from "@/lib/allocations";
import { LinkButton } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const now = new Date();

  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      shows: {
        orderBy: { startsAt: "asc" },
        include: {
          venue: { include: { seats: { select: { id: true } } } },
          prices: { include: { category: true } },
          allocations: { where: activeAllocationWhere(now) },
        },
      },
    },
  });

  if (!event) notFound();

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <p className="text-xs uppercase tracking-wide text-[var(--page-fg)]/60">{event.type}</p>
        <h1 className="text-2xl font-bold">{event.title}</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--page-fg)]/70">{event.description}</p>
      </div>

      {event.shows.length === 0 && (
        <EmptyState title="No showtimes scheduled yet" body="Check back soon, or browse other events." />
      )}

      <ul className="flex flex-col gap-3">
        {event.shows.map((show) => {
          const totalSeats = show.venue.seats.length;
          const activeCount = show.allocations.length;
          const soldOut = totalSeats > 0 && activeCount >= totalSeats;

          return (
            <li key={show.id}>
              <Card className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">
                    {new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeStyle: "short" }).format(
                      show.startsAt
                    )}
                  </p>
                  <p className="text-sm text-[var(--page-fg)]/70">{show.venue.name}</p>
                  <p className="text-sm text-[var(--page-fg)]/70">
                    {show.prices
                      .map((p) => `${p.category.name}: ${p.price}`)
                      .join(" · ")}
                  </p>
                </div>
                {soldOut ? (
                  <LinkButton href={`/shows/${show.id}`} variant="secondary" className="gap-2">
                    <span className="rounded bg-[var(--booked)] px-2 py-0.5 text-xs text-white">SOLD OUT</span>
                    Join waitlist
                  </LinkButton>
                ) : (
                  <LinkButton href={`/shows/${show.id}`}>View seat map</LinkButton>
                )}
              </Card>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
