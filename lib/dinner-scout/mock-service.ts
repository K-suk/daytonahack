import { catalog, deals, recipes, stores } from "./fixtures";
import { calculate, eligible, validate } from "./calculations";
import type { DinnerScoutService } from "./service";
import type {
  MealPlan,
  ProgressEvent,
  Scenario,
  UserPreference,
} from "./types";
type Run = {
  p: UserPreference;
  scenario: Scenario;
  event: ProgressEvent;
  listeners: Set<(e: ProgressEvent) => void>;
  timers: ReturnType<typeof setTimeout>[];
  plan?: MealPlan;
  cancelled: boolean;
};
const runs = new Map<string, Run>();
function get(id: string) {
  const run = runs.get(id);
  if (!run || run.cancelled) throw Error("This run is no longer active.");
  return run;
}
export function makePlan(id: string, p: UserPreference, scenario: Scenario) {
  let candidates = recipes.filter((r) => eligible(r, p));
  if (scenario === "insufficient" || candidates.length < 7)
    throw Error(
      "Not enough matching recipes. Try adjusting your allergies or food preferences.",
    );
  let selected = candidates.slice(0, 7);
  let plan = calculate(id, selected, p); // Greedily reduce the full basket while preserving seven distinct dinners.
  for (let round = 0; round < 7 && plan.shopping.total > p.budget; round++) {
    let best = plan;
    for (let day = 0; day < 7; day++)
      for (const r of candidates.filter(
        (r) => !selected.some((s) => s.id === r.id),
      )) {
        const attempt = calculate(
          id,
          selected.map((old, i) => (i === day ? r : old)),
          p,
        );
        if (attempt.shopping.total < best.shopping.total) best = attempt;
      }
    if (best === plan) break;
    plan = best;
    selected = best.meals.map((m) => m.recipe);
  }
  if (p.budget < 500 || plan.shopping.total > p.budget * 2)
    throw Error(
      "Not enough matching recipes within this budget. Increase your weekly budget to build a realistic seven-dinner plan.",
    );
  if (scenario === "broken-image")
    plan.meals = plan.meals.map((m) => ({
      ...m,
      recipe: { ...m.recipe, image: "/dinner-scout/unavailable.jpg" },
    }));
  return plan;
}
export const service: DinnerScoutService = {
  getCatalog: () => structuredClone(catalog),
  async startRun(p, scenario = "normal") {
    if (!validate(p))
      throw Error("Enter positive numbers and a whole-yen budget.");
    const id = crypto.randomUUID();
    const run: Run = {
      p: structuredClone(p),
      scenario,
      listeners: new Set(),
      timers: [],
      cancelled: false,
      event: {
        runId: id,
        stage: "Finding deals",
        status: "running",
        tasks: stores.map((store) => ({
          store,
          status: "Opening store page",
          offers: [],
          preview: `/dinner-scout/sample-flyer-${store.id}.svg`,
        })),
      },
    };
    runs.set(id, run);
    const schedule = (ms: number, fn: () => void) =>
      run.timers.push(
        setTimeout(() => {
          if (run.cancelled) return;
          fn();
          run.listeners.forEach((l) => l(structuredClone(run.event)));
        }, ms),
      );
    if (scenario === "saved")
      schedule(4500, () => (run.event.tasks[1].status = "Failed"));
    stores.forEach((s, i) => {
      schedule(
        1000 + i * 550,
        () => (run.event.tasks[i].status = "Checking flyer"),
      );
      schedule(
        2700 + i * 650,
        () => (run.event.tasks[i].status = "Extracting offers"),
      );
      schedule(4400 + i * 650, () => {
        const task = run.event.tasks[i];
        task.status =
          scenario === "all-failed"
            ? "Failed"
            : scenario === "saved" && i === 1
              ? "Using saved data"
              : "Offers collected";
        task.offers =
          scenario === "all-failed"
            ? []
            : deals
                .filter(
                  (d) =>
                    d.storeId === s.id &&
                    ["chicken", "tofu", "broccoli"].includes(d.ingredientId),
                )
                .map((d) => ({
                  ...d,
                  source: scenario === "saved" && i === 1 ? "saved" : "sample",
                }));
      });
    });
    schedule(6800, () => (run.event.stage = "Matching recipes"));
    schedule(8200, () => (run.event.stage = "Planning dinners"));
    schedule(9500, () => {
      try {
        if (scenario === "all-failed")
          throw Error(
            "All three sample stores failed. No offers are available. Please try again.",
          );
        run.plan = makePlan(id, p, scenario);
        run.event.status = "complete";
      } catch (e) {
        run.event.status = "failed";
        run.event.error = (e as Error).message;
      }
    });
    return id;
  },
  subscribe(id, listener) {
    const r = get(id);
    r.listeners.add(listener);
    listener(structuredClone(r.event));
    return () => {
      r.listeners.delete(listener);
    };
  },
  async getResult(id) {
    const r = get(id);
    if (!r.plan) throw Error("Your plan is not ready.");
    return structuredClone(r.plan);
  },
  async cancelRun(id) {
    const r = runs.get(id);
    if (r) {
      r.cancelled = true;
      r.timers.forEach(clearTimeout);
      r.listeners.clear();
      runs.delete(id);
    }
  },
  async getAlternatives(id, day) {
    const r = get(id);
    if (!r.plan || !r.plan.meals[day]) throw Error("Dinner not found.");
    return r.scenario === "no-alternatives"
      ? []
      : structuredClone(
          recipes
            .filter(
              (x) =>
                eligible(x, r.p) &&
                !r.plan!.meals.some((m) => m.recipe.id === x.id),
            )
            .slice(0, 3),
        );
  },
  async replaceMeal(id, day, recipeId, revision) {
    const r = get(id);
    if (!r.plan || r.plan.revision !== revision)
      throw Error("Your plan changed. Open Swap again.");
    const alternatives = await this.getAlternatives(id, day);
    const replacement = alternatives.find((x) => x.id === recipeId);
    if (!replacement) throw Error("This alternative is no longer available.");
    if (r.plan.revision !== revision)
      throw Error("Your plan changed. Open Swap again.");
    r.plan = calculate(
      id,
      r.plan.meals.map((m, i) => (i === day ? replacement : m.recipe)),
      r.p,
      revision + 1,
    );
    return structuredClone(r.plan);
  },
};
