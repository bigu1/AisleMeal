import { z } from "zod";

const idSchema = z.string().regex(/^[a-z0-9-]+$/);

export const sexSchema = z.enum(["male", "female"]);
export const activityLevelSchema = z.enum([
  "sedentary",
  "light",
  "moderate",
  "active",
  "very_active",
]);
export const goalSchema = z.enum(["cut", "bulk", "maintain"]);
export const equipmentSchema = z.enum([
  "ricecooker",
  "airfryer",
  "microwave",
  "stove",
]);
export const categorySchema = z.enum([
  "protein",
  "carb",
  "veg",
  "fat",
  "seasoning",
]);
export const mealSlotSchema = z.enum(["breakfast", "lunch", "dinner"]);
export const allergenSchema = z.enum([
  "egg",
  "milk",
  "peanut",
  "tree_nut",
  "soy",
  "gluten",
  "fish",
  "shellfish",
]);

export const macrosSchema = z.object({
  kcal: z.number().min(0),
  protein: z.number().min(0),
  fat: z.number().min(0),
  carb: z.number().min(0),
  fiber: z.number().min(0).optional(),
});

export const ingredientSchema = z.object({
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

export const recipeIngredientSchema = z.object({
  id: idSchema,
  grams: z.number().positive(),
});

export const recipeSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  mealSlots: z.array(mealSlotSchema).min(1),
  equipment: z.array(equipmentSchema),
  timeMinutes: z.number().positive(),
  difficulty: z.union([z.literal(1), z.literal(2)]),
  ingredients: z.array(recipeIngredientSchema).min(1),
  steps: z.array(z.string().min(1)).min(1).max(5),
  tags: z.array(z.string()),
});

export const ingredientsFileSchema = z
  .object({
    ingredients: z.array(ingredientSchema).min(1),
  })
  .passthrough();

export const recipesFileSchema = z.object({
  recipes: z.array(recipeSchema).min(1),
});
