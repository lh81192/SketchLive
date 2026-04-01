# Progress Log

## Session — 2026-03-27

### Completed before this step
- 完成 EPUB backend MVP API：upload / get / pages patch / import-storyboard
- 完成 project entry flow：创建项目时可选择 `inputSource = epub`
- 已把 `epubImport` / `epubPages` 暴露到 project API 和 store

### Current phase
- P1: EPUB import UI branch

### Next actions
1. 验证 EPUB 导入后进入 project-level storyboard / preview 的实际交互
2. 如需要，继续做端到端 smoke test（upload / import-storyboard / preview）

### Completed in this step
- 重写 `src/app/[locale]/project/[id]/episodes/[episodeId]/preview/page.tsx`，删掉误插入的大量冗余 effect，恢复为最小状态模型
- 重构 `src/app/[locale]/project/[id]/episodes/[episodeId]/storyboard/page.tsx`，移除 effect-driven derived state
- 修复 `src/app/[locale]/project/[id]/characters/page.tsx` 的 hooks lint 与 unused import
- 把 `src/app/[locale]/project/[id]/import/page.tsx` 的 EPUB 缩略图改为 `next/image`
- 通过 targeted ESLint：preview / storyboard / characters / import

### Validation
- `npx eslint "src/app/[locale]/project/[id]/episodes/[episodeId]/preview/page.tsx" "src/app/[locale]/project/[id]/episodes/[episodeId]/storyboard/page.tsx" "src/app/[locale]/project/[id]/characters/page.tsx" "src/app/[locale]/project/[id]/import/page.tsx"`
- 结果：通过

### Smoke test attempt
- 首次启动 `PORT=3100 npm run dev` 时，阻塞于 instrumentation bootstrap 的 DB migration：SQLite 报错 `The supplied SQL string contains more than one statement`
- 已修复 `drizzle/0014_add_epub_imports.sql`，为每条 SQL 语句补上 `--> statement-breakpoint`
- 已生成最小测试样本：`/tmp/SketchLive-smoke/smoke.epub`
- 重新启动 dev server 后，已完成 create project -> upload epub -> reorder pages -> import storyboard -> verify project-level routes

### Smoke test results
- 创建项目成功：`inputSource = epub`
- 上传 EPUB 成功：解析出 2 页，写入 `epub_imports` / `epub_pages`
- 页面排序 PATCH 成功：`sortOrder` 正常生效
- storyboard 导入成功：返回 `versionId = 01KMPZ29QPX12HSJAVJMTBBGQX`，`shotCount = 2`
- 项目详情验证通过：
  - `generationMode = reference`
  - `episodes = []`
  - `versions` 存在
  - `shots` 为 project-level (`episodeId = null`)
  - 每个 shot 带 `sceneRefFrame`、`sourceType = epub_page`、`sourcePageId`
- 页面路由状态验证通过：
  - `/en/project/01KMPZ1H4F2HXXR3JRZXEWMVC4/storyboard` -> 200
  - `/en/project/01KMPZ1H4F2HXXR3JRZXEWMVC4/preview` -> 200

### Validation artifacts
- smoke project id: `01KMPZ1H4F2HXXR3JRZXEWMVC4`
- smoke import id: `01KMPZ1VGBJS3EW2DTRV439DGR`
- smoke version id: `01KMPZ29QPX12HSJAVJMTBBGQX`
- fixture: `/tmp/SketchLive-smoke/smoke.epub`
- dev server task: `b759utq02`

### Next actions
1. 如需，可继续做浏览器层面的手动 UI 点击验证
2. 如需，可继续做更细的 project-level preview / generation 交互回归

### Cleanup
- 已删除 smoke project：`01KMPZ1H4F2HXXR3JRZXEWMVC4`
- 已删除上传目录：`/Users/haiyun/SketchLive/uploads/epub/01KMPZ1VGBJS3EW2DTRV439DGR`
- 已删除临时样本：`/tmp/SketchLive-smoke`
- 已验证 `smoke-user` 项目列表为空
- 已验证本地产物路径不存在

### Validation
- `npx eslint "src/app/[locale]/project/[id]/episodes/[episodeId]/preview/page.tsx" "src/app/[locale]/project/[id]/episodes/[episodeId]/storyboard/page.tsx" "src/app/[locale]/project/[id]/characters/page.tsx" "src/app/[locale]/project/[id]/import/page.tsx"`
- 结果：通过
- API smoke test：通过
- project-level route smoke test：通过
