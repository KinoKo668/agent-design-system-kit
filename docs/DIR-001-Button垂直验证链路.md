# DIR-001：Button 垂直验证链路

- 状态：冻结基线
- 决策日期：2026-08-26
- 适用阶段：首条工程垂直切片
- 负责人：产品负责人、设计负责人、技术负责人

## 1. 这条链路解决什么问题

本任务不是建设完整设计平台，而是验证项目最核心的技术假设：

> GitHub 中已经批准的设计规则，能否被 Agent 准确查询，转换成真实的 Figma Main Component，并在后续页面中复用为 Instance，同时保持可追踪、可重复和可审计。

如果这条链路不能稳定工作，继续扩展 UI 方向、更多组件和多 Agent 适配没有意义。

## 2. 与最终产品 MVP 的关系

本链路是最终产品 MVP 的第一块工程基础，不等于完整产品 MVP。

最终产品仍然需要覆盖：

```text
产品 Brief
→ 三套 UI 方向
→ 设计师选择
→ 基础 Token
→ Icon / Button / Input
→ 写入 Figma
→ 页面 Agent 查询并复用
→ 自动合规审计
```

DIR-001 只验证其中最关键的 Button 创建、登记、查询、复用与审计闭环。UI 方向生成和其他组件在这条链路稳定后接入。

## 3. 第一版使用环境

- Agent Client：Codex；
- 操作系统：macOS；
- 运行方式：本地运行；
- 规则存储：当前 Git 仓库；
- Figma 环境：一个专用测试 Design 文件；
- Figma 写入者：单一 Figma Plugin Writer；
- MCP Server：单个本地进程；
- 网络依赖：不依赖自建云服务器。

Claude、Cursor、Antigravity 和其他操作系统属于后续兼容工作，本链路不得为它们提前增加专用实现。

## 4. 最小 Button 范围

这不是生产级完整 Button，只提供足以验证 Contract、Variant 和 Instance 的最小非平凡组件。

### 组件身份

- 逻辑名称：`Button`
- 稳定逻辑 ID：`button`
- 组件类型：Figma Component Set
- 布局：水平 Auto Layout
- 宽度：Hug contents
- 高度：由语义 Token 决定

### Component Properties

| 属性 | 类型 | 第一版取值 |
| --- | --- | --- |
| `Label` | Text | 默认 `Button`，插入时可修改 |
| `Appearance` | Variant | `Primary`、`Secondary` |
| `State` | Variant | `Default`、`Disabled` |

第一版共创建四个 Variant：

```text
Primary / Default
Primary / Disabled
Secondary / Default
Secondary / Disabled
```

### 第一版固定条件

- 只支持一个 `Medium` 尺寸；
- 不包含前置或后置 Icon；
- 不包含 Loading；
- 不包含 Hover、Pressed、Focused 和 Selected；
- 不定义交互原型和动画；
- 不承诺直接用于生产项目。

这些状态很重要，但不会增加本次技术验证的有效性，因此暂不进入 DIR-001。

## 5. 最小 Token 范围

Button 必须通过语义 Token 获得以下设计决定，不允许在 Component Contract 中直接保存原始视觉值：

- Primary 默认和禁用状态的背景色与文字色；
- Secondary 默认和禁用状态的背景色、文字色与边框色；
- Medium 控件高度；
- 水平内边距；
- 边框宽度；
- 圆角；
- Label 字体、字号、字重和行高；
- Disabled 透明度或等价状态 Token。

具体 Token 名称、JSON 结构和 DTCG 子集由 `SCH-002` 决定。DIR-001 只冻结必须覆盖的设计语义。

## 6. 输入

本链路接收以下已经人工批准的测试数据：

1. 一份最小 Design Brief；
2. 一套 Button 所需的基础与语义 Token；
3. 一份 Button Component Contract；
4. 一份 Component Registry；
5. 一个目标 Figma 文件和目标页面；
6. 一条页面 Agent 请求，例如：

```text
在当前页面插入一个 Primary、Default 状态的 Button，文案为“继续”。
```

DIR-001 不负责通过 AI 生成前三项内容，只负责读取、校验和执行已经批准的内容。

## 7. 输出

一次成功执行必须产生：

