import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity, ArrowLeft, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/privacy")({ component: Privacy });

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

function Privacy() {
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
            <span className="font-display text-sm font-bold">FitTrack</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10">
        <div className="mb-8">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-accent">
            <ShieldCheck className="h-3.5 w-3.5" /> Privacy Policy
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight">
            Your data. Your rules.
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Last updated: {LAST_UPDATED}
          </p>
        </div>

        <Section title="1. Who we are">
          <p>
            FitTrack ("we", "us") is a fitness and nutrition tracking
            application. This policy explains what data we collect, why we
            collect it, and the choices you have. It applies to the FitTrack
            website and mobile applications.
          </p>
        </Section>

        <Section title="2. Data we collect">
          <p>
            <strong className="text-foreground">Account data:</strong> name,
            email address, and password (stored as a secure hash — we never see
            your password).
          </p>
          <p>
            <strong className="text-foreground">Health & fitness data you
            log:</strong> age, gender, height, weight, activity level, fitness
            goals, food diary entries, workout logs, water intake, weight
            entries, and optional progress photos.
          </p>
          <p>
            <strong className="text-foreground">Media you choose to
            share:</strong> photos of meals (for AI food recognition), voice
            recordings (for voice logging), and camera input for barcode
            scanning. Meal photos and voice audio are processed to extract
            nutrition information and are not stored on our servers; progress
            photos you save are stored until you delete them.
          </p>
          <p>We do not collect your precise location, contacts, or SMS.</p>
        </Section>

        <Section title="3. How we use your data">
          <p>
            To calculate your calorie and macro targets, display your progress
            and streaks, generate AI coaching summaries, power the community
            leaderboard (only your first name and aggregate scores are shown),
            and provide customer support. We do <strong className="text-foreground">not
            sell your personal data</strong> and we do not show third-party
            advertising.
          </p>
        </Section>

        <Section title="4. AI processing">
          <p>
            Food photos, voice transcripts, and your weekly statistics are
            processed by AI models (via Groq's API) to identify foods, estimate
            nutrition, and generate coaching text. Only the minimum content
            needed for the feature is sent, and it is not used by us to train
            models.
          </p>
        </Section>

        <Section title="5. Where your data lives">
          <p>
            Your data is stored with Supabase (our database and authentication
            provider) using industry-standard encryption in transit (TLS) and
            at rest. Barcode lookups query the public Open Food Facts database;
            only the barcode number is sent.
          </p>
        </Section>

        <Section title="6. Your rights & controls">
          <p>
            <strong className="text-foreground">Export:</strong> download all
            your data anytime from Settings → Data export (JSON/CSV).
          </p>
          <p>
            <strong className="text-foreground">Correction:</strong> edit your
            profile, logs, and entries directly in the app.
          </p>
          <p>
            <strong className="text-foreground">Deletion:</strong> permanently
            delete your account and all associated data from Settings → Danger
            zone → Delete account & data. Deletion is immediate and
            irreversible.
          </p>
          <p>
            These rights align with India's Digital Personal Data Protection
            Act, 2023 (DPDP). For any privacy request, you can also email{" "}
            <a
              href="mailto:support@fittrack.app"
              className="text-accent underline-offset-2 hover:underline"
            >
              support@fittrack.app
            </a>
            . We respond within 30 days.
          </p>
        </Section>

        <Section title="7. Data retention">
          <p>
            We keep your data while your account is active. When you delete
            your account, your logs, profile, and photos are removed from our
            systems. Residual copies in encrypted backups are purged on the
            backup rotation cycle (up to 30 days).
          </p>
        </Section>

        <Section title="8. Children">
          <p>
            FitTrack is not intended for children. You must be at least 16
            years old to create an account, and our sign-up flow enforces this.
          </p>
        </Section>

        <Section title="9. Permissions we request (mobile)">
          <p>
            <strong className="text-foreground">Camera</strong> — meal photos,
            barcode scanning, progress photos.{" "}
            <strong className="text-foreground">Microphone</strong> — voice
            food logging. Both are optional; the app works without them, and
            they are used only while you actively use those features.
          </p>
        </Section>

        <Section title="10. Changes to this policy">
          <p>
            If we make material changes, we will notify you in the app before
            they take effect. Continued use after changes means you accept the
            updated policy.
          </p>
        </Section>

        <div className="mt-10 rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
          Questions? Email{" "}
          <a
            href="mailto:support@fittrack.app"
            className="text-accent underline-offset-2 hover:underline"
          >
            support@fittrack.app
          </a>{" "}
          · See also our{" "}
          <Link
            to="/terms"
            className="text-accent underline-offset-2 hover:underline"
          >
            Terms of Service
          </Link>
          .
        </div>
      </main>
    </div>
  );
}
