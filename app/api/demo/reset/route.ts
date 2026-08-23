import { NextResponse } from "next/server";
import { DEMO_RESET_ENABLED } from "@/lib/config";
import { resetDemoData } from "@/lib/demo";

export async function POST() {
  if (!DEMO_RESET_ENABLED) {
    return NextResponse.json({ error: "Demo reset is disabled" }, { status: 404 });
  }

  await resetDemoData();
  return NextResponse.json({ reset: true });
}
