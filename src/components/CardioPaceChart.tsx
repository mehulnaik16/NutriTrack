import { useEffect, useState } from "react";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { supabase } from "@/integrations/client";
import { useAuth } from "@/lib/auth";

interface CardioPaceChartProps {
  activityName: string;
}

export function CardioPaceChart({ activityName }: CardioPaceChartProps) {
  const { user } = useAuth();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !activityName) return;
    
    supabase
      .from("workout_logs")
      .select("date, duration_min, calories_burned, exercises_done")
      .eq("user_id", user.id)
      .eq("workout_name", activityName)
      .order("date", { ascending: true })
      .order("logged_at", { ascending: true })
      .then(({ data: logs }) => {
        if (!logs) {
          setData([]);
          setLoading(false);
          return;
        }

        const chartData = logs.map((l) => {
          const ex = !Array.isArray(l.exercises_done) ? (l.exercises_done as Record<string, any>) : null;
          const dist = ex?.distance ? parseFloat(String(ex.distance)) : null;
          const bpmVal = ex?.bpm ? Number(ex.bpm) : null;
          const pace =
            dist && l.duration_min
              ? (() => {
                  const ppm = l.duration_min / dist;
                  const min = Math.floor(ppm);
                  const sec = Math.round((ppm - min) * 60);
                  return sec === 60 ? min + 1 : min + sec / 60;
                })()
              : null;

          return {
            date: l.date.slice(5),
            duration: l.duration_min || 0,
            calories: Math.round(l.calories_burned || 0),
            pace,
            bpm: bpmVal,
          };
        });

        setData(chartData);
        setLoading(false);
      });
  }, [user, activityName]);

  if (loading) {
    return <div className="py-10 text-center text-sm text-muted-foreground animate-pulse">Loading chart...</div>;
  }

  if (data.length < 2) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Log this activity at least twice to see progress.
      </p>
    );
  }

  const hasPace = data.some((d) => d.pace !== null);

  return (
    <div className="space-y-6">
      {/* ── Pace over time (only when distance data exists) ── */}
      {hasPace && (
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Pace (min/km) — lower is faster
          </p>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart
              data={data.filter((d) => d.pace !== null)}
              margin={{ top: 8, right: 8, bottom: 0, left: -20 }}
            >
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
              <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" reversed />
              <Tooltip
                contentStyle={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  fontSize: 12,
                }}
                formatter={(v: any) => [`${Number(v).toFixed(2)} min/km`, "Pace"]}
              />
              <Line
                type="monotone"
                dataKey="pace"
                name="Pace"
                stroke="var(--accent)"
                strokeWidth={2.5}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Duration over time ── */}
      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Duration (min)
        </p>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
            <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
            <Tooltip
              contentStyle={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                fontSize: 12,
              }}
              formatter={(v: any) => [`${v} min`, "Duration"]}
            />
            <Line
              type="monotone"
              dataKey="duration"
              name="Duration"
              stroke="var(--accent)"
              strokeWidth={2.5}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* ── Calories over time ── */}
      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Calories burned
        </p>
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
            <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
            <Tooltip
              contentStyle={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                fontSize: 12,
              }}
              formatter={(v: any) => [`${v} kcal`, "Calories"]}
            />
            <Line
              type="monotone"
              dataKey="calories"
              name="Calories"
              stroke="var(--muted-foreground)"
              strokeDasharray="5 4"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
