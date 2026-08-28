# 实施决策记录（DECISIONS）

> 给执行编码的 AI：凡是 `docs/SPEC.md` 没有覆盖、由你自行拍板的实现细节，按下面格式追加记录。验收时会逐条审查。SPEC 已定死的内容（公式参数、数据数值、产品行为）不允许出现在这里——那些不是你的决策空间。

格式：

```
## D-001 <一句话标题>
- 背景：SPEC 未覆盖什么
- 决策：你选了什么方案
- 理由：为什么这是最简单/合理的选择
- 影响文件：路径列表
```

---

## D-001 使用 Next.js 默认 `@/*` 路径别名
- 背景：SPEC 初始化命令写了 `--no-import-alias`，但 create-next-app@16 已无此旗标
- 决策：保留默认 `paths: { "@/*": ["./src/*"] }`，源码用 `@/` 导入
- 理由：官方脚手架默认值，避免手改 tsconfig
- 影响文件：`tsconfig.json`，以及所有 `src/**` 导入

## D-002 未引入 Prettier
- 背景：PLAN 提到 ESLint/Prettier，SPEC 依赖白名单没有 Prettier
- 决策：只保留 create-next-app 自带 ESLint，不加 Prettier
- 理由：加白名单外依赖需要额外理由；格式化不阻塞完成定义
- 影响文件：无

## D-003 构建脚本内联 zod schema
- 背景：SPEC 要求 `scripts/build-data.mjs` 做 zod 校验，但 .mjs 不能直接 import `schemas.ts`
- 决策：在 `build-data.mjs` 内联一份与 `schemas.ts` 对齐的 zod 规则；运行时仍用 `src/domain/schemas.ts`
- 理由：不加 tsx/ts-node（不在白名单）
- 影响文件：`scripts/build-data.mjs`，`src/domain/schemas.ts`

## D-004 排餐函数补充 PlanContext
- 背景：SPEC 函数签名未包含 ingredients / profile，但打分、过敏过滤、微调件都需要
- 决策：`buildPlan` / `applyMicroAdjust` / `alternativesFor` / `createMealPlan` 增加 `ctx: { profile, ingredients, basketIds? }`
- 理由：最小必要上下文，测试可注入假数据
- 影响文件：`src/domain/planner.ts`

## D-006 无解建议按解锁数取 top 3
- 背景：SPEC §5.4 写「返回 top 3」，§11.1 要求 suggestions 长度 3；未写解锁数为 0 时是否省略
- 决策：非 seasoning、不在篮中的食材全部计分，按解锁数降序、同数 id 字典序，取 3 条（解锁数可为 0）
- 理由：SPEC 写的是 top 3，不是「只返回 >0」
- 影响文件：`src/domain/planner.ts`

## D-007 采购清单入口需要 recipes
- 背景：plan 只存 recipeId，SPEC 的 shoppingList 算法需要汇总克数
- 决策：`buildShoppingList(plan, pantry, ingredients, recipes, days)`
- 理由：不把整份食谱写入 persist，清单现算
- 影响文件：`src/domain/shoppingList.ts`

## D-008 食谱详情拆成服务端包装 + 客户端组件
- 背景：SPEC 要求页面 `"use client"`，但静态导出的 `[id]` 需要 `generateStaticParams`
- 决策：`recipes/[id]/page.tsx` 保持服务端并 export `generateStaticParams`；交互放 `RecipeDetail.tsx`
- 理由：客户端组件不能带 generateStaticParams
- 影响文件：`src/app/recipes/[id]/page.tsx`，`src/app/recipes/[id]/RecipeDetail.tsx`

## D-009 themeColor 放在 viewport export
- 背景：Next.js 16 不再把 `themeColor` 放 Metadata
- 决策：`export const viewport = { themeColor: "#059669", ... }`
- 理由：跟当前框架 API
- 影响文件：`src/app/layout.tsx`

## D-010 PWA 图标用本机 Pillow 生成
- 背景：SPEC 要求 192/512 纯色圆角 AM 图标，白名单无图像库
- 决策：一次性用系统已有的 Pillow 写出 PNG，不加入 package.json
- 理由：不新增依赖
- 影响文件：`public/icons/icon-192.png`，`public/icons/icon-512.png`

