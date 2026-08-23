import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { apiError } from "@/lib/errors";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  const auth = await requireRole(["ORGANISER", "ADMIN"]);
  if (!auth.ok) return auth.response;

  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      shows: {
        orderBy: { startsAt: "asc" },
        include: {
          venue: { include: { seats: { select: { id: true, categoryId: true } }, categories: true } },
          allocations: true,
          bookings: { include: { seats: true } },
          waitlistEntries: { where: { status: "WAITING" } },
        },
      },
    },
  });

  if (!event || (auth.session.role === "ORGANISER" && event.organiserId !== auth.session.userId)) {
    return apiError(404, "Not found", "NOT_FOUND");
  }

  const now = new Date();

  const shows = event.shows.map((show) => {
    const totalSeats = show.venue.seats.length;
    const activeAllocations = show.allocations.filter((a) => {
      const active = a.status === "BOOKED" || (a.status === "HELD" && a.expiresAt !== null && a.expiresAt > now);
      return active;
    });
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
    const waitlistDepth = show.venue.categories.map((c) => ({
      categoryId: c.id,
      categoryName: c.name,
      waiting: waitlistByCategory.get(c.id) ?? 0,
    }));

    return {
      showId: show.id,
      startsAt: show.startsAt,
      seatsTotal: totalSeats,
      seatsSold: sold,
      seatsHeld: held,
      seatsAvailable: available,
      occupancyPercent: totalSeats > 0 ? Math.round((sold / totalSeats) * 1000) / 10 : 0,
      confirmedRevenue,
      confirmedBookingsCount: confirmedBookings.length,
      cancelledBookingsCount: cancelledBookings.length,
      cancelledValue,
      waitlistDepth,
    };
  });

  const eventTotal = {
    confirmedRevenue: shows.reduce((sum, s) => sum + s.confirmedRevenue, 0),
    cancelledValue: shows.reduce((sum, s) => sum + s.cancelledValue, 0),
    seatsSold: shows.reduce((sum, s) => sum + s.seatsSold, 0),
  };

  return NextResponse.json({
    eventId: event.id,
    title: event.title,
    shows,
    eventTotal,
    notes:
      "Revenue is computed from BookingSeat price snapshots at booking time, not live ShowPrice — a later price change never retroactively rewrites already-reported revenue. Cancelled bookings are reported separately and are never netted into confirmedRevenue.",
  });
}
