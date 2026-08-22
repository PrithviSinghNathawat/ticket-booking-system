import { PrismaClient } from "@prisma/client";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const WAITLIST_TTL_MS = Number(process.env.WAITLIST_OFFER_TTL_SECONDS ?? 5) * 1000;
const prisma = new PrismaClient();

type Racer = { email: string; cookie: string; userId: string };

let failures = 0;
const allUserIds: string[] = [];
const allBookingIds: string[] = [];

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
  allUserIds.push(body.id);
  return { email, cookie, userId: body.id };
}

async function holdAndConfirm(
  cookie: string,
  showId: string,
  seatId: string,
  contact: { contactName: string; contactEmail: string; contactPhone: string }
): Promise<{ id: string; reference: string }> {
  const holdRes = await fetch(`${BASE_URL}/api/shows/${showId}/holds`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ seatIds: [seatId] }),
  });
  if (holdRes.status !== 201) {
    throw new Error(`hold failed for seat ${seatId}: ${holdRes.status} ${await holdRes.text()}`);
  }

  const confirmRes = await fetch(`${BASE_URL}/api/bookings`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ showId, ...contact }),
  });
  if (confirmRes.status !== 201) {
    throw new Error(`confirm failed for seat ${seatId}: ${confirmRes.status} ${await confirmRes.text()}`);
  }
  const body = (await confirmRes.json()) as { id: string; reference: string };
  allBookingIds.push(body.id);
  return body;
}

async function confirmBooking(
  cookie: string,
  showId: string,
  contact: { contactName: string; contactEmail: string; contactPhone: string }
) {
  const res = await fetch(`${BASE_URL}/api/bookings`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ showId, ...contact }),
  });
  const body = (await res.json()) as { id?: string; reference?: string; error?: string };
  if (res.status === 201 && body.id) allBookingIds.push(body.id);
  return { status: res.status, body };
}

async function joinWaitlist(cookie: string, showId: string, categoryId: string) {
  const res = await fetch(`${BASE_URL}/api/shows/${showId}/waitlist`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ categoryId }),
  });
  return { status: res.status, body: await res.json() };
}

async function cancelBooking(cookie: string, reference: string) {
  const res = await fetch(`${BASE_URL}/api/bookings/${reference}/cancel`, {
    method: "POST",
    headers: { Cookie: cookie },
  });
  return { status: res.status, body: await res.json() };
}

async function claimOffer(cookie: string, token: string) {
  const res = await fetch(`${BASE_URL}/api/waitlist/claim`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ token }),
  });
  return { status: res.status, body: await res.json() };
}

async function getSeatStatus(showId: string, seatId: string) {
  const res = await fetch(`${BASE_URL}/api/shows/${showId}/seats`);
  const body = (await res.json()) as { seats: { seatId: string; status: string }[] };
  return body.seats.find((s) => s.seatId === seatId);
}

async function processWaitlistNow(showId: string) {
  await fetch(`${BASE_URL}/api/shows/${showId}/waitlist/process`, { method: "POST" });
}

async function findShowAndCategories() {
  const show = await prisma.show.findFirst({
    where: { NOT: { allocations: { some: { status: "BOOKED" } } } },
    orderBy: { id: "asc" },
    include: { prices: { include: { category: true } } },
  });
  if (!show) throw new Error("no non-sold-out show found — run the seed script first");
  if (show.prices.length < 2) throw new Error("show needs at least 2 categories");
  return { show, categoryX: show.prices[0], categoryY: show.prices[1] };
}

async function resetCategory(showId: string, categoryId: string): Promise<string[]> {
  const seats = await prisma.seat.findMany({ where: { categoryId } });
  const seatIds = seats.map((s) => s.id);
  await prisma.seatAllocation.deleteMany({ where: { showId, seatId: { in: seatIds } } });
  await prisma.waitlistOffer.deleteMany({ where: { waitlistEntry: { showId, categoryId } } });
  await prisma.waitlistEntry.deleteMany({ where: { showId, categoryId } });
  return seatIds;
}

async function fillCategoryExcept(
  showId: string,
  categoryId: string,
  fillerUserId: string,
  exceptSeatIds: string[]
) {
  const seats = await prisma.seat.findMany({ where: { categoryId } });
  const farFuture = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const toFill = seats.filter((s) => !exceptSeatIds.includes(s.id));
  await prisma.seatAllocation.createMany({
    data: toFill.map((s) => ({
      showId,
      seatId: s.id,
      status: "HELD" as const,
      holderUserId: fillerUserId,
      expiresAt: farFuture,
    })),
  });
}

