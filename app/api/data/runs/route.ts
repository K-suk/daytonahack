import { startDataRun, localRequest } from "@/lib/dinner-scout/data/runs";
export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!localRequest(request))
    return Response.json({ error: "local_only" }, { status: 403 });
  try {
    const raw = await request.text();
    if (raw.length > 65536)
      return Response.json({ error: "body_too_large" }, { status: 413 });
    const payload = JSON.parse(raw);
    return Response.json(startDataRun(payload.conditions), { status: 202 });
  } catch (e) {
    return Response.json(
      {
        error:
          (e as Error).message === "run_in_progress"
            ? "run_in_progress"
            : "invalid_request",
      },
      { status: (e as Error).message === "run_in_progress" ? 409 : 400 },
    );
  }
}
