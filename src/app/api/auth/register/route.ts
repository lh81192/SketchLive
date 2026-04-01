import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { claimLegacyProjects } from "@/lib/auth/claim-legacy-projects";
import { hashPassword, normalizeEmail } from "@/lib/auth/password";
import { createUserId, rotateUserSession } from "@/lib/auth/session";

interface RegisterBody {
  email?: string;
  password?: string;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as RegisterBody | null;
  const email = normalizeEmail(body?.email ?? "");
  const password = body?.password ?? "";

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const [existingUser] = await db.select().from(users).where(eq(users.email, email));
  if (existingUser) {
    return NextResponse.json({ error: "Email is already registered" }, { status: 409 });
  }

  const userId = createUserId();
  const passwordHash = hashPassword(password);

  await db.insert(users).values({
    id: userId,
    email,
    passwordHash,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const token = await rotateUserSession(userId);
  const legacyUserId = request.headers.get("cookie")?.match(/(?:^|; )ai_comic_uid=([^;]+)/)?.[1];
  await claimLegacyProjects(legacyUserId ? decodeURIComponent(legacyUserId) : undefined, userId);

  return NextResponse.json({ ok: true, token });
}
