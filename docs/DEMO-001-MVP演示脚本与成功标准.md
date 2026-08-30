# DEMO-001：MVP 演示脚本与成功标准

- 状态：演示契约已冻结
- 决策日期：2026-08-30
- 依赖：DIR-001、DIR-002、ARCH-001、SPIKE-001、SPIKE-002、ADR-001、ADR-002
- 当前可执行范围：M0 技术验证
- 正式产品范围：Button 垂直链路完成后的 MVP 验收

## 1. 这份演示解决什么问题

本演示用于回答一个具体问题：

> 一个没有参与开发的人，能否按照固定步骤，让 Codex 从已经批准的设计规则中找到 Button，在 Figma 中建立或复用组件，插入真实 Instance，并证明全过程没有重复资产、审批绕过和设计漂移？

DEMO-001 不是宣传视频脚本，也不是把多个成功截图拼在一起。它是后续开发共同遵守的端到端验收合同。

## 2. 必须区分的两层演示

### A. 当前 M0 技术验证

现在已经可以执行，用来证明：

- Figma Plugin API 可以创建 Variables、Component Set、Variant 和真实 Instance；
- 重复执行可以按稳定身份复用资产；
- 本地进程可以通过 HTTP 长轮询控制 Figma Plugin；
- Session Token、单 Writer、FIFO、租约重投和幂等冲突保护可行。

它由 SPIKE-001 和 SPIKE-002 组成，不包含正式 MCP、Registry、审批 Schema 或 Audit Engine，不能对外描述为完整产品。

### B. 正式 MVP 产品演示

这是后续 M1 至 M5 必须实现的验收目标，用来证明：

- Codex 可以查询机器可读的 Token、Contract 和 Registry；
- 未批准内容无法进入正式 Figma 写入；
- Button 设计系统资产可被幂等创建或更新；
- 页面请求插入的是登记 Main Component 的真实 Instance；
- 审计能够验证来源、Variant、Token 和重复身份；
- 整条链路本地运行，不依赖自建服务器。

只有 B 层全部通过后，才可以说 Button 垂直链路已经成为可使用的 MVP。

## 3. 演示角色

| 角色 | 演示职责 |
| --- | --- |
| 操作者 | 按文档启动本地服务、Figma Plugin 和 Codex |
| 产品／设计负责人 | 确认示例内容和 Button 视觉结果 |
| Codex | 查询规则、解释选择、调用 MCP 并展示结果 |
| Local MCP Server | 校验、查询、审批门禁、排队和结果汇总 |
| Figma Plugin Writer | 唯一执行 Figma 正式写入 |
| 观察者 | 按成功标准记录通过或失败，不帮助系统猜答案 |

同一个人可以兼任操作者和观察者，但演示步骤和结果不能依赖开发者口头补充。

## 4. 当前 M0 技术验证

### 4.1 前置条件

- macOS；
- Figma Desktop；
- Node.js `>=22.22`；
- 一个专门用于实验的空白 Figma Design 文件；
- 已克隆本仓库；
- 不在真实生产组件库中运行 Spike。

所有命令均从仓库根目录执行。Session Token、Figma File Key 和真实 Node ID 不得写入仓库或截图公开区域。

### 4.2 自动检查

执行：

```bash
./spikes/run-m0-checks.sh
```

通过标准：

- SPIKE-001 JavaScript 语法检查通过；
- SPIKE-001 领域测试 `4/4` 通过；
- SPIKE-002 Bridge、Client、Plugin 语法检查通过；
- SPIKE-002 通信测试 `7/7` 通过；
- 脚本退出码为 `0`。

任何一项失败都应停止真实 Figma 演示，先修复回归。

### 4.3 Figma Writer 真实验证

1. 在 Figma Desktop 打开专用测试文件。
2. 选择 `Plugins → Development → Import plugin from manifest…`。
3. 选择 `spikes/figma-writer/manifest.json`。
4. 运行 `Agent Design System Kit — SPIKE-001`。
5. 点击“运行实验”，保存第一次结构化结果。
6. 在 Figma 中确认：
   - 两个 Variable Collection；
   - 共 24 个 Variables；
   - 一个 Button Component Set；
   - `Appearance × State` 共 4 个 Variant；
   - 一个文案为“继续”的真实 Instance。
