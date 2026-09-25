/**
 * The one lock used everywhere entitlement gates something.
 *
 * "page" (a whole route): the real page renders, data included, but does not
 * respond — any tap or keypress opens a branded upsell popup. See PageShield.
 *
 * "inline" (one panel): the children are never mounted, so the queries inside
 * them never run. What blurs is a placeholder. The overlay appears only once
 * the entitlement read has resolved to "lapsed", so a paying user never sees
 * the upsell flash on the way in.
 *
 * It is never a redirect.
 */

import { useState, type ReactNode, type SyntheticEvent } from "react";
import { Link } from "@tanstack/react-router";
import { Loader2, Lock, Sparkles } from "lucide-react";
import { useAccessGate, type LapseReason } from "@/hooks/useAccessGate";
import { BrandLogo } from "@/components/BrandLogo";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

/** Grey bars standing in for whatever the locked surface would have shown. */
function Filler({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-4" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-20 rounded-2xl border border-border/60 bg-muted/60"
        />
      ))}
    </div>
  );
}

export interface PremiumGateProps {
  children: ReactNode;
  /** What blurs behind the overlay. Defaults to generic filler bars. */
  placeholder?: ReactNode;
  /** "page" locks a whole route; "inline" locks one control or panel. */
  variant?: "page" | "inline";
  title?: string;
  /** A function gets why access ended, to open with the right line. */
  message?: string | ((reason: LapseReason | null) => string);
}

/** The opening line of an upsell, matched to what just ended. */
export function endedLine(reason: LapseReason | null): string {
  switch (reason) {
    case "subscription":
      return "Your subscription has ended. Renew your plan to";
    case "premium":
      return "Your premium days have run out. Pick a plan to";
    case "trial":
      return "Your free trial has wrapped up. Pick a plan to";
    default:
      return "Your access has ended. Pick a plan to";
  }
}

export function PremiumGate({
  children,
  placeholder,
  variant = "page",
  title = "Your access has ended",
  message = "Pick a plan to unlock this again. Everything you have logged is safe and comes straight back.",
}: PremiumGateProps) {
  const { state, reason } = useAccessGate();
  const text = typeof message === "function" ? message(reason) : message;

  if (state === "entitled") return <>{children}</>;

  if (variant === "page") {
    return (
      <PageShield lapsed={state === "lapsed"} title={title} message={text}>
        {children}
      </PageShield>
    );
  }

  if (state === "loading") {
    return (
      <div className="flex min-h-[8rem] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Placeholder, not the real page. aria-hidden and inert keep it out of
          the accessibility tree and the tab order. */}
      <div
        aria-hidden="true"
        // @ts-expect-error -- `inert` lands in React's JSX types after 19.2
        inert=""
        className="pointer-events-none select-none blur-sm saturate-50 opacity-40"
      >
        {placeholder ?? <Filler rows={2} />}
      </div>

      <div className="absolute inset-0 z-10 flex items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-3xl border border-accent/30 bg-card/95 p-6 text-center shadow-xl backdrop-blur-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-accent-foreground glow-accent-sm">
            <Lock className="h-6 w-6" />
          </div>

          <h2 className="mt-4 font-display text-xl font-bold tracking-tight">
            {title}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">{text}</p>

          <Link
            to="/plans"
            className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent text-base font-bold text-accent-foreground transition-colors hover:bg-accent/90"
          >
            <Sparkles className="h-4 w-4" />
            See plans
          </Link>
        </div>
      </div>
    </div>
  );
}

/* Header, nav and plain links stay live so a lapsed user can always leave.
   data-premium-open marks view-only controls (the date picker) that keep
   working so a lapsed user can browse their own history. */
const isShellExempt = (t: EventTarget | null) =>
  t instanceof Element &&
  !!t.closest("header, nav, a[href], [data-premium-open]");

/* Only a real control opens the popup; a tap on empty space or plain text is
   swallowed silently. cursor-pointer catches clickable divs and cards. */
const CONTROL =
  "button, input, textarea, select, label, summary, [role=button], [role=tab], [role=combobox], [role=switch], [role=checkbox], [role=slider], [role=menuitem], [contenteditable=true], [class*=cursor-pointer]";
const isControl = (t: EventTarget | null) =>
  t instanceof Element && !!t.closest(CONTROL);

/**
 * Makes everything inside read-only without hiding it. Every tap, keypress,
 * focus and submit inside is swallowed in the capture phase; a tap on a real
 * control calls onBlocked so the caller can explain why. React propagates
 * synthetic events through portals, so dialogs opened from inside are covered.
 *
 * Clicks rather than pointerdown on touch, so scrolling never trips it.
 */
export function InteractionShield({
  active,
  onBlocked,
  allow,
  children,
}: {
  active: boolean;
  onBlocked: () => void;
  /** Extra selector that stays live inside this shield only. */
  allow?: string;
  children: ReactNode;
}) {
  if (!active) return <>{children}</>;

  const isExempt = (t: EventTarget | null) =>
    isShellExempt(t) || (!!allow && t instanceof Element && !!t.closest(allow));

  const block = (e: SyntheticEvent) => {
    if (isExempt(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    if (isControl(e.target)) onBlocked();
  };

  return (
    <div
      onClickCapture={block}
      onMouseDownCapture={block}
      onPointerDownCapture={(e) => e.pointerType === "mouse" && block(e)}
      onKeyDownCapture={block}
      onSubmitCapture={block}
      onFocusCapture={(e) => {
        if (isExempt(e.target)) return;
        (e.target as HTMLElement).blur?.();
        onBlocked();
      }}
    >
      {children}
    </div>
  );
}

/**
 * Route-level lock. The real page renders with the user's own data, but does
 * not respond: a tap on a control opens the upsell instead. The upsell sits
 * outside the shield so its own button still works. While access is still
 * loading, input is swallowed silently, so a paying user never sees it flash.
 */
function PageShield({
  lapsed,
  title,
  message,
  children,
}: {
  lapsed: boolean;
  title: string;
  message: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <InteractionShield active onBlocked={() => lapsed && setOpen(true)}>
        {children}
      </InteractionShield>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-sm rounded-3xl border-accent/30 bg-card/95 p-6 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10 glow-accent-sm">
            <BrandLogo className="h-10 w-10 text-accent" />
          </div>
          <DialogTitle className="mt-2 font-display text-xl font-bold tracking-tight">
            {title}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {message}
          </DialogDescription>
          <Link
            to="/plans"
            className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent text-base font-bold text-accent-foreground transition-colors hover:bg-accent/90"
          >
            <Sparkles className="h-4 w-4" />
            See plans
          </Link>
        </DialogContent>
      </Dialog>
    </>
  );
}
