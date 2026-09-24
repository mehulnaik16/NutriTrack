/**
 * Speak a meal, let the model split it into food items.
 *
 * Returns the parsed items rather than writing them anywhere: the food log
 * inserts `food_logs` rows, the meal builder appends ingredients. Lifted out of
 * FoodSearch so both screens can use it.
 *
 * No third-party dependency — the Web Speech API is native — so callers import
 * this directly rather than lazily.
 */

import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, MicOff, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
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
import { Textarea } from "@/components/ui/textarea";
import {
  serverGeminiChat,
  serverGroqChat,
  serverAiFoodSearchInline,
  type FoodSearchEngine,
} from "@/lib/ai";
import { kcalOf, type IFCTItem } from "@/lib/foodDb";
import { catalogFood } from "@/lib/foodFuzzy";
import { toGrams, pieceGrams, type UnitFood } from "@/lib/foodUnits";
import type { MealPicker } from "@/components/PhotoFoodDialog";

/**
 * The slice of the Web Speech API used here. TypeScript ships no lib types for
 * it, and it is still vendor-prefixed in most browsers.
 */
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: () => void;
  onresult: (e: {
    results: ArrayLike<ArrayLike<{ transcript: string }>>;
  }) => void;
  onerror: (e: { error: string }) => void;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Macros here are absolute for `quantity_g`, not per 100 g. */
export interface VoiceFoodItem {
  food_name: string;
  quantity_g: number;
  unit?: string;
  unit_quantity?: number;
  meal_type: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
}

// ── Voice food logging ──────────────────────────────────────────────────────

/** What the parse call returns now: names and quantities, no macros. */
export type ParsedVoiceItem = Pick<
  VoiceFoodItem,
  "food_name" | "quantity_g" | "unit" | "unit_quantity" | "meal_type"
>;

/**
 * Grams to price the food at.
 *
 * The parse model guesses a total weight from its own hardcoded portion sizes
 * (see the prompt below). But once the name resolves to a real food —
 * catalog, cache, or a fresh AI answer — that food may carry its own, more
 * authoritative piece weight (`piece_g`, set when `basis` is "piece"). When
 * the user counted rather than weighed ("2 idlis", unit not "g"), the
 * resolved food's own piece weight wins over the parse step's guess: a
 * bundled Idli row and the parse model's private idea of "1 idli" can
 * disagree, and only one of them is verified data. `toGrams`/`pieceGrams`
 * are the same converter the typed search path uses for this.
 */
export function gramsFor(it: ParsedVoiceItem, food: UnitFood): number {
  if (
    it.unit &&
    it.unit !== "g" &&
    it.unit_quantity &&
    pieceGrams(food) !== undefined
  ) {
    return toGrams(it.unit_quantity, "pcs", food);
  }
  return it.quantity_g || 100;
}

/**
 * Resolve a food name that no human will pick from a list — spoken, or read
 * off a photo — to one food, per 100 g with energy in kJ, exactly as a typed
 * search hands it over.
 *
 * The bundled catalog first, free and local, but only on an identity match
 * (catalogFood): a list for a person to choose from can afford a loose match,
 * an automatic pick cannot. Anything else goes to serverAiFoodSearchInline,
 * which checks the user's correction and the verified cache before ever
 * calling a model.
 *
 * Returns null when nothing resolves. A confident zero is worse than an
 * admitted gap — callers surface these rather than logging them silently.
 */
export async function resolveFood(
  name: string,
  engine: FoodSearchEngine,
): Promise<IFCTItem | null> {
  const local = catalogFood(name);
  if (local) return local;
  try {
    const { items: found } = await serverAiFoodSearchInline({
      data: { query: name, engine },
    });
    return found[0] ?? null;
  } catch (e) {
    console.error("Food resolution failed:", name, e);
    return null;
  }
}

/**
 * One parsed voice item, priced through resolveFood. The item is renamed to
 * the food it resolved to, so the review list shows what will actually be
 * logged — "Coffee biscuit" under a spoken "coffee" is then visible, not
 * silent.
 */
export async function resolveVoiceItem(
  it: ParsedVoiceItem,
  engine: FoodSearchEngine,
): Promise<VoiceFoodItem | null> {
  const food = await resolveFood(it.food_name, engine);
  if (!food) return null;

  const grams = gramsFor(it, food);
  const ratio = grams / 100;
  return {
    ...it,
    food_name: food.name,
    quantity_g: grams,
    // kcalOf() converts the catalog/cache's kJ `enerc` to kcal (÷ KJ_PER_KCAL)
    // internally — food_logs and VoiceFoodItem are both kcal.
    calories: +(kcalOf(food) * ratio).toFixed(1),
    protein_g: +((food.protcnt ?? 0) * ratio).toFixed(1),
    carbs_g: +((food.choavldf ?? 0) * ratio).toFixed(1),
    fat_g: +((food.fatce ?? 0) * ratio).toFixed(1),
    fiber_g: +((food.fibtg ?? 0) * ratio).toFixed(1),
  };
}

