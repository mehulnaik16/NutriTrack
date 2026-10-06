/**
 * The shared shell of /terms, /privacy, /refund and /help: header, title block,
 * optional "In short" box, numbered sections with anchors, and the legal footer.
 * Links to sibling legal routes are plain <a href> on purpose.
 */
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, type LucideIcon } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { emailLink, LEGAL, LEGAL_LINKS, LEGAL_UPDATED } from "@/lib/legal";

export interface LegalSection {
  id: string;
  title: string;
  body: React.ReactNode;
}

// Body copy styling for whatever JSX a section passes in.
const PROSE =
  "space-y-3 text-sm leading-relaxed text-muted-foreground [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5 [&_a]:text-accent [&_a]:underline-offset-2 [&_a:hover]:underline";

/** The Grievance Officer block quoted by /terms and /privacy. */
export function GrievanceCard() {
  return (
    <div className="rounded-xl border-l-2 border-accent bg-muted/40 px-4 py-3">
      <p>
        <strong>{LEGAL.grievanceOfficer}</strong> — Grievance Officer
      </p>
      <p>
        <a {...emailLink(LEGAL.grievanceEmail)}>{LEGAL.grievanceEmail}</a>
      </p>
      <p>
        {LEGAL.legalName}, {LEGAL.address}
      </p>
    </div>
  );
}

export function LegalPage({
  icon: Icon,
  badge,
  title,
  summary,
  sections,
  children,
}: {
  icon: LucideIcon;
  badge: string;
  title: string;
  summary?: string[];
  sections?: LegalSection[];
  /** Free-form content (the help centre) rendered instead of / after sections. */
  children?: React.ReactNode;
}) {
  const navigate = useNavigate();
  const back = () =>
    window.history.length > 1 ? window.history.back() : navigate({ to: "/" });

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <button
            onClick={back}
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <div className="flex items-center gap-2">
            <BrandLogo className="h-7 w-7 shrink-0 text-accent" />
            <span className="font-display text-sm font-bold">Dombelz</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10">
        <div className="mb-8">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-accent">
            <Icon className="h-3.5 w-3.5" /> {badge}
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight">
            {title}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Last updated: {LEGAL_UPDATED}
          </p>
        </div>

        {summary && (
          <div className="mb-8 rounded-2xl border border-accent/30 bg-accent/5 p-5">
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-accent">
              In short
            </p>
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-foreground/90">
              {summary.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
        )}

        {sections && sections.length > 4 && (
          <details className="mb-8 rounded-2xl border border-border bg-card p-4 text-sm">
            <summary className="cursor-pointer font-semibold">
              On this page
            </summary>
            <ol className="mt-3 space-y-1.5 text-muted-foreground">
              {sections.map((s, i) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="hover:text-foreground">
                    {i + 1}. {s.title}
                  </a>
                </li>
              ))}
            </ol>
          </details>
        )}

        {sections?.map((s, i) => (
          <section key={s.id} id={s.id} className="mb-8 scroll-mt-20">
            <h2 className="mb-2 font-display text-lg font-bold">
              {i + 1}. {s.title}
            </h2>
            <div className={PROSE}>{s.body}</div>
          </section>
        ))}

        {children}

        <div className="mt-10 space-y-3 rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
          <p>
            Questions? Email{" "}
            <a
              {...emailLink(LEGAL.supportEmail)}
              className="text-accent underline-offset-2 hover:underline"
            >
              {LEGAL.supportEmail}
            </a>{" "}
            or visit{" "}
            <a
              href="/help"
              className="text-accent underline-offset-2 hover:underline"
            >
              Help &amp; Support
            </a>
            .
          </p>
          <p className="flex flex-wrap gap-x-3 gap-y-1">
            {LEGAL_LINKS.map((l) => (
              <a key={l.href} href={l.href} className="hover:text-foreground">
                {l.label}
              </a>
            ))}
          </p>
          <p className="text-xs">
            Dombelz is operated by {LEGAL.legalName}, {LEGAL.address}.
          </p>
        </div>
      </main>
    </div>
  );
}
