import { getDataRun, localRequest } from "@/lib/dinner-scout/data/runs";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  if (!localRequest(request))
    return Response.json({ error: "local_only" }, { status: 403 });
  const run = getDataRun((await params).runId);
  const after = Number(new URL(request.url).searchParams.get("after") || 0);
  return run
    ? Response.json(
        {
          runId: run.runId,
          status: run.status,
          events: run.events.filter((e) => e.sequence > after),
        },
        { headers: { "Cache-Control": "no-store" } },
      )
    : Response.json({ error: "not_found" }, { status: 404 });
}
