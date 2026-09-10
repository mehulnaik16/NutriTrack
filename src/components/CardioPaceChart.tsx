/**
 * Dynamic cardio analytics charts — renders exactly two charts per the
 * category-driven spec. The Y-axis metric, label, unit, and inversion
 * are driven by the activity's category config in cardioCategories.ts.
 *
 * Replaces the old triple-chart (pace / duration / calories) layout.
 * Old logs without a `category` field in exercises_done fall back to
 * the "distance" category (pre-existing behaviour).
 */
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
import {
  type CardioCategory,
  type ChartConfig,
  categoryOf,
  chartsFor,
  computePaceNumeric,
  formatPace,
} from "@/lib/cardioCategories";

interface Props {
  activityName: string;
}

interface ChartDatum {
  date: string;
  duration: number;
  calories: number;
  pace: number | null;
  distance: number | null;
  avgPower: number | null;
  rounds: number | null;
}

function buildChartData(
  logs: any[],
  category: CardioCategory,
): ChartDatum[] {
  return logs.map((l) => {
    const ex =
      l.exercises_done &&
      typeof l.exercises_done === "object" &&
      !Array.isArray(l.exercises_done)
        ? (l.exercises_done as Record<string, any>)
        : {};

    const dist = ex.distance ? parseFloat(String(ex.distance)) : null;
    const pace = dist
      ? computePaceNumeric(l.duration_min, dist, category)
      : null;

    return {
      date: l.date.slice(5),
      duration: l.duration_min || 0,
      calories: Math.round(l.calories_burned || 0),
      pace,
      distance: dist,
      avgPower: ex.avg_power ? Number(ex.avg_power) : null,
      rounds: ex.rounds ? Number(ex.rounds) : null,
    };
  });
}

/** Single chart panel used by both chart slots. */
function ChartPanel({
  data,
  config,
  height = 200,
}: {
  data: ChartDatum[];
  config: ChartConfig;
  height?: number;
}) {
  // Filter out nulls for metrics that might be absent
  const filtered =
    config.metric === "pace" || config.metric === "avgPower" || config.metric === "rounds"
      ? data.filter((d) => (d as any)[config.metric] !== null)
      : data;

  if (filtered.length < 2) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Need at least 2 entries to chart {config.label.toLowerCase()}.
      </p>
    );
  }

  const paceFormatter = (v: any) => {
    if (config.metric === "pace") return [formatPace(Number(v)), config.label.split(" —")[0]];
    return [`${v} ${config.unit}`, config.label.split(" —")[0]];
  };

  return (
    <div>
      <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        {config.label}
      </p>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart
          data={filtered}
          margin={{ top: 8, right: 8, bottom: 0, left: -20 }}
        >
          {/* SVG glow filter for the data line */}
          <defs>
            <filter id={`glow-${config.metric}`} x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <CartesianGrid
            stroke="var(--border)"
            strokeDasharray="4 4"
            vertical
          />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11 }}
            stroke="var(--muted-foreground)"
          />
          <YAxis
            tick={{ fontSize: 11 }}
            stroke="var(--muted-foreground)"
            reversed={config.inverted}
          />
          <Tooltip
            contentStyle={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              fontSize: 12,
            }}
            formatter={paceFormatter}
          />
          <Line
            type="monotone"
            dataKey={config.metric}
            name={config.label.split(" —")[0]}
            stroke="var(--accent)"
            strokeWidth={3}
            dot={false}
            filter={`url(#glow-${config.metric})`}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CardioPaceChart({ activityName }: Props) {
  const { user } = useAuth();
  const [data, setData] = useState<ChartDatum[]>([]);
  const [loading, setLoading] = useState(true);

  const category = categoryOf(activityName);
  const [chart1, chart2] = chartsFor(activityName);

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
        setData(logs ? buildChartData(logs, category) : []);
        setLoading(false);
      });
  }, [user, activityName]);

  if (loading) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground animate-pulse">
        Loading charts...
      </div>
    );
  }

  if (data.length < 2) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Log this activity at least twice to see progress.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <ChartPanel data={data} config={chart1} height={200} />
      <ChartPanel data={data} config={chart2} height={180} />
    </div>
  );
}
