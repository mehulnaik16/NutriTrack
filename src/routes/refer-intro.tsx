import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Gift,
  Lock,
  Copy,
  Check,
  Share2,
  Users,
  Smartphone,
  PartyPopper,
  Star,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/client";
import {
  DAYS_PER_REFERRAL,
  PREMIUM_DAYS_PER_SUBSCRIPTION,
  REFEREE_DISCOUNT_RUPEES,
  referralUrl,
  giftMessage,
} from "@/lib/referral";
import { findPlan, REFERRAL_DISCOUNT_PLAN_ID } from "@/lib/plans";

export const Route = createFileRoute("/refer-intro")({ component: ReferIntro });

const yearly = findPlan(REFERRAL_DISCOUNT_PLAN_ID);
const discountedPrice = yearly ? yearly.price - REFEREE_DISCOUNT_RUPEES : null;

const STEPS = [
  { icon: Users, title: "Share", sub: "Send your gift code" },
  { icon: Smartphone, title: "Friend signs up", sub: "(OTP verified)" },
  { icon: PartyPopper, title: "You both get rewarded", sub: "Instantly" },
];

function ReferIntro() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [code, setCode] = useState<string | null>(null);
  const [fullName, setFullName] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/login", replace: true });
      return;
    }
    let cancelled = false;
    supabase
      .from("user_profiles")
      .select("referral_code, full_name, has_seen_refer_intro")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        if (!data) {
          navigate({ to: "/quiz", replace: true });
          return;
        }
        // Already dismissed — never show again, even on a manual URL.
        if (data.has_seen_refer_intro) {
          navigate({ to: "/dashboard", replace: true });
          return;
        }
        setCode(data.referral_code ?? null);
        setFullName(data.full_name ?? null);
        setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, loading, navigate]);

  const shareUrl = code ? referralUrl(code) : "";

  const copyCode = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success("Gift code copied!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy — select and copy manually");
    }
  };

  // Hand the message to the system share sheet; fall back to clipboard. Same
  // approach as ReferAndEarn's send(), trimmed to one path.
  const share = async () => {
    if (!code) return;
    const text = giftMessage({ senderName: fullName, code, url: shareUrl });
    if (navigator.share) {
      try {
        await navigator.share({ title: "A gift for you 🎁", text, url: shareUrl });
        return;
      } catch {
        /* user dismissed the share sheet */
        return;
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success("🎁 Gift copied — paste it to your friend!");
    } catch {
      toast.error("Couldn't copy — select and copy manually");
    }
  };

  // Both "Skip for now" and "Continue to Dashboard" run this: mark seen, leave.
  const dismiss = async () => {
    if (!user || leaving) return;
    setLeaving(true);
    const { error } = await supabase
      .from("user_profiles")
      .update({ has_seen_refer_intro: true })
      .eq("id", user.id);
    if (error) toast.error(error.message);
    navigate({ to: "/dashboard", replace: true });
  };

  if (loading || checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background pb-28">
      <div className="bg-grid bg-radial-fade pointer-events-none absolute inset-0" />
      <div className="pointer-events-none absolute -top-24 left-1/2 h-72 w-[36rem] -translate-x-1/2 rounded-full bg-accent/15 blur-[110px]" />

      {/* ── Top bar: Skip for now ── */}
      <div className="relative z-10 flex items-center justify-start px-4 pt-4">
        <button
          onClick={dismiss}
          disabled={leaving}
          className="rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        >
          Skip for now
        </button>
      </div>

      <div className="relative mx-auto w-full max-w-lg px-5 pt-2">
        {/* ── Hero ── */}
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/15 text-accent">
            <Gift className="h-8 w-8" />
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
            You're In! Ready to Share the Love?
          </h1>
          <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground">
            Share your personal gift code and earn rewards together.
          </p>
        </div>

        {/* ── 60 days hero stat ── */}
        <div className="mt-8 text-center">
          <div className="flex items-center justify-center gap-4">
            <Star className="h-6 w-6 fill-accent/30 text-accent" />
            <span className="font-display text-6xl font-bold tracking-tight">
              {PREMIUM_DAYS_PER_SUBSCRIPTION}
            </span>
            <Star className="h-6 w-6 fill-accent/30 text-accent" />
          </div>
          <p className="mt-2 font-display text-lg font-bold">
            Earn up to {PREMIUM_DAYS_PER_SUBSCRIPTION} Days of Free Premium
            Features
          </p>
          <p className="text-xs text-muted-foreground">(When friends subscribe)</p>
        </div>

        {/* ── Gift code pill ── */}
        <div className="mt-6 rounded-2xl border border-border bg-card p-4 text-center">
          <p className="mb-2 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            <Lock className="h-3 w-3" /> Your Permanent Gift Code
          </p>
          <button
            onClick={copyCode}
            disabled={!code}
            className="group flex w-full items-center justify-center gap-3 rounded-xl border-2 border-dashed border-accent/50 bg-accent/5 px-6 py-3 transition-colors hover:border-accent disabled:opacity-50"
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
          <p className="mt-2 text-[11px] text-muted-foreground">
            Tapping copies code — it never changes.
          </p>
        </div>

        {/* ── Share CTA ── */}
        <Button
          onClick={share}
          disabled={!code}
          className="mt-4 h-12 w-full gap-2 rounded-xl bg-accent font-bold text-accent-foreground glow-accent hover:bg-accent/90"
        >
          <Share2 className="h-4 w-4" /> Share your Gift Code Now
        </Button>

        {/* ── 3-step strip ── */}
        <div className="mt-6 grid grid-cols-3 gap-2">
          {STEPS.map((s, i) => (
            <div
              key={s.title}
              className="flex flex-col items-center rounded-xl border border-border bg-card p-3 text-center"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/10 text-accent">
                <s.icon className="h-4 w-4" />
              </span>
              <p className="mt-2 text-xs font-semibold leading-tight">
                {i + 1}. {s.title}
              </p>
              <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground">
                {s.sub}
              </p>
            </div>
          ))}
        </div>

        {/* ── Reward chips ── */}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-accent/30 bg-accent/10 px-3 py-2.5 text-center">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              You get
            </p>
            <p className="mt-0.5 text-sm font-bold text-accent">
              +{DAYS_PER_REFERRAL} Free Days / signup
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card px-3 py-2.5 text-center">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Friend gets
            </p>
            <p className="mt-0.5 text-sm font-bold">
              ₹{REFEREE_DISCOUNT_RUPEES} OFF Yearly Plan
            </p>
          </div>
        </div>

        {/* ── FAQ ── */}
        <Accordion
          type="single"
          collapsible
          className="mt-6 rounded-2xl border border-border bg-card px-4"
        >
          <AccordionItem value="friend" className="border-b border-border">
            <AccordionTrigger className="text-sm font-semibold">
              What does my friend get?
            </AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground">
              They get ₹{REFEREE_DISCOUNT_RUPEES} OFF the yearly plan
              {yearly && discountedPrice
                ? ` (₹${yearly.price} → ₹${discountedPrice})`
                : ""}{" "}
              and a free trial to explore everything.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="permanent" className="border-b border-border">
            <AccordionTrigger className="text-sm font-semibold">
              Is my code permanent?
            </AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground">
              Yes — your code is uniquely yours and never changes. Share it
              anywhere, any number of times.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="otp" className="border-b-0">
            <AccordionTrigger className="text-sm font-semibold">
              Why OTP?
            </AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground">
              To ensure everyone gets genuine rewards and prevent spam and scams.
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        {/* ── Full-page links ── */}
        <div className="mt-4 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
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
      </div>

      {/* ── Sticky bottom: Continue ── */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/90 px-5 pb-6 pt-4 backdrop-blur-xl">
        <div className="mx-auto w-full max-w-lg">
          <Button
            onClick={dismiss}
            disabled={leaving}
            variant="outline"
            className="h-12 w-full rounded-full text-base font-bold"
          >
            Continue to Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
