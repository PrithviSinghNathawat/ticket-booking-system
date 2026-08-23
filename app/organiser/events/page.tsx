import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CreateEventForm } from "./CreateEventForm";
import { AddShowForm } from "./AddShowForm";
import { LinkButton } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";

export default async function OrganiserEventsPage() {
  const session = await getSession();

  if (!session || session.role !== "ORGANISER") {
    return (
      <main className="flex flex-1 items-center justify-center p-8">
        <EmptyState title="Organisers only" action={<LinkButton href="/login">Log in</LinkButton>} />
      </main>
    );
  }

  const events = await prisma.event.findMany({
    where: { organiserId: session.userId },
    orderBy: { title: "asc" },
    include: { shows: { orderBy: { startsAt: "asc" }, include: { venue: true } } },
  });

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <h1 className="text-2xl font-bold">Your events</h1>

      <CreateEventForm />

      {events.length === 0 ? (
        <EmptyState
          title="You haven't created any events yet"
          body="Use the form above to create your first event, then add a showtime with seat pricing."
        />
      ) : (
        <ul className="flex flex-col gap-4">
          {events.map((event) => (
            <li key={event.id}>
              <Card>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">{event.title}</p>
                    <p className="text-xs uppercase tracking-wide text-[var(--page-fg)]/60">{event.type}</p>
                  </div>
                  <LinkButton href={`/organiser/events/${event.id}`} className="px-3 py-1">
                    Revenue summary
                  </LinkButton>
                </div>

                {event.shows.length === 0 ? (
                  <p className="mt-3 text-sm text-[var(--page-fg)]/60">No showtimes yet, add one below.</p>
                ) : (
                  <ul className="mt-3 flex flex-col gap-1 text-sm">
                    {event.shows.map((show) => (
                      <li key={show.id} className="text-[var(--page-fg)]/70">
                        {show.venue.name} ·{" "}
                        {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
                          show.startsAt
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                <div className="mt-3">
                  <AddShowForm eventId={event.id} />
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
