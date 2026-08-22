import { NextResponse } from "next/server";
import { processWaitlist } from "@/lib/waitlist";

export async function POST(
  request: Request,
  context: { params: Promise<{ showId: string }> }
) {
  const { showId } = await context.params;
  const result = await processWaitlist(showId);
  return NextResponse.json(result);
}
