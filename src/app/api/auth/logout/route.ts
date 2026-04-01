import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { clearUserSessionCookie, deleteUserSession } from "@/lib/auth/session";

export async function POST() {
  const currentUser = await getCurrentUser();

  if (currentUser?.sessionToken) {
    await deleteUserSession(currentUser.sessionToken);
  }

  await clearUserSessionCookie();

  return NextResponse.json({ ok: true });
}
