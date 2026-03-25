import fs from "node:fs";
import path from "node:path";
import util from "node:util";
import type Database from "better-sqlite3";

export const REAL_SCHEMA_PROJECT_DELETE_CASCADE_AUDIT = {
  // Audited against src/lib/db.ts for Task 1. All current project-owned DB dependents
  // are already covered by real-schema foreign key cascades, so the service only needs
  // to delete the project row and handle supplemental local file cleanup.
  directProjectDependents: [
    "project_configs",
    "tasks",
    "likes",
    "favorites",
    "comments",
    "scenes",
    "audio_tracks",
    "pipeline_status",
  ],
  indirectDependents: ["key_frames", "video_clips"],
  requiresExplicitDependentRowCleanup: false,
} as const;

export class InvalidProjectDeletionRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidProjectDeletionRequestError";
  }
}

export class ProjectNotFoundError extends Error {
  readonly projectId: string;

  constructor(projectId: string) {
    super(`Project not found: ${projectId}`);
    this.name = "ProjectNotFoundError";
    this.projectId = projectId;
  }
}

export class ProjectForbiddenError extends Error {
  readonly projectId: string;
  readonly userId: string;

  constructor(projectId: string, userId: string) {
    super(`User ${userId} cannot delete project ${projectId}`);
    this.name = "ProjectForbiddenError";
    this.projectId = projectId;
    this.userId = userId;
  }
}

interface DeleteProjectForUserInput {
  userId: string;
  projectId: string;
  publicRoot: string;
}

interface ProjectDeletionRecord {
  id: string;
  user_id: string;
  epub_path: string;
  cover_image: string | null;
  video_url: string | null;
}

interface ProjectOwnedManagedFileRecord {
  file_path: string | null;
}

export function deleteProjectForUser(
  db: Database.Database,
  { userId, projectId, publicRoot }: DeleteProjectForUserInput
): void {
  if (!userId.trim()) {
    throw new InvalidProjectDeletionRequestError("userId is required");
  }

  if (!projectId.trim()) {
    throw new InvalidProjectDeletionRequestError("projectId is required");
  }

  if (!publicRoot.trim()) {
    throw new InvalidProjectDeletionRequestError("publicRoot is required");
  }

  const project = db
    .prepare(
      `
        SELECT id, user_id, epub_path, cover_image, video_url
        FROM projects
        WHERE id = ?
      `
    )
    .get(projectId) as ProjectDeletionRecord | undefined;

  if (!project) {
    throw new ProjectNotFoundError(projectId);
  }

  if (project.user_id !== userId) {
    throw new ProjectForbiddenError(projectId, userId);
  }

  const candidatePaths = [
    project.epub_path,
    project.cover_image,
    project.video_url,
    ...getProjectOwnedManagedFilePaths(db, projectId),
  ];

  db.prepare(`DELETE FROM projects WHERE id = ?`).run(projectId);

  for (const candidatePath of candidatePaths) {
    const managedFilePath = resolveManagedUploadPath(publicRoot, candidatePath);

    if (!managedFilePath) {
      continue;
    }

    try {
      fs.unlinkSync(managedFilePath);
    } catch (error) {
      if (!isMissingFileError(error)) {
        console.warn(
          `Project ${projectId} was deleted but cleanup failed for ${managedFilePath}: ${formatCleanupError(error)}`
        );
      }
    }
  }
}

function getProjectOwnedManagedFilePaths(
  db: Database.Database,
  projectId: string
): Array<string | null> {
  const sceneImagePaths = db
    .prepare(
      `
        SELECT image_path AS file_path
        FROM scenes
        WHERE project_id = ?
      `
    )
    .all(projectId) as ProjectOwnedManagedFileRecord[];

  const keyFrameImagePaths = db
    .prepare(
      `
        SELECT key_frames.image_url AS file_path
        FROM key_frames
        INNER JOIN scenes ON scenes.id = key_frames.scene_id
        WHERE scenes.project_id = ?
      `
    )
    .all(projectId) as ProjectOwnedManagedFileRecord[];

  const videoClipPaths = db
    .prepare(
      `
        SELECT video_clips.video_url AS file_path
        FROM video_clips
        INNER JOIN scenes ON scenes.id = video_clips.scene_id
        WHERE scenes.project_id = ?
      `
    )
    .all(projectId) as ProjectOwnedManagedFileRecord[];

  const audioTrackPaths = db
    .prepare(
      `
        SELECT audio_url AS file_path
        FROM audio_tracks
        WHERE project_id = ?
      `
    )
    .all(projectId) as ProjectOwnedManagedFileRecord[];

  return [
    ...sceneImagePaths,
    ...keyFrameImagePaths,
    ...videoClipPaths,
    ...audioTrackPaths,
  ].map((record) => record.file_path);
}

function formatCleanupError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return util.inspect(error);
}

