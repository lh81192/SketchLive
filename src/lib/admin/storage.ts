import fs from "node:fs/promises";
import path from "node:path";

async function getDirectorySize(targetPath: string): Promise<number> {
  try {
    const stats = await fs.stat(targetPath);
    if (!stats.isDirectory()) {
      return stats.size;
    }

    const entries = await fs.readdir(targetPath, { withFileTypes: true });
    const sizes = await Promise.all(
      entries.map((entry) => getDirectorySize(path.join(targetPath, entry.name)))
    );

    return sizes.reduce((sum, size) => sum + size, 0);
  } catch {
    return 0;
  }
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const power = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** power;
  return `${value >= 10 || power === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[power]}`;
}

export interface StorageStat {
  key: string;
  label: string;
  bytes: number;
  formatted: string;
}

export async function getStorageOverview(): Promise<StorageStat[]> {
  const uploadDir = path.resolve(process.env.UPLOAD_DIR || "./uploads");
  const dbPath = path.resolve(
    process.env.DATABASE_URL?.replace("file:", "") || "./data/aicomic.db"
  );

  const [uploadsBytes, dbBytes] = await Promise.all([
    getDirectorySize(uploadDir),
    getDirectorySize(dbPath),
  ]);

  return [
    {
      key: "uploads",
      label: "Uploads",
      bytes: uploadsBytes,
      formatted: formatBytes(uploadsBytes),
    },
    {
      key: "database",
      label: "Database",
      bytes: dbBytes,
      formatted: formatBytes(dbBytes),
    },
    {
      key: "total",
      label: "Total",
      bytes: uploadsBytes + dbBytes,
      formatted: formatBytes(uploadsBytes + dbBytes),
    },
  ];
}
