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
import { serverGroqVision } from "@/lib/ai";
import { type IFCTItem, KJ_PER_KCAL } from "@/lib/foodDb";

interface AIFoodResult {
  food_name: string;
  estimated_weight_g: number;
  calories_per_100g: number;
  protein_per_100g: number;
  carbs_per_100g: number;
  fat_per_100g: number;
  fiber_per_100g?: number;
  confidence: "high" | "medium" | "low";
  notes: string;
}

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

// ── AI image recognition via Groq qwen/qwen3.6-27b vision ───────────────────
async function recognizeFoodFromImage(
  base64: string,
  mimeType: "image/jpeg" | "image/png" | "image/webp",
): Promise<AIFoodResult> {
  const prompt = `You are a nutrition expert. Analyze this food photo and return ONLY valid JSON, no markdown:
{
  "food_name": "specific food name",
  "estimated_weight_g": number,
  "calories_per_100g": number,
  "protein_per_100g": number,
  "carbs_per_100g": number,
  "fat_per_100g": number,
  "fiber_per_100g": number,
  "confidence": "high" or "medium" or "low",
  "notes": "portion sizing assumptions"
}
A human palm is ~18cm — use it as a size reference if visible. Use accurate nutritional values for Indian foods.`;

  const { result: raw } = await serverGroqVision({
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

/** The model quotes per 100 g, which is the basis every food in the app uses. */
const toItem = (r: AIFoodResult): IFCTItem => ({
  code: "ai",
  name: r.food_name,
  scie: "",
  lang: "",
  grup: "AI",
  enerc: r.calories_per_100g * KJ_PER_KCAL,
  protcnt: r.protein_per_100g,
  fatce: r.fat_per_100g,
  choavldf: r.carbs_per_100g,
  fibtg: r.fiber_per_100g || 0,
});

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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Throwing keeps the dialog open so the caller can toast and let them retry. */
  onConfirm: (result: PhotoFoodResult) => void | Promise<void>;
  meal?: MealPicker;
  confirmLabel?: string;
}) {
  const webcamRef = useRef<Webcam>(null);
  const [aiResult, setAiResult] = useState<AIFoodResult | null>(null);
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
      const result = await recognizeFoodFromImage(base64, "image/jpeg");
      setAiResult(result);
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
      await onConfirm({
        item: toItem(aiResult),
        grams,
      });
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
                <h3 className="font-semibold">{aiResult.food_name}</h3>
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
                  const w = Math.max(0, parseFloat(weightInput) || 0);
                  return [
                    {
                      label: "Calories",
                      val: `${Math.round((aiResult.calories_per_100g * w) / 100)} kcal`,
                    },
                    {
                      label: "Protein",
                      val: `${((aiResult.protein_per_100g * w) / 100).toFixed(1)}g`,
                    },
                    {
                      label: "Carbs",
                      val: `${((aiResult.carbs_per_100g * w) / 100).toFixed(1)}g`,
                    },
                    {
                      label: "Fat",
                      val: `${((aiResult.fat_per_100g * w) / 100).toFixed(1)}g`,
                    },
                    {
                      label: "Fiber",
                      val: `${(((aiResult.fiber_per_100g || 0) * w) / 100).toFixed(1)}g`,
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
