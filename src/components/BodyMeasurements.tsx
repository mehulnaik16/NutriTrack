/**
 * Body measurements — the profile sub-page at /profile?page=measurements.
 *
 * A logging screen, not a dashboard: pick a body part, type the number, log.
 * Values stage locally as you move between chips so one tap writes a whole
 * session, which is what the jsonb column and the merging RPC exist for.
 *
 * Biceps and Thigh are per-side. Their card splits into two columns so the
 * imbalance between limbs — the thing anyone who measures both arms actually
 * wants to know — is visible as you enter it, rather than being thrown away by
 * a single input.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Calendar as CalendarIcon, Minus, Plus, Ruler } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SubHeader } from "@/components/SubHeader";
import { supabase } from "@/integrations/client";
import { todayLocal } from "@/lib/dates";
import {
  METRICS,
  STEP,
  type MeasurementRow,
  type Metric,
  type Side,
  deltaFor,
  fieldKey,
  fieldKeys,
  formatValues,
  imbalance,
  imbalanceLabel,
  inRange,
  latestFor,
  round1,
  step,
} from "@/lib/measurements";

/** RPCs are untyped in this repo — types.ts leaves Functions empty. Same
 *  escape hatch as ReferAndEarn.tsx and FriendsPanel.tsx. */
const rpc = (fn: string, args?: Record<string, unknown>) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabase.rpc as any)(fn, args);

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export function BodyMeasurementsPage({
  userId,
  onBack,
}: {
  userId: string;
  onBack: () => void;
}) {
  const [rows, setRows] = useState<MeasurementRow[]>([]);
  const [metricId, setMetricId] = useState(METRICS[0].id);
  /** Storage key -> the raw string in its input. Kept as typed text so a
   *  half-entered "3" does not get coerced to a number mid-keystroke. */
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [date, setDate] = useState(todayLocal());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const metric = useMemo(
    () => METRICS.find((m) => m.id === metricId) ?? METRICS[0],
    [metricId],
  );

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("body_measurements")
      .select("measured_at, measurements, note")
      .eq("user_id", userId)
      .order("measured_at", { ascending: false });
    setRows((data as MeasurementRow[]) ?? []);
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const setValue = (key: string, value: string) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const clearKey = (key: string) =>
    setDraft((d) => {
      const next = { ...d };
      delete next[key];
      return next;
    });

  const bump = (key: string, by: number) => {
    const current = parseFloat(draft[key] ?? "");
    // Stepping from empty starts at the last logged value if there is one, so
    // the common "same as last week, plus a bit" case is two taps.
    const base = Number.isFinite(current)
      ? current
      : (latestFor(rows, key)?.value ?? metric.min);
    setValue(key, String(step(metric.id, base, by)));
  };

  /** Staged values that are real numbers, keyed for storage. */
  const staged = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [key, raw] of Object.entries(draft)) {
      const n = parseFloat(raw);
      if (Number.isFinite(n)) out[key] = round1(n);
    }
    return out;
  }, [draft]);

  /** A staged value outside its metric's range blocks the save rather than
   *  raising a dismissable "is this right?" dialog. */
  const outOfRange = useMemo(
    () =>
      METRICS.flatMap((m) =>
        fieldKeys(m).filter((k) => k in staged && !inRange(m.id, staged[k])),
      ),
    [staged],
  );

  const stagedCount = METRICS.filter((m) =>
    fieldKeys(m).some((k) => k in staged),
  ).length;

  const canSave =
    Object.keys(staged).length > 0 && outOfRange.length === 0 && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const { error } = await rpc("log_body_measurements", {
        entries: staged,
        on_date: date,
        entry_note: note.trim() || null,
      });
      if (error) throw error;
      toast.success("Measurements logged!");
      setDraft({});
      setNote("");
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Couldn't save that");
    } finally {
      setSaving(false);
    }
  };

  const diff = imbalance(rows, metric.id);

  return (
    <div className="min-h-screen bg-background pb-24">
      <SubHeader title="Body measurements" onBack={onBack} />
      <main className="mx-auto max-w-lg space-y-6 px-4 py-6">
        {/* ── Which body part ───────────────────────────────────────── */}
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
          {METRICS.map((m) => {
            const active = m.id === metric.id;
            const hasStaged = fieldKeys(m).some((k) => k in staged);
            return (
              <button
                key={m.id}
                onClick={() => setMetricId(m.id)}
                aria-pressed={active}
                className={`flex min-h-[44px] shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors ${
                  active
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-border bg-card text-muted-foreground hover:border-accent/50"
                }`}
              >
                <span aria-hidden>{m.emoji}</span>
                {m.label}
                {hasStaged && (
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${active ? "bg-accent-foreground" : "bg-accent"}`}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* ── The value card ────────────────────────────────────────── */}
        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-bold">
            <span aria-hidden>{metric.emoji}</span> {metric.label}
          </h2>

          {metric.sided ? (
            <div className="grid grid-cols-2 divide-x divide-border">
              <SideColumn
                metric={metric}
                side="left"
                draft={draft}
                rows={rows}
                onChange={setValue}
                onBump={bump}
              />
              <SideColumn
                metric={metric}
                side="right"
                draft={draft}
                rows={rows}
                onChange={setValue}
                onBump={bump}
                mirrorFrom={draft[fieldKey(metric.id, "left")]}
              />
            </div>
          ) : (
            <ValueInput
              metric={metric}
              fieldId={fieldKey(metric.id)}
              draft={draft}
              onChange={setValue}
              onBump={bump}
              large
            />
          )}

          {/* Imbalance: stated flat, no colour and no threshold — calling a
              given gap concerning is a judgement this app can't make. */}
          {metric.sided && (
            <p className="mt-4 border-t border-border pt-3 text-sm font-medium text-muted-foreground">
              {imbalanceLabel(diff) ?? "Log both sides to see the difference"}
            </p>
          )}

          <LastLogged metric={metric} rows={rows} />

          {outOfRange.some((k) => fieldKeys(metric).includes(k)) && (
            <p className="mt-2 text-xs font-medium text-warn">
              {metric.label} should be between {metric.min} and {metric.max} cm.
            </p>
          )}
        </section>

        {/* ── When, and anything worth remembering ──────────────────── */}
        <section className="space-y-3 rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Date</span>
            <div className="relative flex items-center">
              <input
                type="date"
                value={date}
                max={todayLocal()}
                onChange={(e) => setDate(e.target.value || todayLocal())}
                aria-label="Measurement date"
                className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
              />
              <span className="flex items-center gap-1.5 border-b border-dashed border-accent/50 pb-0.5 font-semibold">
                {new Date(date).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
                <CalendarIcon className="h-3.5 w-3.5 text-accent" />
              </span>
            </div>
          </div>

          <div>
            <label
              htmlFor="measurement-note"
              className="text-xs text-muted-foreground"
            >
              Note (optional)
            </label>
            <Input
              id="measurement-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Morning, before training…"
              className="mt-1 bg-muted/30"
            />
          </div>
        </section>

        {/* ── What's about to be written ────────────────────────────── */}
        {stagedCount > 0 && (
          <section className="rounded-2xl border border-accent/30 bg-accent/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {stagedCount} ready to log
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {METRICS.map((m) => {
                const keys = fieldKeys(m).filter((k) => k in staged);
                if (!keys.length) return null;
                const shown = fieldKeys(m)
                  .map((k) => (k in staged ? staged[k] : "—"))
                  .join(" / ");
                return (
                  <button
                    key={m.id}
                    onClick={() => fieldKeys(m).forEach(clearKey)}
                    aria-label={`Remove ${m.label}`}
                    className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium hover:border-accent/50"
                  >
                    {m.label} {shown} cm ✕
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <Button
          onClick={save}
          disabled={!canSave}
          className="h-14 w-full gap-2 rounded-xl bg-accent text-base font-bold text-accent-foreground hover:bg-accent/90"
        >
          <Ruler className="h-4 w-4" />
          {saving ? "Saving…" : "Log measurement"}
        </Button>

        {/* ── History ───────────────────────────────────────────────── */}
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Recent
          </h3>
          {rows.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Nothing logged yet. Your first entry becomes the baseline
              everything else is measured against.
            </p>
          ) : (
            <ul className="space-y-2">
              {rows.slice(0, 5).map((r) => (
                <li
                  key={r.measured_at}
                  className="rounded-xl border border-border bg-card p-4"
                >
                  <p className="text-xs font-semibold text-muted-foreground">
                    {new Date(r.measured_at).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                  <div className="mt-2 space-y-1">
                    {/* Walk METRICS, not the jsonb keys, so a sided pair reads
                        as one line and the order matches the chip row. */}
                    {METRICS.map((m) => {
                      const values = formatValues(r, m);
                      if (!values) return null;
                      return (
                        <div
                          key={m.id}
                          className="flex items-center justify-between text-sm"
                        >
                          <span className="text-muted-foreground">
                            <span aria-hidden>{m.emoji}</span> {m.label}
                          </span>
                          <span className="font-display font-semibold">
                            {values} cm
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  {r.note && (
                    <p className="mt-2 text-xs italic text-muted-foreground">
                      {r.note}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

/** One half of a sided card. The `same as left` affordance only ever appears on
 *  the right, because copying in the other direction is not a thing anyone does. */
function SideColumn({
  metric,
  side,
  draft,
  rows,
  onChange,
  onBump,
  mirrorFrom,
}: {
  metric: Metric;
  side: Side;
  draft: Record<string, string>;
  rows: MeasurementRow[];
  onChange: (key: string, value: string) => void;
  onBump: (key: string, by: number) => void;
  mirrorFrom?: string;
}) {
  const key = fieldKey(metric.id, side);
  const last = latestFor(rows, key);
  // Offered only when there is something to copy and nothing to overwrite —
  // pre-filling would invent a measurement the user never took.
  const canMirror = side === "right" && !!mirrorFrom && !draft[key];

  return (
    <div className={side === "left" ? "pr-3" : "pl-3"}>
      <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {side}
      </p>
      <ValueInput
        metric={metric}
        fieldId={key}
        draft={draft}
        onChange={onChange}
        onBump={onBump}
      />
      {canMirror ? (
        <button
          onClick={() => onChange(key, mirrorFrom!)}
          className="mt-2 text-[11px] font-medium text-accent hover:underline"
        >
          Same as left ({mirrorFrom})
        </button>
      ) : (
        last && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            was {last.value}
          </p>
        )
      )}
    </div>
  );
}

function ValueInput({
  metric,
  fieldId,
  draft,
  onChange,
  onBump,
  large,
}: {
  metric: Metric;
  fieldId: string;
  draft: Record<string, string>;
  onChange: (key: string, value: string) => void;
  onBump: (key: string, by: number) => void;
  large?: boolean;
}) {
  const minus = (
    <StepButton
      label={`Decrease ${metric.label}`}
      onClick={() => onBump(fieldId, -STEP)}
    >
      <Minus className="h-4 w-4" />
    </StepButton>
  );
  const plus = (
    <StepButton
      label={`Increase ${metric.label}`}
      onClick={() => onBump(fieldId, STEP)}
    >
      <Plus className="h-4 w-4" />
    </StepButton>
  );

  const field = (
    <Input
      type="number"
      inputMode="decimal"
      step="0.1"
      min={metric.min}
      max={metric.max}
      value={draft[fieldId] ?? ""}
      onChange={(e) => onChange(fieldId, e.target.value)}
      placeholder="0.0"
      aria-label={`${metric.label} in centimetres`}
      // The md: sizes are not decoration. The base Input carries md:text-sm,
      // and a responsive variant outranks a plain text-3xl from 768px up —
      // without these the number silently shrinks to 14px on a laptop.
      className={`h-14 border-0 bg-muted/30 text-center font-display font-bold ${
        large ? "pr-9 text-3xl md:text-3xl" : "text-2xl md:text-2xl"
      }`}
    />
  );

  // A sided metric gets half a card. Flanking the input there leaves it ~35px
  // wide carrying 48px of padding — a zero-width content box that clips every
  // digit on a phone. Stacking hands the number the full column.
  if (!large) {
    return (
      <div>
        {field}
        <div className="mt-2 flex items-center justify-center gap-3">
          {minus}
          <span className="text-xs text-muted-foreground">cm</span>
          {plus}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {minus}
      <div className="relative min-w-0 flex-1">
        {field}
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          cm
        </span>
      </div>
      {plus}
    </div>
  );
}

function StepButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:border-accent/50 hover:text-accent"
    >
      {children}
    </button>
  );
}

/** Last logged, plus the change since the one before it. */
function LastLogged({
  metric,
  rows,
}: {
  metric: Metric;
  rows: MeasurementRow[];
}) {
  const keys = fieldKeys(metric);
  const entries = keys.map((k) => latestFor(rows, k));
  if (entries.every((e) => e === null)) {
    return (
      <p className="mt-3 text-xs text-muted-foreground">
        No {metric.label.toLowerCase()} logged yet — this will be your first.
      </p>
    );
  }

  const when = entries.find((e) => e !== null)!.date;
  const values = entries.map((e) => e?.value ?? "—").join(" / ");
  const delta = deltaFor(rows, keys[0]);

  return (
    <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
      <span>
        Last {values} cm · {shortDate(when)}
      </span>
      {delta !== null && delta !== 0 && (
        <span className="font-semibold text-foreground">
          {delta > 0 ? "▲" : "▼"} {delta > 0 ? "+" : ""}
          {delta}
        </span>
      )}
    </p>
  );
}
