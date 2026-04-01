# SketchLive (绘活)

> v0.3.0

绘活 — 从剧本到动画视频的全自动流水线。

## 功能特性

### 核心功能
- **EPUB 导入** — 支持上传 EPUB 文件，AI 自动解析章节、提取角色、选择页面生成故事板
- **剧本导入** — 支持上传 TXT/DOCX/PDF 文件，AI 自动解析文本、提取角色、智能分集
- **分集管理** — 项目级分集列表，角色按集关联，支持手动创建或导入自动分集
- **角色管理** — 项目级角色管理，主角/配角分区展示，支持跨集复用和按集独立解析
- **智能分镜** — AI 将剧本拆解为专业镜头列表（含构图、灯光、运镜指令）
- **双模式生成** — 支持首尾帧模式和场景参考帧模式，适配不同创作需求
- **首尾帧生成** — 为每个镜头生成起始帧和结束帧关键画面
- **场景参考帧** — 基于角色和场景描述生成参考帧，确保画面一致性
- **视频提示词** — AI 基于分镜描述和参考帧自动生成视频提示词，支持直接编辑
- **视频生成** — 基于首尾帧插值或场景参考生成动画视频片段
- **视频合成** — 将所有片段拼接为完整动画，支持字幕烧录
- **分镜版本** — 创建多个版本进行对比迭代

### 协作与编辑
- **分镜工作流** — 分镜编辑抽屉、角色内联面板、看板视图三种协作视图
- **单张精细编辑** — 通过抽屉式面板对单个镜头进行精细调整
- **看板视图** — 按生成进度自动分类（待生成帧/待生成提示词/待生成视频/已完成）
- **批量操作** — 支持批量生成帧、提示词、视频，可选择覆盖或跳过已有内容
- **帧图管理** — 生成帧支持手动上传替换及一键清除
- **自动流水线** — 一键运行完整生成流程：分镜→帧→提示词→视频→合成

### 平台与支持
- **多语言** — 中文 / English / 日本語 / 한국어
- **深色模式** — 支持浅色/深色/跟随系统三种主题
- **风格自适应** — 自动识别剧本风格（动漫/写实等），画面生成匹配对应风格
- **视频比例** — 支持 16:9 / 9:16 / 1:1，首尾帧与视频生成统一比例
- **多模型支持** — 支持 OpenAI、Gemini、Kling、Seedance、Veo 等多家 AI 供应商
- **资源下载** — 支持最终视频下载及全部素材打包下载

### 用户系统
- **用户认证** — 注册、登录、会话管理
- **项目管理** — 创建、编辑、删除项目
- **管理员后台** — 用户概览、模型配置管理

## 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Next.js 16 (App Router + Turbopack) |
| 前端 | React 19, Tailwind CSS 4, Zustand, Base UI, shadcn/ui |
| 国际化 | next-intl |
| 数据库 | SQLite + Drizzle ORM |
| AI 文本 | OpenAI / Gemini (via AI SDK) |
| AI 图像 | OpenAI DALL-E / Gemini Imagen / Kling |
| AI 视频 | Seedance / Kling / Veo |
| 视频处理 | FFmpeg (fluent-ffmpeg) |
| 包管理 | pnpm |

## 快速开始

### 环境要求

- Node.js 18+
- pnpm
- FFmpeg（视频合成功能需要）

### 安装

```bash
pnpm install
```

### 环境变量

复制 `.env.example` 为 `.env.local` 并配置必要的环境变量：

```bash
cp .env.example .env.local
```

### 初始化数据库

```bash
pnpm drizzle-kit push
```

### 启动

```bash
pnpm dev
```

访问 [http://localhost:3000](http://localhost:3000)

## 生成流水线

```
剧本输入 → 剧本解析 → 角色提取 → 智能分镜
                                      ↓
                    首尾帧生成 / 场景参考帧生成（逐镜头）
                                      ↓
                              视频提示词生成（逐镜头）
                                      ↓
                              视频生成（逐镜头）
                                      ↓
                                 视频合成 + 字幕
```

每个阶段支持单独触发或批量生成，支持覆盖已有内容或跳过已完成项。分镜页提供列表视图和看板视图，看板按生成进度自动分列。

## 项目结构

```
src/
├── app/
│   ├── [locale]/                # i18n 路由
│   │   ├── (app)/              # 应用布局
│   │   │   └── app/            # 仪表盘（项目列表）
│   │   ├── login/              # 登录页
│   │   ├── register/           # 注册页
│   │   ├── admin/             # 管理后台
│   │   │   └── login/         # 管理员登录
│   │   ├── project/[id]/      # 项目编辑器
│   │   │   ├── import/       # 导入（剧本/EPUB）
│   │   │   ├── episodes/     # 分集管理
│   │   │   │   ├── [episodeId]/storyboard/  # 分镜面板
│   │   │   │   └── [episodeId]/preview/      # 预览 & 合成
│   │   │   ├── characters/   # 角色管理
│   │   │   └── preview/      # 旧版预览（兼容）
│   │   └── settings/          # 设置
│   └── api/                   # API 路由
│       ├── auth/             # 用户认证
│       ├── admin/            # 管理后台 API
│       └── projects/         # 项目 API
├── components/
│   ├── ui/                   # 基础 UI 组件
│   ├── editor/               # 编辑器组件（分镜卡片、看板、抽屉等）
│   └── settings/             # 设置组件
├── lib/
│   ├── ai/                   # AI 供应商 & Prompt
│   │   └── providers/        # OpenAI, Gemini, Kling, Veo 等
│   ├── auth/                 # 用户认证
│   ├── admin/                # 管理员认证
│   ├── epub/                 # EPUB 解析
│   ├── db/                   # 数据库 Schema
│   ├── pipeline/             # 生成流水线
│   └── video/                # FFmpeg 处理
├── stores/                   # Zustand 状态管理
│   ├── project-store.ts     # 项目状态
│   ├── episode-store.ts     # 分集状态
│   └── model-store.ts        # 模型配置
└── hooks/                    # 自定义 Hooks
```

## 数据模型

```
Project
├── title: string
├── status: 'draft' | 'processing' | 'completed'
├── inputSource: 'script' | 'epub'
├── generationMode: 'keyframe' | 'reference'
├── characters: Character[]
├── episodes: Episode[]
└── shots: Shot[]

Episode
├── title: string
├── description: string
├── keywords: string
├── idea: string
├── characters: Character[]
└── shots: Shot[]

Character
├── name: string
├── description: string
├── visualHint: string
├── scope: 'main' | 'guest'
├── referenceImage: string?
└── episodeId: string?

Shot
├── sequence: number
├── prompt: string
├── startFrameDesc: string?
├── endFrameDesc: string?
├── firstFrame: string?
├── lastFrame: string?
├── sceneRefFrame: string?
├── videoPrompt: string?
├── videoUrl: string?
├── referenceVideoUrl: string?
├── status: 'pending' | 'generating' | 'completed' | 'failed'
└── dialogues: Dialogue[]

User
├── email: string
├── passwordHash: string
└── createdAt: Date

AdminSession
├── token: string
├── expiresAt: Date
└── ipAddress: string?
```

## License

[Apache License 2.0](./LICENSE)
