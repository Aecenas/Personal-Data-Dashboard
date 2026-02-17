# MyMetrics

MyMetrics 是一个基于 Tauri 的本地个人数据看板。  
核心设计是“UI 与数据逻辑解耦”：前端负责展示和编排，数据由用户本地 Python 脚本产出。

当前仓库版本：`v0.2.0`（`package.json` / `src-tauri/Cargo.toml`）。

## 当前版本能力总览

- 多视图工作台：
  - Dashboard（看板）
  - Group Management（分组管理中心）
  - Diagnostics（执行诊断）
  - Recycle Bin（回收站）
  - Settings（全局设置）
- 5 步建卡向导（新建和编辑复用）：
  - 基础信息
  - 脚本与刷新配置
  - 映射配置
  - 告警配置
  - 测试与预览
- 支持 4 种卡片类型：`scalar` / `series` / `status` / `gauge`
- 版面编辑能力：
  - 网格布局、方向键移动、碰撞处理（同尺寸交换/异尺寸越位）
  - 分组独立布局位置（`layout_positions`）
  - 分段线（Section Marker）可视化分区
- 刷新与执行：
  - 单卡刷新 / 全量刷新
  - 启动刷新 / 恢复焦点刷新
  - 按卡片间隔自动刷新
  - 并发限流队列（默认 4，可配置 1-16）
- 告警能力：
  - `status` 状态变化告警
  - `scalar/gauge` 上下阈值告警
  - 冷却时间（cooldown）抑制重复通知
  - 桌面通知（Tauri Notification 插件）
- 诊断能力：
  - 每卡执行历史 ring buffer（默认 120，范围 10-500）
  - 成功率、平均耗时、P50/P90、失败聚合
  - 单卡历史明细弹窗
- 存储与备份：
  - 本地 JSON 持久化，当前 `schema_version = 6`
  - 自动迁移旧配置
  - 配置导入/导出
  - 立即备份 + 自动备份（间隔/每日/每周）
  - 备份保留数量轮转（3-20，默认 5）

## 技术栈

- 前端：React 19 + TypeScript + Zustand + Recharts + Vite
- 桌面运行时：Tauri v2（Rust）
- 本地脚本执行：Python 3.x（可卡片级解释器，也可全局默认解释器）
- 测试：Vitest（`services/**/*.test.ts`）

## 架构与关键文件

- `App.tsx`
  - 应用壳层与全局副作用：
  - 初始化 Store
  - 主题与语言注入
  - 自动保存（600ms debounce）
  - 启动刷新/恢复刷新/周期刷新
  - 自动备份调度
  - Tauri 窗口自适应尺寸逻辑
- `store.ts`
  - 全局状态 + 业务动作核心（卡片、分组、分段线、刷新、回收站、设置）
  - 负责布局重排、批量操作、告警状态推进、执行历史写入
  - `buildSettingsPayload` 是持久化入口结构
- `services/execution.ts`
  - 通过 `invoke('run_python_script')` 调 Rust 命令
  - JSON 解析、类型校验、mapping（支持点路径）
  - 提供 `runCard` / `runDraft` / `validateScript`
- `services/storage.ts`
  - 配置读写、迁移、导入导出、备份轮转
  - `storageMigration.migrateToLatest` 是 schema 兼容关键点
- `services/alerts.ts`
  - 告警规则计算与 cooldown 判定
- `services/diagnostics.ts`
  - 执行历史 ring buffer、统计聚合、错误摘要
- `components/`
  - 各视图与卡片渲染
  - `components/CreationWizard.tsx`：建卡/改卡主流程
  - `components/Dashboard.tsx`：看板编辑与卡片交互
  - `components/GroupManagementCenter.tsx`：分组创建/排序/批量操作
  - `components/Diagnostics.tsx`：诊断视图
- `src-tauri/src/commands.rs`
  - Python 执行与校验命令：
  - `run_python_script`
  - `validate_python_script`

## 执行链路（刷新一次卡片会发生什么）

1. `store.refreshCard` 入队（受 `refreshConcurrencyLimit` 限流）
2. `executionService.runCard` 调用 Rust 命令执行 Python
3. 解析 `stdout` JSON，校验 `type` 与 mapping
4. 成功时：
  - 更新 `cache_data.last_success_payload`
  - 更新 `runtimeData`（`source: 'live'`）
  - 追加执行历史
  - 评估告警并触发桌面通知
5. 失败时：
  - 写入 `cache_data.last_error`
  - `runtimeData` 进入 `error`（有缓存则继续展示旧 payload）
  - 追加失败历史（含错误摘要）

## 配置存储与备份

当前 schema：`6`

