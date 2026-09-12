# Documentation index

The complete application lives on `main`. Start with the [project README](../README.md) for setup, source modes and verification commands.

## Current application

| Document | Purpose |
| --- | --- |
| [Integrated application](INTEGRATION_HANDOFF.md) | Canonical entry point, integration decisions and remaining limitations |
| [Live data integration](DATA_INTEGRATION_HANDOFF.md) | Live collection contract and commands |
| [Saved-material API](../backend/API_CONTRACT.md) | Python API contract |
| [Nosana operations](../validation/nosana/README.md) | Readiness and inference lifecycle |

## Verification records

These files record specific runs; they are not a claim that tests or external providers have been rerun today.

- [Integrated verification](INTEGRATED_VERIFICATION.json)
- [Live data verification](DATA_INTEGRATION_VERIFICATION.json)
- [Saved-material frontend verification](FRONTEND_INTEGRATION.md)
- [Screenshots](screenshots/)

## Historical implementation and research

These records describe earlier stages. For current setup and behavior, use the current application documents above. Original paths are retained so existing references continue to work.

- [Frontend handoff](FRONTEND_HANDOFF.md)
- [Backend handoff](../BACKEND_HANDOFF.md)
- [Initial implementation plan](../IMPLEMENTATION_HANDOFF.md)
- [Missing materials assessment](../MISSING_MATERIALS.md)
- [Technical validation report](../TECH_VALIDATION_REPORT.md)
- [Workable alternatives](../WORKABLE_ALTERNATIVES.md)
- [Nosana alternative result](../NOSANA_ALTERNATIVE_RESULT.md)
- [Nosana available market result](../NOSANA_AVAILABLE_MARKET_RESULT.md)

## Local worktrees

Use `daytonahack` on `main` for ongoing development. The three `feat/dinner-scout-*` branches preserve implementation and integration history; see the [worktree reconciliation](INTEGRATION_HANDOFF.md#worktree-reconciliation).

At the 2026-09-12 cleanup, `daytonahack/node_modules` was a symlink to `../dinner-scout-frontend/node_modules`. Before removing that worktree, install an independent dependency directory in the main checkout and verify the application. The other worktrees may also hold ignored local environments or runtime artifacts, which a clean Git status does not inventory.
