<p align="center">
  <a href="./README.md"><img src="https://img.shields.io/badge/%E4%B8%AD%E6%96%87-1F4D3A?style=for-the-badge" alt="Chinese README"></a>
  <a href="./README.en.md"><img src="https://img.shields.io/badge/English-0F2E24?style=for-the-badge" alt="English"></a>
</p>

# AisleMeal (货架健餐)

**Open-source healthy meal planner and grocery list generator** for people who cannot (or will not) design a week of meals. Tick the ingredients you already have, pick dishes you actually want, hit calorie and protein targets, then get a named shopping list. Static PWA: **no login, no backend, no prices, no grocery checkout**.

Chinese README: **[中文说明](./README.md)**.

[![License: MIT](https://img.shields.io/badge/License-MIT-1F4D3A.svg)](LICENSE)
[![Node.js 20+](https://img.shields.io/badge/Node.js-20+-339933.svg)](https://nodejs.org/)
[![PWA](https://img.shields.io/badge/PWA-static_export-0F2E24.svg)](docs/SPEC.md)
[![Next.js 16](https://img.shields.io/badge/Next.js-16-000000.svg)](https://nextjs.org/)

## What it is

AisleMeal is a **local-first meal prep** app aimed at Chinese home cooking:

| Stuck on… | What AisleMeal does |
| --- | --- |
| How much should I eat to cut or bulk? | Mifflin-St Jeor style targets from sex, age, height, weight, activity, goal |
| What can I cook with what I have? | Pantry ticks (or “common kitchen” preset) filter ~210 recipes |
| I cannot cook | Each recipe is at most 5 steps; equipment filters rice cooker / air fryer / microwave / stove |
| Shopping never matches the plan | After nutrition gates pass, a **named grocery list** (packs rounded, pantry subtracted) |

It is **not** a supermarket, meal-kit, Meituan cart sync, calorie-tracker SaaS, or medical nutrition product.

**v0.6.0**: ~210 recipes, 205 generic ingredients. All user data stays in browser `localStorage` key `aislemeal:v1`.

## Find this repo when searching for

- Open-source **meal planner** / **meal prep** / **weekly menu** for **Chinese recipes**
- **Grocery list generator** from a meal plan (not a store catalog)
- **Calorie and protein** meal planning with fat/carbs as reference only
- **Pantry-based** recipe filter (cook with what you have)
- Static **PWA**, **no backend**, **no account**, privacy-first diet helper
- Fat-loss / muscle-gain home cooking assistant in Chinese UI

Out of scope: live inventory, prices, login, delivery, web scraping grocery apps.

## Flow

1. **Profile** — body stats, allergens, equipment, which meals you actually cook (skip breakfast or eat lunch out).
2. **My ingredients** — tick your own; optional common-kitchen preset. Seasonings collapsed by default.
3. **Inspiration** — add dishes to this week; default view is “cookable with my ticks”.
4. **Plan** — pick days; seed with wanted dishes; fill remaining slots easy vs variety.
5. **List** — generate shopping list only when daily kcal and protein are within **90–110%** of the remaining (cooked-meal) target.
6. **Cook** — follow the day’s steps.

Four tabs: Today, Plan, Shop, Ideas. Ingredient picking lives under Plan, not a fifth tab.

## Run locally

Node.js **20+**.

```bash
git clone https://github.com/bigu1/AisleMeal.git
cd AisleMeal
npm install
npm run dev
```

Open http://localhost:3000. `predev` / `prebuild` run `node scripts/build-data.mjs`.

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build    # static files in out/
```

CI lint/tests/build only — it does **not** auto-deploy a website.

## Stack

Next.js 16 App Router (`output: 'export'`), TypeScript strict, Tailwind, zustand persist, zod, vitest.

Implementation source of truth: [docs/SPEC.md](docs/SPEC.md). Agent collaboration: [AGENTS.md](AGENTS.md).

## Privacy

No accounts, no telemetry, no analytics. Body stats and plans never leave the device. MIT licensed.

## License

[MIT](LICENSE)