## D-011 `useHasMounted` 用 useSyncExternalStore
- 背景：SPEC 要求未挂载时骨架、挂载后再读 persist；`useEffect + setState` 会被 Next 16 的 `react-hooks/set-state-in-effect` 判为错误
- 决策：`useSyncExternalStore(subscribe, () => true, () => false)`
- 理由：这是 React 官方的 hydration 判定写法，不改产品行为
- 影响文件：`src/hooks/useHasMounted.ts`

## D-013 layout 不用生成的 LayoutProps
- 背景：`LayoutProps<"/">` 依赖 `.next/types`，在未先 build 时 tsc/eslint 可能报找不到
- 决策：写成 `{ children: ReactNode }`
- 理由：静态导出项目里这是最简单的 props 类型
- 影响文件：`src/app/layout.tsx`

## D-014 默认 9 样只改食谱食材 id 引用
- 背景：SPEC 默认 9 样 + 调味品在原库下 0 道早餐、1 道午晚餐；3 天隔日同餐位不重复无解。`eligibleRecipes` 无额外 bug
- 决策：只改食材 id（克数/步骤/per100g 不动）：`oat-yogurt-cup` 的 `mixed-nuts`→`banana`；`microwave-egg-oatmeal` 的 `skim-milk`→`greek-yogurt`；`microwave-chicken-broccoli-box` 的 `corn`→`brown-rice`；`tomato-tofu-egg-soup-rice` 的 `firm-tofu`→`broccoli`、`sesame-oil`→`olive-oil`（第 3 道午晚餐必须有；不用鸡胸替换，避免全库贪心改选后 |kcal| 超 15%）
- 理由：§12 允许结构性最小修正以解锁默认 9 样；不放宽 maxRepeat、隔日不重复、打分或 105%
- 影响文件：`data/recipes.yaml`

## D-015 persist version 升到 2 并回收旧默认篮
- 背景：SPEC §9.4 键名仍是 `aislemeal:v1`，但旧 persist 可能含多出的预勾选 id
- 决策：`version: 2`；migrate 时去掉不在 SPEC 9 项里的 id，缺的 9 项按 SPEC 顺序补上
- 理由：清站点/读旧 13 项/重新建档都回到 SPEC 9 项，且不改 localStorage 键名
- 影响文件：`src/store/useAppStore.ts`

## D-017 减脂按 7700kcal/kg 和周期算缺口
- 背景：本轮产品要求覆盖 SPEC §4「cut 固定 ×0.80、不填目标体重」。maintain/bulk 仍按 SPEC。
- 决策：`KCAL_PER_KG = 7700`；周期单位为周；`dailyDeficit = (当前体重−目标体重)*7700/(周*7)`；蛋白仍按当前体重 2.0 g/kg。缺字段或每周减重 >1.5kg 的非法目标，领域层回退 ×0.80，不静默算出极端缺口。表单层拦住 >1.5kg/周。
- 理由：公式由本轮任务锁死；回退保证旧 T1/T2/下限测试继续绿
- 影响文件：`src/domain/nutrition.ts`，`src/app/onboarding/page.tsx`，`src/store/useAppStore.ts`

## D-018 persist version 升到 3
- 背景：档案新增可选 `targetWeightKg` / `targetWeeks`；键名仍要是 `aislemeal:v1`
- 决策：`version: 3`；旧档案缺新字段原样读取，不迁移补默认减脂目标
- 理由：旧 cut 档案继续走 ×0.80；新用户建档必须填齐
- 影响文件：`src/store/useAppStore.ts`

## D-019 1 天不可行时 hint 不说减少天数
- 背景：只选微波炉 + 默认 9 样 + 1 天因 `maxRepeat = min(3, days)` 不可解；hint 却写「请减少天数」
- 决策：不放宽 maxRepeat。`days <= 1` 时改说增加厨具或添加食材；多天仍可提示减少天数
- 理由：SPEC 写死 maxRepeat；D-014 明确不放宽。1 天已是下限，叫用户再减没有出口
- 影响文件：`src/domain/basketFeedback.ts`，`src/domain/basketFeedback.test.ts`

