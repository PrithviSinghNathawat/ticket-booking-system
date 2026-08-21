import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/schemas";
import { parseBody } from "@/lib/validate";
import { verifyPassword, createSessionCookie } from "@/lib/auth";

export async function POST(request: Request) {
  const parsed = await parseBody(loginSchema, request);
  if (!parsed.ok) return parsed.response;

  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return NextResponse.json(
      { error: "Invalid email or password" },
      { status: 401 }
    );
  }

  await createSessionCookie({
    userId: user.id,
    role: user.role,
    email: user.email,
  });

  return NextResponse.json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  });
}
