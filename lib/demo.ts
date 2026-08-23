import { prisma } from "@/lib/prisma";
import { hashPassword, signSessionToken } from "@/lib/auth";
import { DEMO_RACE_SEAT_COUNT } from "@/lib/config";

const DEMO_PASSWORD = "DemoPass123!";
const DEMO_VENUE_NAME = "Demo Arena (internal)";
const DEMO_RACE_EVENT_TITLE = "Concurrency Demo (internal)";
const DEMO_WAITLIST_EVENT_TITLE = "Waitlist Demo (internal)";

async function ensureDemoOrganiser() {
  const email = "demo-organiser@ticketing.test";
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({
      data: { email, name: "Demo Organiser", role: "ORGANISER", passwordHash: await hashPassword(DEMO_PASSWORD) },
    });
  }
  return user;
}

async function ensureDemoVenue() {
  const existing = await prisma.venue.findFirst({ where: { name: DEMO_VENUE_NAME } });
  if (existing) return existing;

  const created = await prisma.venue.create({
    data: {
      name: DEMO_VENUE_NAME,
      address: "Not a real place",
      categories: { create: [{ name: "General" }] },
    },
    include: { categories: true },
  });
  const category = created.categories[0];
  await prisma.seat.createMany({
    data: Array.from({ length: DEMO_RACE_SEAT_COUNT }, (_, i) => ({
      venueId: created.id,
      categoryId: category.id,
      rowLabel: "A",
      seatNumber: i + 1,
    })),
  });
  return created;
}

/** Idempotently ensures a dedicated show + one target seat exist for the concurrency race demo. */
export async function ensureDemoRaceFixtures() {
  const organiser = await ensureDemoOrganiser();
  const venue = await ensureDemoVenue();

  let event = await prisma.event.findFirst({ where: { title: DEMO_RACE_EVENT_TITLE } });
  if (!event) {
    event = await prisma.event.create({
      data: {
        organiserId: organiser.id,
        title: DEMO_RACE_EVENT_TITLE,
        type: "CONCERT",
        description: "Fixture for the /demo concurrency race. Not a real event.",
      },
    });
  }

  let show = await prisma.show.findFirst({ where: { eventId: event.id } });
  if (!show) {
    const category = await prisma.seatCategory.findFirstOrThrow({ where: { venueId: venue.id } });
    show = await prisma.show.create({
      data: {
        eventId: event.id,
        venueId: venue.id,
        startsAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      },
    });
    await prisma.showPrice.create({ data: { showId: show.id, categoryId: category.id, price: 100 } });
  }

  const seat = await prisma.seat.findFirstOrThrow({
    where: { venueId: venue.id },
    orderBy: { seatNumber: "asc" },
  });

  return { showId: show.id, seatId: seat.id };
}

/** Idempotently ensures N pre-provisioned demo racer users exist, and mints a session token for each. */
export async function ensureDemoRacers(n: number) {
  const racers: { userId: string; email: string; token: string }[] = [];
  for (let i = 1; i <= n; i++) {
    const email = `demo-racer-${i}@ticketing.test`;
    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.user.create({
        data: { email, name: `Demo Racer ${i}`, role: "CUSTOMER", passwordHash: await hashPassword(DEMO_PASSWORD) },
      });
    }
    const token = await signSessionToken({ userId: user.id, role: user.role, email: user.email });
    racers.push({ userId: user.id, email: user.email, token });
  }
  return racers;
}

/** Clears any allocation currently held on the race demo's target seat, so the race can be re-run. */
export async function clearDemoRaceSeat(showId: string, seatId: string) {
  await prisma.seatAllocation.deleteMany({ where: { showId, seatId } });
}

/**
 * Idempotently ensures a dedicated sold-out show with a CONFIRMED booking (the "owner") and a
 * WAITING waiter exist for the waitlist cascade demo. If a prior run already cancelled the
 * booking, re-provisions a fresh one so the demo is always re-runnable.
 */
