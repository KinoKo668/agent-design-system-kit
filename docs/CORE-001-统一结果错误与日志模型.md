# CORE-001：统一结果、错误与日志模型

- 状态：已实现
- 实现日期：2026-08-31
- 依赖：ADR-001、ADR-002、DIR-002、ENG-003
- 适用范围：`core`、`cli`、`mcp-server`、`figma-plugin` 的正式接口

## 1. 目标

CLI、MCP Server 和 Figma Plugin 运行在不同环境，但必须用同一种方式表达：

- 操作成功后返回什么；
- 操作失败的机器可读原因；
- 人和 Agent 能理解的说明；
- Agent 应采取的恢复动作；
- 哪些信息可以进入结构化日志。

本模型是后续 Schema、Registry、MCP 和 Writer 的共同底座。它不实现具体业务操作。

## 2. 核心决定

1. 可预期的领域失败返回 `ToolkitResult`，不使用抛异常表达审批未通过、身份冲突等正常分支。
2. 每个 Result 都携带 `schemaVersion: "1.0.0"` 和稳定的 `ok` 判别字段。
3. 每个正式错误都必须包含错误码、类别、说明、恢复动作、恢复指令和重试规则。
4. 错误可以携带逻辑目标、期望与实际值、已完成步骤和缺失条件。
5. 日志事件由调用方显式提供时间，不在 `core` 中读取系统时间。
6. 日志只自动引用错误码与类别，不复制完整错误上下文。
7. 所有模型都是普通、可 JSON 序列化的数据，不包含 `Error`、`Date`、`Map`、DOM、Node 或 Figma 对象。

## 3. 统一 Result

成功结果：

```json
{
  "schemaVersion": "1.0.0",
  "ok": true,
  "data": {
    "componentId": "button"
  },
  "warnings": []
}
```

失败结果：

```json
{
  "schemaVersion": "1.0.0",
  "ok": false,
  "error": {
    "code": "APPROVAL_REQUIRED",
    "category": "approval",
    "message": "Button has no approval record.",
    "recovery": {
      "action": "submit_for_review",
      "instruction": "Submit Button 1.0.0 for human review.",
      "retry": "retry_after_external_change"
    },
    "target": {
      "type": "component",
      "logicalId": "ads://kite/component/button",
      "version": "1.0.0"
    }
  },
  "warnings": []
}
```

`warnings` 表示没有阻断本次结果、但调用方应向用户说明的问题。Warning Code 由对应业务模块定义；它不得冒充 Error Code。

## 4. 错误字段

| 字段 | 要求 |
| --- | --- |
| `code` | 稳定机器码，Agent 和 Adapter 不得解析错误文案判断类型 |
| `category` | `validation`、`approval`、`identity`、`version`、`migration`、`operation`、`security`、`transport` 或 `internal` |
| `message` | 简短说明发生了什么，不包含密钥、堆栈或个人路径 |
| `recovery.action` | 稳定机器动作，由错误目录统一决定 |
| `recovery.instruction` | 结合当前对象给 Agent 的具体下一步，创建错误时必须提供 |
| `recovery.retry` | 是否以及在什么条件下可以重试 |
| `target` | 可选的逻辑目标；禁止用 Figma Node ID 代替长期身份 |
| `context` | 可选的期望值、实际值、已完成步骤、缺失条件和安全详情 |

重试规则：

| 值 | 含义 |
| --- | --- |
| `do_not_retry` | 原请求继续重试没有意义，必须停止或创建新流程 |
| `retry_after_correction` | 修正输入、版本或本地状态后再提交 |
| `retry_after_external_change` | 等待人工审批、连接恢复等外部状态变化后再提交 |
| `retry_same_request` | 保持相同 Operation、Placement 或幂等身份进行恢复 |

## 5. 错误目录

DIR-002 和 ADR-002 已冻结的错误码全部进入 `ERROR_DEFINITIONS`：

- Validation：`VALIDATION_FAILED`；
- Approval：`APPROVAL_REQUIRED`、`APPROVAL_IN_REVIEW`、`APPROVAL_CHANGES_REQUESTED`、`APPROVAL_INCOMPLETE`、`APPROVAL_REJECTED`、`APPROVAL_STALE`、`APPROVAL_SUPERSEDED`、`APPROVAL_REVOKED`；
- Identity：`INVALID_STABLE_ID`、`IDENTITY_NOT_FOUND`、`IDENTITY_CONFLICT`、`FILE_BINDING_MISMATCH`、`UNMANAGED_ASSET`；
- Version：`CONTENT_DIGEST_CONFLICT`、`VERSION_CONFLICT`、`DOWNGRADE_BLOCKED`、`SCHEMA_VERSION_UNSUPPORTED`；
- Migration：`MIGRATION_REQUIRED`、`MIGRATION_PATH_NOT_FOUND`；
- Operation：`IDEMPOTENCY_CONFLICT`、`OPERATION_ID_CONFLICT`、`PARTIAL_WRITE`。

