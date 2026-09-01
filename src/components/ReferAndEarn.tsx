/**
 * Refer & Earn — the profile sub-page at /profile?page=refer.
 *
 * Two tracks, both reading real rows from `referrals` via get_referral_summary():
 *   Free — +5 trial days per qualified referral, accrual capped at 60 days.
 *   Paid — 60 premium days per friend who buys the Yearly plan.
 *
 * The paid track renders its real, empty state today: nothing sets a referral to
 * 'subscribed' until a payment flow exists. When one ships, a single UPDATE in
 * its webhook fills this in with no change here.
 *
 * Copy rule: this is a gift, not a promotion. No "discount", "offer", "promo",
 * "limited time" or "deal" — except in Terms, which must be unambiguous.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowDown,
  Check,
  ChevronRight,
  Clock,
  Copy,
  Gift,
  Link2,
  Lock,
  Mail,
  MessageCircle,
  MessageSquare,
  Pencil,
  RotateCcw,
  Share2,
  Sparkles,
  User,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { SubHeader } from "@/components/SubHeader";
import { supabase } from "@/integrations/client";
import { findPlan, REFERRAL_DISCOUNT_PLAN_ID } from "@/lib/plans";
import {
  DAYS_PER_REFERRAL,
  MAX_FREE_DAYS,
  MAX_PREMIUM_DAYS,
  MILESTONES,
  PREMIUM_DAYS_PER_SUBSCRIPTION,
  PREMIUM_HOLD_DAYS,
  REFEREE_DISCOUNT_RUPEES,
  freeDaysEarned,
  giftMessage,
  isPremiumProcessing,
  premiumDaysEarned,
  referralUrl,
  type ReferralRow,
} from "@/lib/referral";
import { getBillingSummary } from "@/lib/billing";

/** RPCs are untyped in this repo — types.ts leaves Functions empty. Same
 *  escape hatch as FriendsPanel.tsx and RankPage.tsx. */
const rpc = (fn: string, args?: Record<string, unknown>) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabase.rpc as any)(fn, args);

const yearly = findPlan(REFERRAL_DISCOUNT_PLAN_ID);

type Platform = "whatsapp" | "sms" | "email" | "copy";

