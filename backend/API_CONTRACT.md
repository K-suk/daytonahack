# Saved materials API v1

Base: `http://127.0.0.1:8787`. Start: `.venv/bin/python backend/server.py` from repository root. Frontend worktree remains unedited. Its service interface and `docs/FRONTEND_HANDOFF.md` were read. Frontend port 4312 is allowed by CORS.

| Request | Response |
|---|---|
| GET /api/health | 200: status, mode=saved, nosana connection status |
| GET /api/documents | 200: manifest records, extraction support, Source preview URL |
| GET /api/documents/{documentId}/preview | Registered file only. HTML/JSON served as text/plain; sandbox CSP and nosniff. Image/PDF source preview; never live screenshots |
| POST /api/runs | JSON `{conditions,days}` → 202 `{runId,status,progressUrl,resultUrl}`; active run →409 |
| GET /api/runs/{runId} | run state |
| GET /api/runs/{runId}/events?after=0 | `{runId,status,events}` ordered by sequence; poll every ~1s |
| GET /api/runs/{runId}/result | running →202; terminal →200, including blocked partial result |
| POST /api/runs/{runId}/cancel | Cooperative cancellation: waits for current external call and cleanup |
| GET /api/runs/{runId}/alternatives | Imported eligible recipes not already selected; no mealPlan →409 |
| POST /api/runs/{runId}/swap | `{day,recipeId,revision}`; day is **zero-based**. Full recalculation, increment revision. Unavailable plan/candidate or stale revision →409 |

`conditions`: budgetYen, proteinGoalG, kcalGoal, pantry ingredient IDs, allergies enum, dislikes enum, shoppingDate ISO date. The frontend budget/protein/calories fields need a service adapter rename. Frontend dry rice fixture ID must not be directly treated as rice-cooked. `days` is1–7; normal use7. No mock scenario parameter. Input schema: `start.schema.json`.

Result keys: runId, status (`complete|blocked|failed|cancelled|interrupted`), route=saved, liveFetchSuccess=false, conditions, requestedDays, documents, stores, deals, recipes, ingredients, originalExtractedRecipes, originalExtractedDeals, supplements, measurements, foods, graph `{candidates,commonIngredients,...}`, eligibility, missingMaterials, nosana, stopReasons, mealPlan nullable, revision. Three-product live success remains false and is no longer the accepted MVP target. A successful saved analysis is separate from complete meal planning.

`eligibility[]`: `{recipeId,eligible,issues:[{field,status:unknown|unmet,ingredientId?,raw?,limit?}]}`. Unknown cooking time, servings, ingredient grams, nutrition macros and exclusion review are explicit. Known >30 minutes and selected allergen/dislike matches are unmet. Deal validity is checked for shoppingDate by Aura and accounting. Insufficient source facts do not block import or graph query.

`measurements` stores individual supplemented values as `{value,basis:source|estimated|unknown,sourceUrl?,sourceDocumentId?,reason?}`. Unknown must be null; estimates require a reason and evidence reference. The original extracted values remain separate. `foods` entries are per100g edible-weight quantities, not whole-recipe totals. Source state and ingredient ID must agree.

Events are `{runId,sequence,stage,status,elapsedSeconds?,...details}`. Stage names:

- document.uploaded: bytes successfully uploaded to Daytona.
- document.parsed: Daytona output returned for document; method distinguishes jsonld / confirmed JSON / preview_only.
- deal.validated: confirmed JSON passes Schema; explicitly not image OCR.
- recipe.parsed: validated, normalized imported recipe.
- graph.queried: real Aura candidate, missing and common ingredient queries finished.
- selection.started: configured Nosana call begins with eligible candidates.
- selection.validated: actual model output passed JSON and candidate ID validation.
- calculation.completed: deterministic calculation finished, including successful Swap.
- run.blocked / run.failed / run.complete / run.cancelled: terminal event.

Display copy: “Analyzing saved store materials”, “Reading saved recipes”, “Matching ingredients”, “Planning dinners”. `document.parsed` with preview_only means registered material without automatic structuring, not extracted offers. Sources retain their original obtainedAt; upload events have this run's elapsed time.

Frontend integration requires a union for partial results instead of casting to mock MealPlan; nullable prices, grams and minutes; provenance labels; disabling Swap when mealPlan=null. No mock fallback. getCatalog remains a frontend integration task: use validated real IDs/Conditions enums, not fixture foods or stores.

Current real sample returns blocked with 3 Aura candidates, `no_eligible_candidates` and `nosana_endpoint_not_ready`. Completed plan calculation and Swap code paths are tested with explicitly synthetic unit fixtures, not claimed as real seven-day success. The existing inference module is isolated in nosana.py and validation/inference.py. Set the real endpoint locally and restart API after a verified warm service becomes available.

Limits: local-only single active run, no public authentication, cooperative cancellation, SDK timeouts but no hard90s process watchdog, no actual second-store like-for-like comparison with current data. A completed result may be over budget: budgetStatus is explicit; a bounded two-pass replacement reduces cost where possible and does not guarantee a global optimum. Nutritional targets are reported rather than promised.

## Nosana readinessの更新

URL設定のみではreadyにしない。未設定unconnected、未検証configured_unverified、初回準備中warming、初回＋通常推論検証済みready。readyは設定fingerprintと5分TTLに結び付き、推論失敗／停止で解除。アプリ内では初回ロードを待たない。明示的なprepare手順はvalidation/nosana/README.md。GET /api/healthのnosana.statusで確認する。