CORE-001 同时增加三个基础设施错误：

- `TRANSPORT_UNAVAILABLE`：本地 Bridge 或其他正式 Transport 不可用；
- `OPERATION_TIMEOUT`：调用超时，必须先检查 Operation，再使用相同身份重试；
- `INTERNAL_ERROR`：非预期实现错误，必须停止并报告，不能向 Agent 泄露原始堆栈。

SEC-001 随后增加四个安全错误：`CREDENTIAL_REQUIRED`、`CREDENTIAL_INVALID`、`CREDENTIAL_EXPIRED` 和 `UNSAFE_CREDENTIAL_SOURCE`。全部凭据错误都必须在 Figma 写入前阻断。

错误码、类别、默认恢复动作和重试规则的唯一代码事实源是 `packages/core/src/errors.ts`。

## 6. 结构化日志

日志事件包含：

```json
{
  "schemaVersion": "1.0.0",
  "timestamp": "2026-08-31T12:00:00.000Z",
  "level": "error",
  "source": "figma-plugin",
  "event": "writer.file_binding_rejected",
  "message": "Figma file binding did not match the command target.",
  "correlation": {
    "requestId": "request-456",
    "operationId": "operation-123",
    "idempotencyKeyHash": "sha256:<digest>"
  },
  "error": {
    "code": "FILE_BINDING_MISMATCH",
    "category": "identity"
  }
}
```

约束：

- `source` 只能是 `core`、`cli`、`mcp-server` 或 `figma-plugin`；
- `event` 是稳定的机器事件名，`message` 是简短人类说明；
- 只记录 `idempotencyKeyHash`，不得记录原始幂等键；
- `createLogEvent` 只复制错误码和类别，不复制错误文案、Context 或 Recovery；
- `createLogEvent` 要求调用方显式提供当前运行时的 `sensitiveValues`，创建时自动脱敏且不把该数组复制进日志；
- 敏感字段、Bearer／Figma Header、Figma URL 和个人路径由 SEC-001 的纯函数递归遮盖；
- Timestamp 由运行环境注入，使 `core` 保持确定性和可测试；
- CORE-001 只创建日志数据，不写控制台、文件或网络。

Session Token、Authorization Header、个人路径、未脱敏 Figma URL、原始幂等键和堆栈不得进入 `message` 或 `attributes`。凭据来源、保存边界和脱敏策略见 [SEC-001](SEC-001-本地凭据与日志脱敏策略.md)。

## 7. 异常边界

- Schema 不合法、审批阻断、找不到资产、版本冲突和部分写入都是预期领域结果，返回 `ToolkitResult`。
- `Error` 和抛异常只用于程序 Bug 或无法继续的运行时异常。
- CLI、MCP 和 Plugin 的最外层 Adapter 必须捕获未知异常，记录经过脱敏的内部事件，并向调用方返回 `INTERNAL_ERROR`。
- 不得把原始异常堆栈、依赖内部错误或敏感上下文直接返回给 Agent。

## 8. 代码入口

正式公共入口由 `@agent-design-system-kit/core` 导出：

- `createSuccessResult`、`createFailureResult`；
- `isSuccessResult`、`isFailureResult`；
- `createToolkitError`、`getErrorDefinition`、`ERROR_DEFINITIONS`；
- `createLogEvent`；
- `redactSensitiveText`、`redactJsonObject`、`redactJsonValue`；
- 对应的 Result、Error、Log 和 JSON 类型。

后续入口 Package 不得复制错误目录或创建不兼容 Envelope。

## 9. 当前不做

CORE-001 不实现：

- Brief、Token、Contract 或 Registry Schema；
- Operation Result 的完整状态机；
- 日志文件写入、轮转、30 天索引与外部 Secret Scanner；
- MCP Transport、HTTP Bridge 或 Figma Writer；
- JavaScript `Error` 子类体系。

这些能力将在后续 Schema、MCP 和 FIG 任务中基于本契约实现。

## 10. 完成标准

- 三类模型均从 `core` 公共入口导出；
- DIR-002 与 ADR-002 的冻结错误码没有遗漏；
- 每个错误码都有类别、恢复动作和重试规则；
- 成功、失败、错误和日志均可 JSON 序列化；
- 日志不会自动复制完整错误上下文；
- 单元测试覆盖正常、失败、恢复、序列化和公共导出；
- Node 24 与 Node 22 的统一质量门禁通过。
