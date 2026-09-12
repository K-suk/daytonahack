/** Provisional frontend contract. Not an agreed backend schema. All amounts are grams and integer JPY. */
export type Nutrition = {
  kcal: number | null;
  protein: number | null;
  fat: number | null;
  carbs: number | null;
};
export type UserPreference = {
  budget: number;
  protein: number;
  calories: number;
  pantry: string[];
  allergies: string[];
  dislikes: string[];
};
export type Store = { id: string; name: string };
export type Ingredient = {
  id: string;
  name: string;
  unit: "g";
  allergens: string[];
  nutrition: Nutrition;
};
export type ProductDeal = {
  id: string;
  storeId: string;
  ingredientId: string;
  name: string;
  packGrams: number;
  price: number;
  mode: "mock";
  source: "sample" | "saved";
};
export type Recipe = {
  id: string;
  name: string;
  ingredients: { ingredientId: string; grams: number }[];
  minutes: number;
  reason: string;
  image: string;
  source: "demo";
  recipeUrl?: string;
};
export type Meal = { day: string; recipe: Recipe; nutrition: Nutrition };
export type ShoppingItem = {
  product: ProductDeal;
  requiredGrams: number;
  packs: number;
  cost: number;
};
export type ShoppingList = {
  items: ShoppingItem[];
  atHome: { ingredient: Ingredient; grams: number }[];
  total: number;
  store: Store;
  comparisons: ProductDeal[];
};
export type MealPlan = {
  runId: string;
  revision: number;
  preferences: UserPreference;
  meals: Meal[];
  shopping: ShoppingList;
  proteinMet: number;
  mode: "mock";
};
export type AgentTask = {
  store: Store;
  status:
    | "Opening store page"
    | "Checking flyer"
    | "Extracting offers"
    | "Offers collected"
    | "Using saved data"
    | "Failed";
  offers: ProductDeal[];
  preview: string;
};
export type ProgressEvent = {
  runId: string;
  tasks: AgentTask[];
  stage: "Finding deals" | "Matching recipes" | "Planning dinners";
  status: "running" | "complete" | "failed";
  error?: string;
};
export type Scenario =
  | "normal"
  | "saved"
  | "all-failed"
  | "insufficient"
  | "no-alternatives"
  | "broken-image";
export type Catalog = {
  defaults: UserPreference;
  pantry: Ingredient[];
  ingredients: Ingredient[];
  allergies: string[];
  dislikes: Ingredient[];
  stores: Store[];
};
