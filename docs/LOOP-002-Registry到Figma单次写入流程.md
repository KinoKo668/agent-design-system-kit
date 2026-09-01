# LOOP-002：Registry 到 Figma 单次写入流程

## 1. 结论

LOOP-002 已把第一条 Agent 可调用的页面写入链路串成一个可选 MCP Tool：

```text
明确的页面 Button 请求
→ 重载并校验 Git Catalog
→ 精确解析 Ready Registry 与 Variant
→ 生成确定性 Instance Plan
→ 提交受审批保护的 Writer Command
→ 等待 Figma Plugin 执行
→ 返回真实 Instance 与审计状态
```

Tool 名称为 `hatchkit_insert_button_instance`。它只插入已登记 Main Component 的真实 Instance，不从 Token 重画 Button，也不按名称猜测或创建近似组件。

## 2. 为什么是可选 Tool

普通 `hatchkit-mcp` 仍然默认只读。只有进程同时获得以下两个环境变量，写入 Tool 才会出现在 MCP Tool 列表中：

- `HATCHKIT_FIGMA_BRIDGE_URL`：只接受无路径、查询参数和凭据的 `http://127.0.0.1:<port>`；
- `HATCHKIT_FIGMA_BRIDGE_TOKEN`：32 至 256 字符的当前内存 Session Token。

缺少任意一项，MCP Server 都保持只读；配置不完整或 URL 不是回环地址时，进程启动失败关闭。Token 不接受命令行参数，避免出现在 Shell 历史和进程列表中。

## 3. “确认”的含义

一次 Tool 调用本身就是明确的 Figma 写入请求，MCP Host 应根据 `readOnlyHint: false` 展示写入确认。服务端不使用可以由 Agent 自己填写的 `confirmed: true` 假确认。

即使 Host 已确认，写入仍必须同时通过：

1. 当前 Git 中存在准确版本、摘要和完整依赖链的真实 Approval Record；
2. Bridge Session Token 有效；
3. Figma Plugin 已连接，并且打开的文件与 Registry `fileBindingId` 一致；
4. Main Component、四个 Variant、属性和托管 Marker 的实时审计通过。

因此，Agent 能发起请求，但不能自行批准设计事实或绕过设计师绑定的文件。

## 4. 输入合同

`hatchkit_insert_button_instance` 只接受以下页面意图：

| 字段                | 含义                                              |
| ------------------- | ------------------------------------------------- |
| `assetId`           | 准确 Component ID，当前垂直链路为 `button`        |
| `assetVersion`      | 可选准确 SemVer；省略时只解析唯一 Active 版本     |
| `variantSelections` | Contract 属性 ID 到 Option ID 的准确选择          |
| `instanceId`        | 页面内稳定 Instance ID；同一物理意图必须保持不变  |
| `label`             | 可见文案与无障碍名称来源                          |
| `x`、`y`            | 当前页面中的有限坐标                              |
| `requestId`         | 本次意图的稳定 UUID；完全相同的恢复或重试必须复用 |
| `waitTimeoutMs`     | 等待 Plugin 的时间，1 至 120 秒，默认 30 秒       |

Tool 不接受来自 Agent 的 Figma Node ID、Approval 摘要、File Binding 或 Component Set 信息。这些安全关键字段只能从当前 Git Snapshot 生成。

## 5. 幂等与恢复

`requestId` 同时成为 Operation ID，并生成稳定的 Idempotency Key：

```text
button-instance:<requestId>
```

- 相同 `requestId` 和相同页面请求：返回或恢复同一个 Operation；
- 相同 `requestId` 但 Label、坐标、Variant 等不同：Bridge 返回幂等冲突；
- 等待超时：Operation 不会被假定失败，也不会自动删除 Figma 内容；Agent 收到 `OPERATION_TIMEOUT`，检查 Plugin 后用原请求重试；
- Figma 部分写入：保留 `creating` Marker，用原请求收敛，不创建第二个 Instance；
- 已完成且内容未变化：Plugin 返回 `unchanged`，不产生 Figma 写入。

## 6. 成功输出

成功结果只在 Bridge 与 Plugin 返回受 Schema 约束且身份一致的 `instances.button.insert` 结果后产生，包括：

- 实际动作：`created`、`recovered` 或 `unchanged`；
- Operation ID、Attempt 和真实 Instance Node ID；
- 解析到的 Component 版本、Approval ID、File Binding 和选中 Variant；
- `verified-by-bridge`、`audited-by-plugin`、`registry: ready` 三项证据状态。

如果 Plugin 回执中的 Component Set、Variant 或 Instance 稳定身份与 Git 计划不一致，Loop 返回内部合同错误，不把异常结果报告为成功。

## 7. 本地运行边界

先启动带 Git Verifier 的 Bridge，并把它显示的临时 Session Token 输入 Figma Plugin。随后以同一个 Token 启动 MCP Server：

```bash
HATCHKIT_FIGMA_BRIDGE_URL=http://127.0.0.1:38451 \
HATCHKIT_FIGMA_BRIDGE_TOKEN='<current-session-token>' \
pnpm hatchkit:mcp -- --project hatch-demo --root design-system/hatch-demo
```

不要把 Session Token 写入仓库、配置样例、日志或截图。公开 `hatch-demo` 目前没有伪造的人工 Approval Record，因此它可以演示查询和自动合同，但正式写入仍会在审批门禁处停止。

## 8. 自动验证

当前测试覆盖：

- Writer Tool 在默认只读模式下不可发现，在完整本地配置下才出现；
- 精确 Registry／Variant 解析和确定性 Writer Command；
- 同一请求生成完全相同的 Plan、Operation ID 与 Idempotency Key；
- 不存在 Variant 和项目不匹配时零提交；
- 真实本地 Bridge 的提交、轮询和成功终态；
- Plugin 缺席时的可恢复超时；
- 非回环 URL、URL 携带凭据／查询参数、短 Token 和不完整环境配置阻断；
- Transport 故障不会泄漏 Session Token；
- Writer 回执稳定身份必须与 Git 计划相同。

## 9. 下一步

LOOP-002 完成的是自动化合同和本地编排，不伪造真实审批，也不擅自写用户 Figma 文件。后续 [LOOP-003](LOOP-003-审批拒绝端到端阻断.md) 已验证缺失、评审中、拒绝、撤销和过期审批在完整 Agent Loop 中全部零排队阻断；真实黄金路径仍需审批角色和设计师在独立文件中完成外部验收。
