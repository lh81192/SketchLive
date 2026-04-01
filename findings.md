# Findings

## EPUB backend already available
- `src/app/api/projects/[id]/epub/upload/route.ts` 已支持上传、解析、落库 `epub_imports` / `epub_pages`
- `src/app/api/projects/[id]/epub/route.ts` 已返回当前 import 和 pages
- `src/app/api/projects/[id]/epub/pages/route.ts` 已支持批量更新 `isSelected` / `sortOrder`
- `src/app/api/projects/[id]/epub/import-storyboard/route.ts` 已把选中页面导入为 `storyboard_versions` + `shots`

## Important behavior constraints
- EPUB storyboard import 创建的是 **project-level** shots (`episodeId = null`)
- 现有 top-level `/project/[id]/storyboard` 与 `/preview` 仍是 redirect，必须改成可用入口，否则 EPUB 导入后无法进入下游流程
- 现有 episode storyboard / preview 里有若干 `fetchProject(..., undefined, versionId)` 调用，会在 version 切换时丢失 episode scope；需要统一改为使用 store 里的 `currentEpisodeId`

## UI implementation notes
- import page 已有完整 script import 流程，最安全的方式是保留为 `script` 分支并新增 `epub` 分支
- EPUB 页面缩略图可直接用 `uploadUrl(page.thumbPath ?? page.imagePath)` 渲染
- 手动角色录入只需要在最终 `import-storyboard` 请求里提交；无需单独保存 API

## Lint cleanup findings
- `episodes/[episodeId]/preview/page.tsx` 当前被误插入了大量冗余 `useEffect` / `setTimeout` / `Promise.resolve()` 状态同步逻辑，应直接删回最小状态模型，而不是继续修补这些 effect。
- `episodes/[episodeId]/storyboard/page.tsx` 的 `viewMode` 和 `versions` 都是从 store/project 派生出来的；`setViewMode(stored)` 与 `setVersions(project.versions)` 属于典型 effect-driven derived state。
- `characters/page.tsx` 的 `fetchData()` 在 `useEffect` 中直接触发多个 state 更新，会命中 `react-hooks/set-state-in-effect`；更稳妥的是把初次加载放进 lazy state + 显式 reload。
- `import/page.tsx` 仍有原生 `<img>`，应改成 `next/image`。

## Smoke test blocker
- 本地 `next dev` 曾在 instrumentation bootstrap 阶段失败，原因不是 EPUB 路由本身，而是 `src/lib/db/index.ts:45` 使用 Drizzle migrator 执行某个包含多条 SQL 的 SQLite migration 文件时触发 `RangeError: The supplied SQL string contains more than one statement`。
- 根因确认是 `drizzle/0014_add_epub_imports.sql` 缺少 `--> statement-breakpoint`，导致 SQLite 驱动一次执行多条语句失败。
- 已通过给 `0014_add_epub_imports.sql` 各语句之间补 `--> statement-breakpoint` 修复。

## Smoke test fixture
- 之前已在 `/tmp/SketchLive-smoke/smoke.epub` 生成一个最小 2 页 EPUB 用于上传链路验证；现已清理。

## Smoke test verified behaviors
- `POST /api/projects` 可创建 `inputSource = epub` 项目。
- `POST /api/projects/[id]/epub/upload` 可成功解析最小 EPUB，并写入 `epub_imports`、`epub_pages` 与落盘图片路径。
- `PATCH /api/projects/[id]/epub/pages` 可更新 `sortOrder`，后续 storyboard 导入按新顺序创建 shots。
- `POST /api/projects/[id]/epub/import-storyboard` 会把项目切到 `generationMode = reference`，创建 project-level version 与 shots。
- 导入后的 `shots` 满足下游需求：`episodeId = null`、`sceneRefFrame` 存在、`sourceType = epub_page`、`sourcePageId` 存在。
- project-level `/storyboard` 与 `/preview` 路由至少可成功返回 200 页面响应。
