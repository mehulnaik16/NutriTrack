/**
 * The daily digest and the alarms — the half of the ops bot that speaks first.
 *
 * Mounted at GET /api/ops-digest and driven by Vercel Cron. The agent in
 * ops-agent.ts answers when asked; this runs whether or not anyone remembers to
 * ask, which is the only reason a broken payment path gets noticed the morning
 * it breaks rather than the week a customer complains.
 *
 * EVERY THRESHOLD IS RELATIVE. A constant tuned for 24 users is wrong at 500,
 * and an alarm that fires every day is one you stop reading — including on the
 * day it matters. Each check below compares against this system's own trailing
 * behaviour, so it stays meaningful as the numbers grow.
 *
 * Authenticated by CRON_SECRET, because a public URL that sends a Telegram
 * message on request is a way to make your own alerts untrustworthy.
 */

import { snapshot } from "./metrics";
import { sendAlert, telegramConfigured } from "./telegram";

type Severity = "critical" | "warning" | "info";

interface Finding {
  severity: Severity;
  title: string;
  detail: string;
}

const ICON: Record<Severity, string> = {
  critical: "🔴",
  warning: "🟠",
  info: "🔵",
};

const num = (v: unknown, fallback = 0): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;

interface DayPoint {
  date: string;
  signups: number;
  active: number;
  food_logs: number;
}

/**
 * Everything worth waking up for, derived from one snapshot.
 *
 * Ordered by severity when rendered, not here — the checks are grouped by what
 * they are about so a future reader can find the one they want.
 */
function findings(s: Record<string, unknown>): Finding[] {
  const out: Finding[] = [];

  const users = (s.users ?? {}) as Record<string, unknown>;
  const revenue = (s.revenue ?? {}) as Record<string, unknown>;
  const funnel = (s.funnel ?? {}) as Record<string, unknown>;
  const health = (s.health ?? {}) as Record<string, unknown>;
  const growth = Array.isArray(s.growth) ? (s.growth as DayPoint[]) : [];

  // ── Money ──────────────────────────────────────────────────────────────────

  // A charge with a payment id but no amount is a capture bug, not free access.
  const zeroCharges = num(revenue.zero_amount_charges);
  if (zeroCharges > 0) {
    out.push({
      severity: "critical",
      title: "Charges recorded at ₹0",
      detail: `${zeroCharges} charge(s) have a payment id but amount_paise = 0. Revenue is being under-recorded — subscription.activated payloads carry no payment entity, so the amount read returns null.`,
    });
  }

  // The webhook is the only thing that can grant access. An empty table with
  // subscriptions present means it has never been delivered successfully.
  if (num(health.webhook_events_total) === 0 && num(revenue.subs_total) > 0) {
    out.push({
      severity: "critical",
      title: "Razorpay webhook has never fired",
      detail: `${num(revenue.subs_total)} subscription(s) exist but webhook_events is empty. Check the endpoint is registered in the Razorpay dashboard and points at /api/razorpay-webhook. A real payment would not grant access.`,
    });
  }

  // Only meaningful once money has ever moved.
  const hoursSinceCharge = num(health.hours_since_charge, -1);
  if (hoursSinceCharge > 72) {
    out.push({
      severity: "warning",
      title: "No charge in 3 days",
      detail: `Last charge was ${Math.round(hoursSinceCharge)}h ago.`,
    });
  }

  if (num(health.open_refund_requests) > 0) {
    out.push({
      severity: "info",
      title: "Refund requests waiting",
      detail: `${num(health.open_refund_requests)} open.`,
    });
  }

  // ── Activation ─────────────────────────────────────────────────────────────

  // The step people actually fall out of. Reported as a finding rather than a
  // line in the digest because at these rates it is the headline.
  const signedUp = num(funnel.signed_up);
  const loggedOnce = num(funnel.logged_once);
  if (signedUp >= 10 && loggedOnce / signedUp < 0.5) {
    const never = signedUp - loggedOnce;
    out.push({
      severity: "warning",
      title: "Most users never log anything",
      detail: `${never} of ${signedUp} finished onboarding and never logged a single item. Activation, not retention, is the constraint.`,
    });
  }

  // ── Growth ─────────────────────────────────────────────────────────────────

  // Yesterday against the trailing week, excluding yesterday itself so a bad
  // day cannot flatten its own baseline.
  if (growth.length >= 8) {
    const yesterday = growth[growth.length - 2];
    const baseline = growth.slice(-9, -2);
    const meanSignups =
      baseline.reduce((a, d) => a + num(d.signups), 0) / baseline.length;

    if (meanSignups >= 1 && num(yesterday?.signups) < meanSignups * 0.3) {
      out.push({
        severity: "warning",
        title: "Signups well below normal",
        detail: `${num(yesterday?.signups)} yesterday against a 7-day mean of ${meanSignups.toFixed(1)}.`,
      });
    }
  }

  const activeNow = num(users.active_users);
  const usersPrev = num(users.users_prev_period);
  if (usersPrev >= 5 && num(users.users_new) < usersPrev * 0.5) {
    out.push({
      severity: "warning",
      title: "New users down week on week",
      detail: `${num(users.users_new)} this period against ${usersPrev} last.`,
    });
  }

  // ── System ─────────────────────────────────────────────────────────────────

  if (num(health.notifications_overdue) > 0) {
    out.push({
      severity: "warning",
      title: "Notifications overdue",
      detail: `${num(health.notifications_overdue)} still pending more than an hour past their scheduled time.`,
    });
  }

  if (num(health.profiles_missing_targets) > 0) {
    out.push({
      severity: "info",
      title: "Profiles without a calorie target",
      detail: `${num(health.profiles_missing_targets)} — these users cannot see a goal.`,
    });
  }

  if (signedUp >= 10 && activeNow === 0) {
    out.push({
      severity: "warning",
      title: "Nobody logged food this period",
      detail:
        "Zero active users. Verify the app still works before assuming disinterest.",
    });
  }

  return out;
}