async function scenario1(showId: string, categoryXId: string, categoryYId: string, fillerUserId: string) {
  console.log("\n1. Join sold-out category -> 201; join category with availability -> 400");
  await resetCategory(showId, categoryXId);
  await fillCategoryExcept(showId, categoryXId, fillerUserId, []);
  await resetCategory(showId, categoryYId);

  const user = await registerRacer(`wl-s1-${Date.now()}@ticketing.test`);
  const soldOut = await joinWaitlist(user.cookie, showId, categoryXId);
  assert(soldOut.status === 201, `join sold-out category -> 201 (got ${soldOut.status})`);

  const available = await joinWaitlist(user.cookie, showId, categoryYId);
  assert(available.status === 400, `join category with availability -> 400 (got ${available.status})`);
}

async function scenario2(showId: string, categoryXId: string, fillerUserId: string) {
  console.log("\n2. Duplicate join is idempotent");
  await resetCategory(showId, categoryXId);
  await fillCategoryExcept(showId, categoryXId, fillerUserId, []);

  const user = await registerRacer(`wl-s2-${Date.now()}@ticketing.test`);
  const first = await joinWaitlist(user.cookie, showId, categoryXId);
  assert(first.status === 201, `first join -> 201 (got ${first.status})`);

  const second = await joinWaitlist(user.cookie, showId, categoryXId);
  assert(second.status === 200, `duplicate join -> 200 idempotent, not 409 (got ${second.status})`);

  const count = await prisma.waitlistEntry.count({
    where: { showId, categoryId: categoryXId, userId: user.userId },
  });
  assert(count === 1, `exactly one WaitlistEntry row (got ${count})`);
}

async function scenario3(showId: string, categoryXId: string, fillerUserId: string) {
  console.log("\n3. Cancel a booking -> oldest waiter offered, seat never publicly available");
  const seatIds = await resetCategory(showId, categoryXId);
  const bookedSeatId = seatIds[0];
  await fillCategoryExcept(showId, categoryXId, fillerUserId, [bookedSeatId]);

  const booker = await registerRacer(`wl-s3-booker-${Date.now()}@ticketing.test`);
  const booking = await holdAndConfirm(booker.cookie, showId, bookedSeatId, {
    contactName: "Booker",
    contactEmail: booker.email,
    contactPhone: "+1-555-1000",
  });

  const waiter = await registerRacer(`wl-s3-waiter-${Date.now()}@ticketing.test`);
  const join = await joinWaitlist(waiter.cookie, showId, categoryXId);
  assert(join.status === 201, `waiter joins sold-out category -> 201 (got ${join.status})`);

  const cancel = await cancelBooking(booker.cookie, booking.reference);
  assert(cancel.status === 200, `cancel booking succeeds (got ${cancel.status})`);

  const entry = await prisma.waitlistEntry.findUnique({
    where: { showId_categoryId_userId: { showId, categoryId: categoryXId, userId: waiter.userId } },
  });
  assert(entry?.status === "OFFERED", `waiter's entry is OFFERED (got ${entry?.status})`);

  const allocation = await prisma.seatAllocation.findUnique({
    where: { showId_seatId: { showId, seatId: bookedSeatId } },
  });
  assert(
    allocation?.status === "HELD" && allocation.holderUserId === waiter.userId,
    `HELD allocation exists for the waiter (got ${JSON.stringify(allocation)})`
  );

  const seatNow = await getSeatStatus(showId, bookedSeatId);
  assert(seatNow?.status !== "AVAILABLE", `seat map never reports the seat AVAILABLE (got ${seatNow?.status})`);
}

