# SPIKE-001 验证记录

- 状态：通过
- 验证日期：2026-08-30
- Figma 测试文件：Kite 空间中的专用 Design 文件（文件 Key 与节点 ID 不写入公开仓库）

## 静态检查

- [x] `node --check code.js` 通过
- [x] `node --test tests/domain.test.js` 通过（4/4）

## 第一次运行

- [x] 创建两组 Variable Collection
- [x] 创建 24 个 Variables（6 个 Primitive、18 个 Semantic/尺寸/排版 Token）
- [x] 创建一个包含 4 个 Variant 的 Button Component Set
- [x] Component Set 稳定 ID 为 `button`
- [x] 创建一个真实 Button Instance
- [x] Instance 文案为“继续”

## 第二次运行（幂等性）

- [x] 没有新建第二组 Collections
- [x] 没有重复 Variables
- [x] 没有新建第二个 Button Component Set
- [x] 没有新建第二个演示 Instance
- [x] 原资产通过稳定 ID 被重新定位并校验
- [x] 本地插件第二次运行返回 `created: []`

## 结构校验

- [x] `variantCount === 4`
- [x] `variantMatrixValid === true`
- [x] `instanceIsReal === true`
- [x] Label / Appearance / State 可由 Instance properties 读取
- [x] Component Set 与 Instance 均无重复身份
- [x] 所需颜色、排版、尺寸、圆角、边框和透明度绑定无缺失
- [x] Primary / Default 文字对比度为 6.29
- [x] Secondary / Default 文字对比度为 17.74

## 实验中发现的 API 规则

1. Figma 的 `OPACITY` Variable 使用百分数语义：`100` 对应节点 `opacity = 1`，`55` 对应 `0.55`。最初使用 `1` 和 `0.55` 时，画面错误地解析为 1% 和 0.55%。
2. `SharedPluginData` namespace 只允许字母、数字、下划线和点；连字符会被拒绝。
3. 统一绑定 `strokeWeight` 后，读取时可能表现为四个独立字段：`strokeTopWeight`、`strokeRightWeight`、`strokeBottomWeight`、`strokeLeftWeight`。审计器需要兼容两种表示。
4. 绑定 Variable 的 Paint 原始颜色可能仍是创建时的占位值；审计颜色必须通过对应 Variable 的 `resolveForConsumer` 获取解析值。

## 结论

SPIKE-001 通过。Figma Plugin API 与本地插件入口均能完成 Variables、Button Component Set、真实 Instance、稳定身份写入和第二次运行复用。发现的问题属于需要编码进正式 Writer 与 Audit Engine 的 API 细节，不要求修改 ARCH-001 的系统边界。
