import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { characters } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireUserId } from "@/lib/get-user-id";
import { resolveProjectOwnedByRequest } from "@/lib/project-auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const { userId, project } = await resolveProjectOwnedByRequest(request, projectId);
  const unauthorized = requireUserId(userId);
  if (unauthorized) return unauthorized;
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const result = await db
    .select()
    .from(characters)
    .where(eq(characters.projectId, projectId));
  return NextResponse.json(result);
}
