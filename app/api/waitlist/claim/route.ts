import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { parseBody } from "@/lib/validate";
import { claimWaitlistSchema } from "@/lib/schemas";
import { processWaitlist } from "@/lib/waitlist";
import { apiError } from "@/lib/errors";

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
    return apiError(404, "Not found", "NOT_FOUND");
  }

  const showId = offer.waitlistEntry.showId;
  const now = new Date();

  if (offer.status !== "PENDING" || offer.expiresAt <= now) {
    await processWaitlist(showId);
    return apiError(
      410,
      "This offer has expired and your seat was released to the next person in line.",
      "OFFER_EXPIRED"
    );
  }

  await processWaitlist(showId);

  return NextResponse.json({ showId });
}
