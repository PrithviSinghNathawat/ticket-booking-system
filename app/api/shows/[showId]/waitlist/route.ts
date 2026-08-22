import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { parseBody } from "@/lib/validate";
import { joinWaitlistSchema } from "@/lib/schemas";
import { activeAllocationWhere } from "@/lib/allocations";
import { processWaitlist } from "@/lib/waitlist";

async function isCategorySoldOut(showId: string, categoryId: string, now: Date): Promise<boolean> {
  const seats = await prisma.seat.findMany({ where: { categoryId }, select: { id: true } });
  if (seats.length === 0) return false;

  const activeCount = await prisma.seatAllocation.count({
    where: { showId, seatId: { in: seats.map((s) => s.id) }, ...activeAllocationWhere(now) },
  });

  return activeCount >= seats.length;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ showId: string }> }
) {
  const { showId } = await context.params;

  const auth = await requireRole(["CUSTOMER"]);
  if (!auth.ok) return auth.response;

  const parsed = await parseBody(joinWaitlistSchema, request);
  if (!parsed.ok) return parsed.response;

  const { categoryId } = parsed.data;
  const userId = auth.session.userId;

  const show = await prisma.show.findUnique({ where: { id: showId } });
  if (!show) {
    return NextResponse.json({ error: "Show not found" }, { status: 404 });
  }

  const category = await prisma.seatCategory.findUnique({ where: { id: categoryId } });
  if (!category || category.venueId !== show.venueId) {
    return NextResponse.json({ error: "Category not found for this show" }, { status: 404 });
  }

  const existing = await prisma.waitlistEntry.findUnique({
    where: { showId_categoryId_userId: { showId, categoryId, userId } },
  });

  if (existing && (existing.status === "WAITING" || existing.status === "OFFERED")) {
    return NextResponse.json({ id: existing.id, status: existing.status }, { status: 200 });
  }

  if (existing && existing.status === "CONVERTED") {
    return NextResponse.json(
      { error: "You already received a seat from this waitlist" },
      { status: 400 }
    );
  }

  const now = new Date();
  const soldOut = await isCategorySoldOut(showId, categoryId, now);
  if (!soldOut) {
    return NextResponse.json(
      { error: "Seats are currently available in this category — no need to wait" },
      { status: 400 }
    );
  }

  if (existing) {
    const updated = await prisma.waitlistEntry.update({
      where: { id: existing.id },
      data: { status: "WAITING", createdAt: now },
    });
    return NextResponse.json({ id: updated.id, status: updated.status }, { status: 200 });
  }

  const created = await prisma.waitlistEntry.create({
    data: { showId, categoryId, userId, status: "WAITING" },
  });
  return NextResponse.json({ id: created.id, status: created.status }, { status: 201 });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ showId: string }> }
) {
  const { showId } = await context.params;

  const auth = await requireRole(["CUSTOMER"]);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const categoryId = searchParams.get("categoryId");
  if (!categoryId) {
    return NextResponse.json({ error: "categoryId query parameter is required" }, { status: 400 });
  }

  const userId = auth.session.userId;

  const existing = await prisma.waitlistEntry.findUnique({
    where: { showId_categoryId_userId: { showId, categoryId, userId } },
  });

  if (!existing || (existing.status !== "WAITING" && existing.status !== "OFFERED")) {
    return NextResponse.json({ left: false });
  }

  if (existing.status === "OFFERED") {
    const offer = await prisma.waitlistOffer.findFirst({
      where: { waitlistEntryId: existing.id, status: "PENDING" },
    });

    await prisma.$transaction(async (tx) => {
      await tx.waitlistEntry.update({ where: { id: existing.id }, data: { status: "CANCELLED" } });
      if (offer) {
        await tx.waitlistOffer.updateMany({
          where: { id: offer.id, status: "PENDING" },
          data: { status: "EXPIRED" },
        });
        await tx.seatAllocation.deleteMany({
          where: { showId, seatId: offer.seatId, holderUserId: userId, status: "HELD" },
        });
      }
    });

    if (offer) {
      await processWaitlist(showId);
    }
  } else {
    await prisma.waitlistEntry.update({ where: { id: existing.id }, data: { status: "CANCELLED" } });
  }

  return NextResponse.json({ left: true });
}
