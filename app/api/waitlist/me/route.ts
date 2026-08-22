import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";

export async function GET() {
  const auth = await requireRole(["CUSTOMER"]);
  if (!auth.ok) return auth.response;

  const entries = await prisma.waitlistEntry.findMany({
    where: { userId: auth.session.userId, status: { in: ["WAITING", "OFFERED"] } },
    orderBy: { createdAt: "asc" },
    include: {
      show: { include: { event: true, venue: true } },
      offers: { where: { status: "PENDING" }, include: { seat: true } },
    },
  });

  const result = await Promise.all(
    entries.map(async (entry) => {
      let position: number | null = null;
      if (entry.status === "WAITING") {
        const ahead = await prisma.waitlistEntry.count({
          where: {
            showId: entry.showId,
            categoryId: entry.categoryId,
            status: "WAITING",
            createdAt: { lt: entry.createdAt },
          },
        });
        position = ahead + 1;
      }

      const category = await prisma.seatCategory.findUnique({ where: { id: entry.categoryId } });
      const pendingOffer = entry.offers[0];

      return {
        id: entry.id,
        showId: entry.showId,
        eventTitle: entry.show.event.title,
        venueName: entry.show.venue.name,
        startsAt: entry.show.startsAt,
        categoryId: entry.categoryId,
        categoryName: category?.name ?? "Unknown",
        status: entry.status,
        position,
        offer: pendingOffer
          ? {
              token: pendingOffer.token,
              expiresAt: pendingOffer.expiresAt,
              rowLabel: pendingOffer.seat.rowLabel,
              seatNumber: pendingOffer.seat.seatNumber,
            }
          : null,
      };
    })
  );

  return NextResponse.json({ entries: result, serverNow: new Date().toISOString() });
}
