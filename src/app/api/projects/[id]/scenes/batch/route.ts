import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { generateId } from '@/lib/utils';
import { parseEPUB } from '@/lib/epub/parser';
import { analyzeScene } from '@/lib/pipeline/scene-analyzer';
import { generateKeyFrames } from '@/lib/pipeline/frame-generator';
import { generateVideoClip } from '@/lib/pipeline/video-generator';
import path from 'path';
import type { GenerationConfig, SceneAnalysis, KeyFrame, CameraType } from '@/lib/pipeline/types';

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
  frames_status: string | null;
  sequence_index: number;
}

type BatchAction = 'parse' | 'analyze' | 'generate-frames' | 'generate-video';

// POST /api/projects/[id]/scenes/batch — Batch operations on scenes
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const { id } = await params;

    // Verify project ownership
    const project = db
      .prepare('SELECT id, user_id, epub_path FROM projects WHERE id = ?')
      .get(id) as { id: string; user_id: string; epub_path: string } | undefined;

    if (!project) {
      return NextResponse.json({ error: '作品不存在' }, { status: 404 });
    }

    if (project.user_id !== session.user.id) {
      return NextResponse.json({ error: '无权限访问该作品' }, { status: 403 });
    }

    // Parse request body
    let body: { action: BatchAction; sceneIds: string[] | 'all' };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: '无效的请求体' }, { status: 400 });
    }

    const { action, sceneIds } = body;

    if (!['parse', 'analyze', 'generate-frames', 'generate-video'].includes(action)) {
      return NextResponse.json({ error: '无效的 action' }, { status: 400 });
    }

    // Dispatch to handler
    switch (action) {
      case 'parse':
        return await handleParse(project);
      case 'analyze':
        return await handleAnalyze(id, sceneIds, session.user.id);
      case 'generate-frames':
        return await handleGenerateFrames(id, sceneIds, session.user.id);
      case 'generate-video':
        return await handleGenerateVideo(id, sceneIds, session.user.id);
    }
  } catch (error) {
    console.error('Batch operation error:', error);
    return NextResponse.json({ error: '批量操作失败' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Action: "parse"
// Calls parseEPUB() and creates scenes for the project (idempotent).
// ---------------------------------------------------------------------------
async function handleParse(
  project: { id: string; user_id: string; epub_path: string }
): Promise<NextResponse> {
  // Idempotent: if scenes already exist, return success immediately
  const existing = db
    .prepare('SELECT COUNT(*) as count FROM scenes WHERE project_id = ?')
    .get(project.id) as { count: number };

  if (existing.count > 0) {
    return NextResponse.json({ success: true, message: '分镜已存在，跳过解析' });
  }

  if (!project.epub_path) {
    return NextResponse.json({ error: '该作品没有关联 EPUB 文件' }, { status: 400 });
  }

  // Resolve EPUB path: /uploads/epubs/xxx.epub -> process.cwd() + '/public' + path.slice(1)
  const epubPath = path.join(process.cwd(), 'public', project.epub_path.slice(1));

  let fileBuffer: Buffer;
  try {
    fileBuffer = require('fs').readFileSync(epubPath);
  } catch {
    return NextResponse.json({ error: 'EPUB 文件读取失败' }, { status: 500 });
  }

  const buffer = fileBuffer.buffer.slice(
    fileBuffer.byteOffset,
    fileBuffer.byteOffset + fileBuffer.byteLength
  );

  const filename = path.basename(project.epub_path);
  const epubFile = new File([buffer], filename, { type: 'application/epub+zip' });

  // Parse EPUB
  let parseResult: Awaited<ReturnType<typeof parseEPUB>>;
  try {
    parseResult = await parseEPUB(epubFile);
  } catch (err) {
    console.error('[Batch] parseEPUB error:', err);
    return NextResponse.json({ error: '解析 EPUB 失败' }, { status: 500 });
  }

  // Insert scenes
  const insertStmt = db.prepare(
    `INSERT INTO scenes
       (id, project_id, page_index, image_path, raw_text, sequence_index)
     VALUES (?, ?, ?, ?, ?, ?)`
  );

  const insertMany = db.transaction((pages: typeof parseResult.pages) => {
    for (const page of pages) {
      if (page.images.length === 0) continue;
      const firstImage = page.images[0].src;
      insertStmt.run(generateId(), project.id, page.index, firstImage, page.text, page.index);
    }
  });

  insertMany(parseResult.pages);

  const inserted = db
    .prepare('SELECT COUNT(*) as count FROM scenes WHERE project_id = ?')
    .get(project.id) as { count: number };

  return NextResponse.json({ success: true, total: inserted.count });
}

// ---------------------------------------------------------------------------
// Action: "analyze"
// Analyzes scenes that lack scene_description.
// ---------------------------------------------------------------------------
async function handleAnalyze(
  projectId: string,
  sceneIds: string[] | 'all',
  userId: string
): Promise<NextResponse> {
  let rows: SceneRow[];

  if (sceneIds === 'all') {
    rows = db
      .prepare(
        `SELECT * FROM scenes
          WHERE project_id = ? AND scene_description IS NULL
          ORDER BY sequence_index ASC`
      )
      .all(projectId) as SceneRow[];
  } else {
    if (!Array.isArray(sceneIds) || sceneIds.length === 0) {
      return NextResponse.json({ error: '无效的 sceneIds' }, { status: 400 });
    }
    const placeholders = sceneIds.map(() => '?').join(',');
    rows = db
      .prepare(
        `SELECT * FROM scenes
          WHERE project_id = ? AND id IN (${placeholders}) AND scene_description IS NULL
          ORDER BY sequence_index ASC`
      )
      .all(projectId, ...sceneIds) as SceneRow[];
  }

  const total = rows.length;

  // Build GenerationConfig
  const config = buildTextGenerationConfig(userId);

  const updateStmt = db.prepare(
    `UPDATE scenes
       SET scene_description = ?,
           camera_type        = ?,
           character_actions  = ?,
           dialogues          = ?,
           mood               = ?
     WHERE id = ?`
  );

  let processed = 0;
  let failed = 0;
  const errors: { sceneId: string; error: string }[] = [];

  for (const row of rows) {
    try {
      // Idempotent: skip if already analyzed
      if (row.scene_description) {
        processed++;
        continue;
      }

      const analysis = await analyzeScene({
        pageIndex: row.page_index,
        imageUrl: row.image_path,
        rawText: row.raw_text ?? '',
        config,
        userId,
      });

      updateStmt.run(
        analysis.sceneDescription,
        analysis.cameraType,
        JSON.stringify(analysis.characterActions),
        JSON.stringify(analysis.dialogues),
        analysis.mood,
        row.id
      );

      processed++;
    } catch (err) {
      failed++;
      errors.push({ sceneId: row.id, error: String(err) });
    }
  }

  return NextResponse.json({ total, processed, failed, errors });
}

// ---------------------------------------------------------------------------
// Action: "generate-frames"
// Generates key frames for scenes that have descriptions.
// ---------------------------------------------------------------------------
async function handleGenerateFrames(
  projectId: string,
  sceneIds: string[] | 'all',
  userId: string
): Promise<NextResponse> {
  let rows: SceneRow[];

  if (sceneIds === 'all') {
    rows = db
      .prepare(
        `SELECT * FROM scenes
          WHERE project_id = ? AND scene_description IS NOT NULL
          ORDER BY sequence_index ASC`
      )
      .all(projectId) as SceneRow[];
  } else {
    if (!Array.isArray(sceneIds) || sceneIds.length === 0) {
      return NextResponse.json({ error: '无效的 sceneIds' }, { status: 400 });
    }
    const placeholders = sceneIds.map(() => '?').join(',');
    rows = db
      .prepare(
        `SELECT * FROM scenes
          WHERE project_id = ? AND id IN (${placeholders}) AND scene_description IS NOT NULL
          ORDER BY sequence_index ASC`
      )
      .all(projectId, ...sceneIds) as SceneRow[];
  }

  const total = rows.length;
  const config = buildImageGenerationConfig(userId);

  const upsertFrame = db.prepare(
    `INSERT OR REPLACE INTO key_frames (id, scene_id, frame_type, image_url, prompt, status)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const updateSceneStatus = db.prepare(`UPDATE scenes SET frames_status = ? WHERE id = ?`);

  let processed = 0;
  let failed = 0;
  const errors: { sceneId: string; error: string }[] = [];

  for (const row of rows) {
    try {
      // Idempotent: skip if already completed
      if (row.frames_status === 'completed') {
        processed++;
        continue;
      }

      const sceneAnalysis = buildSceneAnalysis(row);

      // Get next scene for frame continuity
      const nextRow = db
        .prepare(
          `SELECT * FROM scenes
             WHERE project_id = ? AND sequence_index > ?
             ORDER BY sequence_index ASC LIMIT 1`
        )
        .get(projectId, row.sequence_index) as SceneRow | undefined;

      const nextScene = nextRow && nextRow.scene_description ? buildSceneAnalysis(nextRow) : undefined;

      const frames: KeyFrame[] = await generateKeyFrames({
        scene: sceneAnalysis,
        nextScene,
        config,
        userId,
        originalImageUrl: row.image_path,
      });

      const persist = db.transaction(() => {
        for (const frame of frames) {
          upsertFrame.run(
            frame.id,
            row.id,
            frame.frameType,
            frame.imageUrl ?? null,
            frame.prompt,
            frame.status
          );
        }
        updateSceneStatus.run('completed', row.id);
      });

      persist();
      processed++;
    } catch (err) {
      failed++;
      errors.push({ sceneId: row.id, error: String(err) });
    }
  }

  return NextResponse.json({ total, processed, failed, errors });
}

// ---------------------------------------------------------------------------
// Action: "generate-video"
// Generates video clips for scenes with completed frames.
// ---------------------------------------------------------------------------
async function handleGenerateVideo(
  projectId: string,
  sceneIds: string[] | 'all',
  userId: string
): Promise<NextResponse> {
  let rows: SceneRow[];

  if (sceneIds === 'all') {
    rows = db
      .prepare(
        `SELECT * FROM scenes
          WHERE project_id = ? AND frames_status = 'completed'
          ORDER BY sequence_index ASC`
      )
      .all(projectId) as SceneRow[];
  } else {
    if (!Array.isArray(sceneIds) || sceneIds.length === 0) {
      return NextResponse.json({ error: '无效的 sceneIds' }, { status: 400 });
    }
    const placeholders = sceneIds.map(() => '?').join(',');
    rows = db
      .prepare(
        `SELECT * FROM scenes
          WHERE project_id = ? AND id IN (${placeholders}) AND frames_status = 'completed'
          ORDER BY sequence_index ASC`
      )
      .all(projectId, ...sceneIds) as SceneRow[];
  }

  const total = rows.length;
  const config = buildVideoGenerationConfig(userId);

  const upsertClip = db.prepare(
    `INSERT OR REPLACE INTO video_clips (id, scene_id, video_url, duration, prompt, status, model_used)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );

  let processed = 0;
  let failed = 0;
  const errors: { sceneId: string; error: string }[] = [];

  for (const row of rows) {
    try {
      // Idempotent: skip if already has a completed video clip
      const existingClip = db
        .prepare(
          `SELECT id, status FROM video_clips
             WHERE scene_id = ? AND status = 'completed'
             ORDER BY created_at DESC LIMIT 1`
        )
        .get(row.id) as { id: string; status: string } | undefined;

      if (existingClip) {
        processed++;
        continue;
      }

      // Read key frames
      const frameRows = db
        .prepare(
          `SELECT id, scene_id, frame_type, image_url, prompt, status
             FROM key_frames WHERE scene_id = ?`
        )
        .all(row.id) as {
        id: string;
        scene_id: string;
        frame_type: string;
        image_url: string | null;
        prompt: string | null;
        status: string;
      }[];

      const firstFrameRow = frameRows.find((f) => f.frame_type === 'first');
      const lastFrameRow = frameRows.find((f) => f.frame_type === 'last');

      if (!firstFrameRow || !lastFrameRow) {
        errors.push({ sceneId: row.id, error: '首尾帧数据不完整' });
        failed++;
        continue;
      }

      const firstFrame: KeyFrame = {
        id: firstFrameRow.id,
        sceneId: row.id,
        frameType: 'first',
        imageUrl: firstFrameRow.image_url ?? undefined,
        prompt: firstFrameRow.prompt ?? '',
        status: firstFrameRow.status as KeyFrame['status'],
      };

      const lastFrame: KeyFrame = {
        id: lastFrameRow.id,
        sceneId: row.id,
        frameType: 'last',
        imageUrl: lastFrameRow.image_url ?? undefined,
        prompt: lastFrameRow.prompt ?? '',
        status: lastFrameRow.status as KeyFrame['status'],
      };

      const sceneAnalysis = buildSceneAnalysis(row);

      const clip = await generateVideoClip({
        scene: sceneAnalysis,
        firstFrame,
        lastFrame,
        config,
        userId,
      });

      upsertClip.run(
        clip.id,
        row.id,
        clip.videoUrl ?? null,
        clip.duration,
        clip.prompt,
        clip.status,
        clip.modelUsed ?? null
      );

      processed++;
    } catch (err) {
      failed++;
      errors.push({ sceneId: row.id, error: String(err) });
    }
  }

  return NextResponse.json({ total, processed, failed, errors });
}

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

function buildTextGenerationConfig(userId: string): GenerationConfig {
  const modelConfigRow = db
    .prepare(
      'SELECT id, model_ids FROM user_model_configs WHERE user_id = ? AND provider_type = ? AND enabled = 1 LIMIT 1'
    )
    .get(userId, 'text') as { id: string; model_ids: string } | undefined;

  let textModelConfigId: string | undefined;
  let textModel: string | undefined;

  if (modelConfigRow) {
    textModelConfigId = modelConfigRow.id;
    try {
      const modelIds = JSON.parse(modelConfigRow.model_ids);
      textModel = Array.isArray(modelIds) ? modelIds[0] : undefined;
    } catch {}
  }

  return {
    textModelConfigId,
    textModel,
    videoDuration: 5,
    videoResolution: '720p',
    videoAspectRatio: '16:9',
    bgmVolume: 0.3,
    voiceVolume: 1.0,
    sfxVolume: 0.5,
  };
}

function buildImageGenerationConfig(userId: string): GenerationConfig {
  const modelConfigRow = db
    .prepare(
      'SELECT id, model_ids FROM user_model_configs WHERE user_id = ? AND provider_type = ? AND enabled = 1 LIMIT 1'
    )
    .get(userId, 'image') as { id: string; model_ids: string } | undefined;

  let imageModelConfigId: string | undefined;
  let imageModel: string | undefined;

  if (modelConfigRow) {
    imageModelConfigId = modelConfigRow.id;
    try {
      const modelIds = JSON.parse(modelConfigRow.model_ids);
      imageModel = Array.isArray(modelIds) ? modelIds[0] : undefined;
    } catch {}
  }

  return {
    imageModelConfigId,
    imageModel,
    videoDuration: 5,
    videoResolution: '720p',
    videoAspectRatio: '16:9',
    bgmVolume: 0.3,
    voiceVolume: 1.0,
    sfxVolume: 0.5,
  };
}

function buildVideoGenerationConfig(userId: string): GenerationConfig {
  const modelConfigRow = db
    .prepare(
      `SELECT id, model_ids FROM user_model_configs
         WHERE user_id = ? AND provider_type = 'video' AND enabled = 1 LIMIT 1`
    )
    .get(userId) as { id: string; model_ids: string } | undefined;

  let videoModelConfigId: string | undefined;
  let videoModel: string | undefined;

  if (modelConfigRow) {
    videoModelConfigId = modelConfigRow.id;
    try {
      const modelIds = JSON.parse(modelConfigRow.model_ids);
      videoModel = Array.isArray(modelIds) ? modelIds[0] : undefined;
    } catch {}
  }

  return {
    videoModelConfigId,
    videoModel,
    videoDuration: 5,
    videoResolution: '720p',
    videoAspectRatio: '16:9',
    bgmVolume: 0.3,
    voiceVolume: 1.0,
    sfxVolume: 0.5,
  };
}

function buildSceneAnalysis(row: SceneRow): SceneAnalysis {
  let characterActions: string[] = [];
  let dialogues: { speaker: string; text: string }[] = [];

  try {
    if (row.character_actions) characterActions = JSON.parse(row.character_actions);
  } catch {}

  try {
    if (row.dialogues) dialogues = JSON.parse(row.dialogues);
  } catch {}

  return {
    sceneId: row.id,
    pageIndex: row.page_index,
    sceneDescription: row.scene_description ?? '',
    setting: row.raw_text ?? '',
    cameraType: (row.camera_type as CameraType) ?? 'medium-shot',
    characterActions,
    characterEmotions: {},
    dialogues: dialogues.map((d) => ({
      speaker: d.speaker,
      text: d.text,
      emotion: 'neutral' as const,
      tone: 'normal' as const,
    })),
    mood: (row.mood as SceneAnalysis['mood']) ?? 'neutral',
    videoPrompt: '',
    firstFrameDescription: '',
    lastFrameDescription: row.scene_description ?? '',
  };
}
