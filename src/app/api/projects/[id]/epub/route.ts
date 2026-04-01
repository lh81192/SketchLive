import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects, epubImports, epubPages } from "@/lib/db/schema";
import { getUserIdFromRequest, requireUserId } from "@/lib/get-user-id";

async function resolveProject(projectId: string, userId: string) {
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));

  return project ?? null;
}

export async function GET(
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
    return NextResponse.json({ import: null, pages: [] });
  }

  const [currentImport] = await db
    .select()
    .from(epubImports)
    .where(eq(epubImports.id, project.epubImportId));

  const pages = await db
    .select()
    .from(epubPages)
    .where(eq(epubPages.importId, project.epubImportId))
    .orderBy(asc(epubPages.sortOrder), asc(epubPages.pageNumber));

  return NextResponse.json({
    import: currentImport ?? null,
    pages,
  });
}
