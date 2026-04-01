import { timingSafeEqual } from "node:crypto";
import { redirect } from "next/navigation";
import { hasAdminSession, isAdminAuthConfigured } from "@/lib/admin/session";

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function verifyAdminPassword(password: string): boolean {
  const configuredPassword = process.env.ADMIN_PASSWORD?.trim() || "";
  if (!configuredPassword) return false;
  return safeEqual(password, configuredPassword);
}

export async function requireAdmin(locale: string) {
  if (!isAdminAuthConfigured()) {
    redirect(`/${locale}/admin/login?disabled=1`);
  }

  const authenticated = await hasAdminSession();
  if (!authenticated) {
    redirect(`/${locale}/admin/login`);
  }
}
