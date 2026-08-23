import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const commit = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local";

  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "healthy", commit, timestamp: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json(
      {
        status: "unhealthy",
        commit,
        timestamp: new Date().toISOString(),
        error: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 503 }
    );
  }
}
