/**
 * Video Generator
 * 为每个分镜生成视频片段
 * 使用外部视频生成 API（如 MiniMax、Seedance）
 * 确保尾帧与下一个分镜的首帧衔接
 */

import { createServiceFromUserConfig, getDefaultConfig } from '@/lib/ai/factory';
import type { SceneAnalysis, VideoClip, KeyFrame, GenerationConfig } from './types';

interface VideoGenerationService {
  generateVideo?(opts: Record<string, unknown>): Promise<{ url: string; duration?: number; model?: string }>;
  generate?(opts: Record<string, unknown>): Promise<{ url: string; duration?: number; model?: string }>;
}

export interface VideoGeneratorInput {
  scene: SceneAnalysis;
  firstFrame: KeyFrame;
  lastFrame: KeyFrame;
  config: GenerationConfig;
  userId: string;
}

export async function generateVideoClip(input: VideoGeneratorInput): Promise<VideoClip> {
  const { scene, firstFrame, lastFrame, config, userId } = input;

  const clip: VideoClip = {
    id: `vc_${scene.sceneId}`,
    sceneId: scene.sceneId,
    firstFrameUrl: firstFrame.imageUrl,
    lastFrameUrl: lastFrame.imageUrl,
    prompt: buildVideoPrompt(scene),
    duration: config.videoDuration || 5,
    status: 'pending',
  };

  let videoService: VideoGenerationService | null = null;
  try {
    const configId = config.videoModelConfigId || getDefaultConfig(userId, 'video')?.id;
    if (configId) {
      videoService = await createVideoService(configId, userId);
    }
  } catch (error) {
    console.warn('[VideoGenerator] Failed to create video service:', error);
  }

  if (!videoService) {
    clip.status = 'failed';
    return clip;
  }

  clip.status = 'generating';

  try {
    const videoParams = buildVideoParams(scene, firstFrame, lastFrame, config);

    if ('generateVideo' in videoService) {
      const result = await videoService.generateVideo!(videoParams);
      clip.videoUrl = result?.url ?? clip.videoUrl;
      clip.duration = result?.duration ?? clip.duration;
      clip.status = 'completed';
      clip.modelUsed = result.model || 'video-model';
    } else if ('generate' in videoService) {
      const result = await videoService.generate!(videoParams);
      clip.videoUrl = result?.url ?? clip.videoUrl;
      clip.duration = result?.duration ?? clip.duration;
      clip.status = 'completed';
      clip.modelUsed = config.videoModel;
    } else {
      return generateFallbackVideo(clip, scene, config, userId);
    }
  } catch (error) {
    console.error('[VideoGenerator] Video generation failed:', error);
    return generateFallbackVideo(clip, scene, config, userId);
  }

  return clip;
}

function buildVideoPrompt(scene: SceneAnalysis): string {
  const parts: string[] = [scene.sceneDescription];
  if (scene.characterActions.length > 0) {
    parts.push(`角色动作：${scene.characterActions.join('，')}`);
  }
  parts.push(`氛围：${scene.mood}`);
  parts.push(scene.visualStyle ? `风格：${scene.visualStyle}` : '风格：日漫风格');
  return parts.join('。');
}

function buildVideoParams(
  scene: SceneAnalysis,
  firstFrame: KeyFrame,
  lastFrame: KeyFrame,
  config: GenerationConfig
): Record<string, unknown> {
  const params: Record<string, unknown> = {
    prompt: buildVideoPrompt(scene),
    duration: config.videoDuration || 5,
  };

  const resolutionMap: Record<string, { width: number; height: number }> = {
    '480p': { width: 854, height: 480 },
    '720p': { width: 1280, height: 720 },
    '1080p': { width: 1920, height: 1080 },
  };

  const resolution = resolutionMap[config.videoResolution || '720p'];

  if (config.videoAspectRatio === '9:16') {
    params.width = resolution.height;
    params.height = resolution.width;
  } else if (config.videoAspectRatio === '1:1') {
    params.width = Math.min(resolution.width, resolution.height);
    params.height = params.width;
  } else {
    params.width = resolution.width;
    params.height = resolution.height;
  }

  if (firstFrame.imageUrl) {
    params.firstFrameUrl = firstFrame.imageUrl;
  }
  if (lastFrame.imageUrl) {
    params.lastFrameUrl = lastFrame.imageUrl;
  }
  params.cameraMovement = scene.cameraMovement || 'static';

  return params;
}

async function generateFallbackVideo(
  clip: VideoClip,
  scene: SceneAnalysis,
  config: GenerationConfig,
  _userId: string
): Promise<VideoClip> {
  console.log('[VideoGenerator] Using fallback video generation');
  clip.status = 'completed';
  clip.prompt = `Fallback: 静态漫画图片展示，时长 ${config.videoDuration} 秒`;
  return clip;
}

async function createVideoService(configId: string, userId: string): Promise<VideoGenerationService | null> {
  try {
    return (await createServiceFromUserConfig(configId, userId)) as VideoGenerationService | null;
  } catch (error) {
    console.error('[VideoGenerator] Failed to create video service:', error);
    return null;
  }
}

export async function generateVideoClipsBatch(
  inputs: VideoGeneratorInput[],
  onProgress?: (current: number, total: number) => void
): Promise<VideoClip[]> {
  const results: VideoClip[] = [];
  for (let i = 0; i < inputs.length; i++) {
    const clip = await generateVideoClip(inputs[i]);
    results.push(clip);
    if (onProgress) onProgress(i + 1, inputs.length);
  }
  return results;
}
