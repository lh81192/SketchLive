import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { shots } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { requireUserId } from "@/lib/get-user-id";
import { resolveProjectOwnedByRequest } from "@/lib/project-auth";

async function resolveShot(projectId: string, shotId: string) {
  const [shot] = await db
    .select()
    .from(shots)
    .where(and(eq(shots.id, shotId), eq(shots.projectId, projectId)));
  return shot ?? null;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; shotId: string }> }
) {
  const { id: projectId, shotId } = await params;
  const { userId, project } = await resolveProjectOwnedByRequest(request, projectId);
  const unauthorized = requireUserId(userId);
  if (unauthorized) return unauthorized;
  if (!project || !(await resolveShot(projectId, shotId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await request.json()) as Partial<{
    prompt: string;
    duration: number;
    sequence: number;
    startFrameDesc: string | null;
    endFrameDesc: string | null;
    motionScript: string | null;
    cameraDirection: string;
    firstFrame: string | null;
    lastFrame: string | null;
    sceneRefFrame: string | null;
    videoPrompt: string | null;
  }>;

  const [updated] = await db
    .update(shots)
    .set(body)
    .where(eq(shots.id, shotId))
    .returning();

  return NextResponse.json(updated);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; shotId: string }> }
) {
  const { id: projectId, shotId } = await params;
  const { userId, project } = await resolveProjectOwnedByRequest(request, projectId);
  const unauthorized = requireUserId(userId);
  if (unauthorized) return unauthorized;
  if (!project || !(await resolveShot(projectId, shotId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db.delete(shots).where(eq(shots.id, shotId));
  return new NextResponse(null, { status: 204 });
}
