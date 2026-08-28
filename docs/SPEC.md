# AisleMeal V0.1 实施规格书（SPEC）

> **给执行编码的 AI**：本文档是你的唯一任务来源，按顺序读完再动手。产品决策、公式参数、数据数值都已定死，**不要自行更改**。遇到本文档没覆盖的实现细节，选择最简单的方案并记录到 `docs/DECISIONS.md`。背景与愿景见 `docs/PLAN.md`（如与本文冲突，以本文为准）。

---

## 0. 任务概述与完成定义

实现 AisleMeal：一个纯前端 PWA。0.6 主路径仍是**先选想吃的菜**，再用用户在「我的食材」勾选的过滤能做的，按档案「备哪几顿」排出餐单，每天热量+蛋白相对**备餐剩余目标**落在 90–110% 后再生成具名采购清单。篮子/我的食材是辅助入口，**不加第五栏**（仍从餐单进 `/basket`）。

0.4 相对 0.3：档案可选备早餐/午餐/晚餐（方案 C：未备槽「不吃」fold 或「在外面吃」reserve；单槽 fold 预算成 reserve，不把两顿并进一盘）；营养条三档 ok/warn/danger（脂肪碳水标参考，不进门闩）；`/plan` 露出天数；生成清单**硬门闩**（删除「仍要生成清单」）；底栏选中浅底 pill（`--color-accent` 代币保留，Tab 铬不用）；目录具名删 16 条非烹饪 SKU + `egg-tart-yogurt`；persist version 7（当时 cookProgress 预留 v8）。`computeTarget` 不读餐位开关；三槽全开 ≡ 0.3 T1/T2/T3。

0.5：诚实可用补丁。省事说件数不是价格；过敏免责（未化验、酱料未逐道拆、芝麻未列入）；大包装声明不拆零售。忌口 `chicken-breast`/`chicken-thigh`/`chicken-feet` 运行时展开。

0.6：去掉单店货架快照与位置采集。通用食材库 + 用户勾选（persist v8：`basketIds` 即已选食材，`customIngredients` 自定义）。新用户默认空篮，自己勾或点「常见厨房预勾」。今天页不挂「不是超市实时库存」。仓库 semver `0.6.0`。公开仓 https://github.com/bigu1/AisleMeal 只用 orphan 快照，不把含旧店址的 git 链推上去。CI 只校验，不自动部署。

**完成定义（全部满足才算完成）**：

1. §11 的所有单元测试通过（`npm test`）；
2. `npm run build` 静态导出成功，无类型错误、无 lint 错误；
3. §11.2 人工验收清单每项可走通；
4. 所有自行决策已记录在 `docs/DECISIONS.md`；
5. **在你的最终交付说明末尾，原文输出这句话**：
   > 老大，V0.1 已按 SPEC 完成。请回到规划会话，让规划 AI 按 SPEC §11 验收清单逐项验收，重点抽查营养计算测试用例、排餐可行性和数据完整性。

**明确不做（写了算越界）**：实时库存、价格与预算、登录/账号、任何后端或 API 路由、美团/外卖抓取或购物车、数据分析埋点、社区贡献流程、多语言、批量加菜、批量删未引用调味、改 53 条 `per100g`、改 persist 键名、第五栏、cookProgress 实现、把含旧店址的 git 全历史推到 GitHub。仓库 semver `0.6.0` **不是** `docs/PLAN.md` 旧「V0.3 美团链接+社区化」。

---

## 1. 技术栈与初始化

| 项 | 定稿 |
|---|---|
| 框架 | Next.js（App Router）+ TypeScript（`strict: true`） |
| 样式 | Tailwind CSS，不引入组件库（antd/mui/chakra 禁止），图标只可用 `lucide-react` |
| 状态 | `zustand` + `persist` 中间件（localStorage） |
| 校验 | `zod` |
| 数据格式 | 仓库内 `data/ingredients.json` + `data/recipes.yaml`（已提供，见 §9） |
| YAML 解析 | `js-yaml`，仅在构建前脚本中使用（见 §9.3），运行时不解析 YAML |
| 测试 | `vitest`（领域逻辑必测，组件测试不强制） |
| 部署形态 | `output: 'export'` 纯静态导出 + PWA manifest；`images.unoptimized: true` |
| 包管理 | npm |