function resolveManagedUploadPath(
  publicRoot: string,
  candidatePath: string | null
): string | null {
  if (!candidatePath) {
    return null;
  }

  if (/^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(candidatePath)) {
    return null;
  }

  const normalizedCandidate = candidatePath.replace(/\\/g, "/");

  if (!normalizedCandidate.startsWith("/uploads/")) {
    return null;
  }

  const uploadsRoot = path.resolve(publicRoot, "uploads");
  const relativeUploadPath = normalizedCandidate.slice("/uploads/".length);
  const resolvedPath = path.resolve(uploadsRoot, relativeUploadPath);
  const relativeToUploadsRoot = path.relative(uploadsRoot, resolvedPath);

  if (
    relativeToUploadsRoot === "" ||
    relativeToUploadsRoot.startsWith("..") ||
    path.isAbsolute(relativeToUploadsRoot)
  ) {
    return null;
  }

  if (!isPathContainedWithinUploadsRoot(uploadsRoot, resolvedPath)) {
    return null;
  }

  return resolvedPath;
}

function isPathContainedWithinUploadsRoot(
  uploadsRoot: string,
  resolvedPath: string
): boolean {
  if (!fs.existsSync(uploadsRoot)) {
    return true;
  }

  const existingPath = findNearestExistingPath(resolvedPath);
  const realUploadsRoot = fs.realpathSync.native(uploadsRoot);
  const realExistingPath = fs.realpathSync.native(existingPath);
  const relativeToRealUploadsRoot = path.relative(realUploadsRoot, realExistingPath);

  return (
    relativeToRealUploadsRoot === "" ||
    (!relativeToRealUploadsRoot.startsWith("..") &&
      !path.isAbsolute(relativeToRealUploadsRoot))
  );
}

function findNearestExistingPath(targetPath: string): string {
  let currentPath = targetPath;

  while (!fs.existsSync(currentPath)) {
    const parentPath = path.dirname(currentPath);

    if (parentPath === currentPath) {
      return currentPath;
    }

    currentPath = parentPath;
  }

  return currentPath;
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

// ---------------------------------------------------------------------------
// Batch deletion
// ---------------------------------------------------------------------------

interface DeleteProjectsForUserInput {
  userId: string;
  projectIds: string[];
  publicRoot: string;
}

interface DeleteProjectsResult {
  deletedCount: number;
  deletedProjectIds: string[];
}

export function deleteProjectsForUser(
  db: Database.Database,
  { userId, projectIds, publicRoot }: DeleteProjectsForUserInput
): DeleteProjectsResult {
  if (!userId.trim()) {
    throw new InvalidProjectDeletionRequestError("userId is required");
  }

  // Deduplicate IDs
  const uniqueIds = Array.from(new Set(projectIds));

  if (uniqueIds.length === 0) {
    throw new InvalidProjectDeletionRequestError("projectIds cannot be empty");
  }

  // Fetch all requested project records in one query
  const rows = db
    .prepare(
      `SELECT id, user_id, epub_path, cover_image, video_url
       FROM projects
       WHERE id IN (${uniqueIds.map(() => "?").join(",")})`
    )
    .all(...uniqueIds) as ProjectDeletionRecord[];

  // Validate all requested IDs were found
  const foundIds = new Set(rows.map((r) => r.id));
  if (foundIds.size === 0) {
    // All IDs are non-existent — treat as an invalid batch request.
    throw new InvalidProjectDeletionRequestError(
      "None of the requested project IDs were found"
    );
  }
  for (const id of uniqueIds) {
    if (!foundIds.has(id)) {
      throw new ProjectNotFoundError(id);
    }
  }

  // Validate all belong to the requesting user
  for (const row of rows) {
    if (row.user_id !== userId) {
      throw new ProjectForbiddenError(row.id, userId);
    }
  }

  // Collect all managed file paths before any deletion
  const candidatePaths: Array<string | null> = [];
  for (const row of rows) {
    candidatePaths.push(
      row.epub_path,
      row.cover_image,
      row.video_url,
      ...getProjectOwnedManagedFilePaths(db, row.id)
    );
  }

  // Delete all project rows in one transaction
  db.transaction(() => {
    for (const id of uniqueIds) {
      db.prepare(`DELETE FROM projects WHERE id = ?`).run(id);
    }
  })();

  // Best-effort file cleanup after DB commit
  for (const candidatePath of candidatePaths) {
    const managedFilePath = resolveManagedUploadPath(publicRoot, candidatePath);

    if (!managedFilePath) {
      continue;
    }

    try {
      fs.unlinkSync(managedFilePath);
    } catch (error) {
      if (!isMissingFileError(error)) {
        console.warn(
          `Batch deletion cleanup failed for ${managedFilePath}: ${formatCleanupError(error)}`
        );
      }
    }
  }

  return {
    deletedCount: uniqueIds.length,
    deletedProjectIds: [...uniqueIds],
  };
}
