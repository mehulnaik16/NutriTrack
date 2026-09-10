/**
 * Your Gym — the member's side of the gym relationship.
 *
 * Two different things live on this page, and keeping them apart is what makes
 * the rest of it make sense:
 *
 *   The LINK is attribution. Which gym gets credit for bringing this account to
 *   Dombelz, decided by link_gym() in SQL from the account's own history. It is
 *   never editable, and removing it is permanent.
 *
 *   The MEMBERSHIP is what the member pays the gym for — duration, dates, a
 *   phone number. It belongs to the gym, lives in the gym's own database, and is
 *   read live rather than mirrored here. That is why an owner correcting a date
 *   shows up on this card with nothing to sync.
 *
 * Because the membership is the gym's record, a member changing it is making a
 * claim about somebody else's business: submitting sends a request that waits in
 * the gym's list, and nothing on this card moves until they confirm it. Showing
 * the new values immediately would be a lie the gym might never make true.
 *
 * This page grants nothing. The ₹150 offer and the gym's commission are both
 * settled by link_gym() from facts a caller cannot replay, and a code entered
 * here rather than at signup is far too late for either. The copy says so before
 * anyone submits.
 */
import { useCallback, useEffect, useState } from "react";
import { Building2, Check, Clock, Loader2, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { SubHeader } from "@/components/SubHeader";
import {
  serverGetGymMembership,
  serverLinkGym,
  serverSubmitGymDetails,
  serverVerifyGymCode,
} from "@/lib/gym-link";
import { invalidateReferralGift } from "@/hooks/useReferralGift";
import { todayLocal } from "@/lib/dates";
import {
  GYM_DURATIONS,
  addMonths,
  isGymCode,
  membershipStatus,
  membershipStatusLabel,
  type GymDuration,
} from "@/lib/gym";

interface LinkSummary {
  partnerCode: string;
  gymName: string;
  source: string;
}

interface Membership {
  planMonths: number | null;
  startDate: string | null;
  endDate: string | null;
  phone: string | null;
  pending: {
    planMonths: number | null;
    startDate: string | null;
    endDate: string | null;
    phone: string | null;
    createdAt: string;
  } | null;
}

const PHONE_RE = /^[6-9]\d{9}$/;

/** A membership row that exists but has never been filled in. Distinct from a
 *  missing row, which means the gym took the member off their list. */
function isBlank(m: Membership): boolean {
  return !m.planMonths && !m.startDate && !m.phone && !m.pending;
}

export function GymLinkPage({
  userId,
  onBack,
}: {
  userId: string;
  onBack: () => void;
}) {
  const [link, setLink] = useState<LinkSummary | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [unreachable, setUnreachable] = useState(false);
  const [gymGone, setGymGone] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);

  const [codeInput, setCodeInput] = useState("");
  const [codeState, setCodeState] = useState<
    "idle" | "checking" | "valid" | "invalid"
  >("idle");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [gymName, setGymName] = useState<string | null>(null);

  const [months, setMonths] = useState<GymDuration | null>(null);
  const [startDate, setStartDate] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await serverGetGymMembership();
      setLink(res.link);
      setMembership(res.membership);
      setUnreachable("unreachable" in res && !!res.unreachable);
      setGymGone("gymGone" in res && !!res.gymGone);
    } catch (e) {
      console.error("[gym] load failed", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, userId]);

  const endDate = months && startDate ? addMonths(startDate, months) : null;
  // Nothing typed here is a fact yet — the gym decides. So the form never
  // quotes a live status; it says who it is waiting on.
  const draftStatus = endDate ? "⏳ Waiting for gym" : "—";

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

  /** Validate the shared part of both submit paths. Returns an error to show,
   *  or null. Phone is optional; a half-typed one is not. */
  const detailsError = (): string | null => {
    if (phone && !PHONE_RE.test(phone)) {
      return "That phone number doesn't look right — 10 digits, starting 6 to 9.";
    }
    if (months && !startDate)
      return "Pick the date your gym membership started.";
    return null;
  };

  /** First link: attribute the gym, then send the details for them to confirm. */
  const join = async () => {
    if (codeState !== "valid") return;
    const bad = detailsError();
    if (bad) return toast.error(bad);

    setSaving(true);
    try {
      const result = await serverLinkGym({
        data: { code: codeInput.trim().toUpperCase() },
      });
      // Only if there is actually something to confirm. Joining with the code
      // alone is complete on its own.
      if (months || startDate || phone) {
        await serverSubmitGymDetails({
          data: {
            planMonths: months,
            startDate: startDate || null,
            phone: phone || null,
          },
        });
      }
      toast.success(`You're on ${result.gymName}'s member list.`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not link your gym.");
    } finally {
      setSaving(false);
    }
  };

  /** An edit to an existing membership. Asks; never applies. */
  const submitEdit = async () => {
    const bad = detailsError();
    if (bad) return toast.error(bad);

    setSaving(true);
    try {
      await serverSubmitGymDetails({
        data: {
          planMonths: months,
          startDate: startDate || null,
          phone: phone || null,
        },
      });
      toast.success(
        `Sent to ${link?.gymName ?? "your gym"} to confirm. Nothing changes until they do.`,
      );
      setEditing(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send that.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setRemoving(true);
    try {
      const { serverUnlinkGym } = await import("@/lib/gym-link");
      await serverUnlinkGym();
      // The yearly card is priced from this cache, and it is memoised for the
      // page's whole life. Without this eviction the pricing page keeps
      // offering ₹849 against a checkout that will now charge ₹999.
      invalidateReferralGift(userId);
      setLink(null);
      setMembership(null);
      setGymGone(false);
      setUnreachable(false);
      setEditing(false);
      setCodeInput("");
      setCodeState("idle");
      setGymName(null);
      setMonths(null);
      setStartDate("");
      setPhone("");
      toast.success("Your gym has been removed.");
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Could not remove your gym.",
      );
    } finally {
      setRemoving(false);
    }
  };

  const startEditing = () => {
    const m = membership;
    setMonths(
      (GYM_DURATIONS as readonly number[]).includes(m?.planMonths ?? -1)
        ? (m?.planMonths as GymDuration)
        : null,
    );
    setStartDate(m?.startDate ?? "");
    setPhone(m?.phone ?? "");
    setEditing(true);
  };

  const membershipForm = (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h3 className="font-display text-lg font-bold">Your gym membership</h3>
      <p className="mt-1.5 text-sm text-muted-foreground">
        What you pay your gym for. Your gym confirms it, and it has nothing to
        do with your Dombelz plan.
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

      <div className="mt-5 grid gap-4 sm:grid-cols-[1.3fr_1fr_1fr]">
        <div className="space-y-2">
          <Label className="text-foreground/80">Start date</Label>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            // The calendar button is a small target at the right edge. Opening
            // the picker from anywhere in the field costs one line and does not
            // take typing away: the segment under the cursor keeps focus, so
            // the keyboard still fills it in. showPicker throws where it is
            // unsupported or not user-activated, and that is fine — the button
            // is still there.
            onClick={(e) => {
              try {
                e.currentTarget.showPicker();
              } catch {
                /* no picker here; the field is still typeable */
              }
            }}
            className="h-11 w-full rounded-xl"
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
            {draftStatus}
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <Label className="text-foreground/80">
          Phone number{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Input
          type="tel"
          inputMode="numeric"
          maxLength={10}
          value={phone}
          onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
          placeholder="9876543210"
          className="h-11 rounded-xl"
        />
        <p className="text-xs text-muted-foreground">
          Shared with {link?.gymName ?? "your gym"} so they can reach you about
          your gym membership.
        </p>
      </div>
    </section>
  );

  return (
    <div className="min-h-screen bg-background pb-24">
      <SubHeader title="Your Gym" onBack={onBack} />
      <main className="mx-auto max-w-lg space-y-6 px-4 py-6">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : link && editing ? (
          <>
            <GymHeader link={link} />
            {membershipForm}
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setEditing(false)}
                disabled={saving}
                className="flex-1 rounded-xl py-6 font-bold"
              >
                Cancel
              </Button>
              <Button
                onClick={submitEdit}
                disabled={saving}
                className="flex-1 rounded-xl py-6 font-bold"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Send to my gym"
                )}
              </Button>
            </div>
            <p className="px-2 text-center text-xs text-muted-foreground">
              Your gym confirms changes before they show here.
            </p>
          </>
        ) : link ? (
          <>
            <GymHeader link={link} />

            {membership === null ? (
              <section className="rounded-2xl border border-border bg-card p-5 text-center">
                <p className="text-sm font-semibold">
                  {unreachable
                    ? "Couldn't reach your gym just now"
                    : gymGone
                      ? `${link.gymName} is no longer on Dombelz`
                      : `${link.gymName} isn't carrying you on their member list`}
                </p>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  {unreachable
                    ? "Your gym is still linked. Open this page again in a moment to see your membership."
                    : gymGone
                      ? "This code doesn't belong to a gym any more, so there's nothing to keep it linked to. Remove it, and add your gym's new code if they have one."
                      : "They may have removed you. Ask them to add you back, or remove this gym and start again."}
                </p>
              </section>
            ) : (
              <>
                {membership.pending && (
                  <section className="rounded-2xl border border-accent/40 bg-accent/10 p-5">
                    <p className="flex items-center gap-2 text-sm font-semibold text-accent">
                      <Clock className="h-4 w-4" />
                      Waiting for {link.gymName} to confirm
                    </p>
                    <div className="mt-3 space-y-2">
                      <Row
                        label="Membership"
                        value={planLabel(membership.pending.planMonths)}
                      />
                      <Row
                        label="Started"
                        value={membership.pending.startDate ?? "—"}
                      />
                      <Row
                        label="Ends"
                        value={membership.pending.endDate ?? "—"}
                      />
                      {membership.pending.phone && (
                        <Row label="Phone" value={membership.pending.phone} />
                      )}
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">
                      Until they do, what's below is what's on your record.
                    </p>
                  </section>
                )}

                <section className="space-y-3 rounded-2xl border border-border bg-card p-5">
                  {isBlank(membership) ? (
                    <p className="text-sm text-muted-foreground">
                      No membership details yet. Add them so {link.gymName}{" "}
                      knows when you're due to renew.
                    </p>
                  ) : (
                    <>
                      <Row
                        label="Membership"
                        value={planLabel(membership.planMonths)}
                      />
                      <Row
                        label="Started"
                        value={membership.startDate ?? "—"}
                      />
                      <Row label="Ends" value={membership.endDate ?? "—"} />
                      <Row
                        label="Status"
                        value={membershipStatusLabel(
                          membershipStatus(
                            membership.startDate,
                            membership.endDate,
                            todayLocal(),
                          ),
                        )}
                      />
                      {membership.phone && (
                        <Row label="Phone" value={membership.phone} />
                      )}
                    </>
                  )}
                </section>
              </>
            )}

            <div className="flex gap-3">
              {membership !== null && (
                <Button
                  variant="outline"
                  onClick={startEditing}
                  className="flex-1 rounded-xl py-6 font-bold"
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  {isBlank(membership) ? "Add details" : "Edit details"}
                </Button>
              )}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    disabled={removing}
                    className="flex-1 rounded-xl py-6 font-bold text-red-500 hover:text-red-500"
                  >
                    {removing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Remove gym"
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remove your gym?</AlertDialogTitle>
                    <AlertDialogDescription>
                      {link.gymName} will stop seeing you on their member list,
                      and this can&apos;t be undone. Your Dombelz plan and
                      access are not affected.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep my gym</AlertDialogCancel>
                    <AlertDialogAction onClick={remove}>
                      Remove
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>

            {/* Only when it is still true. With no roster row this line used to
                sit directly under "isn't carrying you on their member list" and
                flatly contradict it. */}
            {membership !== null && (
              <p className="px-2 text-center text-xs text-muted-foreground">
                {link.source === "signup"
                  ? "You joined with this gym's code, so your ₹150 offer is on your Yearly plan."
                  : "You're on this gym's member list. Your Dombelz plan and price are unaffected."}
              </p>
            )}
          </>
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
                    onChange={(e) => {
                      setCodeInput(e.target.value.toUpperCase());
                      setCodeState("idle");
                      setCodeError(null);
                      setGymName(null);
                    }}
                    onBlur={() => {
                      if (codeState === "idle") void checkCode(codeInput);
                    }}
                    maxLength={20}
                    autoCapitalize="characters"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="GYM-IRONVAULT-123"
                    className="h-12 rounded-xl font-display tracking-[0.1em]"
                  />
                  <Button
                    variant="outline"
                    onClick={() => void checkCode(codeInput)}
                    disabled={!codeInput.trim() || codeState === "checking"}
                    className="h-12 shrink-0 rounded-xl px-5 font-bold"
                  >
                    {codeState === "checking" ? "Checking…" : "Apply"}
                  </Button>
                </div>

                {codeState === "valid" && gymName && (
                  <div className="flex items-center gap-2 rounded-xl border border-accent/40 bg-accent/10 px-3 py-2.5 text-sm">
                    <Building2 className="h-4 w-4 shrink-0 text-accent" />
                    <span className="font-semibold">{gymName}</span>
                    <span className="ml-auto flex items-center gap-1 text-xs font-semibold text-accent">
                      <Check className="h-3.5 w-3.5" /> Verified
                    </span>
                  </div>
                )}
                {codeState === "invalid" && codeError && (
                  <p className="flex items-center gap-1.5 text-sm text-red-500">
                    <X className="h-3.5 w-3.5 shrink-0" />
                    {codeError}
                  </p>
                )}
              </div>
            </section>

            {membershipForm}

            <Button
              onClick={join}
              disabled={codeState !== "valid" || saving}
              className="w-full rounded-xl py-6 font-bold"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : codeState === "valid" ? (
                "Join this gym"
              ) : (
                // A greyed-out button with nothing to read is a dead end. The
                // label is the only place the reason can go where somebody is
                // already looking.
                "Enter your gym code above"
              )}
            </Button>

            {/* Said before submitting, not after. Someone who reads this and
                decides not to bother has lost nothing. */}
            <p className="px-2 text-center text-xs text-muted-foreground">
              The ₹150 gym offer applies only to a code entered when you first
              created your account. Adding your gym here puts you on their
              member list — it does not change your Dombelz price.
            </p>
          </>
        )}
      </main>
    </div>
  );
}

function GymHeader({ link }: { link: LinkSummary }) {
  return (
    <section className="rounded-2xl border border-accent/30 bg-card p-6 text-center">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/15 text-accent">
        <Building2 className="h-8 w-8" />
      </div>
      <h2 className="font-display text-xl font-bold">{link.gymName}</h2>
      <p className="mt-2 font-display text-sm tracking-[0.15em] text-muted-foreground">
        {link.partnerCode}
      </p>
    </section>
  );
}

function planLabel(months: number | null): string {
  if (!months) return "Not set";
  return `${months} ${months === 1 ? "month" : "months"}`;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
