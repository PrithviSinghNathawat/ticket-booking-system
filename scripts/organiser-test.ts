import { PrismaClient } from "@prisma/client";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const prisma = new PrismaClient();

let failures = 0;
const allUserIds: string[] = [];
const allVenueIds: string[] = [];
const allEventIds: string[] = [];

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  PASS  ${message}`);
  } else {
    console.log(`  FAIL  ${message}`);
    failures += 1;
  }
}

async function registerCustomer(email: string) {
  const res = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "RacerPass123!", name: email, role: "CUSTOMER" }),
  });
  if (res.status !== 201) throw new Error(`customer register failed: ${res.status} ${await res.text()}`);
  const cookie = res.headers.get("set-cookie")!.split(";")[0];
  const body = (await res.json()) as { id: string };
  allUserIds.push(body.id);
  return { email, cookie, userId: body.id };
}

async function registerOrganiser(email: string) {
  const inviteCode = process.env.ORGANISER_SIGNUP_CODE;
  if (!inviteCode) throw new Error("ORGANISER_SIGNUP_CODE not set in environment");
  const res = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "RacerPass123!", name: email, role: "ORGANISER", inviteCode }),
  });
  if (res.status !== 201) throw new Error(`organiser register failed: ${res.status} ${await res.text()}`);
  const cookie = res.headers.get("set-cookie")!.split(";")[0];
  const body = (await res.json()) as { id: string };
  allUserIds.push(body.id);
  return { cookie, userId: body.id };
}

async function login(email: string, password: string) {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status} ${await res.text()}`);
  return res.headers.get("set-cookie")!.split(";")[0];
}

async function call(method: string, path: string, cookie: string | undefined, body?: unknown) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON */
  }
  return { status: res.status, body: json };
}

async function scenario1VenueCreation(adminCookie: string) {
  console.log("\n1. Venue creation produces the exact seat count with correct category assignment");

  const res = await call("POST", "/api/venues", adminCookie, {
    name: `Test Venue ${Date.now()}`,
    address: "1 Test St",
    categories: [{ name: "Gold" }, { name: "Silver" }],
    rows: [
      { label: "A", seatCount: 6, categoryName: "Gold" },
      { label: "B", seatCount: 4, categoryName: "Silver" },
    ],
  });
  assert(res.status === 201, `venue created (got ${res.status})`);
  const venueId = res.body.id as string;
  allVenueIds.push(venueId);

  const seats = await prisma.seat.findMany({ where: { venueId }, include: { category: true } });
  assert(seats.length === 10, `exact seat count: 10 (got ${seats.length})`);

  const goldSeats = seats.filter((s) => s.category.name === "Gold");
  const silverSeats = seats.filter((s) => s.category.name === "Silver");
  assert(goldSeats.length === 6, `Gold row has 6 seats (got ${goldSeats.length})`);
  assert(silverSeats.length === 4, `Silver row has 4 seats (got ${silverSeats.length})`);
  assert(
    goldSeats.every((s) => s.rowLabel === "A") && silverSeats.every((s) => s.rowLabel === "B"),
    "seats assigned to the correct row labels"
  );

  return venueId;
}

async function scenario2LayoutEdit(adminCookie: string, organiserCookie: string, customerCookie: string, customer: { email: string; userId: string }) {
  console.log("\n2. Layout edit refused with a confirmed booking; permitted without one");

  const venueRes = await call("POST", "/api/venues", adminCookie, {
    name: `Layout Test Venue ${Date.now()}`,
    address: "2 Test St",
    categories: [{ name: "General" }],
    rows: [{ label: "A", seatCount: 3, categoryName: "General" }],
  });
  const venueId = venueRes.body.id as string;
  allVenueIds.push(venueId);

  const eventRes = await call("POST", "/api/events", organiserCookie, {
    title: `Layout Test Event ${Date.now()}`,
    type: "MOVIE",
    description: "test",
  });
  const eventId = eventRes.body.id as string;
  allEventIds.push(eventId);

  const venue = await prisma.venue.findUnique({ where: { id: venueId }, include: { categories: true } });
  const categoryId = venue!.categories[0].id;

  const showRes = await call("POST", `/api/events/${eventId}/shows`, organiserCookie, {
    venueId,
    startsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    prices: [{ categoryId, price: 50 }],
  });
  const showId = showRes.body.id as string;

  const editBody = {
    categories: [{ name: "General" }],
    rows: [{ label: "A", seatCount: 5, categoryName: "General" }],
  };

  const beforeBooking = await call("PATCH", `/api/venues/${venueId}`, adminCookie, editBody);
  assert(beforeBooking.status === 200, `layout edit permitted before any booking (got ${beforeBooking.status})`);

  const seat = await prisma.seat.findFirst({ where: { venueId } });
  await call("POST", `/api/shows/${showId}/holds`, customerCookie, { seatIds: [seat!.id] });
  const confirm = await call("POST", "/api/bookings", customerCookie, {
    showId,
    contactName: "Layout Tester",
    contactEmail: customer.email,
    contactPhone: "+1-555-2000",
  });
  assert(confirm.status === 201, `seed a confirmed booking (got ${confirm.status})`);

  const afterBooking = await call("PATCH", `/api/venues/${venueId}`, adminCookie, editBody);
  assert(afterBooking.status === 409, `layout edit refused once a confirmed booking exists (got ${afterBooking.status})`);

  return { venueId, eventId, showId, reference: confirm.body.reference as string };
}

