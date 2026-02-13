# MyMetrics

MyMetrics 是一个桌面端个人数据看板：UI 负责展示与管理卡片，本地 Python 脚本负责生产数据。

## 当前能力

- Dashboard：分组筛选、拖拽布局、单卡刷新、全局刷新。
- Card Wizard：4 步建卡（基础信息 → 数据源 → 映射 → 测试预览），支持编辑复用。
- 数据契约：`scalar` / `series` / `status` 三类。
- 回收站：还原、彻底删除、清空回收站。
- 执行引擎：Tauri Rust 命令层调用 Python，支持超时、stderr、exit code。
- 刷新调度：启动刷新、唤醒刷新、按卡片间隔自动刷新。
- 存储：本地 JSON，`schema_version = 1`，自动迁移旧数据。
- 测试：执行映射与存储迁移单测。

## 技术栈

- Frontend: React + TypeScript + Zustand + Recharts + Vite
- Desktop runtime: Tauri v2 (Rust)
- Data scripts: Python (默认系统解释器，可按卡片配置解释器路径)

## 前置要求

- Node.js 20+
- npm 10+
- Python 3.x
- Rust toolchain（用于 Tauri）
  - 安装：`curl https://sh.rustup.rs -sSf | sh`

## 安装依赖

```bash
npm install
```

## 本地开发

### Web 模式（仅前端）

```bash
npm run dev
```

### Tauri 桌面模式（推荐）

```bash
npm run tauri:dev
```

## 构建

### 前端构建

```bash
npm run build
```

### 桌面打包

```bash
npm run tauri:build
```

## 质量检查

```bash
npm run typecheck
npm run test -- --run
npm run build
```

## 脚本输出契约

Python 脚本需要输出 JSON 到 stdout：

```json
{
  "type": "scalar | series | status",
  "data": {}
}
```

完整示例见：`docs/脚本数据协议与示例.md`

## 目录说明

- `components/`: 视图与卡片组件
- `services/execution.ts`: 前端执行服务（invoke + JSON contract + mapping）
- `services/storage.ts`: 本地存储与迁移
- `store.ts`: 全局状态、刷新调度、卡片管理动作
- `src-tauri/`: Rust 执行引擎与桌面配置
- `docs/`: PRD、续建计划、脚本协议文档

## 注意事项

- 浏览器模式下无法真正执行本地 Python；请使用 Tauri 模式进行真实脚本测试。
- `npm run tauri:dev` / `npm run tauri:build` 依赖 Rust 环境和平台打包依赖。
