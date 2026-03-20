import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateId } from "@/lib/utils";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST - Trigger AI generation
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "请先登录" },
        { status: 401 }
      );
    }

    const { id } = await params;

    // Check if project exists and belongs to user
    const project = db.prepare(`
      SELECT id, user_id, title, status, epub_path FROM projects WHERE id = ?
    `).get(id) as {
      id: string;
      user_id: string;
      title: string;
      status: string;
      epub_path: string;
    } | undefined;

    if (!project) {
      return NextResponse.json(
        { error: "作品不存在" },
        { status: 404 }
      );
    }

    if (project.user_id !== session.user.id) {
      return NextResponse.json(
        { error: "无权限操作该作品" },
        { status: 403 }
      );
    }

    // Check if project is in valid status for generation
    if (project.status === 'processing') {
      return NextResponse.json(
        { error: "作品正在生成中，请稍后再试" },
        { status: 400 }
      );
    }

    // Check if EPUB file exists
    if (!project.epub_path) {
      return NextResponse.json(
        { error: "EPUB 文件不存在" },
        { status: 400 }
      );
    }

    // Get project config
    const config = db.prepare(`
      SELECT voice_model, voice_params, bgm_model, sfx_model
      FROM project_configs WHERE project_id = ?
    `).get(id) as {
      voice_model: string;
      voice_params: string | null;
      bgm_model: string;
      sfx_model: string;
    } | undefined;

    if (!config) {
      return NextResponse.json(
        { error: "项目配置不存在" },
        { status: 400 }
      );
    }

    // Create generation task
    const taskId = generateId();

    // Input data for the generation task
    const inputData = {
      project_id: id,
      project_title: project.title,
      epub_path: project.epub_path,
      config: {
        voice_model: config.voice_model,
        voice_params: config.voice_params ? JSON.parse(config.voice_params) : {},
        bgm_model: config.bgm_model,
        sfx_model: config.sfx_model,
      },
    };

    // Insert task into database
    db.prepare(`
      INSERT INTO tasks (id, project_id, task_type, status, input_data, progress, created_at, updated_at)
      VALUES (?, ?, 'generate', 'pending', ?, 0, datetime('now'), datetime('now'))
    `).run(taskId, id, JSON.stringify(inputData));

    // Update project status to processing
    db.prepare(`
      UPDATE projects
      SET status = 'processing', updated_at = datetime('now')
      WHERE id = ?
    `).run(id);

    // In a real implementation, this would trigger an async job
    // For now, we'll simulate by updating task status after a delay
    // In production, this would be handled by a job queue (like Bull, Redis Queue, etc.)

    return NextResponse.json(
      {
        message: "生成任务已启动",
        task: {
          id: taskId,
          project_id: id,
          status: "pending",
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Generate project error:", error);
    return NextResponse.json(
      { error: "启动生成任务失败" },
      { status: 500 }
    );
  }
}
