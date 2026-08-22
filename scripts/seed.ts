import { PrismaClient, type User } from "@prisma/client";
import bcrypt from "bcryptjs";
import { MAX_HOLD_SEATS_PER_REQUEST, DEMO_RECIPIENT_EMAIL } from "@/lib/config";

const prisma = new PrismaClient();

function demoEmail(tag: string, fallback: string): string {
  if (!DEMO_RECIPIENT_EMAIL) return fallback;
  const [local, domain] = DEMO_RECIPIENT_EMAIL.split("@");
  return `${local}+${tag}@${domain}`;
}

const CREDENTIALS = {
  admin: { email: "admin@ticketing.test", password: "AdminPass123!" },
  organiser: { email: "organiser@ticketing.test", password: "OrganiserPass123!" },
  customers: [
    { email: demoEmail("alice", "alice@ticketing.test"), password: "CustomerPass123!" },
    { email: demoEmail("bob", "bob@ticketing.test"), password: "CustomerPass123!" },
    { email: demoEmail("carol", "carol@ticketing.test"), password: "CustomerPass123!" },
  ],
};

async function hash(password: string) {
  return bcrypt.hash(password, 10);
}

async function main() {
  await prisma.bookingSeat.deleteMany();
  await prisma.seatAllocation.deleteMany();
  await prisma.waitlistOffer.deleteMany();
  await prisma.waitlistEntry.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.showPrice.deleteMany();
  await prisma.show.deleteMany();
  await prisma.event.deleteMany();
  await prisma.seat.deleteMany();
  await prisma.seatCategory.deleteMany();
  await prisma.venue.deleteMany();
  await prisma.user.deleteMany();

  const admin = await prisma.user.create({
    data: {
      email: CREDENTIALS.admin.email,
      passwordHash: await hash(CREDENTIALS.admin.password),
      name: "Admin User",
      role: "ADMIN",
    },
  });

  const organiser = await prisma.user.create({
    data: {
      email: CREDENTIALS.organiser.email,
      passwordHash: await hash(CREDENTIALS.organiser.password),
      name: "Olivia Organiser",
      role: "ORGANISER",
    },
  });

  const customerNames = ["Alice Customer", "Bob Customer", "Carol Customer"];
  const customers: User[] = [];
  for (let i = 0; i < CREDENTIALS.customers.length; i++) {
    const customer = await prisma.user.create({
      data: {
        email: CREDENTIALS.customers[i].email,
        passwordHash: await hash(CREDENTIALS.customers[i].password),
        name: customerNames[i],
        role: "CUSTOMER",
      },
    });
    customers.push(customer);
  }

  const venue = await prisma.venue.create({
    data: { name: "Grand Cinema Hall", address: "123 Main Street, Vellore" },
  });

  const premium = await prisma.seatCategory.create({
    data: { venueId: venue.id, name: "Premium" },
  });
  const standard = await prisma.seatCategory.create({
    data: { venueId: venue.id, name: "Standard" },
  });

  const seatRows = [
    { rows: ["A", "B", "C", "D"], categoryId: premium.id },
    { rows: ["E", "F", "G", "H"], categoryId: standard.id },
  ];

  const allSeats = [];
  for (const group of seatRows) {
    for (const rowLabel of group.rows) {
      for (let seatNumber = 1; seatNumber <= 10; seatNumber++) {
        const seat = await prisma.seat.create({
          data: {
            venueId: venue.id,
            categoryId: group.categoryId,
            rowLabel,
            seatNumber,
          },
        });
        allSeats.push(seat);
      }
    }
  }

  const movie = await prisma.event.create({
    data: {
      organiserId: organiser.id,
      title: "The Last Reel",
      type: "MOVIE",
      description: "A detective's final case unfolds in one long night.",
    },
  });

  const concert = await prisma.event.create({
    data: {
      organiserId: organiser.id,
      title: "Neon Nights",
      type: "CONCERT",
      description: "A live electronic showcase featuring three touring acts.",
    },
  });

  const now = new Date();
  const inDays = (n: number) => new Date(now.getTime() + n * 24 * 60 * 60 * 1000);

  const showOpen = await prisma.show.create({
    data: { eventId: movie.id, venueId: venue.id, startsAt: inDays(2) },
  });
  const showSoldOut = await prisma.show.create({
    data: { eventId: movie.id, venueId: venue.id, startsAt: inDays(3) },
  });
  const showConcert = await prisma.show.create({
    data: { eventId: concert.id, venueId: venue.id, startsAt: inDays(5) },
  });

  for (const show of [showOpen, showSoldOut, showConcert]) {
    await prisma.showPrice.create({
      data: { showId: show.id, categoryId: premium.id, price: 500 },
    });
    await prisma.showPrice.create({
      data: { showId: show.id, categoryId: standard.id, price: 250 },
    });
  }

  const premiumSeats = allSeats.filter((seat) => seat.categoryId === premium.id);
  const standardSeats = allSeats.filter((seat) => seat.categoryId === standard.id);

  const SEATS_PER_BOOKING = 8;
  if (SEATS_PER_BOOKING > MAX_HOLD_SEATS_PER_REQUEST) {
    throw new Error("seed bookings must respect MAX_HOLD_SEATS_PER_REQUEST");
  }

  function chunk<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
    return chunks;
  }

  const soldOutBookings = [
    ...chunk(premiumSeats, SEATS_PER_BOOKING).map((seats) => ({ seats, categoryName: "Premium", price: 500 })),
    ...chunk(standardSeats, SEATS_PER_BOOKING).map((seats) => ({ seats, categoryName: "Standard", price: 250 })),
  ].map((group, index) => ({
    reference: `BK-SEEDFULL${index + 1}`,
    user: customers[index % customers.length],
    ...group,
  }));

  for (const { reference, user, seats, categoryName, price } of soldOutBookings) {
    const booking = await prisma.booking.create({
      data: {
        reference,
        showId: showSoldOut.id,
        userId: user.id,
        status: "CONFIRMED",
        totalAmount: price * seats.length,
        contactName: user.name,
        contactEmail: user.email,
        contactPhone: "+1-555-0100",
      },
    });

    for (const seat of seats) {
      await prisma.seatAllocation.create({
        data: {
          showId: showSoldOut.id,
          seatId: seat.id,
          status: "BOOKED",
          holderUserId: user.id,
          bookingId: booking.id,
        },
      });

      await prisma.bookingSeat.create({
        data: {
          bookingId: booking.id,
          seatId: seat.id,
          categoryName,
          price,
        },
      });
    }
  }

  console.log("\nSeed complete. Credentials:\n");
  console.log(`ADMIN        ${CREDENTIALS.admin.email} / ${CREDENTIALS.admin.password}`);
  console.log(`ORGANISER    ${CREDENTIALS.organiser.email} / ${CREDENTIALS.organiser.password}`);
  for (const c of CREDENTIALS.customers) {
    console.log(`CUSTOMER     ${c.email} / ${c.password}`);
  }
  console.log(`\nSold-out show for waitlist demo: showId=${showSoldOut.id} (event: The Last Reel, ${inDays(3).toISOString()})`);
  console.log(`admin=${admin.id} organiser=${organiser.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
