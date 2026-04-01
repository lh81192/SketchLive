import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { episodes, projects } from "@/lib/db/schema";
import { getUserIdFromRequest } from "@/lib/get-user-id";

export async function getRequestUserId(request: Request): Promise<string> {
  return getUserIdFromRequest(request);
}

export async function resolveProjectOwnedByRequest(request: Request, projectId: string) {
  const userId = await getRequestUserId(request);
  if (!userId) return { userId: "", project: null };

  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));

  return { userId, project: project ?? null };
}

export async function resolveProjectAndEpisodeOwnedByRequest(
  request: Request,
  projectId: string,
  episodeId: string
) {
  const { userId, project } = await resolveProjectOwnedByRequest(request, projectId);
  if (!project) {
    return { userId, project: null, episode: null };
  }

  const [episode] = await db
    .select()
    .from(episodes)
    .where(and(eq(episodes.id, episodeId), eq(episodes.projectId, projectId)));

  return { userId, project, episode: episode ?? null };
}
