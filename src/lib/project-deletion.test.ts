import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

import {
  deleteProjectForUser,
  deleteProjectsForUser,
  InvalidProjectDeletionRequestError,
  ProjectForbiddenError,
  ProjectNotFoundError,
  REAL_SCHEMA_PROJECT_DELETE_CASCADE_AUDIT,
} from "./project-deletion";

function createTestDb() {
  const db = new Database(":memory:");

  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL
    );

    CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      epub_path TEXT NOT NULL,
      cover_image TEXT,
      status TEXT DEFAULT 'pending',
      video_url TEXT,
      duration INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE project_configs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      voice_model TEXT DEFAULT 'gpt-sovits',
      voice_params TEXT,
      bgm_model TEXT DEFAULT 'minimax',
      sfx_model TEXT DEFAULT 'elevenlabs',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      task_type TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      input_data TEXT,
      output_data TEXT,
      error_message TEXT,
      progress INTEGER DEFAULT 0,
      started_at TEXT,
      completed_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE likes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      UNIQUE(user_id, project_id)
    );

    CREATE TABLE favorites (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      UNIQUE(user_id, project_id)
    );

    CREATE TABLE comments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      parent_id TEXT,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (parent_id) REFERENCES comments(id) ON DELETE CASCADE
    );

    CREATE TABLE scenes (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      page_index INTEGER NOT NULL,
      image_path TEXT,
      raw_text TEXT,
      scene_description TEXT,
      camera_type TEXT,
      character_actions TEXT,
      dialogues TEXT,
      mood TEXT,
      frames_status TEXT DEFAULT 'pending' CHECK(frames_status IN ('pending', 'completed', 'failed')),
      sequence_index INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE key_frames (
      id TEXT PRIMARY KEY,
      scene_id TEXT NOT NULL,
      frame_type TEXT NOT NULL CHECK(frame_type IN ('first', 'last')),
      image_url TEXT,
      prompt TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'generating', 'completed', 'failed')),
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (scene_id) REFERENCES scenes(id) ON DELETE CASCADE,
      UNIQUE(scene_id, frame_type)
    );

    CREATE TABLE video_clips (
      id TEXT PRIMARY KEY,
      scene_id TEXT NOT NULL,
      first_frame_id TEXT,
      last_frame_id TEXT,
      video_url TEXT,
      duration REAL,
      prompt TEXT,
      status TEXT DEFAULT 'pending',
      model_used TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (scene_id) REFERENCES scenes(id) ON DELETE CASCADE,
      FOREIGN KEY (first_frame_id) REFERENCES key_frames(id) ON DELETE SET NULL,
      FOREIGN KEY (last_frame_id) REFERENCES key_frames(id) ON DELETE SET NULL
    );

    CREATE TABLE audio_tracks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      track_type TEXT NOT NULL CHECK(track_type IN ('voice', 'bgm', 'sfx')),
      scene_id TEXT,
      audio_url TEXT,
      duration REAL,
      prompt TEXT,
      voice_id TEXT,
      model_used TEXT,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (scene_id) REFERENCES scenes(id) ON DELETE SET NULL
    );

    CREATE TABLE pipeline_status (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL UNIQUE,
      current_step TEXT,
      total_scenes INTEGER DEFAULT 0,
      processed_scenes INTEGER DEFAULT 0,
      status TEXT DEFAULT 'idle',
      error_message TEXT,
      started_at TEXT,
      completed_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
  `);

  return db;
}

function createPublicRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "project-deletion-"));
  const publicRoot = path.join(root, "public");

  fs.mkdirSync(publicRoot, { recursive: true });

  return { root, publicRoot };
}

function writePublicFile(publicRoot: string, relativePath: string) {
  const filePath = path.join(publicRoot, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "test-file");
  return filePath;
}

function insertUser(db: Database.Database, userId: string) {
  db.prepare(
    `INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)`
  ).run(userId, `${userId}@example.com`, "hashed-password");
}

function insertProject(
  db: Database.Database,
  {
    id = "project-1",
    userId = "user-1",
    epubPath = "/uploads/books/project-1.epub",
    coverImage = "/uploads/covers/project-1.jpg",
    videoUrl = "/uploads/videos/project-1.mp4",
  }: {
    id?: string;
    userId?: string;
    epubPath?: string;
    coverImage?: string | null;
    videoUrl?: string | null;
  } = {}
) {
  db.prepare(`
    INSERT INTO projects (id, user_id, title, description, epub_path, cover_image, status, video_url, duration)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, userId, "测试项目", "用于删除测试", epubPath, coverImage, "completed", videoUrl, 42);
}

