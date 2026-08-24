# Agent 设计系统术语入门

> 这份文档用于解释本项目中可能出现的设计系统、Figma、Agent 和 GitHub 术语。它不是严格的技术规范，而是一份尽量用普通语言编写的入门说明。

## 先理解整体关系

可以先把整个项目想象成装修一套房子：

- **Design Brief** 是业主提出的需求：住几个人、喜欢什么风格、预算和限制是什么。
- **Design Direction** 是设计师给出的装修方向：温暖自然、现代克制或活泼年轻。
- **Token** 是统一的材料和尺寸标准：墙面颜色、门把手颜色、圆角大小、柜体间距。
- **Component** 是按标准生产好的家具：门、柜子、桌子、开关。
- **Instance** 是真正放进某个房间里的那一张桌子或那一个开关。
- **页面设计稿** 是完成布置后的具体房间。
- **GitHub** 保存规则、版本、说明和修改记录。
- **Figma** 保存可以看见和编辑的设计资产。
- **Agent** 是按照这些规则执行工作的设计助理。

它们的基本关系是：

```text
产品需求
  ↓
设计方向
  ↓
Token 和设计规范
  ↓
Figma Components
  ↓
Component Instances
  ↓
完整页面设计稿
```

---

## 一、最核心的设计系统术语

### Design System｜设计系统

设计系统是一整套可重复使用的设计规则和资产。

它通常包括：

- 颜色、字体、间距、圆角等基础规则；
- Button、Input、Dialog 等组件；
- 组件应该在什么时候使用；
- 什么情况下不应该使用；
- 设计与前端代码之间的对应关系；
- 修改、评审和发布流程。

设计系统不是单纯的“组件文件”，而是规则、资产和协作方式的总和。

### Design Brief｜设计需求简报

Design Brief 是开始设计前对项目背景的整理。

通常包含：

- 产品解决什么问题；
- 目标用户是谁；
- 使用场景是什么；
- 品牌希望给人什么感觉；
- 参考产品和竞品；
- 支持哪些设备；
- 必须遵守的限制。

它回答的是：“我们为什么要这样设计？”

### Design Direction｜设计方向 / UI 定调

Design Direction 是对整个产品视觉气质的选择。

例如：

- 专业、克制、可信；
- 温暖、友好、生活化；
- 年轻、鲜明、有表现力；
- 高密度、工具型、效率优先。

设计方向会影响颜色、字体、间距、图标、圆角、阴影和动效。通常应由 Agent 提供多个方向，再由设计师或项目负责人确认。

### Foundations｜设计基础

Foundations 是设计系统最底层的公共规则，通常包括：

- Color：颜色；
- Typography：字体、字号、字重和行高；
- Spacing：间距；
- Radius：圆角；
- Elevation：阴影和层级；
- Motion：动画时间与运动方式；
- Iconography：图标语言；
- Grid：栅格和页面布局规则。

组件应建立在 Foundations 之上。

### Token｜设计令牌

Token 是一个被命名的设计数值或设计决定。

例如：

```text
color.blue.600 = #2563EB
spacing.200 = 8px
radius.control = 8px
font.size.body = 14px
```

Token 不是设计稿，也不是按钮组件。它更像设计系统中的“统一变量”。

如果所有按钮都使用 `radius.control`，以后把它从 `8px` 改成 `10px`，所有绑定该 Token 的按钮都能统一更新。

### Primitive Token｜基础 Token / 原始 Token

Primitive Token 保存最原始的数值，本身通常不表达具体用途。

例如：

```text
blue.600 = #2563EB
gray.900 = #111827
spacing.200 = 8px
radius.200 = 8px
```

它回答的是：“这个值是多少？”

### Semantic Token｜语义 Token

Semantic Token 描述一个值的用途，而不是它具体是多少。

例如：

```text
color.action.primary = blue.600
color.text.primary = gray.900
color.background.page = white
```

它回答的是：“这个值用在哪里？”

这样更换品牌色或切换深色模式时，只需要修改映射关系，不需要逐个修改组件。

### Component Token｜组件级 Token

Component Token 是专门服务某个组件的 Token。

例如：

```text
button.primary.background.default = color.action.primary
button.primary.background.hover = color.action.primary-hover
button.primary.label = color.text.on-primary
```

小型项目不一定一开始就需要这一层。第一版可以先使用 Primitive Token 和 Semantic Token，等组件系统复杂后再增加 Component Token。

