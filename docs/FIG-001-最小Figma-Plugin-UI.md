# FIG-001：最小 Figma Plugin UI

## 1. 目标

FIG-001 建立正式 Figma Writer 的可观察界面。它让操作者在一个紧凑面板中看清：

- 当前 Figma 文件与页面；
- 本地 Bridge 是否连接；
- 当前写入是否通过人工审批门禁；
- Writer Operation 的排队、执行、进度与结果；
- 结构化错误和明确恢复动作；
- 当前是否真的获得 Figma 写入授权。

本任务只建立状态呈现与消息边界，不连接 Bridge，也不写入 Figma。

## 2. 界面结构

面板固定为 `360 × 568`，使用 Figma 提供的主题变量适配明暗模式：

```text
Hatchkit Writer
├── 当前文件 / 页面
├── Connection
├── Approval gate
├── Operation + Progress
├── Action needed（有错误时显示）
├── Write authorization
└── Close / Refresh status
```

颜色从不单独表达状态。每个状态同时包含明确文字，错误区域使用 `role="alert"`，动态状态使用 `aria-live`，键盘焦点保持可见，并支持 `prefers-reduced-motion`。

## 3. 状态合同

`status-model.ts` 定义版本化 `1.0.0` 消息和四组视图状态：

| 区域       | 状态                                                      |
| ---------- | --------------------------------------------------------- |
| Connection | `disconnected`、`connecting`、`connected`、`reconnecting` |
| Approval   | `not_checked`、`checking`、`approved`、`blocked`          |
| Operation  | `idle`、`queued`、`running`、`succeeded`、`failed`        |
| Error      | Core 中的 Error Code、Category、Retry 和恢复说明          |

UI 不复制 DIR-002 的完整审批状态机。它只显示“当前写入请求是否通过 Approval Guard”，不会创建或批准 Approval Record。

`writeAuthorized: true` 必须同时满足：

1. Bridge 状态为 `connected`；
2. Approval Guard 状态为 `approved`。

消息接收端会完整检查上下文、枚举值、可选字段、进度范围以及 Error Code 与 Core 定义是否一致。未知版本、伪造状态、完成步数越界或错误语义不匹配都会被拒绝。

## 4. Plugin 进程边界

Figma 主线程与 UI iframe 保持分离：

```text
Figma main thread
  ├── 读取当前文件与页面
  ├── 接收 ui.ready / ui.refresh / ui.close
  └── 发送 writer.status

UI iframe
  ├── 不使用 Figma Plugin API
  ├── 只渲染通过校验的状态快照
  └── 不决定审批或写入权限
```

主线程由 esbuild 打包为 IIFE；UI TypeScript 同样被打包并内联到单一 `dist/ui.html`。正式产物不包含未解析的 Workspace ESM Import。

## 5. Manifest 与网络边界

正式 Manifest 位于 `packages/figma-plugin/manifest.json`：

- 仅支持 Figma Design；
- 使用 `dynamic-page` 文档访问模式；
- 生产网络访问为 `none`；
- 开发环境只允许 `http://localhost:38451`，供 FIG-002 的本地 Bridge 使用；
- Plugin ID 沿用 SPIKE-002 已在 Figma 分配并完成真实验证的本地开发身份。

本阶段 UI 没有发出网络请求。

## 6. 构建与验证

```bash
pnpm build
pnpm figma:smoke
```

Bundle Smoke 会检查：

- Manifest 的入口、文档权限和网络白名单；
- 主线程 Bundle 已启动 UI 和消息边界；
- 主线程是 IIFE，且没有残留 Workspace Import；
- UI Script 已正确内联；
- Approval 与 Error 区域存在；
- 主线程与 UI 不超过明确体积上限。

正式测试另外覆盖初始禁止写入、全部状态映射、进度边界、消息版本、深层字段校验、写入授权条件以及 Core Error 语义一致性。

## 7. 当前不做

FIG-001 不实现：

- Session Token 输入与保存；
- HTTP 长轮询；
- Writer Command 或 FIFO Queue；
- Approval Record 加载；
- Variables、Component、Instance 或 Registry 写入；
- 自动重试或回滚。

这些能力从 FIG-002 开始逐步接入。Plugin UI 始终只是可观察和人工控制界面，不成为新的设计事实源。
