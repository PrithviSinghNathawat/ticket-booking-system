import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { registerSchema } from "@/lib/schemas";
import { parseBody } from "@/lib/validate";
import { hashPassword, createSessionCookie } from "@/lib/auth";

export async function POST(request: Request) {
  const parsed = await parseBody(registerSchema, request);
  if (!parsed.ok) return parsed.response;

  const { email, password, name, role, inviteCode } = parsed.data;

  const expectedInviteCode = process.env.ORGANISER_SIGNUP_CODE;
  if (role === "ORGANISER" && (!expectedInviteCode || inviteCode !== expectedInviteCode)) {
    return NextResponse.json(
      { error: "Organiser registration requires a valid invite code" },
      { status: 403 }
    );
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: "An account with this email already exists" },
      { status: 409 }
    );
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: { email, passwordHash, name, role },
  });

  await createSessionCookie({
    userId: user.id,
    role: user.role,
    email: user.email,
  });

  return NextResponse.json(
    { id: user.id, email: user.email, name: user.name, role: user.role },
    { status: 201 }
  );
}
