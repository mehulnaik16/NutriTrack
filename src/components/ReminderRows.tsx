/**
 * Custom reminder list — add, edit, delete.
 *
 * Each row becomes one repeating OS alarm (daily at a fixed local time), so ten
 * reminders cost ten of the 64 pending slots iOS allows rather than ten per
 * day. That is what leaves room for the 30-day motivation window alongside.
 *
 * Rows are compact (time, name, note, switch) and open into an inline editor
 * on tap, so the list reads as a schedule rather than a stack of forms.
 *
 * Every mutation reschedules through the caller's onChanged, because a row the
 * user just edited that still fires at yesterday's time is worse than one that
 * never saved — they have been told it took effect.
 */
import { useState } from "react";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  addReminder,
  deleteReminder,
  updateReminder,
  LABEL_MAX,
  NOTE_MAX,
  REMINDER_MAX,
  type Reminder,
} from "@/lib/notification-settings";

/** The grouped-list surface shared with the notifications page. */
export const LIST_CLASS =
  "overflow-hidden rounded-2xl border border-border bg-card divide-y divide-border";

export function ReminderRows({
  userId,
  reminders,
  disabled,
  onChanged,
}: {
  userId: string;
  reminders: Reminder[];
  /** The master switch is off — rows stay visible but inert. */
  disabled: boolean;
  onChanged: () => Promise<void>;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const mutate = async (
    id: string,
    fn: () => Promise<{ error: string | null }>,
  ) => {
    setBusyId(id);
    const { error } = await fn();
    if (error) toast.error(error);
    else await onChanged();
    setBusyId(null);
  };

  const add = async () => {
    setAdding(true);
    const { id, error } = await addReminder(
      userId,
      // A time in the future rather than the small hours, so a user who adds
      // one and forgets still sees it work.
      { label: "New reminder", remindAt: "09:00" },
      reminders.length,
    );
    if (error) toast.error(error);
    else {
      await onChanged();
      // Straight into the editor: a reminder called "New reminder" is only
      // ever the first step.
      setOpenId(id);
    }
    setAdding(false);
  };

  const full = reminders.length >= REMINDER_MAX;

  return (
    <div className={LIST_CLASS}>
      {reminders.length === 0 && (
        <p className="px-4 py-4 text-sm text-muted-foreground">
          No reminders yet. Add one for a meal, the gym, or water.
        </p>
      )}

      {reminders.map((r) => {
        const open = openId === r.id;
        return (
          <div
            key={r.id}
            className={
              busyId === r.id || disabled || !r.enabled ? "opacity-60" : ""
            }
          >
            <div className="flex items-center gap-3 px-4 py-3">
              <button
                type="button"
                onClick={() => setOpenId(open ? null : r.id)}
                aria-expanded={open}
                aria-label={`Edit ${r.label}`}
                className="flex min-w-0 flex-1 items-center gap-4 text-left"
              >
                <span className="w-14 shrink-0 font-display text-lg font-semibold tabular-nums">
                  {r.remindAt}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {r.label}
                  </span>
                  {r.note && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {r.note}
                    </span>
                  )}
                </span>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                    open ? "rotate-180" : ""
                  }`}
                />
              </button>
              <Switch
                checked={r.enabled}
                disabled={disabled}
                onCheckedChange={(on) =>
                  mutate(r.id, () => updateReminder(r.id, { enabled: on }))
                }
                aria-label={`Enable ${r.label}`}
              />
            </div>

            {open && (
              <div className="grid grid-cols-[1fr_auto] gap-2 px-4 pb-4">
                {/* Uncontrolled with onBlur rather than onChange: writing on
                    every keystroke would be a database round trip and a full
                    reschedule per character typed. */}
                <Input
                  defaultValue={r.label}
                  maxLength={LABEL_MAX}
                  disabled={disabled}
                  onBlur={(e) => {
                    const label = e.target.value.trim();
                    if (!label || label === r.label) {
                      e.target.value = r.label;
                      return;
                    }
                    mutate(r.id, () => updateReminder(r.id, { label }));
                  }}
                  className="h-10"
                  aria-label="Reminder name"
                />
                <Input
                  type="time"
                  defaultValue={r.remindAt}
                  disabled={disabled}
                  onChange={(e) =>
                    e.target.value &&
                    mutate(r.id, () =>
                      updateReminder(r.id, { remindAt: e.target.value }),
                    )
                  }
                  className="h-10 w-28 text-center tabular-nums"
                  aria-label="Reminder time"
                />
                <Input
                  defaultValue={r.note ?? ""}
                  maxLength={NOTE_MAX}
                  disabled={disabled}
                  placeholder="Note, e.g. eat 30g protein"
                  onBlur={(e) => {
                    const note = e.target.value;
                    if (note === (r.note ?? "")) return;
                    mutate(r.id, () => updateReminder(r.id, { note }));
                  }}
                  className="col-span-2 h-10"
                  aria-label="Reminder note"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="col-span-2 justify-self-start gap-2 px-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => mutate(r.id, () => deleteReminder(r.id))}
                >
                  <Trash2 className="h-4 w-4" />
                  Delete reminder
                </Button>
              </div>
            )}
          </div>
        );
      })}

      <button
        type="button"
        onClick={add}
        disabled={adding || disabled || full}
        className="flex w-full items-center justify-between px-4 py-3.5 text-sm font-medium text-accent transition-colors hover:bg-muted/40 disabled:cursor-not-allowed disabled:text-muted-foreground disabled:hover:bg-transparent"
      >
        <span className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          {full ? "Reminder limit reached" : "Add reminder"}
        </span>
        <span className="text-xs font-normal text-muted-foreground">
          {reminders.length} of {REMINDER_MAX}
        </span>
      </button>
    </div>
  );
}
