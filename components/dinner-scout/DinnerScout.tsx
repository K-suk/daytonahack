"use client";
import { useEffect, useRef, useState, useId } from "react";
import SavedResults from "./SavedResults";
import type { SavedResult } from "@/lib/dinner-scout/http-service";
import { service as savedService } from "@/lib/dinner-scout/http-service";
import { service as mockService } from "@/lib/dinner-scout/mock-service";
import { liveService } from "@/lib/dinner-scout/live-service";
import LiveResults from "./LiveResults";
import type {
  MealPlan,
  ProgressEvent,
  Recipe,
  Scenario,
  UserPreference,
} from "@/lib/dinner-scout/types";
const yen = (n: number) => `¥${n.toLocaleString("en-US")}`;
const toggle = (list: string[], id: string) =>
  list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
function Logo() {
  return (
    <a className="brand" href="/" aria-label="Dinner Scout home">
      <svg
        width="42"
        height="42"
        viewBox="0 0 48 48"
        fill="none"
        aria-hidden="true"
      >
        <circle
          cx="21"
          cy="20"
          r="15.5"
          stroke="currentColor"
          strokeWidth="3"
        />
        <path
          d="m33 32 10 11"
          stroke="currentColor"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <path d="M10 22h22c-1 8-6 11-11 11s-10-3-11-11Z" fill="currentColor" />
        <path d="m19 19 9-11-3 13" fill="currentColor" />
        <path
          d="M12 18h6m10 0h3"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
      <span>Dinner Scout</span>
    </a>
  );
}
function Photo({ src, name }: { src: string; name: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <span className="photo fallback">Photo unavailable</span>
  ) : (
    <img
      className="photo"
      src={src}
      alt={`${name} — illustrative sample photo`}
      onError={() => setFailed(true)}
    />
  );
}
function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const titleId = useId();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onKeyDown={(e) => {
        if (e.key !== "Tab") return;
        const elements = ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], input:not(:disabled), [tabindex="0"]',
        );
        if (!elements?.length) return;
        const first = elements[0],
          last = elements[elements.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-heading">
        <h2 id={titleId}>{title}</h2>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close dialog"
        >
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
export default function DinnerScout() {
  const [source, setSource] = useState<"live" | "saved" | "demo">("live");
  const service =
    source === "live"
      ? liveService
      : source === "saved"
        ? savedService
        : mockService;
  const [catalog, setCatalog] = useState(() => liveService.getCatalog());
  const [p, setP] = useState<UserPreference>(catalog.defaults);
  const [values, setValues] = useState({
    budget: "4000",
    protein: "40",
    calories: "650",
  });
  const [screen, setScreen] = useState<"preferences" | "scout" | "week">(
    "preferences",
  );
  const [event, setEvent] = useState<ProgressEvent>();
  const [savedResult, setSavedResult] = useState<SavedResult>();
  const [plan, setPlan] = useState<MealPlan>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<{
    kind: "detail" | "swap" | "preview";
    day?: number;
    preview?: string;
    store?: string;
  }>();
  const [alternatives, setAlternatives] = useState<Recipe[]>([]);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [changed, setChanged] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const active = useRef<string | undefined>(undefined);
  const generation = useRef(0);
  const unsubscribe = useRef<(() => void) | undefined>(undefined);
  const lock = useRef(false);
  const serviceRef = useRef(service);
  serviceRef.current = service;
  useEffect(
    () => () => {
      generation.current++;
      unsubscribe.current?.();
      if (active.current)
        void service.cancelRun(active.current).catch(() => {});
    },
    [],
  );
  async function back() {
    generation.current++;
    unsubscribe.current?.();
    if (active.current) {
      try {
        await service.cancelRun(active.current);
      } catch {
        /* Local navigation still succeeds. */
      }
    }
    active.current = undefined;
    lock.current = false;
    setBusy(false);
    setScreen("preferences");
    setEvent(undefined);
    setSavedResult(undefined);
    setError("");
    setModal(undefined);
  }
  async function start(e: React.FormEvent) {
    e.preventDefault();
    if (lock.current) return;
    const prefs = {
      ...p,
      budget: Number(values.budget),
      protein: Number(values.protein),
      calories: Number(values.calories),
    };
    if (
      Object.values(values).some(
        (v) => !v.trim() || !Number.isFinite(Number(v)) || Number(v) <= 0,
      ) ||
      !Number.isInteger(prefs.budget)
    ) {
      setError(
        "Enter positive numbers for all targets and a whole-yen budget.",
      );
      return;
    }
    setP(prefs);
    lock.current = true;
    setBusy(true);
    setError("");
    setChecked({});
    setChanged([]);
    setNotice("");
    const token = ++generation.current;
    const raw = new URLSearchParams(location.search).get("scenario");
    const scenario = (
      [
        "saved",
        "all-failed",
        "insufficient",
        "no-alternatives",
        "broken-image",
      ].includes(raw || "")
        ? raw
        : "normal"
    ) as Scenario;
    try {
      const id = await service.startRun(prefs, scenario);
      if (token !== generation.current) {
        await service.cancelRun(id);
        return;
      }
      active.current = id;
      setScreen("scout");
      unsubscribe.current = service.subscribe(id, async (next) => {
        if (token !== generation.current) return;
        setEvent(next);
        if (service.getSavedResult && next.status !== "running") {
          try {
            const result = await service.getSavedResult(id);
            if (token === generation.current) {
              setSavedResult(result);
              setScreen("week");
            }
          } catch (e) {
            if (token === generation.current) setError((e as Error).message);
          }
          unsubscribe.current?.();
          return;
        }
        if (next.status === "complete") {
          try {
            const result = await service.getResult(id);
            if (token === generation.current) {
              setPlan(result);
              setScreen("week");
              unsubscribe.current?.();
            }
          } catch (e) {
            setError((e as Error).message);
          }
        }
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      if (token === generation.current) {
        lock.current = false;
        setBusy(false);
      }
    }
  }
  async function openSwap(day: number) {
    if (!plan || lock.current) return;
    setAlternatives([]);
    setModal({ kind: "swap", day });
    setBusy(true);
    lock.current = true;
    setError("");
    const token = generation.current;
    try {
      const result = await service.getAlternatives(plan.runId, day);
      if (token === generation.current) setAlternatives(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      if (token === generation.current) {
        setBusy(false);
        lock.current = false;
      }
    }
  }
  async function swap(recipe: Recipe) {
    if (!plan || modal?.day === undefined || lock.current) return;
    lock.current = true;
    setBusy(true);
    const token = generation.current;
    try {
      const next = await service.replaceMeal(
        plan.runId,
        modal.day,
        recipe.id,
        plan.revision,
      );
      if (token !== generation.current) return;
      const increased = next.shopping.items
        .filter((x) => {
          const old = plan.shopping.items.find(
            (o) => o.product.id === x.product.id,
          );
          return !old || x.packs > old.packs;
        })
        .map((x) => x.product.id);
      setChecked((old) =>
        Object.fromEntries(
          next.shopping.items.map((x) => [
            x.product.id,
            !!old[x.product.id] && !increased.includes(x.product.id),
          ]),
        ),
      );
      setChanged(increased);
      setPlan(next);
      setNotice(
        `${next.meals[modal.day].day} updated. Basket and nutrition recalculated.${increased.length ? " Increased quantities are unchecked." : ""}`,
      );
      setModal(undefined);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      if (token === generation.current) {
        lock.current = false;
        setBusy(false);
      }
    }
  }
  const current = modal?.day !== undefined ? plan?.meals[modal.day] : undefined;
  return (
    <>
      <header>
        <div className="header-inner">
          <Logo />
          <nav aria-label="Planning steps">
            {["Preferences", "Scout", "Your week"].map((label, i) => (
              <span
                key={label}
                className={
                  ["preferences", "scout", "week"][i] === screen ? "active" : ""
                }
              >
                <b>{i + 1}</b>
                {label}
              </span>
            ))}
          </nav>
          <span className="demo-badge">
            {source === "live"
              ? "Live sources"
              : source === "saved"
                ? "Saved materials"
                : "Demo mode"}
          </span>
        </div>
      </header>
      <main className={screen === "preferences" ? "preferences-main" : ""}>
        {screen === "preferences" && (
          <>
            <div
              className="source-switch"
              role="group"
              aria-label="Data source"
            >
              {(["live", "saved", "demo"] as const).map((mode) => (
                <button
                  type="button"
                  key={mode}
                  aria-pressed={source === mode}
                  onClick={() => {
                    const next = (
                      mode === "live"
                        ? liveService
                        : mode === "saved"
                          ? savedService
                          : mockService
                    ).getCatalog();
                    setSource(mode);
                    setCatalog(next);
                    setP((prev) => ({
                      ...prev,
                      pantry: next.defaults.pantry,
                      allergies: [],
                      dislikes: [],
                    }));
                    setError("");
                  }}
                >
                  {mode === "live"
                    ? "Live research"
                    : mode === "saved"
                      ? "Saved materials"
                      : "Sample demo"}
                </button>
              ))}
            </div>
            <div className="intro">
              <div className="eyebrow">LESS PLANNING. MORE GOOD DINNERS.</div>
              <h1>
                A week of dinners.
                <br />
                One less thing to think about.
              </h1>
              <p>
                Local deals. High-protein recipes. A plan that fits your budget.
              </p>
            </div>
            <form className="preference-card" onSubmit={start} noValidate>
              <div className="fixed-context">
                <span>Omotesando &amp; Aoyama</span>
                <span>1 person</span>
                <span>7 dinners</span>
              </div>
              <div className="form-grid">
                <label>
                  Weekly grocery budget
                  <div className="input-unit">
                    <span>¥</span>
                    <input
                      aria-label="Weekly grocery budget"
                      inputMode="numeric"
                      value={values.budget}
                      onChange={(e) =>
                        setValues({ ...values, budget: e.target.value })
                      }
                    />
                    <span>/ week</span>
                  </div>
                </label>
                <label>
                  Your main goal
                  <div className="goal">
                    High protein <span>✓</span>
                  </div>
                </label>
                <label>
                  Protein per dinner
                  <div className="input-unit">
                    <input
                      aria-label="Protein per dinner"
                      inputMode="decimal"
                      value={values.protein}
                      onChange={(e) =>
                        setValues({ ...values, protein: e.target.value })
                      }
                    />
                    <span>g minimum</span>
                  </div>
                </label>
                <label>
                  Calories per dinner
                  <div className="input-unit">
                    <input
                      aria-label="Calories per dinner"
                      inputMode="decimal"
                      value={values.calories}
                      onChange={(e) =>
                        setValues({ ...values, calories: e.target.value })
                      }
                    />
                    <span>kcal target</span>
                  </div>
                </label>
              </div>
              <fieldset>
                <legend>Already in your kitchen</legend>
                <div className="chips">
                  {catalog.pantry.map((i) => (
                    <button
                      type="button"
                      className={
                        p.pantry.includes(i.id) ? "chip selected" : "chip"
                      }
                      aria-pressed={p.pantry.includes(i.id)}
                      key={i.id}
                      onClick={() =>
                        setP({ ...p, pantry: toggle(p.pantry, i.id) })
                      }
                    >
                      {p.pantry.includes(i.id) && <span>✓ </span>}
                      {i.name}
                    </button>
                  ))}
                </div>
                <p className="hint">
                  We’ll leave these off your shopping list.
                </p>
              </fieldset>
              <details>
                <summary>
                  Allergies &amp; food preferences <span>Optional</span>
                </summary>
                <fieldset>
                  <legend>Allergies</legend>
                  <div className="chips">
                    {catalog.allergies.map((a) => (
                      <button
                        type="button"
                        className={`chip ${p.allergies.includes(a) ? "selected" : ""}`}
                        aria-pressed={p.allergies.includes(a)}
                        onClick={() =>
                          setP({ ...p, allergies: toggle(p.allergies, a) })
                        }
                        key={a}
                      >
                        {a}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <fieldset>
                  <legend>Foods to avoid</legend>
                  <div className="chips">
                    {catalog.dislikes.map((i) => (
                      <button
                        type="button"
                        className={`chip ${p.dislikes.includes(i.id) ? "selected" : ""}`}
                        aria-pressed={p.dislikes.includes(i.id)}
                        onClick={() =>
                          setP({ ...p, dislikes: toggle(p.dislikes, i.id) })
                        }
                        key={i.id}
                      >
                        {i.name}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <p className="hint">
                  Only recipes with verified exclusion information can form a
                  plan.
                </p>
              </details>
              <p className="promise">
                Target: under 30 minutes · Shop once · Freeze portions
              </p>
              {error && (
                <p role="alert" className="error">
                  {error}
                </p>
              )}
              <button className="primary cta" disabled={busy}>
                Plan my dinners <span>→</span>
              </button>
              <p className="form-footnote">
                {source === "live"
                  ? "Firecrawl + TheMealDB. Missing values stay Unknown."
                  : source === "saved"
                    ? "Previously saved materials. No new web acquisition."
                    : "Sample stores, prices and recipes. Simulated research."}
              </p>
            </form>
            <p className="bottom-note">
              A little planning now. Seven easier evenings ahead.
            </p>
          </>
        )}
        {(screen === "scout" || screen === "week") && source === "live" && (
          <LiveResults
            event={event}
            result={savedResult?.rawData}
            error={error}
            onBack={back}
          />
        )}
        {(screen === "scout" || screen === "week") && source === "saved" && (
          <SavedResults
            event={event}
            result={savedResult}
            error={error}
            onBack={back}
            onResult={setSavedResult}
          />
        )}
        {screen === "scout" && !service.getSavedResult && (
          <>
            <div className="page-heading">
              <div>
                <span className="eyebrow">YOUR WEEK IS TAKING SHAPE</span>
                <h1>Scouting local deals for your week.</h1>
                <p>
                  Three shoppers are checking offers, then matching recipes.
                </p>
              </div>
              <button className="secondary" onClick={back}>
                Cancel
              </button>
            </div>
            <div className="demo-strip">
              Demo mode — simulated research{" "}
              <span>Sample offers, not live prices</span>
            </div>
            <div className="scout-grid">
              {event?.tasks.map((task) => (
                <section className="store-card" key={task.store.id}>
                  <div className="store-title">
                    <span className="store-letter">{task.store.id}</span>
                    <h2>{task.store.name}</h2>
                  </div>
                  <p
                    className={`status ${task.status === "Failed" ? "error" : ""}`}
                    aria-live="polite"
                  >
                    {task.status}
                  </p>
                  <button
                    className="preview"
                    onClick={() =>
                      setModal({
                        kind: "preview",
                        preview: task.preview,
                        store: task.store.name,
                      })
                    }
                  >
                    <img
                      src={task.preview}
                      alt={`${task.store.name} sample flyer`}
                    />
                    <span>
                      Sample preview <b>↗ Expand</b>
                    </span>
                  </button>
                  <div className="offers">
                    <p className="eyebrow">
                      {task.status === "Using saved data"
                        ? "SAMPLE SAVED OFFERS"
                        : "SAMPLE OFFERS"}
                    </p>
                    {task.offers.length ? (
                      task.offers.map((o) => (
                        <div key={o.id}>
                          <span>
                            {o.name}
                            <small>{o.packGrams} g / pack</small>
                          </span>
                          <strong>{yen(o.price)}</strong>
                        </div>
                      ))
                    ) : (
                      <p className="hint">
                        {task.status === "Failed"
                          ? "No sample offers available."
                          : "Waiting for sample offers…"}
                      </p>
                    )}
                  </div>
                </section>
              ))}
            </div>
            <div className="stages" aria-live="polite">
              {["Finding deals", "Matching recipes", "Planning dinners"].map(
                (stage, i) => (
                  <span
                    className={event?.stage === stage ? "current" : ""}
                    key={stage}
                  >
                    <b>{i + 1}</b>
                    {stage}
                  </span>
                ),
              )}
            </div>
            {event?.status === "failed" && (
              <div className="empty" role="alert">
                <h2>We couldn’t finish your week.</h2>
                <p>{event.error}</p>
                <button className="primary" onClick={back}>
                  Adjust preferences
                </button>
              </div>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
          </>
        )}
        {screen === "week" && source === "demo" && plan && (
          <>
            <div className="page-heading">
              <div>
                <span className="eyebrow">A LITTLE LESS ON YOUR PLATE</span>
                <h1>Your dinners, sorted.</h1>
                <p>7 dinners shaped by local deals — with variety built in.</p>
              </div>
              <button className="secondary" onClick={back}>
                Edit preferences
              </button>
            </div>
            <div className="week-meta">
              <span>
                Omotesando &amp; Aoyama <i>·</i> 1 person <i>·</i> 7 dinners
              </span>
              <span>Demo plan · Sample prices &amp; estimated nutrition</span>
            </div>
            <div className="summary-grid">
              <div>
                <span>Estimated basket total</span>
                <strong>{yen(plan.shopping.total)}</strong>
                <small>One shop at {plan.shopping.store.name}</small>
              </div>
              <div>
                <span>
                  {plan.shopping.total > p.budget
                    ? "Over budget"
                    : "Budget left"}
                </span>
                <strong
                  className={
                    plan.shopping.total > p.budget ? "warning" : "accent"
                  }
                >
                  {yen(Math.abs(p.budget - plan.shopping.total))}
                </strong>
                <small>of your {yen(p.budget)} weekly budget</small>
              </div>
              <div>
                <span>Protein target met</span>
                <strong>
                  {plan.proteinMet} <em>of 7 dinners</em>
                </strong>
                <small>{p.protein} g minimum per dinner</small>
              </div>
            </div>
            {plan.shopping.total > p.budget && (
              <p className="warning-banner">
                This sample plan exceeds your budget. Edit preferences to adjust
                your budget or pantry.
              </p>
            )}
            <p className="sr-only" role="status">
              {notice}
            </p>
            <div className="results-grid">
              <section className="meal-section">
                <div className="section-heading">
                  <h2>On the menu</h2>
                  <span>30 minutes or less</span>
                </div>
                <div className="meal-list">
                  {plan.meals.map((m, i) => (
                    <article className="meal-row" key={m.day}>
                      <span className="day">{m.day}</span>
                      <button
                        className="meal-open"
                        onClick={() => setModal({ kind: "detail", day: i })}
                        aria-label={`View ${m.day}: ${m.recipe.name}`}
                      >
                        <Photo
                          key={m.recipe.image}
                          src={m.recipe.image}
                          name={m.recipe.name}
                        />
                        <span className="meal-copy">
                          <strong>{m.recipe.name}</strong>
                          <span>{m.recipe.reason}</span>
                          <span className="meal-nutrition">
                            {m.recipe.minutes} min <i>·</i>{" "}
                            {m.nutrition.kcal ?? "Unknown"} kcal <i>·</i>{" "}
                            <b>{m.nutrition.protein ?? "Unknown"} g protein</b>
                            {(m.nutrition.protein === null ||
                              m.nutrition.protein < p.protein) && (
                              <em>Below target</em>
                            )}
                          </span>
                        </span>
                      </button>
                      <button
                        className="swap"
                        onClick={() => openSwap(i)}
                        disabled={busy}
                      >
                        Swap
                      </button>
                    </article>
                  ))}
                </div>
                {notice && <p className="update-notice">{notice}</p>}
                <p className="menu-note">
                  Freeze portions for later in the week. Photos are
                  illustrative; nutrition is estimated from sample ingredient
                  data.
                </p>
                <p className="menu-note">
                  Calorie target: {p.calories} kcal ·{" "}
                  {
                    plan.meals.filter(
                      (m) =>
                        m.nutrition.kcal !== null &&
                        m.nutrition.kcal < p.calories,
                    ).length
                  }{" "}
                  dinners below target. Budget takes priority over nutrition
                  targets.
                </p>
              </section>
              <aside className="shopping">
                <div className="section-heading">
                  <h2>Shopping list</h2>
                  <span>
                    {
                      plan.shopping.items.filter((x) => checked[x.product.id])
                        .length
                    }
                    /{plan.shopping.items.length} checked
                  </span>
                </div>
                <div className="recommended">
                  <span className="store-letter">{plan.shopping.store.id}</span>
                  <div>
                    <strong>{plan.shopping.store.name}</strong>
                    <small>Recommended · one-stop shop</small>
                  </div>
                </div>
                <div className="shopping-items">
                  {plan.shopping.items.map((item) => (
                    <label
                      className={`shopping-item ${checked[item.product.id] ? "checked" : ""}`}
                      key={item.product.id}
                    >
                      <input
                        type="checkbox"
                        checked={!!checked[item.product.id]}
                        onChange={(e) =>
                          setChecked({
                            ...checked,
                            [item.product.id]: e.target.checked,
                          })
                        }
                      />
                      <span>
                        <strong>{item.product.name}</strong>
                        <small>
                          {item.packs} × {item.product.packGrams} g{" "}
                          {changed.includes(item.product.id) && (
                            <b className="accent">· Quantity increased</b>
                          )}
                        </small>
                      </span>
                      <b>{yen(item.cost)}</b>
                    </label>
                  ))}
                </div>
                <div className="basket-total">
                  <strong>Estimated total</strong>
                  <strong>{yen(plan.shopping.total)}</strong>
                </div>
                <div className="at-home">
                  <h3>Already at home</h3>
                  <p>
                    {plan.shopping.atHome
                      .map((x) => x.ingredient.name)
                      .join(" · ") || "Nothing selected"}
                  </p>
                </div>
                <div className="second-stop">
                  <h3>Optional second stop</h3>
                  {plan.shopping.comparisons.length ? (
                    plan.shopping.comparisons.map((d) => (
                      <p key={d.id}>
                        <strong>
                          Store {d.storeId} · {d.name}
                        </strong>
                        <br />
                        {d.packGrams} g for {yen(d.price)}
                        <br />
                        <small>
                          Sample comparison only · not in basket total
                        </small>
                      </p>
                    ))
                  ) : (
                    <p>No lower comparable sample offers.</p>
                  )}
                </div>
              </aside>
            </div>
          </>
        )}
      </main>
      <footer>
        <span>Dinner Scout</span>
        <span>Good dinners. A lighter week.</span>
      </footer>
      {modal && (
        <Modal
          title={
            modal.kind === "preview"
              ? `${modal.store} · Sample preview`
              : modal.kind === "swap"
                ? `A different dinner for ${current?.day}`
                : current?.recipe.name || "Dinner details"
          }
          onClose={() => {
            if (!busy) {
              setModal(undefined);
              setError("");
            }
          }}
        >
          {modal.kind === "preview" ? (
            <>
              <img
                className="expanded-preview"
                src={modal.preview}
                alt="Fictional sample flyer"
              />
              <p className="hint">
                Local demo image. This is not a live store page.
              </p>
            </>
          ) : modal.kind === "swap" ? (
            <>
              <p className="muted">
                Choose from the remaining sample recipes that match your
                ingredient filters. Only this dinner will change.
              </p>
              {busy ? (
                <p role="status">Updating your plan…</p>
              ) : alternatives.length ? (
                alternatives.map((r) => (
                  <button
                    className="alternative"
                    key={r.id}
                    onClick={() => swap(r)}
                  >
                    <Photo src={r.image} name={r.name} />
                    <span>
                      <strong>{r.name}</strong>
                      <small>
                        {r.minutes} min · {r.reason}
                      </small>
                    </span>
                    <span>Choose →</span>
                  </button>
                ))
              ) : (
                <div className="empty">
                  <h3>No matching alternatives</h3>
                  <p>
                    Your current dinner is unchanged. Adjust preferences to
                    broaden the available recipes.
                  </p>
                </div>
              )}
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
            </>
          ) : (
            current && (
              <>
                <Photo src={current.recipe.image} name={current.recipe.name} />
                <p>{current.recipe.reason}</p>
                <div className="detail-nutrition">
                  {Object.entries(current.nutrition).map(([key, value]) => (
                    <div key={key}>
                      <strong>
                        {value ?? "Unknown"}
                        {key !== "kcal" && value !== null ? " g" : ""}
                      </strong>
                      <span>{key}</span>
                    </div>
                  ))}
                </div>
                <p className="hint">
                  Demo estimates · {current.recipe.minutes} min · Calorie target{" "}
                  {p.calories} kcal
                  {current.nutrition.kcal !== null &&
                  current.nutrition.kcal < p.calories
                    ? " · Below calorie target"
                    : ""}
                </p>
                <h3>Ingredients · 1 serving</h3>
                <div className="ingredients">
                  {current.recipe.ingredients.map((x) => (
                    <div key={x.ingredientId}>
                      <span>
                        {
                          catalog.ingredients.find(
                            (i) => i.id === x.ingredientId,
                          )?.name
                        }
                      </span>
                      <span>{x.grams} g</span>
                      <small>
                        {p.pantry.includes(x.ingredientId) ? "At home" : "Buy"}
                      </small>
                    </div>
                  ))}
                </div>
                <p className="hint">
                  Source: original demo fixture. Not a verified Cookpad recipe.
                  Ingredient weights are raw; rice is dry weight.
                </p>
                <button className="secondary" disabled>
                  View recipe · Japanese
                </button>
                <p className="hint">Recipe link available after integration</p>
              </>
            )
          )}
        </Modal>
      )}
    </>
  );
}
