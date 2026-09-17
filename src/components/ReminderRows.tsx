/**
 * Custom reminder rows — add, edit, delete.
 *
 * Each row becomes one repeating OS alarm (daily at a fixed local time), so ten
 * reminders cost ten of the 64 pending slots iOS allows rather than ten per
 * day. That is what leaves room for the 30-day motivation window alongside.
 *
 * Every mutation reschedules through the caller's onChanged, because a row the
 * user just edited that still fires at yesterday's time is worse than one that
 * never saved — they have been told it took effect.
 */
import { useState } from "react";
import { Bell, Plus, Trash2 } from "lucide-react";
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
    const { error } = await addReminder(
      userId,
      // Matches the spec's default row. A time in the future rather than the
      // small hours, so a user who adds one and forgets still sees it work.
      { label: "New reminder", remindAt: "09:00" },
      reminders.length,
    );
    if (error) toast.error(error);
    else await onChanged();
    setAdding(false);
  };

  return (
    <div className="flex flex-col gap-2">
      {reminders.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-xl bg-muted/40 px-4 py-8 text-center">
          <Bell className="h-6 w-6 text-muted-foreground/50" />
          <p className="text-sm font-medium">No reminders yet</p>
          <p className="max-w-xs text-xs text-muted-foreground">
            Add one for breakfast, or the gym, or whenever you keep forgetting
            to log.
          </p>
        </div>
      )}

      {reminders.map((r) => (
        <div
          key={r.id}
          className={`flex flex-col gap-2 rounded-xl border border-border/60 p-3 ${
            busyId === r.id ? "opacity-60" : ""
          } ${disabled || !r.enabled ? "opacity-60" : ""}`}
        >
          <div className="flex items-center gap-2">
            <Switch
              checked={r.enabled}
              disabled={disabled}
              onCheckedChange={(on) =>
                mutate(r.id, () => updateReminder(r.id, { enabled: on }))
              }
              aria-label={`Enable ${r.label}`}
            />

            {/* Uncontrolled with onBlur rather than onChange: writing on every
                keystroke would be a database round trip and a full reschedule
                per character typed. */}
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
              className="h-9 flex-1 border-0 bg-transparent px-1 font-semibold focus-visible:bg-muted/40"
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
              className="h-9 w-28 text-center"
              aria-label="Reminder time"
            />

            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() => mutate(r.id, () => deleteReminder(r.id))}
              aria-label={`Delete ${r.label}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          <Input
            defaultValue={r.note ?? ""}
            maxLength={NOTE_MAX}
            disabled={disabled}
            placeholder="Add a note — e.g. eat 30g protein"
            onBlur={(e) => {
              const note = e.target.value;
              if (note === (r.note ?? "")) return;
              mutate(r.id, () => updateReminder(r.id, { note }));
            }}
            className="h-8 border-0 bg-transparent px-1 text-xs text-muted-foreground focus-visible:bg-muted/40"
            aria-label="Reminder note"
          />
        </div>
      ))}

      <Button
        variant="outline"
        onClick={add}
        disabled={adding || disabled || reminders.length >= REMINDER_MAX}
        className="h-11 w-full gap-2 rounded-xl"
      >
        <Plus className="h-4 w-4" />
        {reminders.length >= REMINDER_MAX
          ? `Maximum ${REMINDER_MAX} reminders`
          : "Add reminder"}
      </Button>
    </div>
  );
}
