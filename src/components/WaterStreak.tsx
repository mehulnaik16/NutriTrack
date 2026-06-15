import { useCallback, useEffect, useState } from "react";
import { Droplets, Flame, Plus, Minus } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/client";

interface Props {
  userId: string;
  streak: number;
}

const DAILY_GOAL_ML = 2500;
const STEP_ML = 250;

export function WaterStreak({ userId, streak }: Props) {
  const [water, setWater] = useState(0);
  const [loading, setLoading] = useState(false);

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
    const next = Math.max(0, Math.min(DAILY_GOAL_ML + 500, water + delta));
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
    if (delta > 0 && next >= DAILY_GOAL_ML && water < DAILY_GOAL_ML) {
      toast.success("💧 Daily water goal hit! Great work.");
    }
  };

  const pct = Math.min(100, Math.round((water / DAILY_GOAL_ML) * 100));
  const glasses = Math.round(water / 250);

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
          <CardTitle className="flex items-center gap-2 text-base">
            <Droplets className="h-4 w-4 text-blue-500" />
            Water intake
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-end justify-between">
            <div>
              <span className="text-3xl font-bold">{water}</span>
              <span className="ml-1 text-sm text-muted-foreground">
                / {DAILY_GOAL_ML} ml
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
              onClick={() => update(-STEP_ML)}
              disabled={loading || water === 0}
              className="h-9 w-9"
            >
              <Minus className="h-4 w-4" />
            </Button>
            <Button
              onClick={() => update(STEP_ML)}
              disabled={loading}
              className="flex-1 bg-blue-500 text-white hover:bg-blue-600 gap-2"
            >
              <Plus className="h-4 w-4" />
              +250 ml
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