export async function ensureDemoWaitlistFixtures() {
  const organiser = await ensureDemoOrganiser();

  const existingWaitlistVenue = await prisma.venue.findFirst({ where: { name: DEMO_VENUE_NAME + " (waitlist)" } });
  const venue =
    existingWaitlistVenue ??
    (await (async () => {
      const created = await prisma.venue.create({
        data: {
          name: DEMO_VENUE_NAME + " (waitlist)",
          address: "Not a real place",
          categories: { create: [{ name: "General" }] },
        },
        include: { categories: true },
      });
      await prisma.seat.create({
        data: { venueId: created.id, categoryId: created.categories[0].id, rowLabel: "A", seatNumber: 1 },
      });
      return created;
    })());

  let event = await prisma.event.findFirst({ where: { title: DEMO_WAITLIST_EVENT_TITLE } });
  if (!event) {
    event = await prisma.event.create({
      data: {
        organiserId: organiser.id,
        title: DEMO_WAITLIST_EVENT_TITLE,
        type: "MOVIE",
        description: "Fixture for the /demo waitlist cascade. Not a real event.",
      },
    });
  }

  let show = await prisma.show.findFirst({ where: { eventId: event.id } });
  const category = await prisma.seatCategory.findFirstOrThrow({ where: { venueId: venue.id } });
  if (!show) {
    show = await prisma.show.create({
      data: { eventId: event.id, venueId: venue.id, startsAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) },
    });
    await prisma.showPrice.create({ data: { showId: show.id, categoryId: category.id, price: 100 } });
  }

  const seat = await prisma.seat.findFirstOrThrow({ where: { venueId: venue.id } });

  const ownerEmail = "demo-owner@ticketing.test";
  let owner = await prisma.user.findUnique({ where: { email: ownerEmail } });
  if (!owner) {
    owner = await prisma.user.create({
      data: { email: ownerEmail, name: "Demo Owner", role: "CUSTOMER", passwordHash: await hashPassword(DEMO_PASSWORD) },
    });
  }

  const waiterEmail = "demo-waiter@ticketing.test";
  let waiter = await prisma.user.findUnique({ where: { email: waiterEmail } });
  if (!waiter) {
    waiter = await prisma.user.create({
      data: { email: waiterEmail, name: "Demo Waiter", role: "CUSTOMER", passwordHash: await hashPassword(DEMO_PASSWORD) },
    });
  }

  // Ensure the seat is BOOKED by the owner right now (re-provision if a previous cancel consumed it).
  let allocation = await prisma.seatAllocation.findUnique({ where: { showId_seatId: { showId: show.id, seatId: seat.id } } });
  let booking = allocation?.bookingId ? await prisma.booking.findUnique({ where: { id: allocation.bookingId } }) : null;

  if (!booking || booking.status !== "CONFIRMED") {
    await prisma.seatAllocation.deleteMany({ where: { showId: show.id, seatId: seat.id } });
    booking = await prisma.booking.create({
      data: {
        reference: `DEMO-${Date.now().toString(36).toUpperCase()}`,
        showId: show.id,
        userId: owner.id,
        status: "CONFIRMED",
        totalAmount: 100,
        contactName: "Demo Owner",
        contactEmail: ownerEmail,
        contactPhone: "+1-555-0000",
      },
    });
    await prisma.bookingSeat.create({
      data: { bookingId: booking.id, seatId: seat.id, categoryName: "General", price: 100 },
    });
    allocation = await prisma.seatAllocation.create({
      data: { showId: show.id, seatId: seat.id, status: "BOOKED", holderUserId: owner.id, bookingId: booking.id },
    });
  }

  // Ensure the waiter is WAITING on this category.
  let entry = await prisma.waitlistEntry.findUnique({
    where: { showId_categoryId_userId: { showId: show.id, categoryId: category.id, userId: waiter.id } },
  });
  if (!entry || entry.status === "CONVERTED") {
    if (entry) {
      await prisma.waitlistOffer.deleteMany({ where: { waitlistEntryId: entry.id } });
    }
    entry = await prisma.waitlistEntry.upsert({
      where: { showId_categoryId_userId: { showId: show.id, categoryId: category.id, userId: waiter.id } },
      create: { showId: show.id, categoryId: category.id, userId: waiter.id, status: "WAITING" },
      update: { status: "WAITING", createdAt: new Date() },
    });
  } else if (entry.status !== "WAITING") {
    await prisma.waitlistOffer.deleteMany({ where: { waitlistEntryId: entry.id } });
    entry = await prisma.waitlistEntry.update({
      where: { id: entry.id },
      data: { status: "WAITING", createdAt: new Date() },
    });
  }

  const ownerToken = await signSessionToken({ userId: owner.id, role: owner.role, email: owner.email });

  return { showId: show.id, seatId: seat.id, categoryId: category.id, bookingReference: booking.reference, ownerToken, waiterEmail };
}

export async function resetDemoData() {
  const raceVenue = await prisma.venue.findFirst({ where: { name: DEMO_VENUE_NAME } });
  if (raceVenue) {
    await prisma.seatAllocation.deleteMany({ where: { seat: { venueId: raceVenue.id } } });
  }

  const waitlistVenue = await prisma.venue.findFirst({ where: { name: DEMO_VENUE_NAME + " (waitlist)" } });
  if (waitlistVenue) {
    const show = await prisma.show.findFirst({ where: { venueId: waitlistVenue.id } });
    if (show) {
      await prisma.waitlistOffer.deleteMany({ where: { waitlistEntry: { showId: show.id } } });
      await prisma.waitlistEntry.deleteMany({ where: { showId: show.id } });
      await prisma.bookingSeat.deleteMany({ where: { booking: { showId: show.id } } });
      await prisma.seatAllocation.deleteMany({ where: { showId: show.id } });
      await prisma.booking.deleteMany({ where: { showId: show.id } });
    }
  }
}
