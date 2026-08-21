import { PrismaClient } from "@prisma/client";
import { expiredHoldWhere } from "@/lib/allocations";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const TTL_MS = Number(process.env.HOLD_TTL_SECONDS ?? 5) * 1000;
const prisma = new PrismaClient();

type Racer = { email: string; cookie: string; userId: string };

let failures = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  PASS  ${message}`);
  } else {
    console.log(`  FAIL  ${message}`);
    failures += 1;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function registerRacer(email: string): Promise<Racer> {
  const res = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password: "RacerPass123!",
      name: email,
      role: "CUSTOMER",
    }),
  });
  if (res.status !== 201) {
    throw new Error(`register failed for ${email}: ${res.status} ${await res.text()}`);
  }
  const cookie = res.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) throw new Error(`no session cookie returned for ${email}`);
  const body = (await res.json()) as { id: string };
  return { email, cookie, userId: body.id };
}

async function postHold(showId: string, cookie: string, seatIds: string[]) {
  const res = await fetch(`${BASE_URL}/api/shows/${showId}/holds`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ seatIds }),
  });
  const body = (await res.json()) as Record<string, unknown>;
  return { status: res.status, body };
}

async function getSeats(showId: string, cookie?: string) {
  const res = await fetch(`${BASE_URL}/api/shows/${showId}/seats`, {
    headers: cookie ? { Cookie: cookie } : {},
  });
  return (await res.json()) as {
    seats: { seatId: string; status: string; expiresAt: string | null }[];
  };
}

async function findShowWithSeats(seatsNeeded: number) {
  const show = await prisma.show.findFirst({
    where: { NOT: { allocations: { some: { status: "BOOKED" } } } },
    orderBy: { id: "asc" },
    include: { venue: { include: { seats: { orderBy: [{ rowLabel: "asc" }, { seatNumber: "asc" }] } } } },
  });
  if (!show) throw new Error("no non-sold-out show found — run the seed script first");
  if (show.venue.seats.length < seatsNeeded) {
    throw new Error(`show ${show.id} does not have ${seatsNeeded} seats`);
  }
  return show;
}

async function scenarioLazyExpiryOnRead(showId: string, seatId: string) {
  console.log("\nS1: lazy expiry on read");

  await prisma.seatAllocation.deleteMany({ where: { showId, seatId } });
  const user = await registerRacer(`ttl-s1-${Date.now()}@ticketing.test`);

  const holdRes = await postHold(showId, user.cookie, [seatId]);
  assert(holdRes.status === 201 || holdRes.status === 200, `initial hold succeeds (got ${holdRes.status})`);

  await sleep(TTL_MS + 1000);

  const seatsAfter = await getSeats(showId);
  const seat = seatsAfter.seats.find((s) => s.seatId === seatId);
  assert(seat?.status === "AVAILABLE", `seat map reports AVAILABLE after TTL (got ${seat?.status})`);

  const rows = await prisma.seatAllocation.findMany({ where: { showId, seatId } });
  assert(rows.length === 1, `the expired row still exists in the database, untouched by the read (got ${rows.length})`);

  return [user.userId];
}

async function scenarioAnotherUserClaimsExpiredSeat(showId: string, seatId: string) {
  console.log("\nS2: another user claims the expired seat");

  const user2 = await registerRacer(`ttl-s2-${Date.now()}@ticketing.test`);
  const res = await postHold(showId, user2.cookie, [seatId]);
  assert(res.status === 201, `second user's hold on the expired seat succeeds (got ${res.status})`);

  const rows = await prisma.seatAllocation.findMany({ where: { showId, seatId } });
  assert(rows.length === 1, `exactly one row exists for the seat afterward (got ${rows.length})`);
  assert(
    rows[0]?.holderUserId === user2.userId,
    `the row belongs to the new user (got holderUserId=${rows[0]?.holderUserId})`
  );

  return [user2.userId];
}

async function scenarioSameUserCanRehold(showId: string, seatIdFirst: string, seatIdSecond: string) {
  console.log("\nS3: same user can re-hold after their own hold expires");

  await prisma.seatAllocation.deleteMany({ where: { showId, seatId: { in: [seatIdFirst, seatIdSecond] } } });
  const user = await registerRacer(`ttl-s3-${Date.now()}@ticketing.test`);

  const firstHold = await postHold(showId, user.cookie, [seatIdFirst]);
  assert(firstHold.status === 201, `first hold succeeds (got ${firstHold.status})`);

  await sleep(TTL_MS + 1000);

  const secondHold = await postHold(showId, user.cookie, [seatIdSecond]);
  assert(
    secondHold.status === 201,
    `re-hold on the same show after expiry succeeds, not 409 (got ${secondHold.status})`
  );

  return [user.userId];
}

