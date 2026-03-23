/**
 * Frame Generator
 * 为每个分镜生成首帧（使用原图）和尾帧（AI 生成衔接图）
 */

import { createServiceFromUserConfig, getDefaultConfig } from '@/lib/ai/factory';
import type { SceneAnalysis, KeyFrame, GenerationConfig } from './types';

export interface FrameGeneratorInput {
  scene: SceneAnalysis;
  nextScene?: SceneAnalysis;
  config: GenerationConfig;
  userId: string;
  originalImageUrl?: string;
}

export async function generateKeyFrames(input: FrameGeneratorInput): Promise<KeyFrame[]> {
  const { scene, nextScene, config, userId, originalImageUrl } = input;
  const frames: KeyFrame[] = [];

  const firstFrame: KeyFrame = {
    id: `kf_first_${scene.sceneId}`,
    sceneId: scene.sceneId,
    frameType: 'first',
    imageUrl: originalImageUrl,
    prompt: scene.firstFrameDescription || scene.sceneDescription,
    status: 'completed',
  };
  frames.push(firstFrame);

  const lastFramePrompt = buildLastFramePrompt(scene, nextScene);
  const lastFrame: KeyFrame = {
    id: `kf_last_${scene.sceneId}`,
    sceneId: scene.sceneId,
    frameType: 'last',
    prompt: lastFramePrompt,
    status: 'pending',
  };

  if (config.imageModelConfigId || getDefaultConfig(userId, 'image')?.id) {
    lastFrame.status = 'generating';
    try {
      const imageService = await createImageService(config, userId);
      if (imageService && 'generateImage' in imageService) {
        const result = await imageService.generateImage({
          prompt: lastFramePrompt,
          model: config.imageModel,
          width: 1024,
          height: 1024,
        });
        lastFrame.imageUrl = result.url;
        lastFrame.status = 'completed';
      }
    } catch (error) {
      console.error('[FrameGenerator] Failed to generate last frame:', error);
      lastFrame.status = 'failed';
    }
  }

  frames.push(lastFrame);
  return frames;
}

function buildLastFramePrompt(scene: SceneAnalysis, nextScene?: SceneAnalysis): string {
  const basePrompt = scene.lastFrameDescription || scene.sceneDescription;
  if (nextScene) {
    const nextStartDescription = nextScene.firstFrameDescription || nextScene.sceneDescription;
    return `${basePrompt}\n过渡到下一个场景的开始：${nextStartDescription}\n确保画面可以平滑过渡到下一场景。`;
  }
  const actions = scene.characterActions.join('，');
  return `${basePrompt}\n角色动作结束状态：${actions}\n画面保持稳定，为可能的场景转换做准备。`;
}

async function createImageService(
  config: GenerationConfig,
  userId: string
): Promise<any | null> {
  try {
    const configId = config.imageModelConfigId || getDefaultConfig(userId, 'image')?.id;
    if (!configId) return null;
    const service = await createServiceFromUserConfig(configId, userId);
    if ('generateImage' in service) return service;
    return null;
  } catch (error) {
    console.error('[FrameGenerator] Failed to create image service:', error);
    return null;
  }
}

export async function generateKeyFramesBatch(
  inputs: FrameGeneratorInput[],
  onProgress?: (current: number, total: number) => void
): Promise<KeyFrame[][]> {
  const results: KeyFrame[][] = [];
  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i];
    if (i < inputs.length - 1) {
      input.nextScene = inputs[i + 1].scene;
    }
    const frames = await generateKeyFrames(input);
    results.push(frames);
    if (onProgress) onProgress(i + 1, inputs.length);
  }
  return results;
}
