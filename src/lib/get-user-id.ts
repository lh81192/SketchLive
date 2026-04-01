import { and, eq, gt } from "drizzle-orm";
import { db } from "@/lib/db";
import { userSessions, users } from "@/lib/db/schema";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";

export async function getUserIdFromRequest(request: Request): Promise<string> {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const token = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE_NAME}=`))
    ?.slice(SESSION_COOKIE_NAME.length + 1);

  if (!token) return "";

  const [session] = await db
    .select({ userId: users.id })
    .from(userSessions)
    .innerJoin(users, eq(userSessions.userId, users.id))
    .where(and(eq(userSessions.id, token), gt(userSessions.expiresAt, new Date())));

  return session?.userId ?? "";
}

export function getLegacyUserIdFromRequest(request: Request): string {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const rawValue = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("ai_comic_uid="))
    ?.slice("ai_comic_uid=".length);

  return rawValue ? decodeURIComponent(rawValue) : "";
}

export function requireUserId(userId: string): Response | null {
  if (userId) return null;
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}
