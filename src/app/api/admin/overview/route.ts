import { NextResponse } from "next/server";
import { hasAdminSession, isAdminAuthConfigured } from "@/lib/admin/session";
import { getAdminOverview } from "@/lib/admin/overview";

export async function GET() {
  if (!isAdminAuthConfigured()) {
    return NextResponse.json({ error: "Admin auth is not configured" }, { status: 503 });
  }

  const authenticated = await hasAdminSession();
  if (!authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const overview = await getAdminOverview();
  return NextResponse.json(overview);
}
