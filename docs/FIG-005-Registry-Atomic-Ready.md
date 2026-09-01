# FIG-005：Registry 原子 Ready 登记

## 1. 结论

FIG-005 把 Figma 中已审计的 Button Main Component Set 与 Git Registry 的稳定资产记录闭合起来。

一次 `components.button.ensure` 只有同时满足以下两项，才会被判定为 `succeeded`：

1. Figma Plugin 已创建或收敛真实 Component Set，并完成结构、属性和 Variable Binding 审计；
2. 本地 Bridge 已将返回的真实 `nodeId` 原子登记到准确 Registry Entry，并重新加载整个设计系统确认登记有效。

如果第一项成功、第二项失败，Figma 资产会被保留，Operation 必须进入 `partial`，不能伪装成完成。

## 2. 责任边界

```text
Git 中的批准 Contract、Token、Registry
                │
                ▼
Bridge 写前重新验证并派发唯一命令
                │
                ▼
Figma Plugin Ensure + 真实结构审计
                │
                ▼
返回稳定身份 + 当前 nodeId
                │
                ▼
Bridge 原子更新 Registry + 全量重载验证
```

- Figma Plugin 只负责 Figma 文件内的创建、恢复与审计，不直接写 Git 工作区；
- Bridge 是本地 Registry 的唯一写入协调者；
- Core 提供环境无关、可测试的 Ready 状态转换；
- Git 继续是 Registry 规则和版本历史的权威来源；
- Hatchkit 只修改工作区 JSON，不自动执行 Git commit 或 push，变更必须由人审阅。

## 3. Ready 状态转换

Core 新增 `markComponentRegistryReady`。输入必须准确包含：

- 项目、Component ID、版本与内容摘要；
- Component Approval ID；
- Figma File Binding ID；
- Component Set 稳定身份与 Major 版本；
- Plugin 审计后返回的 Figma Node ID。

它只允许三种结果：

| Action             | 含义                                                |
| ------------------ | --------------------------------------------------- |
| `ready`            | 准确 Entry 从 `unbuilt` 转为 `ready`                |
| `unchanged`        | Registry 已登记完全相同的节点，重试不产生修改       |
| `locator-repaired` | 同一条已审计物理轨道的 Node ID 变化，只修复 Locator |

转换会拒绝非 Active 版本、项目错配、摘要或审批漂移、文件绑定错配、Major 错配、稳定身份错配，以及零个或多个准确 Entry。名称永远不能用于自动接管。

Locator 修复只改变同一物理轨道的 `nodeId`，并保留已有的可选 `componentSetKey`。它不会改变 Contract、版本、摘要、审批或生命周期。

## 4. 原子文件更新

Bridge 写 Registry 时执行以下顺序：

1. 解析并确认设计系统根目录与 Registry 目录的真实路径；
2. 拒绝根目录之外的目标以及符号链接 Registry；
3. 以独占方式创建相邻 `.hatchkit.lock`，已有锁时立即停止；
4. 限制源文件必须是普通文件且不超过 2 MiB；
5. 重新解析当前文件，并用 Canonical JSON 与规划时快照比较；
6. 在同一目录写入唯一临时文件，保留源文件权限并执行文件 `fsync`；
7. 再次核对源文件身份、大小与修改时间，防止提交窗口中的外部编辑；
8. 使用同文件系统原子 `rename` 替换，并对目录执行 `fsync`；
9. 清理本进程拥有的临时文件和锁；绝不删除其他进程持有的锁；
10. 重新加载全部设计资产，验证目标 Entry 确实为准确 Ready 状态。

锁用于 Hatchkit 进程间协作；乐观快照与提交前文件身份检查用于阻止常见的编辑器、Git 操作或其他工具并发覆盖。系统不会尝试合并未知外部修改。

## 5. Operation 与恢复语义

Registry 最终化只会为当前队列中唯一 `dispatched` 的命令运行。排队命令的伪造回执、未知 Operation 和终态回执重放都不能触发文件写入。

最终化失败时：

- Figma 中已完成的托管资产不自动删除；
- Operation 记录 `PARTIAL_WRITE`；
- Plugin UI 明确显示“Figma 已完成，但 Registry 仍需恢复”；
- 操作者先解决 Registry 冲突或陈旧锁，再提交相同命令与相同幂等键；
- Queue 将原 Operation 重新排队，Plugin 依据稳定身份审计现有资产，Registry 再次尝试登记；
- 若 Registry 已经是准确状态，转换返回 `unchanged`，不会重复写文件。

这保证了跨 Figma 与本地文件系统无法进行真正数据库事务时，系统仍然具备可解释、可恢复的最终一致性。

## 6. 安全与隐私

- Registry 不保存 PAT、Bridge Session Token 或 Cookie；
- Node ID 是可修复 Locator，不是跨系统的逻辑身份；
- 本地 Operation API 可以把结果返回给当前 Plugin，但持久化日志继续经过 SEC-001 脱敏；
- 错误不返回原始异常、绝对个人路径或文件内容；
- Bridge 只有在同时配置 `--project` 与 `--root`、从而启用 Git Approval Guard 时才启用 Registry 最终化；诊断模式没有写权限。

## 7. 自动验证

正式测试覆盖：

- Unbuilt 到 Ready、完全相同重试和 Locator 修复；
- 项目、文件、审批、摘要、Major 与稳定身份冲突；
- 成功写入后的全量重载验证；
- Registry 写入失败转为 `PARTIAL_WRITE`；
- Bridge 将 Plugin 成功回执降级为持久化 `partial`；
- 终态回执重放不再次执行最终化；
- 原子替换、源快照冲突、权限保留、锁与临时文件清理；
- 已有外部锁不会被当前进程误删。

## 8. 当前边界与下一步

公开 `hatch-demo` 的 Figma ID 和 Key 仍是明显虚构值，且仓库没有伪造的人类 Approval Record。真实 Desktop 验证必须由设计师指定独立文件、确认 File Binding，并为准确 Token 与 Component 留下可信审批后执行。

FIG-005 不发布 Library、不获取 `componentSetKey`，也不自动提交 Registry 到 Git。当前 Node ID 足以让同一文件中的 Plugin 重新定位；未来发布后的 Key 可以在同一 Ready Locator 中补充。

下一项 FIG-006 将严格从 Ready Registry 解析目标，打开登记的 Main Component，并插入真实 Button Instance；找不到、漂移或出现多个候选时必须停止。