async function scenario3ShowValidation(adminCookie: string, organiserCookie: string) {
  console.log("\n3. Show creation validation: missing category price -> 400; past startsAt -> 400");

  const venueRes = await call("POST", "/api/venues", adminCookie, {
    name: `Validation Venue ${Date.now()}`,
    address: "3 Test St",
    categories: [{ name: "A" }, { name: "B" }],
    rows: [
      { label: "A", seatCount: 2, categoryName: "A" },
      { label: "B", seatCount: 2, categoryName: "B" },
    ],
  });
  const venueId = venueRes.body.id as string;
  allVenueIds.push(venueId);

  const eventRes = await call("POST", "/api/events", organiserCookie, {
    title: `Validation Event ${Date.now()}`,
    type: "MOVIE",
    description: "test",
  });
  const eventId = eventRes.body.id as string;
  allEventIds.push(eventId);

  const venue = await prisma.venue.findUnique({ where: { id: venueId }, include: { categories: true } });
  const [catA] = venue!.categories;

  const missingPriceRes = await call("POST", `/api/events/${eventId}/shows`, organiserCookie, {
    venueId,
    startsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    prices: [{ categoryId: catA.id, price: 10 }],
  });
  assert(missingPriceRes.status === 400, `missing category price -> 400 (got ${missingPriceRes.status})`);

  const pastDateRes = await call("POST", `/api/events/${eventId}/shows`, organiserCookie, {
    venueId,
    startsAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    prices: venue!.categories.map((c) => ({ categoryId: c.id, price: 10 })),
  });
  assert(pastDateRes.status === 400, `past startsAt -> 400 (got ${pastDateRes.status})`);
}

