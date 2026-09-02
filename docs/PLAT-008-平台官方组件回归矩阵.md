# PLAT-008：平台官方组件回归矩阵

- 状态：Schema／解析／协议／Writer／审计自动测试已实现；三套真实 Library 待人工验收
- 日期：2026-09-02

## 三条固定轨道

| 轨道 | Platform Target | 官方资源 | 当前自动测试 | 真实验收 |
| --- | --- | --- | --- | --- |
| A | iOS 26 Stable | Apple iOS／iPadOS 26 UI Kit | 已覆盖 | 待 Key 与 Instance 验证 |
| B | iOS 27 Preview | Apple iOS／iPadOS 27 Preview UI Kit | 已覆盖版本隔离 | 待 Key 与更新行为验证 |
| C | Android + Material 3 | Android UI Kit／Material 3 | 已覆盖平台约束 | 待主题与 Compose 映射验证 |

## 自动回归已覆盖

- Stable Target 拒绝 Preview Kit；
- Apple 与 Google 平台声明、实现框架和跨平台使用约束；
- Cataloged Mapping 不可插入；
- Ready Mapping 要求完整 Variant／文本属性映射和人工审批；
- 严格原生模式找不到官方映射时阻止近似替代；
- Library 无权访问时安全失败；
- 精确请求幂等，不重复 Instance；
- 设计系统库与产品页面文件角色隔离；
- Property API 失效时清除未挂载临时节点，写后中断可幂等恢复；
- 写后远程来源与 Key 回读；
- Detach、换 Key、失效 Binding、摘要漂移、Marker 篡改、伪造审计汇总和目标不匹配审计。

## 人工验收停止点

进入真实轨道需要用户在 Figma 中启用三套外部 Library，并提供真实 Library／Component Key。Hatchkit 不伪造这些 Key，也不会把官方文件提交到仓库。