初始化命令（供参考，选项按此配置）：

```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --use-npm --no-import-alias
npm i zustand zod lucide-react
npm i -D js-yaml @types/js-yaml vitest @vitejs/plugin-react jsdom @testing-library/react
```

**依赖白名单** = 上面这些。要加白名单以外的依赖，必须在 `DECISIONS.md` 写明理由。

所有页面组件顶部加 `"use client"`（本项目无服务端逻辑）。zustand persist 在静态导出下有 hydration 问题：统一用一个 `useHasMounted()` hook，未挂载时渲染骨架占位，挂载后再读 store。

---

## 2. 目录结构（精确遵守）

```
src/
  app/
    layout.tsx              # 全局布局：底部导航（篮子/餐单/清单/开做）
    page.tsx                # 首页：无档案→引导去 /onboarding；有→显示目标卡片和当前进度入口
    onboarding/page.tsx     # 建档向导（4 步）
    basket/page.tsx         # 模式 A：食材篮 + 实时反馈
    recipes/page.tsx        # 模式 B：食谱库浏览
    recipes/[id]/page.tsx   # 食谱详情（generateStaticParams 遍历全部食谱）
    plan/page.tsx           # 排餐预览
    shopping/page.tsx       # 采购清单
    cook/page.tsx           # 跟做视图
  domain/                   # 纯 TS 领域逻辑，禁止 import 任何 react/next 内容
    types.ts
    nutrition.ts
    planner.ts
    basketFeedback.ts
    shoppingList.ts
    data.ts                 # 加载 src/generated/ 数据 + zod 校验入口
    schemas.ts              # zod schema
  generated/                # 构建前脚本产物（进 .gitignore？否——提交，便于 review）
    ingredients.json
    recipes.json
  store/
    useAppStore.ts
  components/               # 复用组件（营养进度条、食谱卡、步骤卡等，命名自定）
scripts/
  build-data.mjs            # data/*.yaml|json → 校验 → src/generated/*.json
data/
  ingredients.json          # 已提供，勿改数值
  recipes.yaml              # 已提供，勿改数值
docs/
  PLAN.md  SPEC.md  DECISIONS.md
public/
  manifest.webmanifest  icons/…
```

---

## 3. 领域类型（`src/domain/types.ts` 定稿）

