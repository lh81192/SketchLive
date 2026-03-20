import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import path from "path";
import fs from "fs";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "epubs");

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET - Get project details by ID
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "请先登录" },
        { status: 401 }
      );
    }

    const { id } = await params;

    // Get project with config
    const project = db.prepare(`
      SELECT
        p.id,
        p.user_id,
        p.title,
        p.description,
        p.epub_path,
        p.cover_image,
        p.status,
        p.video_url,
        p.duration,
        p.created_at,
        p.updated_at,
        pc.id as config_id,
        pc.voice_model,
        pc.voice_params,
        pc.bgm_model,
        pc.sfx_model
      FROM projects p
      LEFT JOIN project_configs pc ON p.id = pc.project_id
      WHERE p.id = ?
    `).get(id) as {
      id: string;
      user_id: string;
      title: string;
      description: string | null;
      epub_path: string;
      cover_image: string | null;
      status: string;
      video_url: string | null;
      duration: number | null;
      created_at: string;
      updated_at: string;
      config_id: string | null;
      voice_model: string | null;
      voice_params: string | null;
      bgm_model: string | null;
      sfx_model: string | null;
    } | undefined;

    if (!project) {
      return NextResponse.json(
        { error: "作品不存在" },
        { status: 404 }
      );
    }

    // Check if user is the owner (or admin)
    if (project.user_id !== session.user.id && session.user.role !== 'admin') {
      return NextResponse.json(
        { error: "无权限访问该作品" },
        { status: 403 }
      );
    }

    // Get latest task for this project
    const latestTask = db.prepare(`
      SELECT
        id,
        task_type,
        status,
        progress,
        error_message,
        created_at,
        started_at,
        completed_at
      FROM tasks
      WHERE project_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(id) as {
      id: string;
      task_type: string;
      status: string;
      progress: number;
      error_message: string | null;
      created_at: string;
      started_at: string | null;
      completed_at: string | null;
    } | undefined;

    return NextResponse.json({
      project: {
        ...project,
        config: project.config_id ? {
          id: project.config_id,
          voice_model: project.voice_model,
          voice_params: project.voice_params ? JSON.parse(project.voice_params) : null,
          bgm_model: project.bgm_model,
          sfx_model: project.sfx_model,
        } : null,
        latest_task: latestTask || null,
      },
    });
  } catch (error) {
    console.error("Get project error:", error);
    return NextResponse.json(
      { error: "获取作品详情失败" },
      { status: 500 }
    );
  }
}

// PUT - Update project
export async function PUT(request: Request, { params }: RouteParams) {
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
      SELECT id, user_id FROM projects WHERE id = ?
    `).get(id) as { id: string; user_id: string } | undefined;

    if (!project) {
      return NextResponse.json(
        { error: "作品不存在" },
        { status: 404 }
      );
    }

    if (project.user_id !== session.user.id) {
      return NextResponse.json(
        { error: "无权限修改该作品" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { title, description, voice_model, voice_params, bgm_model, sfx_model } = body;

    // Update project
    if (title !== undefined || description !== undefined) {
      db.prepare(`
        UPDATE projects
        SET title = COALESCE(?, title),
            description = COALESCE(?, description),
            updated_at = datetime('now')
        WHERE id = ?
      `).run(title || null, description !== undefined ? description : null, id);
    }

    // Update project config
    if (voice_model !== undefined || bgm_model !== undefined || sfx_model !== undefined || voice_params !== undefined) {
      const existingConfig = db.prepare(`
        SELECT id FROM project_configs WHERE project_id = ?
      `).get(id) as { id: string } | undefined;

      if (existingConfig) {
        db.prepare(`
          UPDATE project_configs
          SET voice_model = COALESCE(?, voice_model),
              voice_params = COALESCE(?, voice_params),
              bgm_model = COALESCE(?, bgm_model),
              sfx_model = COALESCE(?, sfx_model)
          WHERE project_id = ?
        `).run(
          voice_model || null,
          voice_params ? JSON.stringify(voice_params) : null,
          bgm_model || null,
          sfx_model || null,
          id
        );
      }
    }

    // Get updated project
    const updatedProject = db.prepare(`
      SELECT
        p.id,
        p.title,
        p.description,
        p.status,
        p.video_url,
        p.duration,
        p.created_at,
        p.updated_at,
        pc.voice_model,
        pc.voice_params,
        pc.bgm_model,
        pc.sfx_model
      FROM projects p
      LEFT JOIN project_configs pc ON p.id = pc.project_id
      WHERE p.id = ?
    `).get(id) as {
      id: string;
      title: string;
      description: string | null;
      status: string;
      video_url: string | null;
      duration: number | null;
      created_at: string;
      updated_at: string;
      voice_model: string | null;
      voice_params: string | null;
      bgm_model: string | null;
      sfx_model: string | null;
    };

    return NextResponse.json({
      message: "作品更新成功",
      project: updatedProject,
    });
  } catch (error) {
    console.error("Update project error:", error);
    return NextResponse.json(
      { error: "更新作品失败" },
      { status: 500 }
    );
  }
}

// DELETE - Delete project
export async function DELETE(request: Request, { params }: RouteParams) {
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
      SELECT id, user_id, epub_path FROM projects WHERE id = ?
    `).get(id) as { id: string; user_id: string; epub_path: string } | undefined;

    if (!project) {
      return NextResponse.json(
        { error: "作品不存在" },
        { status: 404 }
      );
    }

    if (project.user_id !== session.user.id) {
      return NextResponse.json(
        { error: "无权限删除该作品" },
        { status: 403 }
      );
    }

    // Delete the EPUB file
    if (project.epub_path) {
      const filePath = path.join(process.cwd(), "public", project.epub_path);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    // Delete from database (cascades to configs and tasks)
    db.prepare("DELETE FROM projects WHERE id = ?").run(id);

    return NextResponse.json({
      message: "作品删除成功",
    });
  } catch (error) {
    console.error("Delete project error:", error);
    return NextResponse.json(
      { error: "删除作品失败" },
      { status: 500 }
    );
  }
}
