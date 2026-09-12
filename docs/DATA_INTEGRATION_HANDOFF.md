# Dinner Scout data integration

## Status and work isolation

Implemented in `/Users/kosuke/Desktop/dinner-scout-data`, branch `feat/dinner-scout-data`, based on the existing frontend commit `d33df85`. No frontend component, frontend shared type/service, original backend file, Nosana deployment code, existing `.env`, or other worktree was edited. No merge or deployment. The application is still the existing Next.js app; the only DB is the configured AuraDB.

The saved backend's `pipeline.py`, `server.py`, `normalize.py`, API contract, validation schemas, `daytona_saved.py`, and `graph.py` were read. The existing upload → fixed Python parser → download pattern and fixed parameterized Cypher were adapted into new modules. No Cookpad implementation, sample recipe corpus, secrets, or old screenshot artifacts were copied.

## Entry point

Server-only TypeScript:

```ts
import { collectDinnerData } from './lib/dinner-scout/data/collect';
import { fromPreferences, toSelectionInput } from './lib/dinner-scout/data/adapter';

const result = await collectDinnerData(fromPreferences(preferences, '2026-09-12'), {
  runId: crypto.randomUUID(),
  signal: controller.signal,
  deadline: Date.now() + 180_000,
  reserveMs: 25_000,
  onEvent: event => publishExistingProgress(event),
});
const selectionInput = toSelectionInput(result);
// result.status describes data collection, not completed menu generation.
// Never cast this result to the mock MealPlan. Unknown/review-required remains explicit.
```

The caller owns the absolute deadline in epoch milliseconds. Default is 180 seconds with 25 seconds reserved for later selection/calculation. Daytona is given a shorter work deadline to leave room for owned-sandbox cleanup and Aura. AbortSignal cancels HTTP and sends SIGTERM to the Python bridge. The bridge handles termination in `finally`, deletes only its unique owned sandbox, allows bounded cleanup grace, and records cleanup failure if deletion cannot be verified. A creation whose response was lost is looked up by this run's unique sandbox name; no existing unrelated sandbox is deleted. A five-minute TTL/auto-delete is the final fallback if the process/service becomes unreachable.

Use unique run IDs: collecting into an existing directory is rejected. `resumeAuraFromDaytona(runId)` retries only persistence/search from the original unchanged downloaded output and its hash-verified receipt. It does not scrape, create another sandbox, or run the parser locally. Re-saving an already completed identical run is a no-op; changed hashes are rejected.

## Commands and environment

```sh
cd /Users/kosuke/Desktop/dinner-scout-data
npm ci
# Existing validation environment already has these SDKs. If unavailable, install
# scripts/dinner-data/requirements.txt in your existing backend Python environment.
DINNER_DATA_ENV_FILE=/Users/kosuke/Desktop/daytonahack/.env \
DINNER_DATA_PYTHON=/Users/kosuke/Desktop/daytonahack/.venv/bin/python \
npm run data:collect -- --small
```

Omit `--small` for normal caps: up to 2 pages per store and 14 recipe details. Small verification uses one page per store and three recipe details. Supply `--conditions /absolute/path/conditions.json` to use your input; JSON fields are `budgetYen`, `proteinGoalG`, `kcalGoal`, `allergies`, `dislikes`, `pantry`, `shoppingDate`. Optional CLI `--run-id UUID --deadline EPOCH_MILLISECONDS` is used by the Python adapter.

```sh
DINNER_DATA_ENV_FILE=/Users/kosuke/Desktop/daytonahack/.env \
DINNER_DATA_PYTHON=/Users/kosuke/Desktop/daytonahack/.venv/bin/python \
npx tsx scripts/dinner-data/retry-aura.ts RUN_ID
npm run test:data
npm test
npm run typecheck
npm run build
```

Copy **names/placeholders**, not secrets, from `.env.data.example`. Required: `FIRECRAWL_API_KEY`, `DAYTONA_API_KEY`, `NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD`. Optional existing values: `DAYTONA_API_URL`, `DAYTONA_TARGET`, `NEO4J_DATABASE`. `THEMEALDB_API_KEY` defaults to official test key `1` for this local development use. `DINNER_DATA_ENV_FILE` explicitly reads an existing env file without overriding process environment or rewriting it. `DINNER_DATA_PYTHON` points to the existing interpreter; `DINNER_DATA_RUNS_DIR` defaults to `.data-runs` (gitignored). No `NEXT_PUBLIC_` keys and no Nosana/OpenAI dependency.

