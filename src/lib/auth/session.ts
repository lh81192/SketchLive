import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { eq, lt } from "drizzle-orm";
import { ulid } from "ulid";
import { db } from "@/lib/db";
import { userSessions } from "@/lib/db/schema";

export const SESSION_COOKIE_NAME = "ai_comic_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

export function createSessionToken(): string {
  return randomBytes(32).toString("hex");
}

export async function createUserSession(userId: string): Promise<string> {
  const token = createSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await db.insert(userSessions).values({
    id: token,
    userId,
    expiresAt,
    createdAt: new Date(),
  });

  return token;
}

export async function setUserSessionCookie(token: string, expiresAt?: Date) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt ?? new Date(Date.now() + SESSION_TTL_MS),
  });
}

export async function clearUserSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export async function deleteUserSession(token: string) {
  await db.delete(userSessions).where(eq(userSessions.id, token));
}

export async function cleanupExpiredSessions() {
  await db.delete(userSessions).where(lt(userSessions.expiresAt, new Date()));
}

export async function rotateUserSession(userId: string, currentToken?: string) {
  if (currentToken) {
    await deleteUserSession(currentToken);
  }

  const token = await createUserSession(userId);
  await setUserSessionCookie(token);
  return token;
}

export function createUserId(): string {
  return ulid();
}
