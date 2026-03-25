"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { DashboardProject } from "@/lib/dashboard-projects";

const statusConfig = {
  pending: { label: "等待中", color: "bg-gray-100 text-gray-600", icon: "⏳" },
  processing: { label: "生成中", color: "bg-blue-100 text-blue-600", icon: "⚡" },
  completed: { label: "已完成", color: "bg-green-100 text-green-600", icon: "✨" },
  failed: { label: "失败", color: "bg-red-100 text-red-600", icon: "❌" },
};

function formatProjectDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("zh-CN");
}

interface ProjectListManagerProps {
  projects: DashboardProject[];
}

export function ProjectListManager({ projects }: ProjectListManagerProps) {
  const router = useRouter();
  const [isManaging, setIsManaging] = useState(false);
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(new Set());
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function enterManageMode() {
    setIsManaging(true);
    setSelectedProjectIds(new Set());
    setErrorMessage(null);
  }

  function exitManageMode() {
    setIsManaging(false);
    setSelectedProjectIds(new Set());
    setErrorMessage(null);
  }

  function toggleProject(projectId: string) {
    setSelectedProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  }

  function selectAll() {
    setSelectedProjectIds(new Set(projects.map((p) => p.id)));
  }

  function clearSelection() {
    setSelectedProjectIds(new Set());
  }

  async function handleSingleDelete(projectId: string) {
    const confirmed = window.confirm("确定删除这个作品吗？删除后不可恢复。");
    if (!confirmed) return;

    setDeletingProjectId(projectId);
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setErrorMessage(data.error ?? "删除失败，请稍后重试。");
        return;
      }
      router.refresh();
    } catch {
      setErrorMessage("网络错误，请检查网络连接后重试。");
    } finally {
      setDeletingProjectId(null);
    }
  }

  async function handleBulkDelete() {
    const ids = Array.from(selectedProjectIds);
    const confirmed = window.confirm(
      `确定删除已选中的 ${ids.length} 个作品吗？删除后不可恢复。`
    );
    if (!confirmed) return;

    setIsBulkDeleting(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/projects", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectIds: ids }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setErrorMessage(data.error ?? "批量删除失败，请稍后重试。");
        return;
      }

      setSelectedProjectIds(new Set());
      router.refresh();
    } catch {
      setErrorMessage("网络错误，请检查网络连接后重试。");
    } finally {
      setIsBulkDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      {!isManaging ? (
        /* Browse-mode toolbar */
        <div className="flex items-center justify-end">
          <Button variant="outline" onClick={enterManageMode}>
            <svg
              className="w-4 h-4 mr-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
              />
            </svg>
            管理作品
          </Button>
        </div>
      ) : (
        /* Manage-mode toolbar */
        <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
          <span className="text-sm font-medium">
            已选 <strong>{selectedProjectIds.size}</strong> 项
          </span>
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="sm"
            onClick={selectAll}
            disabled={selectedProjectIds.size === projects.length}
          >
            全选
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={clearSelection}
            disabled={selectedProjectIds.size === 0}
          >
            取消全选
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleBulkDelete}
            disabled={selectedProjectIds.size === 0 || isBulkDeleting}
          >
            {isBulkDeleting ? (
              "删除中..."
            ) : (
              <>
                <svg
                  className="w-4 h-4 mr-1"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
                删除所选
              </>
            )}
          </Button>
          <Button variant="ghost" size="sm" onClick={exitManageMode}>
            退出管理
          </Button>
        </div>
      )}

      {/* Error message */}
      {errorMessage && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      {/* Project grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {projects.map((project) => {
          const status =
            statusConfig[project.status as keyof typeof statusConfig] ??
            statusConfig.pending;
          const isSelected = selectedProjectIds.has(project.id);
          const isDeleting = deletingProjectId === project.id;

          return (
            <div
              key={project.id}
              className="relative"
              onClick={
                isManaging
                  ? (e) => {
                      e.preventDefault();
                      toggleProject(project.id);
                    }
                  : undefined
              }
            >
              {/* Card content */}
              <Card
                className={`card-soft hover:shadow-card-hover transition-shadow overflow-hidden ${
                  isManaging ? "cursor-pointer" : ""
                } ${isSelected ? "ring-2 ring-primary" : ""}`}
              >
                {/* Cover area */}
                <div className="h-40 bg-gradient-to-br from-primary-50 to-secondary-50 relative overflow-hidden">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-6xl opacity-30">📖</span>
                  </div>
                  <div
                    className={`absolute top-3 right-3 px-3 py-1 rounded-full text-xs font-medium ${status.color}`}
                  >
                    <span className="mr-1">{status.icon}</span>
                    {status.label}
                  </div>
                  {/* Manage-mode checkbox overlay */}
                  {isManaging && (
                    <div className="absolute top-3 left-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleProject(project.id)}
                        className="w-5 h-5 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                  )}
                </div>

                <CardContent className="p-5">
                  <h3 className="text-lg font-heading font-bold text-foreground mb-2">
                    {project.title}
                  </h3>
                  <p className="text-muted-foreground text-sm line-clamp-2">
                    {project.description || "暂无描述"}
                  </p>

                  <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                      {formatProjectDate(project.created_at)}
                    </span>

                    {/* Browse-mode actions */}
                    {!isManaging && (
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/dashboard/projects/${project.id}`}
                          className="flex items-center gap-1 text-primary font-medium hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          查看详情
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 5l7 7-7 7"
                            />
                          </svg>
                        </Link>
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleSingleDelete(project.id);
                          }}
                          disabled={isDeleting}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title="删除作品"
                        >
                          {isDeleting ? (
                            <svg
                              className="w-4 h-4 animate-spin"
                              fill="none"
                              viewBox="0 0 24 24"
                            >
                              <circle
                                className="opacity-25"
                                cx="12"
                                cy="12"
                                r="10"
                                stroke="currentColor"
                                strokeWidth="4"
                              />
                              <path
                                className="opacity-75"
                                fill="currentColor"
                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                              />
                            </svg>
                          ) : (
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                              />
                            </svg>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          );
        })}
      </div>
    </div>
  );
}
