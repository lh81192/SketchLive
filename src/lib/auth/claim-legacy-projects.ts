import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";

export async function claimLegacyProjects(legacyUserId: string | undefined, userId: string) {
  const trimmedLegacyUserId = legacyUserId?.trim();
  if (!trimmedLegacyUserId || trimmedLegacyUserId === userId) {
    return;
  }

  await db
    .update(projects)
    .set({ userId, updatedAt: new Date() })
    .where(eq(projects.userId, trimmedLegacyUserId));
}
