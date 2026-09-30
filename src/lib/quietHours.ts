/**
 * Quiet hours, as pure functions.
 *
 * Two rules, by what the notification is:
 *   - A daily reminder set inside quiet hours is skipped (inQuietHours). Moving
 *     it piled every evening reminder onto 06:01 — "Dinner" at breakfast time.
 *   - A snooze that lands inside is moved to when they end (applyQuietHours).
 *     The user asked for that one-off, so it still arrives.
 *
 * Its own module because both the scheduler (notifications.ts, for daily
 * reminders) and the snooze handler (snooze.ts) need it, and snooze.ts already
 * imports the scheduler — putting it in either would make a cycle. No imports,
 * so snooze.test.ts can run it under plain node.
 */

export interface QuietHours {
  on: boolean;
  from: string;
  to: string;
}

const toMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/**
 * Whether a clock time ("HH:MM") falls inside quiet hours.
 *
 * The window normally wraps midnight (22:00 → 06:00), so "inside" is two
 * ranges rather than one; a daytime window (09:00 → 17:00) is a single range.
 * The start minute is inside, the end minute is not. Equal start and end is
 * no window at all.
 */
export function inQuietHours(hhmm: string, quiet: QuietHours): boolean {
  if (!quiet.on) return false;
  const minutes = toMinutes(hhmm);
  const fromMin = toMinutes(quiet.from);
  const toMin = toMinutes(quiet.to);
  return fromMin > toMin
    ? minutes >= fromMin || minutes < toMin
    : minutes >= fromMin && minutes < toMin;
}

/**
 * Push a snooze out of quiet hours, if it landed inside them.
 *
 * Spec §3.2: a snooze that would fire at 22:30 inside a 22:00–06:00 window
 * moves to 06:01. Returns the original when quiet hours are off or the time is
 * already outside, so the caller can tell whether an override happened.
 *
 * Morning motivation is exempt by construction — it carries no snooze actions
 * at all, because the time it arrives is the entire point of it.
 */
export function applyQuietHours(
  at: Date,
  quiet: QuietHours,
): { at: Date; overridden: boolean } {
  const hhmm = `${at.getHours()}:${at.getMinutes()}`;
  if (!inQuietHours(hhmm, quiet)) return { at, overridden: false };

  const [toH, toM] = quiet.to.split(":").map(Number);
  const out = new Date(at);
  out.setHours(toH, toM + 1, 0, 0);
  // Crossing midnight into the morning means the end of the window is tomorrow.
  if (out.getTime() <= at.getTime()) out.setDate(out.getDate() + 1);
  return { at: out, overridden: true };
}
