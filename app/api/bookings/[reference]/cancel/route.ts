import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { offerSeatToNextWaiter, type OfferHandoff } from "@/lib/waitlist";
import { sendWaitlistOfferEmails } from "@/lib/mail";
import { WAITLIST_OFFER_TTL_SECONDS, APP_URL } from "@/lib/config";

export const maxDuration = 30;

class AlreadyCancelledError extends Error {}

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

  const now = new Date();
  const offerHandoffs: OfferHandoff[] = [];

  try {
    await prisma.$transaction(async (tx) => {
      const cancelled = await tx.booking.updateMany({
        where: { id: booking.id, status: { not: "CANCELLED" } },
        data: { status: "CANCELLED" },
      });
      if (cancelled.count !== 1) {
        throw new AlreadyCancelledError();
      }

      const allocations = await tx.seatAllocation.findMany({
        where: { bookingId: booking.id },
        include: { seat: true },
      });

      await tx.seatAllocation.deleteMany({ where: { bookingId: booking.id } });

      for (const allocation of allocations) {
        const handoff = await offerSeatToNextWaiter(tx, {
          showId: booking.showId,
          categoryId: allocation.seat.categoryId,
          seatId: allocation.seatId,
          now,
        });
        if (handoff) offerHandoffs.push(handoff);
      }
    }, { timeout: 25000 });
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
        offerReference: h.offer.token,
        contactEmail: user.email,
        eventTitle: show!.event.title,
        venueName: show!.venue.name,
        startsAt: show!.startsAt,
        rowLabel: seat.rowLabel,
        seatNumber: seat.seatNumber,
        categoryName: seat.category.name,
        expiresAt: h.offer.expiresAt,
        ttlSeconds: WAITLIST_OFFER_TTL_SECONDS,
        claimUrl: `${APP_URL}/waitlist/claim/${h.offer.token}`,
      };
    });

    sendWaitlistOfferEmails(payloads);
  }

  return NextResponse.json({ reference: booking.reference, status: "CANCELLED" });
}
