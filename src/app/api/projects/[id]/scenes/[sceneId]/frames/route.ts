import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { generateKeyFrames } from '@/lib/pipeline/frame-generator';
import type { CameraType, GenerationConfig, SceneAnalysis, KeyFrame } from '@/lib/pipeline/types';

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
  frames_status: string | null;
}

interface NextSceneRow {
  id: string;
  scene_description: string | null;
  camera_type: string | null;
  character_actions: string | null;
  dialogues: string | null;
  mood: string | null;
  first_frame_description: string | null;
  sequence_index: number;
  image_path: string;
}

// POST - Generate first and last key frames for a single scene
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

    // Scene must have scene_description (status must be 'analyzed')
    if (!scene.scene_description) {
      return NextResponse.json(
        { error: '分镜尚未完成分析，请先生成分镜描述' },
        { status: 400 }
      );
    }

    // Build GenerationConfig by querying user_model_configs for image model config
    const modelConfigRow = db
      .prepare(
        'SELECT id, model_ids FROM user_model_configs WHERE user_id = ? AND provider_type = ? AND enabled = 1 LIMIT 1'
      )
      .get(session.user.id, 'image') as { id: string; model_ids: string } | undefined;

    let imageModelConfigId: string | undefined;
    let imageModel: string | undefined;

    if (modelConfigRow) {
      imageModelConfigId = modelConfigRow.id;
      try {
        const modelIds = JSON.parse(modelConfigRow.model_ids);
        imageModel = Array.isArray(modelIds) ? modelIds[0] : undefined;
      } catch {}
    }

    const config: GenerationConfig = {
      imageModelConfigId,
      imageModel,
      videoDuration: 5,
      videoResolution: '720p',
      videoAspectRatio: '16:9',
      bgmVolume: 0.3,
      voiceVolume: 1.0,
      sfxVolume: 0.5,
    };

    // Try to find next scene for better frame continuity
    let nextScene: SceneAnalysis | undefined;
    const nextSceneRow = db
      .prepare(
        `SELECT id, scene_description, camera_type, character_actions,
                dialogues, mood, image_path, sequence_index
           FROM scenes
          WHERE project_id = ? AND sequence_index > ?
          ORDER BY sequence_index ASC
          LIMIT 1`
      )
      .get(id, scene.sequence_index) as NextSceneRow | undefined;

    if (nextSceneRow && nextSceneRow.scene_description) {
      let nextCharacterActions: string[] = [];
      try {
        if (nextSceneRow.character_actions) {
          nextCharacterActions = JSON.parse(nextSceneRow.character_actions);
        }
      } catch {}

      nextScene = {
        sceneId: nextSceneRow.id,
        pageIndex: -1,
        sceneDescription: nextSceneRow.scene_description,
        setting: '',
        cameraType: (nextSceneRow.camera_type as CameraType) || 'medium-shot',
        characterActions: nextCharacterActions,
        characterEmotions: {},
        dialogues: nextSceneRow.dialogues ? JSON.parse(nextSceneRow.dialogues) : [],
        mood: (nextSceneRow.mood as any) || 'neutral',
        videoPrompt: nextSceneRow.scene_description,
        firstFrameDescription: nextSceneRow.first_frame_description || '',
        lastFrameDescription: nextSceneRow.scene_description,
      };
    }

    // Build SceneAnalysis from DB fields
    let characterActions: string[] = [];
    try {
      if (scene.character_actions) {
        characterActions = JSON.parse(scene.character_actions);
      }
    } catch {}

    const sceneAnalysis: SceneAnalysis = {
      sceneId: scene.id,
      pageIndex: scene.page_index,
      sceneDescription: scene.scene_description,
      setting: '',
      cameraType: (scene.camera_type as CameraType) || 'medium-shot',
      characterActions,
      characterEmotions: {},
      dialogues: scene.dialogues ? JSON.parse(scene.dialogues) : [],
      mood: (scene.mood as any) || 'neutral',
      videoPrompt: scene.scene_description,
      firstFrameDescription: '',
      lastFrameDescription: scene.scene_description,
    };

    // Call generateKeyFrames()
    const frames: KeyFrame[] = await generateKeyFrames({
      scene: sceneAnalysis,
      nextScene,
      config,
      userId: session.user.id,
      originalImageUrl: scene.image_path,
    });

    // Save returned KeyFrame[] to key_frames table
    const upsertFrame = db.prepare(
      `INSERT OR REPLACE INTO key_frames (id, scene_id, frame_type, image_url, prompt, status)
       VALUES (?, ?, ?, ?, ?, ?)`
    );

    const updateSceneStatus = db.prepare(
      `UPDATE scenes SET frames_status = ? WHERE id = ?`
    );

    const persist = db.transaction(() => {
      for (const frame of frames) {
        upsertFrame.run(
          frame.id,
          sceneId,
          frame.frameType,
          frame.imageUrl ?? null,
          frame.prompt,
          frame.status
        );
      }
      // Update scene's frames_status to 'completed'
      updateSceneStatus.run('completed', sceneId);
    });

    persist();

    // Build response
    const firstFrame = frames.find((f) => f.frameType === 'first');
    const lastFrame = frames.find((f) => f.frameType === 'last');

    return NextResponse.json({
      frames: {
        first: firstFrame
          ? { id: firstFrame.id, imageUrl: firstFrame.imageUrl ?? '', status: firstFrame.status }
          : null,
        last: lastFrame
          ? { id: lastFrame.id, imageUrl: lastFrame.imageUrl ?? '', status: lastFrame.status }
          : null,
      },
      hasFrames: frames.length > 0,
    });
  } catch (error) {
    console.error('Generate frames error:', error);
    return NextResponse.json({ error: '生成首尾帧失败' }, { status: 500 });
  }
}

// GET - Get current frame status for a single scene
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

    // Read key frames for this scene
    const frameRows = db
      .prepare(
        `SELECT id, scene_id, frame_type, image_url, prompt, status
           FROM key_frames
          WHERE scene_id = ?`
      )
      .all(sceneId) as {
      id: string;
      scene_id: string;
      frame_type: string;
      image_url: string | null;
      prompt: string | null;
      status: string;
    }[];

    const firstRow = frameRows.find((r) => r.frame_type === 'first');
    const lastRow = frameRows.find((r) => r.frame_type === 'last');

    return NextResponse.json({
      frames: {
        first: firstRow
          ? { id: firstRow.id, imageUrl: firstRow.image_url ?? '', status: firstRow.status }
          : null,
        last: lastRow
          ? { id: lastRow.id, imageUrl: lastRow.image_url ?? '', status: lastRow.status }
          : null,
      },
    });
  } catch (error) {
    console.error('Get frames error:', error);
    return NextResponse.json({ error: '获取首尾帧状态失败' }, { status: 500 });
  }
}
