import { Fragment, useState } from "react";
import { Loader2, PencilRuler } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  STANDARD_MUSCLE_GROUPS,
  MUSCLE_EMOJI,
  MAX_MUSCLES_PER_DAY,
  type StandardMuscle,
  type CustomPlan,
  activeMuscles,
  isRestDay,
  tableColumnCount,
} from "@/lib/musclePlan";

/** Inline muscle-group picker for editing a single custom-plan day in place. */
function DayMuscleEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial: StandardMuscle[];
  onSave: (muscles: StandardMuscle[]) => Promise<void>;
  onCancel: () => void;
}) {
  const [sel, setSel] = useState<StandardMuscle[]>(initial);
  const [saving, setSaving] = useState(false);

  const toggle = (m: StandardMuscle) => {
    if (m === "Rest Day") {
      setSel(sel.includes("Rest Day") ? [] : ["Rest Day"]);
      return;
    }
    const withoutRest = sel.filter((x) => x !== "Rest Day");
    if (withoutRest.includes(m)) {
      setSel(withoutRest.filter((x) => x !== m));
    } else if (withoutRest.length < MAX_MUSCLES_PER_DAY) {
      setSel([...withoutRest, m]);
    }
  };

  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-3 gap-1.5">
        {STANDARD_MUSCLE_GROUPS.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => toggle(m)}
            className={`rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition-colors ${
              sel.includes(m)
                ? "border-accent bg-accent/10 text-accent"
                : "border-border bg-card text-muted-foreground hover:border-muted-foreground/40"
            }`}
          >
            {MUSCLE_EMOJI[m]} {m}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            await onSave(sel);
            setSaving(false);
          }}
          className="h-8 flex-1 rounded-full bg-accent text-xs font-bold text-accent-foreground hover:bg-accent/90"
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            "Save day"
          )}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onCancel}
          className="h-8 rounded-full text-xs"
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

/**
 * The custom plan as a dynamic-column table, one pencil per row that opens
 * the in-place day editor. Used both inside the Workout page's plan card and
 * as the whole body of the standalone edit view.
 */
export function CustomPlanTable({
  plan,
  todayIdx,
  onSaveDay,
}: {
  plan: CustomPlan;
  /** Row to badge as "Today", or -1 for none. */
  todayIdx: number;
  onSaveDay: (dayIdx: number, muscles: StandardMuscle[]) => Promise<void>;
}) {
  const [editing, setEditing] = useState<number | null>(null);
  const colCount = tableColumnCount(plan.days);

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            <th className="px-3 py-2.5 font-bold uppercase tracking-wider text-muted-foreground">
              Days
            </th>
            {Array.from({ length: colCount }, (_, i) => (
              <th
                key={i}
                className="px-3 py-2.5 font-bold uppercase tracking-wider text-muted-foreground"
              >
                Muscle {i + 1}
              </th>
            ))}
            <th className="w-8 px-2 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {plan.days.map((d, i) => {
            const act = activeMuscles(d);
            const rest = isRestDay(d);
            const isToday = i === todayIdx;
            const isEditing = editing === i;
            return (
              <Fragment key={d.day}>
                <tr
                  className={`border-b border-border/50 transition-colors last:border-b-0 ${isToday ? "bg-accent/10" : ""
                    }`}
                >
                  <td
                    className={`px-3 py-2.5 font-semibold ${isToday ? "text-accent" : ""
                      }`}
                  >
                    {d.day}
                    {isToday && (
                      <span className="ml-1.5 rounded-full bg-accent px-1.5 py-0.5 text-[8px] font-bold uppercase text-accent-foreground">
                        Today
                      </span>
                    )}
                  </td>
                  {Array.from({ length: colCount }, (_, c) => (
                    <td key={c} className="px-3 py-2.5">
                      {rest ? (
                        c === 0 ? (
                          <span className="italic text-muted-foreground">
                            Rest Day
                          </span>
                        ) : (
                          <span className="text-muted-foreground/40">-</span>
                        )
                      ) : act[c] ? (
                        <span className="font-medium">{act[c]}</span>
                      ) : (
                        <span className="text-muted-foreground/40">-</span>
                      )}
                    </td>
                  ))}
                  <td className="px-2 py-2.5">
                    <button
                      type="button"
                      aria-label={`Edit ${d.day}`}
                      onClick={() => setEditing(isEditing ? null : i)}
                      className="text-muted-foreground transition-colors hover:text-accent"
                    >
                      <PencilRuler className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
                {isEditing && (
                  <tr className="border-b border-border/50 bg-muted/10 last:border-b-0">
                    <td colSpan={colCount + 2} className="px-3 py-3">
                      <DayMuscleEditor
                        initial={act}
                        onCancel={() => setEditing(null)}
                        onSave={async (muscles) => {
                          await onSaveDay(i, muscles);
                          setEditing(null);
                        }}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