async function scenario4And5Revenue(adminCookie: string, organiserCookie: string) {
  console.log("\n4. Revenue math: book N seats, cancel one, assert revenue and cancelled bucket");
  console.log("5. Price change after booking does not alter historical revenue");

  const venueRes = await call("POST", "/api/venues", adminCookie, {
    name: `Revenue Venue ${Date.now()}`,
    address: "4 Test St",
    categories: [{ name: "General" }],
    rows: [{ label: "A", seatCount: 10, categoryName: "General" }],
  });
  const venueId = venueRes.body.id as string;
  allVenueIds.push(venueId);

  const eventRes = await call("POST", "/api/events", organiserCookie, {
    title: `Revenue Event ${Date.now()}`,
    type: "MOVIE",
    description: "test",
  });
  const eventId = eventRes.body.id as string;
  allEventIds.push(eventId);

  const venue = await prisma.venue.findUnique({ where: { id: venueId }, include: { categories: true } });
  const categoryId = venue!.categories[0].id;
  const originalPrice = 100;

  const showRes = await call("POST", `/api/events/${eventId}/shows`, organiserCookie, {
    venueId,
    startsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    prices: [{ categoryId, price: originalPrice }],
  });
  const showId = showRes.body.id as string;

  const seats = await prisma.seat.findMany({ where: { venueId }, orderBy: { seatNumber: "asc" } });

  const buyerA = await registerCustomer(`revenue-a-${Date.now()}@ticketing.test`);
  await call("POST", `/api/shows/${showId}/holds`, buyerA.cookie, { seatIds: [seats[0].id, seats[1].id] });
  const bookingA = await call("POST", "/api/bookings", buyerA.cookie, {
    showId,
    contactName: "Buyer A",
    contactEmail: buyerA.email,
    contactPhone: "+1-555-3000",
  });
  assert(bookingA.status === 201, `buyer A books 2 seats (got ${bookingA.status})`);

  const buyerB = await registerCustomer(`revenue-b-${Date.now()}@ticketing.test`);
  await call("POST", `/api/shows/${showId}/holds`, buyerB.cookie, { seatIds: [seats[2].id] });
  const bookingB = await call("POST", "/api/bookings", buyerB.cookie, {
    showId,
    contactName: "Buyer B",
    contactEmail: buyerB.email,
    contactPhone: "+1-555-3001",
  });
  assert(bookingB.status === 201, `buyer B books 1 seat (got ${bookingB.status})`);

  const expectedRevenueBeforeCancel = 3 * originalPrice;
  const summary1 = await call("GET", `/api/organiser/events/${eventId}/summary`, organiserCookie);
  const show1 = (summary1.body.shows as { showId: string; confirmedRevenue: number }[]).find(
    (s) => s.showId === showId
  )!;
  assert(
    show1.confirmedRevenue === expectedRevenueBeforeCancel,
    `revenue equals sum of booked seat prices (got ${show1.confirmedRevenue}, expected ${expectedRevenueBeforeCancel})`
  );

  const bookingBReference = bookingB.body.reference as string;
  const cancelRes = await call("POST", `/api/bookings/${bookingBReference}/cancel`, buyerB.cookie);
  assert(cancelRes.status === 200, `cancel buyer B's booking (got ${cancelRes.status})`);

  const priceChangeRes = await call("PATCH", `/api/events/${eventId}/shows/${showId}`, organiserCookie, {
    prices: [{ categoryId, price: 999 }],
  });
  assert(priceChangeRes.status === 200, `price change after booking is permitted (got ${priceChangeRes.status})`);

  const summary2 = await call("GET", `/api/organiser/events/${eventId}/summary`, organiserCookie);
  const show2 = (
    summary2.body.shows as {
      showId: string;
      confirmedRevenue: number;
      cancelledValue: number;
      cancelledBookingsCount: number;
    }[]
  ).find((s) => s.showId === showId)!;

  const expectedRevenueAfterCancel = 2 * originalPrice;
  assert(
    show2.confirmedRevenue === expectedRevenueAfterCancel,
    `revenue drops by exactly the cancelled booking's value (got ${show2.confirmedRevenue}, expected ${expectedRevenueAfterCancel})`
  );
  assert(
    show2.cancelledValue === originalPrice,
    `cancelled bucket rises by exactly the cancelled booking's value (got ${show2.cancelledValue}, expected ${originalPrice})`
  );
  assert(
    show2.cancelledBookingsCount === 1,
    `cancelled bookings count is 1 (got ${show2.cancelledBookingsCount})`
  );
  assert(
    show2.confirmedRevenue === expectedRevenueAfterCancel,
    `price change to 999 did not retroactively alter historical revenue (still ${show2.confirmedRevenue}, based on the original ${originalPrice} snapshot)`
  );

  return { userIds: [buyerA.userId, buyerB.userId] };
}

async function main() {
  console.log(`Running organiser/venue tests against BASE_URL=${BASE_URL}`);

  const adminCookie = await login("admin@ticketing.test", "AdminPass123!");
  const organiser = await registerOrganiser(`organiser-test-${Date.now()}@ticketing.test`);
  const customer = await registerCustomer(`organiser-test-cust-${Date.now()}@ticketing.test`);

  try {
    await scenario1VenueCreation(adminCookie);
    await scenario2LayoutEdit(adminCookie, organiser.cookie, customer.cookie, customer);
    await scenario3ShowValidation(adminCookie, organiser.cookie);
    const r45 = await scenario4And5Revenue(adminCookie, organiser.cookie);
    allUserIds.push(...r45.userIds);
  } finally {
    console.log("\nCleaning up test data...");
    await prisma.bookingSeat.deleteMany({ where: { booking: { userId: { in: allUserIds } } } });
    await prisma.seatAllocation.deleteMany({ where: { holderUserId: { in: allUserIds } } });
    await prisma.booking.deleteMany({ where: { userId: { in: allUserIds } } });
    await prisma.showPrice.deleteMany({ where: { show: { eventId: { in: allEventIds } } } });
    await prisma.show.deleteMany({ where: { eventId: { in: allEventIds } } });
    await prisma.event.deleteMany({ where: { id: { in: allEventIds } } });
    await prisma.seat.deleteMany({ where: { venueId: { in: allVenueIds } } });
    await prisma.seatCategory.deleteMany({ where: { venueId: { in: allVenueIds } } });
    await prisma.venue.deleteMany({ where: { id: { in: allVenueIds } } });
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