```ts
export type Sex = "male" | "female";
export type ActivityLevel = "sedentary" | "light" | "moderate" | "active" | "very_active";
export type Goal = "cut" | "bulk" | "maintain";
export type Equipment = "ricecooker" | "airfryer" | "microwave" | "stove";
export type Category = "protein" | "carb" | "veg" | "fat" | "seasoning";
export type MealSlot = "breakfast" | "lunch" | "dinner";
export type Allergen = "egg" | "milk" | "peanut" | "tree_nut" | "soy" | "gluten" | "fish" | "shellfish";

export interface Macros { kcal: number; protein: number; fat: number; carb: number; }

export interface Ingredient {
  id: string;
  name: string;                 // 中文名
  category: Category;
  per100g: Macros & { fiber?: number };   // 生重/购买态每 100g
  pack: { size: number; unit: "g" | "ml" | "个"; label: string }; // 常见超市包装
  storage: { fridgeDays: number; freezable: boolean };
  microAdjust?: boolean;        // 可作"微调件"（即食、无需烹饪）
  allergens?: Allergen[];
  source: string;               // 营养数据出处
}

export interface RecipeIngredient { id: string; grams: number } // 一律生重克数；"个"类食材也用克
export interface Recipe {
  id: string;
  name: string;
  mealSlots: MealSlot[];
  equipment: Equipment[];       // 需要的设备（AND 关系）；空数组 = 无需烹饪
  timeMinutes: number;
  difficulty: 1 | 2;
  ingredients: RecipeIngredient[];  // 调味品也在内，营养一并计算
  steps: string[];              // ≤5 步
  tags: string[];
}

export type SlotAbsencePolicy = "fold" | "reserve";
export interface SlotAbsence {
  policy: SlotAbsencePolicy;
  /** 仅 policy=reserve；缺省 = round(dailyKcal * SLOT_KCAL_RATIO[slot]) */
  awayKcal?: number;
}

export interface UserProfile {
  sex: Sex; age: number; heightCm: number; weightKg: number;
  activity: ActivityLevel; goal: Goal;
  equipment: Equipment[];
  allergens: Allergen[];
  excludedIngredientIds: string[];  // "不吃"清单
  /** 缺省或空 = 三餐全备（0.3 行为） */
  enabledSlots?: MealSlot[];
  /** 只允许出现未备的槽；备上的槽必须删掉 */
  slotAbsences?: Partial<Record<MealSlot, SlotAbsence>>;
}

export interface NutritionTarget extends Macros { perMeal: Record<MealSlot, number> /* kcal 分配 */; clampedToFloor: boolean; }

export interface PantryItem { ingredientId: string; grams: number }

export interface PlannedMeal { day: number /*0-based*/; slot: MealSlot; recipeId: string }
export interface MicroAdjustSuggestion { day: number; ingredientId: string; grams: number; reason: string }
export interface MealPlan {
  days: number;
  meals: PlannedMeal[];
  dailyActual: Macros[];                 // 含微调件后的每日实际值
  microAdjust: MicroAdjustSuggestion[];
  feasible: true;
}
export interface InfeasiblePlan {
  feasible: false;
  reason: "no_recipes_for_slot" | "not_enough_variety";
  blockedSlots: MealSlot[];
  suggestions: { ingredientId: string; unlocksRecipes: number }[]; // top 3
}

export interface ShoppingLine {
  ingredientId: string;
  needGrams: number;        // 扣除存货后
  packs: number;            // 向上取整
  packGrams: number;        // packs * pack.size
  surplusGrams: number;
  storageHint?: string;     // 见 §7
}
```

---

## 4. 营养计算（`nutrition.ts`，参数与顺序定死）

```
BMR（Mifflin-St Jeor）:
  male:   10*W + 6.25*H − 5*A + 5
  female: 10*W + 6.25*H − 5*A − 161
活动系数: sedentary 1.2 | light 1.375 | moderate 1.55 | active 1.725 | very_active 1.9
目标系数: cut 0.80 | maintain 1.00 | bulk 1.10
安全下限: female 1200 kcal, male 1500 kcal（低于则取下限，clampedToFloor=true）
蛋白系数(g/kg): cut 2.0 | bulk 1.8 | maintain 1.4
脂肪: max(0.25*kcal/9, 0.8*W)
碳水: (kcal − 4*protein − 9*fat) / 4，若 < 0 则取 0 并把脂肪重算为 (kcal − 4*protein)/9
```

**取整顺序（必须一致，否则测试过不了）**：① kcal = round(TDEE×目标系数 / 10) × 10，再套安全下限；② protein = round(系数×W)；③ fat = round(max 公式，用取整后的 kcal)；④ carb = round(公式，用取整后的 p、f)。

每餐热量分配（`SLOT_KCAL_RATIO` 原占比）：breakfast 25% / lunch 40% / dinner 35%。`NutritionTarget.perMeal` 仍按原占比。

**`computeTarget(profile)` 禁止读 `enabledSlots` / `slotAbsences`。** 全日公式只由身高体重活动目标计算。三槽全开时 T1/T2/T3 与 0.3 逐字段相同。排餐、微调、门闩走 `planSlotBudget(full, profile)` / `remainingTarget(full, budget)`，不对 remaining 再套 `KCAL_FLOOR`。

备餐餐位（方案 C）：档案勾选「备早餐 / 备午餐 / 备晚餐」（至少一顿）。未备槽选「不吃」（fold）或「在外面吃」（reserve）。默认：取消早餐 → 不吃；取消午餐 → 在外面吃；取消晚餐 → 不吃。

