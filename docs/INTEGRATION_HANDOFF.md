# Canonical integrated application

`main` on GitHub is the complete source entry point. No source worktree needs to be copied into another at runtime. Start the Next.js UI, live collection and existing saved API together with `npm run dev`; credentials/interpreter remain local and are documented in README.

## Worktree reconciliation

| Worktree | Purpose and disposition |
| --- | --- |
| `daytonahack` / `main` | Canonical full application. Backend + frontend + live providers + source-mode UI are combined here. |
| `dinner-scout-integrated` / `feat/dinner-scout-integrated` | Isolated integration and verification checkout. Contains the same integrated source that is published to main. |
| `dinner-scout-data` / `feat/dinner-scout-data` | Historical data-layer implementation, commit `2fad675`; incorporated as `c0aabe2` during integration. |
| `dinner-scout-frontend` / `feat/dinner-scout-frontend` | Historical frontend implementation. The formerly uncommitted centered-header change was already in main `49d7d54`; preserved locally as `5837038`. No pending source change was discarded. |

The latest concurrent main commit `df96400` (saved-material UI connection) was merged before adding live support. Its real API adapter, source previews and existing plan/Swap handling remain available under **Saved materials**. The default **Live research** mode uses Firecrawl/TheMealDB → Daytona → Aura. **Sample demo** retains seven sample dinners and never substitutes for failed real acquisition.

Conflicts resolved: `.gitignore` retained both backend/private artifacts and frontend build ignores; live data packages coexist with saved-backend modules; the source selector chooses the matching catalog/service/results; cooked-rice inventory remains distinct from dry rice; localhost/127.0.0.1 Origin checks now permit the same configured port; Next proxy and Python allowed origins follow the launcher port settings. Header step 2 remains centered.

No old worktree or files were deleted. Old branches are intentional history, not additional deployment targets. Run the complete app from main or the integrated checkout; do not run the historical frontend worktree as the current app. Secrets were loaded from the existing `.env` without copying or overwriting it.

## Runtime verification

Verified URL: http://127.0.0.1:4314 (backend 8788; alternate ports used to avoid the already running sessions).

Actual UI-triggered run `3435ad4f-18ad-4915-aa11-36c5bceeb1e0`:

- Firecrawl: three fetched store pages.
- TheMealDB: fourteen actual recipes.
- Daytona: real Linux/Python normalization and validation; input/output hashes verified; sandbox deleted.
- Aura: forty-two store/recipe candidate rows and seventy-seven common-ingredient pairs.
- Text-confirmed product prices: zero. The UI displays Unknown totals/nutrition and a review-required plan, not fabricated prices or a completed seven-day live plan.

See `INTEGRATED_VERIFICATION.json` and `screenshots/integrated-live-results.png`. Recipe details and Escape were verified; switching to demo still produces seven rows, supports Swap and shopping checks. Production build/typecheck and the frontend, provider, parser, backend and validation suites pass (47 tests total). No new GPU deployment or inference-readiness claim was made.

## Remaining external/data limitations

Nosana readiness/inference code is retained; a verified warm endpoint is still required for real selection. Live source serving counts, total cooking time, nutrition and pack prices may be missing. Source collection success is explicitly separate from seven-day meal-plan completion. These limits are reported, not filled with mocks. Historical saved/Cookpad material support remains optional; new live acquisition uses only TheMealDB.