7. 再点击一次“运行实验”。
8. 确认第二次结果 `created: []`，Component Set、Variables 和演示 Instance 均进入 `reused`。
9. 确认画布上没有第二套 Button 或重复演示 Instance。

该步骤只验证实验视觉值。颜色、字体、圆角和间距不代表已经经过产品设计审批。

### 4.4 本地 Bridge 真实验证

在第一个终端执行：

```bash
node spikes/figma-bridge/bridge.js
```

然后：

1. 在同一 Figma 测试文件中导入 `spikes/figma-bridge/manifest.json`。
2. 运行 `Agent Design System Kit — SPIKE-002`。
3. 把终端显示的临时 Session Token 粘贴到插件 UI。
4. 选择 HTTP 并连接。
5. 在第二个终端临时设置 Token，并执行：

   ```bash
   export ADS_BRIDGE_TOKEN='<temporary-token>'
   node spikes/figma-bridge/client.js ping
   node spikes/figma-bridge/client.js marker 'SPIKE-002 / Local Bridge OK' 'demo-001-stable-key'
   ```

6. 确认 `ping` 返回当前文件和页面上下文。
7. 确认 Marker 命令成功，并且画布中只有一个稳定身份标记。
8. 使用相同的幂等键再次运行 Marker 命令。
9. 确认返回原 Operation，命令没有再次进入 Plugin，画布仍只有一个 Marker。
10. 停止 Bridge，并从当前终端清除临时 Token。

```bash
unset ADS_BRIDGE_TOKEN
```

WebSocket 已由 SPIKE-002 证明可行，但不属于 MVP 演示主路径，不需要重复展示。

### 4.5 M0 证据记录

每次复现至少记录：

```text
日期：
Git commit：
macOS 版本：
Node.js 版本：
Figma Desktop 版本：
自动测试：4/4 + 7/7
Writer 第一次结果：
Writer 第二次 created: []：是 / 否
HTTP Bridge ping：通过 / 失败
相同幂等键未重复写入：是 / 否
敏感信息已移除：是 / 否
观察者：
结论：通过 / 失败
```

仓库中的首次真实证据已经分别记录在：

- `spikes/figma-writer/test-results.md`；
- `spikes/figma-bridge/test-results.md`。

## 5. 正式 MVP 的用户故事

演示者向 Codex 提出：

```text
请在当前 Figma 页面插入一个 Primary、Default 状态的 Button，文案为“继续”。必须使用已经批准的设计系统组件；如果找不到或未批准，请停止并说明原因。
```

Codex 必须先查询规则和 Registry，再调用 Writer。不得根据聊天记忆直接画一个相似按钮。

## 6. 正式 MVP 演示数据

仓库最终必须提供一套公开、无敏感信息的固定 Fixture：

| 数据 | 固定要求 |
| --- | --- |
| Project | 示例 `projectId`，不绑定私人项目 |
| Design Brief | 最小、已批准版本 |
| Token Set | Button 所需 Primitive 与 Semantic Token |
| Button Contract | `Label`、`Appearance`、`State` |
| Variants | Primary／Secondary × Default／Disabled |
| Approval | Token 与 Component 均为有效 `approved` |
| Registry | Button 逻辑身份和 Figma 绑定状态 |
| Figma 文件 | 专用测试文件，不使用生产组件库 |

Fixture 的版本、摘要和审批引用必须内部一致。真实 Figma Locator 在演示前由绑定步骤产生，不在开源仓库中硬编码个人文件信息。

## 7. 正式 MVP 黄金路径

### Step 0：环境预检

操作者按照 Quickstart 安装依赖并执行统一检查命令。

预期：

- 所有 Package 构建和测试通过；
- MCP Server 可以被 Codex 发现；
- Figma Plugin 显示“已连接”；
- 当前文件绑定到正确 `projectId + fileBindingId`；
- 不需要云服务器、数据库或账号系统。

### Step 1：校验设计事实

Codex 请求 MCP 校验 Brief、Token、Button Contract、Approval 和 Registry。

