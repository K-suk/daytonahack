import { randomUUID } from "node:crypto";
import { collectDinnerData } from "./collect";
import {
  ConditionsSchema,
  type CollectionResult,
  type DataEvent,
} from "./contracts";
type Run = {
  runId: string;
  status: "running" | "success" | "partial" | "failed";
  events: DataEvent[];
  result: CollectionResult | null;
  controller: AbortController;
};
const root = globalThis as typeof globalThis & {
  dinnerDataRuns?: Map<string, Run>;
};
const runs = (root.dinnerDataRuns ??= new Map<string, Run>());
export function startDataRun(input: unknown) {
  const conditions = ConditionsSchema.parse(input);
  if ([...runs.values()].some((r) => r.status === "running"))
    throw Error("run_in_progress");
  if (runs.size > 30) {
    const oldest = runs.keys().next().value;
    if (oldest) runs.delete(oldest);
  }
  const run: Run = {
    runId: randomUUID(),
    status: "running",
    events: [],
    result: null,
    controller: new AbortController(),
  };
  runs.set(run.runId, run);
  void collectDinnerData(conditions, {
    runId: run.runId,
    signal: run.controller.signal,
    onEvent: (e) => run.events.push(e),
  })
    .then((result) => {
      run.result = result;
      run.status = result.status;
    })
    .catch(() => {
      run.status = "failed";
      run.events.push({
        runId: run.runId,
        sequence: run.events.length + 1,
        stage: "collection.finished",
        status: "failed",
        at: new Date().toISOString(),
        code: "collection_failed",
      });
    });
  return {
    runId: run.runId,
    status: run.status,
    resultUrl: `/api/data/runs/${run.runId}`,
    progressUrl: `/api/data/runs/${run.runId}/events`,
  };
}
export function getDataRun(id: string) {
  return runs.get(id);
}
export function localRequest(request: Request) {
  const url = new URL(request.url);
  const local = (host: string) => ["localhost", "127.0.0.1"].includes(host);
  if (!local(url.hostname)) return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const source = new URL(origin);
    return (
      local(source.hostname) &&
      source.port === url.port &&
      source.protocol === url.protocol
    );
  } catch {
    return false;
  }
}