// Exported so this can be driven headlessly against the real cache/model
// path in a live check.
export async function parseVoiceFoodLog(
  transcript: string,
  mealType: string,
  engine: FoodSearchEngine = "groq",
): Promise<VoiceFoodItem[]> {
  const prompt = `You are a nutrition expert. The user said: "${transcript}"
Parse every food item mentioned and return ONLY a JSON array, no markdown:
[
  {
    "food_name": "string",
    "quantity_g": number,
    "unit": "string (e.g. 'pieces', 'bowls', 'g')",
    "unit_quantity": number,
    "meal_type": "${mealType}"
  }
]
Rules:
- Name the food only. Do NOT return calories or any macro value: those are
  looked up separately, from a verified database wherever one exists.
- Use common portion sizes if not specified (1 roti = 40g, 1 bowl dal = 150g, 1 banana = 120g, 1 egg = 50g)
- If user says "2 rotis", set unit="rotis", unit_quantity=2, quantity_g=80. If they just say grams, set unit="g", unit_quantity=100
- Each distinct food is a separate item in the array
- Return empty array [] if no food is mentioned`;

  const { result: raw } =
    engine === "gemini"
      ? await serverGeminiChat({
          data: { prompt, max_tokens: 400, temperature: 0.1 },
        })
      : await serverGroqChat({
          data: {
            prompt,
            model: "openai/gpt-oss-120b",
            max_tokens: 400,
            temperature: 0.1,
          },
        });
  const clean = raw.replace(/```json|```/g, "").trim();
  const parsed: unknown = JSON.parse(clean);
  // Both models are asked for a bare array and usually give one, but a
  // JSON-mode model is free to wrap it in an object — which used to reach the
  // review list as a non-array and throw on .map().
  const items: ParsedVoiceItem[] = Array.isArray(parsed)
    ? (parsed as ParsedVoiceItem[])
    : ((Object.values(parsed ?? {}).find(Array.isArray) ??
        []) as ParsedVoiceItem[]);

  // Each parsed name goes through the same path a typed search takes: the
  // bundled catalog, then the user's correction and the verified cache (both
  // inside serverAiFoodSearchInline), and only then a paid call. This is what
  // puts voice and photo logs on the cache instead of beside it.
  const resolved = await Promise.all(
    items.map((it) => resolveVoiceItem(it, engine)),
  );

  const unresolved = items
    .filter((_, i) => resolved[i] === null)
    .map((it) => it.food_name);
  if (unresolved.length) {
    toast.warning(
      `Couldn't find nutrition data for ${unresolved.join(", ")} — add ${
        unresolved.length > 1 ? "them" : "it"
      } manually via search.`,
    );
  }

  return resolved.filter((it): it is VoiceFoodItem => it !== null);
}

