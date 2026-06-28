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

  const [dailyGoalMl, setDailyGoalMl] = useState(() => {
    const saved = localStorage.getItem("waterDailyGoal");
    return saved ? parseInt(saved, 10) : 2500;
  });
  const [stepMl, setStepMl] = useState(() => {
    const saved = localStorage.getItem("waterStep");
    return saved ? parseInt(saved, 10) : 250;
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const handleSaveSettings = () => {
    localStorage.setItem("waterDailyGoal", dailyGoalMl.toString());
    localStorage.setItem("waterStep", stepMl.toString());
    setIsSettingsOpen(false);
    toast.success("Water preferences saved");
  };

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

  const pct = Math.min(100, Math.round((water / dailyGoalMl) * 100));
  const glasses = Math.round(water / stepMl);

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
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <Settings2 className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Water Settings</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="dailyGoal" className="text-right">
                      Daily Goal (ml)
                    </Label>
                    <Input
                      id="dailyGoal"
                      type="number"
                      value={dailyGoalMl}
                      onChange={(e) => setDailyGoalMl(Number(e.target.value))}
                      className="col-span-3"
                    />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="stepMl" className="text-right">
                      Cup Size (ml)
                    </Label>
                    <Input
                      id="stepMl"
                      type="number"
                      value={stepMl}
                      onChange={(e) => setStepMl(Number(e.target.value))}
                      className="col-span-3"
                    />
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
          <Progress value={pct} className="h-2.5" />
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => update(-stepMl)}
              disabled={loading || water === 0}
              className="h-9 w-9"
            >
              <Minus className="h-4 w-4" />
            </Button>
            <Button
              onClick={() => update(stepMl)}
              disabled={loading}
              className="flex-1 bg-blue-500 text-white hover:bg-blue-600 gap-2"
            >
              <Plus className="h-4 w-4" />
              +{stepMl} ml
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
