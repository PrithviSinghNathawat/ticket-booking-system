import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { parseBody } from "@/lib/validate";
import { createVenueSchema } from "@/lib/schemas";

export async function GET() {
  const venues = await prisma.venue.findMany({
    orderBy: { name: "asc" },
    include: { categories: { include: { seats: { select: { id: true } } } } },
  });

  return NextResponse.json({
    venues: venues.map((v) => ({
      id: v.id,
      name: v.name,
      address: v.address,
      categories: v.categories.map((c) => ({ id: c.id, name: c.name, seatCount: c.seats.length })),
    })),
  });
}

export async function POST(request: Request) {
  const auth = await requireRole(["ADMIN"]);
  if (!auth.ok) return auth.response;

  const parsed = await parseBody(createVenueSchema, request);
  if (!parsed.ok) return parsed.response;

  const { name, address, categories, rows } = parsed.data;

  const rowLabels = rows.map((r) => r.label);
  if (new Set(rowLabels).size !== rowLabels.length) {
    return NextResponse.json({ error: "Row labels must be unique" }, { status: 400 });
  }

  const categoryNames = new Set(categories.map((c) => c.name));
  for (const row of rows) {
    if (!categoryNames.has(row.categoryName)) {
      return NextResponse.json(
        { error: `Row ${row.label} references unknown category "${row.categoryName}"` },
        { status: 400 }
      );
    }
  }

  const venue = await prisma.$transaction(async (tx) => {
    const createdVenue = await tx.venue.create({ data: { name, address } });

    const categoryByName = new Map<string, string>();
    for (const cat of categories) {
      const createdCategory = await tx.seatCategory.create({
        data: { venueId: createdVenue.id, name: cat.name },
      });
      categoryByName.set(cat.name, createdCategory.id);
    }

    const seatData: { venueId: string; categoryId: string; rowLabel: string; seatNumber: number }[] = [];
    for (const row of rows) {
      const categoryId = categoryByName.get(row.categoryName)!;
      for (let seatNumber = 1; seatNumber <= row.seatCount; seatNumber++) {
        seatData.push({ venueId: createdVenue.id, categoryId, rowLabel: row.label, seatNumber });
      }
    }
    await tx.seat.createMany({ data: seatData });

    return createdVenue;
  });

  return NextResponse.json({ id: venue.id, name: venue.name, address: venue.address }, { status: 201 });
}
