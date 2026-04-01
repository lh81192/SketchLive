import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { claimLegacyProjects } from "@/lib/auth/claim-legacy-projects";
import { normalizeEmail, verifyPassword } from "@/lib/auth/password";
import { rotateUserSession } from "@/lib/auth/session";

interface LoginBody {
  email?: string;
  password?: string;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as LoginBody | null;
  const email = normalizeEmail(body?.email ?? "");
  const password = body?.password ?? "";

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }

  const [user] = await db.select().from(users).where(eq(users.email, email));
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const token = await rotateUserSession(user.id);
  const legacyUserId = request.headers.get("cookie")?.match(/(?:^|; )ai_comic_uid=([^;]+)/)?.[1];
  await claimLegacyProjects(legacyUserId ? decodeURIComponent(legacyUserId) : undefined, user.id);

  return NextResponse.json({ ok: true, token });
}