### Component｜组件

Component 是可以重复使用的完整 UI 元素。

例如：

- Button；
- Input；
- Checkbox；
- Tabs；
- Dialog；
- Navigation Bar。

组件通常已经包含结构、尺寸、样式、状态和可配置属性。设计页面时应优先使用组件，而不是每次重新绘制。

### Main Component｜主组件

Main Component 是 Figma 中组件的原始定义。

设计师修改 Main Component 后，它对应的 Instance 通常会一起更新。

可以把 Main Component 理解为“模具”或“母版”。

### Instance｜组件实例

Instance 是从 Main Component 复制出来、真正放进某个页面里的组件。

例如：

- 组件库里有一个 Button Main Component；
- 登录页里的“登录”按钮是一个 Instance；
- 设置页里的“保存”按钮也是另一个 Instance。

它们可以有不同的文字和属性，但都来自同一个组件定义。

### Component Contract｜组件契约 / 组件说明书

Component Contract 是 Agent 可以读取的组件说明书。

它不仅描述组件长什么样，还会说明：

- 什么时候使用；
- 什么时候禁止使用；
- 有哪些属性；
- 有哪些状态；
- 对应哪个 Figma Component；
- 对应哪个前端组件；
- 使用哪些 Token；
- 有哪些无障碍要求。

例如 Button Contract 可以说明：一个页面区域通常只能有一个 Primary Button，图标按钮必须有可访问名称。

### Design System Library｜设计系统组件库

设计系统组件库是集中存放和发布 Token、Style、Component 的地方。

其他 Figma 文件可以启用该 Library，然后使用其中的组件实例。

---

## 二、Figma 中常见的术语

### Variable｜变量

Variable 是 Figma 中承载 Token 的主要功能之一。

例如可以创建：

```text
color/action/primary
spacing/control/horizontal
radius/control
```

Token 是设计系统概念，Variable 是 Figma 中实现 Token 的一种具体方式。

### Collection｜变量集合

Collection 用于组织一组相关的 Variables。

例如：

- Primitives；
- Semantic Colors；
- Spacing；
- Typography；
- Motion。

可以把 Collection 理解为变量的文件夹和模式容器。

### Mode｜模式

Mode 表示同一个 Variable 在不同环境下可以拥有不同的值。

最常见的是：

```text
color.background.page
Light Mode = 白色
Dark Mode = 深灰色
```

除了 Light/Dark，还可以用于不同品牌、不同设备或不同密度。

### Alias｜别名 / 引用

Alias 表示一个 Token 或 Variable 引用另一个 Token，而不是重复填写数值。

例如：

```text
color.action.primary → blue.600
```

当 `blue.600` 改变时，`color.action.primary` 也会自动更新。

### Style｜样式

Style 是 Figma 中可重复使用的一组视觉设置，例如：

- Text Style；
- Color Style；
- Effect Style；
- Grid Style。

Variable 更适合单个可切换的值和模式，Style 更适合由多个属性组成的完整样式。

### Variant｜变体

Variant 是同一个组件的不同版本。

例如 Button 可以拥有：

```text
Style = Primary / Secondary / Ghost
Size = Small / Medium / Large
State = Default / Hover / Disabled / Loading
```

这些组合都属于同一个 Button Component Set。

### Component Set｜组件变体集合

Component Set 是把多个相关 Component Variant 组合起来的集合。

例如，Button 的 Primary、Secondary、Small、Medium、Disabled 等版本可以被组合为一个 Button Component Set。

### Component Property｜组件属性

Component Property 是使用 Instance 时可以修改的选项。

常见类型包括：

- Text Property：修改按钮文字；
- Boolean Property：显示或隐藏图标；
- Variant Property：选择样式、尺寸或状态；
- Instance Swap：替换内部图标或其他子组件。

### State｜状态

State 表示组件在不同交互情况下的表现。

例如按钮常见状态包括：

- Default：默认；
- Hover：鼠标悬停；
- Pressed：按下；
- Focus：键盘聚焦；
- Disabled：禁用；
- Loading：处理中。

State 和 Variant 经常同时存在，但概念不同：Variant 是组件版本，State 专门描述交互状态。

### Instance Swap｜实例替换

Instance Swap 允许使用组件时替换它内部的另一个组件。

