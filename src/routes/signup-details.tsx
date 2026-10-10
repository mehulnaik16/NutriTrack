import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/client";
import { toast } from "sonner";
import { HEARD_ABOUT, isIndianMobile, phoneDigits } from "@/lib/signupRules";

export const Route = createFileRoute("/signup-details")({
  component: SignupDetails,
});

/**
 * The last sign-up step, after pricing: a phone number (required) and where
 * they heard about Dombelz (optional). /dashboard sends anyone without a phone
 * number here until they answer, so it is asked once of every user.
 */
function SignupDetails() {
  const navigate = useNavigate();
  const [phone, setPhone] = useState("");
  const [heard, setHeard] = useState<string>();
  const [saving, setSaving] = useState(false);
  const { user } = useAuth();

  const save = async () => {
    // Signed out only when this page is opened directly while testing.
    if (user) {
      setSaving(true);
      const { error } = await supabase
        .from("user_profiles")
        .update({ phone: `+91${phone}`, heard_about: heard ?? null })
        .eq("id", user.id);
      setSaving(false);
      if (error) {
        toast.error("Couldn't save your number. Please try again.");
        return;
      }
    }
    navigate({ to: "/dashboard", replace: true });
  };
  const phoneOk = isIndianMobile(phone);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background px-4 py-8 text-foreground">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
        {/* No back arrow or progress line: the trial has started, there is
            nothing to go back to. */}
        <h1 className="mt-12 text-3xl font-semibold">Final question</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Answer this and you're all set.
        </p>

        <div className="mt-8 space-y-8">
          <div className="space-y-3">
            <Label htmlFor="sd-phone" className="block text-base">
              Phone number
            </Label>
            <div className="flex gap-2">
              <div
                aria-hidden
                className="flex h-14 w-16 shrink-0 items-center justify-center rounded-xl bg-card text-base"
              >
                +91
              </div>
              {/* Sized to the 10 digits: each digit sits in a 1.4rem cell over its
                  own bar (letter-spacing fills the cell after the digit). */}
              <div className="relative h-14 w-64 rounded-xl bg-card focus-within:ring-1 focus-within:ring-accent">
                <Input
                  id="sd-phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  value={phone}
                  onChange={(e) => setPhone(phoneDigits(e.target.value))}
                  // Chrome paints its own box on an autofilled input; cover it
                  // with the card colour so the field stays one surface.
                  className="h-11 border-0 bg-transparent pl-4 pr-1 text-lg tabular-nums tracking-[calc(1.4rem-1ch)] shadow-none md:text-lg focus-visible:ring-0 autofill:shadow-[inset_0_0_0_1000px_var(--card)] autofill:[-webkit-text-fill-color:var(--foreground)]"
                />
                {/* One bar per digit, under it, so the length shows at a glance. */}
                <div
                  aria-hidden
                  className="absolute bottom-2.5 left-4 flex text-lg"
                >
                  {Array.from({ length: 10 }, (_, i) => (
                    <span
                      key={i}
                      className={`mr-[calc(1.4rem-1ch)] h-[3px] w-[1ch] rounded-full transition-colors ${
                        phone.length === 10 && !phoneOk
                          ? "bg-red-500/70"
                          : phone.length > i
                            ? "bg-accent"
                            : "bg-muted-foreground/25"
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>
            {phone !== "" && !phoneOk && (
              <p className="text-xs text-red-500">
                Enter a 10-digit mobile number.
              </p>
            )}
          </div>

          <div className="space-y-3">
            <Label className="block text-base">
              How did you hear about us?{" "}
              <span className="font-normal text-muted-foreground">
                (optional)
              </span>
            </Label>
            <Select value={heard} onValueChange={setHeard}>
              <SelectTrigger className="h-12 rounded-xl border-0 bg-card text-base">
                <SelectValue placeholder="Select one" />
              </SelectTrigger>
              <SelectContent>
                {HEARD_ABOUT.map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-auto pt-12">
          <Button
            disabled={!phoneOk || saving}
            onClick={save}
            className="h-14 w-full rounded-full bg-accent text-lg font-bold text-accent-foreground hover:bg-accent/90 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-50"
          >
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}
