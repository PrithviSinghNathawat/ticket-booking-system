import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { isActive } from "@/lib/allocations";

export async function GET() {
  const auth = await requireRole(["CUSTOMER"]);
  if (!auth.ok) return auth.response;

  const now = new Date();

  const rows = await prisma.seatAllocation.findMany({
    where: { holderUserId: auth.session.userId, status: "HELD" },
    include: {
      seat: true,
      show: { include: { event: true, venue: true } },
    },
  });

  const activeRows = rows.filter((row) => isActive(row, now));

  const byShowId = new Map<
    string,
    {
      showId: string;
      title: string;
      venueName: string;
      startsAt: Date;
      expiresAt: Date | null;
      seats: { seatId: string; rowLabel: string; seatNumber: number }[];
    }
  >();

  for (const row of activeRows) {
    const existing = byShowId.get(row.showId);
    const seatEntry = {
      seatId: row.seat.id,
      rowLabel: row.seat.rowLabel,
      seatNumber: row.seat.seatNumber,
    };

    if (existing) {
      existing.seats.push(seatEntry);
    } else {
      byShowId.set(row.showId, {
        showId: row.showId,
        title: row.show.event.title,
        venueName: row.show.venue.name,
        startsAt: row.show.startsAt,
        expiresAt: row.expiresAt,
        seats: [seatEntry],
      });
    }
  }

  return NextResponse.json({ holds: Array.from(byShowId.values()) });
}