例如 Button 内部预留了 Icon 插槽，使用时可以把默认图标替换为“保存”“删除”或“添加”图标，而不需要为每个图标制作一套 Button Variant。

### Slot｜插槽

Slot 是组件中允许放入或替换内容的位置。

例如：

- Button 的前置图标；
- Card 的 Header；
- Dialog 的 Footer；
- Navigation Item 的图标区域。

### Auto Layout｜自动布局

Auto Layout 是 Figma 中根据内容自动调整尺寸和排列的布局能力。

例如按钮文字从“保存”改成“保存并继续”后，按钮宽度可以自动扩大，而不需要手工拉伸。

它类似前端中的 Flexbox。

### Frame｜框架 / 容器

Frame 是 Figma 中用于容纳和组织其他元素的容器。

页面、卡片、按钮、导航栏都可能使用 Frame 构建。Frame 可以拥有尺寸、背景、圆角、Auto Layout 和约束。

### Layer｜图层

Layer 是 Figma 画布中的一个可编辑对象，例如文字、图标、矩形、Frame 或 Instance。

### Node｜节点

Node 是 Figma API 对画布对象的统一技术称呼。

一个 Frame、Text、Component 或 Instance 都可以被称为 Node。

### Page｜Figma 页面

Page 是一个 Figma 文件中的顶层内容区域。

设计系统文件通常会分成：

- Cover；
- Getting Started；
- Foundations；
- Components；
- Utilities。

### Publish｜发布

Publish 是把 Figma 文件中的 Component、Style 或 Variable 发布到共享 Library。

只有发布后，其他文件才能稳定地使用这些资产，并接收后续更新。

### Component Key｜组件 Key

Component Key 是 Figma 用于识别已发布组件的稳定标识。

Agent 可以通过它找到正确的组件，而不是只依赖“Button”这个可能重名的名称。

### Node ID｜节点 ID

Node ID 是某个 Figma 文件中一个具体节点的标识。

它适合定位文件中的具体对象，但不应该由 Agent 猜测。创建组件后应把真实返回的 ID 记录下来。

### File Key｜文件 Key

File Key 是 Figma 文件的标识，通常可以从 Figma 文件链接中获得。

### Figma Plugin｜Figma 插件

Figma Plugin 是运行在 Figma 内部的小程序，可以读取或修改当前文件。

本项目中的插件可能负责：

- 创建 Variable；
- 创建 Component；
- 设置 Variant；
- 插入 Instance；
- 绑定 Token；
- 检查页面是否合规。

### Figma MCP｜Figma 的 Agent 接口

Figma MCP 让 Codex、Claude、Cursor 等 Agent 可以通过标准工具读取或操作 Figma。

它是 Agent 与 Figma 之间的桥梁，不是设计规则本身。

### Code Connect｜设计与代码映射

Code Connect 用来记录 Figma Component 与真实代码组件之间的对应关系。

例如：

```text
Figma Button → React <Button />
Figma Dialog → React <Dialog />
```

这样 Agent 从 Figma 生成代码时，可以使用项目真实组件，而不是重新写一个相似组件。

---

## 三、Agent 和工具相关术语

### Agent｜智能代理

Agent 是能够理解目标、读取文件、调用工具、执行步骤并检查结果的 AI。

它与普通聊天机器人的区别是：不只回答问题，还可以实际执行工作。

例如，一个 Component Builder Agent 可以读取 Button Contract、创建 Figma Component、截图检查并输出审计结果。

### Agent Loop｜Agent 工作循环

Agent Loop 是 Agent 重复执行以下动作的过程：

```text
理解目标
→ 获取上下文
→ 制定下一步
→ 调用工具
→ 检查结果
→ 修正或继续
```

本项目不应让 Agent 一次性生成全部组件，而应逐个创建、检查和确认。

### Skill｜技能

Skill 是提供给 Agent 的专业工作说明和配套资源。

例如：

- Design Director Skill；
- Token Builder Skill；
- Component Builder Skill；
- Accessibility Audit Skill。

Skill 告诉 Agent 在什么情况下使用该能力、按什么顺序工作、如何检查结果。

### MCP｜模型上下文协议

MCP 是一种让 Agent 连接外部工具和数据的通用协议。

可以把它理解为 AI 工具世界中的“通用插座”。Codex、Claude、Cursor 等可以通过相同协议调用设计系统工具。

### MCP Server｜MCP 工具提供者

