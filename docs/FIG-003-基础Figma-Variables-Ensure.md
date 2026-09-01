# FIG-003：基础 Figma Variables Ensure

## 1. 结论

FIG-003 已把经过校验的 Hatch Token Set 转换为确定性的 Figma Variable 写入计划，并接入 FIG-002 的认证 Bridge、FIFO 单 Writer 和 Plugin 主线程。

同一份 `projectId + assetId + Major + contentDigest` 重复执行时，Writer 会重新读取真实 Collection、Mode、Variable、Alias、Scope、Code Syntax 与托管标记；全部一致时返回 `unchanged`，不会创建副本，也不会产生无意义的 Figma 写入。

本阶段没有开放审批旁路。独立启动 Bridge 时，`variables.ensure` 默认返回 `APPROVAL_REQUIRED`。只有后续项目控制面提供能够重新读取 Git Approval Record 的 `authorizeWrite` 校验器后，写命令才可以进入队列。

## 2. 从 Token 到 Figma 的映射

第一版采用“一个 Token Set 的一个 Major 版本对应一个 Variable Collection”。Primitive、Semantic 和 Component Token 位于同一个 Collection 中，保证同一 Mode 下的 Alias 能一起切换。

Button Fixture 的正式计划为：

- 1 个 Collection：`Button foundation / v1`；
- 1 个 Mode：`Light`；
- 30 个 Variables；
- 1 个延期的 Typography 组合样式。

类型映射：

| Hatch Token  | Figma Variable                                              |
| ------------ | ----------------------------------------------------------- |
| `color`      | `COLOR`，保留 sRGB 与 Alpha                                 |
| `dimension`  | `FLOAT`，仅接受已冻结的 `px`                                |
| `number`     | `FLOAT`                                                     |
| `fontFamily` | `STRING`，Figma 使用第一字体，完整回退栈仍以 Git Token 为准 |
| `fontWeight` | 根据最终 Primitive 值映射为 `FLOAT` 或 `STRING`             |
| `typography` | 不创建伪 Variable，留给组合 Text Style／Component 绑定      |

`rem` 没有项目换算基准时会在计划阶段被拒绝。DTCG 的 `0..1` 透明度在已确认的纯透明度依赖链中转换为 Figma 的 `0..100` 百分数语义；如果同一个 Primitive Number 同时被透明度和其他单位使用，则停止并要求拆分 Token。

## 3. Scope 与发布边界

- Primitive Variable 固定 `scopes: []`，并隐藏发布入口；
- Semantic／Component Variable 必须有精确 Scope；
- 背景色使用 `FRAME_FILL + SHAPE_FILL`；
- 前景文字使用 `TEXT_FILL`；
- Border、Radius、Gap、Width／Height、Opacity、字体相关字段分别映射到对应的精确 Scope；
- 模糊命名不会退化成 `ALL_SCOPES`，而是返回 `scope_mapping_required`。

每个 Variable 都带完整 Web Code Syntax，例如：

```text
var(--hatch-demo-semantic-color-action-primary-background)
```

## 4. 正式 Writer Command

协议新增：

```text
variables.ensure
```

命令必须同时携带：

- 严格校验后的 Variable Plan；
- 与 Plan 的项目、资产、版本、内容摘要完全一致的 Token Approval Reference；
- 目标 Figma 文件的 `fileBindingId`；
- Operation ID 与幂等键。

Core Schema、Bridge 和 Plugin 轻量边界校验都会检查这些关联。空 Approval、`technical-spike`、Plugin Session Target、断裂 Alias、重复身份、重复 Mode 或错误类型都无法进入 Figma Writer。

Bridge 还有第二道运行时门禁：如果没有配置 Git Approval Verifier，即使命令外形正确也会被拒绝，且不会进入 Queue。

## 5. 稳定身份

正式 Shared Plugin Data 使用：

```text
namespace = agent_design_system_kit
key       = managed-asset
```

Collection 以以下组合定位：

```text
projectId + token-set + assetId + majorVersion + variable-collection + root
```

Variable 以以下组合定位：

```text
projectId + token-set + assetId + majorVersion + variable + tokenPath
```

Mode 没有独立 Shared Plugin Data 能力，因此 Collection 使用单独的 `mode-identities` 映射保存稳定 Mode ID 与 Figma Mode ID 的关系。名称只用于显示，绝不用于自动接管资产。

发现同名但未托管的 Collection 或 Variable 时返回 `UNMANAGED_ASSET`；发现多个相同托管身份时返回 `IDENTITY_CONFLICT`。Writer 不会根据名称猜测或自动 Adopt。

## 6. 文件显式绑定