关键结构（简化）：

```json
{
  "schema_version": 5,
  "theme": "light | dark",
  "language": "zh-CN | en-US",
  "dashboard_columns": 2-6,
  "refresh_concurrency_limit": 1-16,
  "execution_history_limit": 10-500,
  "backup_config": {
    "directory": "optional path",
    "retention_count": 3-20,
    "auto_backup_enabled": true,
    "schedule": {
      "mode": "interval | daily | weekly"
    }
  },
  "groups": [{ "id": "G1", "name": "Default", "order": 0 }],
  "cards": [],
  "section_markers": []
}
```

存储路径机制：

- 默认：Tauri `AppLocalData` 目录下 `data/user_settings.json`
- 自定义路径：通过 `storage_config.json` 指针记录
- 备份目录默认在数据目录下 `backups/`

## 快速开始

### 1. 环境要求

- Node.js 20+
- npm 10+
- Python 3.x
- Rust toolchain（Tauri 必需）

### 2. 安装依赖

```bash
npm install
```

### 3. 开发运行

仅前端（无法真实执行本地 Python）：

```bash
npm run dev
```

Tauri 桌面模式（推荐）：

```bash
npm run tauri:dev
```

Vite 默认端口：`3000`（`vite.config.ts` 与 `tauri.conf.json` 已对齐）。

## 构建与校验

```bash
npm run typecheck
npm run test -- --run
npm run build
npm run tauri:build
```

CI 工作流：`.github/workflows/desktop-ci.yml`  
会执行前端检查，并在 macOS / Windows / Linux 上构建 Tauri（debug bundle）。

## Python 脚本输出契约

脚本必须向 `stdout` 输出 JSON：

```json
{
  "type": "scalar | series | status | gauge",
  "data": {}
}
```

更多示例见：`docs/脚本数据协议与示例.md`

补充约定：

- 映射支持点路径（如 `metrics.cpu.value`）
- `status.state` 支持别名归一化（`success/healthy -> ok`, `warn -> warning`, `critical/danger -> error`）
- `gauge` 要求 `max > min`
- Rust 执行超时范围会被限制在 `1000ms - 120000ms`

## 手动测试脚本

目录：`test/`

- 成功样例：`scalar_ok.py` / `series_ok.py` / `status_ok.py` / `gauge_ok.py`
- 映射样例：`nested_payload.py`
- 错误样例：`invalid_json.py` / `wrong_type.py` / `timeout_sleep.py` / `stderr_nonzero.py`

说明文档：`test/README.md`

## 后续开发约定（重要）

### 1. 新增设置字段时

需要同步以下位置，避免“UI 可改但不落盘”或“导入后丢字段”：

- 类型定义：`types.ts`（`AppSettings`）
- 存储迁移与清洗：`services/storage.ts`
  - `migrateToLatest`
  - `sanitizeForSave`
  - `normalize*` 系列
- Store 落盘载荷：`store.ts`
  - `buildSettingsPayload`
  - `initializeStore`
  - `applyImportedSettings`
- 设置页 UI：`components/Settings.tsx`
- 多语言文案：`i18n.ts`

### 2. 新增卡片类型时

至少更新：

- `types.ts`（`CardType` 与 payload 类型）
- `services/execution.ts`（normalize + mapping）
- `components/CreationWizard.tsx`（向导步骤、校验、默认 mapping）
- `components/Dashboard.tsx` + 对应 `components/cards/*`
- `services/storage.ts`（迁移默认 mapping）
- `services/*.test.ts` 增补单测

### 3. 布局相关改动时

- 优先复用 `layout.ts` 的 scope 工具函数
- 注意“全局布局”与“分组布局”双轨一致性（`__all__` / `group:*`）
- 变更网格列数时需考虑 `reflowCardsForColumns` 与 section marker 边界归一化

### 4. 国际化规范

- 文案统一走 `i18n.ts` 的 key
- 新增文案需同时补齐 `zh-CN` 与 `en-US`

## 目录速览

- `components/`：页面与 UI 组件
- `components/cards/`：四类卡片渲染
- `services/`：执行、存储、告警、诊断、工具函数与单测
- `src-tauri/`：Rust 命令层与 Tauri 配置
- `docs/`：脚本协议、PRD 等文档
- `test/`：手动验证用 Python 脚本
- `store.ts`：全局业务状态中枢
- `types.ts`：核心领域类型定义

## 注意事项

- 浏览器模式下不能真实执行本地 Python，请用 `npm run tauri:dev` 做联调。
- Tauri 打包依赖平台原生库，Linux 需额外安装 WebKit/GTK 依赖（见 CI workflow）。