async function scenario4(showId: string, categoryXId: string, fillerUserId: string) {
  console.log("\n4. FIFO: oldest waiter offered first");
  const seatIds = await resetCategory(showId, categoryXId);
  const bookedSeatId = seatIds[0];
  await fillCategoryExcept(showId, categoryXId, fillerUserId, [bookedSeatId]);

  const booker = await registerRacer(`wl-s4-booker-${Date.now()}@ticketing.test`);
  const booking = await holdAndConfirm(booker.cookie, showId, bookedSeatId, {
    contactName: "Booker",
    contactEmail: booker.email,
    contactPhone: "+1-555-1001",
  });

  const w1 = await registerRacer(`wl-s4-w1-${Date.now()}@ticketing.test`);
  await joinWaitlist(w1.cookie, showId, categoryXId);
  await sleep(50);
  const w2 = await registerRacer(`wl-s4-w2-${Date.now()}@ticketing.test`);
  await joinWaitlist(w2.cookie, showId, categoryXId);
  await sleep(50);
  const w3 = await registerRacer(`wl-s4-w3-${Date.now()}@ticketing.test`);
  await joinWaitlist(w3.cookie, showId, categoryXId);

  await cancelBooking(booker.cookie, booking.reference);

  const e1 = await prisma.waitlistEntry.findUnique({
    where: { showId_categoryId_userId: { showId, categoryId: categoryXId, userId: w1.userId } },
  });
  const e2 = await prisma.waitlistEntry.findUnique({
    where: { showId_categoryId_userId: { showId, categoryId: categoryXId, userId: w2.userId } },
  });
  const e3 = await prisma.waitlistEntry.findUnique({
    where: { showId_categoryId_userId: { showId, categoryId: categoryXId, userId: w3.userId } },
  });

  assert(e1?.status === "OFFERED", `oldest waiter (w1) is OFFERED (got ${e1?.status})`);
  assert(e2?.status === "WAITING", `w2 still WAITING (got ${e2?.status})`);
  assert(e3?.status === "WAITING", `w3 still WAITING (got ${e3?.status})`);

  return { seatId: bookedSeatId, w1, w2, w3, categoryId: categoryXId };
}

async function scenario5(
  showId: string,
  state: { seatId: string; w1: Racer; categoryId: string }
) {
  console.log("\n5. Claim within the window -> booking created, entry CONVERTED, offer CLAIMED");

  const offer = await prisma.waitlistOffer.findFirst({
    where: { waitlistEntry: { showId, categoryId: state.categoryId, userId: state.w1.userId }, status: "PENDING" },
  });
  assert(!!offer, "a PENDING offer exists for w1");

  const claim = await claimOffer(state.w1.cookie, offer!.token);
  assert(claim.status === 200, `claim succeeds (got ${claim.status})`);
  assert(claim.body.showId === showId, "claim response names the correct showId");

  const confirm = await confirmBooking(state.w1.cookie, showId, {
    contactName: "Waiter One",
    contactEmail: state.w1.email,
    contactPhone: "+1-555-1002",
  });
  assert(confirm.status === 201, `completing checkout succeeds (got ${confirm.status})`);

  const entryAfter = await prisma.waitlistEntry.findUnique({
    where: { showId_categoryId_userId: { showId, categoryId: state.categoryId, userId: state.w1.userId } },
  });
  assert(entryAfter?.status === "CONVERTED", `w1 entry is CONVERTED (got ${entryAfter?.status})`);

  const offerAfter = await prisma.waitlistOffer.findUnique({ where: { id: offer!.id } });
  assert(offerAfter?.status === "CLAIMED", `offer is CLAIMED (got ${offerAfter?.status})`);
}

async function scenario6(showId: string, categoryXId: string, fillerUserId: string) {
  console.log("\n6. Offer lapses -> processWaitlist promotes the next waiter");
  const seatIds = await resetCategory(showId, categoryXId);
  const bookedSeatId = seatIds[0];
  await fillCategoryExcept(showId, categoryXId, fillerUserId, [bookedSeatId]);

  const booker = await registerRacer(`wl-s6-booker-${Date.now()}@ticketing.test`);
  const booking = await holdAndConfirm(booker.cookie, showId, bookedSeatId, {
    contactName: "Booker",
    contactEmail: booker.email,
    contactPhone: "+1-555-1003",
  });

  const w1 = await registerRacer(`wl-s6-w1-${Date.now()}@ticketing.test`);
  await joinWaitlist(w1.cookie, showId, categoryXId);
  await sleep(50);
  const w2 = await registerRacer(`wl-s6-w2-${Date.now()}@ticketing.test`);
  await joinWaitlist(w2.cookie, showId, categoryXId);

  await cancelBooking(booker.cookie, booking.reference);

  let e1 = await prisma.waitlistEntry.findUnique({
    where: { showId_categoryId_userId: { showId, categoryId: categoryXId, userId: w1.userId } },
  });
  assert(e1?.status === "OFFERED", `w1 offered initially (got ${e1?.status})`);

  await sleep(WAITLIST_TTL_MS + 1000);
  await processWaitlistNow(showId);

  e1 = await prisma.waitlistEntry.findUnique({
    where: { showId_categoryId_userId: { showId, categoryId: categoryXId, userId: w1.userId } },
  });
  const e2 = await prisma.waitlistEntry.findUnique({
    where: { showId_categoryId_userId: { showId, categoryId: categoryXId, userId: w2.userId } },
  });

  assert(e1?.status === "EXPIRED", `w1 entry EXPIRED after lapse (got ${e1?.status})`);
  assert(e2?.status === "OFFERED", `w2 entry OFFERED after promotion (got ${e2?.status})`);

  const seatNow = await getSeatStatus(showId, bookedSeatId);
  assert(seatNow?.status !== "AVAILABLE", `seat map never reports the seat AVAILABLE (got ${seatNow?.status})`);

  return { w1, w2, categoryId: categoryXId };
}

