import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function EventSummaryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();

  if (!session || (session.role !== "ORGANISER" && session.role !== "ADMIN")) {
    notFound();
  }

  const now = new Date();

  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      shows: {
        orderBy: { startsAt: "asc" },
        include: {
          venue: { include: { seats: { select: { id: true } }, categories: true } },
          allocations: true,
          bookings: { include: { seats: true } },
          waitlistEntries: { where: { status: "WAITING" } },
        },
      },
    },
  });

  if (!event || (session.role === "ORGANISER" && event.organiserId !== session.userId)) {
    notFound();
  }

  const shows = event.shows.map((show) => {
    const totalSeats = show.venue.seats.length;
    const activeAllocations = show.allocations.filter(
      (a) => a.status === "BOOKED" || (a.status === "HELD" && a.expiresAt !== null && a.expiresAt > now)
    );
    const sold = activeAllocations.filter((a) => a.status === "BOOKED").length;
    const held = activeAllocations.filter((a) => a.status === "HELD").length;
    const available = totalSeats - sold - held;

    const confirmedBookings = show.bookings.filter((b) => b.status === "CONFIRMED");
    const cancelledBookings = show.bookings.filter((b) => b.status === "CANCELLED");
    const confirmedRevenue = confirmedBookings.reduce(
      (sum, b) => sum + b.seats.reduce((s, seat) => s + Number(seat.price), 0),
      0
    );
    const cancelledValue = cancelledBookings.reduce(
      (sum, b) => sum + b.seats.reduce((s, seat) => s + Number(seat.price), 0),
      0
    );

    const waitlistByCategory = new Map<string, number>();
    for (const entry of show.waitlistEntries) {
      waitlistByCategory.set(entry.categoryId, (waitlistByCategory.get(entry.categoryId) ?? 0) + 1);
    }

    return {
      showId: show.id,
      startsAt: show.startsAt,
      venueName: show.venue.name,
      totalSeats,
      sold,
      held,
      available,
      occupancyPercent: totalSeats > 0 ? Math.round((sold / totalSeats) * 1000) / 10 : 0,
      confirmedRevenue,
      confirmedCount: confirmedBookings.length,
      cancelledCount: cancelledBookings.length,
      cancelledValue,
      waitlist: show.venue.categories.map((c) => ({
        name: c.name,
        waiting: waitlistByCategory.get(c.id) ?? 0,
      })),
    };
  });

  const eventRevenue = shows.reduce((sum, s) => sum + s.confirmedRevenue, 0);
  const eventCancelledValue = shows.reduce((sum, s) => sum + s.cancelledValue, 0);

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{event.title} — revenue</h1>
        <Link href="/organiser/events" className="text-sm underline">
          Back to events
        </Link>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-[var(--border-subtle)] text-left">
              <th className="p-2">Show</th>
              <th className="p-2">Seats</th>
              <th className="p-2">Occupancy</th>
              <th className="p-2">Confirmed revenue</th>
              <th className="p-2">Cancelled (count / value)</th>
              <th className="p-2">Waitlist</th>
            </tr>
          </thead>
          <tbody>
            {shows.map((s) => (
              <tr key={s.showId} className="border-b border-[var(--border-subtle)]">
                <td className="p-2">
                  {s.venueName}
                  <br />
                  <span className="text-xs text-[var(--page-fg)]/60">
                    {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
                      s.startsAt
                    )}
                  </span>
                </td>
                <td className="p-2">
                  {s.sold} sold / {s.held} held / {s.available} available (of {s.totalSeats})
                </td>
                <td className="p-2">{s.occupancyPercent}%</td>
                <td className="p-2 font-semibold">{s.confirmedRevenue}</td>
                <td className="p-2">
                  {s.cancelledCount} / {s.cancelledValue}
                </td>
                <td className="p-2">
                  {s.waitlist.map((w) => `${w.name}: ${w.waiting}`).join(", ") || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-[var(--border-subtle)] p-4 text-sm">
        <p className="font-semibold">Event total confirmed revenue: {eventRevenue}</p>
        <p>Event total cancelled value (not netted in): {eventCancelledValue}</p>
      </div>
    </main>
  );
}
