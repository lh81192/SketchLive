import { NextResponse } from "next/server";
import { db } from "@/lib/db";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET - Get public user info by ID
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Get user public info (only public fields)
    const user = db.prepare(`
      SELECT
        id,
        nickname,
        avatar,
        role,
        created_at
      FROM users
      WHERE id = ?
    `).get(id) as {
      id: string;
      nickname: string | null;
      avatar: string | null;
      role: string;
      created_at: string;
    } | undefined;

    if (!user) {
      return NextResponse.json(
        { error: "用户不存在" },
        { status: 404 }
      );
    }

    // Get user stats - only count completed projects (public)
    const stats = {
      projectCount: db.prepare(`
        SELECT COUNT(*) as count FROM projects WHERE user_id = ? AND status = 'completed'
      `).get(id) as { count: number },
      likesCount: db.prepare(`
        SELECT COUNT(*) as count FROM likes WHERE user_id = ?
      `).get(id) as { count: number },
      favoritesCount: db.prepare(`
        SELECT COUNT(*) as count FROM favorites WHERE user_id = ?
      `).get(id) as { count: number },
    };

    // Get user's public projects (only completed ones)
    const projects = db.prepare(`
      SELECT
        id,
        user_id,
        title,
        description,
        cover_image,
        status,
        video_url,
        duration,
        created_at
      FROM projects
      WHERE user_id = ? AND status = 'completed'
      ORDER BY created_at DESC
    `).all(id) as {
      id: string;
      user_id: string;
      title: string;
      description: string | null;
      cover_image: string | null;
      status: string;
      video_url: string | null;
      duration: number | null;
      created_at: string;
    }[];

    return NextResponse.json({
      user: {
        ...user,
        stats: {
          projects: stats.projectCount.count,
          likes: stats.likesCount.count,
          favorites: stats.favoritesCount.count,
        },
      },
      projects,
    });
  } catch (error) {
    console.error("Get user error:", error);
    return NextResponse.json(
      { error: "获取用户信息失败" },
      { status: 500 }
    );
  }
}
