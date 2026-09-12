import { readFile, writeFile } from "node:fs/promises";
import { collectDinnerData } from "../../lib/dinner-scout/data/collect";
import {
  DEFAULT_CONDITIONS,
  loadEnvironment,
} from "../../lib/dinner-scout/data/config";
async function main() {
  loadEnvironment();
  const index = process.argv.indexOf("--conditions");
  const conditions =
    index >= 0
      ? JSON.parse(await readFile(process.argv[index + 1], "utf8"))
      : DEFAULT_CONDITIONS;
  const small = process.argv.includes("--small");
  const controller = new AbortController();
  process.on("SIGINT", () => controller.abort());
  process.on("SIGTERM", () => controller.abort());
  const events: unknown[] = [];
  const result = await collectDinnerData(conditions, {
    signal: controller.signal,
    runId: process.argv.includes("--run-id")
      ? process.argv[process.argv.indexOf("--run-id") + 1]
      : undefined,
    deadline: process.argv.includes("--deadline")
      ? Number(process.argv[process.argv.indexOf("--deadline") + 1])
      : undefined,
    maxStorePages: small ? 1 : 2,
    maxRecipeDetails: small ? 3 : 14,
    onEvent: (e) => {
      events.push(e);
      console.log(JSON.stringify(e));
    },
  });
  await writeFile(
    `${process.env.DINNER_DATA_RUNS_DIR || ".data-runs"}/${result.runId}/events.json`,
    JSON.stringify(events, null, 2),
    { mode: 0o600 },
  );
  console.log(
    JSON.stringify(
      {
        runId: result.runId,
        status: result.status,
        stages: result.stages,
        pages: result.acquisitions.pages.length,
        recipes: result.recipes.length,
        deals: result.deals.length,
        auraCandidates: result.candidates.length,
        distinctCandidates: new Set(result.candidates.map((c) => c.recipeId))
          .size,
        cleanup: result.daytonaReceipt?.cleanup,
        warnings: result.warnings,
      },
      null,
      2,
    ),
  );
  if (result.status === "failed") process.exitCode = 1;
}
main().catch(() => {
  console.error(
    "Data collection could not start; check configuration and conditions.",
  );
  process.exitCode = 1;
});
