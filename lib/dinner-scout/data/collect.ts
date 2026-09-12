import { randomUUID, createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { spawn } from "node:child_process";
import {
  ConditionsSchema,
  ParsedSchema,
  type Conditions,
  type CollectionResult,
  type DataEvent,
  type GraphResult,
} from "./contracts";
import { loadEnvironment, STORES } from "./config";
import { Budget, DataError, errorCode } from "./http";
import { collectStores, collectMeals } from "./providers";
export type CollectOptions = {
  runId?: string;
  signal?: AbortSignal;
  deadline?: number;
  reserveMs?: number;
  onEvent?: (event: DataEvent) => void;
  maxStorePages?: number;
  maxRecipeDetails?: number;
};
function redact(value: unknown): unknown {
  if (typeof value === "string") {
    for (const name of [
      "FIRECRAWL_API_KEY",
      "THEMEALDB_API_KEY",
      "DAYTONA_API_KEY",
      "NEO4J_PASSWORD",
    ]) {
      const key = process.env[name];
      if (key && key.length >= 8)
        value = (value as string).split(key).join("[redacted]");
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, redact(v)]),
    );
  return value;
}
async function save(path: string, value: unknown) {
  await writeFile(path, JSON.stringify(redact(value), null, 2), {
    mode: 0o600,
  });
}
async function bridge(
  mode: "daytona" | "aura",
  input: string,
  output: string,
  deadline: number,
  budget: Budget,
) {
  budget.check(1000);
  const python = process.env.DINNER_DATA_PYTHON || "python3";
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) =>
        ["PATH", "HOME", "TMPDIR", "SSL_CERT_FILE", "SSL_CERT_DIR"].includes(
          key,
        ) ||
        key.startsWith("DAYTONA_") ||
        key.startsWith("NEO4J_"),
    ),
  );
  await new Promise<void>((done, reject) => {
    const child = spawn(
      python,
      [
        resolve("scripts/dinner-data/bridge.py"),
        mode,
        input,
        output,
        String(deadline / 1000),
      ],
      {
        env: { ...env, NODE_ENV: process.env.NODE_ENV || "development" },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stopped = false;
    let kill: ReturnType<typeof setTimeout> | undefined;
    const abort = () => {
      if (stopped) return;
      stopped = true;
      child.kill("SIGTERM");
      kill = setTimeout(() => child.kill("SIGKILL"), 28000);
    };
    const timer = setTimeout(abort, Math.max(1, deadline - Date.now() + 1000));
    budget.signal.addEventListener("abort", abort, { once: true });
    if (budget.signal.aborted) abort();
    const cleanup = () => {
      clearTimeout(timer);
      if (kill) clearTimeout(kill);
      budget.signal.removeEventListener("abort", abort);
    };
    child.stdout.resume();
    child.stderr.resume(); // Never forward SDK error strings containing URLs/credentials.
    child.on("error", () => {
      cleanup();
      reject(new DataError("python_bridge_unavailable"));
    });
    child.on("close", (code) => {
      cleanup();
      if (code !== 0)
        reject(
          new DataError(stopped ? "deadline_or_cancelled" : "bridge_failed"),
        );
      else done();
    });
  });
}
export async function collectDinnerData(
  input: Conditions,
  options: CollectOptions = {},
): Promise<CollectionResult> {
  loadEnvironment();
  const conditions = ConditionsSchema.parse(input);
  const runId = options.runId || randomUUID();
  if (!/^[a-zA-Z0-9-]{1,80}$/.test(runId))
    throw new DataError("invalid_run_id");
  const deadline = options.deadline ?? Date.now() + 180000;
  const budget = new Budget(
    deadline - (options.reserveMs ?? 25000),
    options.signal,
  );
  const directory = resolve(
    process.env.DINNER_DATA_RUNS_DIR || ".data-runs",
    runId,
  );
  await mkdir(resolve(process.env.DINNER_DATA_RUNS_DIR || ".data-runs"), {
    recursive: true,
    mode: 0o700,
  });
  try {
    await mkdir(directory, { mode: 0o700 });
  } catch {
    throw new DataError("run_id_exists_or_unwritable");
  }
  let sequence = 0;
  const emit = (
    stage: string,
    status: DataEvent["status"],
    extra: Partial<DataEvent> = {},
  ) => {
    try {
      options.onEvent?.({
        runId,
        sequence: ++sequence,
        stage,
        status,
        at: new Date().toISOString(),
        ...extra,
      });
    } catch {
      /* Observers cannot corrupt collection or prevent cleanup. */
    }
  };
  const result: CollectionResult = {
    runId,
    status: "failed",
    stores: STORES,
    deals: [],
    recipes: [],
    ingredients: [],
    candidates: [],
    commonIngredients: [],
    observations: [],
    warnings: [],
    stages: {
      firecrawl: { status: "not_run" },
      themealdb: { status: "not_run" },
      daytona: { status: "not_run" },
      aura: { status: "not_run" },
    },
    storeResults: STORES.map((s) => ({
      storeId: s.id,
      fetchStatus: "not_run",
      pageCount: 0,
      parseStatus: "not_run",
    })),
    acquisitions: { pages: [], meals: [] },
    daytonaReceipt: null,
    knownSubtotal: 0,
    knownSubtotalBasis: "priced_purchase_lines_only_no_plan_yet",
    totalYen: null,
    budgetStatus: "unknown",
    nutritionStatus: "unknown",
    mealPlan: null,
    threeProductSuccess: false,
  };
  try {
    const stores = await collectStores(budget, emit, {
      maxPages: options.maxStorePages,
    });
    result.acquisitions.pages = stores.pages;
    result.storeResults = stores.results.map((r) => ({
      storeId: r.storeId,
      fetchStatus: r.pages.length ? (r.code ? "partial" : "success") : "failed",
      pageCount: r.pages.length,
      parseStatus: "not_run",
      ...(r.code ? { code: r.code } : {}),
    }));
    result.warnings.push(...stores.warnings);
    result.stages.firecrawl = {
      status: stores.pages.length
        ? stores.results.some((r) => r.code)
          ? "partial"
          : "success"
        : "failed",
    };
    await save(join(directory, "acquisition-stores.json"), {
      results: stores.results,
      calls: stores.calls,
    });
    try {
      const meals = await collectMeals(stores.pages, conditions, budget, emit, {
        maxDetails: options.maxRecipeDetails,
      });
      result.acquisitions.meals = meals.meals;
      result.warnings.push(...meals.warnings);
      result.stages.themealdb = {
        status: meals.meals.length
          ? meals.warnings.length
            ? "partial"
            : "success"
          : "failed",
      };
      await save(join(directory, "acquisition-recipes.json"), {
        discovery: meals.discovery,
        calls: meals.calls,
        recipeCount: meals.meals.length,
      });
      if (meals.discovery.basis === "general")
        result.warnings.push(
          "Recipe discovery used general ingredients, not confirmed deals.",
        );
    } catch (e) {
      result.stages.themealdb = { status: "failed", code: errorCode(e) };
    }
    if (!result.acquisitions.pages.length && !result.acquisitions.meals.length)
      throw new DataError("no_acquired_data");
    const inputPath = join(directory, "daytona-input.json");
    const outputPath = join(directory, "daytona-output.json");
    await save(inputPath, {
      runId,
      conditions,
      stores: STORES,
      pages: result.acquisitions.pages,
      meals: result.acquisitions.meals,
    });
    try {
      budget.check(45000);
      await bridge(
        "daytona",
        inputPath,
        outputPath,
        Math.min(Date.now() + 60000, budget.deadline - 35000),
        budget,
      );
      const receipt = JSON.parse(
        await readFile(outputPath + ".receipt.json", "utf8"),
      );
      result.daytonaReceipt = receipt;
      if (receipt.status !== "success")
        throw new DataError(receipt.code || "daytona_failed");
      const raw = await readFile(outputPath);
      const parsed = ParsedSchema.parse(JSON.parse(raw.toString()));
      const inputHash = createHash("sha256")
        .update(await readFile(inputPath))
        .digest("hex");
      if (
        parsed.runId !== runId ||
        parsed.inputHash !== inputHash ||
        receipt.inputHash !== inputHash ||
        receipt.outputHash !== createHash("sha256").update(raw).digest("hex")
      )
        throw new DataError("daytona_hash_mismatch");
      result.stores = parsed.stores;
      result.deals = parsed.deals;
      result.recipes = parsed.recipes;
      result.ingredients = parsed.ingredients;
      result.observations = parsed.observations;
      result.warnings.push(...parsed.warnings);
      result.stages.daytona = { status: "success" };
      if (receipt.cleanup !== "deleted")
        result.warnings.push(
          "Daytona sandbox cleanup failed; see receipt for owned sandbox name.",
        );
      emit("daytona.parsed", "success", { count: parsed.recipes.length });
      for (const store of result.storeResults) {
        const observations = parsed.observations.filter(
          (o) => o.storeId === store.storeId,
        );
        if (!observations.length) continue;
        store.parseStatus = observations.some((o) => o.parseStatus === "parsed")
          ? "parsed"
          : observations[0].parseStatus;
        emit(
          "products.extracted",
          ["blocked", "failed", "invalid"].includes(store.parseStatus)
            ? "failed"
            : "success",
          {
            storeId: store.storeId,
            count: parsed.deals.filter((d) => d.storeId === store.storeId)
              .length,
          },
        );
      }
      const graphInput = join(directory, "aura-input.json");
      const graphOutput = join(directory, "aura-output.json");
      await save(graphInput, {
        data: parsed,
        receipt,
        conditions,
        daytonaOutputPath: outputPath,
      });
      try {
        budget.check(1000);
        await bridge(
          "aura",
          graphInput,
          graphOutput,
          Math.min(Date.now() + 20000, budget.deadline),
          budget,
        );
        const graph: GraphResult = JSON.parse(
          await readFile(graphOutput, "utf8"),
        );
        if (graph.status !== "success")
          throw new DataError(graph.code || "aura_failed");
        result.candidates = graph.candidates;
        result.commonIngredients = graph.commonIngredients;
        result.stages.aura = { status: "success" };
        emit("aura.queried", "success", { count: graph.candidates.length });
      } catch (e) {
        result.stages.aura = { status: "failed", code: errorCode(e) };
        result.warnings.push(
          `Aura unavailable: ${errorCode(e)}. No local candidate search was substituted.`,
        );
        emit("aura.queried", "failed", { code: errorCode(e) });
      }
    } catch (e) {
      if (result.stages.daytona.status !== "success") {
        result.stages.daytona = { status: "failed", code: errorCode(e) };
        try {
          result.daytonaReceipt = JSON.parse(
            await readFile(outputPath + ".receipt.json", "utf8"),
          );
        } catch {}
        emit("daytona.parsed", "failed", { code: errorCode(e) });
      } else throw e;
    }
    // No purchase quantities are selected by the data collector. An empty known
    // purchase subset is 0; the unknown full basket stays null, never zero.
    result.knownSubtotal = 0;
    const count = new Set(result.candidates.map((c) => c.recipeId)).size;
    if (count < 7)
      result.warnings.push(
        `Only ${count} distinct Aura candidates; no synthetic dinners added.`,
      );
    result.status =
      Object.values(result.stages).every((s) => s.status === "success") &&
      count >= 7 &&
      result.daytonaReceipt?.cleanup === "deleted"
        ? "success"
        : result.acquisitions.pages.length || result.acquisitions.meals.length
          ? "partial"
          : "failed";
  } catch (e) {
    result.warnings.push(errorCode(e));
    result.status =
      result.acquisitions.pages.length || result.acquisitions.meals.length
        ? "partial"
        : "failed";
  }
  await save(join(directory, "result.json"), result);
  emit(
    "collection.finished",
    result.status === "failed" ? "failed" : "success",
    { code: result.status },
  );
  return result;
}

/** Retry only Aura from an unchanged, hash-verified real Daytona output. Never runs a local parser. */
export async function resumeAuraFromDaytona(runId: string) {
  loadEnvironment();
  if (!/^[a-zA-Z0-9-]{1,80}$/.test(runId))
    throw new DataError("invalid_run_id");
  const directory = resolve(
    process.env.DINNER_DATA_RUNS_DIR || ".data-runs",
    runId,
  );
  const budget = new Budget(Date.now() + 25000);
  const result: CollectionResult = JSON.parse(
    await readFile(join(directory, "result.json"), "utf8"),
  );
  await bridge(
    "aura",
    join(directory, "aura-input.json"),
    join(directory, "aura-output.json"),
    budget.deadline,
    budget,
  );
  const graph: GraphResult = JSON.parse(
    await readFile(join(directory, "aura-output.json"), "utf8"),
  );
  result.stages.aura = {
    status: graph.status === "success" ? "success" : "failed",
    ...(graph.code ? { code: graph.code } : {}),
  };
  result.candidates = graph.candidates;
  result.commonIngredients = graph.commonIngredients;
  result.warnings = result.warnings.filter(
    (w) => !w.startsWith("Aura unavailable:") && !w.startsWith("Only "),
  );
  const count = new Set(graph.candidates.map((c) => c.recipeId)).size;
  if (count < 7)
    result.warnings.push(
      `Only ${count} distinct Aura candidates; no synthetic dinners added.`,
    );
  if (graph.status === "failed")
    result.warnings.push("Aura retry failed: " + graph.code);
  result.status =
    Object.values(result.stages).every((s) => s.status === "success") &&
    count >= 7
      ? "success"
      : "partial";
  await save(join(directory, "result.json"), result);
  return result;
}