1. Figma 中用于 Button 的 Variables；
2. 一个包含四个 Variant 的 Button Component Set；
3. Registry 中可稳定重新定位该组件的资产记录；
4. 目标页面中的真实 Button Instance；
5. Instance 的 `Label`、`Appearance` 和 `State` 属性；
6. 一份结构化执行结果；
7. 一份最小合规审计结果。

## 8. 标准执行流程

### 建库模式

```text
读取 Token、Contract 和 Registry
→ 校验版本、引用和批准状态
→ Figma Writer 创建或更新 Variables
→ 创建或更新 Button Component Set
→ 获取并登记 Figma 资产身份
→ 再次读取并验证 Component Set
```

### 页面复用模式

```text
页面 Agent 提出 Button 请求
→ MCP 查询 Button Contract
→ 校验请求的属性组合
→ Registry 解析 Figma 资产
→ Figma Writer 插入真实 Instance
→ 设置 Label 和 Variant
→ 审计 Instance 来源和 Token 使用
→ 返回节点身份与审计结果
```

页面 Agent不得绕过 Registry，也不得在找不到组件时自行绘制近似 Button。

## 9. 必须处理的失败路径

| 场景 | 系统行为 |
| --- | --- |
| Token 或 Contract 校验失败 | 停止写入，返回字段路径和原因 |
| 组件尚未批准 | 停止写入，返回需要人工审批 |
| 请求了不存在的 Variant | 不创建近似 Variant，返回 Change Request |
| Registry 没有 Figma 资产 | 进入建库流程或返回资产未构建状态 |
| Figma Plugin 未连接 | 不修改文件，返回可恢复的连接错误 |
| 当前 Figma 文件不匹配 | 停止写入，提示切换到登记文件 |
| 发现同一稳定 ID 的多个组件 | 停止写入，返回冲突，不自动选择 |
| 写入中途失败 | 返回已经完成的步骤，不将部分结果登记为成功 |

## 10. 幂等要求

对同一份 Token、Contract、Registry 和 Figma 文件连续执行两次：

- 不得创建第二套 Button Component Set；
- 不得重复创建同名 Variables；
- Registry 不得产生重复资产记录；
- 已存在资产只允许被确认无变化或按规则更新；
- 每次明确提出的页面插入请求可以创建一个新 Instance。

“建库幂等”与“用户要求新增一个页面 Instance”必须被系统明确区分。

## 11. 最小审计范围

第一条链路只检查：

- 页面节点是否为登记 Main Component 的真实 Instance；
- Variant 属性是否存在于 Button Contract；
- Component 使用的视觉值是否来自登记 Token；
- Registry 是否能够重新定位 Figma 资产；
- 是否出现相同稳定 ID 的重复 Main Component。

完整的无障碍、布局、内容和跨页面审计不属于 DIR-001。

## 12. 明确不做

本链路不包含：

- 自动生成三套 UI 方向；
- 自动生成或自动批准 Token；
- Icon、Input 或其他组件；
- 完整 Button 尺寸与交互状态；
- Figma Team Library 发布流程；
- Figma 与 GitHub 的完整双向同步；
- React、Vue、SwiftUI 等代码组件映射；
- Code Connect；
- Claude、Cursor、Antigravity 适配；
- Windows 和 Linux 支持；
- 多 Agent 同时写入；
- 云服务器、数据库、账号和权限系统；
- 完整 Web 管理后台；
- 商业授权和付费功能实现。

新需求默认进入 Backlog，除非它是本链路通过验收的必要条件。

## 13. DIR-001 完成标准

本范围基线满足以下条件后视为冻结：

- 第一版使用环境明确；
- Button 的最小属性和四个 Variant 明确；
- 必需 Token 语义明确；
- 输入、输出和两种执行模式明确；
- 失败路径、幂等要求和最小审计范围明确；
- 不做事项明确；
- 后续任务不得在没有范围变更记录的情况下扩大本链路。

## 14. 变更规则

本文件是后续 `ARCH-001`、`SCH-002`、`SCH-003`、`SCH-004`、`MCP-*` 和 `FIG-*` 的共同范围基线。

任何影响 Button 属性数量、Variant 数量、支持客户端、运行环境或 Figma 写入边界的变更，都必须：

1. 说明变更原因；
2. 说明对关键路径的影响；
3. 获得产品和设计负责人确认；
4. 更新本文件和相关任务验收标准。