The [official TheMealDB API page](https://www.themealdb.com/api.php) permits test key 1 during app development/education, describes `filter.php?i=` and `lookup.php?i=`, and requires supporter access for public app-store release. No plan change or purchase was made. The Firecrawl provider uses the documented [v2 scrape endpoint](https://docs.firecrawl.dev/api-reference/endpoint/scrape) directly with server-side bearer authentication, basic proxy, fresh fetch (`maxAge:0`), and no crawl/search/OCR.

## Existing API integration

The same Next.js app now provides an isolated `/api/data/runs` namespace; the mock UI and existing Python `/api/runs` API remain untouched. These are Node runtime handlers for local execution:

- POST `/api/data/runs` with `{conditions}` → 202 `{runId,status,resultUrl,progressUrl}`.
- GET `/api/data/runs/{id}` → 202 while running; final success/partial/failed result afterward.
- GET `/api/data/runs/{id}/events?after=N` → ordered progress (same polling model as the existing Python API).
- POST `/api/data/runs/{id}/cancel` → 202 cooperative cancellation; cleanup finishes before terminal result.
- One active run per Node process, same-origin localhost requests only. No public authentication was added. Registry is in memory; full results are also saved locally, but API restart recovery is not implemented. No SSE server existed; poll the events endpoint.

For the existing Python API instead, add this call in its owned `backend/pipeline.py` when the primary integrator switches acquisition modes:

```python
import sys
sys.path.insert(0, str(DATA_ROOT / 'scripts/dinner-data'))
from backend_adapter import collect_for_backend

live = collect_for_backend(
    conditions, run_id, emit,
    data_root=DATA_ROOT, deadline=time.time() + 180,
)
# live['candidates'] is from Aura. live['recipes'] retains nullable quantities.
# Pass these to the owned selection stage, or return partial data for review.
```

`backend_adapter.py` invokes the same Node implementation, forwards actual events into the existing emit(stage, status, **details) function, and returns the same result. Cancellation raised by the existing emit callback terminates the child and lets its cleanup run. `toSavedBackendShape` is a TypeScript compatibility adapter for legacy evidence/requirement names, with `exclusionReviewed:false`. The legacy backend's strict `eligible_recipe` rejects unknown time/servings; **do not interpret that as acquisition failure or silently approve unknowns**. The owner should present review-required candidates or update its selection policy under the new requirements.

## Contract, Unknown and provenance

`contracts.ts` is an integration-side nullable wire contract. Existing mock `types.ts` and `service.ts` are untouched. UI must handle a separate partial/data result union. Return fields include stores, deals, recipes, ingredients, Aura candidates/commonIngredients, observations, per-store fetch/parse status, warnings, stage statuses, raw acquisitions, and the Daytona receipt. Unknown price, pack weight, serving count, cooking time, nutrition, and rating remain null. No fabricated quantities, nutrition, ratings, recipe URLs, seven-day plan or claim of three-product success.

- `acquisitionMode:live` means this run's Firecrawl/TheMealDB acquisition, even though the bytes were uploaded to Daytona.
- `acquiredBy` is Firecrawl/TheMealDB; `processedBy:daytona` is independent. Source screenshots are Firecrawl-generated, not Daytona browser captures. Their URLs may expire; origin/fetchedAt is recorded. No screenshot is embedded as UI.
- Existing saved input is modeled as `saved` and retains its original timestamp. The normal collector does **not** auto-fallback to old files. It never relabels them as live.
- Each observation has source URL, fetchedAt, SHA-256 of source response, parse status, run ID and provenance. API key-containing TheMealDB request URLs are not stored; the returned source URL or official API documentation URL is used. The actual recipe source URL is null if absent.
- `fieldEvidence` distinguishes source/estimated/unknown per value. This parser makes no nutritional/portion estimates. Recipe ingredients retain both original name and original measure.
- IDs are `themealdb:ID`; ingredient alias IDs distinguish cuts and preparation qualifiers. Category matches are returned as `broadMatches` and never share a price or nutrition value. Unmapped ingredients are stable hashed IDs and remain review-required.
- Known selected allergens/dislikes exclude candidate recipes. Unknown/compound ingredients and unverified source tags retain `needs_review`; there is no safe-allergen claim. Known cookingMinutes >30 is excluded by fixed Cypher; null remains a candidate with time Unknown. TheMealDB V1 does not provide standard total cooking time/servings/macros/rating; instructions are retained without inferring a total from individual steps.
- Deal extraction uses only explicit text with a recognizable ingredient and currency. A 100g price remains a unit price with `packGrams:null`. Store applicability must be explicit in the same evidence block; otherwise unknown. Undated, expired or store-unconfirmed offers are not current deals. Image-only content does not become OCR products. Store page fetch success and zero extracted products are separate statuses.
- `knownSubtotal` is the sum of known **purchase lines**, not all offered prices from three stores. The collector has no selected quantities yet: known subset = 0, `totalYen:null`, `budgetStatus:unknown`, `nutritionStatus:unknown`. `knownSubtotalBasis` makes this explicit. `summarizeKnownCosts` computes a partial subtotal when the caller later supplies actual pack quantities/prices; unknown lines keep full total null. It never invents packs or scales unknown servings.

Candidates can be `basis:general` when no confirmed current deal matches. Missing ingredients use exact IDs and pantry IDs; no same-store availability/price is assumed for missing items. Every candidate retains allergy review status. Seven candidates are not a completed seven-dinner plan.

## Limits and persistence

Firecrawl: fixed three entry URLs; maximum three in flight, up to two pages/store, same-host explicitly labeled flyer/offer links only. This intentionally skips external flyer hosts whose applicability cannot be safely established. Screenshots are requested for entry pages only. Login/CAPTCHA/restriction responses stop that store. Other stores continue. No access bypass or broad crawling. Screenshot absence does not stop body parsing.

TheMealDB: ingredient text hints, then configured general ingredients if needed, with allergy/dislike filtering; up to four discovery queries, 14 deduplicated details, 20 total HTTP attempts including retries, max three concurrent. Source text hints are not confirmed deal extraction; only Aura can mark a candidate deal-based. Missing source facts do not fail normalization.

HTTP has per-call timeout, global AbortSignal, and at most one retry for transient read/502–504 failures with sufficient time left. Authentication/access/rate-limit failures are not retried. Python SDK work has bounded stage time and signal-based cancellation; cleanup uses a separate bounded grace period. Run artifacts are private local files, never source-controlled. External SDK error text is suppressed; only safe error codes are returned.

Aura uses the configured existing DB. Store/Ingredient nodes are shared, Deal/Recipe observation IDs are run-prefixed. Recipe raw data, all provenance, observations and receipt are preserved in JSON properties. Fixed parameterized Cypher saves the run, stores, ingredients, deals and recipes in one write transaction, marking it complete only at the end. Search only sees completed runs. Deal-free runs still return recipe/store candidate rows; exact/broad matches, missing ingredients and common pairs come from real read transactions. No local array-search fallback is labeled Aura success.

## Verification result and remaining limits

Real run: `a6c1c703-4716-4451-b48f-be436a07ad4f`. See `DATA_INTEGRATION_VERIFICATION.json` for safe evidence.

- Firecrawl: three actual entry pages and three screenshot URLs acquired; no text-confirmed product prices extracted.
- TheMealDB: four discovery requests and three recipe detail requests in the small run; three distinct source IDs retained.
- Daytona: input uploaded, real Linux/Python 3.14.4 normalization and schema validation returned three recipes; input/output hashes verified. One sandbox created, deletion confirmed.
- Aura: initial call exposed misuse of Query inside a managed transaction. Fixed to transaction.run with unit_of_work timeouts, then saved/searched the **same original Daytona output**. Nine recipe/store candidate rows, three distinct recipes, three common-ingredient pairs. No reacquisition or second sandbox was needed.
- Final data status is partial because the small run has only three candidates. All four stages succeeded after the explicit Aura retry. No completed meal plan or Nosana inference is claimed.
- Tests: five Node boundary tests and five Python parser tests, plus the existing six frontend calculation/state tests. Build/typecheck and local HTTP 202/400/403/404, events, terminal empty result and cancel contracts verified without extra paid API calls.

Current information limits: no confirmed current pack prices; no verified servings, cooking times, nutrition or ratings; ingredient mapping is deliberately small; no OCR, automatic saved fallback, global cost optimizer, persistent API restart recovery, or Nosana work. These do not prevent returning fetched/parsed candidates. Frontend Unknown/partial presentation and switching the primary API route remain the UI/primary owner's integration step; the callable function, Node routes and Python adapter are ready.

## Changed files

- `lib/dinner-scout/data/`: contracts, config, providers, HTTP budgets, collector, run registry and adapters.
- `scripts/dinner-data/`: remote parser, Daytona/Aura SDK bridge, shared alias catalog, CLI, Aura retry, Python backend adapter and SDK requirements.
- `app/api/data/runs/**`: local Node API adapters.
- `tests/data/`: important provider/parser/boundary tests.
- `.env.data.example`, `.gitignore`, package scripts/dependencies/lockfile.
- This handoff and the sanitized actual verification JSON.
