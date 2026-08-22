import Link from "next/link";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CreateEventForm } from "./CreateEventForm";
import { AddShowForm } from "./AddShowForm";

export default async function OrganiserEventsPage() {
  const session = await getSession();

  if (!session || session.role !== "ORGANISER") {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-xl font-semibold">Organisers only</h1>
        <Link href="/login" className="rounded bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-fg)]">
          Log in
        </Link>
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

      <ul className="flex flex-col gap-4">
        {events.map((event) => (
          <li key={event.id} className="rounded-xl border border-[var(--border-subtle)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold">{event.title}</p>
                <p className="text-xs uppercase tracking-wide text-[var(--page-fg)]/60">{event.type}</p>
              </div>
              <Link
                href={`/organiser/events/${event.id}`}
                className="rounded bg-[var(--accent)] px-3 py-1 text-sm font-semibold text-[var(--accent-fg)]"
              >
                Revenue summary
              </Link>
            </div>

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

            <div className="mt-3">
              <AddShowForm eventId={event.id} />
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
