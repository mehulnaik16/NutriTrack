import { useCallback, useEffect, useState } from "react";
import { Droplets, Flame, Plus, Minus, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  userId: string;
  streak: number;
}

export function WaterStreak({ userId, streak }: Props) {
  const [water, setWater] = useState(0);
  const [loading, setLoading] = useState(false);

  // ── Settings state ────────────────────────────────────────────────────────
  const [dailyGoalMl, setDailyGoalMl] = useState(() => {
    const saved = localStorage.getItem("waterDailyGoal");
    const val = saved ? parseInt(saved, 10) : 2500;
    return val >= 1500 ? val : 2500; // enforce minimum on load
  });
  const [stepMl, setStepMl] = useState(() => {
    const saved = localStorage.getItem("waterStep");
    const val = saved ? parseInt(saved, 10) : 250;
    return val >= 25 ? val : 250; // enforce minimum on load
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // ── Controlled string inputs (allow truly empty while typing) ─────────────
  const [goalInput, setGoalInput] = useState("");
  const [stepInput, setStepInput] = useState("");
  const [goalError, setGoalError] = useState("");
  const [stepError, setStepError] = useState("");

  // Sync string inputs whenever settings dialog opens
  useEffect(() => {
    if (isSettingsOpen) {
      setGoalInput(dailyGoalMl.toString());
      setStepInput(stepMl.toString());
      setGoalError("");
      setStepError("");
    }
  }, [isSettingsOpen, dailyGoalMl, stepMl]);

  // ── Validate on blur ───────────────────────────────────────────────────────
  const handleGoalBlur = () => {
    const val = goalInput.trim();
    if (val === "") {
      setGoalError("Daily goal is required.");
      return;
    }
    const num = Number(val);
    if (!Number.isFinite(num) || num <= 0) {
      setGoalError("Daily goal must be a positive number.");
    } else if (num < 1500) {
      setGoalError("Daily goal must be at least 1500 ml.");
    } else {
      setGoalError("");
    }
  };

  const handleStepBlur = () => {
    const val = stepInput.trim();
    if (val === "") {
      setStepError("Cup size is required.");
      return;
    }
    const num = Number(val);
    if (!Number.isFinite(num) || num <= 0) {
      setStepError("Cup size must be a positive number.");
    } else if (num < 25) {
      setStepError("Cup size must be at least 25 ml.");
    } else {
      setStepError("");
    }
  };

  // ── Save settings with full validation ────────────────────────────────────
  const handleSaveSettings = () => {
    // Re-run full validation before saving
    const goalVal = goalInput.trim();
    const stepVal = stepInput.trim();

    let hasError = false;

    if (goalVal === "") {
      setGoalError("Daily goal is required.");
      hasError = true;
    } else {
      const gNum = Number(goalVal);
      if (!Number.isFinite(gNum) || gNum <= 0) {
        setGoalError("Daily goal must be a positive number.");
        hasError = true;
      } else if (gNum < 1500) {
        setGoalError("Daily goal must be at least 1500 ml.");
        hasError = true;
      } else {
        setGoalError("");
      }
    }

    if (stepVal === "") {
      setStepError("Cup size is required.");
      hasError = true;
    } else {
      const sNum = Number(stepVal);
      if (!Number.isFinite(sNum) || sNum <= 0) {
        setStepError("Cup size must be a positive number.");
        hasError = true;
      } else if (sNum < 25) {
        setStepError("Cup size must be at least 25 ml.");
        hasError = true;
      } else {
        setStepError("");
      }
    }

    if (hasError) return;

    // Sanitize and save
    const newGoal = Math.floor(Number(goalVal));
    const newStep = Math.floor(Number(stepVal));

    setDailyGoalMl(newGoal);
    setStepMl(newStep);
    localStorage.setItem("waterDailyGoal", newGoal.toString());
    localStorage.setItem("waterStep", newStep.toString());
    setIsSettingsOpen(false);
    toast.success("Water preferences saved");
  };

  // ── Load today's water intake ──────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("water_logs")
      .select("amount_ml")
      .eq("user_id", userId)
      .eq("date", today)
      .maybeSingle();
    setWater(data?.amount_ml ?? 0);
  }, [userId, today]);

  useEffect(() => {
    load();
  }, [load]);

  // ── Add / remove water ─────────────────────────────────────────────────────
  const update = async (delta: number) => {
    const next = Math.max(0, Math.min(dailyGoalMl + 500, water + delta));
    setLoading(true);
    const { error } = await supabase
      .from("water_logs")
      .upsert(
        { user_id: userId, date: today, amount_ml: next },
        { onConflict: "user_id,date" },
      );
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setWater(next);
    if (delta > 0 && next >= dailyGoalMl && water < dailyGoalMl) {
      toast.success("💧 Daily water goal hit! Great work.");
    }
  };

  const pct = dailyGoalMl > 0 ? Math.min(100, Math.round((water / dailyGoalMl) * 100)) : 0;
  const glasses = stepMl > 0 ? Math.floor(water / stepMl) : 0;

  const streakEmoji =
    streak >= 30 ? "🔥" : streak >= 14 ? "⚡" : streak >= 7 ? "✨" : "🌱";
  const streakMsg =
    streak === 0
      ? "Start your streak today!"
      : streak === 1
        ? "Day 1 — keep going!"
        : streak < 7
          ? `${streak} days — building the habit`
          : streak < 14
            ? `${streak} days — one week strong!`
            : streak < 30
              ? `${streak} days — you're on fire!`
              : `${streak} days — absolute legend`;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {/* Water card */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-base">
            <div className="flex items-center gap-2">
              <Droplets className="h-4 w-4 text-blue-500" />
              Water intake
            </div>
            <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Water settings">
                  <Settings2 className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Water Settings</DialogTitle>
                </DialogHeader>
                <div className="grid gap-5 py-4">
                  {/* Daily Goal */}
                  <div className="grid grid-cols-4 items-start gap-4">
                    <Label htmlFor="dailyGoal" className="text-right pt-2">
                      Daily Goal (ml)
                    </Label>
                    <div className="col-span-3 space-y-1">
                      <Input
                        id="dailyGoal"
                        type="text"
                        inputMode="numeric"
                        placeholder="Enter ml"
                        value={goalInput}
                        onChange={(e) => {
                          // Allow free typing — only digits and optional leading chars
                          const raw = e.target.value;
                          if (raw === "" || /^\d*$/.test(raw)) {
                            setGoalInput(raw);
                            if (goalError) setGoalError(""); // clear error while editing
                          }
                        }}
                        onBlur={handleGoalBlur}
                        aria-invalid={!!goalError}
                        aria-describedby={goalError ? "goalError" : undefined}
                      />
                      {goalError && (
                        <p id="goalError" className="text-xs text-destructive">
                          {goalError}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Cup Size */}
                  <div className="grid grid-cols-4 items-start gap-4">
                    <Label htmlFor="stepMl" className="text-right pt-2">
                      Cup Size (ml)
                    </Label>
                    <div className="col-span-3 space-y-1">
                      <Input
                        id="stepMl"
                        type="text"
                        inputMode="numeric"
                        placeholder="Enter ml"
                        value={stepInput}
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (raw === "" || /^\d*$/.test(raw)) {
                            setStepInput(raw);
                            if (stepError) setStepError("");
                          }
                        }}
                        onBlur={handleStepBlur}
                        aria-invalid={!!stepError}
                        aria-describedby={stepError ? "stepError" : undefined}
                      />
                      {stepError && (
                        <p id="stepError" className="text-xs text-destructive">
                          {stepError}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button onClick={handleSaveSettings}>Save changes</Button>
                </div>
              </DialogContent>
            </Dialog>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Amount display */}
          <div className="flex items-end justify-between">
            <div>
              <span className="text-3xl font-bold">{water}</span>
              <span className="ml-1 text-sm text-muted-foreground">
                / {dailyGoalMl} ml
              </span>
            </div>
            <span className="text-sm text-muted-foreground">
              {glasses} glasses
            </span>
          </div>

          {/* Progress bar */}
          <Progress value={pct} className="h-2.5" />

          {/* Controls: minus | large + button showing amount */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => update(-stepMl)}
              disabled={loading || water === 0}
              className="h-9 w-9 shrink-0"
              aria-label="Remove water"
            >
              <Minus className="h-4 w-4" />
            </Button>
            <Button
              onClick={() => update(stepMl)}
              disabled={loading}
              className="flex-1 bg-blue-500 text-white hover:bg-blue-600 gap-2"
              aria-label={`Add ${stepMl} ml of water`}
            >
              <Plus className="h-4 w-4" />
              {`${stepMl} ml`}
            </Button>
          </div>

          {pct >= 100 && (
            <p className="text-center text-xs font-medium text-blue-500">
              💧 Goal complete!
            </p>
          )}
        </CardContent>
      </Card>

      {/* Streak card */}
      <Card
        className={
          streak >= 7 ? "border-[var(--energy)]/30 bg-[var(--energy)]/5" : ""
        }
      >
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Flame className="h-4 w-4 text-[var(--fat)]" />
            Logging streak
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-end gap-2">
            <span className="text-3xl font-bold">{streak}</span>
            <span className="mb-1 text-sm text-muted-foreground">
              days in a row
            </span>
            <span className="mb-1 text-xl">{streakEmoji}</span>
          </div>
          <p className="text-sm text-muted-foreground">{streakMsg}</p>
          {streak > 0 && (
            <div className="flex gap-1 pt-1">
              {Array.from({ length: Math.min(streak, 14) }).map((_, i) => (
                <div
                  key={i}
                  className="h-2 flex-1 rounded-full bg-[var(--energy)]"
                  style={{ opacity: 0.4 + (i / Math.min(streak, 14)) * 0.6 }}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
