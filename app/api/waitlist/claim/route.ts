import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { parseBody } from "@/lib/validate";
import { claimWaitlistSchema } from "@/lib/schemas";
import { processWaitlist } from "@/lib/waitlist";

export async function POST(request: Request) {
  const auth = await requireRole(["CUSTOMER"]);
  if (!auth.ok) return auth.response;

  const parsed = await parseBody(claimWaitlistSchema, request);
  if (!parsed.ok) return parsed.response;

  const { token } = parsed.data;

  const offer = await prisma.waitlistOffer.findUnique({
    where: { token },
    include: { waitlistEntry: true },
  });

  if (!offer || offer.waitlistEntry.userId !== auth.session.userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const showId = offer.waitlistEntry.showId;
  const now = new Date();

  if (offer.status !== "PENDING" || offer.expiresAt <= now) {
    await processWaitlist(showId);
    return NextResponse.json(
      { error: "This offer has expired and your seat was released to the next person in line." },
      { status: 410 }
    );
  }

  await processWaitlist(showId);

  return NextResponse.json({ showId });
}