- **fold 且 enabledSlots.length ≥ 2**：不吃的那顿并进剩下的备餐；原占比在 enabled 槽上重正化；remaining = 全日目标（T1 skip breakfast 仍 2040）。
- **reserve**：备的餐只覆盖自己原来的份额；away 默认 `round(dailyKcal * 原占比)`，可改。T1 午餐在外、仍备早+晚：remaining.kcal = **1224**，protein = 140×1224/2040。
- **单槽（enabledSlots.length === 1）**：未备槽预算一律 reserve（Chip 仍可显示「不吃」）。remaining = 该顿原占比。T1 只备晚餐（默认 C，含存储 fold 或 awayKcal=0）→ remaining.kcal = **714**，protein = **49**。**禁止**把两顿 skip 并进一盘。单槽 awayKcal 缺省或 0 → 当作 `round(full.kcal * SLOT_KCAL_RATIO[slot])`，禁止用 0 把 remaining 拼回 1224。`reserve+0 ≡ fold` 仅 `enabledCount ≥ 2`。
- **剩余蛋白/脂肪/碳水 = 已算好的全日目标按热量比例切**：`remaining = full * (remainingKcal / full.kcal)`。不按 remaining kcal 重跑 `PROTEIN_PER_KG`、不重跑脂肪 leftover、不对 remaining 再套 `KCAL_FLOOR`（1224 不得夹回 1500）。

营养条显示（只改 UI，不改门闩）：`displayTone` 的 ok **当且仅当** `inTargetBand`（共用 `TARGET_BAND` 90–110%）。75–90% 或 110–125% 为 warn；其余 danger。脂肪/碳水标签写「参考」，不进 `nutritionGate`。

**测试期望值（写进单测，必须逐位相等）**：

| 用例 | 输入 | kcal | protein | fat | carb |
|---|---|---|---|---|---|
| T1 | male, 30岁, 175cm, 70kg, moderate, cut | 2040 | 140 | 57 | 242 |
| T2 | female, 28岁, 162cm, 55kg, light, cut | 1390 | 110 | 44 | 139 |
| T3 | male, 25岁, 180cm, 75kg, sedentary, maintain | 2110 | 105 | 60 | 288 |

（T2、T3 均触发脂肪下限 0.8g/kg；三例均不触发热量安全下限。）

输入合法范围（onboarding 表单校验）：年龄 14–80（<18 显示"本工具不面向未成年人营养需求，结果仅供参考"警告但允许继续）、身高 130–220、体重 35–200。

食谱营养计算：`recipeMacros(recipe) = Σ ingredient.per100g × grams / 100`，不四舍五入，展示时再 round。

---

## 5. 排餐求解器（`planner.ts`）

### 5.1 候选过滤 `eligibleRecipes(recipes, profile, basketIds?)`

食谱可用当且仅当：① `basketIds` 提供时（模式 A），食谱所有食材 id ⊆ basketIds；② 食谱所有食材的 `allergens` 与 profile.allergens 无交集；③ 食谱食材不含 excludedIngredientIds；④ `recipe.equipment ⊆ profile.equipment`（空数组恒可用）。

**注意**：`seasoning` 类食材（盐、生抽等）**不参与** ① 的篮子包含判断（默认视为可获得），但参与采购清单（§7）。

### 5.2 贪心排餐 `buildPlan(candidates, target, days)`

调用方仍传 `computeTarget` 全日 target；内部 `planSlotBudget(full, ctx.profile)`。**只循环 `enabledSlotsOf(profile)`**。disabled 槽空池不是 infeasible。`scoreRecipe(recipe, slotTarget: Macros, …)` 四分母走 `safeDivisor`（n<1 则 1）。槽目标用 `slotTargetsFromBudget`，禁止对全日 target 调 `slotTargets(full, slot)` 来打分。`applyMicroAdjust` 瞄准 remainingTarget 的 0.95/1.05，禁止再拿全日 2040 去补在外缺口。

```
enabled = enabledSlotsOf(profile)
for day in 0..days-1:
  for slot in enabled:
    pool = candidates 中 mealSlots 含 slot 的食谱
    if pool 为空 → 返回 InfeasiblePlan（blockedSlots 记录该 slot）
    为 pool 中每个食谱打分，选分数最小者:
      score = |m.kcal − slotKcal| / safeDivisor(slotKcal)
            + |m.protein − slotProtein| / safeDivisor(slotProtein)
            + 0.5 * (|m.fat − slotFat| / safeDivisor(slotFat) + |m.carb − slotCarb| / safeDivisor(slotCarb))
            + perishPenalty
      其中 slotX 来自 slotTargetsFromBudget（≥2 槽 fold 时按 enabled 重正化 × remaining/full；单槽用原占比）
      perishPenalty = 0.3，当 day ≥ floor(days/2) 且该食谱含易腐食材
                      (fridgeDays ≤ 3 且 freezable=false)，否则 0
```

