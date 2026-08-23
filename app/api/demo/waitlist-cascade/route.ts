import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ENABLE_DEMO_ROUTES, APP_URL } from "@/lib/config";
import { ensureDemoWaitlistFixtures } from "@/lib/demo";
import { apiError } from "@/lib/errors";

export async function POST() {
  if (!ENABLE_DEMO_ROUTES) {
    return apiError(404, "Demo routes are disabled", "DEMO_DISABLED");
  }

  const { showId, seatId, categoryId, bookingReference, ownerToken, waiterEmail } =
    await ensureDemoWaitlistFixtures();

  const cancelRes = await fetch(`${APP_URL}/api/bookings/${bookingReference}/cancel`, {
    method: "POST",
    headers: { Cookie: `session=${ownerToken}` },
  });
  const cancelBody = await cancelRes.json().catch(() => ({}));

  const entry = await prisma.waitlistEntry.findFirst({
    where: { showId, categoryId, user: { email: waiterEmail } },
    include: { offers: { orderBy: { expiresAt: "desc" }, take: 1 } },
  });

  const seatsRes = await fetch(`${APP_URL}/api/shows/${showId}/seats`, { cache: "no-store" });
  const seatsBody = await seatsRes.json().catch(() => ({}));
  const seat = seatsBody.seats?.find((s: { seatId: string }) => s.seatId === seatId);

  return NextResponse.json({
    cancelStatus: cancelRes.status,
    cancelBody,
    waiterEntryStatus: entry?.status ?? null,
    offer: entry?.offers?.[0]
      ? { status: entry.offers[0].status, expiresAt: entry.offers[0].expiresAt }
      : null,
    currentSeatStatus: seat?.status ?? null,
  });
}
