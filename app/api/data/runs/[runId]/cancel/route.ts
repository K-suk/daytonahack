import { getDataRun, localRequest } from "@/lib/dinner-scout/data/runs";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  if (!localRequest(request))
    return Response.json({ error: "local_only" }, { status: 403 });
  const run = getDataRun((await params).runId);
  if (!run) return Response.json({ error: "not_found" }, { status: 404 });
  if (run.status === "running") run.controller.abort();
  return Response.json(
    { runId: run.runId, status: run.status, cancelRequested: true },
    { status: 202 },
  );
}
