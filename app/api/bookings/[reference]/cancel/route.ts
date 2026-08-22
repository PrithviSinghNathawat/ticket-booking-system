import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { offerFreedSeatsBatch, type BatchOfferResult, type FreedSeat } from "@/lib/waitlist";
import { sendWaitlistOfferEmails } from "@/lib/mail";
import { WAITLIST_OFFER_TTL_SECONDS, APP_URL } from "@/lib/config";

export const maxDuration = 15;

class AlreadyCancelledError extends Error {}
class RetryCancellationError extends Error {}

async function attemptCancellation(
  bookingId: string,
  showId: string,
  strict: boolean
): Promise<BatchOfferResult> {
  return prisma.$transaction(
    async (tx) => {
      const now = new Date();

      const cancelled = await tx.booking.updateMany({
        where: { id: bookingId, status: { not: "CANCELLED" } },
        data: { status: "CANCELLED" },
      });
      if (cancelled.count !== 1) {
        throw new AlreadyCancelledError();
      }

      const allocations = await tx.seatAllocation.findMany({
        where: { bookingId },
        include: { seat: true },
      });

      await tx.seatAllocation.deleteMany({ where: { bookingId } });

      const freed: FreedSeat[] = allocations.map((a) => ({
        seatId: a.seatId,
        categoryId: a.seat.categoryId,
      }));

      const result = await offerFreedSeatsBatch(tx, { showId, freed, now, strict });
      if (result === null) {
        throw new RetryCancellationError();
      }

      return result;
    },
    { timeout: 10000 }
  );
}

export async function POST(
  request: Request,
  context: { params: Promise<{ reference: string }> }
) {
  const { reference } = await context.params;

  const auth = await requireRole(["CUSTOMER"]);
  if (!auth.ok) return auth.response;

  const booking = await prisma.booking.findUnique({ where: { reference } });
  if (!booking || booking.userId !== auth.session.userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (booking.status === "CANCELLED") {
    return NextResponse.json({ error: "This booking is already cancelled" }, { status: 409 });
  }

  let offerHandoffs: BatchOfferResult;

  try {
    try {
      offerHandoffs = await attemptCancellation(booking.id, booking.showId, true);
    } catch (err) {
      if (err instanceof RetryCancellationError) {
        offerHandoffs = await attemptCancellation(booking.id, booking.showId, false);
      } else {
        throw err;
      }
    }
  } catch (err) {
    if (err instanceof AlreadyCancelledError) {
      return NextResponse.json({ error: "This booking is already cancelled" }, { status: 409 });
    }
    throw err;
  }

  if (offerHandoffs.length > 0) {
    const show = await prisma.show.findUnique({
      where: { id: booking.showId },
      include: { event: true, venue: true },
    });
    const users = await prisma.user.findMany({
      where: { id: { in: offerHandoffs.map((h) => h.entry.userId) } },
    });
    const seats = await prisma.seat.findMany({
      where: { id: { in: offerHandoffs.map((h) => h.seatId) } },
      include: { category: true },
    });

    const payloads = offerHandoffs.map((h) => {
      const user = users.find((u) => u.id === h.entry.userId)!;
      const seat = seats.find((s) => s.id === h.seatId)!;
      return {
        offerReference: h.token,
        contactEmail: user.email,
        eventTitle: show!.event.title,
        venueName: show!.venue.name,
        startsAt: show!.startsAt,
        rowLabel: seat.rowLabel,
        seatNumber: seat.seatNumber,
        categoryName: seat.category.name,
        expiresAt: h.expiresAt,
        ttlSeconds: WAITLIST_OFFER_TTL_SECONDS,
        claimUrl: `${APP_URL}/waitlist/claim/${h.token}`,
      };
    });

    sendWaitlistOfferEmails(payloads);
  }

  return NextResponse.json({ reference: booking.reference, status: "CANCELLED" });
}
