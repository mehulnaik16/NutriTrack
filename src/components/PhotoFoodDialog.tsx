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
import { Camera, Loader2, Plus, Upload, X } from "lucide-react";
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
import { serverFoodVision } from "@/lib/ai";
import { toastAiError } from "@/lib/aiErrors";
import { photoAttempt, recordPhotoOutcome } from "@/lib/searchAttempt";
import { useWaitLabel } from "@/hooks/useWaitLabel";
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

/** After 2 s a bare spinner reads as frozen; say what the AI is doing instead. */
// A photo may take up to ~23 s at peak, so the copy never promises it is
// nearly done: after the working stages it says plainly that it is busy.
const PHOTO_STAGES = [
  "Analyzing image details…",
  "Identifying ingredients…",
  "Calculating estimated nutrition…",
  "Taking a little longer than usual…",
  "Busy right now, still working on it…",
];

/**
 * A picked photo as a JPEG data URL no larger than 1280 px on its long side.
 * Phone photos are often 4000 px and several MB; the server caps the image at
 * ~8 MB and accepts only JPEG, PNG or WebP, so one re-encode covers both, and
 * a HEIC the browser can display comes out as a JPEG too.
 */
async function toJpegDataUrl(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(
      1,
      1280 / Math.max(img.naturalWidth, img.naturalHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ── AI image recognition ────────────────────────────────────────────────────
async function recognizeFoodFromImage(
  base64: string,
  mimeType: "image/jpeg" | "image/png" | "image/webp",
  attempt: 1 | 2,
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

  // Which model reads it, and what happens when one is busy, is decided on
  // the server (server/aiRoutes.ts visionChain).
  const { result: raw } = await serverFoodVision({
    data: { prompt, base64, mimeType, attempt },
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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Throwing keeps the dialog open so the caller can toast and let them retry. */
  onConfirm: (result: PhotoFoodResult) => void | Promise<void>;
  meal?: MealPicker;
  confirmLabel?: string;
}) {
  const webcamRef = useRef<Webcam>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  /** How the photo on screen was taken, so the way back matches it. */
  const [source, setSource] = useState<"camera" | "upload" | null>(null);
  const [cameraFailed, setCameraFailed] = useState(false);
  const [aiResult, setAiResult] = useState<Recognised | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Keep weight as a string so the field can be fully cleared (number state
  // collapses "" → 0, which then renders as "0" and can't be removed).
  const [weightInput, setWeightInput] = useState("");
  const wait = useWaitLabel(analyzing, "Analysing food…", PHOTO_STAGES);

  // Capturing or uploading only shows the photo; nothing is sent until the
  // person has looked at it and chosen Proceed.
  const capture = () => {
    const imageSrc = webcamRef.current?.getScreenshot();
    if (!imageSrc) return;
    setImagePreview(imageSrc);
    setSource("camera");
  };

  const onFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Cleared so picking the same file again still fires onChange.
    e.target.value = "";
    if (!file) return;
    try {
      setImagePreview(await toJpegDataUrl(file));
      setSource("upload");
      setAiResult(null);
    } catch (err) {
      console.error("Photo upload failed", err);
      toast.error("Couldn't open that photo", {
        description: "Try a JPG or PNG image.",
      });
    }
  };

  /**
   * Bumped by Cancel: an analysis that finishes after it was cancelled is
   * dropped. The server call itself cannot be recalled and simply completes.
   */
  const runId = useRef(0);

  const proceed = async () => {
    if (!imagePreview) return;
    const run = ++runId.current;
    setAnalyzing(true);
    try {
      const base64 = imagePreview.split(",")[1];
      // Each Proceed after a failure is the next attempt: the server rotates
      // the model order on it, and the lookup below follows the same attempt.
      const attempt = photoAttempt();
      const result = await recognizeFoodFromImage(
        base64,
        "image/jpeg",
        attempt,
      );
      if (run !== runId.current) return;
      // The resolver a spoken name goes through, so the item handed to
      // onConfirm is per 100 g with energy in kJ — exactly what a typed
      // search hands over.
      const item = await resolveFood(result.food_name, attempt);
      if (run !== runId.current) return;
      recordPhotoOutcome(true);
      if (!item) {
        // A real gap in the data, not a failure: say what was seen and where
        // to go, rather than an error.
        toast.warning(`We spotted "${result.food_name}"`, {
          description:
            "We couldn't find its nutrition yet — add it with the search bar.",
        });
        return;
      }
      setAiResult({ ...result, item });
      setWeightInput(String(result.estimated_weight_g ?? ""));
    } catch (e) {
      if (run === runId.current) {
        recordPhotoOutcome(false);
        toastAiError(e, "food photo");
      }
    } finally {
      if (run === runId.current) setAnalyzing(false);
    }
  };

  /** Back to the photo, with Retake and Proceed, as if Proceed was never tapped. */
  const cancelAnalysis = () => {
    runId.current++;
    setAnalyzing(false);
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

  /** Back to the camera, or straight to the file picker for an upload. */
  const retake = () => {
    setAiResult(null);
    setWeightInput("");
    if (source === "upload") {
      fileRef.current?.click();
      return;
    }
    setImagePreview(null);
    setSource(null);
  };
  const retakeLabel = source === "upload" ? "Re-upload" : "Retake";

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
            take or upload a photo.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onFilePicked}
          />
          {!imagePreview && (
            <div className="space-y-3">
              <div className="relative overflow-hidden rounded-lg border-2 border-border bg-black min-h-[300px] flex items-center justify-center">
                {cameraFailed ? (
                  <p className="px-8 text-center text-sm text-white/80">
                    The camera isn't available. Upload a photo of your food
                    instead.
                  </p>
                ) : (
                  <>
                    <Webcam
                      audio={false}
                      ref={webcamRef}
                      screenshotFormat="image/jpeg"
                      videoConstraints={{ facingMode: "environment" }}
                      onUserMediaError={() => setCameraFailed(true)}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute bottom-4 inset-x-0 flex justify-center">
                      <button
                        onClick={capture}
                        aria-label="Take photo"
                        className="h-16 w-16 bg-white rounded-full border-4 border-accent flex items-center justify-center shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                      />
                    </div>
                  </>
                )}
              </div>
              <Button
                variant="outline"
                onClick={() => fileRef.current?.click()}
                className="w-full gap-2"
              >
                <Upload className="h-4 w-4" /> Upload a photo
              </Button>
            </div>
          )}
          {imagePreview && (
            <div className="relative">
              <img
                src={imagePreview}
                alt="Your food photo"
                className={`w-full rounded-lg object-cover ${
                  aiResult ? "max-h-48" : "max-h-80"
                }`}
              />
              {analyzing && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-lg bg-black/60">
                  <Loader2 className="h-8 w-8 animate-spin text-white" />
                  <p className="text-sm text-white" aria-live="polite">
                    {wait.label}
                  </p>
                  {wait.long && (
                    <p className="px-6 text-center text-xs text-white/70">
                      Photos can take a few seconds — hang tight!
                    </p>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={cancelAnalysis}
                    className="mt-2 border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white"
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          )}
          {/* Look before sending: nothing is analysed until Proceed. */}
          {imagePreview && !aiResult && !analyzing && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={retake} className="gap-1">
                {source === "upload" ? (
                  <Upload className="h-4 w-4" />
                ) : (
                  <Camera className="h-4 w-4" />
                )}
                {retakeLabel}
              </Button>
              <Button
                onClick={proceed}
                className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90"
              >
                Proceed
              </Button>
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
                  <X className="h-3 w-3" /> {retakeLabel}
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
