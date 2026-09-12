import { z } from "zod";
export const ConditionsSchema = z
  .object({
    budgetYen: z.number().finite().nonnegative(),
    proteinGoalG: z.number().finite().nonnegative(),
    kcalGoal: z.number().finite().nonnegative(),
    allergies: z.array(z.string().min(1)).default([]),
    dislikes: z.array(z.string().min(1)).default([]),
    pantry: z.array(z.string().min(1)).default([]),
    shoppingDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine((value) => {
        const d = new Date(value + "T00:00:00Z");
        return (
          !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
        );
      }),
  })
  .strict();
export type Conditions = z.infer<typeof ConditionsSchema>;
export const StoreSchema = z.object({
  id: z.string(),
  name: z.string(),
  sourceUrl: z.string().url(),
  scopeNames: z.array(z.string()),
});
export const ObservationSchema = z.object({
  runId: z.string(),
  provider: z.enum(["firecrawl", "themealdb"]),
  sourceUrl: z.string().url(),
  fetchedAt: z.string(),
  acquisitionMode: z.enum(["live", "saved"]),
  acquiredBy: z.enum(["firecrawl", "themealdb", "manual"]),
  processedBy: z.literal("daytona"),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  parseStatus: z.enum([
    "parsed",
    "no_products",
    "image_only",
    "blocked",
    "failed",
    "empty",
    "invalid",
  ]),
  storeId: z.string().nullable(),
  screenshot: z
    .object({
      url: z.string().url(),
      acquiredBy: z.literal("firecrawl"),
      sourceUrl: z.string().url(),
      fetchedAt: z.string(),
    })
    .nullable(),
  warnings: z.array(z.string()),
});
const nullableNumber = z.number().finite().nonnegative().nullable();
const basis = z.enum(["source", "estimated", "unknown"]);
export const IngredientSchema = z.object({
  id: z.string(),
  nameJa: z.string().nullable(),
  nameEn: z.string(),
  category: z.string().nullable(),
  mapping: z.enum(["exact", "broad", "unmapped"]),
  allergens: z.array(z.string()),
  allergenReview: z.literal("needs_review"),
});
export const RequirementSchema = z.object({
  ingredientId: z.string(),
  nameRaw: z.string(),
  measureRaw: z.string(),
  raw: z.string(),
  amount: nullableNumber,
  unit: z.string().nullable(),
  grams: nullableNumber,
  mapping: z.enum(["exact", "broad", "unmapped"]),
  category: z.string().nullable(),
  fieldEvidence: z.object({ amount: basis, unit: basis, grams: basis }),
});
export const RecipeSchema = z.object({
  id: z.string().regex(/^themealdb:\d+$/),
  title: z.string().min(1),
  sourceUrl: z.string().url().nullable(),
  image: z.string().url().nullable(),
  instructions: z.string(),
  servings: nullableNumber,
  cookingMinutes: nullableNumber,
  rating: nullableNumber,
  nutrition: z.object({
    kcal: nullableNumber,
    protein: nullableNumber,
    fat: nullableNumber,
    carbs: nullableNumber,
  }),
  requirements: z.array(RequirementSchema).min(1),
  allergens: z.array(z.string()),
  eligibility: z.enum(["needs_review", "excluded"]),
  exclusionReasons: z.array(z.string()),
  fieldEvidence: z.record(basis),
  observation: ObservationSchema,
});
export const DealSchema = z.object({
  id: z.string(),
  storeId: z.string(),
  ingredientId: z.string(),
  productName: z.string(),
  priceYen: nullableNumber,
  priceKind: z.enum(["pack", "unit", "unknown"]),
  quantity: nullableNumber,
  unit: z.string().nullable(),
  packGrams: nullableNumber,
  validFrom: z.string().nullable(),
  validTo: z.string().nullable(),
  comparisonPriceYen: nullableNumber,
  savingsYen: nullableNumber,
  tax: z.enum(["included", "excluded", "unknown"]),
  storeApplicability: z.enum(["confirmed", "unknown"]),
  evidenceText: z.string(),
  fieldEvidence: z.record(basis),
  observation: ObservationSchema,
});
export const ParsedSchema = z.object({
  runId: z.string(),
  inputHash: z.string(),
  processedBy: z.literal("daytona"),
  environment: z.object({
    python: z.string(),
    platform: z.string(),
    parserVersion: z.literal("1"),
  }),
  stores: z.array(StoreSchema),
  deals: z.array(DealSchema),
  recipes: z.array(RecipeSchema),
  ingredients: z.array(IngredientSchema),
  observations: z.array(ObservationSchema),
  warnings: z.array(z.string()),
});
export type ParsedData = z.infer<typeof ParsedSchema>;
export type RawPage = {
  storeId: string;
  sourceUrl: string;
  fetchedAt: string;
  acquisitionMode: "live" | "saved";
  response: Record<string, unknown>;
};
export type RawMeal = {
  sourceUrl: string;
  fetchedAt: string;
  acquisitionMode: "live" | "saved";
  response: Record<string, unknown>;
};
export type DataEvent = {
  runId: string;
  sequence: number;
  stage: string;
  status: "success" | "failed" | "started";
  at: string;
  storeId?: string;
  count?: number;
  code?: string;
};
export type StageStatus = {
  status: "success" | "partial" | "failed" | "not_run";
  code?: string;
};
export type GraphResult = {
  status: "success" | "failed";
  candidates: {
    storeId: string;
    recipeId: string;
    title: string;
    matching: string[];
    broadMatches: string[];
    missing: string[];
    basis: "deals" | "general";
    allergyStatus: "needs_review";
    cookingMinutes: number | null;
  }[];
  commonIngredients: {
    recipeA: string;
    recipeB: string;
    commonIngredients: string[];
  }[];
  code?: string;
};
export type CollectionResult = {
  runId: string;
  status: "success" | "partial" | "failed";
  stores: ParsedData["stores"];
  deals: ParsedData["deals"];
  recipes: ParsedData["recipes"];
  ingredients: ParsedData["ingredients"];
  candidates: GraphResult["candidates"];
  commonIngredients: GraphResult["commonIngredients"];
  observations: ParsedData["observations"];
  warnings: string[];
  stages: Record<"firecrawl" | "themealdb" | "daytona" | "aura", StageStatus>;
  storeResults: {
    storeId: string;
    fetchStatus: "success" | "partial" | "failed" | "not_run";
    pageCount: number;
    parseStatus: string;
    code?: string;
  }[];
  acquisitions: { pages: RawPage[]; meals: RawMeal[] };
  daytonaReceipt: Record<string, unknown> | null;
  knownSubtotal: number;
  knownSubtotalBasis: "priced_purchase_lines_only_no_plan_yet";
  totalYen: null;
  budgetStatus: "unknown";
  nutritionStatus: "unknown";
  mealPlan: null;
  threeProductSuccess: false;
};
