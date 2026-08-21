import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { parseBody } from "@/lib/validate";
import { holdRequestSchema } from "@/lib/schemas";
import { HOLD_TTL_SECONDS } from "@/lib/config";
import { activeAllocationWhere, expiredHoldWhere, isActive } from "@/lib/allocations";

class ActiveHoldExistsError extends Error {}

function isSeatShowUniqueViolation(err: unknown): err is Prisma.PrismaClientKnownRequestError {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") {
    return false;
  }
  const target = err.meta?.target;
  return (
    (Array.isArray(target) && target.includes("seatId") && target.includes("showId")) ||
    (typeof target === "string" && target.includes("showId_seatId"))
  );
}

export async function POST(
  request: Request,
  context: { params: Promise<{ showId: string }> }
) {
  const { showId } = await context.params;

  const auth = await requireRole(["CUSTOMER"]);
  if (!auth.ok) return auth.response;

  const parsed = await parseBody(holdRequestSchema, request);
  if (!parsed.ok) return parsed.response;

  const seatIds = parsed.data.seatIds;
  if (new Set(seatIds).size !== seatIds.length) {
    return NextResponse.json({ error: "Duplicate seat ids in request" }, { status: 400 });
  }

  const show = await prisma.show.findUnique({ where: { id: showId } });
  if (!show) {
    return NextResponse.json({ error: "Show not found" }, { status: 404 });
  }

  const validSeats = await prisma.seat.findMany({
    where: { id: { in: seatIds }, venueId: show.venueId },
    select: { id: true },
  });
  if (validSeats.length !== seatIds.length) {
    return NextResponse.json(
      { error: "One or more seat ids are invalid for this show" },
      { status: 400 }
    );
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + HOLD_TTL_SECONDS * 1000);
  const userId = auth.session.userId;

  try {
    await prisma.$transaction(async (tx) => {
      const existingHold = await tx.seatAllocation.findFirst({
        where: { showId, holderUserId: userId, status: "HELD" },
      });
      if (existingHold && isActive(existingHold, now)) {
        throw new ActiveHoldExistsError();
      }

      await tx.seatAllocation.deleteMany({
        where: { showId, seatId: { in: seatIds }, ...expiredHoldWhere(now) },
      });

      await tx.seatAllocation.createMany({
        data: seatIds.map((seatId) => ({
          showId,
          seatId,
          status: "HELD" as const,
          holderUserId: userId,
          expiresAt,
        })),
      });
    });
  } catch (err) {
    if (err instanceof ActiveHoldExistsError) {
      return NextResponse.json(
        {
          error:
            "You already have an active hold on this show. Release it before requesting more seats.",
        },
        { status: 409 }
      );
    }

    if (isSeatShowUniqueViolation(err)) {
      const conflicting = await prisma.seatAllocation.findMany({
        where: { showId, seatId: { in: seatIds }, ...activeAllocationWhere(now) },
        select: { seatId: true },
      });
      return NextResponse.json(
        {
          error: "Some requested seats were just taken by another customer",
          conflictingSeatIds: conflicting.map((c) => c.seatId),
        },
        { status: 409 }
      );
    }

    throw err;
  }

  return NextResponse.json({ seatIds, expiresAt }, { status: 201 });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ showId: string }> }
) {
  const { showId } = await context.params;

  const auth = await requireRole(["CUSTOMER"]);
  if (!auth.ok) return auth.response;

  const userId = auth.session.userId;

  const held = await prisma.seatAllocation.findMany({
    where: { showId, holderUserId: userId, status: "HELD" },
    select: { seatId: true },
  });

  await prisma.seatAllocation.deleteMany({
    where: { showId, holderUserId: userId, status: "HELD" },
  });

  return NextResponse.json({ releasedSeatIds: held.map((h) => h.seatId) });
}