async function scenario7(showId: string, state: { w1: Racer; w2: Racer; categoryId: string }) {
  console.log("\n7. Claim someone else's token -> 404; claim an expired token -> 410");

  const w2Offer = await prisma.waitlistOffer.findFirst({
    where: { waitlistEntry: { showId, categoryId: state.categoryId, userId: state.w2.userId }, status: "PENDING" },
  });
  assert(!!w2Offer, "w2 has a PENDING offer to test against");

  const intruder = await registerRacer(`wl-s7-intruder-${Date.now()}@ticketing.test`);
  const wrongClaim = await claimOffer(intruder.cookie, w2Offer!.token);
  assert(wrongClaim.status === 404, `claiming someone else's token -> 404 (got ${wrongClaim.status})`);

  const w1ExpiredOffer = await prisma.waitlistOffer.findFirst({
    where: { waitlistEntry: { showId, categoryId: state.categoryId, userId: state.w1.userId }, status: "EXPIRED" },
    orderBy: { expiresAt: "desc" },
  });
  assert(!!w1ExpiredOffer, "an expired offer exists to test against");

  const expiredClaim = await claimOffer(state.w1.cookie, w1ExpiredOffer!.token);
  assert(
    expiredClaim.status === 410,
    `claiming an expired token (as its rightful owner) -> 410 (got ${expiredClaim.status})`
  );
}

async function scenario8(showId: string, categoryXId: string, fillerUserId: string) {
  console.log("\n8. Two concurrent cancellations releasing seats in the same category -> no double-offers");
  const seatIds = await resetCategory(showId, categoryXId);
  const seatA = seatIds[0];
  const seatB = seatIds[1];
  await fillCategoryExcept(showId, categoryXId, fillerUserId, [seatA, seatB]);

  const bookerA = await registerRacer(`wl-s8-bookerA-${Date.now()}@ticketing.test`);
  const bookingA = await holdAndConfirm(bookerA.cookie, showId, seatA, {
    contactName: "Booker A",
    contactEmail: bookerA.email,
    contactPhone: "+1-555-1004",
  });
  const bookerB = await registerRacer(`wl-s8-bookerB-${Date.now()}@ticketing.test`);
  const bookingB = await holdAndConfirm(bookerB.cookie, showId, seatB, {
    contactName: "Booker B",
    contactEmail: bookerB.email,
    contactPhone: "+1-555-1005",
  });

  const w1 = await registerRacer(`wl-s8-w1-${Date.now()}@ticketing.test`);
  await joinWaitlist(w1.cookie, showId, categoryXId);
  await sleep(50);
  const w2 = await registerRacer(`wl-s8-w2-${Date.now()}@ticketing.test`);
  await joinWaitlist(w2.cookie, showId, categoryXId);

  const [cancelA, cancelB] = await Promise.all([
    cancelBooking(bookerA.cookie, bookingA.reference),
    cancelBooking(bookerB.cookie, bookingB.reference),
  ]);
  assert(
    cancelA.status === 200 && cancelB.status === 200,
    `both cancellations succeed (got ${cancelA.status}, ${cancelB.status})`
  );

  await processWaitlistNow(showId);

  const e1 = await prisma.waitlistEntry.findUnique({
    where: { showId_categoryId_userId: { showId, categoryId: categoryXId, userId: w1.userId } },
  });
  const e2 = await prisma.waitlistEntry.findUnique({
    where: { showId_categoryId_userId: { showId, categoryId: categoryXId, userId: w2.userId } },
  });

  assert(e1?.status === "OFFERED", `w1 offered (got ${e1?.status})`);
  assert(e2?.status === "OFFERED", `w2 offered (got ${e2?.status})`);

  const offerW1 = await prisma.waitlistOffer.findFirst({
    where: { waitlistEntry: { userId: w1.userId, showId, categoryId: categoryXId }, status: "PENDING" },
  });
  const offerW2 = await prisma.waitlistOffer.findFirst({
    where: { waitlistEntry: { userId: w2.userId, showId, categoryId: categoryXId }, status: "PENDING" },
  });

  const offersForW1 = await prisma.waitlistOffer.count({
    where: { waitlistEntry: { userId: w1.userId, showId, categoryId: categoryXId }, status: "PENDING" },
  });
  const offersForW2 = await prisma.waitlistOffer.count({
    where: { waitlistEntry: { userId: w2.userId, showId, categoryId: categoryXId }, status: "PENDING" },
  });

  assert(offersForW1 === 1, `w1 has exactly one PENDING offer (got ${offersForW1})`);
  assert(offersForW2 === 1, `w2 has exactly one PENDING offer (got ${offersForW2})`);
  assert(
    !!offerW1 && !!offerW2 && offerW1.seatId !== offerW2.seatId,
    "w1 and w2 were offered distinct seats, not the same seat twice"
  );
}

