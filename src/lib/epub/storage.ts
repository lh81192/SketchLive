import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const uploadDir = process.env.UPLOAD_DIR || "./uploads";

export const EPUB_UPLOAD_ROOT = path.join(uploadDir, "epub");

export function getEpubImportDir(importId: string) {
  return path.join(EPUB_UPLOAD_ROOT, importId);
}

export function getEpubOriginalPath(importId: string, fileName: string) {
  return path.join(getEpubImportDir(importId), `original${path.extname(fileName) || ".epub"}`);
}

export function getEpubPagePath(importId: string, pageNumber: number) {
  return path.join(getEpubImportDir(importId), "pages", `${String(pageNumber).padStart(4, "0")}.jpg`);
}

export function getEpubThumbPath(importId: string, pageNumber: number) {
  return path.join(getEpubImportDir(importId), "thumbs", `${String(pageNumber).padStart(4, "0")}.jpg`);
}

export async function ensureEpubImportDirs(importId: string) {
  const baseDir = getEpubImportDir(importId);
  await fs.mkdir(path.join(baseDir, "pages"), { recursive: true });
  await fs.mkdir(path.join(baseDir, "thumbs"), { recursive: true });
  return baseDir;
}

export async function writeUploadedEpub(importId: string, fileName: string, buffer: Buffer) {
  await ensureEpubImportDirs(importId);
  const targetPath = getEpubOriginalPath(importId, fileName);
  await fs.writeFile(targetPath, buffer);
  return targetPath;
}

export async function writeProcessedPageImage(params: {
  importId: string;
  pageNumber: number;
  buffer: Buffer;
}) {
  const outputPath = getEpubPagePath(params.importId, params.pageNumber);
  const thumbPath = getEpubThumbPath(params.importId, params.pageNumber);

  const normalized = sharp(params.buffer, { failOn: "none" }).flatten({ background: "#ffffff" }).jpeg({ quality: 92 });
  const imageBuffer = await normalized.toBuffer();
  const metadata = await sharp(imageBuffer).metadata();

  await fs.writeFile(outputPath, imageBuffer);
  await sharp(imageBuffer)
    .resize({ width: 480, height: 480, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toFile(thumbPath);

  return {
    imagePath: outputPath,
    thumbPath,
    width: metadata.width ?? null,
    height: metadata.height ?? null,
  };
}
