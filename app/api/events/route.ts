import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { activeAllocationWhere } from "@/lib/allocations";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const date = searchParams.get("date");
  const q = searchParams.get("q");
  const venueId = searchParams.get("venueId");

  if (type && type !== "MOVIE" && type !== "CONCERT") {
    return NextResponse.json({ error: "type must be MOVIE or CONCERT" }, { status: 400 });
  }

  let dayStart: Date | undefined;
  let dayEnd: Date | undefined;
  if (date) {
    dayStart = new Date(`${date}T00:00:00.000Z`);
    if (Number.isNaN(dayStart.getTime())) {
      return NextResponse.json({ error: "date must be an ISO date (YYYY-MM-DD)" }, { status: 400 });
    }
    dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  }

  const now = new Date();

  const showWhere: Prisma.ShowWhereInput = {
    ...(venueId ? { venueId } : {}),
    ...(dayStart && dayEnd ? { startsAt: { gte: dayStart, lt: dayEnd } } : {}),
  };

  const events = await prisma.event.findMany({
    where: {
      ...(type ? { type: type as "MOVIE" | "CONCERT" } : {}),
      ...(q ? { title: { contains: q, mode: "insensitive" } } : {}),
      shows: { some: showWhere },
    },
    include: {
      shows: {
        where: showWhere,
        orderBy: { startsAt: "asc" },
        include: {
          venue: { include: { seats: { select: { id: true } } } },
          prices: true,
          allocations: { where: activeAllocationWhere(now) },
        },
      },
    },
    orderBy: { title: "asc" },
  });

  const results = events
    .filter((event) => event.shows.length > 0)
    .map((event) => {
      const upcoming = event.shows.find((show) => show.startsAt >= now) ?? event.shows[0];

      const prices = event.shows.flatMap((show) => show.prices.map((p) => Number(p.price)));
      const priceMin = prices.length ? Math.min(...prices) : null;
      const priceMax = prices.length ? Math.max(...prices) : null;

      const totalSeats = upcoming.venue.seats.length;
      const activeCount = upcoming.allocations.length;
      const soldOut = totalSeats > 0 && activeCount >= totalSeats;

      return {
        eventId: event.id,
        title: event.title,
        type: event.type,
        description: event.description,
        venueName: upcoming.venue.name,
        nextShowAt: upcoming.startsAt,
        priceMin,
        priceMax,
        soldOut,
        showCount: event.shows.length,
      };
    });

  return NextResponse.json({ events: results });
}
