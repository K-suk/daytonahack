import type { DinnerScoutService } from "./service";
import type { SavedResult } from "./http-service";
import { service as savedService } from "./http-service";
import { STORES } from "./data/public-config";
import type { CollectionResult, DataEvent } from "./data/contracts";
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch("/api/data" + path, {
    ...init,
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    signal: init?.signal || AbortSignal.timeout(15000),
  });
  const value = await r.json();
  if (!r.ok) throw Error(value.error || "Data service unavailable");
  return value as T;
}
export const liveService: DinnerScoutService = {
  getCatalog() {
    const catalog = savedService.getCatalog();
    catalog.stores = STORES;
    catalog.pantry = catalog.pantry.map((i) =>
      i.id === "rice-cooked" ? { ...i, id: "rice-dry", name: "Rice (dry)" } : i,
    );
    catalog.defaults.pantry = catalog.pantry.map((i) => i.id);
    catalog.dislikes = catalog.dislikes.map((i) =>
      i.id === "pork-mixed-cut-raw"
        ? { ...i, id: "pork", name: "Pork" }
        : i.id === "chicken-thigh-skin-unspecified-raw"
          ? { ...i, id: "chicken-thigh-raw" }
          : i,
    );
    catalog.ingredients = [...catalog.pantry, ...catalog.dislikes];
    return catalog;
  },
  async startRun(p) {
    return (
      await request<{ runId: string }>("/runs", {
        method: "POST",
        body: JSON.stringify({
          conditions: {
            budgetYen: p.budget,
            proteinGoalG: p.protein,
            kcalGoal: p.calories,
            pantry: p.pantry,
            allergies: p.allergies,
            dislikes: p.dislikes,
            shoppingDate: new Date().toLocaleDateString("sv-SE", {
              timeZone: "Asia/Tokyo",
            }),
          },
        }),
      })
    ).runId;
  },
  subscribe(id, listener) {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const events: DataEvent[] = [];
    const poll = async () => {
      try {
        const value = await request<{ status: string; events: DataEvent[] }>(
          `/runs/${id}/events?after=${events.at(-1)?.sequence || 0}`,
          { signal: controller.signal },
        );
        if (stopped) return;
        events.push(...value.events);
        listener({
          runId: id,
          tasks: [],
          stage: events.some((e) => e.stage === "aura.queried")
            ? "Planning dinners"
            : events.some((e) => e.stage === "daytona.parsed")
              ? "Matching recipes"
              : "Finding deals",
          status:
            value.status === "running"
              ? "running"
              : value.status === "success"
                ? "complete"
                : value.status === "partial"
                  ? "blocked"
                  : "failed",
          rawEvents: events,
        });
        if (value.status === "running" && !stopped)
          timer = setTimeout(poll, 800);
      } catch (e) {
        if (!stopped)
          listener({
            runId: id,
            tasks: [],
            stage: "Finding deals",
            status: "failed",
            error: (e as Error).message,
            rawEvents: events,
          });
      }
    };
    void poll();
    return () => {
      stopped = true;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  },
  async getSavedResult(id): Promise<SavedResult> {
    const result = await request<CollectionResult>(`/runs/${id}`);
    if (result.runId !== id || !result.stages || !Array.isArray(result.recipes))
      throw Error("Invalid data service response");
    return {
      runId: id,
      status: result.status,
      route: "live",
      rawData: result,
      revision: 0,
      stopReasons: result.warnings,
      mealPlan: null,
    };
  },
  async getResult() {
    throw Error(
      "Live sources return nullable candidates, not a mock meal plan",
    );
  },
  async cancelRun(id) {
    await request(`/runs/${id}/cancel`, { method: "POST", body: "{}" });
  },
  async getAlternatives() {
    throw Error("A verified dinner plan is required before swapping");
  },
  async replaceMeal() {
    throw Error("A verified dinner plan is required before swapping");
  },
};