天数只影响采购克数，不影响能否确认。允许同一道菜连吃、允许相邻两天同一餐位相同。1 天能确认则 2–7 天也能确认（只要每个餐位至少 1 道能做的菜）。

同分时取食谱 id 字典序小者（保证确定性，便于测试）。

### 5.3 微调件 `applyMicroAdjust(plan, target)`

调用方仍可传全日 target；函数内部用 `remainingTarget(full, planSlotBudget(full, ctx.profile))` 作 0.95/1.05 帽。对每一天：若 `日实际蛋白 < 剩余目标 × 0.95` 或 `日实际热量 < 剩余目标 × 0.95`，从 `microAdjust=true` 且未被过敏/排除的食材中贪心补足（每次加入一个标准份：见 §9 数据中 pack 无关，标准份定为 `greek-yogurt 100g / skim-milk 250g / whey-protein 30g / banana 80g / mixed-nuts 15g / wholewheat-bread 40g / canned-tuna 60g`），直到两项都 ≥95% 或该日微调件 ≥3 个。超出剩余目标 105% 的一侧不再添加。标准份表写成 `planner.ts` 内的常量。午餐 reserve 后不得把日热量补到全日 2040。

### 5.4 无解建议 `suggestAdditions(allRecipes, profile, basketIds)`

遍历不在篮中的非 seasoning 食材，计算"加入该食材后新增解锁的食谱数"，返回 top 3（同数则 id 字典序）。

### 5.5 换一道 `alternativesFor(plan, day, slot)`

返回该餐位按 §5.2 打分排序的其余候选（排除当前），供 UI「换一道」点选列表使用；替换后需重算 dailyActual 与微调件。

---

## 6. 篮子实时反馈（`basketFeedback.ts`）

输入 basket（食材 id 集合）、profile、days。输出：

```ts
interface BasketFeedback {
  cookableCount: number;                       // eligibleRecipes(模式A) 数量
  bySlot: Record<MealSlot, number>;            // 各餐位可做食谱数
  planPreview: MealPlan | InfeasiblePlan;      // 直接调 planner 试排
  hint?: string;                               // 见下
}
```

hint 规则：不可行时 → "还差 X 餐位没菜可做，建议添加：{suggestions 前 3 个食材名}"；可行但某餐位候选 < days → "早餐花样偏少，可能连续重复"。数据规模小（30 食谱），每次勾选同步全量重算即可，无需优化。

---

## 7. 采购清单（`shoppingList.ts`）

1. 汇总 plan 内所有食谱（含重复次数）+ 微调件的食材克数；
2. 扣存货：`needGrams = max(0, total − pantry)`；为 0 的不出现在清单；
3. `packs = ceil(needGrams / pack.size)`，`surplusGrams = packs*size − needGrams`；
4. storageHint：食材 `fridgeDays < days` 时——`freezable` → `"买回当天分装冷冻"`；否则 → `"第 {fridgeDays} 天前吃完"`；
5. 分组输出：protein / carb / veg / fat 四组 + seasoning 单独一组，标题"调味品（家里有就不用买）"；
6. UI 显示格式：`鸡胸肉 ×3盒（900g，实际需 750g，富余 150g）`。

---

## 8. 页面规格

通用：移动优先（设计基准宽 375px），Leaf & Yuzu，全局底部 **四栏** Tab（今天 `/` · 餐单 `/plan` · 买菜 `/shopping` · 灵感 `/recipes`）。`/cook` 保留、不进 Tab。`/basket` 仍算餐单 Tab。`/onboarding` 隐藏底栏。文案全部中文。persist 键名仍 `aislemeal:v1`。`--color-accent` **代币保留**（`RecipeCard` / `PlanStyleSelector` 仍用），**Tab 铬不用**（选中 = 浅底 pill + semibold + brand，无柚子 2px 顶条）。