## D-020 燕麦酸奶能量杯对齐步骤并合并重复香蕉
- 背景：D-014 把 `mixed-nuts` 换成 `banana` 后步骤仍写混合坚果，且两行同 id 让跟做页 `key={item.id}` 撞车
- 决策：两行香蕉 80+15 合并为 95g（总量不变，不恢复 mixed-nuts）；步骤去掉混合坚果；跟做列表 key 改为 `id-index`
- 理由：恢复坚果会让默认 9 样再次没有早餐。合并比保留重复 id 更干净
- 影响文件：`data/recipes.yaml`，`src/generated/recipes.json`，`src/app/cook/page.tsx`，`src/domain/data.test.ts`

## D-021 同日同食材微调行合并
- 背景：贪心可连续加两份乳清蛋白粉，排餐/跟做显示两行一模一样的 30g
- 决策：`applyMicroAdjust` 末尾用 `collapseMicroAdjust` 按 day+ingredientId 合并克数和「补 Ng」文案
- 理由：SPEC 允许同一标准份多次；合并只改展示/汇总，购物清单总量不变
- 影响文件：`src/domain/planner.ts`，`src/domain/planner.test.ts`

## D-022 提供 /favicon.ico
- 背景：Chrome 自动请求 `/favicon.ico` 404；192/512 PNG 和 manifest 已有
- 决策：把现有 `icon-192.png` 拷到 `public/favicon.ico`，layout metadata 指向它
- 理由：不新增依赖；静态导出和 dev 都从 public 提供
- 影响文件：`public/favicon.ico`，`src/app/layout.tsx`

## D-023 取消花样硬限制，允许连吃
- 背景：用户验收时同一篮买 1 天能确认、买 7 天不能；明确说天天吃一样是自由
- 决策：去掉 `maxRepeat` 与隔日同餐位不重复。可行性只看每个餐位是否至少 1 道能做的菜。取代 D-014/D-019「不放宽 maxRepeat」
- 理由：装篮只表达种类，天数只影响采购克数
- 影响文件：`src/domain/planner.ts`，`src/domain/basketFeedback.ts`，`docs/SPEC.md` §5.2/§11.1

## D-024 「换一道」改为点选列表
- 背景：SPEC 原写成循环；不是菜少做不到
- 决策：底部列表展示 `alternativesFor`，点选后 `replaceMeal`。0 候选则「没有可换的菜」
- 理由：用户要求看得见、点得中
- 影响文件：`src/app/plan/page.tsx`

## D-025 营养条颜色不放宽
- 背景：用户看到换一道后脂肪/碳水仍橙，怀疑条不变色
- 决策：颜色仍按目标 90%–110%（`barTone`）。诊断：换一道会改 `dailyActual`；脂肪/碳水仍橙是因为比例在带外，不是条卡死
- 理由：用户说合理就绿、不够就橙；若数字在动且仍偏离目标，不要为了变绿改规则
- 影响文件：`src/components/MacroBars.tsx`
- **0.4 视觉推翻（门闩不变）：** `barTone` / `displayTone` 改为 ok/warn/danger 三档。ok 当且仅当 `inTargetBand`（仍 90–110%）。warn = 75–90% 或 110–125%；其余 danger。脂肪/碳水标「参考」，**不**进 `nutritionGate`，**不**刷成全绿。66% 脂肪 = danger。见 D-033 同期。

## D-026 0.2 曾用单店货架快照（0.6 作废）
- 背景：0.2 需要对齐一家店的名称/包装做试用
- 决策（当时）：采集单店 SKU，同类才改名/包装；对不上的条目 fail-close 保持原 id
- 理由：禁止编造 SKU
- **0.6：** 采集文件与店址已删除。可得性改为用户勾选通用食材库。本条地址、poi、API 路径作废，不得写回仓库
- 影响文件：`data/ingredients.json`，`src/generated/ingredients.json`