async function scenarioActiveHoldsStillBlock(showId: string, seatIdA: string, seatIdB: string) {
  console.log("\nS4: active holds still block a second hold");

  await prisma.seatAllocation.deleteMany({ where: { showId, seatId: { in: [seatIdA, seatIdB] } } });
  const user = await registerRacer(`ttl-s4-${Date.now()}@ticketing.test`);

  const firstHold = await postHold(showId, user.cookie, [seatIdA]);
  assert(firstHold.status === 201, `first hold succeeds (got ${firstHold.status})`);

  const secondHold = await postHold(showId, user.cookie, [seatIdB]);
  assert(secondHold.status === 409, `second hold while first is active is rejected (got ${secondHold.status})`);
  assert(
    typeof secondHold.body.error === "string" &&
      (secondHold.body.error as string).toLowerCase().includes("already have an active hold"),
    `409 body names "already have an active hold", not a seat-taken conflict (got: ${JSON.stringify(secondHold.body)})`
  );

  return [user.userId];
}

async function scenarioSweepAuth(showId: string, seatId: string) {
  console.log("\nS5: sweep auth and deletedHolds count");

  await prisma.seatAllocation.deleteMany({ where: { showId, seatId } });
  const user = await registerRacer(`ttl-s5-${Date.now()}@ticketing.test`);

  const hold = await postHold(showId, user.cookie, [seatId]);
  assert(hold.status === 201, `seeded hold for the sweep test succeeds (got ${hold.status})`);

  await sleep(TTL_MS + 1000);

  const noHeaderRes = await fetch(`${BASE_URL}/api/cron/sweep`, { method: "POST" });
  assert(noHeaderRes.status === 401, `no Authorization header -> 401 (got ${noHeaderRes.status})`);

  const wrongRes = await fetch(`${BASE_URL}/api/cron/sweep`, {
    method: "POST",
    headers: { Authorization: "Bearer wrong-secret-value" },
  });
  assert(wrongRes.status === 401, `wrong bearer token -> 401 (got ${wrongRes.status})`);

  const now = new Date();
  const expiredBefore = await prisma.seatAllocation.count({ where: expiredHoldWhere(now) });

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) throw new Error("CRON_SECRET not set in environment");

  const correctRes = await fetch(`${BASE_URL}/api/cron/sweep`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cronSecret}` },
  });
  const correctBody = (await correctRes.json()) as { deletedHolds: number };
  assert(correctRes.status === 200, `correct bearer token -> 200 (got ${correctRes.status})`);
  assert(
    correctBody.deletedHolds === expiredBefore,
    `deletedHolds (${correctBody.deletedHolds}) matches expired rows counted beforehand (${expiredBefore})`
  );

  const secondRes = await fetch(`${BASE_URL}/api/cron/sweep`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cronSecret}` },
  });
  const secondBody = (await secondRes.json()) as { deletedHolds: number };
  assert(secondRes.status === 200, `immediate second call still returns 200 (got ${secondRes.status})`);
  assert(
    secondBody.deletedHolds === 0,
    `immediate second call deletes nothing, idempotent (got ${secondBody.deletedHolds})`
  );

  return [user.userId];
}

async function main() {
  console.log(`Running TTL test against BASE_URL=${BASE_URL}, expecting HOLD_TTL_SECONDS=${TTL_MS / 1000}`);

  const show = await findShowWithSeats(30);
  const seats = show.venue.seats.slice(20);

  const createdUserIds: string[] = [];

  try {
    createdUserIds.push(...(await scenarioLazyExpiryOnRead(show.id, seats[0].id)));
    createdUserIds.push(...(await scenarioAnotherUserClaimsExpiredSeat(show.id, seats[0].id)));
    createdUserIds.push(...(await scenarioSameUserCanRehold(show.id, seats[1].id, seats[2].id)));
    createdUserIds.push(...(await scenarioActiveHoldsStillBlock(show.id, seats[3].id, seats[4].id)));
    createdUserIds.push(...(await scenarioSweepAuth(show.id, seats[5].id)));
  } finally {
    console.log("\nCleaning up throwaway users and their allocations...");
    await prisma.seatAllocation.deleteMany({ where: { holderUserId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }

  console.log(`\n${failures === 0 ? "PASS" : "FAIL"}: ${failures} assertion failure(s)`);
  await prisma.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
