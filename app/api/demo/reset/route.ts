import { NextResponse } from "next/server";
import { DEMO_RESET_ENABLED } from "@/lib/config";
import { resetDemoData } from "@/lib/demo";
import { apiError } from "@/lib/errors";

export async function POST() {
  if (!DEMO_RESET_ENABLED) {
    return apiError(404, "Demo reset is disabled", "DEMO_DISABLED");
  }

  await resetDemoData();
  return NextResponse.json({ reset: true });
}
