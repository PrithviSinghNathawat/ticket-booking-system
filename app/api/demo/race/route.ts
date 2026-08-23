import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ENABLE_DEMO_ROUTES, APP_URL, DEMO_RACE_SEAT_COUNT } from "@/lib/config";
import { ensureDemoRaceFixtures, ensureDemoRacers, clearDemoRaceSeat } from "@/lib/demo";

export async function POST() {
  if (!ENABLE_DEMO_ROUTES) {
    return NextResponse.json({ error: "Demo routes are disabled" }, { status: 404 });
  }

  const { showId, seatId } = await ensureDemoRaceFixtures();
  await clearDemoRaceSeat(showId, seatId);
  const racers = await ensureDemoRacers(DEMO_RACE_SEAT_COUNT);

  const results = await Promise.all(
    racers.map(async (racer) => {
      const start = Date.now();
      try {
        const res = await fetch(`${APP_URL}/api/shows/${showId}/holds`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: `session=${racer.token}` },
          body: JSON.stringify({ seatIds: [seatId] }),
        });
        const body = await res.json().catch(() => ({}));
        return { email: racer.email, status: res.status, ms: Date.now() - start, won: res.status === 201, error: body.error };
      } catch (err) {
        return { email: racer.email, status: 0, ms: Date.now() - start, won: false, error: String(err) };
      }
    })
  );

  const rowCount = await prisma.seatAllocation.count({ where: { showId, seatId } });
  const winner = results.find((r) => r.won);

  return NextResponse.json({ results, winner: winner?.email ?? null, rowCount, seatId, showId });
}
