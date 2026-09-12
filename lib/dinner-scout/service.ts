import type {
  Catalog,
  MealPlan,
  ProgressEvent,
  Recipe,
  Scenario,
  UserPreference,
} from "./types";
export interface DinnerScoutService {
  getCatalog(): Catalog;
  startRun(p: UserPreference, scenario?: Scenario): Promise<string>;
  subscribe(
    runId: string,
    listener: (event: ProgressEvent) => void,
  ): () => void;
  getResult(runId: string): Promise<MealPlan>;
  cancelRun(runId: string): Promise<void>;
  getAlternatives(runId: string, day: number): Promise<Recipe[]>;
  replaceMeal(
    runId: string,
    day: number,
    recipeId: string,
    revision: number,
  ): Promise<MealPlan>;
}
export { service } from "./mock-service";