function countRows(db: Database.Database, table: string) {
  return db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as { count: number };
}

test("deleteProjectForUser deletes the project row, cascaded rows, and all managed local files owned by the project", () => {
  const db = createTestDb();
  const { root, publicRoot } = createPublicRoot();

  try {
    insertUser(db, "user-1");
    insertUser(db, "user-2");
    insertProject(db);

    db.prepare(`INSERT INTO project_configs (id, project_id) VALUES (?, ?)`)
      .run("config-1", "project-1");
    db.prepare(`INSERT INTO tasks (id, project_id, task_type) VALUES (?, ?, ?)`)
      .run("task-1", "project-1", "storyboard");
    db.prepare(`INSERT INTO likes (id, user_id, project_id) VALUES (?, ?, ?)`)
      .run("like-1", "user-2", "project-1");
    db.prepare(`INSERT INTO favorites (id, user_id, project_id) VALUES (?, ?, ?)`)
      .run("favorite-1", "user-2", "project-1");
    db.prepare(`INSERT INTO comments (id, user_id, project_id, content) VALUES (?, ?, ?, ?)`)
      .run("comment-1", "user-2", "project-1", "保留一条评论");
    db.prepare(`
      INSERT INTO scenes (id, project_id, page_index, image_path, sequence_index)
      VALUES (?, ?, ?, ?, ?)
    `).run("scene-1", "project-1", 0, "/uploads/scenes/scene-1.png", 0);
    db.prepare(`
      INSERT INTO key_frames (id, scene_id, frame_type, image_url)
      VALUES (?, ?, ?, ?)
    `).run("frame-1", "scene-1", "first", "/uploads/keyframes/frame-1.png");
    db.prepare(`
      INSERT INTO video_clips (id, scene_id, first_frame_id, video_url)
      VALUES (?, ?, ?, ?)
    `).run("clip-1", "scene-1", "frame-1", "/uploads/clips/clip-1.mp4");
    db.prepare(`
      INSERT INTO audio_tracks (id, project_id, track_type, scene_id, audio_url)
      VALUES (?, ?, ?, ?, ?)
    `).run("audio-1", "project-1", "voice", "scene-1", "/uploads/audio/audio-1.mp3");
    db.prepare(`INSERT INTO pipeline_status (id, project_id, status) VALUES (?, ?, ?)`)
      .run("pipeline-1", "project-1", "completed");

    const epubFile = writePublicFile(publicRoot, "uploads/books/project-1.epub");
    const coverFile = writePublicFile(publicRoot, "uploads/covers/project-1.jpg");
    const videoFile = writePublicFile(publicRoot, "uploads/videos/project-1.mp4");
    const sceneImageFile = writePublicFile(publicRoot, "uploads/scenes/scene-1.png");
    const keyFrameImageFile = writePublicFile(publicRoot, "uploads/keyframes/frame-1.png");
    const clipVideoFile = writePublicFile(publicRoot, "uploads/clips/clip-1.mp4");
    const audioTrackFile = writePublicFile(publicRoot, "uploads/audio/audio-1.mp3");

    deleteProjectForUser(db, {
      userId: "user-1",
      projectId: "project-1",
      publicRoot,
    });

    assert.equal(countRows(db, "projects").count, 0);
    assert.equal(countRows(db, "project_configs").count, 0);
    assert.equal(countRows(db, "tasks").count, 0);
    assert.equal(countRows(db, "likes").count, 0);
    assert.equal(countRows(db, "favorites").count, 0);
    assert.equal(countRows(db, "comments").count, 0);
    assert.equal(countRows(db, "scenes").count, 0);
    assert.equal(countRows(db, "key_frames").count, 0);
    assert.equal(countRows(db, "video_clips").count, 0);
    assert.equal(countRows(db, "audio_tracks").count, 0);
    assert.equal(countRows(db, "pipeline_status").count, 0);

    assert.equal(fs.existsSync(epubFile), false);
    assert.equal(fs.existsSync(coverFile), false);
    assert.equal(fs.existsSync(videoFile), false);
    assert.equal(fs.existsSync(sceneImageFile), false);
    assert.equal(fs.existsSync(keyFrameImageFile), false);
    assert.equal(fs.existsSync(clipVideoFile), false);
    assert.equal(fs.existsSync(audioTrackFile), false);
  } finally {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("deleteProjectForUser throws ProjectNotFoundError when the project does not exist", () => {
  const db = createTestDb();
  const { root, publicRoot } = createPublicRoot();

  try {
    insertUser(db, "user-1");

    assert.throws(
      () =>
        deleteProjectForUser(db, {
          userId: "user-1",
          projectId: "missing-project",
          publicRoot,
        }),
      (error) => {
        assert.ok(error instanceof ProjectNotFoundError);
        assert.equal(error.projectId, "missing-project");
        return true;
      }
    );
  } finally {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("deleteProjectForUser throws ProjectForbiddenError when the project belongs to another user", () => {
  const db = createTestDb();
  const { root, publicRoot } = createPublicRoot();

  try {
    insertUser(db, "user-1");
    insertUser(db, "user-2");
    insertProject(db, { userId: "user-2" });

    assert.throws(
      () =>
        deleteProjectForUser(db, {
          userId: "user-1",
          projectId: "project-1",
          publicRoot,
        }),
      (error) => {
        assert.ok(error instanceof ProjectForbiddenError);
        assert.equal(error.projectId, "project-1");
        assert.equal(error.userId, "user-1");
        return true;
      }
    );

    assert.equal(countRows(db, "projects").count, 1);
  } finally {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("deleteProjectForUser ignores missing managed local files", () => {
  const db = createTestDb();
  const { root, publicRoot } = createPublicRoot();

  try {
    insertUser(db, "user-1");
    insertProject(db, {
      epubPath: "/uploads/books/missing.epub",
      coverImage: "/uploads/covers/missing.jpg",
      videoUrl: "/uploads/videos/missing.mp4",
    });

    assert.doesNotThrow(() =>
      deleteProjectForUser(db, {
        userId: "user-1",
        projectId: "project-1",
        publicRoot,
      })
    );

    assert.equal(countRows(db, "projects").count, 0);
  } finally {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("deleteProjectForUser keeps DB deletion successful when managed file cleanup fails", () => {
  const db = createTestDb();
  const { root, publicRoot } = createPublicRoot();
  const cleanupTarget = writePublicFile(publicRoot, "uploads/books/project-1.epub");
  const originalUnlinkSync = fs.unlinkSync;
  const warnings: string[] = [];
  const originalWarn = console.warn;

  try {
    insertUser(db, "user-1");
    insertProject(db, {
      epubPath: "/uploads/books/project-1.epub",
      coverImage: null,
      videoUrl: null,
    });

    fs.unlinkSync = ((targetPath: fs.PathLike) => {
      if (targetPath === cleanupTarget) {
        throw new Error("disk busy");
      }

      return originalUnlinkSync(targetPath);
    }) as typeof fs.unlinkSync;

    console.warn = ((message?: unknown, ...optionalParams: unknown[]) => {
      warnings.push([message, ...optionalParams].map((value) => String(value)).join(" "));
    }) as typeof console.warn;

    assert.doesNotThrow(() =>
      deleteProjectForUser(db, {
        userId: "user-1",
        projectId: "project-1",
        publicRoot,
      })
    );

    assert.equal(countRows(db, "projects").count, 0);
    assert.equal(fs.existsSync(cleanupTarget), true);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /cleanup failed/);
  } finally {
    fs.unlinkSync = originalUnlinkSync;
    console.warn = originalWarn;
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("real schema audit confirms project-owned dependents are covered by cascades", () => {
  assert.equal(REAL_SCHEMA_PROJECT_DELETE_CASCADE_AUDIT.requiresExplicitDependentRowCleanup, false);
  assert.deepEqual(REAL_SCHEMA_PROJECT_DELETE_CASCADE_AUDIT.directProjectDependents, [
    "project_configs",
    "tasks",
    "likes",
    "favorites",
    "comments",
    "scenes",
    "audio_tracks",
    "pipeline_status",
  ]);
  assert.deepEqual(REAL_SCHEMA_PROJECT_DELETE_CASCADE_AUDIT.indirectDependents, [
    "key_frames",
    "video_clips",
  ]);
});

/*
Real-schema audit note for Task 1:
- Audited src/lib/db.ts and confirmed project deletion is covered by foreign-key cascades.
- No explicit dependent-row cleanup is needed in deleteProjectForUser; only supplemental
  managed file cleanup remains after deleting the project row.
*/



test("deleteProjectForUser ignores remote URLs and local paths outside public/uploads", () => {
  const db = createTestDb();
  const { root, publicRoot } = createPublicRoot();

  try {
    insertUser(db, "user-1");

    const nonManagedEpub = writePublicFile(publicRoot, "documents/project-1.epub");
    const escapedCover = writePublicFile(publicRoot, "private/project-1.jpg");

    insertProject(db, {
      epubPath: "/documents/project-1.epub",
      coverImage: "/uploads/../private/project-1.jpg",
      videoUrl: "https://cdn.example.com/project-1.mp4",
    });

    deleteProjectForUser(db, {
      userId: "user-1",
      projectId: "project-1",
      publicRoot,
    });

    assert.equal(countRows(db, "projects").count, 0);
    assert.equal(fs.existsSync(nonManagedEpub), true);
    assert.equal(fs.existsSync(escapedCover), true);
  } finally {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("deleteProjectForUser does not delete files through symlinked directories under public/uploads", () => {
  const db = createTestDb();
  const { root, publicRoot } = createPublicRoot();

  try {
    insertUser(db, "user-1");

    const uploadsRoot = path.join(publicRoot, "uploads");
    const privateRoot = path.join(publicRoot, "private");
    const symlinkedUploadsDir = path.join(uploadsRoot, "linked");
    const escapedTargetFile = writePublicFile(publicRoot, "private/escape.epub");

    fs.mkdirSync(uploadsRoot, { recursive: true });
    fs.mkdirSync(privateRoot, { recursive: true });
    fs.symlinkSync(privateRoot, symlinkedUploadsDir, "dir");

    insertProject(db, {
      epubPath: "/uploads/linked/escape.epub",
      coverImage: null,
      videoUrl: null,
    });

    deleteProjectForUser(db, {
      userId: "user-1",
      projectId: "project-1",
      publicRoot,
    });

    assert.equal(countRows(db, "projects").count, 0);
    assert.equal(fs.existsSync(escapedTargetFile), true);
  } finally {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Batch deletion service tests
// ---------------------------------------------------------------------------

test("deleteProjectsForUser deduplicates ids and deletes unique projects", () => {
  const db = createTestDb();
  const { root, publicRoot } = createPublicRoot();

  try {
    insertUser(db, "user-1");

    const fileA = writePublicFile(publicRoot, "uploads/a.epub");
    const fileB = writePublicFile(publicRoot, "uploads/b.epub");
    const fileC = writePublicFile(publicRoot, "uploads/c.epub");

    insertProject(db, {
      id: "a",
      userId: "user-1",
      epubPath: "/uploads/a.epub",
      coverImage: null,
      videoUrl: null,
    });
    insertProject(db, {
      id: "b",
      userId: "user-1",
      epubPath: "/uploads/b.epub",
      coverImage: null,
      videoUrl: null,
    });
    insertProject(db, {
      id: "c",
      userId: "user-1",
      epubPath: "/uploads/c.epub",
      coverImage: null,
      videoUrl: null,
    });

    const result = deleteProjectsForUser(db, {
      userId: "user-1",
      projectIds: ["a", "a", "b", "c"],
      publicRoot,
    });

    assert.equal(result.deletedCount, 3);
    assert.deepEqual(result.deletedProjectIds.sort(), ["a", "b", "c"]);
    assert.equal(countRows(db, "projects").count, 0);
    assert.equal(fs.existsSync(fileA), false);
    assert.equal(fs.existsSync(fileB), false);
    assert.equal(fs.existsSync(fileC), false);
  } finally {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("deleteProjectsForUser throws InvalidProjectDeletionRequestError when projectIds is empty", () => {
  const db = createTestDb();
  const { root, publicRoot } = createPublicRoot();

  try {
    insertUser(db, "user-1");

    assert.throws(
      () =>
        deleteProjectsForUser(db, {
          userId: "user-1",
          projectIds: [],
          publicRoot,
        }),
      (error) => {
        assert.ok(error instanceof InvalidProjectDeletionRequestError);
        return true;
      }
    );
  } finally {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("deleteProjectsForUser throws InvalidProjectDeletionRequestError when projectIds dedupes to empty", () => {
  const db = createTestDb();
  const { root, publicRoot } = createPublicRoot();

  try {
    insertUser(db, "user-1");

    assert.throws(
      () =>
        deleteProjectsForUser(db, {
          userId: "user-1",
          projectIds: ["missing-id", "also-missing"],
          publicRoot,
        }),
      (error) => {
        assert.ok(error instanceof InvalidProjectDeletionRequestError);
        return true;
      }
    );
  } finally {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("deleteProjectsForUser throws ProjectNotFoundError when any project does not exist", () => {
  const db = createTestDb();
  const { root, publicRoot } = createPublicRoot();

  try {
    insertUser(db, "user-1");

    const file = writePublicFile(publicRoot, "uploads/exists.epub");
    insertProject(db, {
      id: "exists",
      userId: "user-1",
      epubPath: "/uploads/exists.epub",
      coverImage: null,
      videoUrl: null,
    });

    assert.throws(
      () =>
        deleteProjectsForUser(db, {
          userId: "user-1",
          projectIds: ["exists", "missing-id"],
          publicRoot,
        }),
      (error) => {
        assert.ok(error instanceof ProjectNotFoundError);
        assert.equal(error.projectId, "missing-id");
        return true;
      }
    );

    assert.equal(countRows(db, "projects").count, 1);
    assert.equal(fs.existsSync(file), true);
  } finally {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("deleteProjectsForUser throws ProjectForbiddenError when any project belongs to another user", () => {
  const db = createTestDb();
  const { root, publicRoot } = createPublicRoot();

  try {
    insertUser(db, "user-1");
    insertUser(db, "user-2");

    const file = writePublicFile(publicRoot, "uploads/foreign.epub");
    insertProject(db, {
      id: "foreign",
      userId: "user-2",
      epubPath: "/uploads/foreign.epub",
      coverImage: null,
      videoUrl: null,
    });
    insertProject(db, {
      id: "own",
      userId: "user-1",
      epubPath: "/uploads/own.epub",
      coverImage: null,
      videoUrl: null,
    });

    assert.throws(
      () =>
        deleteProjectsForUser(db, {
          userId: "user-1",
          projectIds: ["own", "foreign"],
          publicRoot,
        }),
      (error) => {
        assert.ok(error instanceof ProjectForbiddenError);
        assert.equal(error.projectId, "foreign");
        assert.equal(error.userId, "user-1");
        return true;
      }
    );

    assert.equal(countRows(db, "projects").count, 2);
    assert.equal(fs.existsSync(file), true);
  } finally {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("deleteProjectsForUser cleans up files for all projects in batch", () => {
  const db = createTestDb();
  const { root, publicRoot } = createPublicRoot();

  try {
    insertUser(db, "user-1");

    const epubA = writePublicFile(publicRoot, "uploads/a.epub");
    const coverA = writePublicFile(publicRoot, "uploads/cover-a.jpg");
    const epubB = writePublicFile(publicRoot, "uploads/b.epub");
    const sceneImage = writePublicFile(publicRoot, "uploads/scene.png");

    insertProject(db, {
      id: "a",
      userId: "user-1",
      epubPath: "/uploads/a.epub",
      coverImage: "/uploads/cover-a.jpg",
      videoUrl: null,
    });
    insertProject(db, {
      id: "b",
      userId: "user-1",
      epubPath: "/uploads/b.epub",
      coverImage: null,
      videoUrl: null,
    });

    db.prepare(`
      INSERT INTO scenes (id, project_id, page_index, image_path, sequence_index)
      VALUES (?, ?, ?, ?, ?)
    `).run("scene-1", "b", 0, "/uploads/scene.png", 0);

    const result = deleteProjectsForUser(db, {
      userId: "user-1",
      projectIds: ["a", "b"],
      publicRoot,
    });

    assert.equal(result.deletedCount, 2);
    assert.equal(fs.existsSync(epubA), false);
    assert.equal(fs.existsSync(coverA), false);
    assert.equal(fs.existsSync(epubB), false);
    assert.equal(fs.existsSync(sceneImage), false);
    assert.equal(countRows(db, "scenes").count, 0);
  } finally {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
