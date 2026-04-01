import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";

export async function requireUser(locale?: string) {
  const user = await getCurrentUser();

  if (!user) {
    redirect(locale ? `/${locale}/login` : "/");
  }

  return user;
}
