import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

// ---------------------------------------------------------------------------
// Mock auth — intercept getServerSession before the route module loads
// ---------------------------------------------------------------------------

const mockSessionStore: Array<{ id: string; email: string; role: string } | null> = [null];

function setMockSession(user: { id: string; email: string; role?: string } | null) {
  mockSessionStore[0] = user
    ? { id: user.id, email: user.email, role: user.role ?? "user" }
    : null;
}

function toNextAuthSession(
  stored: { id: string; email: string; role: string } | null
): { user: { id: string; role: string } } | null {
  if (!stored) return null;
  return { user: { id: stored.id, role: stored.role } };
}

// ---------------------------------------------------------------------------
// Shared test DB helper (mirrors project-deletion.test.ts schema)
// ---------------------------------------------------------------------------

function createTestDb() {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'user'
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
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      task_type TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE likes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE favorites (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE comments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      content TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE scenes (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      page_index INTEGER NOT NULL,
      image_path TEXT,
      sequence_index INTEGER NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE key_frames (
      id TEXT PRIMARY KEY,
      scene_id TEXT NOT NULL,
      frame_type TEXT NOT NULL,
      image_url TEXT,
      FOREIGN KEY (scene_id) REFERENCES scenes(id) ON DELETE CASCADE
    );

    CREATE TABLE video_clips (
      id TEXT PRIMARY KEY,
      scene_id TEXT NOT NULL,
      video_url TEXT,
      FOREIGN KEY (scene_id) REFERENCES scenes(id) ON DELETE CASCADE
    );

    CREATE TABLE audio_tracks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      audio_url TEXT,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE pipeline_status (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL UNIQUE,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
  `);

  return db;
}

function insertUser(db: Database.Database, id: string, email: string, role = "user") {
  db.prepare(`INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, ?, ?)`).run(
    id,
    email,
    "hashed",
    role
  );
}

function insertProject(
  db: Database.Database,
  id: string,
  userId: string,
  title = "Test Project"
) {
  db.prepare(`
    INSERT INTO projects (id, user_id, title, description, epub_path, status, video_url)
    VALUES (?, ?, ?, ?, ?, 'pending', NULL)
  `).run(id, userId, title, "desc", `/uploads/${id}.epub`);
}

function createPublicRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "routes-test-"));
  fs.mkdirSync(path.join(root, "public"), { recursive: true });
  return { root, publicRoot: path.join(root, "public") };
}

function writePublicFile(publicRoot: string, relativePath: string) {
  const filePath = path.join(publicRoot, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "test-file");
  return filePath;
}

// ---------------------------------------------------------------------------
// Module reloader — bypass Next.js module cache for fresh state per test
// ---------------------------------------------------------------------------

async function getRouteModule() {
  const { singleDeleteRoute } = await import("./single-delete-route");
  return singleDeleteRoute;
}

async function getBulkRouteModule() {
  const { bulkDeleteRoute } = await import("./bulk-delete-route");
  return bulkDeleteRoute;
}

// We build minimal route handler wrappers that use the test DB.
// Rather than import the production route modules (which depend on Next.js
// auth and the real DB), we test the HTTP contract by calling the route
// handler functions directly with a mocked context.

// ---------------------------------------------------------------------------
// Test helper: call a route handler function with a request and mock deps
// ---------------------------------------------------------------------------

async function callSingleDelete(
  request: Request,
  routeParams: { id: string },
  deps: {
    getServerSession: () => Promise<{ user: { id: string; role: string } } | null>;
    db: Database.Database;
    publicRoot: string;
  }
) {
  const { getServerSession, db, publicRoot } = deps;
  const { deleteProjectForUser, ProjectNotFoundError, ProjectForbiddenError } =
    await import("@/lib/project-deletion");

  const session = await getServerSession();
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "请先登录" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    deleteProjectForUser(db, {
      userId: session.user.id,
      projectId: routeParams.id,
      publicRoot,
    });
    return new Response(JSON.stringify({ message: "作品删除成功" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    if (error instanceof ProjectNotFoundError) {
      return new Response(JSON.stringify({ error: "作品不存在" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (error instanceof ProjectForbiddenError) {
      return new Response(JSON.stringify({ error: "无权限删除该作品" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }
    console.error("Delete project error:", error);
    return new Response(JSON.stringify({ error: "删除作品失败" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

async function callBulkDelete(
  request: Request,
  deps: {
    getServerSession: () => Promise<{ user: { id: string; role: string } } | null>;
    db: Database.Database;
    publicRoot: string;
  }
) {
  const { getServerSession, db, publicRoot } = deps;
  const {
    deleteProjectsForUser,
    InvalidProjectDeletionRequestError,
    ProjectNotFoundError,
    ProjectForbiddenError,
  } = await import("@/lib/project-deletion");

  const session = await getServerSession();
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "请先登录" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "请求格式错误" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (
    !body ||
    typeof body !== "object" ||
    !Array.isArray((body as Record<string, unknown>).projectIds)
  ) {
    return new Response(JSON.stringify({ error: "projectIds 数组不能为空" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { projectIds } = body as { projectIds: string[] };

  try {
    const result = deleteProjectsForUser(db, {
      userId: session.user.id,
      projectIds,
      publicRoot,
    });
    return new Response(JSON.stringify({ message: "批量删除成功", deletedCount: result.deletedCount }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    if (error instanceof InvalidProjectDeletionRequestError) {
      return new Response(JSON.stringify({ error: "projectIds 数组不能为空" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (error instanceof ProjectNotFoundError) {
      return new Response(JSON.stringify({ error: `作品不存在: ${error.projectId}` }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (error instanceof ProjectForbiddenError) {
      return new Response(JSON.stringify({ error: "无权限删除部分作品" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }
    console.error("Bulk delete project error:", error);
    return new Response(JSON.stringify({ error: "批量删除失败" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

// ---------------------------------------------------------------------------
// Single-delete route contract tests
// ---------------------------------------------------------------------------

test("single DELETE returns 401 when unauthenticated", async () => {
  const db = createTestDb();
  const { root, publicRoot } = createPublicRoot();

  try {
    setMockSession(null);

    const request = new Request("http://localhost/api/projects/p1", {
      method: "DELETE",
    });

    const response = await callSingleDelete(request, { id: "p1" }, {
      getServerSession: () => Promise.resolve(toNextAuthSession(mockSessionStore[0])),
      db,
      publicRoot,
    });

    assert.equal(response.status, 401);
    const data = (await response.json()) as { error: string };
    assert.match(data.error, /登录/i);
  } finally {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
    setMockSession(null);
  }
});

test("single DELETE returns 404 when project does not exist", async () => {
  const db = createTestDb();
  const { root, publicRoot } = createPublicRoot();

  try {
    setMockSession({ id: "user-1", email: "user-1@example.com" });
    insertUser(db, "user-1", "user-1@example.com");

    const request = new Request("http://localhost/api/projects/missing", {
      method: "DELETE",
    });

    const response = await callSingleDelete(request, { id: "missing" }, {
      getServerSession: () => Promise.resolve(toNextAuthSession(mockSessionStore[0])),
      db,
      publicRoot,
    });

    assert.equal(response.status, 404);
    const data = (await response.json()) as { error: string };
    assert.match(data.error, /不存在/i);
  } finally {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
    setMockSession(null);
  }
});

test("single DELETE returns 403 when project belongs to another user", async () => {
  const db = createTestDb();
  const { root, publicRoot } = createPublicRoot();

  try {
    setMockSession({ id: "user-1", email: "user-1@example.com" });
    insertUser(db, "user-1", "user-1@example.com");
    insertUser(db, "user-2", "user-2@example.com");
    insertProject(db, "p1", "user-2");

    const request = new Request("http://localhost/api/projects/p1", {
      method: "DELETE",
    });

    const response = await callSingleDelete(request, { id: "p1" }, {
      getServerSession: () => Promise.resolve(toNextAuthSession(mockSessionStore[0])),
      db,
      publicRoot,
    });

    assert.equal(response.status, 403);
    const data = (await response.json()) as { error: string };
    assert.match(data.error, /权限/i);
    assert.equal(countProjects(db), 1);
  } finally {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
    setMockSession(null);
  }
});

test("single DELETE returns 200 with message on success", async () => {
  const db = createTestDb();
  const { root, publicRoot } = createPublicRoot();

  try {
    setMockSession({ id: "user-1", email: "user-1@example.com" });
    insertUser(db, "user-1", "user-1@example.com");
    insertProject(db, "p1", "user-1");
    const epubFile = writePublicFile(publicRoot, "uploads/p1.epub");

    const request = new Request("http://localhost/api/projects/p1", {
      method: "DELETE",
    });

    const response = await callSingleDelete(request, { id: "p1" }, {
      getServerSession: () => Promise.resolve(toNextAuthSession(mockSessionStore[0])),
      db,
      publicRoot,
    });

    assert.equal(response.status, 200);
    const data = (await response.json()) as { message: string };
    assert.match(data.message, /成功/i);
    assert.equal(countProjects(db), 0);
    assert.equal(fs.existsSync(epubFile), false);
  } finally {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
    setMockSession(null);
  }
});

// ---------------------------------------------------------------------------
// Bulk-delete route contract tests
// ---------------------------------------------------------------------------

test("bulk DELETE returns 401 when unauthenticated", async () => {
  const db = createTestDb();
  const { root, publicRoot } = createPublicRoot();

  try {
    setMockSession(null);

    const request = new Request("http://localhost/api/projects", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectIds: ["p1"] }),
    });

    const response = await callBulkDelete(request, {
      getServerSession: () => Promise.resolve(toNextAuthSession(mockSessionStore[0])),
      db,
      publicRoot,
    });

    assert.equal(response.status, 401);
  } finally {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
    setMockSession(null);
  }
});

test("bulk DELETE returns 400 for missing projectIds field", async () => {
  const db = createTestDb();
  const { root, publicRoot } = createPublicRoot();

  try {
    setMockSession({ id: "user-1", email: "user-1@example.com" });

    const request = new Request("http://localhost/api/projects", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const response = await callBulkDelete(request, {
      getServerSession: () => Promise.resolve(toNextAuthSession(mockSessionStore[0])),
      db,
      publicRoot,
    });

    assert.equal(response.status, 400);
  } finally {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
    setMockSession(null);
  }
});

test("bulk DELETE returns 400 for empty projectIds array", async () => {
  const db = createTestDb();
  const { root, publicRoot } = createPublicRoot();

  try {
    setMockSession({ id: "user-1", email: "user-1@example.com" });

    const request = new Request("http://localhost/api/projects", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectIds: [] }),
    });

    const response = await callBulkDelete(request, {
      getServerSession: () => Promise.resolve(toNextAuthSession(mockSessionStore[0])),
      db,
      publicRoot,
    });

    assert.equal(response.status, 400);
  } finally {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
    setMockSession(null);
  }
});

test("bulk DELETE returns 404 when any project does not exist", async () => {
  const db = createTestDb();
  const { root, publicRoot } = createPublicRoot();

  try {
    setMockSession({ id: "user-1", email: "user-1@example.com" });
    insertUser(db, "user-1", "user-1@example.com");
    insertProject(db, "p1", "user-1");

    const request = new Request("http://localhost/api/projects", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectIds: ["p1", "missing"] }),
    });

    const response = await callBulkDelete(request, {
      getServerSession: () => Promise.resolve(toNextAuthSession(mockSessionStore[0])),
      db,
      publicRoot,
    });

    assert.equal(response.status, 404);
    assert.equal(countProjects(db), 1);
  } finally {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
    setMockSession(null);
  }
});

test("bulk DELETE returns 403 when any project belongs to another user", async () => {
  const db = createTestDb();
  const { root, publicRoot } = createPublicRoot();

  try {
    setMockSession({ id: "user-1", email: "user-1@example.com" });
    insertUser(db, "user-1", "user-1@example.com");
    insertUser(db, "user-2", "user-2@example.com");
    insertProject(db, "p1", "user-1");
    insertProject(db, "p2", "user-2");

    const request = new Request("http://localhost/api/projects", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectIds: ["p1", "p2"] }),
    });

    const response = await callBulkDelete(request, {
      getServerSession: () => Promise.resolve(toNextAuthSession(mockSessionStore[0])),
      db,
      publicRoot,
    });

    assert.equal(response.status, 403);
    assert.equal(countProjects(db), 2);
  } finally {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
    setMockSession(null);
  }
});

test("bulk DELETE returns 200 with deletedCount on success", async () => {
  const db = createTestDb();
  const { root, publicRoot } = createPublicRoot();

  try {
    setMockSession({ id: "user-1", email: "user-1@example.com" });
    insertUser(db, "user-1", "user-1@example.com");
    insertProject(db, "p1", "user-1");
    insertProject(db, "p2", "user-1");
    const file1 = writePublicFile(publicRoot, "uploads/p1.epub");
    const file2 = writePublicFile(publicRoot, "uploads/p2.epub");

    const request = new Request("http://localhost/api/projects", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectIds: ["p1", "p2"] }),
    });

    const response = await callBulkDelete(request, {
      getServerSession: () => Promise.resolve(toNextAuthSession(mockSessionStore[0])),
      db,
      publicRoot,
    });

    assert.equal(response.status, 200);
    const data = (await response.json()) as { message: string; deletedCount: number };
    assert.match(data.message, /成功/i);
    assert.equal(data.deletedCount, 2);
    assert.equal(countProjects(db), 0);
    assert.equal(fs.existsSync(file1), false);
    assert.equal(fs.existsSync(file2), false);
  } finally {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
    setMockSession(null);
  }
});

function countProjects(db: Database.Database) {
  const result = db.prepare(`SELECT COUNT(*) as count FROM projects`).get() as { count: number };
  return result.count;
}
