/**
 * Your Gym — link a Dombelz account to an affiliate gym.
 *
 * A member enters the code their gym gave them (GYM-IRONVAULT-123) and,
 * optionally, how long their gym membership runs. That window is informational
 * on both sides: it never touches Dombelz access, and the member is deliberately
 * never notified about it — only the gym owner sees who is due to renew, in
 * their own app.
 *
 * This page does not grant anything. The ₹150 gift and the gym's commission are
 * both decided by link_gym() in SQL, from the account's own history, and a code
 * entered here is far too late for either. The card below says so plainly rather
 * than letting someone submit and feel tricked.
 */
import { useEffect, useState } from "react";
import { Building2, Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubHeader } from "@/components/SubHeader";
import { supabase } from "@/integrations/client";
import { serverLinkGym, serverVerifyGymCode } from "@/lib/gym-link";
import {
  GYM_DURATIONS,
  addMonths,
  isGymCode,
  membershipStatus,
  membershipStatusLabel,
  type GymDuration,
} from "@/lib/gym";

interface LinkRow {
  partner_code: string;
  gym_name: string;
  source: string;
  plan_months: number | null;
  start_date: string | null;
  end_date: string | null;
}

export function GymLinkPage({
  userId,
  onBack,
}: {
  userId: string;
  onBack: () => void;
}) {
  const [link, setLink] = useState<LinkRow | null>(null);
  const [loading, setLoading] = useState(true);

  const [codeInput, setCodeInput] = useState("");
  const [codeState, setCodeState] = useState<
    "idle" | "checking" | "valid" | "invalid"
  >("idle");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [gymName, setGymName] = useState<string | null>(null);

  const [months, setMonths] = useState<GymDuration | null>(null);
  const [startDate, setStartDate] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("gym_links")
      .select("partner_code, gym_name, source, plan_months, start_date, end_date")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setLink((data as LinkRow | null) ?? null);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const endDate =
    months && startDate ? addMonths(startDate, months) : null;
  const status = membershipStatus(startDate || null, endDate);

  const checkCode = async (raw: string) => {
    const code = raw.trim().toUpperCase();
    if (!code) {
      setCodeState("idle");
      setCodeError(null);
      setGymName(null);
      return;
    }
    if (!isGymCode(code)) {
      setCodeState("invalid");
      setGymName(null);
      setCodeError("Gym codes look like GYM-IRONVAULT-123.");
      return;
    }
    setCodeState("checking");
    setCodeError(null);
    try {
      const { gymName: name } = await serverVerifyGymCode({ data: { code } });
      if (name) {
        setGymName(name);
        setCodeState("valid");
      } else {
        setGymName(null);
        setCodeState("invalid");
        setCodeError("Gym not found — check the code with your gym.");
      }
    } catch {
      setGymName(null);
      setCodeState("invalid");
      setCodeError("Couldn't check that code just now. Try again.");
    }
  };

  const save = async () => {
    if (codeState !== "valid") return;
    setSaving(true);
    try {
      const result = await serverLinkGym({
        data: {
          code: codeInput.trim().toUpperCase(),
          ...(months ? { planMonths: months } : {}),
          ...(startDate ? { startDate } : {}),
        },
      });
      setLink({
        partner_code: result.partnerCode,
        gym_name: result.gymName,
        source: result.source,
        plan_months: months,
        start_date: startDate || null,
        end_date: endDate,
      });
      toast.success(`You're on ${result.gymName}'s member list.`);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not link your gym.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <SubHeader title="Your Gym" onBack={onBack} />
      <main className="mx-auto max-w-lg space-y-6 px-4 py-6">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : link ? (
          <LinkedCard link={link} />
        ) : (
          <>
            {/* ── The code ────────────────────────────────────────────── */}
            <section className="rounded-2xl border border-border bg-card p-5">
              <h3 className="font-display text-lg font-bold">
                Join your gym on Dombelz
              </h3>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Enter the code your gym gave you and they'll see you on their
                member list.
              </p>

              <div className="mt-5 space-y-2">
                <Label className="text-foreground/80">Gym code</Label>
                <div className="flex gap-2">
                  <Input
                    value={codeInput}
                    maxLength={20}
                    autoCapitalize="characters"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="GYM-IRONVAULT-123"
                    onChange={(e) => {
                      setCodeInput(e.target.value.toUpperCase());
                      // Editing invalidates the previous verdict, so the box and
                      // the message never describe different codes.
                      setCodeState("idle");
                      setCodeError(null);
                      setGymName(null);
                    }}
                    onBlur={() => {
                      if (codeInput.trim() && codeState === "idle") {
                        checkCode(codeInput);
                      }
                    }}
                    className="h-12 rounded-xl font-display tracking-[0.1em]"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => checkCode(codeInput)}
                    disabled={!codeInput.trim() || codeState === "checking"}
                    className="h-12 rounded-xl px-6 font-bold"
                  >
                    {codeState === "checking" ? "Checking…" : "Apply"}
                  </Button>
                </div>

                {codeState === "valid" && gymName && (
                  <div className="mt-3 flex items-center gap-3 rounded-xl border border-accent/30 bg-accent/10 p-3">
                    <Building2 className="h-5 w-5 shrink-0 text-accent" />
                    <span className="flex-1 font-semibold">{gymName}</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-accent/20 px-2.5 py-1 text-xs font-bold text-accent">
                      <Check className="h-3 w-3" /> Verified
                    </span>
                  </div>
                )}
                {codeState === "invalid" && codeError && (
                  <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-red-500">
                    <X className="h-4 w-4 shrink-0" />
                    {codeError}
                  </p>
                )}
              </div>
            </section>

            {/* ── The membership window ───────────────────────────────── */}
            <section className="rounded-2xl border border-border bg-card p-5">
              <h3 className="font-display text-lg font-bold">
                Your membership
              </h3>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Optional. It only helps your gym know when you're due to renew —
                it has nothing to do with your Dombelz plan.
              </p>

              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {GYM_DURATIONS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMonths(months === m ? null : m)}
                    className={`rounded-xl border-2 py-4 text-center transition-colors ${
                      months === m
                        ? "border-accent bg-accent/10"
                        : "border-border hover:border-accent/50"
                    }`}
                  >
                    <span className="font-display text-2xl font-bold">{m}</span>
                    <span className="ml-1 text-xs text-muted-foreground">
                      {m === 1 ? "month" : "months"}
                    </span>
                  </button>
                ))}
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label className="text-foreground/80">Start date</Label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="h-11 rounded-xl [color-scheme:dark]"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Ends</Label>
                  <div className="flex h-11 items-center rounded-xl border border-border px-3 text-sm text-muted-foreground">
                    {endDate ?? "—"}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Status</Label>
                  <div className="flex h-11 items-center rounded-xl border border-border px-3 text-sm text-muted-foreground">
                    {membershipStatusLabel(status)}
                  </div>
                </div>
              </div>
            </section>

            <Button
              onClick={save}
              disabled={codeState !== "valid" || saving}
              className="w-full rounded-xl py-6 font-bold"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Join this gym"
              )}
            </Button>

            {/* Said before submitting, not after. Someone who reads this and
                decides not to bother has lost nothing. */}
            <p className="px-2 text-center text-xs text-muted-foreground">
              The ₹150 gym offer applies only to a code entered when you first
              created your account. Adding your gym here puts you on their member
              list — it does not change your Dombelz price.
            </p>
          </>
        )}
      </main>
    </div>
  );
}

function LinkedCard({ link }: { link: LinkRow }) {
  const status = membershipStatus(link.start_date, link.end_date);
  return (
    <>
      <section className="rounded-2xl border border-accent/30 bg-card p-6 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/15 text-accent">
          <Building2 className="h-8 w-8" />
        </div>
        <h2 className="font-display text-xl font-bold">{link.gym_name}</h2>
        <p className="mt-2 font-display text-sm tracking-[0.15em] text-muted-foreground">
          {link.partner_code}
        </p>
      </section>

      <section className="space-y-3 rounded-2xl border border-border bg-card p-5">
        <Row label="Membership" value={
          link.plan_months
            ? `${link.plan_months} ${link.plan_months === 1 ? "month" : "months"}`
            : "Not set"
        } />
        <Row label="Started" value={link.start_date ?? "—"} />
        <Row label="Ends" value={link.end_date ?? "—"} />
        <Row label="Status" value={membershipStatusLabel(status)} />
      </section>

      <p className="px-2 text-center text-xs text-muted-foreground">
        {link.source === "signup"
          ? "You joined with this gym's code, so your ₹150 offer is on your Yearly plan."
          : "You're on this gym's member list. Your Dombelz plan and price are unaffected."}
      </p>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
