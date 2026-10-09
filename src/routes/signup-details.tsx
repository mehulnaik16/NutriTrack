import {
  createFileRoute,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
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
import { SignupProgress } from "@/components/SignupProgress";
import { useForceLightTheme } from "@/lib/theme";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/client";
import { toast } from "sonner";

export const Route = createFileRoute("/signup-details")({
  component: SignupDetails,
});

/** Stored key -> label. Keys match the heard_about check in the migration. */
const HEARD_ABOUT: [string, string][] = [
  ["instagram", "Instagram"],
  ["youtube", "YouTube"],
  ["google", "Google search"],
  ["friend", "Friend or family"],
  ["gym", "Gym or trainer"],
  ["facebook", "Facebook"],
  ["x", "X (Twitter)"],
  ["app_store", "App Store / Play Store"],
  ["other", "Other"],
];

/**
 * Right after "Create an account": a phone number (required) and where they
 * heard about Dombelz (optional), then on to pricing.
 */
function SignupDetails() {
  useForceLightTheme();
  const navigate = useNavigate();
  const router = useRouter();
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
    navigate({ to: "/plans", replace: true });
  };
  // Indian mobile numbers: 10 digits starting 6-9.
  const phoneOk = /^[6-9]\d{9}$/.test(phone);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background px-4 py-8 text-foreground">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
        <SignupProgress
          page={3}
          label="Final question"
          onBack={() => router.history.back()}
        />

        <h1 className="text-3xl font-semibold">Final question</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Answer this and you're all set.
        </p>

        <div className="mt-8 space-y-6">
          <div className="space-y-2">
            <Label htmlFor="sd-phone" className="text-base">
              Phone number
            </Label>
            <div className="flex h-12 items-center rounded-xl bg-card focus-within:ring-1 focus-within:ring-accent">
              <span className="pl-3 pr-2 text-muted-foreground">+91</span>
              <Input
                id="sd-phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                maxLength={10}
                placeholder="98765 43210"
                value={phone}
                onChange={(e) =>
                  setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))
                }
                className="h-12 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
              />
            </div>
            {phone !== "" && !phoneOk && (
              <p className="text-xs text-red-500">
                Enter a 10-digit mobile number.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-base">
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
