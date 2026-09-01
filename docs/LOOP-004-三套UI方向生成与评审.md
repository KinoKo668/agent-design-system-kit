# LOOP-004：三套 UI 方向生成与评审

- 状态：已实现内部闭环，等待真实项目人工评审验证
- 实现日期：2026-09-01
- 依赖：SCH-001、DIR-002、REG-001、MCP-002

## 1. 目标

LOOP-004 把“先做三套方向，再由设计师定调”变成可保存、可验证和可查询的正式资产，而不是一次性聊天内容。

```text
准确 Brief
→ Agent 生成三套可比较候选
→ Schema 与引用校验
→ 产品负责人 + 设计负责人分别选择
→ 同一候选获得共识
→ 独立 Direction Approval
→ Token 才能引用
```

Agent 可以准备候选和评审材料，但不能填写代表人类的决定，也不能把 `status` 手改成已选择。

## 2. Direction Review 资产

正式文件使用：

```text
design-system/<project>/directions/*.direction-review.json
```

每份资产必须：

- 绑定一个准确 Brief 的 Project ID、Asset ID、SemVer 和 SHA-256 摘要；
- 恰好包含三套候选，候选 ID 与名称均不重复；
- 使用同一个比较场景和同一组必备元素；
- 每套方向记录颜色、字体、圆角、密度、图形、Icon、动效与无障碍计划；
- 每套方向至少包含两项收益、两项风险和一个可追踪预览；
- 保存稳定 Asset ID、SemVer 与可选内容摘要。

公开示例位于：

- `design-system/hatch-demo/directions/hatch-demo.direction-review.json`；
- `design-system/hatch-demo/artifacts/directions/` 下的三张同场景 SVG 预览。

三套示例分别是 `precision-grid`、`warm-studio` 和 `signal-layer`。它们故意拉开技术感、人文感和品牌辨识度，避免只做颜色不同的三个近似稿。

## 3. 比较维度

候选必须在同一场景下比较以下内容：

| 维度 | 需要回答的问题 |
| --- | --- |
| 设计理由 | 为什么适合当前产品、用户和品牌 |
| 色彩 | 背景、表面、文字和强调色各承担什么语义 |
| 字体 | 标题和正文如何兼顾个性与可读性 |
| 圆角与密度 | 专业感、亲和力与工作效率如何取舍 |
| 图形与 Icon | 如何形成一致且可扩展的视觉语言 |
| 动效 | 如何表达状态，而不是只做装饰 |
| 无障碍 | 对比度、文字、焦点和状态表达如何达标 |
| 收益与风险 | 选择后会得到什么，又要承担什么治理成本 |

预览 URI 只能使用 `artifacts://`、`git://`、`https://` 或 `local-review://`。公开仓库不得写入私有 Figma 文件定位。

## 4. 选择状态

Direction Review 使用一组专门的选择状态：

| 状态 | 派生条件 |
| --- | --- |
| `draft` | 尚未提交，不能含有人类决定 |
| `in_review` | 已提交，但两个必需角色尚未形成一致选择 |
| `changes_requested` | 任一角色要求修改 |
| `rejected` | 任一角色拒绝当前评审版本 |
| `selected` | `product_owner` 与 `design_owner` 选择同一候选 |

规则：

- Reviewer 必须使用 `human:` 或 `github:` 身份；`agent:` 身份会被拒绝；
- 每个必需角色只能保存一个当前决定；
- 只有 `selected` 决定可以引用候选 ID；
- 两个角色选择不同候选时仍是 `in_review`；
- `status` 与 `selectedCandidateId` 由决定重新计算，文件中的伪造值不能通过校验；
- 人类选择只是确定候选，正式 Token 上游仍需 DIR-002 定义的独立 Direction Approval Record。

公开 Demo 没有真实人类决定，因此诚实地保持 `in_review`。

## 5. 加载与完整性

Core 和本地加载器会检查：

- 文件后缀必须是 `.direction-review.json`；
- Project 身份一致；
- Brief 精确版本存在；
- `briefSource.contentDigest` 与实际 Brief 规范化内容一致；
- Direction Review 自身摘要没有漂移；
- Direction Approval 指向真实 Direction Review；
- 获批 Approval 的 Direction Review 必须先达到 `selected`。

路径穿越、符号链接、异常大小和读取期间变化等安全边界沿用 REG-001。

## 6. Agent 查询

默认只读 MCP 新增：

```text
hatchkit_query_directions
```

无参数时只返回分页摘要、三套候选名称、密度、预览链接和选择状态。完整设计理由、色彩和风险必须使用准确 Asset ID 与 SemVer 请求：

```json
{
  "assetId": "product-foundation-directions",
  "assetVersion": "1.0.0",
  "detail": "full"
}
```

Tool 可按派生状态筛选，但没有记录选择或批准的写能力。人工决定通过 Git 审阅后的 JSON 变更进入项目历史。

CLI 显式加载新增：

```text
--direction-review directions/<name>.direction-review.json
```

## 7. 已验证范围

自动测试覆盖：

- 公开三候选 Fixture；
- Draft 生成；
- 双角色同选、Agent 冒充、伪造状态和场景不一致；
- Brief 与 Direction 摘要完整性；
- 目录和 CLI 显式加载；
- Core 摘要／全文查询；
- MCP 严格输入、结构化输出、Tool 发现和 stdio 冒烟；
- 公共 Catalog 状态统计。

尚未宣称完成的是：真实产品／设计负责人在 Git 中做一次共同选择，以及该选择之后的正式 Direction Approval。自动测试不能替代这两项人工证据。
