# PLAT-005：Android 官方 UI Kit 验证手册

- 状态：自动化准备完成，等待真实 Figma 人工验证
- 日期：2026-09-02
- 适用：Android UI Kit、Material 3、Material 3 Expressive

## 已确认的产品结论

Android 有官方设计资源。Hatchkit 的 Android 路径采用 Google 官方 Android／Material 资源，不使用 Apple 组件，也不把 Android OS 版本和 Material 设计体系版本混成一个字段。

官方入口以 [Android Design](https://developer.android.com/design/ui/mobile) 和 [Material 3](https://m3.material.io/) 为准。具体 Figma Kit 仍由用户在 Figma 中启用，Git 仅保存外部元数据和发布 Key。

## 验证内容

1. 为 Android OS 基线建立准确 Platform Target，框架选择 Compose 或 Android Views；
2. 分别登记 Android UI Kit、Material 3 或 Material 3 Expressive 的名称、版本和发布通道；
3. 对 Button 首批 Contract Variant 获取真实 Component Key；
4. 检查文本 Property Name、状态／样式轴、主题能力和可修改范围；
5. 对照 Compose Material 3 的组件语义，记录能直接映射、需要品牌 Wrapper 和不支持的部分；
6. 验证导入节点 `remote = true`、Main Component Key 未变化、Instance 未 Detach；
7. 运行跨平台审计，确认 Google 组件不会出现在 iOS Target，Apple 组件不会出现在 Android Target。

## 通过标准

准确 Key 可重复导入；主题或文本修改只使用批准的 Property Mapping；不复制远程 Main Component；Kit 缺失或账号无权访问时返回可恢复错误且页面零近似替代。

## 当前需要人工完成的内容

需要设计师在真实 Figma 账号中启用选定的 Google Library，并提供 Library Key、首批 Component Key、Property API 与 Compose 对应关系的检查结果。
