import test from "node:test";
import assert from "node:assert/strict";
import {
  calculate,
  eligible,
  nutrition,
  reconcileChecks,
  validate,
} from "../lib/dinner-scout/calculations";
import { catalog, ingredients, recipes } from "../lib/dinner-scout/fixtures";
import { makePlan, service } from "../lib/dinner-scout/mock-service";
const p = catalog.defaults;
test("basket aggregates raw weights, rounds packs and removes pantry items", () => {
  const plan = calculate("test", recipes.slice(0, 7), p);
  const chicken = plan.shopping.items.find(
    (x) => x.product.ingredientId === "chicken",
  )!;
  assert.equal(chicken.requiredGrams, 670);
  assert.equal(chicken.packs, 2);
  assert.equal(chicken.cost, 716);
  assert.ok(
    !plan.shopping.items.some((x) => x.product.ingredientId === "rice"),
  );
  assert.equal(
    plan.shopping.total,
    plan.shopping.items.reduce((a, x) => a + x.cost, 0),
  );
  const noPantry = calculate("test", recipes.slice(0, 7), { ...p, pantry: [] });
  assert.ok(noPantry.shopping.total > plan.shopping.total);
});
test("nutrition is weighted by ingredient quantities and unknown stays unknown", () => {
  assert.equal(nutrition(recipes[0]).protein, 48);
  const old = ingredients[0].nutrition.protein;
  ingredients[0].nutrition.protein = null;
  try {
    assert.equal(nutrition(recipes[0]).protein, null);
  } finally {
    ingredients[0].nutrition.protein = old;
  }
});
test("allergens, exclusions, invalid inputs and insufficient candidates", () => {
  assert.equal(eligible(recipes[0], { ...p, allergies: ["Soy"] }), false);
  assert.equal(eligible(recipes[0], { ...p, dislikes: ["chicken"] }), false);
  for (const budget of [0, -1, NaN, Infinity, 1.5])
    assert.equal(validate({ ...p, budget }), false);
  assert.throws(
    () => makePlan("x", { ...p, budget: 100 }, "normal"),
    /Not enough/,
  );
  assert.throws(
    () => makePlan("x", { ...p, allergies: ["Soy"] }, "normal"),
    /Not enough/,
  );
});
test("budget and protein inputs affect derived plan; swap changes only one day", () => {
  const normal = makePlan("x", p, "normal");
  const high = makePlan("x", { ...p, protein: 100 }, "normal");
  assert.equal(high.proteinMet, 0);
  assert.ok(normal.proteinMet > 0);
  const low = makePlan("x", { ...p, budget: 2000 }, "normal");
  assert.ok(low.shopping.total <= normal.shopping.total);
  const next = calculate(
    "x",
    normal.meals.map((m, i) => (i === 0 ? recipes[11] : m.recipe)),
    p,
    1,
  );
  assert.notEqual(
    next.meals[0].nutrition.protein,
    normal.meals[0].nutrition.protein,
  );
  for (let i = 1; i < 7; i++) assert.deepEqual(normal.meals[i], next.meals[i]);
  const checks = Object.fromEntries(
    normal.shopping.items.map((i) => [i.product.id, true]),
  );
  const increased = calculate(
    "x",
    [...Array(7)].map(() => recipes[11]),
    p,
  );
  const reconciled = reconcileChecks(normal, increased, checks);
  assert.equal(reconciled["A-chicken"], false);
  assert.equal(reconciled["A-mushroom"], false);
  assert.equal(
    normal.shopping.total,
    calculate(
      "x",
      normal.meals.map((m) => m.recipe),
      p,
    ).shopping.total,
  );
});
test("cancellation and unsubscribe prevent stale events across runs", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const first = await service.startRun(p);
  let events = 0;
  service.subscribe(first, () => events++);
  await service.cancelRun(first);
  t.mock.timers.tick(10000);
  assert.equal(events, 1);
  await assert.rejects(() => service.getResult(first));
  const second = await service.startRun(p);
  let latest = "";
  const stop = service.subscribe(second, (e) => (latest = e.runId));
  t.mock.timers.tick(10000);
  assert.equal(latest, second);
  assert.equal((await service.getResult(second)).meals.length, 7);
  stop();
  await service.cancelRun(second);
});
test("failure, saved data, no alternatives and stale replacement revisions", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const failed = await service.startRun(p, "all-failed");
  let status = "";
  service.subscribe(failed, (e) => (status = e.status));
  t.mock.timers.tick(10000);
  assert.equal(status, "failed");
  await assert.rejects(() => service.getResult(failed));
  await service.cancelRun(failed);
  const saved = await service.startRun(p, "saved");
  let source = "";
  service.subscribe(saved, (e) => (source = e.tasks[1].status));
  t.mock.timers.tick(10000);
  assert.equal(source, "Using saved data");
  const before = await service.getResult(saved);
  const alternatives = await service.getAlternatives(saved, 0);
  await service.replaceMeal(saved, 0, alternatives[0].id, before.revision);
  await assert.rejects(
    () => service.replaceMeal(saved, 1, alternatives[1].id, before.revision),
    /changed/,
  );
  await service.cancelRun(saved);
  const empty = await service.startRun(p, "no-alternatives");
  t.mock.timers.tick(10000);
  assert.deepEqual(await service.getAlternatives(empty, 0), []);
  await service.cancelRun(empty);
});
