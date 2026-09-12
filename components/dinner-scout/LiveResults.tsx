"use client";
import { useEffect, useRef, useState, useId } from "react";
import type { CollectionResult } from "@/lib/dinner-scout/data/contracts";
import type { ProgressEvent } from "@/lib/dinner-scout/types";
import { STORES } from "@/lib/dinner-scout/data/public-config";
const labels: Record<string, string> = {
  "store.started": "Opening source",
  "page.fetched": "Page fetched",
  "image.fetched": "Source screenshot available",
  "recipe.fetched": "Recipe fetched",
  "daytona.parsed": "Daytona analysis complete",
  "products.extracted": "Product extraction complete",
  "aura.queried": "Aura ingredient matching complete",
  "collection.finished": "Research finished",
};
function Picture({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <span className="photo fallback">Image unavailable</span>
  ) : (
    <img
      className="photo"
      src={src}
      alt={alt}
      onError={() => setFailed(true)}
    />
  );
}
function Detail({
  title,
  children,
  close,
}: {
  title: string;
  children: React.ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const old = document.activeElement as HTMLElement;
    const d = ref.current;
    d?.showModal();
    return () => {
      d?.close();
      old?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={id}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onKeyDown={(e) => {
        if (e.key !== "Tab") return;
        const list = ref.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),a[href]",
        );
        if (!list?.length) return;
        const first = list[0],
          last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }}
    >
      <div className="modal-heading">
        <h2 id={id}>{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={close}
        >
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
export default function LiveResults({
  event,
  result,
  error,
  onBack,
}: {
  event?: ProgressEvent;
  result?: CollectionResult;
  error: string;
  onBack: () => void;
}) {
  const [selected, setSelected] =
    useState<CollectionResult["recipes"][number]>();
  const [preview, setPreview] = useState<string>();
  const events = event?.rawEvents || [];
  const running = !result && !error && event?.status !== "failed";
  const candidates =
    result?.recipes.filter((r) =>
      result.candidates.some((c) => c.recipeId === r.id),
    ) || [];
  const recipes = candidates.length ? candidates : result?.recipes || [];
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">LIVE SOURCES · REAL PROCESSING</span>
          <h1>
            {running
              ? "Scouting your dinner options."
              : "Your dinner research."}
          </h1>
          <p>
            {running
              ? "Checking three stores, reading recipes, and matching ingredients."
              : "Real sources, with missing information kept visible."}
          </p>
        </div>
        <button className="secondary" onClick={onBack}>
          {running ? "Cancel" : "Edit preferences"}
        </button>
      </div>
      <div className="demo-strip">
        Firecrawl → TheMealDB → Daytona → AuraDB{" "}
        <span>
          {running
            ? "Research in progress"
            : `Collection: ${result?.status || "failed"}`}
        </span>
      </div>
      <div className="scout-grid">
        {STORES.map((store) => {
          const own = events.filter(
            (e) => "storeId" in e && e.storeId === store.id,
          );
          const last = own.at(-1);
          const observation = result?.observations.find(
            (o) => o.storeId === store.id,
          );
          const state = result?.storeResults?.find(
            (s) => s.storeId === store.id,
          );
          return (
            <section className="store-card" key={store.id}>
              <h2>{store.name}</h2>
              <p className="status">
                {state
                  ? `Page: ${state.fetchStatus} · Analysis: ${state.parseStatus}`
                  : last
                    ? `${labels[last.stage] || last.stage}${last.status === "failed" ? " · unavailable" : ""}`
                    : "Waiting to start"}
              </p>
              {observation?.screenshot ? (
                <button
                  className="preview"
                  onClick={() => setPreview(observation.screenshot!.url)}
                >
                  <img
                    src={observation.screenshot.url}
                    alt={`${store.name} source screenshot from Firecrawl`}
                  />
                  <span>
                    Firecrawl source preview <b>Expand ↗</b>
                  </span>
                </button>
              ) : (
                <p className="hint">
                  {running
                    ? "Source preview will appear after analysis."
                    : "No source preview available."}
                </p>
              )}
              {result && (
                <p className="hint">
                  {result.deals.filter((d) => d.storeId === store.id).length}{" "}
                  text-extracted offers ·{" "}
                  <a href={store.sourceUrl} target="_blank" rel="noreferrer">
                    Store source ↗
                  </a>
                </p>
              )}
            </section>
          );
        })}
      </div>
      {running && (
        <div className="stages" role="status">
          {events.length
            ? labels[events.at(-1)!.stage] || events.at(-1)!.stage
            : "Starting research…"}
        </div>
      )}
      {(error || event?.error) && (
        <p className="error" role="alert">
          {error || event?.error}
        </p>
      )}
      {result && (
        <>
          <div className="summary-grid">
            <div>
              <span>Estimated basket total</span>
              <strong>Unknown</strong>
              <small>Purchase quantities and prices need verification</small>
            </div>
            <div>
              <span>Protein target</span>
              <strong>Unknown</strong>
              <small>Nutrition was not supplied by the source</small>
            </div>
            <div>
              <span>Recipe candidates</span>
              <strong>{candidates.length}</strong>
              <small>Distinct recipes returned by AuraDB</small>
            </div>
          </div>
          <div className="warning-banner">
            <strong>Your seven-day plan still needs review.</strong>
            <p>
              Unknown servings, cooking times, nutrition and allergen safety are
              not treated as verified. No demo meals have been substituted.
            </p>
          </div>
          <div className="results-grid">
            <section>
              <div className="section-heading">
                <h2>
                  {candidates.length ? "Recipe candidates" : "Fetched recipes"}
                </h2>
                <span>TheMealDB</span>
              </div>
              {recipes.length ? (
                <div className="meal-list">
                  {recipes.map((r) => (
                    <article className="meal-row" key={r.id}>
                      <button
                        className="meal-open"
                        onClick={() => setSelected(r)}
                      >
                        {r.image && <Picture src={r.image} alt={r.title} />}
                        <span className="meal-copy">
                          <strong>{r.title}</strong>
                          <span>
                            {result.candidates.some(
                              (c) => c.recipeId === r.id && c.basis === "deals",
                            )
                              ? "Matches confirmed offers"
                              : "General ingredient candidate · not based on confirmed deals"}
                          </span>
                          <span className="meal-nutrition">
                            {r.cookingMinutes === null
                              ? "Time unknown"
                              : `${r.cookingMinutes} min`}{" "}
                            ·{" "}
                            {r.nutrition.protein === null
                              ? "Protein unknown"
                              : `${r.nutrition.protein} g protein`}{" "}
                            ·{" "}
                            {r.eligibility === "excluded"
                              ? "Excluded by preferences"
                              : "Allergen review needed"}
                          </span>
                        </span>
                        <span>Details →</span>
                      </button>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="empty">
                  <h3>No recipes available</h3>
                  <p>
                    Review the source status below, then adjust your preferences
                    or retry.
                  </p>
                </div>
              )}
            </section>
            <aside className="shopping">
              <h2>Shopping information</h2>
              <p className="hint">
                A priced shopping list requires verified pack sizes and serving
                quantities.
              </p>
              {result.deals.length ? (
                result.deals.map((d) => (
                  <div className="shopping-item" key={d.id}>
                    <span>
                      <strong>{d.productName}</strong>
                      <small>
                        {d.priceYen === null
                          ? "Price unknown"
                          : `¥${d.priceYen}`}{" "}
                        · {d.priceKind} price
                      </small>
                      <small>
                        Pack:{" "}
                        {d.packGrams === null ? "Unknown" : `${d.packGrams} g`}{" "}
                        · Store applicability: {d.storeApplicability}
                      </small>
                      <small>Valid through: {d.validTo || "Unknown"}</small>
                    </span>
                  </div>
                ))
              ) : (
                <p>
                  No confirmed product prices were extracted. A store page or
                  flyer image alone is not a price quote.
                </p>
              )}
              <h3>Pipeline status</h3>
              {Object.entries(result.stages).map(([stage, state]) => (
                <p className="hint" key={stage}>
                  {stage}: {state.status}
                  {state.code ? ` · ${state.code}` : ""}
                </p>
              ))}
              <p className="hint">
                Nosana selection is separate. No completed dinner plan is
                claimed.
              </p>
            </aside>
          </div>
          <details className="live-evidence">
            <summary>Sources and processing details</summary>
            {result.observations.map((o, i) => (
              <p className="hint" key={i}>
                <a href={o.sourceUrl} target="_blank" rel="noreferrer">
                  {o.provider} source ↗
                </a>{" "}
                · {o.acquisitionMode} · acquired{" "}
                {new Date(o.fetchedAt).toLocaleString()} · parsed by{" "}
                {o.processedBy} · {o.parseStatus}
              </p>
            ))}
            {result.warnings.map((w, i) => (
              <p className="hint" key={i}>
                {w}
              </p>
            ))}
            <p className="hint">
              Run: {result.runId} · Sandbox cleanup:{" "}
              {String(result.daytonaReceipt?.cleanup || "Not created")}
            </p>
          </details>
        </>
      )}
      {preview && (
        <Detail
          title="Firecrawl source screenshot"
          close={() => setPreview(undefined)}
        >
          <img
            className="expanded-preview"
            src={preview}
            alt="Store source captured by Firecrawl"
          />
          <p className="hint">
            Captured by Firecrawl, not a Daytona browser session.
          </p>
        </Detail>
      )}
      {selected && (
        <Detail title={selected.title} close={() => setSelected(undefined)}>
          <p className="hint">
            TheMealDB · {selected.id} · Servings:{" "}
            {selected.servings ?? "Unknown"} · Time:{" "}
            {selected.cookingMinutes ?? "Unknown"} · Rating:{" "}
            {selected.rating ?? "Unknown"}
          </p>
          <h3>Original ingredients</h3>
          <div className="ingredients">
            {selected.requirements.map((q, i) => (
              <div key={i}>
                <span>{q.nameRaw}</span>
                <span>{q.measureRaw || "Unknown"}</span>
                <small>{q.grams === null ? "g unknown" : `${q.grams} g`}</small>
              </div>
            ))}
          </div>
          <h3 style={{ marginTop: 20 }}>Original instructions</h3>
          <p style={{ whiteSpace: "pre-line" }}>
            {selected.instructions || "Instructions unavailable"}
          </p>
          {selected.sourceUrl ? (
            <a
              className="secondary"
              href={selected.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              View original recipe ↗
            </a>
          ) : (
            <p className="hint">Original recipe link unavailable.</p>
          )}
        </Detail>
      )}
    </>
  );
}
