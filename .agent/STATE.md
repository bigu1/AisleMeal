---
phase: 0.6 已下令开源；公开仓只用 orphan
verify: npm test && npm run lint && npx tsc --noEmit
next: grok
---

# 现在的状况

老大已口头开源。README 中文为主，顶上徽章跳 [README.en.md](../README.en.md)；另有 `llms.txt`。公开仓 **https://github.com/bigu1/AisleMeal** 必须是 **orphan 第一笔**，不要 `git push` 本地 `main`（旧历史含店址）。GitHub 简介已去掉店名。CI 只校验，不 Pages。

产品仍是 0.6.0：我的食材、新用户空篮、无库存免责、四栏、`devIndicators: false`。205 食材 / 210 菜。

# 下一步

日常功能回 grok。公开仓若缺 Actions：本机 `gh auth refresh -h github.com -s workflow` 后再推 workflow。不要把本地 main 推到 origin。

# 试过但没成

- 远程仓曾是空的私有仓，简介写过店名，已改成通用描述。token 当时可能没有 `workflow` scope。
- 浏览器 MCP 早先不稳；本轮 README 无截图。

# 别动 / 已知妥协

- 53 `per100g`、nutritionGate、handoff、persist 键名。不加第五栏、不加菜。
- 本地 git 作者邮箱不要写进公开快照；orphan 用 GitHub noreply。
- `scopeMode` 仍死字段。产品名仍「货架健餐」。
