import { PrismaClient } from "@prisma/client";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
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
  return res;
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

async function scenarioSingleSeatRace(showId: string, seatId: string) {
  console.log("\nScenario 1: single seat, 20 racers");

  await prisma.seatAllocation.deleteMany({ where: { showId, seatId } });

  const racers: Racer[] = [];
  for (let i = 0; i < 20; i++) {
    racers.push(await registerRacer(`racer-s1-${i}-${Date.now()}@ticketing.test`));
  }

  const responses = await Promise.all(
    racers.map((racer) => postHold(showId, racer.cookie, [seatId]))
  );
  const statuses = responses.map((r) => r.status);

  const successCount = statuses.filter((s) => s >= 200 && s < 300).length;
  const conflictCount = statuses.filter((s) => s === 409).length;

  assert(successCount === 1, `exactly one 2xx (got ${successCount})`);
  assert(conflictCount === 19, `exactly nineteen 409s (got ${conflictCount})`);

  const rows = await prisma.seatAllocation.findMany({ where: { showId, seatId } });
  assert(rows.length === 1, `exactly one SeatAllocation row exists for the seat (got ${rows.length})`);

  return racers.map((r) => r.userId);
}

async function scenarioOverlappingMultiSeat(
  showId: string,
  seatIdsA: string[],
  seatIdsB: string[]
) {
  console.log("\nScenario 2: overlapping multi-seat claim");

  const allSeatIds = Array.from(new Set([...seatIdsA, ...seatIdsB]));
  await prisma.seatAllocation.deleteMany({ where: { showId, seatId: { in: allSeatIds } } });

  const userA = await registerRacer(`racer-s2-a-${Date.now()}@ticketing.test`);
  const userB = await registerRacer(`racer-s2-b-${Date.now()}@ticketing.test`);

  const [resA, resB] = await Promise.all([
    postHold(showId, userA.cookie, seatIdsA),
    postHold(showId, userB.cookie, seatIdsB),
  ]);

  const aOk = resA.status >= 200 && resA.status < 300;
  const bOk = resB.status >= 200 && resB.status < 300;

  assert(aOk !== bOk, `exactly one of the two requests fully succeeds (A=${resA.status}, B=${resB.status})`);

  const winner = aOk ? userA : userB;
  const loser = aOk ? userB : userA;
  const winnerSeatIds = aOk ? seatIdsA : seatIdsB;

  const winnerRows = await prisma.seatAllocation.findMany({
    where: { showId, holderUserId: winner.userId },
  });
  const loserRows = await prisma.seatAllocation.findMany({
    where: { showId, holderUserId: loser.userId },
  });

  assert(
    winnerRows.length === winnerSeatIds.length,
    `winner holds exactly its ${winnerSeatIds.length} requested seats (got ${winnerRows.length})`
  );
  assert(loserRows.length === 0, `loser holds zero seats, not a partial claim (got ${loserRows.length})`);

  return [userA.userId, userB.userId];
}

async function scenarioNonOverlappingBothSucceed(
  showId: string,
  seatIdsA: string[],
  seatIdsB: string[]
) {
  console.log("\nScenario 3: non-overlapping multi-seat claims, both succeed");

  const allSeatIds = Array.from(new Set([...seatIdsA, ...seatIdsB]));
  await prisma.seatAllocation.deleteMany({ where: { showId, seatId: { in: allSeatIds } } });

  const userA = await registerRacer(`racer-s3-a-${Date.now()}@ticketing.test`);
  const userB = await registerRacer(`racer-s3-b-${Date.now()}@ticketing.test`);

  const [resA, resB] = await Promise.all([
    postHold(showId, userA.cookie, seatIdsA),
    postHold(showId, userB.cookie, seatIdsB),
  ]);

  assert(resA.status >= 200 && resA.status < 300, `user A's request succeeds (got ${resA.status})`);
  assert(resB.status >= 200 && resB.status < 300, `user B's request succeeds (got ${resB.status})`);

  const rowsA = await prisma.seatAllocation.findMany({ where: { showId, holderUserId: userA.userId } });
  const rowsB = await prisma.seatAllocation.findMany({ where: { showId, holderUserId: userB.userId } });

  assert(
    rowsA.length === seatIdsA.length,
    `user A holds exactly its ${seatIdsA.length} requested seats (got ${rowsA.length})`
  );
  assert(
    rowsB.length === seatIdsB.length,
    `user B holds exactly its ${seatIdsB.length} requested seats (got ${rowsB.length})`
  );

  return [userA.userId, userB.userId];
}

async function main() {
  console.log(`Running concurrency test against BASE_URL=${BASE_URL}`);

  const show = await findShowWithSeats(10);
  const seats = show.venue.seats;
  const seatSingle = seats[0].id;
  const seatIdsA = [seats[1].id, seats[2].id, seats[3].id];
  const seatIdsB = [seats[3].id, seats[4].id, seats[5].id];
  const seatIdsC = [seats[6].id, seats[7].id];
  const seatIdsD = [seats[8].id, seats[9].id];

  const createdUserIds: string[] = [];

  try {
    createdUserIds.push(...(await scenarioSingleSeatRace(show.id, seatSingle)));
    createdUserIds.push(...(await scenarioOverlappingMultiSeat(show.id, seatIdsA, seatIdsB)));
    createdUserIds.push(...(await scenarioNonOverlappingBothSucceed(show.id, seatIdsC, seatIdsD)));
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
