# MCP-002：只读设计资产查询 Tools

## 1. 目标

MCP-002 把已经通过 Core 校验的 Design Brief、Design Token 与 Component Registry 查询能力暴露给 Agent：

```text
Agent
→ hatchkit_status
→ 查询资产摘要
→ 使用稳定 ID 与版本请求精确内容
→ 根据 Git 相对来源继续解析
```

所有 Tool 均为只读，不授予 Figma 写入权限，也不返回可绕过 Registry 的 Figma 物理定位信息。

## 2. Tool 清单

| Tool                         | 用途                            | 默认行为                    |
| ---------------------------- | ------------------------------- | --------------------------- |
| `hatchkit_query_briefs`      | 查询产品与品牌 Brief            | 返回分页摘要                |
| `hatchkit_query_tokens`      | 查询 Token Set、Mode 与精确定义 | 返回分页摘要                |
| `hatchkit_search_components` | 搜索已登记 Component            | 只返回 Active，禁止模糊匹配 |

加上 MCP-001 的 `hatchkit_status`，当前 Server 共暴露四个 Tool。

## 3. 公共契约

### 3.1 项目身份

Project ID 由 Server 启动配置确定，不允许 Agent 在每次 Tool 调用时覆盖。这样可以避免同一进程被诱导查询另一个项目。

### 3.2 结果结构

成功结果继续使用 Toolkit Result `1.0.0`：

```json
{
  "schemaVersion": "1.0.0",
  "ok": true,
  "data": {},
  "warnings": []
}
```

每个 Tool 都声明严格 Zod 输入与结构化输出 Schema。输入未通过协议 Schema 时，由官方 SDK 返回 MCP Input Validation Tool Error；通过输入 Schema 后发生的身份、Catalog 或领域失败，正文保存完整 Toolkit Failure。两类失败都不附加不符合成功 Schema 的 `structuredContent`。

### 3.3 来源与分页

- 所有结果只返回 Catalog Root 内的 Git 相对路径；
- 摘要默认返回 50 项，单页最多 100 项；
- `offset` 与 `nextOffset` 用于确定性分页；
- 每次调用重新读取并校验磁盘，不使用进程启动时的旧缓存；
- 不会为了满足页数限制而静默丢弃结果。

### 3.4 Tool Annotation

三个 Tool 与状态 Tool 一致：

```json
{
  "readOnlyHint": true,
  "destructiveHint": false,
  "idempotentHint": true,
  "openWorldHint": false
}
```

## 4. Brief 查询

### 4.1 摘要

无参数时列出当前项目 Brief 摘要：

```json
{}
```

摘要包含：

- Asset ID、SemVer 与可选内容摘要；
- 标题与产品摘要；
- Git 相对来源；
- `brief: null`，避免列表操作意外返回大量正文。

### 4.2 精确全文

全文必须同时提供准确 Asset ID 与版本：

```json
{
  "assetId": "product-foundation",
  "assetVersion": "1.0.0",
  "detail": "full"
}
```

缺少身份、版本或使用非零 Offset 会在输入边界被拒绝。准确身份不存在时返回 `IDENTITY_NOT_FOUND`，不会自动选择其他版本。

## 5. Token 查询

### 5.1 Token Set 摘要

无参数时返回：

- Token Set 身份、名称与描述；
- DTCG 版本与默认 Mode；
- 每个 Mode 的稳定 ID、名称和 Token 数量；
- Git 相对来源；
- 空的 `definitions`，避免一次输出整个 Token 库。

### 5.2 精确定义

精确定义必须提供 Token Set 身份、版本、Mode 和一至 64 条完整 Token Path：

```json
{
  "assetId": "button-foundation",
  "assetVersion": "1.0.0",
  "detail": "definitions",
  "modeId": "light",
  "paths": ["semantic.color.action-primary-background"]
}
```

默认 `includeDependencies: true`。如果请求的语义 Token 引用了 Primitive，结果会一并返回经过 Schema 校验的 Alias 依赖，并用 `requested` 区分直接请求与依赖项。

无法匹配的准确 Path 会进入 `unmatchedPaths`，系统不会用相似名字代替。单次依赖闭包最多 256 条；超过时整个请求失败并要求缩小范围，不返回不完整结果。

## 6. Component 搜索

示例：

```json
{
  "term": "Button"
}
```

行为沿用 REG-002：

- `term` 只对 Asset ID、显示名称与 Profile 做忽略大小写的完整匹配；
- 默认只搜索 `active`；
- 只有显式 `lifecycle: any` 才查看历史；
- 可以按准确 Asset ID、SemVer 与 Figma Binding 状态过滤；
- 返回 Contract 与 Registry 相对来源；
- 不返回 Node ID、Component Set Key、File Binding ID 或其他 Figma Locator；
- 搜索成功不等于可以写入，审批与 Figma 审计仍需在 Resolve 阶段确认。

拼写错误如 `buton` 会得到零结果，不会返回近似 Button。

## 7. 分层实现

```text
packages/core/src/design-asset-query.ts
→ 环境无关的 Brief / Token 查询、分页、Alias 依赖和错误

packages/mcp-server/src/query-tools.ts
→ MCP 输入输出 Schema、项目绑定、Catalog 重载和协议响应
```

Component 搜索继续复用 `core` 的 `searchComponents`。MCP 层不复制 Registry 匹配规则。

## 8. 安全边界

- 输入使用 Strict Object，拒绝未知字段；
- 精确详情不自动回退版本；
- Token 不做模糊 Path 搜索；
- Component 搜索不泄漏 Figma Locator；
- Catalog 加载失败时不泄漏绝对路径；
- 输出有页大小、Token Path 数量和依赖闭包上限；
- 所有操作均不写文件、不写 Git、不写 Figma、不访问网络。

## 9. 验证

正式测试覆盖：

- Brief 摘要、精确全文、版本排序、分页、非法与缺失身份；
- Token Set 摘要、Mode、准确 Path、Alias 依赖、未知 Path、未知 Mode、重复 Path 与超限闭包；
- Component 准确搜索、拼写错误零结果和 Figma Locator 隐私边界；
- 四个 Tool 的只读 Annotation、严格输入与结构化输出；
- 真实 stdio 子进程在旧版与现代 MCP 协商下发现并调用全部 Tool。

统一验证命令：

```bash
pnpm check
```

## 10. 当前不做

MCP-002 不实现：

- Component Contract、Variant 与 Figma Binding 的最终 Resolve；
- 缺失能力的 Change Request Tool；
- Approval Record 权威校验；
- Figma Writer 或任何页面写入。

Component Resolve 与 Change Request 已在 MCP-003 完成；Approval 和 Figma 写入进入后续任务。