MCP Server 是向 Agent 提供工具的一段程序。

虽然名字里有 Server，但它可以只运行在用户电脑上，不一定需要云服务器。

例如它可以提供：

```text
search_component
get_component_contract
insert_figma_instance
audit_design
```

### MCP Client｜MCP 客户端

MCP Client 是调用 MCP 工具的一方，例如 Codex、Claude Code 或 Cursor。

### Tool｜工具

Tool 是 Agent 可以调用的一项具体能力。

例如：

- 查询 Button；
- 获取 Token；
- 插入 Figma Instance；
- 检查硬编码颜色；
- 生成审计报告。

MCP Server 可以同时提供多个 Tools。

### CLI｜命令行工具

CLI 是通过终端运行的程序。

例如：

```text
design-kit init
design-kit validate
design-kit publish
```

即使用户不直接使用终端，Agent 也可以在后台调用这些命令。

### Adapter｜适配器

Adapter 是把同一套核心能力转换成不同 Agent 平台能够安装和识别的格式。

例如核心设计规则只维护一份，然后生成：

- Codex Adapter；
- Claude Adapter；
- Cursor Adapter；
- Antigravity Adapter。

### API｜程序接口

API 是程序之间交换信息和执行操作的接口。

Figma API 可以让程序读取 Figma 文件信息；Figma Plugin API 可以让插件创建和修改画布内容。

### Schema｜数据结构规范

Schema 规定一份数据必须包含哪些字段，以及字段是什么类型。

例如 Button Contract 的 Schema 可以规定必须包含：

- 组件名称；
- 使用场景；
- 属性；
- 状态；
- Figma Component Key；
- 无障碍要求。

Schema 可以防止不同 Agent 生成完全不同格式的组件说明。

### Compiler｜编译器

在本项目里，Compiler 是把一份通用设计数据转换为不同平台格式的程序。

例如：

```text
DTCG Tokens
  ├─→ Figma Variables
  ├─→ CSS Variables
  ├─→ Tailwind Theme
  ├─→ SwiftUI Constants
  └─→ Android Resources
```

### Registry｜登记库 / 注册表

Registry 是所有已批准设计资产的目录。

它记录：

- 有哪些组件；
- 组件当前版本；
- 对应的 Contract；
- Figma Component Key；
- 代码组件位置；
- 是否已发布；
- 是否已废弃。

Agent 应先查询 Registry，再决定使用或创建什么。

### Manifest｜清单文件

Manifest 是一个项目的总清单，记录设计系统的基本信息和入口。

例如：

```text
名称、版本、目标平台、支持模式、Token 文件位置、组件目录、Figma 文件信息
```

### Ledger｜状态账本

Ledger 记录 Agent 已经在 Figma 中创建了什么，以及对应的真实 ID。

它主要用于：

- 防止重复创建；
- 在新会话中恢复工作；
- 知道上次进行到哪一步；
- 记录哪些内容还没有验证。

### Source of Truth｜唯一事实源

Source of Truth 是发生冲突时最终以哪一份数据为准。

本项目建议：

- GitHub 中的规则、Contract、Token 和版本记录是机器事实源；
- Figma 是视觉资产和设计评审环境；
- Figma 中的人工修改需要同步回 GitHub，才能成为正式版本。

### Local-first｜本地优先

Local-first 表示项目主要在用户自己的电脑上运行和保存数据。

优点包括：

- 不需要自建云服务器；
- 没有持续运营费用；
- 数据更私密；
- 用户可以离线查看项目文件；
- 适合个人开源项目。

### Server｜服务器

服务器是向其他程序持续提供服务的程序或机器。

需要特别区分：

- **本地 MCP Server**：只在用户电脑上运行，不需要购买服务器；
- **云端 Server**：部署在互联网上，可能产生托管和运营费用。

本项目第一版只需要本地 MCP Server。

---

## 四、GitHub 协作相关术语

### Git

Git 是记录文件修改历史的版本管理工具。

它能回答：

- 谁修改了设计规则；
- 修改了什么；
- 为什么修改；
- 是否可以回到之前的版本。

### GitHub

GitHub 是托管 Git 项目的协作平台。

本项目可以用 GitHub 保存：

- Design Brief；
- Token；
- Component Contract；
- 修改提案；
- 审计报告；
- 版本发布；
- 项目代码。

### Repository｜仓库

