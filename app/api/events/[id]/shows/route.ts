import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { parseBody } from "@/lib/validate";
import { createShowSchema } from "@/lib/schemas";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  const auth = await requireRole(["ORGANISER"]);
  if (!auth.ok) return auth.response;

  const parsed = await parseBody(createShowSchema, request);
  if (!parsed.ok) return parsed.response;

  const { venueId, startsAt, prices } = parsed.data;

  const event = await prisma.event.findUnique({ where: { id } });
  if (!event || event.organiserId !== auth.session.userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const startsAtDate = new Date(startsAt);
  if (startsAtDate <= new Date()) {
    return NextResponse.json({ error: "startsAt must be in the future" }, { status: 400 });
  }

  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    include: { categories: true },
  });
  if (!venue) {
    return NextResponse.json({ error: "Venue not found" }, { status: 404 });
  }

  const venueCategoryIds = new Set(venue.categories.map((c) => c.id));
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

  const show = await prisma.$transaction(async (tx) => {
    const createdShow = await tx.show.create({
      data: { eventId: id, venueId, startsAt: startsAtDate },
    });
    await tx.showPrice.createMany({
      data: prices.map((p) => ({ showId: createdShow.id, categoryId: p.categoryId, price: p.price })),
    });
    return createdShow;
  });

  return NextResponse.json({ id: show.id, startsAt: show.startsAt, venueId: show.venueId }, { status: 201 });
}