**主路径（0.6）**：建档勾选「备哪几顿」→ 「我的食材」自己勾选（可常见厨房预勾）→ 灵感「加入本周」→ 用已选食材过滤能做的菜 → 餐单页选天数、只铺 enabled 槽、其余省事/换花样补 → 每天热量+蛋白相对**备餐剩余目标** 90–110%（营养硬门闩）→ **显式**生成具名采购清单。无「仍要生成清单」。无餐单时去选菜。生成清单是单独动作，不是排出后自动跳买菜。排出不被营养禁用。

| 页面 | 核心内容与交互 |
|---|---|
| `/` 今天 | 无档案：「开始建档」→ `/onboarding`。有档案：只列出 enabled 槽、营养折叠（备餐实际 + 在外估计 vs **全日**目标，caption 标「估计」）、同行「档案」→ `/onboarding?edit=1`。主 CTA：无可行餐单 → `/recipes`「去选菜」；可行餐单且无活跃清单 → `/plan`「去餐单生成清单」；活跃清单非调味未勾完 → `/shopping`「去买菜」；已买完（非调味全勾，或清单空因为 pantry 扣光）→ `/cook?day={planDayIndex}&slot={firstEnabledSlot}`「去做{第一顿}」。次要「改我的食材」→ `/basket`。不挂库存免责横幅。重新建档需 confirm。 |
| `/onboarding` | 建档向导仍 5 步：①性别年龄身高体重 ②活动水平与目标 ③过敏/不吃 ④厨具 ⑤估算结果 + **备哪几顿**（Chip「备早餐/备午餐/备晚餐」，不能取消最后一枚；未勾选槽 radiogroup「不吃\|在外面吃」；在外才显示 kcal 框；单槽 min=该槽默认 away）。过敏下免责：按常见配方标，未化验；酱料未逐道拆；芝麻未列入；不是医疗建议。忌口勾 `chicken-breast`/`chicken-thigh`/`chicken-feet` 任一口即排除整组（`effectiveExcludedIds`，persist 仍 SKU 列表）。draft 必须含 `enabledSlots`/`slotAbsences`。餐位变更只 `resetPlan`，永不 `recomputeMicro`。新用户完成 → `/recipes`。`?edit=1` 且已有档案：预填、标题「编辑档案」、保存回 `/`，不 `resetAll`。无档案时 `?edit=1` 当新向导。禁止在未备槽写死 25/40/35。 |
| `/plan` 餐单 | 有档案时**禁止**无 plan 整页早退。骨架：scopeMode 开关（按店内目录 / 只用本周货架）+ 排餐偏好 + wanted chips + **DaysPicker（备几天，紧贴排出按钮上方）** +「用这几道排出 {days} 天」（`days` 用 store，默认 3；排出**绝不**因 nutritionGate 禁用）。无 wanted 也可排出（走当前 universe 的 easy/variety）。可行餐单：只渲染 enabled 槽、换一道、营养条对照 **remainingTarget**。`feasible && !gate.ok` 时警告块（不是按钮）：热量或蛋白还没落在备餐目标 90%–110%；`gate.reasons` 各一行；可以换一道·改档案·改天数；脂肪和碳水是参考，不挡住生成。生成主按钮 `disabled={gate != null && !gate.ok}`，文案**只允许**「生成采购清单」或「清单已过期，重新生成」，永不替换成 `gate.reasons`。**删除「仍要生成清单」。** `generateList()` 必须 `if (!gate || !gate.ok) return`。`gate = nutritionGate(feasible, remainingTarget(full, planSlotBudget(full, profile)))`。无任何清单且无 plan 时旁路「去选想吃的」→ `/recipes`。早餐菜在早餐未备时 wanted chip 显示「这顿不备」而不是排失败。 |
| `/shopping` 买菜 | 渲染活跃具名清单快照。无活跃清单时去餐单生成，不要空买菜页装成已买完。勾选按 `ingredientId` 写进该清单。可切换已存清单（至多 8 份，至多一条 active）。无空白「+」。删除「营养未按目标，仅按当前餐单买菜」banner（硬门闩后不可达）。「去做」href 用第一个 enabled 槽。 |
| `/recipes` 灵感 | 挑菜库。默认「只看可做」= 当前 `resolveUniverse`（catalog 或 basket，与餐单同一开关）。卡片：标题/正文 Link，旁边「加入本周」按钮（禁止整卡 Link 里嵌 button）。详情：可做则加入本周/已加入；缺 SKU 则 disabled + 列出缺的；`?replace=` 只保留「只换这一餐」，隐藏加入本周。无大推荐卡。 |
| `/basket` 我的食材 | 标题「我的食材」。新用户默认空篮；「常见厨房预勾」「全不选」；按分类勾选；底栏「其他」自定义（营养近似内置）。天数、帮我配一篮、家里已有（sheet 内可搜索；可新加的只有菜谱引用食材 ∪ 全部调味 ∪ 已在 pantry 的孤儿）。确认仍可按这篮试排。不加第五栏，底栏仍算餐单 Tab。 |
| `/cook` | 按 `?day=&slot=` 跟做：食谱名、时长、厨具、生重克数、步骤、教学视频。微调件为「今日加餐」。 |

