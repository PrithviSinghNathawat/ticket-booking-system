import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyQrPayload } from "@/lib/qr";

export async function GET(
  request: Request,
  context: { params: Promise<{ payload: string }> }
) {
  const { payload } = await context.params;

  const result = verifyQrPayload(decodeURIComponent(payload));
  if (!result.valid || !result.reference) {
    return NextResponse.json({ valid: false });
  }

  const booking = await prisma.booking.findUnique({
    where: { reference: result.reference },
    include: {
      show: { include: { event: true, venue: true } },
      seats: { include: { seat: true } },
    },
  });

  if (!booking) {
    return NextResponse.json({ valid: false });
  }

  return NextResponse.json({
    valid: true,
    status: booking.status,
    reference: booking.reference,
    event: booking.show.event.title,
    venue: booking.show.venue.name,
    showtime: booking.show.startsAt,
    seats: booking.seats.map((s) => ({
      rowLabel: s.seat.rowLabel,
      seatNumber: s.seat.seatNumber,
      categoryName: s.categoryName,
      price: s.price,
    })),
    totalAmount: booking.totalAmount,
  });
}
