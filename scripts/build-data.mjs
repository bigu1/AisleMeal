import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { load as loadYaml } from "js-yaml";
import { z } from "zod";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];

const idSchema = z.string().regex(/^[a-z0-9-]+$/);
const equipmentSchema = z.enum(["ricecooker", "airfryer", "microwave", "stove"]);
const categorySchema = z.enum(["protein", "carb", "veg", "fat", "seasoning"]);
const mealSlotSchema = z.enum(["breakfast", "lunch", "dinner"]);
const allergenSchema = z.enum([
  "egg",
  "milk",
  "peanut",
  "tree_nut",
  "soy",
  "gluten",
  "fish",
  "shellfish",
]);

const macrosSchema = z.object({
  kcal: z.number().min(0),
  protein: z.number().min(0),
  fat: z.number().min(0),
  carb: z.number().min(0),
  fiber: z.number().min(0).optional(),
});

const ingredientSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  category: categorySchema,
  per100g: macrosSchema,
  pack: z.object({
    size: z.number().positive(),
    unit: z.enum(["g", "ml", "个"]),
    label: z.string().min(1),
  }),
  storage: z.object({
    fridgeDays: z.number().min(0),
    freezable: z.boolean(),
  }),
  microAdjust: z.boolean().optional(),
  allergens: z.array(allergenSchema).optional(),
  source: z.string().min(1),
  popularity: z.number().int().min(1),
});

const recipeSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  mealSlots: z.array(mealSlotSchema).min(1),
  equipment: z.array(equipmentSchema),
  timeMinutes: z.number().positive(),
  difficulty: z.union([z.literal(1), z.literal(2)]),
  ingredients: z
    .array(z.object({ id: idSchema, grams: z.number().positive() }))
    .min(1),
  steps: z.array(z.string().min(1)).min(1).max(5),
  tags: z.array(z.string()),
});

function report(prefix, err) {
  if (err instanceof z.ZodError) {
    for (const issue of err.issues) {
      errors.push(`${prefix}: ${issue.path.join(".") || "(root)"} — ${issue.message}`);
    }
    return;
  }
  errors.push(`${prefix}: ${err instanceof Error ? err.message : String(err)}`);
}

const ingredientsRaw = JSON.parse(
  readFileSync(join(root, "data/ingredients.json"), "utf8"),
);
const recipesRaw = loadYaml(
  readFileSync(join(root, "data/recipes.yaml"), "utf8"),
);

let ingredients = [];
let recipes = [];

try {
  const parsed = z
    .object({ ingredients: z.array(z.unknown()) })
    .passthrough()
    .parse(ingredientsRaw);
  parsed.ingredients.forEach((item, i) => {
    const r = ingredientSchema.safeParse(item);
    if (!r.success) report(`ingredients[${i}]`, r.error);
    else ingredients.push(r.data);
  });
} catch (err) {
  report("ingredients.json", err);
}

try {
  const parsed = z.object({ recipes: z.array(z.unknown()) }).parse(recipesRaw);
  parsed.recipes.forEach((item, i) => {
    const r = recipeSchema.safeParse(item);
    if (!r.success) report(`recipes[${i}]`, r.error);
    else recipes.push(r.data);
  });
} catch (err) {
  report("recipes.yaml", err);
}

const ingredientIds = new Set(ingredients.map((i) => i.id));
for (const recipe of recipes) {
  for (const ing of recipe.ingredients) {
    if (!ingredientIds.has(ing.id)) {
      errors.push(`引用完整性: 食谱 ${recipe.id} 引用了不存在的食材 ${ing.id}`);
    }
  }
  for (const eq of recipe.equipment) {
    if (!["ricecooker", "airfryer", "microwave", "stove"].includes(eq)) {
      errors.push(`厨具键非法: 食谱 ${recipe.id} 使用了 ${eq}`);
    }
  }
}

const SLOT_MIN = { breakfast: 40, lunch: 80, dinner: 80 };
for (const slot of ["breakfast", "lunch", "dinner"]) {
  const count = recipes.filter((r) => r.mealSlots.includes(slot)).length;
  if (count < SLOT_MIN[slot]) {
    errors.push(`餐位覆盖: ${slot} 仅 ${count} 道，至少需要 ${SLOT_MIN[slot]} 道`);
  }
}

if (errors.length > 0) {
  console.error("数据校验失败：");
  for (const line of errors) console.error(`- ${line}`);
  process.exit(1);
}

const outDir = join(root, "src/generated");
mkdirSync(outDir, { recursive: true });
writeFileSync(
  join(outDir, "ingredients.json"),
  `${JSON.stringify({ ingredients }, null, 2)}\n`,
);
writeFileSync(
  join(outDir, "recipes.json"),
  `${JSON.stringify({ recipes }, null, 2)}\n`,
);

const catalogIdList = ingredients.map((item) => item.id);
writeFileSync(
  join(outDir, "catalog-ids.json"),
  `${JSON.stringify(catalogIdList, null, 2)}\n`,
);

console.log(
  `build-data: ${ingredients.length} 食材, ${recipes.length} 食谱 → src/generated/`,
);
