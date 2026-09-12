/** Optional boundary adapters. Existing UI/mock types and saved pipeline are untouched. */
import type { UserPreference } from "../types";
import type { CollectionResult, Conditions } from "./contracts";
const pantryIds: Record<string, string> = {
  rice: "rice-dry",
  soy: "soy-sauce",
};
const dislikeIds: Record<string, string> = {
  chicken: "chicken",
  pork: "pork",
  salmon: "salmon-raw",
  broccoli: "broccoli-raw",
  cabbage: "cabbage",
  mushroom: "mushroom",
  noodles: "noodles",
};
export function fromPreferences(
  p: UserPreference,
  shoppingDate: string,
): Conditions {
  return {
    budgetYen: p.budget,
    proteinGoalG: p.protein,
    kcalGoal: p.calories,
    allergies: p.allergies.map((x) => x.toLowerCase()),
    dislikes: p.dislikes.map((x) => dislikeIds[x] || x),
    pantry: p.pantry.map((x) => pantryIds[x] || x),
    shoppingDate,
  };
}
export function toSelectionInput(result: CollectionResult) {
  return {
    runId: result.runId,
    candidates: result.candidates,
    commonIngredients: result.commonIngredients,
    recipes: result.recipes,
    stores: result.stores,
    deals: result.deals,
    unknownPolicy: "review_required" as const,
    mealPlan: null,
    status: result.status,
  };
}
/** Shape expected by backend/planning.py; new facts remain nullable/unreviewed. */
export function toSavedBackendShape(result: CollectionResult) {
  return {
    runId: result.runId,
    stores: result.stores,
    ingredients: result.ingredients.map((i) => ({
      ...i,
      nameJa: i.nameJa || i.nameEn,
    })),
    deals: result.deals.map((d) => ({
      ...d,
      evidence: {
        route: d.observation.acquisitionMode,
        basis: "source",
        sourceUrl: d.observation.sourceUrl,
        fetchedAt: d.observation.fetchedAt,
        environment: "daytona",
      },
    })),
    recipes: result.recipes.map((r) => ({
      ...r,
      evidence: {
        route: r.observation.acquisitionMode,
        basis: "source",
        sourceUrl: r.sourceUrl || r.observation.sourceUrl,
        fetchedAt: r.observation.fetchedAt,
        environment: "daytona",
      },
      exclusionReviewed: false,
      requirements: r.requirements.map((q) => ({
        ...q,
        nameJa: q.nameRaw,
        conversionSource: q.grams === null ? null : r.observation.sourceUrl,
      })),
    })),
    graph: {
      candidates: result.candidates,
      commonIngredients: result.commonIngredients,
    },
    mealPlan: null,
    measurements: [],
    foods: [],
    supplements: [],
    documents: [],
    status: result.status,
  };
}

/** Feed only actual selected purchase quantities, never inferred packs or unit-price weights. */
export function summarizeKnownCosts(
  lines: { packPriceYen: number | null; packs: number | null }[],
) {
  const valid = (n: number | null) =>
    n !== null && Number.isFinite(n) && n >= 0;
  const priced = lines.filter(
    (l) => valid(l.packPriceYen) && valid(l.packs) && Number.isInteger(l.packs),
  );
  const knownSubtotal = priced.reduce(
    (sum, l) => sum + l.packPriceYen! * l.packs!,
    0,
  );
  return {
    knownSubtotal,
    totalYen:
      lines.length > 0 && priced.length === lines.length ? knownSubtotal : null,
    unknownLineCount: lines.length - priced.length,
  };
}
