import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateId } from "@/lib/utils";
import { parseEPUB } from "@/lib/epub/parser";
import { readFile } from "fs/promises";
import path from "path";

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface SceneRow {
  id: string;
  project_id: string;
  page_index: number;
  image_path: string;
  raw_text: string | null;
  scene_description: string | null;
  camera_type: string | null;
  character_actions: string | null;
  dialogues: string | null;
  mood: string | null;
  sequence_index: number;
}

function rowToScene(row: SceneRow) {
  return {
    id: row.id,
    pageIndex: row.page_index,
    imagePath: row.image_path,
    rawText: row.raw_text ?? "",
    sceneDescription: row.scene_description,
    cameraType: row.camera_type,
    dialogues: row.dialogues,
    mood: row.mood,
    status: row.scene_description ? "analyzed" : "pending",
  };
}

// GET - Return all scenes for the project
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

    const { id } = await params;

    // Verify project exists and user owns it
    const project = db
      .prepare("SELECT id, user_id FROM projects WHERE id = ?")
      .get(id) as { id: string; user_id: string } | undefined;

    if (!project) {
      return NextResponse.json({ error: "作品不存在" }, { status: 404 });
    }

    if (project.user_id !== session.user.id && session.user.role !== "admin") {
      return NextResponse.json({ error: "无权限访问该作品" }, { status: 403 });
    }

    const rows = db
      .prepare(
        `SELECT id, project_id, page_index, image_path, raw_text,
                scene_description, camera_type, character_actions,
                dialogues, mood, sequence_index
         FROM scenes
         WHERE project_id = ?
         ORDER BY sequence_index ASC`
      )
      .all(id) as SceneRow[];

    return NextResponse.json({
      scenes: rows.map(rowToScene),
      total: rows.length,
    });
  } catch (error) {
    console.error("Get scenes error:", error);
    return NextResponse.json({ error: "获取分镜列表失败" }, { status: 500 });
  }
}

// POST - Parse EPUB and save scenes to DB
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

    const { id } = await params;

    // Get project
    const project = db
      .prepare("SELECT id, user_id, epub_path FROM projects WHERE id = ?")
      .get(id) as { id: string; user_id: string; epub_path: string } | undefined;

    if (!project) {
      return NextResponse.json({ error: "作品不存在" }, { status: 404 });
    }

    if (project.user_id !== session.user.id) {
      return NextResponse.json({ error: "无权限访问该作品" }, { status: 403 });
    }

    if (!project.epub_path) {
      return NextResponse.json({ error: "该作品没有关联 EPUB 文件" }, { status: 400 });
    }

    // Check if scenes already exist (idempotent)
    const existing = db
      .prepare(
        `SELECT id, project_id, page_index, image_path, raw_text,
                scene_description, camera_type, character_actions,
                dialogues, mood, sequence_index
         FROM scenes
         WHERE project_id = ?
         ORDER BY sequence_index ASC`
      )
      .all(id) as SceneRow[];

    if (existing.length > 0) {
      return NextResponse.json({
        scenes: existing.map(rowToScene),
        total: existing.length,
      });
    }

    // Resolve EPUB path: /uploads/epubs/xxx.epub -> process.cwd() + '/public' + path.slice(1)
    const epubPath = path.join(
      process.cwd(),
      "public",
      project.epub_path.slice(1)
    );

    // Read EPUB file
    const fileBuffer = await readFile(epubPath);
    const buffer = fileBuffer.buffer.slice(
      fileBuffer.byteOffset,
      fileBuffer.byteOffset + fileBuffer.byteLength
    );

    // Parse EPUB using the File API
    const filename = path.basename(project.epub_path);
    const epubFile = new File([buffer], filename, { type: "application/epub+zip" });
    const parseResult = await parseEPUB(epubFile);

    // Insert scenes for pages that have at least one image
    const insertStmt = db.prepare(
      `INSERT INTO scenes
        (id, project_id, page_index, image_path, raw_text, sequence_index)
       VALUES (?, ?, ?, ?, ?, ?)`
    );

    const insertMany = db.transaction((pages: typeof parseResult.pages) => {
      for (const page of pages) {
        if (page.images.length === 0) continue;

        const firstImage = page.images[0].src;
        insertStmt.run(
          generateId(),
          id,
          page.index,
          firstImage,
          page.text,
          page.index
        );
      }
    });

    insertMany(parseResult.pages);

    // Fetch and return all scenes for this project
    const rows = db
      .prepare(
        `SELECT id, project_id, page_index, image_path, raw_text,
                scene_description, camera_type, character_actions,
                dialogues, mood, sequence_index
         FROM scenes
         WHERE project_id = ?
         ORDER BY sequence_index ASC`
      )
      .all(id) as SceneRow[];

    return NextResponse.json({
      scenes: rows.map(rowToScene),
      total: rows.length,
    });
  } catch (error) {
    console.error("Parse scenes error:", error);
    return NextResponse.json({ error: "解析 EPUB 分镜失败" }, { status: 500 });
  }
}
