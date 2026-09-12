# Dinner Scout frontend handoff

## Workspace and startup

- Worktree: `/Users/kosuke/Desktop/dinner-scout-frontend`
- Branch: `feat/dinner-scout-frontend` (orphan branch because the original repository had no initial commit).
- The original workspace's uncommitted backend validation files were not edited, staged, stashed or reset. No merge or deployment performed.
- `npm ci`, then `npm run dev`: http://127.0.0.1:4312
- `npm run build`, `npm run typecheck`, `npm test`.
- Next.js App Router, React, TypeScript, Tailwind v4; React state only. Development build uses `.next-dev`, production build `.next`, so building does not corrupt the running preview.
- PostCSS override uses the patched 8.5.23+ line; dependency audit reports zero vulnerabilities at verification time.

## Implemented

Preferences → simulated per-store research → seven dinners and single-store shopping basket; recipe detail, sample flyer expansion, one-day replacement, shopping checks, preference editing and cancel/retry. Native dialogs have an explicit keyboard focus loop, Escape, focus restoration and accessible titles. Mobile stacks naturally. All prices are integer JPY; recipe quantities and package capacities are grams.

## Files

- `app/page.tsx`, `app/layout.tsx`, `app/globals.css`, `app/icon.svg`: entry, metadata, design tokens, responsive styling.
- `components/dinner-scout/DinnerScout.tsx`: three views, reusable logo/photo/dialog, UI state and service calls.
- `lib/dinner-scout/types.ts`: **provisional frontend contract, not an agreed backend schema**.
- `lib/dinner-scout/service.ts`: service interface and active adapter export.
- `lib/dinner-scout/mock-service.ts`: run lifecycle, isolated subscriptions and timers, sample planner, candidate filtering, revision-checked replacement.
- `lib/dinner-scout/fixtures.ts`: all stores, ingredients, offers, recipes, defaults, filter catalogs. Components do not import fixtures or calculations.
- `lib/dinner-scout/calculations.ts`: summed quantities, pantry exclusions, package rounding, full-store basket comparison, per-serving nutrition, check reconciliation helper.
- `tests/planner.test.ts`: six meaningful tests covering calculations, unknown nutrition, exclusions, budgets, cancellation, saved/failure modes, revisions and alternatives.
- `docs/screenshots/`: observed desktop and mobile screenshots.

## Adapter contract

`getCatalog()` currently returns synchronous static form options/defaults. An HTTP adapter can preload/cache these or change initialization to asynchronous loading.

`startRun(preferences, scenario?) → runId`; `subscribe(runId, listener) → unsubscribe`; `getResult(runId) → MealPlan`; `cancelRun(runId)`; `getAlternatives(runId, dayIndex) → Recipe[]`; `replaceMeal(runId, dayIndex, recipeId, expectedRevision) → MealPlan`.

Replace the `service` export in `service.ts` with an HTTP/SSE adapter implementing this interface. Keep fixture logic server-side in that adapter's implementation context; do not add fixture imports to UI. Agree field names, validation errors, authentication needs, source attribution and schema version with backend before integration. Recipe is a candidate; Meal is an assigned day with calculated nutrition. IDs join ingredients/products/recipes. `runId` isolates executions and `revision` guards swaps. UI also uses generation tokens and a synchronous in-flight lock, so stale responses cannot replace a newer run. A real adapter should validate received payloads and honor AbortSignal/unsubscribe and cancellation server-side.

`mode: mock` is separate from offer `source: sample | saved`. `saved` means sample saved data in this demo; it is not a real historical fetch. Agree live/saved provenance separately for real APIs. No Daytona, Nosana, Neo4j, OpenAI, Cookpad or store API is connected.

## Calculation behavior and limits

Aggregate every recipe's ingredient amounts, omit selected pantry IDs (assumed sufficient quantity), round each product to whole packs, compare full baskets across the fixed stores and recommend the cheapest single store. Optional Store B comparisons use identical package capacities and never alter the basket. Checks never affect price. Product IDs retain checks after a swap except new/increased quantities, which become unchecked and display “Quantity increased”.

Nutrition is sample per-100g raw-weight data, multiplied by actual recipe usage; unknown remains null and displays Unknown. Rice uses dry weight. Protein and calorie inputs affect target reporting. Budget has priority: a bounded greedy replacement pass tries cheaper distinct recipes. It is not a global optimizer. The default plan costs ¥2,718 for these fixtures; this is derived, not hard-coded UI. ¥2,000 gives a ¥1,920 plan; ¥1,500 gives a ¥1,762 plan with explicit over-budget status. A budget below ¥500 or below half the feasible sample basket produces insufficient-candidates guidance instead of inventing seven meals. Fewer than seven distinct eligible recipes also fails explicitly. Swap keeps all other days fixed and can exceed budget; the summary reports this.

All recipes are original demo combinations, not real Cookpad records. Verified Japanese original recipe text, source URL, actual prices/nutrition, shelf life and allergen verification remain integration work. The Japanese recipe action is disabled and no URL is fabricated. Filters operate on explicit ingredient tags; they do not guarantee allergen safety.

## Mock scenarios

Append to the local URL, then press Plan my dinners:

- `?scenario=saved`: Store B fails briefly, then uses sample saved offers.
- `?scenario=all-failed`: all stores fail, no plan.
- `?scenario=insufficient`: not enough candidates.
- `?scenario=no-alternatives`: successful plan, empty Swap choices.
- `?scenario=broken-image`: image fallback on meal rows/details.
- No parameter: normal 9.5-second simulation with staggered store events. This duration is unrelated to real API latency.

Input errors: empty/non-numeric/zero/negative targets or fractional-yen budget. A ¥100 budget and Soy allergy also exercise realistic candidate insufficiency. ¥1,500 exercises over-budget; protein 100 g exercises unmet targets.

## Assets and visual reference

The requested attachments/logo were not accessible in the conversation. Layout follows the supplied textual specification and orange/warm-white tokens. The shared SVG symbol approximates the described magnifying glass, bowl and compass needle; exact supplied-logo fidelity needs the original asset.

`public/dinner-scout/sample-flyer-{A,B,C}.svg` are locally authored fictional flyers with store-matched prices (`sample-flyer.svg` is their base), explicitly labeled sample. Photos are downloaded local illustrative food images, reused across recipes and not photos of verified dishes:

- `chicken.jpg`: https://images.unsplash.com/photo-1547592180-85f173990554
- `salmon.jpg`: https://images.unsplash.com/photo-1467003909585-2f8a72700288
- `tofu.jpg`: https://images.unsplash.com/photo-1511690743698-d9d85f2fbf38

No runtime remote image requests. Replace with licensed, dish-matched images when real recipes arrive.

## Verification

Production build and TypeScript check pass. Six tests pass. Browser verified: all three screens, full default 9.5-second flow, flyer/detail Escape, one-day Swap (¥2,718 → ¥3,116 for the tested candidate), unchanged other six days, shopping check does not reduce total, input persistence after cancel, no completion after cancelling and advancing beyond all scheduled timers, successful fresh retry, all five query scenarios, invalid input, budget/protein/calorie changes, and over-budget messaging.

1440×900: last dinner ends at approximately y=893 with readable 14px meal names and 12px metadata; secondary shopping details continue below. 1536×1024 screenshots also recorded. 390px mobile and 720px-wide equivalent of a zoomed desktop viewport have no horizontal overflow. Actual browser zoom was not exercised; layout was checked at equivalent CSS viewport width. Reduced-motion CSS disables transition effects. No deployment, authentication, payment, national search, map, persistent account data or WebMCP integration is included.
