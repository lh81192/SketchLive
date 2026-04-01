import { NextResponse } from "next/server";
import { ulid } from "ulid";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects, epubPages, storyboardVersions, shots, characters } from "@/lib/db/schema";
import { getUserIdFromRequest, requireUserId } from "@/lib/get-user-id";

export const maxDuration = 300;

async function resolveProject(projectId: string, userId: string) {
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));

  return project ?? null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const userId = await getUserIdFromRequest(request);
  const unauthorized = requireUserId(userId);
  if (unauthorized) return unauthorized;
  const project = await resolveProject(projectId, userId);

  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!project.epubImportId) {
    return NextResponse.json({ error: "No EPUB import" }, { status: 400 });
  }

  const body = (await request.json()) as {
    characters?: Array<{
      name: string;
      description?: string;
      visualHint?: string;
      scope?: "main" | "guest";
    }>;
  };

  const selectedPages = await db
    .select()
    .from(epubPages)
    .where(and(eq(epubPages.importId, project.epubImportId), eq(epubPages.isSelected, true)))
    .orderBy(asc(epubPages.sortOrder), asc(epubPages.pageNumber));

  if (selectedPages.length === 0) {
    return NextResponse.json({ error: "No selected pages" }, { status: 400 });
  }

  const existingCharacters = await db
    .select()
    .from(characters)
    .where(eq(characters.projectId, projectId));

  const characterByName = new Map(
    existingCharacters.map((character) => [character.name.trim().toLowerCase(), character])
  );

  for (const character of body.characters ?? []) {
    const name = character.name.trim();
    if (!name) continue;

    const key = name.toLowerCase();
    if (characterByName.has(key)) continue;

    const [createdCharacter] = await db
      .insert(characters)
      .values({
        id: ulid(),
        projectId,
        name,
        description: character.description ?? "",
        visualHint: character.visualHint ?? "",
        scope: character.scope === "guest" ? "guest" : "main",
        episodeId: null,
      })
      .returning();

    characterByName.set(key, createdCharacter);
  }

  const [maxVersionRow] = await db
    .select({ maxNum: storyboardVersions.versionNum })
    .from(storyboardVersions)
    .where(eq(storyboardVersions.projectId, projectId))
    .orderBy(desc(storyboardVersions.versionNum))
    .limit(1);

  const nextVersionNum = (maxVersionRow?.maxNum ?? 0) + 1;
  const today = new Date();
  const dateStr = today.getUTCFullYear().toString() +
    String(today.getUTCMonth() + 1).padStart(2, "0") +
    String(today.getUTCDate()).padStart(2, "0");
  const versionId = ulid();

  await db.insert(storyboardVersions).values({
    id: versionId,
    projectId,
    label: `${dateStr}-V${nextVersionNum}`,
    versionNum: nextVersionNum,
    createdAt: new Date(),
    episodeId: null,
  });

  for (const [index, page] of selectedPages.entries()) {
    await db.insert(shots).values({
      id: ulid(),
      projectId,
      versionId,
      sequence: index + 1,
      prompt: `EPUB page ${page.pageNumber}`,
      motionScript: "static comic panel hold",
      cameraDirection: "static",
      duration: 3,
      sceneRefFrame: page.imagePath,
      sourceType: "epub_page",
      sourcePageId: page.id,
      status: "pending",
    });
  }

  await db
    .update(projects)
    .set({
      inputSource: "epub",
      generationMode: "reference",
      updatedAt: new Date(),
    })
    .where(eq(projects.id, projectId));

  return NextResponse.json({
    versionId,
    shotCount: selectedPages.length,
  });
}