## D-027 烹饪原料按 hint 收成一条，纯饮料不进库（0.6 仍有效，采集层作废）
- 背景：同类多 SKU 勾几百行不可用；纯饮料不能当正餐
- 决策：每个可烹饪 hint 收成一条。跳过汽水啤酒白酒葡萄酒饮品。纯牛奶/意面/嫩豆腐用新 id，不顶原 53 条。原 53 条 `per100g` 不动
- 理由：货架可用性，不是堆 SKU
- **0.6：** 不再对照任何店铺捕获；名称改为通用名
- 影响文件：`data/ingredients.json`，`src/domain/data.test.ts`

## D-028 健康推荐是领域纯函数
- 背景：选菜只能自己勾，难配出能做的健康餐
- 决策：`recommendHealthyMeals(recipes, ingredients, profile, basketIds)` 返回已可做 / 再勾就能做（最多缺 3 样非调味）。排序看蛋白密度、午晚餐蔬菜、加工肉名惩罚。装篮和食谱库都展示
- 理由：可单测、不写死文案、不改 persist
- 影响文件：`src/domain/recommend.ts`，`src/components/HealthyRecommend.tsx`，`src/app/basket/page.tsx`，`src/app/recipes/page.tsx`

## D-029 教学视频用 B 站搜索 URL
- 背景：跟做步骤太简，用户要能跳教学视频；搜索做得到则禁止删 `/cook`
- 决策：`cookingVideoSearchUrl(菜名)` → `https://search.bilibili.com/all?keyword=` 编码后的「菜名 做法」。跟做页和食谱详情用 `<a target="_blank">`。不内嵌 BV、不打美团
- 理由：零运行时网络、无版权视频文件
- 影响文件：`src/domain/cookVideo.ts`，`src/components/CookingVideoLink.tsx`，`src/app/cook/page.tsx`，`src/app/recipes/[id]/RecipeDetail.tsx`

## D-030 装篮短名、调味折叠、主网格过滤
- 背景：192 条货架全名+55 调味铺开会选不动；调味对可行性本就可免勾
- 决策：UI 用 `shortName`，货架 `name` 仍保留在数据和第二行。调味默认折叠。非原 53 且零菜谱的条目退出主网格，搜索仍能找到全库。
- 理由：不改货架原文验收，也不删覆盖测试需要的 hint 条目
- 影响文件：`src/domain/displayName.ts`，`src/domain/basketGrid.ts`，`src/app/basket/page.tsx`

## D-031 一键健康篮用 createMealPlan 约束
- 背景：用户不知道勾什么才能配成一周
- 决策：`suggestHealthyBasket` 从当前已勾补齐，排除 fail-close 11 和加工肉名，直到 1 天可行则 7 天也可行
- 理由：复用已有可行性，不另写一套排餐
- 影响文件：`src/domain/recommend.ts`，`src/components/HealthyRecommend.tsx`

## D-032 0.3 主路径改为先选菜
- 背景：Phase 1 主路径仍是先装篮再看能做什么；老大 0.3 brief 要求倒置。PLAN 原文「食材驱动为主」与 brief 冲突
- 决策：SPEC §8 改为灵感加入本周 → 当时的静态目录过滤 → 排出餐单 → 热量+蛋白 90–110% 再生成具名清单。篮子降为 `scopeMode=basket` 辅助。仓库 `0.3.0` ≠ PLAN 旧 V0.3 社区化。公式 §4–7 不动
- 理由：老大 brief 已定，不再作为待问项
- 影响文件：`docs/SPEC.md`，`docs/PLAN.md`，`.agent/DECISIONS.md`

## D-033 备餐餐位方案 C + 单槽 fold 预算成 reserve
- 背景：档案不能说「我不备早餐 / 单位吃午饭」；永远 fold 会把单位午饭吞进晚餐；单槽 fold 成全日 2040 时家常菜过不了硬门闩
- 决策：每顿可选不吃（fold）或在外面吃（reserve）。默认早餐不吃、午餐在外、晚餐不吃。fold 只在 enabled≥2 时重正化 remaining=全日。单槽未备槽一律按 reserve 预算（Chip 可仍写不吃）；awayKcal 缺省或 0 → 该槽默认 `round(full.kcal × 原占比)`。剩余宏量按热量比例切全日目标，不对 remaining 套 KCAL_FLOOR。`computeTarget` 不读餐位。
- 理由：两种真实任务不折叠；一盘菜到不了全天热量；T1 晚餐 remaining=714/49 才能过门闩
- 影响文件：`src/domain/types.ts`，`src/domain/nutrition.ts`，`src/domain/planner.ts`，`src/app/onboarding/page.tsx`

