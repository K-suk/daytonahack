export class DataError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
export class Budget {
  readonly signal: AbortSignal;
  constructor(
    public deadline: number,
    signal?: AbortSignal,
  ) {
    const timeout = AbortSignal.timeout(Math.max(1, deadline - Date.now()));
    this.signal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  }
  remaining() {
    return Math.max(0, this.deadline - Date.now());
  }
  check(min = 1) {
    if (this.signal.aborted || this.remaining() < min)
      throw new DataError("deadline_or_cancelled");
  }
}
export async function requestJson(
  url: string,
  init: RequestInit,
  budget: Budget,
  timeoutMs: number,
  onAttempt?: () => void,
): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt < 2; attempt++) {
    budget.check(100);
    onAttempt?.();
    const signal = AbortSignal.any([
      budget.signal,
      AbortSignal.timeout(Math.max(1, Math.min(timeoutMs, budget.remaining()))),
    ]);
    try {
      const response = await fetch(url, {
        ...init,
        signal,
        redirect: "error",
        cache: "no-store",
      });
      if (!response.ok) {
        if (
          [502, 503, 504].includes(response.status) &&
          attempt === 0 &&
          budget.remaining() > timeoutMs + 5000
        )
          continue;
        throw new DataError(`http_${response.status}`);
      }
      const text = await response.text();
      if (text.length > 8_000_000) throw new DataError("response_too_large");
      const data: unknown = JSON.parse(text);
      if (!data || typeof data !== "object" || Array.isArray(data))
        throw new DataError("invalid_response");
      return data as Record<string, unknown>;
    } catch (e) {
      if (e instanceof DataError) throw e;
      if (
        attempt === 0 &&
        !budget.signal.aborted &&
        budget.remaining() > timeoutMs + 5000 &&
        (e instanceof TypeError || (e as Error).name === "TimeoutError")
      )
        continue;
      throw new DataError(
        budget.signal.aborted ? "deadline_or_cancelled" : "read_failed",
      );
    }
  }
  throw new DataError("read_failed");
}
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let index = 0;
  await Promise.all(
    Array.from({ length: Math.min(items.length, limit) }, async () => {
      while (index < items.length) {
        const i = index++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}
export function errorCode(e: unknown) {
  return e instanceof DataError ? e.code : "provider_failed";
}
