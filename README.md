# Dinner Scout

One application for dinner research around Omotesando & Aoyama. The integrated `main` branch contains the frontend, live collection, saved-material backend, Aura queries, and Nosana readiness/inference modules.

## Start everything locally

```sh
npm ci
python3 -m venv .venv
.venv/bin/pip install -r validation/requirements.txt
# Create .env from .env.example only if you do not already have one; fill server credentials.
npm run dev
```

Open http://127.0.0.1:4312. The launcher starts Next.js and the saved-material Python API together. Live acquisition runs inside Next.js; both modes use the same existing AuraDB. If ports are occupied, use `PORT=4314 DINNER_BACKEND_PORT=8788 npm run dev`. Existing Python/env settings can be reused with `DINNER_DATA_PYTHON=/path/to/python DINNER_DATA_ENV_FILE=/path/to/.env npm run dev`.

Choose a source on the preferences screen:

- **Live research** (default): Firecrawl store pages + TheMealDB → real Daytona normalization → Aura candidates. Source/Unknown/partial results and recipe details are visible in the UI.
- **Saved materials**: existing saved-material Python pipeline, source previews, readiness-aware Nosana selection, and existing calculation/Swap when a verified plan is available.
- **Sample demo**: simulated progress, seven sample dinners, details, Swap and shopping checks. Explicitly separate from real acquisition.

Live recipes currently lack verified servings, cooking times and nutrition; text-confirmed prices may be absent. These remain Unknown. Real research completion does not mean a completed seven-day meal plan, verified allergen safety, or successful Nosana inference. No mock plan silently replaces live results.

## Verify

```sh
npm run build
npm run typecheck
npm run test:all
```

`npm run data:collect -- --small` exercises live providers with small limits and writes private `.data-runs/` artifacts. It uses credits and creates/deletes one Daytona sandbox. Tests use isolated fixtures; they do not automatically run paid provider workflows.

## Project map

| Location | Contents |
| --- | --- |
| `app/`, `components/`, `lib/` | Next.js UI, source modes and live data services |
| `backend/` | Saved-material Python API and planning pipeline |
| `scripts/`, `tests/` | Local launcher, collection commands and tests |
| `docs/` | Documentation index, integration records and screenshots |
| `validation/`, `materials/` | Provider validation tools and source materials |

Start with the [documentation index](docs/README.md) for current contracts, verification evidence and historical reports.

## Integration references

- [Unified integration and worktree status](docs/INTEGRATION_HANDOFF.md)
- [Live data contract, commands and actual verification](docs/DATA_INTEGRATION_HANDOFF.md)
- [Existing saved API contract](backend/API_CONTRACT.md)
- [Nosana preparation/readiness](validation/nosana/README.md)

Environment files, dependency directories, runtime state and private acquisition artifacts are ignored by Git. Historical validation reports remain for provenance; this README and `docs/INTEGRATION_HANDOFF.md` describe the current entry point.
