import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";

export async function GET(
  request: Request,
  context: { params: Promise<{ reference: string }> }
) {
  const { reference } = await context.params;

  const auth = await requireRole(["CUSTOMER"]);
  if (!auth.ok) return auth.response;

  const booking = await prisma.booking.findUnique({
    where: { reference },
    include: {
      show: { include: { event: true, venue: true } },
      seats: { include: { seat: true } },
    },
  });

  if (!booking || booking.userId !== auth.session.userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    reference: booking.reference,
    status: booking.status,
    contactName: booking.contactName,
    contactEmail: booking.contactEmail,
    contactPhone: booking.contactPhone,
    eventTitle: booking.show.event.title,
    venueName: booking.show.venue.name,
    startsAt: booking.show.startsAt,
    totalAmount: booking.totalAmount,
    createdAt: booking.createdAt,
    seats: booking.seats.map((s) => ({
      rowLabel: s.seat.rowLabel,
      seatNumber: s.seat.seatNumber,
      categoryName: s.categoryName,
      price: s.price,
    })),
  });
}
