import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects, epubPages } from "@/lib/db/schema";
import { getUserIdFromRequest, requireUserId } from "@/lib/get-user-id";

async function resolveProject(projectId: string, userId: string) {
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));

  return project ?? null;
}

export async function PATCH(
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
    pages?: Array<{
      id: string;
      isSelected?: boolean;
      sortOrder?: number;
    }>;
  };

  if (!body.pages || body.pages.length === 0) {
    return NextResponse.json({ error: "No pages provided" }, { status: 400 });
  }

  for (const page of body.pages) {
    const [current] = await db
      .select()
      .from(epubPages)
      .where(and(eq(epubPages.id, page.id), eq(epubPages.importId, project.epubImportId)));

    if (!current) continue;

    await db
      .update(epubPages)
      .set({
        ...(page.isSelected !== undefined && { isSelected: page.isSelected }),
        ...(page.sortOrder !== undefined && { sortOrder: page.sortOrder }),
      })
      .where(eq(epubPages.id, page.id));
  }

  const pages = await db
    .select()
    .from(epubPages)
    .where(eq(epubPages.importId, project.epubImportId))
    .orderBy(asc(epubPages.sortOrder), asc(epubPages.pageNumber));

  return NextResponse.json({ pages });
}
