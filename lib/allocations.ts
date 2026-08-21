import type { Prisma, SeatAllocation } from "@prisma/client";

export function activeAllocationWhere(now: Date): Prisma.SeatAllocationWhereInput {
  return {
    OR: [{ status: "BOOKED" }, { status: "HELD", expiresAt: { gt: now } }],
  };
}

export function expiredHoldWhere(now: Date): Prisma.SeatAllocationWhereInput {
  return { status: "HELD", expiresAt: { lte: now } };
}

export function isActive(
  allocation: Pick<SeatAllocation, "status" | "expiresAt">,
  now: Date
): boolean {
  if (allocation.status === "BOOKED") return true;
  return allocation.status === "HELD" && allocation.expiresAt !== null && allocation.expiresAt > now;
}
