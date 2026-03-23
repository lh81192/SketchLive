import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { analyzeScene } from '@/lib/pipeline/scene-analyzer';
import type { GenerationConfig, Dialogue } from '@/lib/pipeline/types';

interface RouteParams {
  params: Promise<{ id: string; sceneId: string }>;
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
  let characterActions: string[] = [];
  let dialogues: Dialogue[] = [];

  try {
    if (row.character_actions) {
      characterActions = JSON.parse(row.character_actions);
    }
  } catch {}

  try {
    if (row.dialogues) {
      dialogues = JSON.parse(row.dialogues);
    }
  } catch {}

  return {
    id: row.id,
    pageIndex: row.page_index,
    imagePath: row.image_path,
    rawText: row.raw_text ?? '',
    sceneDescription: row.scene_description ?? '',
    cameraType: row.camera_type ?? '',
    characterActions,
    dialogues,
    mood: row.mood ?? '',
    status: row.scene_description ? 'analyzed' : 'pending',
  };
}

// POST - Generate scene description via AI
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const { id, sceneId } = await params;

    // Verify project ownership
    const project = db
      .prepare('SELECT id, user_id FROM projects WHERE id = ?')
      .get(id) as { id: string; user_id: string } | undefined;

    if (!project) {
      return NextResponse.json({ error: '作品不存在' }, { status: 404 });
    }

    if (project.user_id !== session.user.id) {
      return NextResponse.json({ error: '无权限访问该作品' }, { status: 403 });
    }

    // Read scene from DB
    const scene = db
      .prepare('SELECT * FROM scenes WHERE id = ? AND project_id = ?')
      .get(sceneId, id) as SceneRow | undefined;

    if (!scene) {
      return NextResponse.json({ error: '分镜不存在' }, { status: 404 });
    }

    // Idempotent: if already analyzed, return current data
    if (scene.scene_description) {
      return NextResponse.json({ scene: rowToScene(scene) });
    }

    // Build GenerationConfig from user's default text model config
    const modelConfigRow = db
      .prepare(
        'SELECT id, model_ids FROM user_model_configs WHERE user_id = ? AND provider_type = ? AND enabled = 1 LIMIT 1'
      )
      .get(session.user.id, 'text') as { id: string; model_ids: string } | undefined;

    let textModelConfigId: string | undefined;
    let textModel: string | undefined;

    if (modelConfigRow) {
      textModelConfigId = modelConfigRow.id;
      try {
        const modelIds = JSON.parse(modelConfigRow.model_ids);
        textModel = Array.isArray(modelIds) ? modelIds[0] : undefined;
      } catch {}
    }

    const config: GenerationConfig = {
      textModelConfigId,
      textModel,
      videoDuration: 5,
      videoResolution: '720p',
      videoAspectRatio: '16:9',
      bgmVolume: 0.3,
      voiceVolume: 1.0,
      sfxVolume: 0.5,
    };

    // Call AI scene analyzer
    const analysis = await analyzeScene({
      pageIndex: scene.page_index,
      imageUrl: scene.image_path,
      rawText: scene.raw_text ?? '',
      config,
      userId: session.user.id,
    });

    // Persist results to DB in a transaction
    const updateStmt = db.prepare(
      `UPDATE scenes
         SET scene_description = ?,
             camera_type       = ?,
             character_actions = ?,
             dialogues         = ?,
             mood              = ?
       WHERE id = ?`
    );

    const update = db.transaction(() => {
      updateStmt.run(
        analysis.sceneDescription,
        analysis.cameraType,
        JSON.stringify(analysis.characterActions),
        JSON.stringify(analysis.dialogues),
        analysis.mood,
        sceneId
      );
    });

    update();

    // Re-read updated scene
    const updated = db
      .prepare('SELECT * FROM scenes WHERE id = ? AND project_id = ?')
      .get(sceneId, id) as SceneRow;

    return NextResponse.json({ scene: rowToScene(updated) });
  } catch (error) {
    console.error('Analyze scene error:', error);
    return NextResponse.json({ error: '分镜分析失败' }, { status: 500 });
  }
}

// GET - Return single scene details
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const { id, sceneId } = await params;

    // Verify project ownership
    const project = db
      .prepare('SELECT id, user_id FROM projects WHERE id = ?')
      .get(id) as { id: string; user_id: string } | undefined;

    if (!project) {
      return NextResponse.json({ error: '作品不存在' }, { status: 404 });
    }

    if (project.user_id !== session.user.id) {
      return NextResponse.json({ error: '无权限访问该作品' }, { status: 403 });
    }

    // Read scene
    const scene = db
      .prepare('SELECT * FROM scenes WHERE id = ? AND project_id = ?')
      .get(sceneId, id) as SceneRow | undefined;

    if (!scene) {
      return NextResponse.json({ error: '分镜不存在' }, { status: 404 });
    }

    return NextResponse.json({ scene: rowToScene(scene) });
  } catch (error) {
    console.error('Get scene error:', error);
    return NextResponse.json({ error: '获取分镜详情失败' }, { status: 500 });
  }
}
