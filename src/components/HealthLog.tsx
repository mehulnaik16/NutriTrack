/**
 * DOMBELZ Health Log (Hypertension & Diabetes)
 *
 * Implements Indian Clinical Guidelines (InSH 2023) for Blood Pressure
 * and Indian standard plasma glucose bands for Diabetes.
 *
 * Fast logging (<8s BP, <5s DM), zero noise, real-time signal banner,
 * auto-dismiss toast, and history bottom sheet with Edit & Delete support.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Heart,
  Droplet,
  Pencil,
  Trash2,
  X,
  History as HistoryIcon,
} from "lucide-react";
import { toast } from "sonner";
import { SubHeader } from "@/components/SubHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { supabase } from "@/integrations/client";
import { cn } from "@/lib/utils";
import {
  type HealthCondition,
  type VitalsInference,
  evaluateDiabetes,
  evaluateHypertension,
  sanitizeNumericInput,
  validateBloodGlucose,
  validateBloodPressure,
  HYPERTENSION_LIMITS,
  DIABETES_LIMITS,
} from "@/lib/healthVitals";

export interface HealthLogRecord {
  id: string;
  user_id: string;
  condition: HealthCondition;
  systolic: number | null;
  diastolic: number | null;
  glucose: number | null;
  logged_at: string;
  created_at?: string;
}

const STORAGE_CONDITION_KEY = "dombelz_health_condition";
const STORAGE_LOGS_KEY = "dombelz_health_logs_cache_";

export function HealthLogPage({
  userId,
  onBack,
}: {
  userId: string;
  onBack: () => void;
}) {
  // Condition state (persisted across sessions)
  const [condition, setCondition] = useState<HealthCondition>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(STORAGE_CONDITION_KEY);
      if (saved === "diabetes" || saved === "hypertension") return saved;
    }
    return "hypertension";
  });

  // Hypertension inputs
  const [systolicStr, setSystolicStr] = useState("");
  const [diastolicStr, setDiastolicStr] = useState("");

  // Diabetes inputs
  const [glucoseStr, setGlucoseStr] = useState("");

  // Editing state for history edit
  const [editingId, setEditingId] = useState<string | null>(null);

  // History state
  const [historyOpen, setHistoryOpen] = useState(false);
  const [logs, setLogs] = useState<HealthLogRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Debounced inference state (300ms)
  const [debouncedInference, setDebouncedInference] =
    useState<VitalsInference | null>(null);
  const prevCategoryRef = useRef<string | null>(null);

  // Persist condition choice
  const handleConditionSwitch = (newCond: HealthCondition) => {
    if (newCond === condition) return;
    setCondition(newCond);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_CONDITION_KEY, newCond);
    }
    // Discard unsaved draft on rapid toggle (speed over ceremony)
    setSystolicStr("");
    setDiastolicStr("");
    setGlucoseStr("");
    setEditingId(null);
    setDebouncedInference(null);
    prevCategoryRef.current = null;
  };

  // ─── Real-time Validations ───
  const bpValidation = useMemo(
    () => validateBloodPressure(systolicStr, diastolicStr),
    [systolicStr, diastolicStr],
  );

  const dmValidation = useMemo(
    () => validateBloodGlucose(glucoseStr),
    [glucoseStr],
  );

  // ─── Debounced Inference Engine (300ms) ───
  useEffect(() => {
    const timer = setTimeout(() => {
      let inference: VitalsInference | null = null;

      if (condition === "hypertension") {
        if (
          bpValidation.ok &&
          bpValidation.systolic &&
          bpValidation.diastolic
        ) {
          inference = evaluateHypertension(
            bpValidation.systolic,
            bpValidation.diastolic,
          );
        }
      } else {
        if (dmValidation.ok && dmValidation.glucose) {
          inference = evaluateDiabetes(dmValidation.glucose);
        }
      }

      setDebouncedInference(inference);

      // Haptic feedback on category transition
      if (
        inference &&
        prevCategoryRef.current &&
        prevCategoryRef.current !== inference.category
      ) {
        if (typeof window !== "undefined" && "vibrate" in navigator) {
          navigator.vibrate(15);
        }
      }
      prevCategoryRef.current = inference ? inference.category : null;
    }, 300);

    return () => clearTimeout(timer);
  }, [condition, bpValidation, dmValidation]);

  // ─── Load History ───
  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      // 1. Load local cache first
      if (typeof window !== "undefined") {
        const cached = localStorage.getItem(STORAGE_LOGS_KEY + userId);
        if (cached) {
          try {
            setLogs(JSON.parse(cached));
          } catch {
            // ignore
          }
        }
      }

      // 2. Fetch from Supabase
      const { data, error } = await supabase
        .from("health_logs")
        .select("*")
        .eq("user_id", userId)
        .order("logged_at", { ascending: false })
        .limit(7);

      if (!error && data) {
        setLogs(data as HealthLogRecord[]);
        if (typeof window !== "undefined") {
          localStorage.setItem(STORAGE_LOGS_KEY + userId, JSON.stringify(data));
        }
      }
    } catch {
      // fallback to cached logs
    } finally {
      setLoadingHistory(false);
    }
  }, [userId]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // ─── Save / Update Action ───
  const handleSave = async () => {
    const isBP = condition === "hypertension";

    if (
      isBP &&
      (!bpValidation.ok || !bpValidation.systolic || !bpValidation.diastolic)
    ) {
      return;
    }
    if (!isBP && (!dmValidation.ok || !dmValidation.glucose)) {
      return;
    }

    const payload: Partial<HealthLogRecord> = {
      user_id: userId,
      condition,
      systolic: isBP ? bpValidation.systolic! : null,
      diastolic: isBP ? bpValidation.diastolic! : null,
      glucose: !isBP ? dmValidation.glucose! : null,
      logged_at: new Date().toISOString(),
    };

    try {
      if (editingId) {
        // Update existing record
        await supabase.from("health_logs").update(payload).eq("id", editingId);

        // Update local state
        setLogs((prev) =>
          prev.map((item) =>
            item.id === editingId
              ? ({ ...item, ...payload } as HealthLogRecord)
              : item,
          ),
        );
        setEditingId(null);
        toast.success("Reading updated.");
      } else {
        // Insert new record
        const tempId = "local_" + Date.now();
        const newRecord: HealthLogRecord = {
          id: tempId,
          ...(payload as Omit<HealthLogRecord, "id">),
        };

        const { data, error } = await supabase
          .from("health_logs")
          .insert(payload)
          .select()
          .single();

        const savedRecord =
          !error && data ? (data as HealthLogRecord) : newRecord;
        const updatedLogs = [
          savedRecord,
          ...logs.filter((l) => l.id !== tempId),
        ].slice(0, 7);
        setLogs(updatedLogs);

        if (typeof window !== "undefined") {
          localStorage.setItem(
            STORAGE_LOGS_KEY + userId,
            JSON.stringify(updatedLogs),
          );
        }

        // Green auto-dismiss 1.5s toast matching Image 1
        toast.success("Logged (auto-dismiss 1.5s)", {
          duration: 1500,
          className: "bg-emerald-600 text-white font-medium border-0",
        });
      }

      // Clear input fields
      setSystolicStr("");
      setDiastolicStr("");
      setGlucoseStr("");
    } catch (err) {
      toast.error("Could not save reading. Please try again.");
    }
  };

  // ─── Edit History Item ───
  const startEdit = (record: HealthLogRecord) => {
    setEditingId(record.id);
    setCondition(record.condition);
    if (record.condition === "hypertension") {
      setSystolicStr(String(record.systolic ?? ""));
      setDiastolicStr(String(record.diastolic ?? ""));
    } else {
      setGlucoseStr(String(record.glucose ?? ""));
    }
    setHistoryOpen(false);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setSystolicStr("");
    setDiastolicStr("");
    setGlucoseStr("");
  };

  // ─── Delete History Item ───
  const deleteRecord = async (id: string) => {
    try {
      await supabase.from("health_logs").delete().eq("id", id);
      const filtered = logs.filter((l) => l.id !== id);
      setLogs(filtered);
      if (typeof window !== "undefined") {
        localStorage.setItem(
          STORAGE_LOGS_KEY + userId,
          JSON.stringify(filtered),
        );
      }
      if (editingId === id) {
        cancelEdit();
      }
      toast.success("Reading deleted.");
    } catch {
      toast.error("Could not delete reading.");
    }
  };

  // Determine if Save button is enabled
  const canSave =
    condition === "hypertension" ? bpValidation.ok : dmValidation.ok;

  return (
    <div className="min-h-screen bg-background pb-24 text-foreground">
      {/* Top Header */}
      <SubHeader title="Health Log" onBack={onBack} />

      <main className="mx-auto max-w-lg px-4 py-6 space-y-6">
        {/* Pill Segmented Toggle (Image 1 reference) */}
        <div className="flex justify-center">
          <div
            role="tablist"
            className="flex w-full max-w-xs items-center rounded-full border border-border bg-card p-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={condition === "hypertension"}
              aria-pressed={condition === "hypertension"}
              onClick={() => handleConditionSwitch("hypertension")}
              className={cn(
                "flex-1 min-h-[44px] rounded-full text-sm font-semibold transition-all duration-200 font-display",
                condition === "hypertension"
                  ? "bg-accent text-accent-foreground shadow-sm glow-accent-sm font-bold"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Hypertension
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={condition === "diabetes"}
              aria-pressed={condition === "diabetes"}
              onClick={() => handleConditionSwitch("diabetes")}
              className={cn(
                "flex-1 min-h-[44px] rounded-full text-sm font-semibold transition-all duration-200 font-display",
                condition === "diabetes"
                  ? "bg-accent text-accent-foreground shadow-sm glow-accent-sm font-bold"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Diabetes
            </button>
          </div>
        </div>

        {/* Input Card Container (Image 1 reference) */}
        <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-sm space-y-5">
          {editingId && (
            <div className="flex items-center justify-between rounded-lg bg-accent/10 px-3 py-2 text-xs font-medium text-accent">
              <span>Editing recorded reading</span>
              <button
                type="button"
                onClick={cancelEdit}
                className="flex items-center gap-1 hover:underline"
              >
                <X className="h-3.5 w-3.5" /> Cancel
              </button>
            </div>
          )}

          {/* Condition: Hypertension */}
          {condition === "hypertension" && (
            <div className="space-y-4">
              {/* Systolic */}
              <div className="space-y-1.5">
                <Label htmlFor="systolic" className="text-sm font-semibold">
                  Systolic
                </Label>
                <div className="relative">
                  <Input
                    id="systolic"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="130"
                    value={systolicStr}
                    onChange={(e) => {
                      const clean = sanitizeNumericInput(e.target.value);
                      if (clean.length <= 3) setSystolicStr(clean);
                    }}
                    className={cn(
                      "h-12 pr-16 text-lg font-mono transition-colors",
                      bpValidation.systolicError &&
                        "border-red-500 focus-visible:ring-red-500",
                    )}
                    aria-label="Systolic blood pressure in millimetres of mercury"
                  />
                  <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    mmHg
                  </span>
                </div>
                {bpValidation.systolicError && (
                  <p className="text-xs text-red-600 dark:text-red-400">
                    {bpValidation.systolicError}
                  </p>
                )}
              </div>

              {/* Diastolic */}
              <div className="space-y-1.5">
                <Label htmlFor="diastolic" className="text-sm font-semibold">
                  Diastolic
                </Label>
                <div className="relative">
                  <Input
                    id="diastolic"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="90"
                    value={diastolicStr}
                    onChange={(e) => {
                      const clean = sanitizeNumericInput(e.target.value);
                      if (clean.length <= 3) setDiastolicStr(clean);
                    }}
                    className={cn(
                      "h-12 pr-16 text-lg font-mono transition-colors",
                      bpValidation.diastolicError &&
                        (bpValidation.diastolicError.includes(
                          "lower than systolic",
                        )
                          ? "border-amber-500 focus-visible:ring-amber-500"
                          : "border-red-500 focus-visible:ring-red-500"),
                    )}
                    aria-label="Diastolic blood pressure in millimetres of mercury"
                  />
                  <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    mmHg
                  </span>
                </div>
                {bpValidation.diastolicError && (
                  <p
                    className={cn(
                      "text-xs",
                      bpValidation.diastolicError.includes(
                        "lower than systolic",
                      )
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-red-600 dark:text-red-400",
                    )}
                  >
                    {bpValidation.diastolicError}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Condition: Diabetes */}
          {condition === "diabetes" && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="glucose" className="text-sm font-semibold">
                  Blood Glucose
                </Label>
                <div className="relative">
                  <Input
                    id="glucose"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="100"
                    value={glucoseStr}
                    onChange={(e) => {
                      const clean = sanitizeNumericInput(e.target.value);
                      if (!clean) {
                        setGlucoseStr("");
                        return;
                      }
                      const num = parseInt(clean, 10);
                      // Auto-cap at 1800
                      if (num > DIABETES_LIMITS.glucose.max) {
                        setGlucoseStr(String(DIABETES_LIMITS.glucose.max));
                      } else {
                        setGlucoseStr(clean);
                      }
                    }}
                    className={cn(
                      "h-12 pr-16 text-lg font-mono transition-colors",
                      dmValidation.error &&
                        "border-red-500 focus-visible:ring-red-500",
                    )}
                    aria-label="Blood glucose in milligrams per decilitre"
                  />
                  <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    mg/dL
                  </span>
                </div>
                {dmValidation.error && (
                  <p className="text-xs text-red-600 dark:text-red-400">
                    {dmValidation.error}
                  </p>
                )}
                {dmValidation.warning && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    {dmValidation.warning}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Real-time Signal Banner (Theme-adaptive) */}
          <div
            role="status"
            aria-live="polite"
            className={cn(
              "relative overflow-hidden rounded-xl border border-border bg-card p-4 transition-all duration-300",
              debouncedInference?.pulse && "animate-pulse border-red-500/50",
            )}
          >
            {/* Left Edge 4px Color Bar */}
            <div
              className="absolute left-0 top-0 bottom-0 w-1.5"
              style={{
                backgroundColor: debouncedInference
                  ? debouncedInference.color
                  : "#757575",
              }}
            />

            <div className="pl-2 space-y-1">
              <h4
                className={cn(
                  "text-base font-bold font-display leading-tight",
                  debouncedInference
                    ? debouncedInference.textClass
                    : "text-muted-foreground",
                )}
              >
                {debouncedInference
                  ? debouncedInference.category
                  : "Enter a reading to see its meaning"}
              </h4>
              <p className="text-xs sm:text-sm text-foreground/80 leading-relaxed font-sans">
                {debouncedInference
                  ? debouncedInference.meaning
                  : condition === "hypertension"
                    ? "Based on Indian Society of Hypertension (InSH 2023) guidelines."
                    : "Based on Indian standard plasma glucose diagnostic thresholds."}
              </p>
            </div>
          </div>

          {/* Log Reading Button */}
          <Button
            type="button"
            disabled={!canSave}
            onClick={handleSave}
            className="h-12 w-full rounded-xl bg-accent text-accent-foreground font-bold hover:bg-accent/90 disabled:opacity-40 transition-all text-base glow-accent-sm font-display"
          >
            {editingId ? "Update Reading" : "Log Reading"}
          </Button>

          {/* View History Centered Link */}
          <div className="text-center pt-1">
            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              className="text-sm font-semibold text-accent hover:text-accent/80 inline-flex items-center gap-1.5 py-1 transition-colors font-display"
            >
              <HistoryIcon className="h-4 w-4" /> View History
            </button>
          </div>
        </div>
      </main>

      {/* History Bottom Sheet (Drawer with Edit & Delete) */}
      <Drawer open={historyOpen} onOpenChange={setHistoryOpen}>
        <DrawerContent className="max-w-lg mx-auto p-5 pb-8">
          <DrawerHeader className="px-0 pt-0">
            <DrawerTitle className="text-lg font-bold flex items-center gap-2">
              <HistoryIcon className="h-5 w-5 text-accent" />
              Reading History
            </DrawerTitle>
            <DrawerDescription className="text-xs text-muted-foreground">
              Last 7 recorded readings. Tap edit to modify or trash to delete.
            </DrawerDescription>
          </DrawerHeader>

          <div className="mt-4 space-y-2.5">
            {logs.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No readings logged yet.
              </div>
            ) : (
              logs.map((record) => {
                const isBP = record.condition === "hypertension";
                const inference = isBP
                  ? record.systolic && record.diastolic
                    ? evaluateHypertension(record.systolic, record.diastolic)
                    : null
                  : record.glucose
                    ? evaluateDiabetes(record.glucose)
                    : null;

                const dateStr = new Date(record.logged_at).toLocaleDateString(
                  "en-IN",
                  {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  },
                );

                return (
                  <div
                    key={record.id}
                    className="flex items-center justify-between rounded-xl border border-border bg-card p-3.5 transition-colors hover:bg-muted/30"
                  >
                    {/* Left: Indicator dot & value */}
                    <div className="flex items-center gap-3">
                      <span
                        className="h-3 w-3 rounded-full shrink-0"
                        style={{
                          backgroundColor: inference
                            ? inference.color
                            : "#757575",
                        }}
                      />
                      <div>
                        <div className="font-mono text-base font-bold leading-tight">
                          {isBP
                            ? `${record.systolic}/${record.diastolic} mmHg`
                            : `${record.glucose} mg/dL`}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {inference?.category ?? record.condition} • {dateStr}
                        </div>
                      </div>
                    </div>

                    {/* Right: Actions (Edit & Delete) */}
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={() => startEdit(record)}
                        aria-label="Edit reading"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={() => deleteRecord(record.id)}
                        aria-label="Delete reading"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