Repository，简称 Repo，是一个被 Git 管理的项目目录。

它包含项目文件以及完整修改历史。

### Commit｜提交

Commit 是一次被正式记录的修改。

例如：

```text
调整 Primary Button 的圆角和 Hover 颜色
```

一个好的 Commit 应只包含一组相关修改，并说明修改原因。

### Branch｜分支

Branch 是从当前版本分出来的一条独立修改路线。

设计师可以在不影响正式版本的情况下尝试：

- 新的品牌色；
- Button v2；
- 新的紧凑模式；
- Dark Mode 调整。

### Pull Request｜合并请求 / PR

Pull Request 是请求团队评审并合并一组修改。

例如设计师修改 Button 后，可以提交 PR，内容包括：

- 为什么要修改；
- 修改了哪些 Token；
- Figma 前后对比；
- 是否影响已有页面；
- 是否属于 Breaking Change。

### Review｜评审

Review 是其他协作者检查修改并提出意见的过程。

在这个项目中，Agent 可以做自动检查，但视觉方向和关键设计判断仍应由设计师 Review。

### Merge｜合并

Merge 是把通过评审的 Branch 合并进正式版本。

只有合并后的设计规则才应被所有 Agent 默认使用。

### Release｜发布版本

Release 是把一组已经确认的修改正式发布给使用者。

例如：

```text
Design System v1.2.0
```

### Semantic Versioning｜语义化版本

常见版本格式是：

```text
主版本.次版本.修订版本
1.2.3
```

- `1`：有不兼容的重大变化；
- `2`：增加兼容的新能力；
- `3`：修复问题，不改变原有用法。

### Breaking Change｜破坏性变更

Breaking Change 是可能导致现有页面或代码不能继续正常使用的修改。

例如：

- 删除一个 Button Variant；
- 修改 Component Property 名称；
- 删除一个已经发布的 Token；
- 改变组件结构导致代码映射失效。

---

## 五、质量与治理术语

### Governance｜治理

Governance 是决定设计系统如何新增、修改、评审、发布和废弃内容的规则。

它解决的是：“谁可以改、怎么改、改完如何让其他人知道？”

### Design Drift｜设计漂移

Design Drift 表示设计随着时间逐渐偏离原来的系统。

常见表现包括：

- 同一个产品出现多个相似按钮；
- 页面中出现未定义的颜色；
- 不同 Agent 使用不同圆角；
- Figma 与代码组件不一致。

### Compliance｜合规性

Compliance 表示一个页面或组件是否遵守设计系统规则。

例如：

- 是否使用批准的组件；
- 是否绑定正确的 Token；
- 是否使用合法的 Variant；
- 是否满足无障碍要求。

### Audit｜审计

Audit 是系统性检查设计资产是否符合规则。

审计结果应说明：

- 发现了什么问题；
- 问题位于哪个节点；
- 违反了什么规则；
- 建议如何修复。

### Accessibility｜无障碍

Accessibility 是让不同能力和使用方式的人都能够使用产品。

常见要求包括：

- 文字与背景有足够对比度；
- 点击区域足够大；
- 键盘可以操作；
- 图标按钮有文字说明；
- Focus 状态清晰可见。

### Visual Regression｜视觉回归

Visual Regression 是把修改前后的截图进行比较，检查是否出现意外视觉变化。

例如修改一个 Token 后，可以检查是否让其他组件的颜色或布局发生了非预期变化。

### Hardcoded Value｜硬编码值

Hardcoded Value 是直接写在组件或页面中的数值，而不是引用 Token。

例如：

```text
不推荐：背景色直接填写 #2563EB
推荐：背景色绑定 color.action.primary
```

硬编码值很容易造成设计漂移。

### Idempotency｜幂等性

幂等性表示同一个操作重复执行，不会产生重复或混乱的结果。

例如 Agent 连续执行两次“创建 Button”，正确结果应该是发现 Button 已存在并更新或跳过，而不是创建两个同名 Button。

### Validation｜验证

Validation 是检查输出是否满足明确规则。

例如：

- Token 文件格式是否正确；
- Component Contract 是否缺少必要字段；
- Figma 组件是否绑定了变量；
- Variant 数量是否正确。

### Human Approval Gate｜人工审批门

人工审批门表示 Agent 执行到关键决策时必须暂停，等待人确认。

适合设置审批门的环节包括：

