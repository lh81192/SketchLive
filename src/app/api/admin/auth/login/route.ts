import { NextResponse } from "next/server";
import { createAdminSession, isAdminAuthConfigured } from "@/lib/admin/session";
import { verifyAdminPassword } from "@/lib/admin/auth";

interface LoginBody {
  password?: string;
}

export async function POST(request: Request) {
  if (!isAdminAuthConfigured()) {
    return NextResponse.json({ error: "Admin auth is not configured" }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as LoginBody | null;
  const password = body?.password?.trim() || "";

  if (!password) {
    return NextResponse.json({ error: "Password is required" }, { status: 400 });
  }

  if (!verifyAdminPassword(password)) {
    return NextResponse.json({ error: "Invalid admin password" }, { status: 401 });
  }

  await createAdminSession();
  return NextResponse.json({ ok: true });
}
