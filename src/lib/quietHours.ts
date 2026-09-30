/**
 * Quiet hours, as a pure function.
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

/**
 * Push a time out of quiet hours, if it landed inside them.
 *
 * Spec §3.2: a snooze that would fire at 22:30 inside a 22:00–06:00 window
 * moves to 06:01. Returns the original when quiet hours are off or the time is
 * already outside, so the caller can tell whether an override happened.
 *
 * Only reminders reach this. Morning motivation is exempt by construction —
 * it carries no snooze actions at all, because the time it arrives is the
 * entire point of it.
 */
export function applyQuietHours(
  at: Date,
  quiet: QuietHours,
): { at: Date; overridden: boolean } {
  if (!quiet.on) return { at, overridden: false };

  const [fromH, fromM] = quiet.from.split(":").map(Number);
  const [toH, toM] = quiet.to.split(":").map(Number);
  const minutes = at.getHours() * 60 + at.getMinutes();
  const fromMin = fromH * 60 + fromM;
  const toMin = toH * 60 + toM;

  // The window normally wraps midnight (22:00 → 06:00), so "inside" is two
  // ranges rather than one. A non-wrapping window (09:00 → 17:00) is a single
  // range, and someone will eventually configure one.
  const wraps = fromMin > toMin;
  const inside = wraps
    ? minutes >= fromMin || minutes < toMin
    : minutes >= fromMin && minutes < toMin;

  if (!inside) return { at, overridden: false };

  const out = new Date(at);
  out.setHours(toH, toM + 1, 0, 0);
  // Crossing midnight into the morning means the end of the window is tomorrow.
  if (out.getTime() <= at.getTime()) out.setDate(out.getDate() + 1);
  return { at: out, overridden: true };
}
