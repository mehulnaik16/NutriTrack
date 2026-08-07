import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity, ArrowLeft, ScrollText } from "lucide-react";

export const Route = createFileRoute("/terms")({ component: Terms });

const LAST_UPDATED = "August 6, 2026";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8">
      <h2 className="mb-2 font-display text-lg font-bold">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  );
}

function Terms() {
  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Link
            to="/"
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <Activity className="h-4 w-4" />
            </div>
            <span className="font-display text-sm font-bold">Dombelz</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10">
        <div className="mb-8">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-accent">
            <ScrollText className="h-3.5 w-3.5" /> Terms of Service
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight">
            The ground rules.
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Last updated: {LAST_UPDATED}
          </p>
        </div>

        <Section title="1. Agreement">
          <p>
            By creating a Dombelz account or using the app, you agree to these
            Terms and our{" "}
            <Link
              to="/privacy"
              className="text-accent underline-offset-2 hover:underline"
            >
              Privacy Policy
            </Link>
            . If you do not agree, please do not use Dombelz. You must be at
            least 16 years old to use the service.
          </p>
        </Section>

        <Section title="2. Not medical advice">
          <p>
            Dombelz provides general fitness and nutrition information —
            calorie estimates, macro targets, workout suggestions, and
            AI-generated summaries. It is{" "}
            <strong className="text-foreground">
              not medical advice, diagnosis, or treatment
            </strong>
            . Nutrition values and AI estimates can be inaccurate. Always
            consult a qualified healthcare professional before starting any
            diet or exercise program, especially if you have a medical
            condition, are pregnant, or are recovering from injury. Stop
            exercising and seek medical help if you feel pain, dizziness, or
            discomfort.
          </p>
        </Section>

        <Section title="3. Your account">
          <p>
            You are responsible for keeping your login credentials secure and
            for all activity under your account. Provide accurate information —
            your calorie targets are only as good as the data you enter. You
            may delete your account at any time from Settings.
          </p>
        </Section>

        <Section title="4. Acceptable use">
          <p>
            Don't misuse the service: no attempting to access other users'
            data, no reverse engineering, no automated scraping, no uploading
            unlawful content, and no using the leaderboard name field for spam
            or abuse. We may suspend accounts that violate these rules.
          </p>
        </Section>

        <Section title="5. Plans, trials & payments">
          <p>
            Dombelz offers subscription plans with a 2-day free trial. No
            payment method is required for the trial. Online payments are not
            yet enabled; when they launch, pricing, billing cycles, and refund
            terms will be shown at checkout before you pay. Prices are listed
            in Indian Rupees (₹).
          </p>
        </Section>

        <Section title="6. Your content">
          <p>
            You own the data and photos you log. You grant us a limited license
            to store and process them solely to operate the service (see the
            Privacy Policy). Deleting your account removes this content.
          </p>
        </Section>

        <Section title="7. Service availability">
          <p>
            We aim for high availability but the service is provided "as is"
            without warranties. Features may change, and third-party providers
            (database, AI processing, video tutorials) may occasionally be
            unavailable.
          </p>
        </Section>

        <Section title="8. Limitation of liability">
          <p>
            To the maximum extent permitted by law, Dombelz is not liable for
            indirect or consequential damages, injuries arising from exercise
            you choose to perform, or decisions made based on nutrition
            estimates. Our total liability is limited to the amount you paid us
            in the previous 12 months.
          </p>
        </Section>

        <Section title="9. Governing law">
          <p>
            These Terms are governed by the laws of India. Disputes are subject
            to the exclusive jurisdiction of the courts of Mumbai, Maharashtra.
          </p>
        </Section>

        <Section title="10. Changes">
          <p>
            We may update these Terms; material changes will be announced in
            the app. Continued use after changes means acceptance.
          </p>
        </Section>

        <div className="mt-10 rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
          Questions? Email{" "}
          <a
            href="mailto:support@dombelz.app"
            className="text-accent underline-offset-2 hover:underline"
          >
            support@dombelz.app
          </a>{" "}
          · See also our{" "}
          <Link
            to="/privacy"
            className="text-accent underline-offset-2 hover:underline"
          >
            Privacy Policy
          </Link>
          .
        </div>
      </main>
    </div>
  );
}
