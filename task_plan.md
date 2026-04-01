# EPUB MVP Task Plan

## Goal
完成 EPUB 导入 MVP 前端与下游入口：在 `/project/[id]/import` 按 `inputSource` 分流，打通 EPUB 上传、页面选择/排序、手动角色录入、导入 storyboard，并让 project-level storyboard / preview 可用于 EPUB 项目。

## Active Files
- `src/app/[locale]/project/[id]/import/page.tsx`
- `src/app/[locale]/project/[id]/storyboard/page.tsx`
- `src/app/[locale]/project/[id]/preview/page.tsx`
- `src/app/[locale]/project/[id]/episodes/[episodeId]/storyboard/page.tsx`
- `src/app/[locale]/project/[id]/episodes/[episodeId]/preview/page.tsx`
- `messages/zh.json`
- `messages/en.json`
- `messages/ja.json`
- `messages/ko.json`

## Phases

### P1: EPUB import UI branch [in_progress]
- 在 import 页基于 `project.inputSource` 分流
- 保留原脚本文本导入流程
- 新增 EPUB 上传、页面网格、选择/排序、手动角色表单、导入 storyboard 按钮

### P2: Project-level storyboard / preview entry [pending]
- 让 `/project/[id]/storyboard` 与 `/project/[id]/preview` 可直接用于 project-level shots
- 复用现有 episode storyboard / preview 组件

### P3: Downstream compatibility fixes [pending]
- 修正 version 切换与 preview / assemble 在 `currentEpisodeId` 为空时的行为
- 确保 project-level EPUB shots 不会错误跳回 episode-only 路径

### P4: Validation [complete]
- 运行 lint 或至少进行 TypeScript/route-level smoke verification
- 检查新增文案和导入跳转链路
- 修复 EPUB 相关页面与共享页面上的 hooks / image lint
- 已完成 targeted ESLint 验证

## Decisions
- 不新建 EPUB UI 组件文件，先在现有 import page 内完成分流，减少改动面。
- project-level storyboard / preview 直接复用现有 episode 页面逻辑，避免重复实现生成面板。
- 通过 `currentEpisodeId ?? undefined` 统一 project-level / episode-level fetch 行为。

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| 旧的 `task_plan.md` / `progress.md` 是上一个 unrelated UI 任务 | 1 | 用当前 EPUB 任务内容覆盖，避免 planning hook 持续注入过期上下文 |
| Agent worktree 无法创建（此前会话） | 1 | 本轮继续直接用 Read/Edit/Write 完成实现 |
| `next dev` 启动时 DB migration 报 `The supplied SQL string contains more than one statement` | 1 | 待修复 `src/lib/db/index.ts` 的 SQLite migration 执行方式后继续 smoke test |