空态处理：无档案时各后续页引导去建档（不做路由守卫重定向）。有档案、无 wanted 且无 plan 时餐单页仍画出排出按钮，不要整页 EmptyState。

---

## 9. 数据与构建前脚本

### 9.1 数据文件（已提供）

- `data/ingredients.json`：53 种食材。**营养数值为参考值（来源：中国食物成分表/USDA 常见值，发布前需人工校对，此事不归你管）**，你只负责原样消费，不得修改数值。
- `data/recipes.yaml`：30 道食谱，每道 = 完整一餐（含主食），份量固定 1 人份不缩放。

### 9.2 zod schema（`schemas.ts`）

按 §3 类型逐字段建 schema，额外规则：`steps` 长度 1–5；`grams > 0`；`per100g` 各项 ≥ 0；`recipe.ingredients` 至少 1 项；id 格式 `/^[a-z0-9-]+$/`。

### 9.3 构建前脚本 `scripts/build-data.mjs`

`npm run predev` / `prebuild` 自动执行：读取 `data/`，zod 校验，检查**引用完整性**（食谱食材 id 必须存在于食材库）、**餐位覆盖**（早餐至少 40 道、午/晚餐各至少 80 道）、**厨具键合法**；生成 `src/generated/ingredients.json`、`recipes.json`、`catalog-ids.json`（YAML 只在此处解析）。不读店铺采集文件。校验失败 → 非零退出并打印明细。

### 9.4 持久化

zustand persist：`name: "aislemeal:v1"`（键名不改），`version: 7`。存：profile、pantry、basketIds、days、plan、progressStep、planStyle、basketUndo、planStartedOn、scopeMode、wantedRecipeIds、shoppingLists、activeShoppingListId（`PERSIST_FIELD_KEYS` 不增加；餐位字段在 profile 内）。具名清单是快照；`listUndo` 不 persist。v5 的 `shoppingChecked` 迁进活跃清单。空 `enabledSlots` coerce 成三餐全备；非法槽过滤；absences 只留 disabled 槽；≥2 槽 awayKcal 夹 0..full.kcal；单槽 awayKcal 缺省或 0 → 默认份额再夹 1..full。任一 meal 未知 recipeId → **整份 `plan = null`**。清单 items / basketIds / pantry 丢未知 ingredient id。cookProgress **预留 v8，v7 不实现**。`resetAll` 清空全部。

---

## 10. PWA 与部署

`public/manifest.webmanifest`（name: AisleMeal 货架健餐、theme_color `#1F4D3A`、display standalone、`start_url`/`icons` 用相对路径）。不做 Service Worker 离线缓存（V0.1 不要求，别写）。GitHub Actions：push 时跑 `npm run build-data && npm run lint && npm test && npm run build`。**不自动部署**。`next.config.ts` 里 `GITHUB_PAGES=1` 才会 `basePath=/AisleMeal`，未经老大允许不要设、不要 `wrangler pages deploy`。

---

## 11. 测试与验收

