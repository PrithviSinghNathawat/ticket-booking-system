import { PrismaClient } from "@prisma/client";
import { buildQrPayload } from "@/lib/qr";

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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function registerRacer(email: string): Promise<Racer> {
  const res = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "RacerPass123!", name: email, role: "CUSTOMER" }),
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
  return { status: res.status, body: await res.json() };
}

async function confirmBooking(
  showId: string,
  cookie: string,
  contact: { contactName: string; contactEmail: string; contactPhone: string }
) {
  const res = await fetch(`${BASE_URL}/api/bookings`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ showId, ...contact }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
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

async function scenarioHappyPath(showId: string, seatIds: string[]) {
  console.log("\n1. Happy path");

  await prisma.seatAllocation.deleteMany({ where: { showId, seatId: { in: seatIds } } });
  const user = await registerRacer(`booking-s1-${Date.now()}@ticketing.test`);

  const hold = await postHold(showId, user.cookie, seatIds);
  assert(hold.status === 201, `hold succeeds (got ${hold.status})`);

  const confirm = await confirmBooking(showId, user.cookie, {
    contactName: "Happy Path",
    contactEmail: user.email,
    contactPhone: "+1-555-0001",
  });
  assert(confirm.status === 201, `confirm succeeds (got ${confirm.status})`);

  const reference = confirm.body.reference as string;
  const booking = await prisma.booking.findUnique({ where: { reference }, include: { seats: true } });
  assert(!!booking, "Booking row exists");
  assert(booking?.status === "CONFIRMED", `Booking status is CONFIRMED (got ${booking?.status})`);

  const allocations = await prisma.seatAllocation.findMany({ where: { showId, seatId: { in: seatIds } } });
  assert(
    allocations.every((a) => a.status === "BOOKED" && a.bookingId === booking?.id && a.expiresAt === null),
    "allocations are BOOKED with bookingId set and expiresAt null"
  );
  assert(
    booking?.seats.length === seatIds.length,
    `BookingSeat count matches (${booking?.seats.length} vs ${seatIds.length})`
  );

  const prices = await prisma.showPrice.findMany({ where: { showId } });
  const priceByCategoryId = new Map(prices.map((p) => [p.categoryId, Number(p.price)]));
  const seatRows = await prisma.seat.findMany({ where: { id: { in: seatIds } } });
  const expectedTotal = seatRows.reduce((sum, s) => sum + (priceByCategoryId.get(s.categoryId) ?? 0), 0);
  assert(
    Number(booking?.totalAmount) === expectedTotal,
    `totalAmount (${booking?.totalAmount}) equals sum of ShowPrice (${expectedTotal})`
  );

  return { userIds: [user.userId], bookingId: booking!.id, reference };
}

async function scenarioLapsedHold(showId: string, seatIds: string[], ttlMs: number) {
  console.log("\n2. Lapsed hold");

  await prisma.seatAllocation.deleteMany({ where: { showId, seatId: { in: seatIds } } });
  const user = await registerRacer(`booking-s2-${Date.now()}@ticketing.test`);

  const hold = await postHold(showId, user.cookie, seatIds);
  assert(hold.status === 201, `hold succeeds (got ${hold.status})`);

  await sleep(ttlMs + 1000);

  const confirm = await confirmBooking(showId, user.cookie, {
    contactName: "Lapsed Hold",
    contactEmail: user.email,
    contactPhone: "+1-555-0002",
  });
  assert(confirm.status === 409, `confirm on lapsed hold -> 409 (got ${confirm.status})`);

  const bookingCount = await prisma.booking.count({ where: { userId: user.userId } });
  assert(bookingCount === 0, `no Booking row created (got ${bookingCount})`);

  const allocations = await prisma.seatAllocation.findMany({ where: { showId, seatId: { in: seatIds } } });
  assert(
    allocations.every((a) => a.status === "HELD"),
    "no allocation changed status"
  );

  return [user.userId];
}

async function scenarioNotYourHold(showId: string, seatIds: string[]) {
  console.log("\n3. Not your hold");

  await prisma.seatAllocation.deleteMany({ where: { showId, seatId: { in: seatIds } } });
  const userA = await registerRacer(`booking-s3-a-${Date.now()}@ticketing.test`);
  const userB = await registerRacer(`booking-s3-b-${Date.now()}@ticketing.test`);

  const hold = await postHold(showId, userA.cookie, seatIds);
  assert(hold.status === 201, `A's hold succeeds (got ${hold.status})`);

  const confirm = await confirmBooking(showId, userB.cookie, {
    contactName: "Not Your Hold",
    contactEmail: userB.email,
    contactPhone: "+1-555-0003",
  });
  assert(
    confirm.status >= 400 && confirm.status < 500,
    `B confirming A's hold -> 4xx (got ${confirm.status})`
  );

  const bookingCountB = await prisma.booking.count({ where: { userId: userB.userId } });
  assert(bookingCountB === 0, "B has no Booking row");

  const allocations = await prisma.seatAllocation.findMany({ where: { showId, seatId: { in: seatIds } } });
  assert(
    allocations.every((a) => a.status === "HELD" && a.holderUserId === userA.userId),
    "allocations unchanged, still held by A"
  );

  return [userA.userId, userB.userId];
}

async function scenarioDoubleSubmit(showId: string, seatIds: string[]) {
  console.log("\n4. Double submit");

  await prisma.seatAllocation.deleteMany({ where: { showId, seatId: { in: seatIds } } });
  const user = await registerRacer(`booking-s4-${Date.now()}@ticketing.test`);

  const hold = await postHold(showId, user.cookie, seatIds);
  assert(hold.status === 201, `hold succeeds (got ${hold.status})`);

  const contact = { contactName: "Double Submit", contactEmail: user.email, contactPhone: "+1-555-0004" };
  const [r1, r2] = await Promise.all([
    confirmBooking(showId, user.cookie, contact),
    confirmBooking(showId, user.cookie, contact),
  ]);

  const successCount = [r1, r2].filter((r) => r.status >= 200 && r.status < 300).length;
  assert(successCount === 1, `exactly one 2xx (got ${successCount}: ${r1.status}, ${r2.status})`);

  const bookingCount = await prisma.booking.count({ where: { userId: user.userId, showId } });
  assert(bookingCount === 1, `exactly one Booking row (got ${bookingCount})`);

  const winner = r1.status >= 200 && r1.status < 300 ? r1 : r2;
  const booking = await prisma.booking.findUnique({ where: { reference: winner.body.reference as string } });

  return { userIds: [user.userId], bookingId: booking!.id };
}

async function scenarioVerify(reference: string) {
  console.log("\n5. Verify endpoint");

  const validPayload = buildQrPayload(reference);
  const res1 = await fetch(`${BASE_URL}/api/verify/${encodeURIComponent(validPayload)}`);
  const body1 = (await res1.json()) as { valid: boolean; status?: string };
  assert(body1.valid === true, `valid payload -> valid (got ${JSON.stringify(body1)})`);

  const lastChar = validPayload.slice(-1);
  const tampered = validPayload.slice(0, -1) + (lastChar === "0" ? "1" : "0");
  const res2 = await fetch(`${BASE_URL}/api/verify/${encodeURIComponent(tampered)}`);
  const body2 = (await res2.json()) as { valid: boolean };
  assert(body2.valid === false, `tampered HMAC -> invalid (got ${JSON.stringify(body2)})`);

  const unknownPayload = buildQrPayload("BK-DOESNOTEXIST0");
  const res3 = await fetch(`${BASE_URL}/api/verify/${encodeURIComponent(unknownPayload)}`);
  const body3 = (await res3.json()) as { valid: boolean };
  assert(body3.valid === false, `unknown reference -> invalid (got ${JSON.stringify(body3)})`);

  await prisma.booking.update({ where: { reference }, data: { status: "CANCELLED" } });
  const res4 = await fetch(`${BASE_URL}/api/verify/${encodeURIComponent(validPayload)}`);
  const body4 = (await res4.json()) as { valid: boolean; status?: string };
  assert(
    body4.valid === true && body4.status === "CANCELLED",
    `cancelled booking -> valid structure, CANCELLED status (got ${JSON.stringify(body4)})`
  );
}

async function scenarioDryRun(showId: string, seatIds: string[]) {
  console.log("\n6. Dry run (requires the server to be running with MAIL_DRY_RUN=true)");

  await prisma.seatAllocation.deleteMany({ where: { showId, seatId: { in: seatIds } } });
  const user = await registerRacer(`booking-s6-${Date.now()}@ticketing.test`);

  const hold = await postHold(showId, user.cookie, seatIds);
  assert(hold.status === 201, `hold succeeds (got ${hold.status})`);

  const confirm = await confirmBooking(showId, user.cookie, {
    contactName: "Dry Run",
    contactEmail: user.email,
    contactPhone: "+1-555-0006",
  });
  assert(
    confirm.status === 201,
    `booking succeeds under MAIL_DRY_RUN (got ${confirm.status}) — check the server console for a [MAIL_DRY_RUN] log line for this reference`
  );

  const booking = await prisma.booking.findUnique({ where: { reference: confirm.body.reference as string } });
  return { userIds: [user.userId], bookingId: booking!.id };
}

async function scenarioEmailFailureIsolation(showId: string, seatIds: string[]) {
  console.log("\n7. Email failure isolation (requires the server to be running with an unreachable SMTP_HOST)");

  await prisma.seatAllocation.deleteMany({ where: { showId, seatId: { in: seatIds } } });
  const user = await registerRacer(`booking-s7-${Date.now()}@ticketing.test`);

  const hold = await postHold(showId, user.cookie, seatIds);
  assert(hold.status === 201, `hold succeeds (got ${hold.status})`);

  const confirm = await confirmBooking(showId, user.cookie, {
    contactName: "Email Failure",
    contactEmail: user.email,
    contactPhone: "+1-555-0007",
  });
  assert(confirm.status === 201, `booking still succeeds despite email failure (got ${confirm.status})`);

  const booking = await prisma.booking.findUnique({ where: { reference: confirm.body.reference as string } });
  assert(!!booking, "Booking row still exists despite email failure");

  return { userIds: [user.userId], bookingId: booking!.id };
}

async function scenarioReferenceCollision(showId: string, seatIds: string[]) {
  console.log(
    "\n8. Reference collision retry (requires the server running with FORCE_BOOKING_REFERENCE_FOR_TEST and FORCE_BOOKING_REFERENCE_USES=2)"
  );

  await prisma.seatAllocation.deleteMany({ where: { showId, seatId: { in: seatIds } } });

  const userA = await registerRacer(`booking-s8-a-${Date.now()}@ticketing.test`);
  const holdA = await postHold(showId, userA.cookie, [seatIds[0]]);
  assert(holdA.status === 201, `user A holds a seat (got ${holdA.status})`);
  const confirmA = await confirmBooking(showId, userA.cookie, {
    contactName: "Collision A",
    contactEmail: userA.email,
    contactPhone: "+1-555-0008",
  });
  assert(confirmA.status === 201, `user A's booking succeeds (got ${confirmA.status})`);

  const userB = await registerRacer(`booking-s8-b-${Date.now()}@ticketing.test`);
  const holdB = await postHold(showId, userB.cookie, [seatIds[1]]);
  assert(holdB.status === 201, `user B holds a different seat (got ${holdB.status})`);
  const confirmB = await confirmBooking(showId, userB.cookie, {
    contactName: "Collision B",
    contactEmail: userB.email,
    contactPhone: "+1-555-0009",
  });
  assert(confirmB.status === 201, `user B's booking retries past a reference collision and succeeds (got ${confirmB.status})`);

  const refA = confirmA.body.reference as string;
  const refB = confirmB.body.reference as string;
  assert(!!refA && !!refB && refA !== refB, `the two bookings ended up with different references (A=${refA}, B=${refB})`);

  const dupCount = await prisma.booking.count({ where: { reference: refA } });
  assert(dupCount === 1, `no duplicate reference row exists for ${refA} (got ${dupCount})`);

  const forcedRef = process.env.FORCE_BOOKING_REFERENCE_FOR_TEST;
  if (forcedRef) {
    assert(refA === forcedRef, `user A's booking actually used the forced reference (got ${refA}, expected ${forcedRef})`);
    assert(
      refB !== forcedRef,
      `user B's booking did not end up reusing the forced reference after its retry (got ${refB})`
    );
  } else {
    console.log(
      "  (FORCE_BOOKING_REFERENCE_FOR_TEST not set for this run - the collision path was not actually exercised)"
    );
  }

  return {
    userIds: [userA.userId, userB.userId],
    bookingIds: [confirmA.body.id as string, confirmB.body.id as string],
  };
}

async function main() {
  const ttlMs = Number(process.env.HOLD_TTL_SECONDS ?? 5) * 1000;
  console.log(`Running booking test against BASE_URL=${BASE_URL}, expecting HOLD_TTL_SECONDS=${ttlMs / 1000}`);

  const show = await findShowWithSeats(20);
  const seats = show.venue.seats;

  const allUserIds: string[] = [];
  const allBookingIds: string[] = [];
  const allSeatIds: string[] = [];

  function pick(indices: number[]) {
    const ids = indices.map((i) => seats[i].id);
    allSeatIds.push(...ids);
    return ids;
  }

  const isolatedCollisionRun = !!process.env.FORCE_BOOKING_REFERENCE_FOR_TEST;

  try {
    if (isolatedCollisionRun) {
      console.log(
        "FORCE_BOOKING_REFERENCE_FOR_TEST is set - running scenario 8 in isolation. " +
          "Every other booking-creating scenario would also collide against the same forced " +
          "reference and exhaust the retry budget, so 1-7 are skipped for this run."
      );
      const r8 = await scenarioReferenceCollision(show.id, pick([12, 13]));
      allUserIds.push(...r8.userIds);
      allBookingIds.push(...r8.bookingIds);
    } else {
      const r1 = await scenarioHappyPath(show.id, pick([0, 1]));
      allUserIds.push(...r1.userIds);
      allBookingIds.push(r1.bookingId);

      allUserIds.push(...(await scenarioLapsedHold(show.id, pick([2, 3]), ttlMs)));

      allUserIds.push(...(await scenarioNotYourHold(show.id, pick([4, 5]))));

      const r4 = await scenarioDoubleSubmit(show.id, pick([6, 7]));
      allUserIds.push(...r4.userIds);
      allBookingIds.push(r4.bookingId);

      await scenarioVerify(r1.reference);

      const r6 = await scenarioDryRun(show.id, pick([8, 9]));
      allUserIds.push(...r6.userIds);
      allBookingIds.push(r6.bookingId);

      const r7 = await scenarioEmailFailureIsolation(show.id, pick([10, 11]));
      allUserIds.push(...r7.userIds);
      allBookingIds.push(r7.bookingId);

      console.log(
        "\n8. Reference collision retry - skipped in this run (needs a separate, isolated " +
          "invocation with FORCE_BOOKING_REFERENCE_FOR_TEST set, since it would otherwise " +
          "collide against every other booking this suite creates)"
      );
    }
  } finally {
    console.log("\nCleaning up throwaway users, bookings, and allocations...");
    await prisma.seatAllocation.deleteMany({ where: { showId: show.id, seatId: { in: allSeatIds } } });
    await prisma.bookingSeat.deleteMany({ where: { bookingId: { in: allBookingIds } } });
    await prisma.booking.deleteMany({ where: { id: { in: allBookingIds } } });
    await prisma.user.deleteMany({ where: { id: { in: allUserIds } } });
  }

  console.log(`\n${failures === 0 ? "PASS" : "FAIL"}: ${failures} assertion failure(s)`);
  await prisma.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
