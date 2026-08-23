import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { apiError } from "@/lib/errors";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return apiError(401, "Unauthorized", "UNAUTHORIZED");
  }
  return NextResponse.json(session);
}