### 11.1 单元测试（vitest，全绿才算完成）

- `nutrition.test.ts`：§4 表格 T1/T2/T3 逐字段断言；热量安全下限用例（female, 45岁, 150cm, 40kg, sedentary, cut → kcal=1200, clampedToFloor=true）；T1 skip breakfast 仍备午+晚 remaining.kcal=**2040**；T1 午餐在外 remaining.kcal=**1224**、protein=140×1224/2040；T1 只备晚餐默认 C remaining.kcal=**714** protein=**49**；单槽存储 fold 或 breakfast awayKcal=0 仍 714 不得变 1224；三槽 remaining=full；`displayTone===ok` iff `inTargetBand`；0.75/1.25 warn、0.749/1.251 danger、42/64 danger；不对 remaining 套 KCAL_FLOOR；
- `planner.test.ts`：全库+全厨具+3 天 → feasible，且每日 |实际−目标|kcal ≤ 15%（微调后）；默认 9 样 1 天可行则 7 天也可行；篮子只有 `egg + white-rice` → infeasible 且 suggestions 长度 3；三槽 7 天 easy meals === `HEAD_EASY_7D_MEAL_IDS`；breakfast 池空但 breakfast disabled → feasible；`applyMicroAdjust` 午餐 reserve 后日热量不补到 2040；手搓 1 天 `microwave-chicken-broccoli-box` vs remaining 714/49 → `nutritionGate.ok`（门闩前不 `roundMacros`）；`createMealPlan` T1 catalog 只备晚餐默认 C → `feasible && nutritionGate.ok` **不断言 recipeId**（HEAD easy rank-1 `box-chicken-white-broccoli-44` 785.21 vs 714×1.1=785.4，差 0.19 kcal）；`createMealPlan` T1 catalog `enabledSlots=['lunch','dinner']` 1 天早餐存储 fold → `feasible && nutritionGate.ok` **不断言 recipeId**。禁止断言「dinner-only fold two skips remaining=2040 and gate ok」；
- `nutritionGate.test.ts`：源码不动。remaining=1224 对准 1224 → ok，对准 2040 → 偏高；仅脂肪 66% 仍 ok；
- `persistMigrate.test.ts`：v6 无 enabledSlots → 三餐；`[]` → 三餐；任一未知 recipeId → `plan=null`；源码 `version: 7`；
- `shoppingList.test.ts`：构造含存货扣减、包装取整、富余计算的用例（自行取数写死断言）；storageHint 两分支各 1 例；
- `data.test.ts`：全部数据过 schema；引用完整性；每道食谱 `recipeMacros` 可算出且 kcal ∈ [200, 900]；菜谱数 ∈ [200, 250]；祖父 lock 120 且无 `egg-tart-yogurt`；16 条具名删 id 不存在；53 per100g 仍锁。

### 11.2 人工验收清单（给验收 AI 用，你自测一遍）

1. `npm run build` 成功（静态导出）；2. 完整走通 建档→灵感加入本周→排出→营养门闩→具名清单→跟做；3. 刷新任意页数据不丢；4. 本周货架勾掉蛋白类 → 确认按钮置灰且出现补充建议（辅助入口）；5. 换一道功能生效且营养条随之变化；6. 375px 宽度无横向滚动；7. 过敏原选"虾蟹贝"后所有含虾食谱消失；8. 厨具只选微波炉 → 仍能排出 1–2 天可行餐单或给出明确不可行提示。无餐单时今天/开做去选菜，不要送回装篮。

---

## 12. 实施顺序

1. 脚手架 + 目录 + CI；2. `types.ts` + `schemas.ts` + `build-data.mjs`（先让数据校验跑通，此时若发现数据文件结构性错误：最小修正并记录 DECISIONS，**营养数值不许动**）；3. `nutrition.ts` + 测试；4. `planner.ts` + `basketFeedback.ts` + 测试；5. `shoppingList.ts` + 测试；6. store；7. 页面（onboarding → basket → plan → shopping → cook → recipes → 首页）；8. PWA/部署配置；9. 全流程自测 + 更新 README"运行方式"章节 + 交付说明（末尾带 §0.5 的验收提醒原文）。
