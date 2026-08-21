import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { expiredHoldWhere } from "@/lib/allocations";

async function sweep(request: Request) {
  const expectedSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const start = Date.now();
  const now = new Date();

  const deleted = await prisma.seatAllocation.deleteMany({
    where: expiredHoldWhere(now),
  });

  return NextResponse.json({
    deletedHolds: deleted.count,
    expiredOffers: 0,
    promotedWaitlistEntries: 0,
    durationMs: Date.now() - start,
  });
}

export async function POST(request: Request) {
  return sweep(request);
}

export async function GET(request: Request) {
  return sweep(request);
}
