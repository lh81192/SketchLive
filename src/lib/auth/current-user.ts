import { cookies } from "next/headers";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, userSessions } from "@/lib/db/schema";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";

export interface CurrentUser {
  id: string;
  email: string;
  sessionToken: string;
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) return null;

  const [session] = await db
    .select({
      sessionToken: userSessions.id,
      userId: users.id,
      email: users.email,
    })
    .from(userSessions)
    .innerJoin(users, eq(userSessions.userId, users.id))
    .where(and(eq(userSessions.id, token), gt(userSessions.expiresAt, new Date())));

  if (!session) return null;

  return {
    id: session.userId,
    email: session.email,
    sessionToken: session.sessionToken,
  };
}