function render(s: Record<string, unknown>, found: Finding[]): string {
  const users = (s.users ?? {}) as Record<string, unknown>;
  const revenue = (s.revenue ?? {}) as Record<string, unknown>;
  const engagement = (s.engagement ?? {}) as Record<string, unknown>;
  const funnel = (s.funnel ?? {}) as Record<string, unknown>;

  const date = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date());

  const lines = [
    `📊 Dombelz · ${date}`,
    ``,
    `Users        ${num(users.users_total)}  (+${num(users.users_new)} this week)`,
    `Active 7d    ${num(users.active_users)}`,
    `Access now   ${num(users.holding_access)} of ${num(users.trials_started)} trials`,
    `Revenue 30d  ₹${num(revenue.gross_rupees)}`,
    `Food logs    ${num(engagement.food_logs)}`,
    `Workouts     ${num(engagement.workout_logs)}`,
    ``,
    `Funnel  ${num(funnel.signed_up)} signed up → ${num(funnel.logged_once)} logged once → ${num(funnel.logged_3_days)} logged 3 days → ${num(funnel.subscribed)} paid`,
  ];

  if (found.length === 0) {
    lines.push(``, `✅ Nothing needs attention.`);
    return lines.join("\n");
  }

  const rank: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };
  const sorted = [...found].sort((a, b) => rank[a.severity] - rank[b.severity]);

  lines.push(``);
  for (const f of sorted) {
    lines.push(`${ICON[f.severity]} ${f.title}`, `   ${f.detail}`);
  }

  return lines.join("\n");
}

/**
 * Build and send the digest.
 *
 * Exported so it can be triggered by hand while testing, without waiting for
 * the cron or exposing the endpoint.
 */
export async function runDigest(): Promise<{ sent: boolean; body: string }> {
  const { metrics, errors } = await snapshot(7);

  // A tool failing is more urgent than anything it would have reported. Without
  // this the digest renders zeros across the board and signs off with "nothing
  // needs attention" — a broken system reporting itself healthy, which is worse
  // than no digest at all. Found exactly this way: a missing
  // SUPABASE_SERVICE_ROLE_KEY produced a clean-looking all-zero report.
  const found: Finding[] = errors.length
    ? [
        {
          severity: "critical",
          title: `${errors.length} of 7 metric tools failed`,
          detail: `${errors[0].error}. Figures below are incomplete and must not be read as real.`,
        },
        ...findings(metrics),
      ]
    : findings(metrics);

  const body = render(metrics, found);

  if (!telegramConfigured()) return { sent: false, body };

  // Sent through sendAlert so it inherits the same delivery, escaping and
  // failure handling as every other alert. A distinct throttle key, and one
  // per calendar day, so a retried cron cannot post twice.
  const sent = await sendAlert({
    severity: found.some((f) => f.severity === "critical")
      ? "critical"
      : found.length
        ? "warning"
        : "info",
    title: "Daily digest",
    detail: { report: body },
    throttleKey: `digest:${new Date().toISOString().slice(0, 10)}`,
  });

  return { sent, body };
}

/**
 * GET /api/ops-digest
 *
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET` when that variable is
 * set on the project. Without the check anyone could trigger the digest, which
 * is not dangerous but is a good way to teach yourself to ignore the channel.
 */
export async function handleOpsDigest(request: Request): Promise<Response> {
  const secret = (process.env.CRON_SECRET ?? "").trim();
  if (!secret) {
    console.error("[ops-digest] CRON_SECRET is not set");
    return new Response("Not configured", { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Forbidden", { status: 403 });
  }

  try {
    const { sent, body } = await runDigest();
    return new Response(JSON.stringify({ ok: true, sent, body }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[ops-digest] failed:", message);
    // A digest that fails silently is indistinguishable from a quiet day, which
    // is the one outcome this whole feature exists to prevent.
    await sendAlert({
      severity: "critical",
      title: "Daily digest failed to run",
      detail: { error: message },
      throttleKey: "digest-failed",
    });
    return new Response("Digest failed", { status: 500 });
  }
}
