import ingredientsFile from "../generated/ingredients.json";
import recipesFile from "../generated/recipes.json";
import { ingredientsFileSchema, recipesFileSchema } from "./schemas";
import type { Ingredient, Recipe } from "./types";

export function loadIngredients(): Ingredient[] {
  return ingredientsFileSchema.parse(ingredientsFile).ingredients;
}

export function loadRecipes(): Recipe[] {
  return recipesFileSchema.parse(recipesFile).recipes;
}

export const ingredients: Ingredient[] = loadIngredients();
export const recipes: Recipe[] = loadRecipes();

export function ingredientsById(
  list: Ingredient[] = ingredients,
): Map<string, Ingredient> {
  return new Map(list.map((item) => [item.id, item]));
}

export function recipesById(list: Recipe[] = recipes): Map<string, Recipe> {
  return new Map(list.map((item) => [item.id, item]));
}
