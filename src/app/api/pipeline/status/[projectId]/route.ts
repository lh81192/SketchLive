import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { getPipelineStatus } from '@/lib/services/generation-service';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const { projectId } = await params;

    // Check project ownership
    const project = db.prepare(`
      SELECT user_id FROM projects WHERE id = ?
    `).get(projectId) as { user_id: string } | undefined;

    if (!project) {
      return NextResponse.json({ error: '项目不存在' }, { status: 404 });
    }

    if (project.user_id !== session.user.id) {
      return NextResponse.json({ error: '无权限查看此项目' }, { status: 403 });
    }

    // Get pipeline status
    const status = getPipelineStatus(projectId);

    // Get project info
    const projectInfo = db.prepare(`
      SELECT id, title, status, video_url, cover_image, updated_at
      FROM projects WHERE id = ?
    `).get(projectId) as any;

    // Get scenes
    const scenes = db.prepare(`
      SELECT id, page_index, scene_description, mood, sequence_index
      FROM scenes WHERE project_id = ?
      ORDER BY sequence_index
    `).all(projectId) as any[];

    return NextResponse.json({
      project: projectInfo,
      pipeline: status,
      scenes,
    });
  } catch (error) {
    console.error('Get pipeline status error:', error);
    return NextResponse.json({ error: '获取状态失败' }, { status: 500 });
  }
}
