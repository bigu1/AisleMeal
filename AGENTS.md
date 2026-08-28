<!-- agent-protocol:start -->
# AGENTS.md

Codex / Grok Build / Cursor 轮流开发本项目。本文件是协作规则的唯一来源，与工具自身默认习惯冲突时以本文件为准。

## 口令对照（用户只说大白话，不记命令）

听到下面这些意思（不限于这些原话），就自动做对应的事：

- 「开工」「接手」「看看做到哪了」「上一个 AI 干到哪了」「继续上次的」 → 执行 sh .agent/handoff in <你的名字：codex|grok|cursor>
- 「收工」「交接」「保存进度」「今天先到这」 → 走下面的收工三步
- 「把这个决定记一下」 → 执行 sh .agent/handoff decide "选了 X 而不是 Y，因为 Z"
- 「这个交给 cursor（或 grok / codex）」 → 把 .agent/STATE.md 的 next 改成对应工具，写清现状和卡点，然后走收工三步

即使用户一句口令都没说：新会话里第一次动代码之前，也必须先执行 in。这是默认动作，不需要用户提醒。

## 开工：第一件事，不许跳过

执行 sh .agent/handoff in <你的名字：codex|grok|cursor>

它会打印当前状态、状态新鲜度、工作区是否干净、最近提交正文、决策记录。读完后用不超过 5 行复述「现状 / 我要做什么 / 我不碰什么」，等我确认再动代码。

如果它警告状态过期或工作区不干净：以 git 实际情况为准，在回复第一行就告诉我，不要假装状态文件是对的。

## 收工：三步

1. 让 .agent/STATE.md 里 verify 字段的命令通过。通不过就把原因如实写进「试过但没成」。
2. 重写 .agent/STATE.md（覆盖，不追加，≤60 行）。
3. 执行 sh .agent/handoff out <你的名字> "一句话说明这次干了什么"

第 3 步会自动执行 verify、校验 STATE 是否真的更新、拦掉密钥文件、提交代码并写好 commit 正文。它拒绝你的时候按它说的改，不要改脚本绕过它，也不要手动 git commit 代替它。

变更历史靠 git commit，不要另建变更日志文件。

## 决策

做了技术选型、或放弃了某个方案，执行：
sh .agent/handoff decide "选了 X 而不是 Y，因为 Z"

.agent/DECISIONS.md 里已记录的决定不要擅自推翻。要推翻先跟我确认，确认后再 decide 一条新的说明取代原因。

## 什么时候必须停手交接

- 完成了一个任务
- 同一个问题试了 3 次仍未解决 → 停手。把试过什么、各自为什么失败写进 STATE.md 的「试过但没成」，next 设为 cursor
- 需要改的范围超出我让你做的事 → 停手问我，不要顺手重构
- 会话即将结束

## 分工

- codex —— 开局：脚手架、目录结构、依赖选型、跑得起来的最小闭环、第一条能通过的 verify 命令。达成后 next 设为 grok。
- grok —— 主力：按 STATE.md 的「下一步」一次只做一件事，小步提交，每件事结束就走一次收工三步。
- cursor —— 攻坚：命中任一条时交给它 —— 同一问题 3 次未解决 / 需跨 5 个以上文件重构 / 并发·性能·内存·构建链问题 / 报错涉及第三方库内部实现 / 需要做有长期影响的架构权衡。做完 next 设回 grok。

不要为了轮换而轮换。换工具要重建上下文，只在上述条件命中时换。

## 诚实性（硬约束）

- 只有你实际执行过的命令和它的真实输出才算「验证过」。没跑就写「未验证」。
- 不许把「应该能 work」写成「已完成」。
- 失败的尝试、绕过的问题、临时妥协，必须写进 STATE.md。这部分比成功的部分更有价值 —— 它决定下一个工具会不会重复踩同一个坑。
- 推测必须标注为推测。
- 不要把临时文件、调试脚本留在工作区，out 会把它们一起提交。
<!-- agent-protocol:end -->

## 本项目的固定事实

- 技术栈：Next.js 16（App Router，`output: 'export'`）+ TypeScript strict + Tailwind + zustand persist + zod + vitest。无后端、无账号。
- 安装：需要 Node.js 20+。仓库根目录 `npm install`。
- 运行：`npm run dev` → http://localhost:3000。`predev` / `prebuild` 会跑 `node scripts/build-data.mjs`。静态包：`npm run build`，产物在 `out/`（已被 gitignore）。
- 测试：`npm test`（vitest：nutrition / planner / basketFeedback / shoppingList / data）。
- Lint / 类型：`npm run lint`、`npx tsc --noEmit`。没有 Prettier。
- 数据：`data/ingredients.json` + `data/recipes.yaml`；构建产物 `src/generated/`。用户数据只在浏览器 `localStorage`，键 `aislemeal:v1`。
- 规格：实施以 `docs/SPEC.md` 为准；`docs/PLAN.md` 冲突时听 SPEC。实现细节记 `docs/DECISIONS.md`。协作决策记 `.agent/DECISIONS.md`。
- 不要动的目录 / 文件：`data/ingredients.json` 的营养数值（原 53 条 `per100g` lock）。0.6 食材是通用名+用户勾选，不做美团登录/购物车/价格预算/账号/后端。不要改 `.agent/handoff`。不要把 `.env`、密钥提交进去。
- 分工建议：后续日常功能交给 grok（Grok Build）；同一问题试 3 次仍失败、大范围重构或构建链问题再交 cursor。

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
