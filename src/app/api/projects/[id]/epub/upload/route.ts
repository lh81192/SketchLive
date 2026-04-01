import { NextResponse } from "next/server";
import { ulid } from "ulid";
import { and, eq, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects, epubImports, epubPages } from "@/lib/db/schema";
import { getUserIdFromRequest, requireUserId } from "@/lib/get-user-id";
import { parseEpubBook, readEpubImage } from "@/lib/epub/parser";
import { writeProcessedPageImage, writeUploadedEpub } from "@/lib/epub/storage";

export const maxDuration = 300;

const MAX_FILE_SIZE = 200 * 1024 * 1024;
const MAX_PAGES = 500;

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

  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file" }, { status: 400 });
  }

  const fileName = file.name || "upload.epub";
  if (!fileName.toLowerCase().endsWith(".epub")) {
    return NextResponse.json({ error: "Only .epub files are supported" }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "File too large" }, { status: 400 });
  }

  const importId = ulid();
  const buffer = Buffer.from(await file.arrayBuffer());

  await db.insert(epubImports).values({
    id: importId,
    projectId,
    fileName,
    originalPath: "",
    status: "extracting",
  });

  try {
    const originalPath = await writeUploadedEpub(importId, fileName, buffer);

    await db
      .update(epubImports)
      .set({ originalPath, updatedAt: new Date() })
      .where(eq(epubImports.id, importId));

    const parsed = await parseEpubBook(originalPath);

    if (parsed.images.length === 0) {
      throw new Error("No readable images found in EPUB");
    }

    if (parsed.images.length > MAX_PAGES) {
      throw new Error(`EPUB has too many pages (${parsed.images.length}). Maximum supported is ${MAX_PAGES}`);
    }

    for (const image of parsed.images) {
      const { buffer: imageBuffer } = await readEpubImage(parsed.epub, image.id);
      const processed = await writeProcessedPageImage({
        importId,
        pageNumber: image.pageNumber,
        buffer: imageBuffer,
      });

      await db.insert(epubPages).values({
        id: ulid(),
        importId,
        pageNumber: image.pageNumber,
        imagePath: processed.imagePath,
        thumbPath: processed.thumbPath,
        width: processed.width,
        height: processed.height,
        sourceHref: image.href,
        sourceMediaType: image.mediaType,
        isSelected: true,
        sortOrder: image.pageNumber,
      });
    }

    const [createdImport] = await db
      .update(epubImports)
      .set({
        title: parsed.title,
        author: parsed.author,
        totalPages: parsed.images.length,
        status: "ready",
        updatedAt: new Date(),
      })
      .where(eq(epubImports.id, importId))
      .returning();

    await db
      .update(projects)
      .set({
        inputSource: "epub",
        epubImportId: importId,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId));

    const pages = await db
      .select()
      .from(epubPages)
      .where(eq(epubPages.importId, importId))
      .orderBy(desc(epubPages.pageNumber));

    return NextResponse.json(
      {
        import: createdImport,
        pages: pages.reverse(),
      },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "EPUB import failed";

    await db
      .update(epubImports)
      .set({
        status: "failed",
        error: message,
        updatedAt: new Date(),
      })
      .where(eq(epubImports.id, importId));

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
