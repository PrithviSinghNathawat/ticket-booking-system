import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { parseBody } from "@/lib/validate";
import { confirmBookingSchema } from "@/lib/schemas";
import { isActive } from "@/lib/allocations";
import { generateBookingReference } from "@/lib/reference";
import { buildQrPayload } from "@/lib/qr";
import { sendBookingConfirmationEmail } from "@/lib/mail";
import { apiError } from "@/lib/errors";

class HoldLapsedError extends Error {}

const MAX_REFERENCE_ATTEMPTS = 2;

export async function GET() {
  const auth = await requireRole(["CUSTOMER"]);
  if (!auth.ok) return auth.response;

  const bookings = await prisma.booking.findMany({
    where: { userId: auth.session.userId },
    orderBy: { createdAt: "desc" },
    include: { show: { include: { event: true, venue: true } } },
  });

  return NextResponse.json({
    bookings: bookings.map((b) => ({
      reference: b.reference,
      status: b.status,
      eventTitle: b.show.event.title,
      venueName: b.show.venue.name,
      startsAt: b.show.startsAt,
      totalAmount: b.totalAmount,
      createdAt: b.createdAt,
    })),
  });
}

export async function POST(request: Request) {
  const auth = await requireRole(["CUSTOMER"]);
  if (!auth.ok) return auth.response;

  const parsed = await parseBody(confirmBookingSchema, request);
  if (!parsed.ok) return parsed.response;

  const { showId, contactName, contactEmail, contactPhone } = parsed.data;
  const userId = auth.session.userId;

  const show = await prisma.show.findUnique({
    where: { id: showId },
    include: { event: true, venue: true, prices: { include: { category: true } } },
  });
  if (!show) {
    return apiError(404, "Show not found", "SHOW_NOT_FOUND");
  }

  const priceByCategoryId = new Map(
    show.prices.map((p) => [p.categoryId, { price: Number(p.price), categoryName: p.category.name }])
  );

  let booking: { id: string; reference: string } | null = null;

  for (let attempt = 1; attempt <= MAX_REFERENCE_ATTEMPTS && !booking; attempt++) {
    const now = new Date();

    const heldRows = await prisma.seatAllocation.findMany({
      where: { showId, holderUserId: userId, status: "HELD" },
      include: { seat: true },
      orderBy: [{ seat: { rowLabel: "asc" } }, { seat: { seatNumber: "asc" } }],
    });
    const activeHeld = heldRows.filter((row) => isActive(row, now));

    if (activeHeld.length === 0) {
      return apiError(
        409,
        "Your hold expired and your seats were released. Please select seats again.",
        "HOLD_LAPSED"
      );
    }

    const ordered = activeHeld.map((row) => row.seatId);
    const bookingId = randomUUID();
    const reference = generateBookingReference();

    const seatSnapshots = activeHeld.map((row) => {
      const info = priceByCategoryId.get(row.seat.categoryId);
      return {
        seatId: row.seatId,
        categoryName: info?.categoryName ?? "Unknown",
        price: info?.price ?? 0,
      };
    });
    const totalAmount = seatSnapshots.reduce((sum, s) => sum + s.price, 0);

    try {
      await prisma.$transaction(async (tx) => {
        await tx.booking.create({
          data: {
            id: bookingId,
            reference,
            showId,
            userId,
            status: "CONFIRMED",
            totalAmount,
            contactName,
            contactEmail,
            contactPhone,
          },
        });

        const result = await tx.seatAllocation.updateMany({
          where: {
            showId,
            seatId: { in: ordered },
            status: "HELD",
            holderUserId: userId,
            expiresAt: { gt: now },
          },
          data: { status: "BOOKED", expiresAt: null, bookingId },
        });

        if (result.count !== ordered.length) {
          throw new HoldLapsedError();
        }

        const claimedOffers = await tx.waitlistOffer.findMany({
          where: {
            seatId: { in: ordered },
            status: "PENDING",
            waitlistEntry: { showId, userId },
          },
        });

        for (const offer of claimedOffers) {
          const guarded = await tx.waitlistOffer.updateMany({
            where: { id: offer.id, status: "PENDING" },
            data: { status: "CLAIMED" },
          });
          if (guarded.count === 1) {
            await tx.waitlistEntry.update({
              where: { id: offer.waitlistEntryId },
              data: { status: "CONVERTED" },
            });
          }
        }

        await tx.bookingSeat.createMany({
          data: seatSnapshots.map((s) => ({
            bookingId,
            seatId: s.seatId,
            categoryName: s.categoryName,
            price: s.price,
          })),
        });
      });

      booking = { id: bookingId, reference };
    } catch (err) {
      if (err instanceof HoldLapsedError) {
        return apiError(
          409,
          "Your hold expired and your seats were released. Please select seats again.",
          "HOLD_LAPSED"
        );
      }

      const isReferenceCollision =
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002" &&
        Array.isArray(err.meta?.target) &&
        err.meta.target.includes("reference");

      if (isReferenceCollision && attempt < MAX_REFERENCE_ATTEMPTS) {
        continue;
      }

      throw err;
    }
  }

  if (!booking) {
    return apiError(500, "Could not create booking, please try again", "REFERENCE_COLLISION");
  }

  const qrPayload = buildQrPayload(booking.reference);
  const bookingSeatsForEmail = await prisma.bookingSeat.findMany({
    where: { bookingId: booking.id },
    include: { seat: true },
  });

  sendBookingConfirmationEmail({
    reference: booking.reference,
    contactEmail,
    contactName,
    eventTitle: show.event.title,
    venueName: show.venue.name,
    startsAt: show.startsAt,
    seats: bookingSeatsForEmail.map((bs) => ({
      rowLabel: bs.seat.rowLabel,
      seatNumber: bs.seat.seatNumber,
      categoryName: bs.categoryName,
      price: Number(bs.price),
    })),
    totalAmount: bookingSeatsForEmail.reduce((sum, bs) => sum + Number(bs.price), 0),
    qrPayload,
  });

  return NextResponse.json({ id: booking.id, reference: booking.reference }, { status: 201 });
}
