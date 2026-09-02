# SCH-005：Platform Target 与官方 Library Schema

- 状态：已实现
- 实现日期：2026-09-02
- Schema 版本：`1.0.0`
- 任务：PLAT-002
- 依赖：ADR-002、ADR-003、CORE-001、SEC-001

## 1. 目标

Platform Target 把“这是一个 iOS APP”提升为可校验的设计事实。它明确项目采用哪个系统版本、发布通道、实现框架和官方 Figma Library，防止不同 Agent 在不同会话中混用 iOS 26、iOS 27 与 Material 组件。

## 2. 核心结构

```json
{
  "schemaVersion": "1.0.0",
  "assetType": "platform-target",
  "projectId": "hatch-demo",
  "assetId": "ios-26-phone",
  "assetVersion": "1.0.0",
  "platform": "ios",
  "osVersion": "26",
  "releaseChannel": "stable",
  "formFactor": "phone",
  "implementationFramework": "swiftui",
  "nativeFidelity": "strict",
  "libraryBindings": [],
  "resolutionPolicy": {}
}
```

支持的平台是 `ios`、`ipados` 与 `android`。支持的实现框架是 SwiftUI、UIKit、Compose 与 Android Views；Schema 会拒绝 Android + SwiftUI 或 iOS + Compose。

## 3. Official Library Binding

每条 Library Binding 必须记录：

- 稳定 `libraryId`；
- `vendor = apple | google` 与 `official = true`；
- Kit 名称、版本、Publisher 与 Release Channel；
- 支持的平台；
- 第一方官方来源 URL；
- 可选 Figma Community URL；
- `enablement = user-must-enable`；
- `redistribution = external-reference-only`；
- `planned`、`metadata-verified` 或 `figma-verified` 验证状态。

Apple 官方来源只接受 `developer.apple.com`；Google 官方来源只接受 `developer.android.com` 或 `m3.material.io`。Apple 不能声明支持 Android，Google 官方 Android Kit 不能声明支持 iOS。

`figma-verified` 必须包含验证时间和可读证据；`planned` 不得预先填写证据。

## 4. Resolution Policy

第一版把关键安全策略固定为常量而不是任意配置：

```text
platform-system
→ official-vendor
→ brand-wrapper
→ hatchkit-managed
→ change-request
```

同时固定：

- 禁止跨平台回退；
- 禁止 Detached Instance；
- 要求准确版本；
- 缺失时创建 Change Request。

## 5. Stable 与 Preview

Stable Target 不得绑定 Preview Kit。Preview Target 可以显式评估下一代官方资源，但它与 Stable Target 是不同资产和审批轨道。

官方 Kit 更新不会自动改变 Target。修改 Kit 版本、发布通道、来源或验证状态都会改变 Platform Target 摘要，并要求重新评审相关 Platform Component Binding。

## 6. 内容摘要与公共入口

`toPlatformTargetDigestSubject` 排除 `contentDigest` 自身，其余身份、目标、Library 与策略字段全部进入摘要。

`@agent-design-system-kit/core` 导出：

- `platformTargetSchema`；
- `officialLibraryBindingSchema`；
- `validatePlatformTarget`；
- `toPlatformTargetDigestSubject`；
- Platform、Framework、Release Channel、Fidelity 与解析顺序常量；
- 推导出的 TypeScript 类型。

## 7. 当前边界

本 Schema 不声称 Figma Library 已在当前文件启用，也不保存官方组件内容。Figma Library Key 与 Component Key 由 REG-004 在真实验证后登记；启用 Library 和接受许可仍由用户在 Figma 完成。
