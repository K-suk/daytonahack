import { STORES } from "./config";
import { Budget, DataError, errorCode, mapLimit, requestJson } from "./http";
import type { Conditions, DataEvent, RawMeal, RawPage } from "./contracts";
import aliases from "../../../scripts/dinner-data/aliases.json";
export type Emit = (
  stage: string,
  status: DataEvent["status"],
  extra?: Partial<DataEvent>,
) => void;
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
export function blockedText(text: string) {
  return /captcha|access denied|verify (?:that )?you are human|ログインが必要|アクセスが拒否|自動取得.{0,15}(禁止|お断り)|scraping (?:is )?(?:prohibited|not allowed)/i.test(
    text,
  );
}
export function relatedFlyer(
  page: Record<string, unknown>,
  entry: string,
): string | undefined {
  const data = object(page.data);
  const html = typeof data.html === "string" ? data.html : "";
  const markdown = typeof data.markdown === "string" ? data.markdown : "";
  const links = [
    ...Array.from(
      html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi),
      (m) => ({ url: m[1], label: m[2].replace(/<[^>]+>/g, "") }),
    ),
    ...Array.from(
      markdown.matchAll(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g),
      (m) => ({ url: m[2], label: m[1] }),
    ),
  ];
  for (const link of links) {
    if (!/チラシ|特売|今週のお買|flyer|weekly offers/i.test(link.label))
      continue;
    try {
      const u = new URL(link.url, entry);
      const base = new URL(entry);
      if (
        u.protocol !== "https:" ||
        u.hostname !== base.hostname ||
        u.href === base.href ||
        /login|account|auth|\.pdf(?:$|\?)/i.test(u.href)
      )
        continue;
      return u.href;
    } catch {
      continue;
    }
  }
  return undefined;
}
export async function collectStores(
  budget: Budget,
  emit: Emit,
  { maxPages = 2 }: { maxPages?: number } = {},
) {
  const warnings: string[] = [];
  const key = process.env.FIRECRAWL_API_KEY;
  let calls = 0;
  const results = await mapLimit(STORES, 3, async (store) => {
    const pages: RawPage[] = [];
    let code: string | undefined;
    emit("store.started", "started", { storeId: store.id });
    if (!key) {
      code = "firecrawl_key_missing";
      warnings.push(`${store.id}:${code}`);
      emit("page.fetched", "failed", { storeId: store.id, code });
      return { storeId: store.id, pages, code };
    }
    let url: string | undefined = store.sourceUrl;
    for (let i = 0; i < Math.min(2, maxPages) && url; i++) {
      try {
        const response = await requestJson(
          "https://api.firecrawl.dev/v2/scrape",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${key}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              url,
              formats: [
                "markdown",
                "html",
                "links",
                "images",
                ...(i === 0 ? [{ type: "screenshot", fullPage: false }] : []),
              ],
              maxAge: 0,
              onlyMainContent: false,
              timeout: 20000,
              proxy: "basic",
              parsers: [],
            }),
          },
          budget,
          26000,
          () => calls++,
        );
        if (response.success !== true)
          throw new DataError("firecrawl_scrape_failed");
        if (
          !response.data ||
          typeof response.data !== "object" ||
          Array.isArray(response.data)
        )
          throw new DataError("invalid_firecrawl_response");
        const data = object(response.data);
        const metadata = object(data.metadata);
        const status = Number(metadata.statusCode || 200);
        const body = String(data.markdown || "");
        if ([401, 403, 429].includes(status) || blockedText(body)) {
          throw new DataError("access_restricted");
        }
        if (status >= 400) throw new DataError(`source_http_${status}`);
        const fetchedAt = new Date().toISOString();
        const sourceUrl =
          typeof metadata.sourceURL === "string" ? metadata.sourceURL : url;
        pages.push({
          storeId: store.id,
          sourceUrl,
          fetchedAt,
          acquisitionMode: "live",
          response,
        });
        emit("page.fetched", "success", {
          storeId: store.id,
          count: pages.length,
        });
        if (i === 0)
          emit(
            "image.fetched",
            typeof data.screenshot === "string" ? "success" : "failed",
            {
              storeId: store.id,
              code:
                typeof data.screenshot === "string"
                  ? undefined
                  : "screenshot_unavailable",
            },
          );
        url = i === 0 ? relatedFlyer(response, store.sourceUrl) : undefined;
      } catch (e) {
        code = errorCode(e);
        warnings.push(`${store.id}:${code}`);
        emit("page.fetched", "failed", { storeId: store.id, code });
        break;
      }
    }
    return { storeId: store.id, pages, code };
  });
  return { pages: results.flatMap((r) => r.pages), results, warnings, calls };
}
export function chooseQueries(pages: RawPage[], conditions: Conditions) {
  const text = pages
    .map((p) => String(object(p.response.data).markdown || ""))
    .join("\n")
    .toLowerCase();
  const allowed = aliases.filter(
    (a) =>
      a.query &&
      !a.allergens.some((x) =>
        conditions.allergies.map((v) => v.toLowerCase()).includes(x),
      ) &&
      !conditions.dislikes.some((d) =>
        [a.id, a.category, ...a.aliases].includes(d.toLowerCase()),
      ),
  );
  const found = allowed.filter((a) =>
    a.aliases.some((n) => text.includes(n.toLowerCase())),
  );
  const fallback = ["chicken_breast", "broccoli", "pork", "tofu"];
  return {
    queries: [
      ...new Set([
        ...found.map((a) => a.query!),
        ...fallback.filter((q) => allowed.some((a) => a.query === q)),
      ]),
    ].slice(0, 4),
    basis: found.length ? ("source_text_hints" as const) : ("general" as const),
  };
}
export async function collectMeals(
  pages: RawPage[],
  conditions: Conditions,
  budget: Budget,
  emit: Emit,
  { maxDetails = 14 }: { maxDetails?: number } = {},
) {
  const key = process.env.THEMEALDB_API_KEY || "1";
  if (!/^[a-zA-Z0-9_-]+$/.test(key))
    throw new DataError("invalid_themealdb_key");
  let calls = 0;
  const warnings: string[] = [];
  const discovery = chooseQueries(pages, conditions);
  const api = async (endpoint: string, query: string) =>
    requestJson(
      `https://www.themealdb.com/api/json/v1/${key}/${endpoint}.php?${query}`,
      {},
      budget,
      10000,
      () => {
        if (calls >= 20) throw new DataError("recipe_request_limit");
        calls++;
      },
    );
  const filters = await mapLimit(discovery.queries, 3, async (query) => {
    try {
      const response = await api("filter", `i=${encodeURIComponent(query)}`);
      return Array.isArray(response.meals) ? response.meals.map(object) : [];
    } catch (e) {
      warnings.push(`themealdb_filter:${errorCode(e)}`);
      return [];
    }
  });
  // Round-robin the filters so one ingredient cannot monopolize the detail budget.
  const ids: string[] = [];
  for (let row = 0; row < 30 && ids.length < Math.min(14, maxDetails); row++)
    for (const group of filters) {
      const id = group[row]?.idMeal;
      if (
        typeof id === "string" &&
        /^\d+$/.test(id) &&
        !ids.includes(id) &&
        ids.length < Math.min(14, maxDetails)
      )
        ids.push(id);
    }
  const meals = await mapLimit(ids, 3, async (id) => {
    try {
      const response = await api("lookup", `i=${id}`);
      const list = Array.isArray(response.meals) ? response.meals : [];
      const meal = list.map(object).find((m) => m.idMeal === id);
      if (!meal) throw new DataError("recipe_not_found");
      const sourceUrl =
        typeof meal.strSource === "string" &&
        /^https?:\/\//.test(meal.strSource)
          ? meal.strSource
          : "https://www.themealdb.com/api.php";
      emit("recipe.fetched", "success", { count: 1 });
      return {
        sourceUrl,
        fetchedAt: new Date().toISOString(),
        acquisitionMode: "live" as const,
        response: { meals: [meal] },
      };
    } catch (e) {
      const code = errorCode(e);
      warnings.push(`themealdb_detail:${code}`);
      emit("recipe.fetched", "failed", { code });
      return null;
    }
  });
  return { meals: meals.filter((m) => m !== null), warnings, calls, discovery };
}
