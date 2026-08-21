import { Fragment } from "react";
import { Pencil } from "lucide-react";
import {
  MUSCLE_EMOJI,
  type StandardMuscle,
  type CustomPlan,
  activeMuscles,
  isRestDay,
  tableColumnCount,
} from "@/lib/musclePlan";

/**
 * The custom plan as a dynamic-column table — view only by default.
 * Pass `onEditDay` to show a pencil icon per row (edit page only).
 */
export function CustomPlanTable({
  plan,
  todayIdx,
  onSaveDay: _onSaveDay,
  onEditDay,
}: {
  plan: CustomPlan;
  /** Row to badge as "Today", or -1 for none. */
  todayIdx: number;
  onSaveDay: (dayIdx: number, muscles: StandardMuscle[]) => Promise<void>;
  /** When provided, shows a pencil button per row that calls this. */
  onEditDay?: (dayIdx: number) => void;
}) {
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
            {onEditDay && <th className="w-8" />}
          </tr>
        </thead>
        <tbody>
          {plan.days.map((d, i) => {
            const act = activeMuscles(d);
            const rest = isRestDay(d);
            const isToday = i === todayIdx;
            return (
              <Fragment key={d.day}>
                <tr
                  className={`border-b border-border/50 transition-colors last:border-b-0 ${isToday ? "bg-accent/10" : ""}`}
                >
                  <td
                    className={`px-3 py-2.5 font-semibold ${isToday ? "text-accent" : ""}`}
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
                            {MUSCLE_EMOJI["Rest Day"]} Rest Day
                          </span>
                        ) : (
                          <span className="text-muted-foreground/40">-</span>
                        )
                      ) : act[c] ? (
                        <span className="font-medium">
                          {MUSCLE_EMOJI[act[c] as StandardMuscle] ?? ""} {act[c]}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/40">-</span>
                      )}
                    </td>
                  ))}
                  {onEditDay && (
                    <td className="pr-2 py-2.5 text-right">
                      <button
                        onClick={() => onEditDay(i)}
                        aria-label={`Edit ${d.day}`}
                        className="rounded p-1 text-muted-foreground transition-colors hover:text-accent"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