- 选择 UI 方向；
- 确认第一版组件范围；
- 处理 Figma 与 GitHub 的冲突；
- 发布重大版本。

---

## 六、“在页面中放置一个按钮”的完整例子

假设 Agent 正在设计设置页面，需要放置一个“保存”按钮。

### 第一步：理解用户意图

Agent 判断“保存”是当前区域最重要的操作，因此需要寻找主要操作组件。

### 第二步：查询 Registry

Agent 查询设计系统中是否存在适合主要操作的组件，找到：

```text
Button
适用场景：提交、保存、确认等主要操作
禁止用法：同一区域同时使用多个 Primary Button
```

### 第三步：读取 Component Contract

Agent 获得 Button 的合法属性：

```text
Style = Primary
Size = Medium
State = Default
Label = 保存
Leading Icon = 无
```

### 第四步：解析 Figma 组件

Registry 中记录了 Button 对应的：

```text
Figma File Key
Figma Component Key
Component Version
```

Agent 通过这些信息找到准确的 Figma Button，而不是凭名称猜测或重新绘制。

### 第五步：插入 Instance

Agent 把 Button 的一个 Instance 放入设置页面，并设置文字、Style、Size 和 State。

### 第六步：Token 自动生效

Button Main Component 内部已经绑定：

```text
背景色 → color.action.primary
文字色 → color.text.on-primary
高度 → size.control.medium
左右间距 → spacing.control.horizontal
圆角 → radius.control
```

因此 Agent 不需要重新决定具体颜色和尺寸。

### 第七步：自动审计

系统检查：

- 是否使用真实 Button Instance；
- 是否使用合法 Variant；
- 是否绑定正确 Token；
- 页面中是否存在多个 Primary Button；
- 按钮文字是否清晰；
- 点击区域是否满足要求。

### 第八步：缺少组件时停止创造

如果现有 Button 无法满足需求，Agent 不应偷偷画一个新按钮，而应提出：

```text
当前 Button 不支持倒计时状态。
建议选择：
1. 扩展现有 Button；
2. 使用现有 Loading 状态；
3. 提交新组件需求。
```

经过设计师确认、GitHub PR 评审和 Figma 更新后，新的能力才进入正式设计系统。

---

## 七、最容易混淆的概念

### Token 和 Component

```text
Token：颜色、间距、圆角等设计值
Component：使用这些值构建出的完整 UI 元素
```

### Component 和 Instance

```text
Component：组件的原始定义或模具
Instance：页面中实际使用的一个副本
```

### Token 和 Variable

```text
Token：通用设计系统概念
Variable：Figma 实现 Token 的具体功能
```

### Variant 和 State

```text
Variant：组件的不同版本
State：组件在交互过程中的状态
```

State 通常会作为 Variant Property 的一个维度存在。

### GitHub 和 Figma

```text
GitHub：规则、说明、版本、决策和机器可读数据
Figma：可视化设计资产、组件结构和页面设计稿
```

### Skill 和 Tool

```text
Skill：教 Agent 应该如何完成一类工作
Tool：让 Agent 执行一个具体操作
```

### MCP 和服务器

```text
MCP：Agent 连接工具的协议
MCP Server：提供这些工具的程序
```

MCP Server 可以只在用户电脑上运行，并不等于必须租用云服务器。

### Registry 和 Library

```text
Registry：机器可查询的资产目录和对应关系
Figma Library：实际发布和复用的 Figma 设计资产
```

---

## 八、阅读完后应掌握的核心结论

1. Token 不是按钮，也不是页面，而是颜色、间距、字体等可复用设计决定。
2. Component 是组件模具，Instance 是页面里实际放置的组件副本。
3. Agent 应先查组件规范和 Registry，再找到对应的 Figma Component。
4. Agent 应插入真实 Instance，而不是重新绘制一个相似按钮。
5. Token 通常已经绑定在 Main Component 内部，Instance 会自动继承。
6. GitHub 负责保存规则、版本和修改历史，Figma 负责保存视觉资产。
7. MCP Server 可以本地运行，项目第一版不需要云服务器。
8. 找不到合适组件时，Agent 应提出变更申请，而不是擅自创造新样式。
9. 设计师负责关键方向和质量判断，Agent 负责执行、检查和重复劳动。
10. 这个项目最终要保证：不同 Agent 在不同时间设计页面，仍然使用同一套设计语言。

