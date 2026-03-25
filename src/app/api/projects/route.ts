import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getDashboardProjects } from "@/lib/dashboard-projects";
import { generateId } from "@/lib/utils";
import path from "path";
import fs from "fs";
import {
  deleteProjectsForUser,
  InvalidProjectDeletionRequestError,
  ProjectNotFoundError,
  ProjectForbiddenError,
} from "@/lib/project-deletion";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "epubs");
const PUBLIC_ROOT = path.join(process.cwd(), "public");

// Ensure upload directory exists
function ensureUploadDir() {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

// GET - List user projects
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "请先登录" },
        { status: 401 }
      );
    }

    const projects = getDashboardProjects(db, session.user.id);

    return NextResponse.json({ projects });
  } catch (error) {
    console.error("Get projects error:", error);
    return NextResponse.json(
      { error: "获取作品列表失败" },
      { status: 500 }
    );
  }
}

// POST - Create new project with file upload
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "请先登录" },
        { status: 401 }
      );
    }

    // Parse multipart form data
    const formData = await request.formData();

    const title = formData.get("title") as string;
    const description = formData.get("description") as string | null;
    const file = formData.get("file") as File | null;

    // Validate required fields
    if (!title || !title.trim()) {
      return NextResponse.json(
        { error: "请输入作品标题" },
        { status: 400 }
      );
    }

    if (!file) {
      return NextResponse.json(
        { error: "请上传 EPUB 文件" },
        { status: 400 }
      );
    }

    // Validate file type - check both extension and MIME type
    const fileName = file.name.toLowerCase();
    const fileMimeType = file.type.toLowerCase();
    const validEpubMimeType = "application/epub+zip";

    // Check MIME type (more secure)
    if (fileMimeType !== validEpubMimeType) {
      return NextResponse.json(
        { error: "文件类型必须是 EPUB 格式 (application/epub+zip)" },
        { status: 400 }
      );
    }

    // Also check file extension as secondary validation
    if (!fileName.endsWith(".epub")) {
      return NextResponse.json(
        { error: "只支持 EPUB 格式的文件" },
        { status: 400 }
      );
    }

    // Validate file size (max 50MB)
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: "文件大小不能超过 50MB" },
        { status: 400 }
      );
    }

    // Ensure upload directory exists
    ensureUploadDir();

    // Generate unique filename
    const projectId = generateId();
    const fileExt = ".epub";
    const newFileName = `${projectId}${fileExt}`;
    const filePath = path.join(UPLOAD_DIR, newFileName);

    // Save file
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    fs.writeFileSync(filePath, buffer);

    // Create project record in database
    const epubPath = `/uploads/epubs/${newFileName}`;

    db.prepare(`
      INSERT INTO projects (id, user_id, title, description, epub_path, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'pending', datetime('now'), datetime('now'))
    `).run(projectId, session.user.id, title.trim(), description?.trim() || null, epubPath);

    // Create default project config
    db.prepare(`
      INSERT INTO project_configs (id, project_id, voice_model, bgm_model, sfx_model, created_at)
      VALUES (?, ?, 'gpt-sovits', 'minimax', 'elevenlabs', datetime('now'))
    `).run(generateId(), projectId);

    return NextResponse.json(
      {
        message: "作品创建成功",
        project: {
          id: projectId,
          title: title.trim(),
          description: description?.trim() || null,
          epub_path: epubPath,
          status: "pending",
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Create project error:", error);
    return NextResponse.json(
      { error: "创建作品失败，请稍后重试" },
      { status: 500 }
    );
  }
}

// DELETE - Bulk delete projects
export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "请先登录" },
        { status: 401 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "请求格式错误" },
        { status: 400 }
      );
    }

    if (
      !body ||
      typeof body !== "object" ||
      !Array.isArray((body as Record<string, unknown>).projectIds)
    ) {
      return NextResponse.json(
        { error: "projectIds 数组不能为空" },
        { status: 400 }
      );
    }

    const { projectIds } = body as { projectIds: string[] };

    try {
      const result = deleteProjectsForUser(db, {
        userId: session.user.id,
        projectIds,
        publicRoot: PUBLIC_ROOT,
      });
      return NextResponse.json({
        message: "批量删除成功",
        deletedCount: result.deletedCount,
      });
    } catch (error) {
      if (error instanceof InvalidProjectDeletionRequestError) {
        return NextResponse.json(
          { error: "projectIds 数组不能为空" },
          { status: 400 }
        );
      }
      if (error instanceof ProjectNotFoundError) {
        return NextResponse.json(
          { error: `作品不存在: ${error.projectId}` },
          { status: 404 }
        );
      }
      if (error instanceof ProjectForbiddenError) {
        return NextResponse.json(
          { error: "无权限删除部分作品" },
          { status: 403 }
        );
      }
      throw error;
    }
  } catch (error) {
    console.error("Bulk delete project error:", error);
    return NextResponse.json(
      { error: "批量删除失败" },
      { status: 500 }
    );
  }
}
