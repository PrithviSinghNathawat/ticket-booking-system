import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { parseBody } from "@/lib/validate";
import { updateShowSchema } from "@/lib/schemas";

async function findOwnedShow(eventId: string, showId: string, userId: string) {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event || event.organiserId !== userId) return null;

  const show = await prisma.show.findUnique({ where: { id: showId } });
  if (!show || show.eventId !== eventId) return null;

  return show;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; showId: string }> }
) {
  const { id, showId } = await context.params;

  const auth = await requireRole(["ORGANISER"]);
  if (!auth.ok) return auth.response;

  const parsed = await parseBody(updateShowSchema, request);
  if (!parsed.ok) return parsed.response;

  const show = await findOwnedShow(id, showId, auth.session.userId);
  if (!show) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { startsAt, prices } = parsed.data;

  if (startsAt !== undefined && new Date(startsAt) <= new Date()) {
    return NextResponse.json({ error: "startsAt must be in the future" }, { status: 400 });
  }

  if (prices !== undefined) {
    const venue = await prisma.venue.findUnique({
      where: { id: show.venueId },
      include: { categories: true },
    });
    const venueCategoryIds = new Set(venue!.categories.map((c) => c.id));
    const pricedCategoryIds = new Set(prices.map((p) => p.categoryId));

    for (const categoryId of venueCategoryIds) {
      if (!pricedCategoryIds.has(categoryId)) {
        return NextResponse.json(
          { error: "Every seat category at this venue must have a price" },
          { status: 400 }
        );
      }
    }
    for (const categoryId of pricedCategoryIds) {
      if (!venueCategoryIds.has(categoryId)) {
        return NextResponse.json(
          { error: "One or more prices reference a category not at this venue" },
          { status: 400 }
        );
      }
    }
  }

  await prisma.$transaction(async (tx) => {
    if (startsAt !== undefined) {
      await tx.show.update({ where: { id: showId }, data: { startsAt: new Date(startsAt) } });
    }
    if (prices !== undefined) {
      await tx.showPrice.deleteMany({ where: { showId } });
      await tx.showPrice.createMany({
        data: prices.map((p) => ({ showId, categoryId: p.categoryId, price: p.price })),
      });
    }
  });

  const updated = await prisma.show.findUnique({ where: { id: showId }, include: { prices: true } });

  return NextResponse.json({
    id: updated!.id,
    startsAt: updated!.startsAt,
    prices: updated!.prices.map((p) => ({ categoryId: p.categoryId, price: p.price })),
  });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string; showId: string }> }
) {
  const { id, showId } = await context.params;

  const auth = await requireRole(["ORGANISER"]);
  if (!auth.ok) return auth.response;

  const show = await findOwnedShow(id, showId, auth.session.userId);
  if (!show) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const bookingCount = await prisma.booking.count({ where: { showId, status: "CONFIRMED" } });
  if (bookingCount > 0) {
    return NextResponse.json(
      { error: "This show has confirmed bookings and cannot be deleted" },
      { status: 409 }
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.waitlistOffer.deleteMany({ where: { waitlistEntry: { showId } } });
    await tx.waitlistEntry.deleteMany({ where: { showId } });
    await tx.seatAllocation.deleteMany({ where: { showId } });
    await tx.showPrice.deleteMany({ where: { showId } });
    await tx.show.delete({ where: { id: showId } });
  });

  return NextResponse.json({ deleted: true });
}
