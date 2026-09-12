# Real frontend integration verification

2026-09-12: Playwright clicked “Plan my dinners” on http://127.0.0.1:4312 using the active HTTP adapter.

- POST /api/backend/runs: 202; events and result: 200.
- runId: `462b7064-c399-47d7-9619-ef59b3aae62e`.
- Daytona uploaded five manifest documents and parsed the three saved Cookpad HTML recipes. Confirmed JSON was validated; the flyer image remained preview-only.
- AuraDB returned three store/candidate matches at 24.7 seconds. The UI displayed real prices, unknown package weights, source previews and recipe eligibility issues.
- Terminal status: blocked. Reasons: no_eligible_candidates, nosana_endpoint_not_ready. No mock result was substituted.
- Daytona receipt: cleanup=deleted. No Nosana resources were started.
- npm test: 6 passed; typecheck and production build passed.
- Actual completed meal-plan and Swap remain unverified with real data. Their HTTP actions are wired; incomplete runs do not expose a fake plan.

Start backend with `.venv/bin/python backend/server.py`, then frontend with `npm run dev`. The Next.js same-origin proxy forwards `/api/backend/*` to `http://127.0.0.1:8787/api/*`; credentials remain on the Python side.
