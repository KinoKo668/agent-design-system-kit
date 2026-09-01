# AUD-001：硬编码样式与未登记 Variable 审计

## 1. 目标

AUD-001 建立第一条只读 Figma 合规审计链路。Agent 可以调用 `hatchkit_audit_styles`，让当前打开的、已登记的 Figma Library 文件扫描当前页面，并把每个违规样式定位到准确 Node 与字段。

本任务只发现问题，不修改设计稿，也不自动把样式替换成 Token。

## 2. Git 是允许清单的来源

审计不会把 Figma 中“看起来像 Token”的 Variable 自动视为合法。Core 从当前已验证的设计系统快照中：

1. 选择唯一 Active 且 Ready 的 Registry 文件绑定；
2. 找到这些组件 Contract 引用的准确 Token Set 版本；
3. 为默认 Mode 中可映射为 Figma Variable 的 Token 生成稳定身份允许清单；
4. 将允许清单和准确 `fileBindingId` 写入版本化 Audit Plan。

因此，Variable 必须同时具有 Hatch 托管标记，并且稳定身份属于当前 Git Token Set，才算已登记绑定。仅名称相同不算通过。

## 3. 当前扫描范围

Plugin 只读扫描当前页面的全部 Scene Node，并检查：

- 可见的纯色 Fill 与 Stroke；
- 小于 `1` 的 Opacity；
- 大于 `0` 的 Corner Radius、Padding、Item Spacing 与可见 Stroke Weight；
- Text 的 Font Family、Font Weight、Font Size 与 Letter Spacing。

报告包含两类错误：

| Code                    | 含义                                                   | 恢复方向                                 |
| ----------------------- | ------------------------------------------------------ | ---------------------------------------- |
| `HARD_CODED_STYLE`      | 字段直接保存数值，没有 Variable Binding                | 改用已批准并登记的 Variable              |
| `UNREGISTERED_VARIABLE` | 字段绑定了 Variable，但其稳定身份不在当前 Git 允许清单 | 绑定当前 Token Set 对应的受管理 Variable |

每条 Finding 都包含 Figma Node ID、Node 名称、Node 类型、准确字段、当前值、Variable ID（如果存在）和恢复说明。结果按 Node／字段／错误码稳定排序，方便 Agent 和 CI 对比。

## 4. 端到端流程

```text
Agent 调用 hatchkit_audit_styles
→ MCP 重载并验证 Git 设计事实
→ Core 生成当前文件的 Variable 允许清单
→ Bridge 认证并排入单 Writer 传输
→ Plugin 只读扫描当前页面
→ 返回 passed 或 violations-found
```

`audit.styles.scan` 明确标记为 `read_only_diagnostic`。它仍通过单 Writer Bridge 保持文件所有权、协议与操作追踪一致，但不会调用写入审批校验，也不会执行 Figma Mutation API。

## 5. 幂等与容量边界

- `requestId` 是一次审计快照的 Operation ID；恢复同一次调用时复用，页面改变后必须使用新的 UUID 重新扫描；
- 单次最多接收 50,000 条样式观察和 10,000 条 Finding，超过限制后失败关闭；
- 审计计划最多包含 2,000 个已登记 Variable；
- 只有一个准确 Ready 文件绑定时才执行，未登记或跨多个文件的范围会失败关闭。

## 6. 第一版明确不覆盖

- Gradient、Image Paint、Effect、Grid 和 Prototype 属性；
- Text 中返回 `mixed` 的局部 Range 样式；
- Variable 解析后的实际值是否与 Git Token 值一致；
- Instance、Variant 与 Component 来源是否合法；
- Registry 与 Figma 资产之间的双向漂移。

后两项分别由 `AUD-002` 与 `AUD-003` 负责。Variable 实际值一致性也属于后续漂移审计，而不是把 AUD-001 扩张为写入或迁移工具。

## 7. 实现边界

Core 保存权威 Schema、Audit Plan 和环境无关的分类规则。Figma Plugin 为控制主线程 Bundle 体积，使用与协议测试对照的轻量只读分类实现，不把 Zod 运行时或整个 Core 审计模块打进 Plugin。

自动测试覆盖 Git 允许清单、故意硬编码样式、外部 Variable、准确 Node 证据、错误文件绑定、Bridge 只读绕过写审批、MCP Tool 发现与完整结果返回，并断言扫描期间没有 Figma 写入。
