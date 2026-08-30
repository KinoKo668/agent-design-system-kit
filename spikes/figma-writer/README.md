# SPIKE-001：Figma Plugin Writer

这是一个隔离的、无构建步骤的技术实验，用来验证 Figma Plugin API 是否足以支撑 DIR-001 的 Button 最小链路。

## 实验验证什么

- 创建两组本地 Variables：实验 Primitives 与 Button Semantics；
- 语义颜色通过 Variable Alias 引用基础颜色；
- 创建 `Appearance × State` 共 4 个 Button Variant；
- 创建包含 4 个 Variant 的 `Button` Component Set；
- 添加可编辑的 `Label` Text Property；
- 插入一个真实的 Primary / Default Instance，文案为“继续”；
- 使用稳定逻辑 ID 定位资产；
- 连续运行时更新或复用原资产，不重复创建。

实验中的颜色、圆角和字号只是用于验证 API，**不是已经批准的项目视觉规范**。所有实验 Collection 和 Variable 默认隐藏发布。

## 如何运行

1. 在 Figma Desktop 新建一个专用 Design 测试文件。
2. 打开 `Plugins → Development → Import plugin from manifest…`。
3. 选择本目录下的 `manifest.json`。
4. 运行 `Agent Design System Kit — SPIKE-001`。
5. 点击“运行实验”，记录第一次结果中的 `created`。
6. 再点击一次，确认 Component Set、Variables 和演示 Instance 出现在 `reused`，且没有第二套资产。

如果 Figma 提示本地插件 ID 冲突，请在 Figma 的“Create new plugin”流程中生成本地 manifest ID，并只替换 `manifest.json` 的 `id`；该 ID 不是本项目的跨文件稳定身份。

## 本地检查

```bash
node --check code.js
node --test tests/domain.test.js
```

## 有意保留的限制

- 没有 MCP 或本地 HTTP/WebSocket 通信；这属于 SPIKE-002。
- 没有生产级 Token Schema；这属于 SCH-002。
- 没有完整回滚；发生身份冲突时停止，不自动删除或猜测。
- 没有发布 Team Library。
- 本实验使用原生 JavaScript，避免在 ADR-001 前决定正式构建工具。
