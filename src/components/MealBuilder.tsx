/**
 * Build a meal ingredient by ingredient, for brands that publish figures per
 * ingredient (California Burrito). Generic: it only reads a RestaurantBuilder.
 *
 * The strip at the top is the meal itself — every pick adds a block as wide as
 * its calories, coloured by what it is — so what makes a bowl heavy is visible
 * before any number is read. The totals are plain sums of the brand's figures.
 */
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, Loader2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  buildFood,
  isFixed,
  missingSteps,
  picked,
  toggle,
  totals,
  type BuilderMeal,
  type BuilderSize,
  type Picks,
  type RestaurantBuilder,
  type StepKind,
} from "@/lib/mealBuilder";
import type { IFCTItem } from "@/lib/foodDb";

const KIND: Record<StepKind, { label: string; bg: string }> = {
  main: { label: "Protein and mains", bg: "bg-orange-500" },
  base: { label: "Rice, shell, tortilla", bg: "bg-amber-300" },
  beans: { label: "Beans", bg: "bg-violet-500" },
  veg: { label: "Toppings", bg: "bg-emerald-500" },
  sauce: { label: "Sauces and dips", bg: "bg-pink-500" },
};
/** The strip is full at this many kcal, so a light bowl reads as light. */
const STRIP_FULL = 800;
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export function MealBuilder({
  builder,
  meal,
  size,
  picks,
  onSize,
  onPicks,
  onBack,
  onLog,
  onSaveUsual,
}: {
  builder: RestaurantBuilder;
  meal: BuilderMeal;
  size: BuilderSize;
  picks: Picks;
  onSize: (sizeKey: string) => void;
  onPicks: (picks: Picks) => void;
  onBack: () => void;
  onLog: (food: IFCTItem) => void;
  /** Resolves true once saved. */
  onSaveUsual: () => Promise<boolean>;
}) {
  const steps = size.steps.filter((s) => !isFixed(s));
  const fixed = size.steps.filter(isFixed);
  // Open on the first step still to do: a reopened or usual build lands at the end.
  const [at, setAt] = useState(() => {
    const i = steps.findIndex((s) => missingSteps(size, picks).includes(s));
    return i < 0 ? Math.max(0, steps.length - 1) : i;
  });
  const step = steps[Math.min(at, steps.length - 1)];
  const [problem, setProblem] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const advance = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(advance.current), []);
  // A different size has different steps: start from its first.
  const shownSize = useRef(size.key);
  useEffect(() => {
    if (shownSize.current !== size.key) setAt(0);
    shownSize.current = size.key;
  }, [size.key]);
  // Each step opens at its top, with its tab in view.
  const root = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    root.current?.closest('[role="dialog"]')?.scrollTo({ top: 0 });
    root.current
      ?.querySelector('[aria-current="step"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [at]);

  const t = totals(size, picks);
  const parts = picked(size, picks).filter(({ option }) => option.kcal > 0);
  const done = (key: string) => (picks[key]?.length ?? 0) > 0;

  const pick = (name: string) => {
    setProblem("");
    setSaved(false);
    onPicks(toggle(step, picks, name));
    // One choice made: straight on to the next step, as at the counter.
    if (step.pick === "one" && at < steps.length - 1) {
      clearTimeout(advance.current);
      advance.current = setTimeout(() => setAt(at + 1), 220);
    }
  };

  /** True when every required step is picked; otherwise goes to the first gap. */
  const check = () => {
    const missing = missingSteps(size, picks)[0];
    if (!missing) return true;
    setAt(steps.indexOf(missing));
    setProblem(`Pick your ${missing.title.toLowerCase()} first`);
    return false;
  };

  const save = async () => {
    if (!check()) return;
    setSaving(true);
    const ok = await onSaveUsual();
    setSaving(false);
    setSaved(ok);
  };

  return (
    <div ref={root} className="space-y-3">
      {/* Stays in view while the list scrolls: the meal and what it adds up to. */}
      <div className="sticky -top-4 z-10 -mx-4 space-y-3 border-b border-border bg-background px-4 pb-3 pt-4 sm:-top-6 sm:-mx-6 sm:px-6 sm:pt-6">
        <div className="flex items-center gap-2 pr-8">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={onBack}
            aria-label="Back to meals"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <p className="font-display text-base font-bold leading-tight">
              {meal.name}
            </p>
            <p className="text-xs text-muted-foreground">{builder.brand}</p>
          </div>
        </div>

        {meal.sizes.length > 1 && (
          <div
            role="radiogroup"
            aria-label="Size"
            className="grid gap-1 rounded-lg bg-muted p-1"
            style={{ gridTemplateColumns: `repeat(${meal.sizes.length}, 1fr)` }}
          >
            {meal.sizes.map((s) => (
              <button
                key={s.key}
                type="button"
                role="radio"
                aria-checked={s.key === size.key}
                onClick={() => {
                  setProblem("");
                  setSaved(false);
                  onSize(s.key);
                }}
                className={cn(
                  "rounded-md px-2 py-1.5 text-xs font-semibold transition-colors",
                  s.key === size.key
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}

        <div>
          <div
            className="flex h-7 overflow-hidden rounded-md bg-muted"
            role="img"
            aria-label={`${Math.round(t.kcal)} kcal so far`}
          >
            {parts.map(({ step: s, option }) => (
              <div
                key={`${s.key}-${option.name}`}
                title={`${option.name}: ${option.kcal} kcal`}
                className={cn(
                  "h-full border-r border-background transition-[width] duration-300 motion-reduce:transition-none",
                  KIND[s.kind].bg,
                )}
                style={{
                  width: `${(option.kcal / Math.max(t.kcal, STRIP_FULL)) * 100}%`,
                }}
              />
            ))}
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="font-display text-3xl font-bold tabular-nums leading-none">
              {Math.round(t.kcal)}
            </span>
            <span className="text-sm text-muted-foreground">kcal</span>
            <span className="ml-auto text-xs tabular-nums text-muted-foreground">
              P {fmt(+t.protein.toFixed(1))} · C {fmt(+t.carbs.toFixed(1))} · F{" "}
              {fmt(+t.fat.toFixed(1))} g
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
            {[...new Set(size.steps.map((s) => s.kind))].map((k) => (
              <span key={k} className="inline-flex items-center gap-1">
                <span className={cn("h-2 w-2 rounded-sm", KIND[k].bg)} />
                {KIND[k].label}
              </span>
            ))}
          </div>
        </div>

        {steps.length > 1 && (
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
            {steps.map((s, i) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setAt(i)}
                aria-current={s === step ? "step" : undefined}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                  s === step
                    ? "border-primary bg-primary text-primary-foreground"
                    : done(s.key)
                      ? "border-accent/50 text-foreground"
                      : "border-border text-muted-foreground",
                )}
              >
                {i + 1}. {s.title}
                {s !== step && done(s.key) && (
                  <Check className="h-3 w-3 text-accent" aria-label="done" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {fixed.map((s) => (
        <p key={s.key} className="text-xs text-muted-foreground">
          Includes {s.options[0].name}, {s.options[0].kcal} kcal
        </p>
      ))}

      <div>
        <div className="mb-1.5 flex items-baseline justify-between">
          <p className="text-sm font-semibold">{step.title}</p>
          <p className="text-xs text-muted-foreground">
            {step.pick === "one" ? "Pick one" : "Pick any, or skip"}
          </p>
        </div>
        <div
          role={step.pick === "one" ? "radiogroup" : "group"}
          aria-label={step.title}
          className="divide-y divide-border rounded-lg border border-border"
        >
          {step.options.map((o) => {
            const on = picks[step.key]?.includes(o.name) ?? false;
            return (
              <button
                key={o.name}
                type="button"
                role={step.pick === "one" ? "radio" : "checkbox"}
                aria-checked={on}
                onClick={() => pick(o.name)}
                className={cn(
                  "flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors first:rounded-t-lg last:rounded-b-lg",
                  on ? "bg-accent/10" : "hover:bg-muted/60",
                )}
              >
                <span
                  className={cn(
                    "flex h-[18px] w-[18px] shrink-0 items-center justify-center border-[1.5px]",
                    step.pick === "one" ? "rounded-full" : "rounded",
                    on
                      ? "border-accent bg-accent text-accent-foreground"
                      : "border-muted-foreground/50",
                  )}
                >
                  {on && <Check className="h-3 w-3" strokeWidth={3} />}
                </span>
                <span className="min-w-0 flex-1">{o.name}</span>
                <span className="shrink-0 text-right text-xs tabular-nums leading-tight text-muted-foreground">
                  {o.kcal} kcal
                  <br />
                  {fmt(o.protein)} g protein
                </span>
              </button>
            );
          })}
        </div>
        {step.pick === "any" && at < steps.length - 1 && (
          <div className="mt-2 flex justify-end">
            <Button variant="outline" size="sm" onClick={() => setAt(at + 1)}>
              Next: {steps[at + 1].title}
            </Button>
          </div>
        )}
      </div>

      <div className="sticky -bottom-4 z-10 -mx-4 space-y-1.5 border-t border-border bg-background px-4 pb-4 pt-3 sm:-bottom-6 sm:-mx-6 sm:px-6 sm:pb-6">
        {problem && (
          <p className="text-xs font-medium text-destructive" role="alert">
            {problem}
          </p>
        )}
        {saved && !problem && (
          <p className="text-xs text-muted-foreground" aria-live="polite">
            Saved to your usuals and Favourites.
          </p>
        )}
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="shrink-0"
            onClick={save}
            disabled={saving || saved}
          >
            {saving ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Star
                className={cn(
                  "mr-1.5 h-4 w-4",
                  saved && "fill-current text-accent",
                )}
              />
            )}
            {saved ? "Saved" : "Save usual"}
          </Button>
          <Button
            className="min-w-0 flex-1 bg-accent text-accent-foreground hover:bg-accent/90"
            onClick={() =>
              check() && onLog(buildFood(builder, meal, size, picks))
            }
          >
            Log 1 {size.unit} · {Math.round(t.kcal)} kcal
          </Button>
        </div>
      </div>
    </div>
  );
}
