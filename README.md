<p align="center">
  <a href="./README.md"><img src="https://img.shields.io/badge/%E4%B8%AD%E6%96%87-1F4D3A?style=for-the-badge" alt="中文"></a>
  <a href="./README.en.md"><img src="https://img.shields.io/badge/English-0F2E24?style=for-the-badge" alt="English README"></a>
</p>

# AisleMeal 货架健餐

**开源的健康餐备餐助手 + 采购清单生成器。** 勾选手头食材，选出想吃的菜，按热量和蛋白质排出三餐，再生成具名买菜清单。纯前端 PWA：无登录、无账号、无后端、无价格。

> English: [open-source healthy meal planner](./README.en.md) and grocery list for Chinese home cooking — calorie / protein targets, pantry-based recipes, local-only data.

[![License: MIT](https://img.shields.io/badge/License-MIT-1F4D3A.svg)](LICENSE)
[![Node.js 20+](https://img.shields.io/badge/Node.js-20+-339933.svg)](https://nodejs.org/)
[![PWA](https://img.shields.io/badge/PWA-static_export-0F2E24.svg)](docs/SPEC.md)
[![Next.js 16](https://img.shields.io/badge/Next.js-16-000000.svg)](https://nextjs.org/)

## 这是什么

面向**不会做减脂餐 / 增肌餐、甚至连做饭都困难**的人：

| 卡点 | AisleMeal 怎么帮 |
| --- | --- |
| 不知道每天该吃多少 | 输入性别、年龄、身高、体重、活动量和目标，算出热量、蛋白质、脂肪、碳水 |
| 不知道该买什么、能做什么 | 在「我的食材」勾选手头有的（或一键常见厨房），灵感里加入本周想吃的，只推荐能做的菜 |
| 不会做饭 | 每道菜不超过 5 步；按你家厨具（电饭煲 / 空气炸锅 / 微波炉 / 灶）过滤 |
| 买完对不上餐单 | 营养达标后出**具名采购清单**，自动扣除家里已有，按包装取整 |

**AisleMeal 不做交易。** 清单给你，你自己去买，买回来照着做。不是超市 App，不是外卖，不是薄荷/Keep 那种云端饮食记录。

当前 **0.6.0**：约 **210** 道家常菜谱、**205** 种通用食材。数据只留在本机浏览器 `localStorage`（键 `aislemeal:v1`）。

## 适合检索的说法

如果你在找下面这些，这个仓库就是：

- 中文 **健康餐规划** / **减脂餐** / **增肌餐** / **备餐** 开源工具
- 按**手头食材**过滤菜谱，再生成**买菜清单**
- **热量 + 蛋白质**达标的一周餐单（脂肪、碳水作参考）
- 无后端、无登录、可静态托管的 **meal planner** / **grocery list** / **meal prep** PWA
- 给不会做饭的人用的 **Chinese home cooking** 食谱 + 营养估算

不是：美团购物车同步、实时库存、价格比较、外卖下单、账号体系、医疗级过敏检测。

## 怎么用

1. **建档**：身体数据、忌口过敏、厨具、备哪几顿（早餐可以不吃，午餐可以在外）。
2. **我的食材**：自己勾选；可点「常见厨房预勾」。调味默认折叠。
3. **灵感**：把想吃的加入本周；默认只看已勾食材能做的。
4. **排出餐单**：选天数，用这几道铺满要备的餐位，其余按「省事」或「换花样」补。
5. **生成清单**：每天热量和蛋白相对备餐目标落在 **90%–110%** 之后，才允许生成采购清单。
6. **开做**：按天看步骤。

底栏四个入口：今天 · 餐单 · 买菜 · 灵感。「我的食材」从餐单进去，不是每天目的地。

## 本地运行

需要 **Node.js 20+**。

```bash
git clone https://github.com/bigu1/AisleMeal.git
cd AisleMeal
npm install
npm run dev
```

打开 http://localhost:3000 。`predev` / `prebuild` 会跑 `node scripts/build-data.mjs`，把 `data/ingredients.json` 和 `data/recipes.yaml` 编进 `src/generated/`。

```bash
npm test             # 营养 / 排餐 / 清单 / 数据 / persist
npm run lint
npx tsc --noEmit
npm run build        # 静态产物在 out/（已被 gitignore）
```

无服务器用户数据。不要把浏览器 `localStorage` 当成后端。CI 只跑校验，不自动部署网站。

## 技术栈

Next.js 16（App Router，`output: 'export'`）· TypeScript strict · Tailwind · zustand persist · zod · vitest。

规格以 [docs/SPEC.md](docs/SPEC.md) 为准；规划见 [docs/PLAN.md](docs/PLAN.md)。给编码代理的协作说明在 [AGENTS.md](AGENTS.md)。

## 隐私

- 无账号、无遥测、无第三方分析脚本。
- 身体数据和餐单只在你的浏览器里。
- MIT 许可证，欢迎 fork。

## License

[MIT](LICENSE)
