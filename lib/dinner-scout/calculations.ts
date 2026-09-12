import { deals, ingredients, stores } from "./fixtures";
import type { MealPlan, Nutrition, Recipe, UserPreference } from "./types";
export function validate(p: UserPreference) {
  return (
    ["budget", "protein", "calories"].every(
      (k) => Number.isFinite(p[k as "budget"]) && p[k as "budget"] > 0,
    ) && Number.isInteger(p.budget)
  );
}
export function eligible(r: Recipe, p: UserPreference) {
  return (
    r.minutes <= 30 &&
    r.ingredients.every((x) => {
      const i = ingredients.find((i) => i.id === x.ingredientId);
      return (
        i &&
        !p.dislikes.includes(i.id) &&
        !i.allergens.some((a) => p.allergies.includes(a))
      );
    })
  );
}
export function nutrition(r: Recipe): Nutrition {
  const result: Nutrition = { kcal: 0, protein: 0, fat: 0, carbs: 0 };
  for (const key of Object.keys(result) as (keyof Nutrition)[]) {
    for (const x of r.ingredients) {
      const value = ingredients.find((i) => i.id === x.ingredientId)?.nutrition[
        key
      ];
      if (value == null) {
        result[key] = null;
        break;
      }
      result[key]! += (value * x.grams) / 100;
    }
    if (result[key] != null) result[key] = Math.round(result[key]!);
  }
  return result;
}
export function calculate(
  runId: string,
  selected: Recipe[],
  p: UserPreference,
  revision = 0,
): MealPlan {
  const quantities = new Map<string, number>();
  selected.forEach((r) =>
    r.ingredients.forEach((i) =>
      quantities.set(
        i.ingredientId,
        (quantities.get(i.ingredientId) || 0) + i.grams,
      ),
    ),
  );
  const atHome = [...quantities]
    .filter(([id]) => p.pantry.includes(id))
    .map(([id, grams]) => ({
      ingredient: ingredients.find((i) => i.id === id)!,
      grams,
    }));
  const baskets = stores
    .map((store) => {
      const items = [...quantities]
        .filter(([id]) => !p.pantry.includes(id))
        .map(([id, requiredGrams]) => {
          const product = deals.find(
            (d) => d.storeId === store.id && d.ingredientId === id,
          )!;
          const packs = Math.ceil(requiredGrams / product.packGrams);
          return { product, requiredGrams, packs, cost: packs * product.price };
        });
      return { store, items, total: items.reduce((n, x) => n + x.cost, 0) };
    })
    .sort((a, b) => a.total - b.total);
  const basket = baskets[0];
  const comparisons = deals.filter(
    (d) =>
      d.storeId === "B" &&
      basket.store.id !== "B" &&
      basket.items.some(
        (x) =>
          x.product.ingredientId === d.ingredientId &&
          x.product.packGrams === d.packGrams &&
          x.product.price > d.price,
      ),
  );
  const meals = selected.map((recipe, i) => ({
    day: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i],
    recipe,
    nutrition: nutrition(recipe),
  }));
  return {
    runId,
    revision,
    preferences: p,
    meals,
    shopping: { ...basket, atHome, comparisons },
    proteinMet: meals.filter(
      (m) => m.nutrition.protein !== null && m.nutrition.protein >= p.protein,
    ).length,
    mode: "mock",
  };
}
export function reconcileChecks(
  previous: MealPlan,
  next: MealPlan,
  checked: Record<string, boolean>,
) {
  return Object.fromEntries(
    next.shopping.items.map((x) => [
      x.product.id,
      !!checked[x.product.id] &&
        !!previous.shopping.items.find(
          (o) => o.product.id === x.product.id && o.packs >= x.packs,
        ),
    ]),
  );
}
