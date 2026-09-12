import { getDataRun, localRequest } from "@/lib/dinner-scout/data/runs";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  if (!localRequest(request))
    return Response.json({ error: "local_only" }, { status: 403 });
  const run = getDataRun((await params).runId);
  return run
    ? Response.json(
        run.result || { runId: run.runId, status: run.status, mealPlan: null },
        {
          status: run.status === "running" ? 202 : 200,
          headers: { "Cache-Control": "no-store" },
        },
      )
    : Response.json({ error: "not_found" }, { status: 404 });
}
