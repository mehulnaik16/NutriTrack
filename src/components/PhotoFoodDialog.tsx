/**
 * Photograph a plate, let the vision model name it and estimate the portion.
 *
 * Returns the recognised food rather than writing it anywhere: the food log
 * inserts a `food_logs` row, the meal builder appends an ingredient. Lifted out
 * of FoodSearch so both screens can use it.
 *
 * Carries `react-webcam`, so both callers load it through `React.lazy`.
 */

import { useRef, useState } from "react";
import { Camera, Loader2, Plus, X } from "lucide-react";
import Webcam from "react-webcam";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  serverGeminiLiteVision,
  serverGeminiVision,
  serverGroqVision,
} from "@/lib/ai";
import { type IFCTItem, kcalOf } from "@/lib/foodDb";
import { resolveFood } from "@/components/VoiceFoodDialog";

/**
 * What the vision model is trusted with: which food, and how much of it. Its
 * macros are not asked for — the name is resolved like a spoken one, through
 * the catalog, the user's correction, the verified cache and only then a
 * text-model estimate, so a photo log both feeds the cache and benefits from
 * it.
 */
interface AIFoodResult {
  food_name: string;
  estimated_weight_g: number;
  confidence: "high" | "medium" | "low";
  notes: string;
}

/** A recognised photo: what the model saw, and the food that resolved to. */
type Recognised = AIFoodResult & { item: IFCTItem };

/** What the caller receives: a per-100 g food plus the weight on the plate. */
export interface PhotoFoodResult {
  item: IFCTItem;
  grams: number;
}

/**
 * Meal picker, when the calling screen has a meal concept. The meal builder
 * does not, so it omits this and no picker renders. All three fields travel
 * together because a value without its setter would render an inert selector.
 */
export interface MealPicker {
  value: string;
  options: string[];
  onChange: (v: string) => void;
}

/**
 * Which vision model reads the photo.
 *
 * Both are wired to the same prompt, the same parsing and the same result
 * shape, so the only variable between them is the model — that is what makes
 * the two buttons in the log-food screen an actual comparison rather than two
 * different features that happen to both use a camera.
 */
export type VisionProvider = "groq" | "gemini" | "gemini-lite";

const VISION_FN = {
  groq: serverGroqVision, // qwen/qwen3.8-27b
  gemini: serverGeminiVision, // gemini-3.6-flash
  "gemini-lite": serverGeminiLiteVision, // gemini-3.5-flash-lite
} as const;

/** Shown in the dialog title, so a three-way comparison is not guesswork. */
const PROVIDER_LABEL: Record<VisionProvider, string> = {
  groq: "Qwen",
  gemini: "Gemini",
  "gemini-lite": "Gemini Lite",
};

// ── AI image recognition ────────────────────────────────────────────────────
async function recognizeFoodFromImage(
  base64: string,
  mimeType: "image/jpeg" | "image/png" | "image/webp",
  provider: VisionProvider,
): Promise<AIFoodResult> {
  const prompt = `You are a nutrition expert. Analyze this food photo and return ONLY valid JSON, no markdown:
{
  "food_name": "specific food name",
  "estimated_weight_g": number,
  "confidence": "high" or "medium" or "low",
  "notes": "portion sizing assumptions"
}
Name the food and estimate its weight only. Do NOT return calories or any macro value: those are looked up separately, from a verified database wherever one exists.
A human palm is ~18cm — use it as a size reference if visible.`;

  const { result: raw } = await VISION_FN[provider]({
    data: { prompt, base64, mimeType },
  });
  // Safety: strip any <think> tags + markdown fences
  const clean = raw
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .replace(/```json|```/g, "")
    .trim();
  const jsonMatch = clean.match(/\{[\s\S]*\}/);
  if (!jsonMatch)
    throw new Error("AI did not return nutrition data. Please retry.");
  return JSON.parse(jsonMatch[0]) as AIFoodResult;
}

const MacroGrid = ({ items }: { items: { label: string; val: string }[] }) => (
  <div className="grid grid-cols-5 gap-2 text-center text-xs">
    {items.map((s) => (
      <div
        key={s.label}
        className="rounded-lg border border-border bg-muted/30 p-2"
      >
        <p className="text-muted-foreground">{s.label}</p>
        <p className="font-semibold">{s.val}</p>
      </div>
    ))}
  </div>
);

