// src/lib/ai/providers/veo.ts
import { GoogleGenAI } from "@google/genai";
import type { VideoProvider, VideoGenerateParams, VideoGenerateResult } from "../types";
import fs from "node:fs";
import path from "node:path";
import { ulid } from "ulid";

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "").replace(/\/v\d[^/]*$/, "");
}

const VALID_DURATIONS = [4, 6, 8] as const;

function clampDuration(duration: number): number {
  return VALID_DURATIONS.reduce((prev, curr) =>
    Math.abs(curr - duration) < Math.abs(prev - duration) ? curr : prev
  );
}

function toAspectRatio(ratio?: string): "16:9" | "9:16" {
  if (ratio === "9:16") return "9:16";
  return "16:9";
}

function readImageData(filePath: string): { imageBytes: string; mimeType: string } {
  const ext = path.extname(filePath).toLowerCase();
  const mimeType =
    ext === ".png" ? "image/png" :
    ext === ".webp" ? "image/webp" :
    "image/jpeg";
  const imageBytes = fs.readFileSync(filePath, { encoding: "base64" });
  return { imageBytes, mimeType };
}

function modelSupportsLastFrame(modelId: string): boolean {
  const normalized = modelId.toLowerCase();
  return normalized.includes("veo-2") || normalized.includes("veo 2");
}

function buildVideoRequest(params: VideoGenerateParams, modelId: string, durationSeconds: number, aspectRatio: "16:9" | "9:16") {
  const supportsLastFrame = modelSupportsLastFrame(modelId);

  if ("firstFrame" in params) {
    const firstFrameData = readImageData(params.firstFrame);
    const request: {
      image: { imageBytes: string; mimeType: string };
      config: {
        durationSeconds: number;
        aspectRatio: "16:9" | "9:16";
        lastFrame?: { imageBytes: string; mimeType: string };
      };
    } = {
      image: firstFrameData,
      config: {
        durationSeconds,
        aspectRatio,
      },
    };

    if (supportsLastFrame) {
      request.config.lastFrame = readImageData(params.lastFrame);
    }

    return request;
  }

  return {
    image: readImageData(params.initialImage),
    config: {
      durationSeconds,
      aspectRatio,
    },
  };
}

function getModeLabel(params: VideoGenerateParams, modelId: string): string {
  if ("firstFrame" in params) {
    return modelSupportsLastFrame(modelId) ? "keyframe+lastFrame" : "keyframe";
  }
  return "reference";
}

function ensureSupportedMode(params: VideoGenerateParams) {
  if ("firstFrame" in params || "initialImage" in params) {
    return;
  }
  throw new Error("Veo provider requires either firstFrame/lastFrame or initialImage");
}

export class VeoProvider implements VideoProvider {
  private client: GoogleGenAI;
  private model: string;
  private uploadDir: string;

  constructor(params?: { apiKey?: string; baseUrl?: string; model?: string; uploadDir?: string }) {
    const apiKey = params?.apiKey || process.env.GEMINI_API_KEY || "";
    const baseUrl = params?.baseUrl ? normalizeBaseUrl(params.baseUrl) : undefined;

    const options: ConstructorParameters<typeof GoogleGenAI>[0] = {
      apiKey,
      ...(baseUrl ? { httpOptions: { baseUrl } } : {}),
    };

    this.client = new GoogleGenAI(options);
    this.model = params?.model || "veo-2.0-generate-001";
    this.uploadDir = params?.uploadDir || process.env.UPLOAD_DIR || "./uploads";
  }

  private getModelId(): string {
    return this.model;
  }

  private ensureOperationName(operation: Awaited<ReturnType<GoogleGenAI["models"]["generateVideos"]>>): void {
    if (!operation.name) {
      throw new Error("Veo did not return an operation name");
    }
  }

  async generateVideo(params: VideoGenerateParams): Promise<VideoGenerateResult> {
    ensureSupportedMode(params);
    const durationSeconds = clampDuration(params.duration);
    const aspectRatio = toAspectRatio(params.ratio);
    const modelId = this.getModelId();
    const request = buildVideoRequest(params, modelId, durationSeconds, aspectRatio);

    console.log(
      `[Veo] Submitting task: model=${this.model}, mode=${getModeLabel(params, modelId)}, duration=${durationSeconds}s, ratio=${aspectRatio}`
    );

    let operation = await this.client.models.generateVideos({
      model: modelId,
      prompt: params.prompt,
      ...request,
    });
    this.ensureOperationName(operation);

    if ("firstFrame" in params && !modelSupportsLastFrame(modelId)) {
      console.log(`[Veo] Model ${this.model} does not support lastFrame, falling back to first-frame-only image2video`);
    }

    if ("initialImage" in params) {
      console.log(`[Veo] Model ${this.model} uses initialImage-only image2video request`);
    }


    operation = await this.pollForResult(operation);

    const response = operation.response;

    if ((response?.raiMediaFilteredCount ?? 0) > 0) {
      throw new Error(
        `Veo generation blocked by safety filter: ${JSON.stringify(response?.raiMediaFilteredReasons)}`
      );
    }

    if (!response?.generatedVideos?.[0]) {
      throw new Error("No video returned from Veo");
    }
    const videoFile = response.generatedVideos[0].video;
    if (!videoFile) {
      throw new Error("No video URI returned from Veo");
    }

    const dir = path.join(this.uploadDir, "videos");
    fs.mkdirSync(dir, { recursive: true });
    const downloadPath = path.join(dir, `${ulid()}.mp4`);

    await this.client.files.download({ file: videoFile, downloadPath });

    console.log(`[Veo] Video saved to ${downloadPath}`);
    return { filePath: downloadPath };
  }

  private async pollForResult(
    initial: Awaited<ReturnType<GoogleGenAI["models"]["generateVideos"]>>
  ): Promise<typeof initial> {
    const maxAttempts = 60;
    let operation = initial;

    for (let i = 0; i < maxAttempts; i++) {
      console.log(`[Veo] Poll ${i + 1}: done=${operation.done}`);

      if (operation.done) {
        if (operation.error) {
          throw new Error(`Veo generation failed: ${JSON.stringify(operation.error)}`);
        }
        return operation;
      }

      await new Promise((resolve) => setTimeout(resolve, 10_000));
      operation = await this.client.operations.getVideosOperation({
        operation,
      });
    }

    throw new Error("Veo generation timed out after 10 minutes");
  }
}
