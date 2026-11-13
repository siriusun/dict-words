# Lexi 0.3.0 复习优化任务

来源：2026-11-13 对 0.2.3 生词复习逻辑的 audit。依据 [Anki Manual：Deck Options](https://github.com/ankitects/anki-manual/blob/main/src/deck-options.md)、[Preferences](https://github.com/ankitects/anki-manual/blob/main/src/preferences.md) 与 [复习设计](REVIEW_DESIGN.md)。每项完成并通过自动测试后勾选。

## 高优先级

- [x] **T1 同轮完成学习步骤**：评分后仍处于学习／重学、且 20 分钟内到期的卡片回到本轮队列；已到期的学习卡优先显示，没有其他卡片时最多提前 20 分钟（Anki learn ahead limit）。队列条目以记录的 `updatedAt` 识别跨标签页更新，不再依赖“已到期”判断。
  - 验证：`learning steps return within the same round…`（ui）。
- [x] **T2 学习日边界**：长期复习卡在到期日凌晨 4:00 起可复习（Anki next day starts at 4AM），学习中卡片仍按精确时间；“今日已复习”、概览、生词本和刷新计时器使用同一学习日口径；只在队列判断时换算，不改写已保存数据。
  - 验证：`long-term reviews open at 4:00…`（core）、`overview resets today at the learning-day boundary…`（ui）。
- [x] **T3 每日新词上限与卡片优先级**：默认每天 20 个新词，可在设置中调整；本轮依次收集学习中 → 到期复习 → 新词；新词按收藏顺序。概览分开显示到期复习、今日可学新词。积压（到期复习超过一轮）时按可提取性升序，否则按到期日、再按每日稳定的随机顺序（替代字母序）。
  - 验证：`rounds gather learning, due reviews, then new words…`、`a review backlog shows the least retrievable cards first…`（core）、`daily new-word limit caps rounds…`（ui）。
- [x] **T4 复习日志与统计**：每次评分追加 `{at, rating, state}`；JSON 备份升级 v3 并校验日志；导入时合并两端日志，完整历史分叉时按日志重放 FSRS；概览显示近 30 天长期复习真实记得率；遗忘 ≥ 8 次标记为难记词（Anki leech threshold）。
  - 验证：`review logs survive backup v3…`、`true retention counts recent long-term reviews only…`（core）、`overview reports true recent retention and flags leeches…`（ui）。

## 中优先级

- [x] **T5 预览与保存一致、单次计算**：显示答案时用 `scheduler.repeat()` 一次算出四档并缓存，点击直接保存所显示的结果；显示答案超过 10 分钟后点击则按当前时间重算并提示重新选择。
  - 验证：`one preview computes all four grades exactly as saving would…`（core）、`saving uses the displayed preview…`（ui）。
- [x] **T6 原句语境**：有保存的阅读上下文时，复习正面显示该词所在句子并高亮单词，帮助确定要回忆的词义。
  - 验证：`saved reading context is cut to the sentence…`（core）、`saved reading context appears on the card…`（ui）。
- [x] **T7 键盘操作与撤销**：焦点自动落到当前主操作（显示答案／记得），1–4 评分，R 播放发音，Ctrl/⌘+Z 或“撤销”按钮撤回本轮上一次评分（可连续撤销），若已在其他页面更新则拒绝撤销。
  - 验证：`keyboard reveals and grades the focused card, and undo restores…`（ui）。
- [x] **T8 背面补全中文**：复习背面缺少或过期的中文释义时自动获取，与词条详情一致，失败可重试。
  - 验证：`the answer side fills a missing Chinese translation`（ui）。

## 低优先级

- [x] **T9 可选反向卡**：设置开启后（默认关闭），正向卡进入长期复习的词增加“看中文／挖空原句 → 回想英文”的反向卡，独立 FSRS 进度并可选拼写核对；计入每日新词上限；同一轮不同时出现同一词的两个方向；取消收藏一并删除，备份与 CSV 包含反向进度。
  - 验证：`optional reverse cards start after the meaning card graduates…`（ui）、备份 `recall` 校验（core）。
- [x] **T10 可调目标记得率**：设置中提供 85%–95%（默认 90%），预览、保存和导入重放使用同一设置。
  - 验证：`a higher target retention schedules sooner…`（core）、`review settings validate and persist…`（ui）。
- [x] **T11 已评估、保持现状**：365 天最长间隔与旧进度迁移估计保持不变，在设计文档中写明理由。
  - 见 [复习设计 · 评估后保持现状](REVIEW_DESIGN.md#评估后保持现状)。

## 收尾

- [x] **T12 文档、版本与验证**：版本升至 0.3.0，更新 README 与复习设计；自动测试全部通过，并在浏览器中实测复习流程。
  - `node --test tests/core.test.cjs tests/ui.test.cjs`：58 / 58 通过（原 40 项 + 新增 18 项）。
  - 独立代码审查发现：提前到 4:00 复习的卡片被上游按 UTC 日历日计为“当天复习”（UTC+8 的 04:00–08:00）。已改为在本地 4:00 日界时钟上调用 FSRS，并新增固定 `Asia/Shanghai` 时区的回归测试。
  - Chromium（Asia/Shanghai）实测脚本 [browser-check.js](../artifacts/review-030/browser-check.js) 通过：概览分类计数、原句高亮、空格／数字键评分、同轮学习步骤、撤销、真实记得率、反向卡拼写核对与独立进度、深色窄屏；截图见 [artifacts/review-030](../artifacts/review-030/)。
