# QA-001：Agent 黄金路径回归测试

## 1. 目标

QA-001 把已经分别验证的查询、解析、写入编排和三类审计串成一条 Agent 面向的自动回归。任何后续提交只要破坏主链路中的 Tool 名称、Schema、稳定身份、Variant、幂等键或审计计划，统一 `pnpm check` 与 GitHub CI 都会失败。

可单独执行：

```bash
pnpm qa:golden
```

## 2. 自动验证链路

测试通过真实的进程内 MCP Client／Server 协议调用以下流程：

```text
hatchkit_status
→ hatchkit_search_components
→ hatchkit_resolve_component
→ hatchkit_insert_button_instance
→ 相同插入请求精确重放
→ hatchkit_audit_styles
→ hatchkit_audit_components
→ hatchkit_audit_registry_drift
```

黄金路径使用公开 `hatch-demo` Catalog，并验证：

- Server 处于 Writer-enabled 状态；
- Button 搜索结果为 `figma-ready`；
- Primary／Default Variant 被准确解析；
- Instance Plan 保留准确 Component Set、Variant、Label、坐标和稳定身份；
- 相同 `requestId` 与相同意图产生完全相同的 Writer 指纹和 Tool 结果；
- Style Audit Plan 精确包含 30 个已登记 Variable；
- Component Audit Plan 精确包含一个 Component Set 和四个 Variant；
- Registry Drift Plan 精确包含 Button Component Set、Locator 与其 Token Collection；
- 三类审计均返回零 Finding 和 `passed`。

## 3. 测试边界

该测试使用一个严格的确定性 Writer Test Double：它先用 Core 的 `writerCommandEnvelopeSchema` 校验每条命令，再生成符合正式 Result Schema 的成功 Operation，并按 Operation ID 缓存精确重放结果。

因此 QA-001 证明的是 Agent 可见的跨模块合同与成功编排，不是伪造真实外部验收：

- 不写用户的 Figma 文件；
- 不声称 GitHub 身份已经完成人工审批；
- 不替代 FIG-003 至 FIG-006 的 Figma Desktop 双次运行和设计师视觉验收；
- Plugin Adapter 的真实变更、幂等与零写入行为继续由各自正式测试覆盖；
- Bridge 的认证、授权、FIFO、租约和 Operation Log 继续由 Bridge 集成测试覆盖。

## 4. 发布门禁

黄金路径测试位于正式 Vitest 测试集中，所以根目录 `pnpm test`、`pnpm check` 和 GitHub `Quality` Workflow 的 Node.js 24／22 两条任务都会自动执行它。`pnpm qa:golden` 只是为开发者提供更快的单项诊断入口，不建立第二套结果标准。

QA-002 将在这条成功基线上增加缺失、断线、冲突、重复运行和部分失败等系统级负向场景。
