import { createFileRoute, useRouter } from "@tanstack/react-router";
import { ArrowLeft, ScrollText } from "lucide-react";
import {
  DAYS_PER_REFERRAL,
  MAX_FREE_DAYS,
  PREMIUM_DAYS_PER_SUBSCRIPTION,
  REFEREE_DISCOUNT_RUPEES,
} from "@/lib/referral";
import { findPlan, REFERRAL_DISCOUNT_PLAN_ID } from "@/lib/plans";

export const Route = createFileRoute("/refer-terms")({ component: ReferTerms });

const LAST_UPDATED = "August 29, 2026";
const SUPPORT_EMAIL = "support@dombelz.app";
const yearly = findPlan(REFERRAL_DISCOUNT_PLAN_ID);
const discounted = yearly ? yearly.price - REFEREE_DISCOUNT_RUPEES : null;
const capReferral = MAX_FREE_DAYS / DAYS_PER_REFERRAL;

function Section({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-7">
      <h2 className="mb-2 font-display text-base font-bold uppercase tracking-wide">
        {n}. {title}
      </h2>
      <div className="space-y-2 border-t border-border pt-3 text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  );
}

function ReferTerms() {
  const router = useRouter();
  return (
    <div className="min-h-screen bg-background pb-16">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4">
          <button
            onClick={() => router.history.back()}
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <h1 className="font-display text-sm font-bold">Terms &amp; Conditions</h1>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <ScrollText className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold">
              Refer &amp; Earn — Terms &amp; Conditions
            </h2>
            <p className="text-xs text-muted-foreground">
              Last Updated: {LAST_UPDATED}
            </p>
          </div>
        </div>

        <Section n={1} title="Eligibility">
          <p>
            a. The Refer &amp; Earn program is open to all registered users of
            Dombelz who have completed the onboarding process.
          </p>
          <p>
            b. The "Referee" (friend receiving the code) must be a new, unique
            user who has never registered with Dombelz before to qualify for the
            ₹{REFEREE_DISCOUNT_RUPEES} discount.
          </p>
        </Section>

        <Section n={2} title="Referral Code">
          <p>
            a. Each user is assigned a unique, permanent referral code upon
            registration.
          </p>
          <p>
            b. This code is non-transferable and cannot be modified or
            regenerated.
          </p>
        </Section>

        <Section n={3} title="Free Trial Rewards (Component 1)">
          <p>
            a. For every successful referral (Referee signs up and completes OTP
            verification), the Referrer receives +{DAYS_PER_REFERRAL} days added
            to their free trial period.
          </p>
          <p>
            b. These days are added horizontally. There is no minimum threshold
            to unlock benefits — rewards start from the 1st referral.
          </p>
          <p>
            c. The maximum accumulation is capped at {MAX_FREE_DAYS} days
            (equivalent to {capReferral} successful referrals). Referring beyond
            this is unlimited; it simply adds no further trial days.
          </p>
          <p>
            d. Once the cap is reached, no further free trial days will be
            credited.
          </p>
        </Section>

        <Section n={4} title="Paid Subscription Rewards (Component 2)">
          <p>
            a. If a Referee purchases the Yearly subscription plan
            {yearly ? ` (₹${yearly.price}/year)` : ""}, the Referrer earns{" "}
            {PREMIUM_DAYS_PER_SUBSCRIPTION} days of Premium Feature access.
          </p>
          <p>
            b. There is no upper limit to the number of paid referrals a user can
            make.
          </p>
          <p>
            c. The Referee receives an instant ₹{REFEREE_DISCOUNT_RUPEES} discount
            on the Yearly plan
            {yearly && discounted ? `, making the final price ₹${discounted}` : ""}.
            This discount is applied at checkout, is valid on the Yearly plan
            only, and has no cash value.
          </p>
        </Section>

        <Section n={5} title="Verification &amp; Fraud Prevention">
          <p>
            a. OTP (One-Time Password) verification is mandatory for the Referee
            to qualify as a successful referral.
          </p>
          <p>
            b. Any attempt to game the system (e.g., using fake phone numbers,
            self-referrals, or creating multiple accounts) will result in
            immediate disqualification, forfeiture of earned rewards, and
            potential account suspension.
          </p>
        </Section>

        <Section n={6} title="Reward Expiry">
          <p>
            a. Accumulated free trial days (Component 1) are added to the user's
            account and are consumed sequentially. They are valid only for the
            duration of the trial period.
          </p>
          <p>
            b. Free Premium days earned (Component 2) are added to the user's
            subscription and are consumed after the current paid period ends.
          </p>
        </Section>

        <Section n={7} title="Modification &amp; Termination">
          <p>
            a. Dombelz reserves the right to modify, suspend, or terminate the
            Refer &amp; Earn program at any time without prior notice.
          </p>
          <p>
            b. Changes will be communicated via in-app notifications or email.
          </p>
        </Section>

        <Section n={8} title="Limitation of Liability">
          <p>
            a. Rewards are provided "as is" and have no monetary value outside the
            app ecosystem.
          </p>
          <p>
            b. Dombelz is not responsible for technical glitches, lost referral
            links, or user errors in sharing the code.
          </p>
        </Section>

        <Section n={9} title="Governing Law">
          <p>
            a. These terms are governed by the laws of India and any disputes
            shall be subject to the exclusive jurisdiction of the courts in
            Bengaluru, Karnataka.
          </p>
        </Section>

        <p className="text-sm text-muted-foreground">
          For any questions, contact us at{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-accent underline">
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </main>
    </div>
  );
}