## D-034 0.4 可丢掉 16 条具名非烹饪 SKU 及其 capture hint
- 背景：目录里有烘焙/零食 SKU（低筋粉、蛋挞皮等）不是做饭；未引用 60 条多数是八角/老抽/猪蹄——仍是烹饪
- 决策：只删冻结的 16 个 ingredient id + 菜谱 `egg-tart-yogurt`（祖父锁 121→120 唯一例外）。capture hint 白名单 `RETIRED_HINTS_0_4` 允许零库存。不准批量删未引用调味。53 `per100g` 锁不动。
- 理由：对上「极少数不对劲」，不是清未引用
- 影响文件：`data/ingredients.json`，`data/recipes.yaml`，`src/domain/originalRecipeIds.lock.json`，`src/domain/data.test.ts`

## D-035 馄饨 allergen 标蛋（未化验，加工面点 fail-close）
- 背景：`wonton.allergens` 只有 gluten；蛋过敏用户仍看到泡泡小馄饨「可做」
- 决策：改为 `["gluten","egg"]`，不改 per100g。SKU 未化验，按加工面点 fail-close
- 理由：过敏过滤只读该数组；标蛋后 `recipeAllowedByProfile` 即可挡住
- 影响文件：`data/ingredients.json`，`src/generated/ingredients.json`

## D-036 篮清洗不升 persist version
- 背景：默认 9 样含蛋/酸奶/燕麦；建档过敏后货架仍预勾
- 决策：`sanitizeBasket` 在 `setProfile` 与 persist merge（有档案时）去掉过敏、忌口。0.6 不再按店内目录/fail-close 洗掉燕麦酸奶。手勾过敏原允许，reload 再洗。键名仍 `aislemeal:v1`；货架升 v8 见 D-044
- 理由：不升 v8；读档即洗旧脏默认
- 影响文件：`src/domain/basketSanitize.ts`，`src/store/useAppStore.ts`，`src/store/persistMigrate.ts`

## D-037 门闩出口用 planRepair，不改 nutritionGate
- 背景：热量蛋白 90–110% 硬门闩挡住买菜；角色 2 已证明店内目录+换花样能过
- 决策：`repairPlanToGate` 换失败天的菜（优先 wanted / 已在餐单，禁止鸡爪）。`applyMicroAdjust` 高低带对齐 `TARGET_BAND` 0.90/1.10。UI「一键调到能买」+「改用店内目录并换花样重排」。生成按钮仍 `disabled={!gate.ok}`，不恢复「仍要生成」
- 理由：门闩源码冻结；改出口不改阈值
- 影响文件：`src/domain/planRepair.ts`，`src/domain/planner.ts`，`src/app/plan/page.tsx`

## D-038 纯牛奶按 200ml 盒买，大包装只警告
- 背景：`whole-milk` pack 3200/箱，3 天吐司买 16 盒；大米 5kg、坚果 450g 是真规格
- 决策：牛奶 `pack.size` 200、`label` 盒、名称去掉整箱。不改 `Math.ceil`。`isBulkyPack`（surplus/need≥3 或 packGrams≥5×need）提示「最小包装比用量大很多，家里有可去掉」。鸡蛋 `pack.label` 改为「盒(20枚)」与短名一致
- 理由：0.2 允许包装对齐；不编散装 SKU
- 影响文件：`data/ingredients.json`，`scripts/build-data.mjs`，`src/domain/shoppingList.ts`，`src/app/shopping/page.tsx`

