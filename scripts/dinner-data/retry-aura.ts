import { resumeAuraFromDaytona } from "../../lib/dinner-scout/data/collect";
resumeAuraFromDaytona(process.argv[2] || "")
  .then((r) =>
    console.log(
      JSON.stringify(
        {
          runId: r.runId,
          status: r.status,
          stages: r.stages,
          candidates: r.candidates.length,
          distinctCandidates: new Set(r.candidates.map((c) => c.recipeId)).size,
          commonPairs: r.commonIngredients.length,
          cleanup: r.daytonaReceipt?.cleanup,
          warnings: r.warnings,
        },
        null,
        2,
      ),
    ),
  )
  .catch(() => {
    console.error("Aura retry failed. Check run ID and configuration.");
    process.exitCode = 1;
  });