async function scenario9(showId: string, categoryXId: string, fillerUserId: string) {
  console.log("\n9. Cancel an already-cancelled booking -> 409");
  const seatIds = await resetCategory(showId, categoryXId);
  const seatId = seatIds[0];
  await fillCategoryExcept(showId, categoryXId, fillerUserId, [seatId]);

  const booker = await registerRacer(`wl-s9-booker-${Date.now()}@ticketing.test`);
  const booking = await holdAndConfirm(booker.cookie, showId, seatId, {
    contactName: "Booker",
    contactEmail: booker.email,
    contactPhone: "+1-555-1006",
  });

  const first = await cancelBooking(booker.cookie, booking.reference);
  assert(first.status === 200, `first cancel succeeds (got ${first.status})`);

  const second = await cancelBooking(booker.cookie, booking.reference);
  assert(second.status === 409, `cancelling again -> 409 (got ${second.status})`);
}

async function scenario10(showId: string, categoryXId: string, fillerUserId: string) {
  console.log("\n10. Cancelling preserves BookingSeat history rows");
  const seatIds = await resetCategory(showId, categoryXId);
  const seatId = seatIds[0];
  await fillCategoryExcept(showId, categoryXId, fillerUserId, [seatId]);

  const booker = await registerRacer(`wl-s10-booker-${Date.now()}@ticketing.test`);
  const booking = await holdAndConfirm(booker.cookie, showId, seatId, {
    contactName: "Booker",
    contactEmail: booker.email,
    contactPhone: "+1-555-1007",
  });

  const before = await prisma.bookingSeat.count({ where: { bookingId: booking.id } });
  assert(before === 1, `BookingSeat row exists before cancellation (got ${before})`);

  await cancelBooking(booker.cookie, booking.reference);

  const after = await prisma.bookingSeat.count({ where: { bookingId: booking.id } });
  assert(after === before, `BookingSeat rows survive cancellation (got ${after} vs ${before})`);

  const bookingRow = await prisma.booking.findUnique({ where: { id: booking.id } });
  assert(bookingRow?.status === "CANCELLED", `Booking status is CANCELLED (got ${bookingRow?.status})`);
}

async function main() {
  console.log(`Running waitlist test against BASE_URL=${BASE_URL}, expecting WAITLIST_OFFER_TTL_SECONDS=${WAITLIST_TTL_MS / 1000}`);

  const { show, categoryX, categoryY } = await findShowAndCategories();
  const filler = await registerRacer(`wl-filler-${Date.now()}@ticketing.test`);

  try {
    await scenario1(show.id, categoryX.categoryId, categoryY.categoryId, filler.userId);
    await scenario2(show.id, categoryX.categoryId, filler.userId);
    await scenario3(show.id, categoryX.categoryId, filler.userId);
    const s4 = await scenario4(show.id, categoryX.categoryId, filler.userId);
    await scenario5(show.id, s4);
    const s6 = await scenario6(show.id, categoryX.categoryId, filler.userId);
    await scenario7(show.id, s6);
    await scenario8(show.id, categoryX.categoryId, filler.userId);
    await scenario9(show.id, categoryX.categoryId, filler.userId);
    await scenario10(show.id, categoryX.categoryId, filler.userId);
  } finally {
    console.log("\nCleaning up throwaway users, bookings, allocations, and waitlist rows...");
    await resetCategory(show.id, categoryX.categoryId);
    await resetCategory(show.id, categoryY.categoryId);
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