预期：

- Schema、引用、版本和内容摘要通过；
- Token 与 Component Approval 状态为 `approved`；
- 返回准确来源文件和版本；
- 不把聊天中的“已经批准”当成证据。

### Step 2：查询 Button

Codex 根据用户意图查询 `button`，请求：

```json
{
  "appearance": "primary",
  "state": "default",
  "label": "继续"
}
```

预期返回唯一结果：

- 逻辑身份 `ads://<projectId>/component/button`；
- 当前有效版本与内容摘要；
- 合法属性和 Variant 组合；
- Approval Reference；
- Registry 中的 Figma 资产状态；
- 为什么 Primary／Default 符合本次使用场景。

### Step 3：建立或确认 Library 资产

如果 Registry 尚未登记可用 Figma 资产，Codex 发起 `ensure`；如果已经存在，则解析并审计现有资产。

预期：

- 创建或复用所需 Variables；
- 创建或复用一个 Button Component Set；
- Component Set 精确包含 4 个 Contract Variant；
- 视觉属性来自登记 Token；
- Figma 托管标记、版本和摘要正确；
- Registry 只有一条当前可用绑定。

### Step 4：重复 Ensure

使用同一目标版本和内容摘要再次执行 Library Ensure。

预期：

- Operation 状态为 `unchanged` 或等价结果；
- 不新增 Variable、Component Set 或 Registry 记录；
- 原 Figma 资产身份保持不变；
- 真实属性审计再次通过。

### Step 5：插入真实 Instance

Codex 为本次页面放置创建新的 `placementId`，请求 Writer 插入 Button。

预期：

- 页面新增一个真实 Instance，不是普通 Frame 或复制图形；
- Main Component 来源与 Registry 一致；
- `Label = 继续`；
- `Appearance = Primary`；
- `State = Default`；
- Instance 带有可恢复的 `placementId`；
- Operation Result 返回 Figma 定位信息和完成步骤。

### Step 6：重试同一次放置

使用相同 `placementId` 和幂等键重复 Step 5。

预期：

- 返回原 Instance；
- 页面不出现第二个“继续”按钮；
- 同键同命令返回原 Operation 或恢复结果。

随后使用新的 `placementId` 再执行一次，预期新增第二个 Instance。这一步证明系统能够区分网络重试和用户确实要求再放一个组件。

### Step 7：执行最小审计

Codex 请求审计当前 Button Instance 和对应 Library 资产。

预期全部通过：

- Instance 来自登记 Main Component；
- Variant 存在于 Contract；
- Component 视觉值绑定登记 Token；
- Registry 可以重新定位 Figma 资产；
- 没有重复稳定身份的 Main Component；
- 审计结果包含期望值、实际值和证据位置。

### Step 8：向用户解释结果

Codex 用普通语言说明：

- 找到了哪个设计系统 Button；
- 使用了哪个版本和 Variant；
- 是否新建或复用了 Library 资产；
- 插入了哪个真实 Instance；
- 审计是否通过；
- 是否存在需要人工处理的警告。

用户不应被要求阅读原始日志才能知道操作是否成功。

## 8. 正式 MVP 阻断路径

演示至少选择以下两项执行，且 Figma 在阻断时保持不变。

### 未批准内容

把 Button Approval Fixture 改为未批准或让内容摘要失配，再请求正式写入。

预期：返回 `APPROVAL_REQUIRED` 或 `APPROVAL_STALE`，不进入 Writer Queue，不修改 Figma。

### 不存在的 Variant

请求 `Appearance = Tertiary`。

预期：返回结构化 Change Request；不得临时新建 Tertiary，也不得自动改用 Primary。

### 错误 Figma 文件

在未绑定或绑定到其他项目的 Figma 文件运行 Plugin。

预期：返回 `FILE_BINDING_MISMATCH`；不得根据文件名猜测并写入。

### 重复稳定身份

在测试 Fixture 中制造两个相同托管身份的 Component Set。

预期：返回 `IDENTITY_CONFLICT`；系统不得自动选择、合并或删除其中一个。

## 9. 总体验收表