Plugin 面板现在提供独立的 **File binding** 卡片。首次使用设计系统库文件时，设计师需要：

1. 输入稳定的 kebab-case `projectId`；
2. 在本机生成 UUID 形式的 `fileBindingId`；
3. 点击 **Bind current file**；
4. 在二次确认中核对当前文件名和项目 ID。

确认后，Plugin 主线程才会把以下记录写入 Document 的 Shared Plugin Data：

```text
namespace = agent_design_system_kit
key       = file-binding
```

这是一条显式人工引导的初始化操作，不由 Agent、Bridge 或 `variables.ensure` 自动触发。相同绑定重复提交返回 `unchanged` 且不重复写入；不同绑定、未知字段、损坏 JSON 或不合法 ID 一律返回结构化错误并保持原值。当前版本不提供重新绑定入口，复制文件或变更项目必须进入后续单独评审的 `rebind_file` 恢复流程。

绑定请求与结果都经过版本化 UI／主线程消息校验，并与 Variables 写入共用同一串行执行链，避免绑定和资产写入并发修改 Figma。

## 7. Ensure 与恢复流程

执行顺序固定为：

1. 验证文件绑定、项目、Approval、版本与摘要；
2. 完整读取本地 Collections 和 Variables；
3. 在任何写入前检查重复身份、未托管同名对象、类型冲突、破坏性 Mode／Token 删除；
4. 创建或解析 Collection 与 Mode；
5. 先创建所有 Variable 骨架，再写直接值和 Alias；
6. 写入精确 Scope、描述、发布状态和 Code Syntax；
7. 重新读取真实属性并审计；
8. 审计通过后，最后写入 `assetVersion + appliedDigest + approvalId`；
9. 返回 Collection 动作和 Variable 的 `created / updated / unchanged` 数量。

写入开始前，Collection 与相关 Variable 会进入 `phase: creating`。中途失败时返回 `PARTIAL_WRITE` 和已经完成的步骤，不会盲目删除对象；相同计划可以依据托管身份继续收敛。完全相同的第二次 Ensure 不会再次写 Shared Plugin Data。

## 8. 版本规则

- 同版本、不同摘要：`CONTENT_DIGEST_CONFLICT`；
- Figma 已有版本高于请求版本：`VERSION_CONFLICT`；
- 同 Major 的更高兼容版本：允许逐字段收敛；
- 删除已有 Mode 或 Token：视为破坏性变化，要求新 Major Collection；
- Variable 类型变化：要求新 Major Collection；
- SemVer 比较包含 prerelease 顺序，不能把 `1.0.0-beta.1` 与 `1.0.0` 当成相同版本。

## 9. 已验证内容

自动测试覆盖：

- Button Fixture 确定生成 30 个 Variable；
- 第二次执行 30 个全部 `unchanged`，没有新增对象或重复元数据写入；
- 单个属性漂移只更新对应 Variable；
- Alias、颜色、透明度、Mode、Scope 与 Code Syntax 审计；
- `rem`、摘要漂移、模糊 Scope、断裂 Alias、重复身份拒绝；
- 未托管同名 Collection／Variable 拒绝；
- 未绑定文件只能通过设计师显式确认完成首次绑定；
- 同一文件绑定重复提交无写入，不同或损坏绑定拒绝覆盖；
- 文件绑定不匹配在零写入状态下拒绝；
- 注入中途故障后返回 `PARTIAL_WRITE`，并可从托管骨架恢复；
- Bridge 默认无 Approval Verifier 时阻断写入；
- 认证 Bridge 能完整传递已授权 Variable Plan 与结构化结果；
- Plugin 主线程继续使用串行执行链，避免并行 Figma mutation。

真实 Figma Desktop API 的基础创建能力已由 SPIKE-001 验证。正式 FIG-003 Adapter 的 Desktop 验证需要一个由用户明确指定、已经绑定且具备有效 Approval Record 的测试文件；在这些前置条件建立前，不使用临时批准或隐藏旁路污染真实设计资产。

## 10. 当前边界与下一步

FIG-003 不负责：

- 创建或伪造 Git Approval Record；
- Agent 自动绑定或重新绑定 Figma 文件；
- 创建 Typography Text Style；
- 创建 Button Component；
- 删除旧 Variable；
- 对外开放 Agent 写 Tool。

下一步先在用户明确批准的独立 Figma 文件中，通过现有人工绑定入口完成首次绑定，并对正式 Adapter 执行两次相同 Ensure。验证通过后，FIG-004 使用这些登记 Variable 创建 Button Main Component 与 4 个 Contract Variant。Approval Record 的机器读取和拒绝路径在 LOOP-001／LOOP-003 接入；重新绑定仍属于后续单独评审的恢复能力。