export function ReferAndEarnPage({
  userId,
  onBack,
}: {
  userId: string;
  onBack: () => void;
}) {
  const [code, setCode] = useState<string | null>(null);
  const [fullName, setFullName] = useState<string | null>(null);
  const [rows, setRows] = useState<ReferralRow[] | null>(null);
  const [copied, setCopied] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  /** Which tile the user came in on, so the composer opens on their choice. */
  const [platform, setPlatform] = useState<Platform>("whatsapp");
  const [editing, setEditing] = useState(false);
  /** bonus_premium_days as the fold computed it. null until the read lands. */
  const [creditedDays, setCreditedDays] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [profile, summary] = await Promise.all([
        supabase
          .from("user_profiles")
          .select("full_name, referral_code")
          .eq("id", userId)
          .maybeSingle(),
        rpc("get_referral_summary"),
      ]);
      if (cancelled) return;
      setCode(profile.data?.referral_code ?? null);
      setFullName(profile.data?.full_name ?? null);
      // An error here is not fatal — the page still shows the code to share.
      setRows((summary.data as ReferralRow[]) ?? []);
      // Separate call on purpose: get_billing_summary() recomputes first, which
      // is what makes a hold that quietly elapsed show up here without a cron.
      getBillingSummary()
        .then((b) => {
          if (!cancelled) setCreditedDays(b.bonus_premium_days);
        })
        .catch(() => {
          /* the tracker falls back to the row count */
        });
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const shareUrl = code ? referralUrl(code) : "";

  const [message, setMessage] = useState("");
  const defaultMessage = useMemo(
    () =>
      code ? giftMessage({ senderName: fullName, code, url: shareUrl }) : "",
    [code, fullName, shareUrl],
  );
  // Seed the composer once the code arrives, without clobbering a user's edit.
  useEffect(() => {
    setMessage((m) => (m ? m : defaultMessage));
  }, [defaultMessage]);

  const qualified =
    rows?.filter((r) => r.status === "trial" || r.status === "subscribed")
      .length ?? 0;
  const subscribed = rows?.filter((r) => r.status === "subscribed") ?? [];
  const freeDays = freeDaysEarned(qualified);
  // Three states, not two. A friend who just bought is "processing" until the
  // 3-day hold elapses — the days are real but not yet spendable, and a refund
  // inside the window means they never land at all.
  const processing = subscribed.filter((r) =>
    isPremiumProcessing(r.subscribed_at),
  );
  const cleared = subscribed.filter((r) => !isPremiumProcessing(r.subscribed_at));
  // What the fold actually granted, clawbacks and holds included. The count
  // above is what the rows imply; this is what the database says, and the
  // database is the authority.
  const premiumDays = creditedDays ?? premiumDaysEarned(cleared.length);

  const copy = useCallback(async (text: string, msg: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(msg);
      return true;
    } catch {
      toast.error("Couldn't copy — select and copy manually");
      return false;
    }
  }, []);

  const copyCode = async () => {
    if (!code) return;
    if (await copy(code, "Invite ID copied!")) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  /**
   * Hand the message off. Nothing here claims the gift was *sent* — once the
   * message leaves for another app we cannot know it landed, so only the copy
   * path, which completes here, gets a success toast.
   */
  const send = async (target: Platform) => {
    const text = message || defaultMessage;
    if (!text) return;
    setPlatform(target);

    if (target === "copy") {
      await copy(text, "🎁 Gift copied — paste it to your friend!");
      setComposerOpen(false);
      return;
    }

    const encoded = encodeURIComponent(text);

    if (target === "whatsapp") {
      // wa.me is https, so a new tab is right: the browser or the Android
      // WebView hands it to the installed app.
      const opened = window.open(
        `https://wa.me/?text=${encoded}`,
        "_blank",
        "noopener,noreferrer",
      );
      if (!opened) {
        // Popup blocked. The system share sheet beats a dead button.
        if (navigator.share) {
          try {
            await navigator.share({
              title: "A gift for you",
              text,
              url: shareUrl,
            });
          } catch {
            /* the user backed out of the share sheet */
          }
        } else {
          await copy(text, "🎁 Gift copied — paste it to your friend!");
        }
      }
      setComposerOpen(false);
      return;
    }

    // ponytail: sms:/mailto: go through window.location, not window.open —
    // a custom scheme opened with "_blank" is silently dropped by the Capacitor
    // Android WebView, which is why SMS did nothing before.
    // ponytail: UA sniff, because iOS wants sms:&body= and everyone else wants
    // sms:?body=. No feature detect exists; revisit if a third form appears.
    const iOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
    window.location.href =
      target === "sms"
        ? `sms:${iOS ? "&" : "?"}body=${encoded}`
        : `mailto:?subject=${encodeURIComponent("A gift for you 🎁")}&body=${encoded}`;
    setComposerOpen(false);
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <SubHeader title="Refer & Earn" onBack={onBack} />
      <main className="mx-auto max-w-lg space-y-6 px-4 py-6">
        {/* ── Hero: the permanent invite ID ─────────────────────────── */}
        <section className="relative overflow-hidden rounded-2xl border border-accent/30 bg-card p-6 text-center">
          <div className="pointer-events-none absolute -top-20 left-1/2 h-48 w-80 -translate-x-1/2 rounded-full bg-accent/15 blur-3xl" />
          <div className="relative">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/15 text-accent">
              <Gift className="h-8 w-8" />
            </div>
            <h2 className="font-display text-xl font-bold">
              Share a gift, extend your trial
            </h2>
            <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground">
              Every friend who joins and starts a trial adds {DAYS_PER_REFERRAL}{" "}
              free days to yours.
            </p>

            <div className="mt-6">
              <p className="mb-2 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                <Lock className="h-3 w-3" /> Your permanent invite ID
              </p>
              <button
                onClick={copyCode}
                disabled={!code}
                className="group flex w-full items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-accent/50 bg-accent/5 px-6 py-3 transition-colors hover:border-accent disabled:opacity-50"
              >
                <span className="font-display text-2xl font-bold tracking-[0.2em] text-accent">
                  {code ?? "········"}
                </span>
                {copied ? (
                  <Check className="h-4 w-4 text-accent" />
                ) : (
                  <Copy className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-accent" />
                )}
              </button>
              <p className="mt-2 text-xs text-muted-foreground">
                This ID is yours for good — it never changes.
              </p>
            </div>

            <Button
              onClick={() => setComposerOpen(true)}
              disabled={!code}
              className="mt-5 h-12 w-full gap-2 rounded-xl bg-accent font-bold text-accent-foreground hover:bg-accent/90"
            >
              <Share2 className="h-4 w-4" /> Send a gift
            </Button>

            <div className="mt-4 grid grid-cols-4 gap-2">
              {SHARE_BUTTONS.map((b) => (
                <button
                  key={b.platform}
                  onClick={() => {
                    setPlatform(b.platform);
                    setComposerOpen(true);
                  }}
                  disabled={!code}
                  className="flex min-h-[64px] flex-col items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-1 py-2 transition-colors hover:border-accent/50 disabled:opacity-50"
                >
                  <b.icon className={`h-5 w-5 ${b.tint}`} />
                  <span className="text-[11px] font-medium text-muted-foreground">
                    {b.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* ── Free trial accumulation ───────────────────────────────── */}
        <section className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-baseline justify-between">
            <h3 className="text-sm font-bold">Free Trial Accumulation</h3>
            <span className="font-display text-sm font-bold text-accent">
              {freeDays} / {MAX_FREE_DAYS} Days
            </span>
          </div>

          <Progress
            value={(freeDays / MAX_FREE_DAYS) * 100}
            className="mt-3 h-2.5 bg-muted"
            indicatorClassName="bg-gradient-to-r from-warn to-accent"
          />

          <p className="mt-2 text-xs text-muted-foreground">
            Referred: {qualified} {qualified === 1 ? "person" : "people"}
          </p>

          <div className="mt-5 flex items-center justify-between">
            {MILESTONES.map((m) => {
              const hit = qualified >= m;
              return (
                <div key={m} className="flex flex-col items-center gap-1.5">
                  <div
                    className={
                      hit
                        ? "glow-accent-sm flex h-9 w-9 items-center justify-center rounded-full bg-accent text-accent-foreground"
                        : "flex h-9 w-9 items-center justify-center rounded-full border border-dashed border-border bg-muted/40 text-muted-foreground"
                    }
                  >
                    {hit ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <span className="text-xs font-bold">{m}</span>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground">{m}</span>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Free days stop adding up at {MAX_FREE_DAYS}, reached on your{" "}
            {MAX_FREE_DAYS / DAYS_PER_REFERRAL}th referral. Keep inviting as
            many friends as you like — the last badges are just for the bragging
            rights.
          </p>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <Stat
              label="People Referred"
              value={String(qualified)}
              hint={`+${DAYS_PER_REFERRAL} days each`}
            />
            <Stat
              label="Free Days Earned"
              value={String(freeDays)}
              hint={`Max ${MAX_FREE_DAYS}`}
            />
          </div>
        </section>

        {/* ── Paid subscription rewards ─────────────────────────────── */}
        <section className="rounded-2xl border border-border bg-card p-5">
          <h3 className="flex items-center gap-1.5 text-sm font-bold">
            <Sparkles className="h-4 w-4 text-[var(--fat)]" /> When a friend
            subscribes, you both win
          </h3>

          <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <div className="rounded-xl border border-[var(--fat)]/30 bg-[var(--fat)]/10 p-3 text-center">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                You get
              </p>
              <p className="mt-1 font-display text-lg font-bold text-[var(--fat)]">
                {PREMIUM_DAYS_PER_SUBSCRIPTION} days
              </p>
              <p className="text-[11px] text-muted-foreground">
                Premium access
              </p>
            </div>
            <ArrowDown className="h-4 w-4 rotate-[-90deg] text-muted-foreground" />
            <div className="rounded-xl border border-accent/30 bg-accent/10 p-3 text-center">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Your friend gets
              </p>
              <p className="mt-1 font-display text-lg font-bold text-accent">
                ₹{REFEREE_DISCOUNT_RUPEES}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {yearly
                  ? `${yearly.name} plan · ₹${yearly.price} → ₹${yearly.price - REFEREE_DISCOUNT_RUPEES}`
                  : "Yearly plan"}
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-border bg-muted/20 p-4">
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-bold">Paid Referral Tracker</span>
              <span className="text-xs font-semibold text-[var(--fat)]">
                {subscribed.length} subscribed
              </span>
            </div>
            <Progress
              value={Math.min(
                100,
                (premiumDays / MAX_PREMIUM_DAYS) * 100,
              )}
              className="mt-2 h-2 bg-muted"
              indicatorClassName="bg-[var(--fat)]"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Premium days earned: {premiumDays}
              {premiumDays >= MAX_PREMIUM_DAYS && " (maximum reached)"}
            </p>
            {processing.length > 0 && (
              <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-warn">
                <Clock className="h-3.5 w-3.5" />
                {processing.length === 1
                  ? `${PREMIUM_DAYS_PER_SUBSCRIPTION} days processing`
                  : `${processing.length * PREMIUM_DAYS_PER_SUBSCRIPTION} days processing`}{" "}
                — they land {PREMIUM_HOLD_DAYS} days after your friend pays.
              </p>
            )}
          </div>

          <div className="mt-4">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Users className="h-3.5 w-3.5" /> Friends who subscribed
            </p>
            {subscribed.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                No one yet. When a friend you invited picks the{" "}
                {yearly?.name ?? "Yearly"} plan, they'll show up here.
              </p>
            ) : (
              <ul className="space-y-2">
                {subscribed.map((r, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-3 rounded-xl border border-border p-3"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--fat)]/15 font-display text-sm font-bold text-[var(--fat)]">
                      {(r.referee_name ?? "?").charAt(0).toUpperCase()}
                    </span>
                    <span className="flex-1 truncate text-sm font-medium">
                      {r.referee_name ?? "A friend"}
                    </span>
                    {isPremiumProcessing(r.subscribed_at) ? (
                      <Badge className="bg-warn/20 text-[10px] text-warn">
                        Processing
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">
                        {r.subscribed_at?.slice(0, 10) ?? "Subscribed"}
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>



        {/* ── Full-page explainer + legal ───────────────────────────── */}
        <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          <Link
            to="/refer-how-it-works"
            className="flex items-center justify-between px-4 py-3 text-sm font-medium transition-colors hover:bg-accent/5"
          >
            How Refer &amp; Earn Works
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
          <Link
            to="/refer-terms"
            className="flex items-center justify-between px-4 py-3 text-sm font-medium transition-colors hover:bg-accent/5"
          >
            Terms &amp; Conditions
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        </div>
      </main>

      {/* ── The Gift Composer ───────────────────────────────────────── */}
      <Drawer open={composerOpen} onOpenChange={setComposerOpen}>
        <DrawerContent className="max-h-[85vh]">
          <DrawerHeader className="text-left">
            <DrawerTitle className="flex items-center gap-2 text-base">
              <Gift className="h-4 w-4 text-accent" /> Send this gift to a
              friend
            </DrawerTitle>
          </DrawerHeader>

          <div className="space-y-4 overflow-y-auto px-4 pb-6">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/15 text-accent">
                <User className="h-3.5 w-3.5" />
              </span>
              <p className="text-xs text-muted-foreground">
                Sending as{" "}
                <span className="font-semibold text-foreground">
                  {fullName ?? "you"}
                </span>
              </p>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                🎁 Your gift message
              </p>

              {editing ? (
                <Textarea
                  id="gift-message"
                  aria-label="Your gift message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={9}
                  className="resize-none bg-muted/30 text-sm leading-relaxed"
                />
              ) : (
                <p className="whitespace-pre-wrap rounded-xl border border-l-4 border-warn/30 border-l-warn bg-warn/10 p-4 text-sm leading-relaxed">
                  {message || defaultMessage}
                </p>
              )}

              <div className="mt-2 flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 flex-1 gap-1.5 text-xs"
                  onClick={() => setEditing((e) => !e)}
                >
                  <Pencil className="h-3 w-3" />{" "}
                  {editing ? "Done" : "Edit message"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 flex-1 gap-1.5 text-xs"
                  onClick={() => {
                    setMessage(defaultMessage);
                    setEditing(false);
                  }}
                  disabled={message === defaultMessage}
                >
                  <RotateCcw className="h-3 w-3" /> Reset to default
                </Button>
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Choose where to send it
              </p>
              <div className="grid grid-cols-4 gap-2">
                {SHARE_BUTTONS.map((b) => {
                  const selected = b.platform === platform;
                  return (
                    <button
                      key={b.platform}
                      onClick={() => send(b.platform)}
                      aria-pressed={selected}
                      className={`flex min-h-[64px] flex-col items-center justify-center gap-1.5 rounded-xl border bg-card px-1 py-2 transition-colors ${
                        selected
                          ? "border-accent ring-2 ring-accent/40"
                          : "border-border hover:border-accent/50"
                      }`}
                    >
                      <b.icon className={`h-5 w-5 ${b.tint}`} />
                      <span className="text-[11px] font-medium text-muted-foreground">
                        {b.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground">
              Your friend needs to finish signing up and start a trial before
              the gift lands on both sides.
            </p>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

/** `tint` carries WhatsApp's brand green as a literal — it is a third party's
 *  colour, not part of the Dombelz palette, so it earns no theme token. */
const SHARE_BUTTONS: {
  platform: Platform;
  label: string;
  icon: typeof Mail;
  tint: string;
}[] = [
  {
    platform: "whatsapp",
    label: "WhatsApp",
    icon: MessageCircle,
    tint: "text-[#25D366]",
  },
  { platform: "sms", label: "SMS", icon: MessageSquare, tint: "text-accent" },
  { platform: "email", label: "Email", icon: Mail, tint: "text-accent" },
  {
    platform: "copy",
    label: "Copy",
    icon: Link2,
    tint: "text-muted-foreground",
  },
];

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/20 p-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-display text-2xl font-bold">{value}</p>
      <p className="text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}