export function PhotoFoodDialog({
  open,
  onOpenChange,
  onConfirm,
  meal,
  confirmLabel = "Log this food",
  provider = "groq",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Throwing keeps the dialog open so the caller can toast and let them retry. */
  onConfirm: (result: PhotoFoodResult) => void | Promise<void>;
  meal?: MealPicker;
  confirmLabel?: string;
  provider?: VisionProvider;
}) {
  const webcamRef = useRef<Webcam>(null);
  const [aiResult, setAiResult] = useState<Recognised | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Keep weight as a string so the field can be fully cleared (number state
  // collapses "" → 0, which then renders as "0" and can't be removed).
  const [weightInput, setWeightInput] = useState("");

  const capture = async () => {
    const imageSrc = webcamRef.current?.getScreenshot();
    if (!imageSrc) return;

    setImagePreview(imageSrc);
    setAnalyzing(true);
    try {
      const base64 = imageSrc.split(",")[1];
      const result = await recognizeFoodFromImage(
        base64,
        "image/jpeg",
        provider,
      );
      // The resolver a spoken name goes through, so the item handed to
      // onConfirm is per 100 g with energy in kJ — exactly what a typed
      // search hands over. The text engine follows the vision provider, so
      // each photo button stays one model family end to end.
      const item = await resolveFood(
        result.food_name,
        provider === "groq" ? "groq" : "gemini",
      );
      if (!item)
        throw new Error(
          `no nutrition data for "${result.food_name}" — add it via search.`,
        );
      setAiResult({ ...result, item });
      setWeightInput(String(result.estimated_weight_g ?? ""));
    } catch (e) {
      toast.error(
        "Could not identify food: " + (e instanceof Error ? e.message : e),
      );
    } finally {
      setAnalyzing(false);
    }
  };

  const confirm = async () => {
    if (!aiResult) return;
    const grams = parseFloat(weightInput);
    if (!weightInput || isNaN(grams) || grams <= 0) {
      toast.error("Please enter a valid weight greater than 0 g.");
      return;
    }
    setBusy(true);
    try {
      await onConfirm({ item: aiResult.item, grams });
    } finally {
      setBusy(false);
    }
  };

  const retake = () => {
    setAiResult(null);
    setImagePreview(null);
    setWeightInput("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-4 w-4" /> AI Food Recognition
            <span className="text-xs font-normal text-muted-foreground">
              {PROVIDER_LABEL[provider]}
            </span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Place your hand next to the food for better portion accuracy, then
            snap a photo.
          </p>
          {!imagePreview && (
            <div className="relative overflow-hidden rounded-lg border-2 border-border bg-black min-h-[300px] flex items-center justify-center">
              <Webcam
                audio={false}
                ref={webcamRef}
                screenshotFormat="image/jpeg"
                videoConstraints={{ facingMode: "environment" }}
                className="w-full h-full object-cover"
              />
              <div className="absolute bottom-4 inset-x-0 flex justify-center">
                <button
                  onClick={capture}
                  aria-label="Take photo"
                  className="h-16 w-16 bg-white rounded-full border-4 border-accent flex items-center justify-center shadow-lg"
                />
              </div>
            </div>
          )}
          {imagePreview && (
            <div className="relative">
              <img
                src={imagePreview}
                alt="food"
                className="w-full max-h-48 rounded-lg object-cover"
              />
              {analyzing && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-lg bg-black/60">
                  <Loader2 className="h-8 w-8 animate-spin text-white" />
                  <p className="text-sm text-white">Analysing food…</p>
                </div>
              )}
            </div>
          )}
          {aiResult && !analyzing && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <h3 className="font-semibold">{aiResult.item.name}</h3>
                  {/* What the photo was read as, when the food it resolved
                      to is named differently — so a substitution shows. */}
                  {aiResult.item.name.toLowerCase() !==
                    aiResult.food_name.toLowerCase() && (
                    <p className="text-[10px] text-muted-foreground">
                      for "{aiResult.food_name}"
                    </p>
                  )}
                </div>
                <Badge
                  variant={
                    aiResult.confidence === "high" ? "default" : "outline"
                  }
                  className="text-xs capitalize"
                >
                  {aiResult.confidence} confidence
                </Badge>
              </div>
              <MacroGrid
                items={(() => {
                  const r = Math.max(0, parseFloat(weightInput) || 0) / 100;
                  const it = aiResult.item;
                  return [
                    {
                      label: "Calories",
                      val: `${Math.round(kcalOf(it) * r)} kcal`,
                    },
                    {
                      label: "Protein",
                      val: `${((it.protcnt ?? 0) * r).toFixed(1)}g`,
                    },
                    {
                      label: "Carbs",
                      val: `${((it.choavldf ?? 0) * r).toFixed(1)}g`,
                    },
                    {
                      label: "Fat",
                      val: `${((it.fatce ?? 0) * r).toFixed(1)}g`,
                    },
                    {
                      label: "Fiber",
                      val: `${((it.fibtg ?? 0) * r).toFixed(1)}g`,
                    },
                  ];
                })()}
              />
              <div className={meal ? "grid grid-cols-2 gap-3" : "space-y-1"}>
                <div className="space-y-1">
                  <Label>Weight (g)</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={1}
                    value={weightInput}
                    onChange={(e) => setWeightInput(e.target.value)}
                    placeholder="e.g. 150"
                  />
                </div>
                {meal && (
                  <div className="space-y-1">
                    <Label>Meal</Label>
                    <Select value={meal.value} onValueChange={meal.onChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {meal.options.map((m) => (
                          <SelectItem key={m} value={m}>
                            {m}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              {aiResult.notes && (
                <p className="text-xs text-muted-foreground italic">
                  {aiResult.notes}
                </p>
              )}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={retake}
                  className="gap-1"
                >
                  <X className="h-3 w-3" /> Retake
                </Button>
                <Button
                  onClick={confirm}
                  disabled={busy}
                  className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90 gap-2"
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}{" "}
                  {confirmLabel}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
