import path from "node:path";
import EPub from "epub2";
import type { TocElement } from "epub2/lib/epub/const";

export interface ParsedEpubImage {
  id: string;
  href: string;
  mediaType: string;
  pageNumber: number;
}

export interface ParsedEpubBook {
  title: string | null;
  author: string | null;
  coverId: string | null;
  images: ParsedEpubImage[];
  epub: EPub;
}

function normalizeHref(value?: string | null) {
  return value ? value.split("#")[0]?.trim().toLowerCase() ?? "" : "";
}

function isImageItem(item?: TocElement) {
  const mediaType = item?.mediaType ?? item?.["media-type"] ?? "";
  return mediaType.startsWith("image/");
}

function isHtmlItem(item?: TocElement) {
  const mediaType = item?.mediaType ?? item?.["media-type"] ?? "";
  return (
    mediaType === "application/xhtml+xml" ||
    mediaType === "text/html" ||
    mediaType === "application/xml"
  );
}

function pickReadingOrderImages(epub: EPub) {
  const manifestItems = Object.values(epub.manifest ?? {});
  const manifestByHref = new Map<string, TocElement>();
  for (const item of manifestItems) {
    const href = normalizeHref(item.href);
    if (href) manifestByHref.set(href, item);
  }

  const seen = new Set<string>();
  const ordered: ParsedEpubImage[] = [];

  for (const item of epub.flow ?? []) {
    if (isImageItem(item) && item.id && !seen.has(item.id)) {
      seen.add(item.id);
      ordered.push({
        id: item.id,
        href: item.href ?? item.id,
        mediaType: item.mediaType ?? item["media-type"] ?? "application/octet-stream",
        pageNumber: ordered.length + 1,
      });
      continue;
    }

    if (!isHtmlItem(item) || !item.href) continue;

    const chapterHref = normalizeHref(item.href);
    const chapterDir = path.posix.dirname(chapterHref);

    for (const manifestItem of manifestItems) {
      if (!isImageItem(manifestItem) || !manifestItem.id || seen.has(manifestItem.id)) {
        continue;
      }

      const imageHref = normalizeHref(manifestItem.href);
      const inSameDir = chapterDir === "." ? !imageHref.includes("/") : imageHref.startsWith(`${chapterDir}/`);
      if (!inSameDir) continue;

      seen.add(manifestItem.id);
      ordered.push({
        id: manifestItem.id,
        href: manifestItem.href ?? manifestItem.id,
        mediaType: manifestItem.mediaType ?? manifestItem["media-type"] ?? "application/octet-stream",
        pageNumber: ordered.length + 1,
      });
      break;
    }
  }

  if (ordered.length > 0) return ordered;

  return manifestItems
    .filter((item) => isImageItem(item) && item.id)
    .map((item, index) => ({
      id: item.id!,
      href: item.href ?? item.id!,
      mediaType: item.mediaType ?? item["media-type"] ?? "application/octet-stream",
      pageNumber: index + 1,
    }));
}

export async function parseEpubBook(filePath: string): Promise<ParsedEpubBook> {
  const epub = await EPub.createAsync(filePath);
  const images = pickReadingOrderImages(epub);

  return {
    title: epub.metadata?.title ?? null,
    author: epub.metadata?.creator ?? null,
    coverId: epub.metadata?.cover ?? null,
    images,
    epub,
  };
}

export async function readEpubImage(epub: EPub, imageId: string) {
  const [buffer, mimeType] = await epub.getImageAsync(imageId);
  return { buffer, mimeType };
}
