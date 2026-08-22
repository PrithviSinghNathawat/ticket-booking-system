import { PrismaClient } from "@prisma/client";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const prisma = new PrismaClient();

let failures = 0;
const allUserIds: string[] = [];

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
  return { cookie, userId: body.id };
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
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return res;
}

async function main() {
  console.log(`Running RBAC matrix against BASE_URL=${BASE_URL}`);

  const admin = await login("admin@ticketing.test", "AdminPass123!");
  const organiserA = await registerOrganiser(`rbac-org-a-${Date.now()}@ticketing.test`);
  const organiserB = await registerOrganiser(`rbac-org-b-${Date.now()}@ticketing.test`);
  const customerA = await registerCustomer(`rbac-cust-a-${Date.now()}@ticketing.test`);
  const customerB = await registerCustomer(`rbac-cust-b-${Date.now()}@ticketing.test`);

  const venueBody = {
    name: `RBAC Test Venue ${Date.now()}`,
    address: "1 Test Way",
    categories: [{ name: "General" }],
    rows: [{ label: "A", seatCount: 5, categoryName: "General" }],
  };

  console.log("\n--- POST /api/venues (ADMIN only) ---");
  const rNoAuth = await call("POST", "/api/venues", undefined, venueBody);
  assert(rNoAuth.status === 401, `unauthenticated -> 401 (got ${rNoAuth.status})`);
  const rCust = await call("POST", "/api/venues", customerA.cookie, venueBody);
  assert(rCust.status === 403, `customer -> 403 (got ${rCust.status})`);
  const rOrg = await call("POST", "/api/venues", organiserA.cookie, venueBody);
  assert(rOrg.status === 403, `organiser -> 403 (got ${rOrg.status})`);
  const rAdmin = await call("POST", "/api/venues", admin, venueBody);
  assert(rAdmin.status === 201, `admin -> 201 (got ${rAdmin.status})`);
  const venue = (await rAdmin.json()) as { id: string };
  const venueFull = await prisma.venue.findUnique({ where: { id: venue.id }, include: { categories: true } });
  const categoryId = venueFull!.categories[0].id;

  console.log("\n--- PATCH /api/venues/[id] (ADMIN only) ---");
  const patchBody = { name: "Renamed Venue" };
  assert((await call("PATCH", `/api/venues/${venue.id}`, undefined, patchBody)).status === 401, "unauthenticated -> 401");
  assert((await call("PATCH", `/api/venues/${venue.id}`, customerA.cookie, patchBody)).status === 403, "customer -> 403");
  assert((await call("PATCH", `/api/venues/${venue.id}`, organiserA.cookie, patchBody)).status === 403, "organiser -> 403");
  assert((await call("PATCH", `/api/venues/${venue.id}`, admin, patchBody)).status === 200, "admin -> 200");

  console.log("\n--- POST /api/events (ORGANISER only) ---");
  const eventBody = { title: `RBAC Event ${Date.now()}`, type: "MOVIE", description: "test" };
  assert((await call("POST", "/api/events", undefined, eventBody)).status === 401, "unauthenticated -> 401");
  assert((await call("POST", "/api/events", customerA.cookie, eventBody)).status === 403, "customer -> 403");
  assert((await call("POST", "/api/events", admin, eventBody)).status === 403, "admin -> 403 (not an organiser)");
  const rEvent = await call("POST", "/api/events", organiserA.cookie, eventBody);
  assert(rEvent.status === 201, `organiser -> 201 (got ${rEvent.status})`);
  const event = (await rEvent.json()) as { id: string };

  console.log("\n--- PATCH /api/events/[id] (owning organiser only) ---");
  const eventPatch = { description: "updated" };
  assert((await call("PATCH", `/api/events/${event.id}`, undefined, eventPatch)).status === 401, "unauthenticated -> 401");
  assert((await call("PATCH", `/api/events/${event.id}`, customerA.cookie, eventPatch)).status === 403, "customer -> 403");
  assert(
    (await call("PATCH", `/api/events/${event.id}`, organiserB.cookie, eventPatch)).status === 404,
    "organiser-other -> 404, not 403 (does not confirm the event exists)"
  );
  assert((await call("PATCH", `/api/events/${event.id}`, organiserA.cookie, eventPatch)).status === 200, "organiser-owner -> 200");

  console.log("\n--- POST /api/events/[id]/shows (owning organiser only) ---");
  const showBody = {
    venueId: venue.id,
    startsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    prices: [{ categoryId, price: 100 }],
  };
  assert((await call("POST", `/api/events/${event.id}/shows`, undefined, showBody)).status === 401, "unauthenticated -> 401");
  assert((await call("POST", `/api/events/${event.id}/shows`, customerA.cookie, showBody)).status === 403, "customer -> 403");
  assert(
    (await call("POST", `/api/events/${event.id}/shows`, organiserB.cookie, showBody)).status === 404,
    "organiser-other -> 404"
  );
  const rShow = await call("POST", `/api/events/${event.id}/shows`, organiserA.cookie, showBody);
  assert(rShow.status === 201, `organiser-owner -> 201 (got ${rShow.status})`);
  const show = (await rShow.json()) as { id: string };

  console.log("\n--- PATCH /api/events/[id]/shows/[showId] (owning organiser only) ---");
  const showPatch = { prices: [{ categoryId, price: 120 }] };
  assert(
    (await call("PATCH", `/api/events/${event.id}/shows/${show.id}`, undefined, showPatch)).status === 401,
    "unauthenticated -> 401"
  );
  assert(
    (await call("PATCH", `/api/events/${event.id}/shows/${show.id}`, customerA.cookie, showPatch)).status === 403,
    "customer -> 403"
  );
  assert(
    (await call("PATCH", `/api/events/${event.id}/shows/${show.id}`, organiserB.cookie, showPatch)).status === 404,
    "organiser-other -> 404"
  );
  assert(
    (await call("PATCH", `/api/events/${event.id}/shows/${show.id}`, organiserA.cookie, showPatch)).status === 200,
    "organiser-owner -> 200"
  );

  console.log("\n--- GET /api/organiser/events/[id]/summary (owner or ADMIN) ---");
  assert((await call("GET", `/api/organiser/events/${event.id}/summary`, undefined)).status === 401, "unauthenticated -> 401");
  assert((await call("GET", `/api/organiser/events/${event.id}/summary`, customerA.cookie)).status === 403, "customer -> 403");
  assert(
    (await call("GET", `/api/organiser/events/${event.id}/summary`, organiserB.cookie)).status === 404,
    "organiser-other -> 404, not 403 (cross-tenant summary read)"
  );
  assert(
    (await call("GET", `/api/organiser/events/${event.id}/summary`, organiserA.cookie)).status === 200,
    "organiser-owner -> 200"
  );
  assert((await call("GET", `/api/organiser/events/${event.id}/summary`, admin)).status === 200, "admin -> 200");

  console.log("\n--- POST /api/shows/[id]/holds (CUSTOMER only) ---");
  const holdBody = { seatIds: [] as string[] };
  assert((await call("POST", `/api/shows/${show.id}/holds`, undefined, holdBody)).status === 401, "unauthenticated -> 401");
  assert(
    (await call("POST", `/api/shows/${show.id}/holds`, organiserA.cookie, holdBody)).status === 403,
    "organiser hitting a customer-only route -> 403"
  );
  assert((await call("POST", `/api/shows/${show.id}/holds`, admin, holdBody)).status === 403, "admin -> 403");

  console.log("\n--- Cross-tenant booking access (customer reading another customer's booking) ---");
  const seat = await prisma.seat.findFirst({ where: { venueId: venue.id } });
  await call("POST", `/api/shows/${show.id}/holds`, customerA.cookie, { seatIds: [seat!.id] });
  const confirmRes = await call("POST", "/api/bookings", customerA.cookie, {
    showId: show.id,
    contactName: "Customer A",
    contactEmail: customerA.userId + "@ticketing.test",
    contactPhone: "+1-555-0000",
  });
  const confirmBody = (await confirmRes.json()) as { reference?: string };
  assert(confirmRes.status === 201 && !!confirmBody.reference, "customer A completes a booking to test cross-tenant access");

  if (confirmBody.reference) {
    const rOwn = await call("GET", `/api/bookings/${confirmBody.reference}`, customerA.cookie);
    assert(rOwn.status === 200, `customer A reading their own booking -> 200 (got ${rOwn.status})`);
    const rOther = await call("GET", `/api/bookings/${confirmBody.reference}`, customerB.cookie);
    assert(
      rOther.status === 404,
      `customer B reading customer A's booking -> 404, not 403 (got ${rOther.status})`
    );
    const rCancelOther = await call("POST", `/api/bookings/${confirmBody.reference}/cancel`, customerB.cookie);
    assert(
      rCancelOther.status === 404,
      `customer B cancelling customer A's booking -> 404 (got ${rCancelOther.status})`
    );
  }

  console.log("\n--- DELETE /api/venues/[id] (ADMIN only) ---");
  assert((await call("DELETE", `/api/venues/${venue.id}`, undefined)).status === 401, "unauthenticated -> 401");
  assert((await call("DELETE", `/api/venues/${venue.id}`, customerA.cookie)).status === 403, "customer -> 403");
  assert((await call("DELETE", `/api/venues/${venue.id}`, organiserA.cookie)).status === 403, "organiser -> 403");
  const rDelete = await call("DELETE", `/api/venues/${venue.id}`, admin);
  assert(rDelete.status === 409, `admin deleting a venue with shows -> 409 (got ${rDelete.status})`);

  console.log("\nCleaning up throwaway users and test data...");
  await prisma.bookingSeat.deleteMany({ where: { booking: { showId: show.id } } });
  await prisma.seatAllocation.deleteMany({ where: { showId: show.id } });
  await prisma.booking.deleteMany({ where: { showId: show.id } });
  await prisma.showPrice.deleteMany({ where: { showId: show.id } });
  await prisma.show.deleteMany({ where: { id: show.id } });
  await prisma.event.deleteMany({ where: { id: event.id } });
  await prisma.seat.deleteMany({ where: { venueId: venue.id } });
  await prisma.seatCategory.deleteMany({ where: { venueId: venue.id } });
  await prisma.venue.deleteMany({ where: { id: venue.id } });
  await prisma.user.deleteMany({ where: { id: { in: allUserIds } } });

  console.log(`\n${failures === 0 ? "PASS" : "FAIL"}: ${failures} assertion failure(s)`);
  await prisma.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
