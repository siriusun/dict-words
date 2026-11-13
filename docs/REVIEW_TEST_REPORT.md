# Lexi 0.2.0 复习验证

日期：2026-11-13。

## 自动化

使用 Node.js 内置测试和断言，无需安装测试依赖：

```console
node --check lexi.user.js
node tests/core.test.cjs
node tests/ui.test.cjs
```

最终结果：语法检查通过，核心测试 20/20、界面测试 15/15，共 35/35 通过。

覆盖成熟 FSRS 库的固定产物完整性、四档反馈、短时学习、遗忘重学、长期强化及一年上限、逾期反馈、旧数据迁移、FSRS JSON 往返、无效备份拒绝与原有词典/历史/音标功能。界面回调验证答案揭示、预览与保存一致、重复点击、保存失败重试、其他标签页已更新任务跳过、到期与跨日刷新、20 词后继续下一轮及计时器取消。

## 真实浏览器中的隔离验证

Chrome + playwright-cli，独立 `lexi-review-020` 会话。通过现有本地测试服务器加载实际 `lexi.user.js`。仅在测试页注入内存 GM 适配器与 alpha/beta/gamma 三个测试词，不读取用户词库，也不使用真实 Tampermonkey 数据。为了使用 Playwright 原生点击定位器，测试仪器将该页 shadow root 打开；产品源码仍使用 closed 模式。

执行了新词与旧词、四档反馈、先回忆后揭示、遗忘后重学、浏览器时钟推进后的再次到期、概览自动刷新、同词重复复习只算一个今日词数、后续安排显示，以及 JSON 实际下载和旧 v1 备份实际上传合并。旧 v1 合并后，beta 仍保留新状态：6 次复习、Review 状态、1 次遗忘，没有被旧进度覆盖。导出的实际 JSON 经 `validateBackup` 再次校验，包含三个词的完整 FSRS 状态。

脚本异常为 0，复习网络请求为 0。测试服务器缺少 favicon 返回了一次 404，与脚本功能无关。

记录在 [checks.json](../artifacts/review-020/checks.json)，执行脚本在 [browser-check.js](../artifacts/review-020/browser-check.js)。后者记录本次本地端口和测试时间，重跑时需启动测试服务器并更新端口。

截图：

- [初始概览](../artifacts/review-020/01-overview-light.png)
- [四档反馈与间隔预览](../artifacts/review-020/02-answer-light.png)
- [无到期词时的后续安排](../artifacts/review-020/03-upcoming-light.png)
- [深色反馈](../artifacts/review-020/04-answer-dark.png)
- [390px 窄屏深色反馈](../artifacts/review-020/05-answer-narrow-dark.png)
- [旧备份合并后的完整安排](../artifacts/review-020/06-final-plan.png)

## 尚未验证

未在用户的 Tampermonkey 中安装本版，未操作用户收藏。内存 GM 适配器及 Node 测试不能证明扩展权限、真实跨网站/跨标签页完全同时写入的行为。无长期使用数据，不能声称已经验证个人实际保留率；90% 是算法调度目标。本次也未重新验收与复习改动无关的真实词典网络和声音输出。