## D-042 GitHub Pages 配置曾写入（已被 D-043 撤回发布）
- 背景：Grok 误以为「继续做」= 公开发布
- 决策（当时）：`GITHUB_PAGES=1` 才 `basePath=/AisleMeal`；CI 曾 `deploy-pages`。manifest 相对路径
- 理由：本地 dev 必须仍是 `/`
- 影响文件：`next.config.ts`，`src/app/layout.tsx`，`public/manifest.webmanifest`（CI 发布步骤已按 D-043 删掉）

## D-043 未经授权的公网发布已撤回；开源须口头下令
- 背景：曾在未授权时尝试公开仓和 Pages
- 决策：CI 只跑校验，不 deploy。未经口头允许禁止 `git push`、公开 Pages、把含店址的旧 git 历史推上去
- **0.6：** 代码按开源包装准备（MIT、用户货架）。发布当天需要 `gh auth refresh -s workflow`，并用 orphan/新仓快照。本轮未下令则不 push
- 影响文件：`.github/workflows/ci.yml`，`README.md`

## D-044 0.6 persist v8：basketIds 即货架，不新增 shelfIds
- 背景：0.4 把 cookProgress 预留 v8；0.6 占用 v8 做用户货架
- 决策：继续用 `basketIds` 存勾选的内置 id，另加 `customIngredients`。`resolveUniverse(shelfIds, custom)`。v7 `scopeMode!==basket` 迁成常见厨房预勾；basket 模式保留原篮。营养自定义必须近似内置食材；`similarToId` 才解锁菜
- 理由：更小可测；不改 persist 键名 `aislemeal:v1`
- 影响文件：`src/store/useAppStore.ts`，`src/store/persistMigrate.ts`，`src/domain/availability.ts`，`src/app/basket/page.tsx`

## D-040 诚实文案：件数不是价格，目录写采集日
- 背景：无价格却有「少买」语气；静态目录会被当成现货；过敏未化验
- 决策：省事 hint 改「件数少」；配一篮对比改「N 件包装」。0.6 店招改为「我的货架 · 不是超市实时库存」。过敏下加免责。大包装补「不会拆成零售散装」。不引入价格字段、不扩过敏枚举
- 理由：0.5 给人试用先诚实，不做美团/价格/医疗级过敏
- 影响文件：`PlanStyleSelector.tsx`，`RecommendationPreview.tsx`，`StoreSourceBanner.tsx`，`onboarding/page.tsx`，`shopping/page.tsx`

## D-041 忌口按冻结鸡肉品类运行时展开
- 背景：勾鸡胸仍可能排出鸡腿/鸡爪，建档还写着「只排除这一款」
- 决策：`effectiveExcludedIds` 把 `chicken-breast`/`chicken-thigh`/`chicken-feet` 视为一组。`recipeAllowedByProfile`、微调、洗篮都走展开。建档点任一即三个同开同关。不进组：鸡精、蛋。不加猪/牛。persist 仍存 SKU 列表、version 7，旧档案只勾鸡胸读档即挡腿/爪
- 理由：完成定义是勾鸡胸后餐单无鸡腿鸡爪；不升 v8
- 影响文件：`src/domain/exclusionFamily.ts`，`planner.ts`，`basketSanitize.ts`，`onboarding/page.tsx`

## D-039 Q5 只改正不可执行步骤
- 背景：审计证实 `box-firm-brown-*` 微波 6–8 分钟无水得到生米；免开火写「下锅炒」
- 决策：糙米盒改用事先蒸好的熟饭（克数仍按生米 130g，`timeMinutes` 仍 12）。`equipment: []` 的「下锅煮或炒至熟」改为「无需加热，装盘即食」。不正菜名/图/per100g
- 理由：局部推翻 Q5「名实不符不动数据」，只修做不熟/厨具矛盾
- 影响文件：`data/recipes.yaml`

## D-016 「换一道」用含当前菜的打分环
- 背景：SPEC §5.5 `alternativesFor` 排除当前菜，UI 若对这份列表 `findIndex(currentId)` 恒为 -1
- 决策：把当前菜按同一套 §5.2 分数插回列表后再取下一项；当前菜不在环里则取 `[0]`
- 理由：SPEC 未规定 UI 如何把「其余候选」做成环，这是最小实现
- 影响文件：`src/app/plan/page.tsx`