export function VoiceFoodDialog({
  open,
  onOpenChange,
  onConfirm,
  meal,
  confirmVerb = "Log",
  initialItems,
  engine = "groq",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Throwing keeps the dialog open so the caller can toast and let them retry. */
  onConfirm: (items: VoiceFoodItem[]) => void | Promise<void>;
  meal?: MealPicker;
  confirmVerb?: string;
  /** Which model parses the sentence. The food page runs Gemini; everywhere
      else stays on Groq. */
  engine?: FoodSearchEngine;
  /**
   * Foods already parsed elsewhere, to review instead of speaking.
   *
   * The food search uses this when a typed sentence turns out to name several
   * foods: the review list, its per-item quantity editing and its bulk log are
   * exactly what that needs, and none of it is specific to the microphone.
   */
  initialItems?: VoiceFoodItem[];
}) {
  const recogRef = useRef<SpeechRecognitionLike | null>(null);
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [items, setItems] = useState<VoiceFoodItem[]>(initialItems ?? []);
  const [parsing, setParsing] = useState(false);
  const [busy, setBusy] = useState(false);

  // Pre-parsed items arrive as a prop, and the dialog may already be mounted
  // when they change — a second sentence typed into the search box reuses the
  // same instance.
  useEffect(() => {
    if (initialItems) setItems(initialItems);
  }, [initialItems]);

  // Navigating away mid-recording used to leave the microphone live —
  // nothing stopped the recogniser except the button.
  useEffect(
    () => () => {
      recogRef.current?.abort?.();
      recogRef.current = null;
    },
    [],
  );

  /** Stop the recogniser and nothing else. */
  const stopRecogniser = () => {
    recogRef.current?.stop?.();
    recogRef.current = null;
    setRecording(false);
  };

  const parse = async (text: string) => {
    if (!text.trim()) return;
    setParsing(true);
    try {
      const parsed = await parseVoiceFoodLog(
        text,
        meal?.value ?? "Snack",
        engine,
      );
      setItems(parsed);
      if (parsed.length === 0) toast.info("No food items detected. Try again.");
    } catch (e) {
      toast.error("Parsing failed: " + message(e));
    } finally {
      setParsing(false);
    }
  };

  /** Only the microphone button parses. Dismissing must not spend a request. */
  const stopAndParse = async () => {
    stopRecogniser();
    await parse(transcript);
  };

  const startRecording = () => {
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const Recogniser = w.SpeechRecognition ?? w.webkitSpeechRecognition;

    if (!Recogniser) {
      toast.error("Live speech recognition is not supported in this browser.");
      return;
    }

    try {
      const recognition = new Recogniser();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      recognition.onstart = () => {
        setRecording(true);
        setTranscript("");
      };

      recognition.onresult = (event) => {
        let currentTranscript = "";
        for (let i = 0; i < event.results.length; ++i) {
          currentTranscript += event.results[i][0].transcript;
        }
        setTranscript(currentTranscript);
      };

      recognition.onerror = (event) => {
        console.error("Speech recognition error", event.error);
        if (event.error !== "no-speech") {
          toast.error("Speech recognition error: " + event.error);
          setRecording(false);
        }
      };

      // ponytail: no onend handler — Chrome auto-ends on silence and `recording`
      // goes stale, but the stop button still parses what was captured. Adding
      // onend without also decoupling onstart's setTranscript("") would wipe the
      // transcript the moment the user tapped again.
      recognition.start();
      recogRef.current = recognition;
    } catch (e) {
      toast.error("Microphone access denied or error: " + message(e));
    }
  };

  const confirm = async () => {
    setBusy(true);
    try {
      await onConfirm(items);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          // abort, not stop: dismissing discards, and stop() would fire one last
          // onresult into a torn-down dialog.
          recogRef.current?.abort?.();
          recogRef.current = null;
          setRecording(false);
          setTranscript("");
          setItems([]);
        }
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mic className="h-4 w-4" /> Voice Food Log
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {meal && (
            <div className="space-y-1">
              <Label>Meal type</Label>
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
          <p className="text-sm text-muted-foreground">
            Say what you ate naturally — e.g.{" "}
            <em>"I had 2 rotis, a bowl of dal, and a banana"</em>
          </p>

          {/* Record button */}
          <div className="flex justify-center">
            <button
              onClick={recording ? stopAndParse : startRecording}
              disabled={parsing}
              aria-label={recording ? "Stop recording" : "Start recording"}
              className={`flex h-20 w-20 items-center justify-center rounded-full border-4 transition-all ${
                recording
                  ? "animate-pulse border-destructive bg-destructive/10"
                  : "border-accent bg-accent/10 hover:bg-accent/20"
              }`}
            >
              {recording ? (
                <MicOff className="h-8 w-8 text-destructive" />
              ) : (
                <Mic className="h-8 w-8 text-accent" />
              )}
            </button>
          </div>
          <p className="text-center text-xs text-muted-foreground">
            {recording ? "Recording… tap to stop" : "Tap to start recording"}
          </p>

          {parsing && (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Parsing food items…
            </div>
          )}

          {/* Transcript live/edit view */}
          {transcript && (
            <div className="rounded-lg border border-border bg-muted/30 p-3 mt-4 space-y-2">
              <div className="flex justify-between items-center mb-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  You said (Tap to edit):
                </p>
                {!recording && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-xs px-2"
                    onClick={() => parse(transcript)}
                    disabled={parsing}
                  >
                    Re-parse
                  </Button>
                )}
              </div>
              <Textarea
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                className="text-sm italic min-h-[60px] bg-background border-border resize-none"
                disabled={recording}
              />
            </div>
          )}

          {/* Parsed items */}
          {items.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {items.length} item{items.length > 1 ? "s" : ""} detected
              </p>
              <div className="space-y-1">
                {items.map((item, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
                  >
                    <div className="flex-1 mr-4">
                      <span className="font-medium block text-base mb-1">
                        {item.food_name}
                      </span>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          value={item.unit_quantity ?? item.quantity_g}
                          onChange={(e) => {
                            const newQty = parseInt(e.target.value) || 0;
                            if (newQty < 0) return;
                            const oldQty =
                              (item.unit_quantity ?? item.quantity_g) || 1;
                            const ratio = newQty / oldQty;

                            const newItems = [...items];
                            newItems[i] = {
                              ...item,
                              ...(item.unit_quantity !== undefined
                                ? { unit_quantity: newQty }
                                : {}),
                              quantity_g: item.quantity_g * ratio,
                              calories: item.calories * ratio,
                              protein_g: item.protein_g * ratio,
                              fat_g: item.fat_g * ratio,
                              carbs_g: item.carbs_g * ratio,
                              fiber_g: item.fiber_g * ratio,
                            };
                            setItems(newItems);
                          }}
                          className="w-20 h-8 text-sm bg-background"
                        />
                        <span className="text-xs text-muted-foreground">
                          {item.unit && item.unit !== "g" ? item.unit : "g"}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${item.food_name}`}
                        className="h-6 w-6 text-destructive hover:bg-destructive/10"
                        onClick={() =>
                          setItems(items.filter((_, n) => n !== i))
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                      <span className="text-xs text-muted-foreground whitespace-nowrap mt-1">
                        {Math.round(item.calories)} kcal · P
                        {item.protein_g.toFixed(0)} · F
                        {(item.fiber_g || 0).toFixed(0)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setTranscript("");
                    setItems([]);
                  }}
                >
                  Redo
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
                  )}
                  {confirmVerb} all {items.length} items
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