| 编号 | 验收项 | 通过标准 |
| --- | --- | --- |
| D-01 | 本地运行 | 无自建云服务也能完成演示 |
| D-02 | Agent 查询 | Codex 先读 Contract 与 Registry，再发起写入 |
| D-03 | 审批门禁 | 未批准或摘要失配时 Figma 零修改 |
| D-04 | Token | Button 的目标视觉值来自登记 Variables |
| D-05 | Component | 只有一个有效 Button Component Set，包含 4 个 Variant |
| D-06 | Registry | 逻辑身份、版本、审批与 Figma Locator 可互相解析 |
| D-07 | Ensure 幂等 | 连续运行两次不产生重复 Library 资产 |
| D-08 | Instance | 页面节点是登记 Main Component 的真实 Instance |
| D-09 | Placement 幂等 | 相同 Placement 重试不重复，新 Placement 可以新增 |
| D-10 | Audit | 来源、Variant、Token、Registry 和重复身份全部通过 |
| D-11 | 错误可恢复 | 错误包含原因、对象和建议下一步 |
| D-12 | 安全 | 仓库与日志没有 Session Token 或个人 Figma 标识泄漏 |
| D-13 | 可解释 | 普通用户能从最终回复理解发生了什么 |
| D-14 | 可复现 | 新测试文件按同一文档可以再次完成 |

任一 D-01 至 D-14 失败，Button 垂直链路都不能标记为 MVP 完成。

## 10. 立即判定失败的情况

- Agent 没查 Registry 就直接绘制 Button；
- Figma 中出现普通 Frame 冒充 Instance；
- 第二次 Ensure 创建重复 Variables 或 Component Set；
- 同一 Placement 重试产生第二个 Instance；
- 未批准内容仍被写入正式 Library Page；
- 发现身份冲突后系统自动挑选一个对象；
- 审计只相信缓存摘要，没有读取真实 Figma 属性；
- Registry 更新失败却把 Operation 报告为完整成功；
- 演示依赖开发者手动修改中间数据才能继续；
- Token、个人路径或真实私有 Figma 标识进入公开证据。

## 11. 演示时间目标

在依赖已安装、Fixture 已准备、Figma Desktop 已登录的情况下：

- 自动检查：2 分钟以内；
- 启动 MCP 和连接 Plugin：2 分钟以内；
- 查询、Ensure、插入和重试：4 分钟以内；
- 审计与阻断演示：4 分钟以内；
- 总计：目标 12 分钟以内。

时间不是正确性的替代条件。首次安装时间单独由 DOC-001 的 Quickstart 验收。

## 12. 任务追踪关系

| 演示步骤 | 主要实现任务 |
| --- | --- |
| 环境预检 | ENG-001 至 ENG-004 |
| 设计事实与审批校验 | CORE-001、SCH-001 至 SCH-004、LOOP-001 |
| Button 查询与解析 | REG-001 至 REG-003、MCP-001 至 MCP-004 |
| Library Ensure | FIG-001 至 FIG-005、FIG-007 |
| Instance 插入与重试 | FIG-006、FIG-007、LOOP-002 |
| 审批阻断 | LOOP-003 |
| 最小审计 | AUD-001 至 AUD-003 |
| 完整回归 | QA-001、QA-002 |
| 新用户复现 | DOC-001、DOC-002 |

后续任务可以改变内部实现，但不能在没有范围决策的情况下削弱本演示的可观察结果。

## 13. DEMO-001 完成标准

DEMO-001 文档本身完成，需要满足：

- 当前可运行 Spike 与未来正式 MVP 明确分开；
- M0 自动检查有单一入口；
- Figma Desktop 手工步骤可以独立复现；
- 正式 MVP 的用户故事、Fixture、黄金路径和阻断路径明确；
- 每一步都有可观察的预期结果；
- D-01 至 D-14 可直接作为后续验收清单；
- 任务追踪关系覆盖 Button 垂直链路；
- 不包含真实 Session Token、Figma File Key 或 Node ID。

达到以上条件表示 M0 的演示契约完成，不表示正式 MVP 功能已经实现。项目随后进入 ENG-001，开始正式工程代码。
