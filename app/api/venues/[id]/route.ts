import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { parseBody } from "@/lib/validate";
import { updateVenueSchema } from "@/lib/schemas";
import { apiError } from "@/lib/errors";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  const venue = await prisma.venue.findUnique({
    where: { id },
    include: { categories: { include: { seats: { select: { id: true } } } } },
  });
  if (!venue) {
    return apiError(404, "Not found", "NOT_FOUND");
  }

  return NextResponse.json({
    id: venue.id,
    name: venue.name,
    address: venue.address,
    categories: venue.categories.map((c) => ({ id: c.id, name: c.name, seatCount: c.seats.length })),
  });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  const auth = await requireRole(["ADMIN"]);
  if (!auth.ok) return auth.response;

  const parsed = await parseBody(updateVenueSchema, request);
  if (!parsed.ok) return parsed.response;

  const venue = await prisma.venue.findUnique({ where: { id } });
  if (!venue) {
    return apiError(404, "Not found", "NOT_FOUND");
  }

  const { name, address, categories, rows } = parsed.data;
  const changingLayout = categories !== undefined || rows !== undefined;

  if (changingLayout) {
    if (!categories || !rows) {
      return apiError(
        400,
        "categories and rows must both be provided to change the layout",
        "LAYOUT_FIELDS_INCOMPLETE"
      );
    }

    const rowLabels = rows.map((r) => r.label);
    if (new Set(rowLabels).size !== rowLabels.length) {
      return apiError(400, "Row labels must be unique", "DUPLICATE_ROW_LABEL");
    }
    const categoryNames = new Set(categories.map((c) => c.name));
    for (const row of rows) {
      if (!categoryNames.has(row.categoryName)) {
        return apiError(
          400,
          `Row ${row.label} references unknown category "${row.categoryName}"`,
          "UNKNOWN_CATEGORY"
        );
      }
    }

    const confirmedBookingCount = await prisma.booking.count({
      where: { status: "CONFIRMED", show: { venueId: id } },
    });
    if (confirmedBookingCount > 0) {
      return apiError(
        409,
        "This venue has confirmed bookings; its seat layout cannot be changed",
        "VENUE_HAS_BOOKINGS"
      );
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (changingLayout) {
      await tx.waitlistOffer.deleteMany({ where: { waitlistEntry: { show: { venueId: id } } } });
      await tx.waitlistEntry.deleteMany({ where: { show: { venueId: id } } });
      await tx.seatAllocation.deleteMany({ where: { seat: { venueId: id } } });
      await tx.showPrice.deleteMany({ where: { category: { venueId: id } } });
      await tx.seat.deleteMany({ where: { venueId: id } });
      await tx.seatCategory.deleteMany({ where: { venueId: id } });

      const categoryByName = new Map<string, string>();
      for (const cat of categories!) {
        const createdCategory = await tx.seatCategory.create({ data: { venueId: id, name: cat.name } });
        categoryByName.set(cat.name, createdCategory.id);
      }

      const seatData: { venueId: string; categoryId: string; rowLabel: string; seatNumber: number }[] = [];
      for (const row of rows!) {
        const categoryId = categoryByName.get(row.categoryName)!;
        for (let seatNumber = 1; seatNumber <= row.seatCount; seatNumber++) {
          seatData.push({ venueId: id, categoryId, rowLabel: row.label, seatNumber });
        }
      }
      await tx.seat.createMany({ data: seatData });
    }

    return tx.venue.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(address !== undefined ? { address } : {}),
      },
    });
  });

  return NextResponse.json({ id: updated.id, name: updated.name, address: updated.address });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  const auth = await requireRole(["ADMIN"]);
  if (!auth.ok) return auth.response;

  const venue = await prisma.venue.findUnique({ where: { id } });
  if (!venue) {
    return apiError(404, "Not found", "NOT_FOUND");
  }

  const showCount = await prisma.show.count({ where: { venueId: id } });
  if (showCount > 0) {
    return apiError(409, "This venue has shows referencing it and cannot be deleted", "VENUE_HAS_SHOWS");
  }

  await prisma.$transaction(async (tx) => {
    await tx.seat.deleteMany({ where: { venueId: id } });
    await tx.seatCategory.deleteMany({ where: { venueId: id } });
    await tx.venue.delete({ where: { id } });
  });

  return NextResponse.json({ deleted: true });
}
