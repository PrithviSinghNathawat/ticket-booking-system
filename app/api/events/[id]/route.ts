import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { parseBody } from "@/lib/validate";
import { updateEventSchema } from "@/lib/schemas";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  const auth = await requireRole(["ORGANISER"]);
  if (!auth.ok) return auth.response;

  const parsed = await parseBody(updateEventSchema, request);
  if (!parsed.ok) return parsed.response;

  const event = await prisma.event.findUnique({ where: { id } });
  if (!event || event.organiserId !== auth.session.userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updated = await prisma.event.update({ where: { id }, data: parsed.data });

  return NextResponse.json({
    id: updated.id,
    title: updated.title,
    type: updated.type,
    description: updated.description,
  });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  const auth = await requireRole(["ORGANISER"]);
  if (!auth.ok) return auth.response;

  const event = await prisma.event.findUnique({ where: { id } });
  if (!event || event.organiserId !== auth.session.userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const showCount = await prisma.show.count({ where: { eventId: id } });
  if (showCount > 0) {
    return NextResponse.json(
      { error: "This event has shows and cannot be deleted" },
      { status: 409 }
    );
  }

  await prisma.event.delete({ where: { id } });

  return NextResponse.json({ deleted: true });
}
