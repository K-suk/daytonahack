import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Budget } from "../../lib/dinner-scout/data/http";
import {
  collectStores,
  collectMeals,
  chooseQueries,
  relatedFlyer,
} from "../../lib/dinner-scout/data/providers";
import { collectDinnerData } from "../../lib/dinner-scout/data/collect";
import { fromPreferences } from "../../lib/dinner-scout/data/adapter";
const conditions = {
  budgetYen: 4000,
  proteinGoalG: 40,
  kcalGoal: 650,
  allergies: [],
  dislikes: [],
  pantry: [],
  shoppingDate: "2026-09-12",
};
const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
test("one store fails, other real response envelopes survive; no second origin is followed", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: string | URL | Request, init?: RequestInit) => {
      const p = JSON.parse(String(init?.body));
      return p.url.includes("seijoishii")
        ? response({}, 403)
        : response({
            success: true,
            data: {
              markdown: "Public store page",
              html: "",
              metadata: { sourceURL: p.url },
            },
          });
    },
  );
  const before = process.env.FIRECRAWL_API_KEY;
  process.env.FIRECRAWL_API_KEY = "test-not-a-real-key";
  try {
    const events: string[] = [];
    const result = await collectStores(
      new Budget(Date.now() + 10000),
      (s, state) => events.push(`${s}:${state}`),
    );
    assert.equal(result.pages.length, 2);
    assert.equal(result.results.filter((x) => x.code).length, 1);
    assert.ok(events.includes("page.fetched:failed"));
    assert.ok(result.pages.every((p) => p.acquisitionMode === "live"));
    assert.equal(
      relatedFlyer(
        { data: { html: '<a href="https://evil.example/flyer">チラシ</a>' } },
        "https://shop.example/a",
      ),
      undefined,
    );
    assert.equal(
      relatedFlyer(
        { data: { html: '<a href="/weekly">今週のチラシ</a>' } },
        "https://shop.example/a",
      ),
      "https://shop.example/weekly",
    );
  } finally {
    if (before === undefined) delete process.env.FIRECRAWL_API_KEY;
    else process.env.FIRECRAWL_API_KEY = before;
  }
});
test("TheMealDB deduplicates IDs, preserves raw measures, obeys detail/request bounds", async (t) => {
  let count = 0,
    active = 0,
    max = 0;
  t.mock.method(globalThis, "fetch", async (url: string | URL | Request) => {
    count++;
    active++;
    max = Math.max(max, active);
    await new Promise((r) => setTimeout(r, 2));
    active--;
    const parsed = new URL(String(url));
    return parsed.pathname.endsWith("filter.php")
      ? response({
          meals: Array.from({ length: 30 }, (_, i) => ({
            idMeal: String(50000 + i),
          })),
        })
      : response({
          meals: [
            {
              idMeal: parsed.searchParams.get("i"),
              strMeal: "Boundary fixture",
              strIngredient1: "Chicken Breast",
              strMeasure1: "a handful",
              strIngredient2: "",
              strMeasure2: "",
              strSource: null,
            },
          ],
        });
  });
  const result = await collectMeals(
    [],
    conditions,
    new Budget(Date.now() + 10000),
    () => {},
  );
  assert.equal(result.meals.length, 14);
  assert.ok(count <= 20);
  assert.ok(max <= 3);
  assert.equal(result.discovery.basis, "general");
  assert.equal(
    (result.meals[0].response.meals as Record<string, unknown>[])[0]
      .strMeasure1,
    "a handful",
  );
  assert.ok(!result.meals[0].sourceUrl.includes("/1/"));
  const queries = chooseQueries([], {
    ...conditions,
    allergies: ["soy"],
    dislikes: ["chicken", "pork"],
  });
  assert.deepEqual(queries.queries, ["broccoli"]);
});
test("cancelled collection returns no fabricated candidates and API failure retains acquisitions", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "dinner-data-test-"));
  const original = { ...process.env };
  process.env.DINNER_DATA_RUNS_DIR = dir;
  process.env.DINNER_DATA_PYTHON = "/does-not-exist/python";
  process.env.FIRECRAWL_API_KEY = "test-not-a-real-key";
  t.mock.method(
    globalThis,
    "fetch",
    async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).includes("firecrawl")) {
        const p = JSON.parse(String(init?.body));
        return response({
          success: true,
          data: {
            markdown: "Store public text",
            metadata: { sourceURL: p.url },
          },
        });
      }
      return response({ meals: null });
    },
  );
  try {
    const result = await collectDinnerData(conditions);
    assert.equal(result.status, "partial");
    assert.equal(result.acquisitions.pages.length, 3);
    assert.equal(result.stages.daytona.status, "failed");
    assert.equal(result.stages.aura.status, "not_run");
    assert.equal(result.totalYen, null);
    assert.equal(result.nutritionStatus, "unknown");
    assert.deepEqual(result.candidates, []);
    const controller = new AbortController();
    controller.abort();
    const cancelled = await collectDinnerData(conditions, {
      signal: controller.signal,
    });
    assert.equal(cancelled.stages.aura.status, "not_run");
    assert.deepEqual(cancelled.recipes, []);
  } finally {
    process.env = original;
    await rm(dir, { recursive: true, force: true });
  }
});
test("frontend adapter retains dry rice semantics and never claims allergy safety", () => {
  const converted = fromPreferences(
    {
      budget: 4000,
      protein: 40,
      calories: 650,
      pantry: ["rice", "soy"],
      allergies: ["Fish"],
      dislikes: ["chicken"],
    },
    "2026-09-12",
  );
  assert.deepEqual(converted.pantry, ["rice-dry", "soy-sauce"]);
  assert.deepEqual(converted.allergies, ["fish"]);
  assert.deepEqual(converted.dislikes, ["chicken"]);
});

test("known subtotal excludes unknown price/quantity without turning total into zero", async () => {
  const { summarizeKnownCosts } = await import(
    "../../lib/dinner-scout/data/adapter"
  );
  assert.deepEqual(
    summarizeKnownCosts([
      { packPriceYen: 200, packs: 2 },
      { packPriceYen: null, packs: 1 },
      { packPriceYen: 98, packs: null },
    ]),
    { knownSubtotal: 400, totalYen: null, unknownLineCount: 2 },
  );
  assert.deepEqual(summarizeKnownCosts([]), {
    knownSubtotal: 0,
    totalYen: null,
    unknownLineCount: 0,
  });
});

test("local browser origin accepts localhost aliases on the same port only", async () => {
  const { localRequest } = await import("../../lib/dinner-scout/data/runs");
  assert.equal(
    localRequest(
      new Request("http://localhost:4314/api/data/runs", {
        headers: { Origin: "http://127.0.0.1:4314" },
      }),
    ),
    true,
  );
  assert.equal(
    localRequest(
      new Request("http://localhost:4314/api/data/runs", {
        headers: { Origin: "http://127.0.0.1:9999" },
      }),
    ),
    false,
  );
  assert.equal(
    localRequest(
      new Request("http://localhost:4314/api/data/runs", {
        headers: { Origin: "https://outside.example" },
      }),
    ),
    false,
  );
});
