import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET(
  request: Request,
  context: { params: Promise<{ showId: string }> }
) {
  const { showId } = await context.params;
  const now = new Date();

  const show = await prisma.show.findUnique({
    where: { id: showId },
    include: {
      event: true,
      venue: { include: { seats: { orderBy: [{ rowLabel: "asc" }, { seatNumber: "asc" }] } } },
      prices: { include: { category: true } },
    },
  });

  if (!show) {
    return NextResponse.json({ error: "Show not found" }, { status: 404 });
  }

  const session = await getSession();

  const allocations = await prisma.seatAllocation.findMany({
    where: { showId },
  });
  const allocationBySeatId = new Map(allocations.map((a) => [a.seatId, a]));

  const priceByCategoryId = new Map(
    show.prices.map((p) => [p.categoryId, { price: p.price, categoryName: p.category.name }])
  );

  const seats = show.venue.seats.map((seat) => {
    const allocation = allocationBySeatId.get(seat.id);
    const categoryInfo = priceByCategoryId.get(seat.categoryId);

    let status: "AVAILABLE" | "HELD" | "BOOKED" | "HELD_BY_YOU" = "AVAILABLE";
    if (allocation) {
      if (allocation.status === "BOOKED") {
        status = "BOOKED";
      } else if (allocation.status === "HELD" && allocation.expiresAt && allocation.expiresAt >= now) {
        status = session?.userId === allocation.holderUserId ? "HELD_BY_YOU" : "HELD";
      }
    }

    return {
      seatId: seat.id,
      rowLabel: seat.rowLabel,
      seatNumber: seat.seatNumber,
      categoryName: categoryInfo?.categoryName ?? "Unknown",
      price: categoryInfo?.price ?? null,
      status,
    };
  });

  return NextResponse.json({
    show: {
      id: show.id,
      title: show.event.title,
      type: show.event.type,
      venueName: show.venue.name,
      startsAt: show.startsAt,
    },
    prices: show.prices.map((p) => ({
      categoryId: p.categoryId,
      categoryName: p.category.name,
      price: p.price,
    })),
    seats,
  });
}
