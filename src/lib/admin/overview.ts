import { count, desc, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { episodes, epubImports, importLogs, projects, shots, tasks, users } from "@/lib/db/schema";
import { getStorageOverview } from "@/lib/admin/storage";

export interface AdminOverviewMetric {
  key: string;
  label: string;
  value: string;
  detail: string;
}

export interface AdminOverviewStatusItem {
  label: string;
  value: string;
}

export interface AdminOverviewActivityItem {
  id: string;
  title: string;
  description: string;
  time: number;
}

export interface AdminOverviewListItem {
  id: string;
  title: string;
  subtitle: string;
  meta: string;
  detail?: string;
  secondaryMeta?: string;
  href?: string;
}

export interface AdminOverviewData {
  metrics: AdminOverviewMetric[];
  taskStatus: AdminOverviewStatusItem[];
  importStatus: AdminOverviewStatusItem[];
  modelAccess: AdminOverviewStatusItem[];
  storage: Awaited<ReturnType<typeof getStorageOverview>>;
  recentActivity: AdminOverviewActivityItem[];
  usersList: AdminOverviewListItem[];
  projectsList: AdminOverviewListItem[];
  failedTasksList: AdminOverviewListItem[];
}

function statusLabel(enabled: boolean): string {
  return enabled ? "enabled" : "not configured";
}

function toTimestamp(value: Date | number | string | null): number {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  return new Date(value).getTime();
}

function formatDateTime(value: Date | number | string | null): string {
  const timestamp = toTimestamp(value);
  if (!timestamp) return "-";
  return new Date(timestamp).toLocaleString();
}

export async function getAdminOverview(): Promise<AdminOverviewData> {
  const since = new Date(Date.now() - 1000 * 60 * 60 * 24);

  const [
    [userCount],
    [projectCount],
    [episodeCount],
    [shotCount],
    [epubImportCount],
    [projectsLastDay],
    taskCounts,
    importCounts,
    recentProjects,
    recentTasks,
    recentUsers,
    failedTasks,
    storage,
  ] = await Promise.all([
    db.select({ value: count() }).from(users),
    db.select({ value: count() }).from(projects),
    db.select({ value: count() }).from(episodes),
    db.select({ value: count() }).from(shots),
    db.select({ value: count() }).from(epubImports),
    db
      .select({ value: count() })
      .from(projects)
      .where(gte(projects.createdAt, since)),
    db
      .select({ status: tasks.status, value: count() })
      .from(tasks)
      .groupBy(tasks.status),
    db
      .select({ status: importLogs.status, value: count() })
      .from(importLogs)
      .groupBy(importLogs.status),
    db
      .select({
        id: projects.id,
        title: projects.title,
        status: projects.status,
        userId: projects.userId,
        createdAt: projects.createdAt,
      })
      .from(projects)
      .orderBy(desc(projects.createdAt))
      .limit(8),
    db
      .select({ id: tasks.id, type: tasks.type, status: tasks.status, createdAt: tasks.createdAt })
      .from(tasks)
      .orderBy(desc(tasks.createdAt))
      .limit(5),
    db
      .select({ id: users.id, email: users.email, createdAt: users.createdAt })
      .from(users)
      .orderBy(desc(users.createdAt))
      .limit(8),
    db
      .select({
        id: tasks.id,
        type: tasks.type,
        error: tasks.error,
        projectId: tasks.projectId,
        createdAt: tasks.createdAt,
      })
      .from(tasks)
      .where(eq(tasks.status, "failed"))
      .orderBy(desc(tasks.createdAt))
      .limit(8),
    getStorageOverview(),
  ]);

  const recentProjectUserIds = [...new Set(recentProjects.map((project) => project.userId).filter(Boolean))];
  const failedTaskProjectIds = [...new Set(failedTasks.map((task) => task.projectId).filter(Boolean))];

  const [projectUsers, failedTaskProjects] = await Promise.all([
    recentProjectUserIds.length > 0
      ? db
          .select({ id: users.id, email: users.email })
          .from(users)
          .where(inArray(users.id, recentProjectUserIds))
      : Promise.resolve([]),
    failedTaskProjectIds.length > 0
      ? db
          .select({ id: projects.id, title: projects.title })
          .from(projects)
          .where(inArray(projects.id, failedTaskProjectIds))
      : Promise.resolve([]),
  ]);

  const userEmailById = new Map(projectUsers.map((user) => [user.id, user.email]));
  const projectTitleById = new Map(failedTaskProjects.map((project) => [project.id, project.title]));

  return {
    metrics: [
      {
        key: "users",
        label: "Registered users",
        value: String(userCount?.value ?? 0),
        detail: "Email/password accounts",
      },
      {
        key: "projects",
        label: "Projects",
        value: String(projectCount?.value ?? 0),
        detail: `${projectsLastDay?.value ?? 0} created in the last 24h`,
      },
      {
        key: "episodes",
        label: "Episodes",
        value: String(episodeCount?.value ?? 0),
        detail: "Across all user workspaces",
      },
      {
        key: "shots",
        label: "Shots",
        value: String(shotCount?.value ?? 0),
        detail: "Storyboard units tracked in the system",
      },
    ],
    taskStatus: ["pending", "running", "completed", "failed"].map((status) => ({
      label: status,
      value: String(taskCounts.find((item) => item.status === status)?.value ?? 0),
    })),
    importStatus: ["running", "done", "error"].map((status) => ({
      label: status,
      value: String(importCounts.find((item) => item.status === status)?.value ?? 0),
    })),
    modelAccess: [
      {
        label: "OpenAI",
        value: statusLabel(Boolean(process.env.OPENAI_API_KEY?.trim())),
      },
      {
        label: "Gemini / Veo",
        value: statusLabel(Boolean(process.env.GEMINI_API_KEY?.trim())),
      },
      {
        label: "Seedance",
        value: statusLabel(Boolean(process.env.SEEDANCE_API_KEY?.trim())),
      },
      {
        label: "Kling",
        value: statusLabel(
          Boolean(
            process.env.KLING_ACCESS_KEY?.trim() && process.env.KLING_SECRET_KEY?.trim()
          )
        ),
      },
      {
        label: "EPUB imports",
        value: String(epubImportCount?.value ?? 0),
      },
    ],
    storage,
    recentActivity: [
      ...recentProjects.map((project) => ({
        id: `project-${project.id}`,
        title: project.title,
        description: "Project created",
        time: toTimestamp(project.createdAt),
      })),
      ...recentTasks.map((task) => ({
        id: `task-${task.id}`,
        title: task.type,
        description: `Task ${task.status}`,
        time: toTimestamp(task.createdAt),
      })),
    ]
      .sort((a, b) => b.time - a.time)
      .slice(0, 8),
    usersList: recentUsers.map((user) => ({
      id: user.id,
      title: user.email,
      subtitle: `ID: ${user.id}`,
      meta: formatDateTime(user.createdAt),
    })),
    projectsList: recentProjects.map((project) => ({
      id: project.id,
      title: project.title,
      subtitle: userEmailById.get(project.userId) || project.userId || "Unknown owner",
      meta: `${project.status} · ${formatDateTime(project.createdAt)}`,
    })),
    failedTasksList: failedTasks.map((task) => ({
      id: task.id,
      title: task.type,
      subtitle: projectTitleById.get(task.projectId || "") || "Unknown project",
      detail: task.error || "No error message",
      meta: `taskId: ${task.id}`,
      secondaryMeta: `projectId: ${task.projectId || "-"} · ${formatDateTime(task.createdAt)}`,
      href: task.projectId ? `/project/${task.projectId}` : undefined,
    })),
  };
}
