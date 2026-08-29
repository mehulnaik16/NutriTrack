import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Gift, Lock, Share2, ShieldCheck, PartyPopper, Lightbulb, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/client";
import {
  DAYS_PER_REFERRAL,
  MAX_FREE_DAYS,
  PREMIUM_DAYS_PER_SUBSCRIPTION,
  REFEREE_DISCOUNT_RUPEES,
  referralUrl,
  giftMessage,
} from "@/lib/referral";
import { findPlan, REFERRAL_DISCOUNT_PLAN_ID } from "@/lib/plans";

export const Route = createFileRoute("/refer-how-it-works")({
  component: HowItWorks,
});

const yearly = findPlan(REFERRAL_DISCOUNT_PLAN_ID);
const discounted = yearly ? yearly.price - REFEREE_DISCOUNT_RUPEES : null;
const capReferral = MAX_FREE_DAYS / DAYS_PER_REFERRAL;

function HowItWorks() {
  const { user } = useAuth();
  const router = useRouter();
  const [code, setCode] = useState<string | null>(null);
  const [fullName, setFullName] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    supabase
      .from("user_profiles")
      .select("referral_code, full_name")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setCode(data?.referral_code ?? null);
        setFullName(data?.full_name ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const share = async () => {
    if (!code) return;
    const url = referralUrl(code);
    const text = giftMessage({ senderName: fullName, code, url });
    if (navigator.share) {
      try {
        await navigator.share({ title: "A gift for you 🎁", text, url });
        return;
      } catch {
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

  return (
    <div className="min-h-screen bg-background pb-28">
      {/* ── Top nav ── */}
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-lg items-center gap-3 px-4">
          <button
            onClick={() => router.history.back()}
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <h1 className="font-display text-sm font-bold">
            How Refer &amp; Earn Works
          </h1>
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-4 px-4 py-6">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/15 text-accent">
            <Gift className="h-7 w-7" />
          </div>
          <h2 className="font-display text-xl font-bold">
            Share a Gift. Earn Together.
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Share your permanent gift code. When your friends join, you both get
            rewarded — instantly.
          </p>
        </div>

        {/* STEP 1 */}
        <Step icon={Lock} n={1} title="Get Your Permanent ID">
          When you join, we create a unique code just for you — like
          RAH38291. Your permanent ID is generated from your name plus a unique
          number. It never changes, so you can share it anywhere. 🔒
        </Step>

        {/* STEP 2 */}
        <Step icon={Share2} n={2} title="Share the Gift 🎁">
          Send your code to friends via WhatsApp, SMS, or email. We pre-write a
          warm, gift-like message for you — you can edit it before sending. It
          feels like a personal invite, not a sales pitch.
        </Step>

        {/* STEP 3 */}
        <Step icon={Smartphone} n={3} title="Friend Signs Up (OTP Verified)">
          Your friend downloads the app, enters your code, and verifies their
          identity via OTP. ✅ OTP verification is mandatory for your friend to
          claim the gift — this prevents fake referrals and keeps rewards fair.
        </Step>

        {/* STEP 4 */}
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
              <PartyPopper className="h-5 w-5" />
            </span>
            <h3 className="font-display text-base font-bold">
              STEP 4: Rewards Unlock Instantly 🎉
            </h3>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">Two ways you both win:</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-accent/30 bg-accent/10 p-3">
              <p className="text-xs font-bold">📱 Free Trial Track</p>
              <p className="mt-1.5 text-xs text-muted-foreground">
                You get +{DAYS_PER_REFERRAL} free trial days for every friend who
                signs up and completes onboarding. Days add up horizontally — no
                minimum threshold. Accrual stops at {MAX_FREE_DAYS} days (your{" "}
                {capReferral}th referral), but you can keep referring as many
                friends as you like.
              </p>
            </div>
            <div className="rounded-xl border border-[var(--fat)]/30 bg-[var(--fat)]/10 p-3">
              <p className="text-xs font-bold">💰 Subscription Track</p>
              <p className="mt-1.5 text-xs text-muted-foreground">
                You get {PREMIUM_DAYS_PER_SUBSCRIPTION} free premium days per paid
                subscription — no limit. Your friend gets ₹
                {REFEREE_DISCOUNT_RUPEES} OFF the Yearly plan
                {yearly && discounted ? ` (₹${yearly.price} → ₹${discounted})` : ""}.
              </p>
            </div>
          </div>
        </div>

        {/* Quick tips */}
        <div className="rounded-2xl border border-border bg-card p-5">
          <h3 className="flex items-center gap-2 text-sm font-bold">
            <Lightbulb className="h-4 w-4 text-accent" /> Quick Tips
          </h3>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li className="flex gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              Share with friends who love fitness and healthy eating.
            </li>
            <li className="flex gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              Your code works for everyone, but the ₹{REFEREE_DISCOUNT_RUPEES} OFF
              is only for new users.
            </li>
            <li className="flex gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              Track your progress on the main Refer &amp; Earn dashboard.
            </li>
          </ul>
        </div>

        <p className="pt-2 text-center text-sm font-medium text-muted-foreground">
          Ready to start sharing? Your friends are waiting for their gift!
        </p>
      </main>

      {/* ── Sticky Share CTA ── */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/90 px-5 pb-6 pt-4 backdrop-blur-xl">
        <div className="mx-auto w-full max-w-lg">
          <Button
            onClick={share}
            disabled={!code}
            className="h-12 w-full gap-2 rounded-full bg-accent font-bold text-accent-foreground glow-accent hover:bg-accent/90"
          >
            <Share2 className="h-4 w-4" /> Share Your Gift Now
          </Button>
        </div>
      </div>
    </div>
  );
}

function Step({
  icon: Icon,
  n,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
          <Icon className="h-5 w-5" />
        </span>
        <h3 className="font-display text-base font-bold">
          STEP {n}: {title}
        </h3>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        {children}
      </p>
    </div>
  );
}
