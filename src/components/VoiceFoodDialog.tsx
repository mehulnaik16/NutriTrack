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
import {
  Loader2,
  Mic,
  Pencil,
  Plus,
  Search,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
  serverVoiceParse,
  serverAiFoodSearchInline,
  serverVoiceGeminiParse,
} from "@/lib/ai";
import { isAiBusy, toastAiError } from "@/lib/aiErrors";
import { useWaitLabel } from "@/hooks/useWaitLabel";
import { kcalOf, type IFCTItem } from "@/lib/foodDb";
import { catalogFood } from "@/lib/foodFuzzy";
import { toGrams, pieceGrams, type UnitFood } from "@/lib/foodUnits";
import type { MealPicker } from "@/components/PhotoFoodDialog";
import { supabase } from "@/integrations/client";
import { toLocalISO } from "@/lib/dates";
import {
  POWER_LOG,
  POWER_LOG_LABEL,
  POWER_LOG_LIMIT_MESSAGE,
  readShortVoice,
} from "@/lib/voiceShort";

/** A recording's bytes as plain base64, for the transcribe request. */
const blobToBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

/** WebM/Opus where the browser can record it (Android, desktop), else MP4 (iPhone). */
const RECORDING_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];

/** Macros here are absolute for `quantity_g`, not per 100 g. */
export interface VoiceFoodItem {
  food_name: string;
  /**
   * The person's own words for this item ("jaggery" for "Jaggery, cane"),
   * so editing the row can change the same words in the sentence.
   */
  heard?: string;
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

/**
 * Longest anyone may speak in one go; recording stops and parses at this.
 * 30 s keeps a single meal's clip small; a whole-day Power Log gets 45 s.
 */
const MAX_SPEECH_MS = 30_000;
/** A whole-day Power Log may run longer: a measured full day took 44 s. */
const MAX_POWER_SPEECH_MS = 45_000;
/** A press shorter than this is a tap, not a hold. */
const HOLD_MS = 350;
/** A second tap within this of the first makes a double tap. */
const DOUBLE_TAP_MS = 350;
const MIC_HINT = "Hold to talk, or double-tap to talk longer";
/** Circumference of the 60-second ring (r = 44 in a 96 viewBox). */
const RING = 2 * Math.PI * 44;

/**
 * idle; hold (talking while pressed); pending (a quick tap, waiting to see
 * whether a second one makes it a double tap); locked (double-tapped: talking
 * hands-free until the next tap).
 */
type MicMode = "idle" | "hold" | "pending" | "locked";

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
 * An overloaded AI is not a miss: that error is rethrown so the caller shows
 * "AI is busy" instead of "no nutrition data".
 */
export async function resolveFood(name: string): Promise<IFCTItem | null> {
  const local = catalogFood(name);
  if (local) return local;
  try {
    // Inside a photo or voice log: after reading the photo (15 s) or the
    // sentence (7 s), this lookup gets 8 s (server/aiRoutes.ts).
    const { items: found } = await serverAiFoodSearchInline({
      data: { query: name, budgetMs: 8000 },
    });
    return found[0] ?? null;
  } catch (e) {
    if (isAiBusy(e)) throw e;
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
): Promise<VoiceFoodItem | null> {
  const food = await resolveFood(it.food_name);
  if (!food) return null;
  return { ...priceItem(it, food), heard: it.food_name };
}

/**
 * An item priced as `food`, keeping the amount the person gave: the same
 * count of pieces when both foods have a piece weight, otherwise the grams.
 */
function priceItem(it: ParsedVoiceItem, food: IFCTItem): VoiceFoodItem {
  const pieces =
    !!it.unit &&
    it.unit !== "g" &&
    !!it.unit_quantity &&
    pieceGrams(food) !== undefined;
  const grams = gramsFor(it, food);
  const ratio = grams / 100;
  return {
    ...it,
    ...(pieces ? {} : { unit: "g", unit_quantity: Math.round(grams) }),
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

/**
 * One food for an edited row: the bundled catalog on an exact name, else the
 * same Search AI a typed search runs, with the same rotating model order.
 */
async function searchOneFood(name: string): Promise<IFCTItem | null> {
  const local = catalogFood(name);
  if (local) return local;
  const { items } = await serverAiFoodSearchInline({ data: { query: name } });
  return (items[0] as IFCTItem | undefined) ?? null;
}

/**
 * `sentence` with the first `from` (any case) replaced by `to`; unchanged
 * when `from` is missing or is the whole sentence, since swapping every word
 * for one food's name would lose the rest of what was said.
 */
function replaceWords(sentence: string, from: string, to: string): string {
  const at = sentence.toLowerCase().indexOf(from.trim().toLowerCase());
  if (!from.trim() || at < 0 || from.trim().length >= sentence.trim().length)
    return sentence;
  return sentence.slice(0, at) + to + sentence.slice(at + from.trim().length);
}

// Exported so this can be driven headlessly against the real cache/model
// path in a live check.
export async function parseVoiceFoodLog(
  transcript: string,
  mealType: string,
): Promise<VoiceFoodItem[]> {
  const prompt = `You are a nutrition expert. The user said: "${transcript}"
Parse every food item mentioned and return ONLY a JSON array, no markdown:
[
  {
    "food_name": "string",
    "quantity_g": number,
    "unit": "string (e.g. 'pieces', 'bowls', 'g')",
    "unit_quantity": number
  }
]
Rules:
- Name the food only. Do NOT return calories or any macro value: those are
  looked up separately, from a verified database wherever one exists.
- Use common portion sizes if not specified (1 roti = 40g, 1 bowl dal = 150g, 1 banana = 120g, 1 egg = 50g)
- If user says "2 rotis", set unit="rotis", unit_quantity=2, quantity_g=80. If they just say grams, set unit="g", unit_quantity=100
- Each distinct food is a separate item in the array
- Return empty array [] if no food is mentioned`;

  const { result: raw } = await serverVoiceParse({ data: { prompt } });
  return resolveParsedVoice(raw, mealType);
}

/**
 * A parse model's JSON answer to priced foods. Shared by the two-step path
 * (words, then parseVoiceFoodLog) and the one-step Gemini-audio path.
 */
export async function resolveParsedVoice(
  raw: string,
  mealType: string,
): Promise<VoiceFoodItem[]> {
  const clean = raw.replace(/```json|```/g, "").trim();
  const parsed: unknown = JSON.parse(clean);
  // Both models are asked for a bare array and usually give one, but a
  // JSON-mode model is free to wrap it in an object — which used to reach the
  // review list as a non-array and throw on .map().
  const items: ParsedVoiceItem[] = (
    Array.isArray(parsed)
      ? (parsed as ParsedVoiceItem[])
      : ((Object.values(parsed ?? {}).find(Array.isArray) ??
          []) as ParsedVoiceItem[])
  ).map((it) => ({ ...it, meal_type: mealType }));
  // The meal is the user's pick, never the model's: asked for one, it filed
  // whey under an invented "Post-workout" no page section shows.
  return resolveVoiceItems(items);
}

/** Parsed foods to priced ones; the ones nothing resolves are named in a toast. */
export async function resolveVoiceItems(
  items: ParsedVoiceItem[],
): Promise<VoiceFoodItem[]> {
  // Each parsed name goes through the same path a typed search takes: the
  // bundled catalog, then the user's correction and the verified cache (both
  // inside serverAiFoodSearchInline), and only then a paid call. This is what
  // puts voice and photo logs on the cache instead of beside it.
  const busy: string[] = [];
  let busyError: unknown;
  const resolved = await Promise.all(
    items.map((it) =>
      resolveVoiceItem(it).catch((e) => {
        if (!isAiBusy(e)) throw e;
        busy.push(it.food_name);
        busyError = e;
        return null;
      }),
    ),
  );
  // Nothing priced at all: the caller's "AI is busy" toast says it best.
  if (busy.length && busy.length === items.length) throw busyError;
  if (busy.length)
    toast.warning(`Couldn't look up ${busy.join(", ")} right now`, {
      description: "Tap Re-parse in a moment, or add it by search.",
    });

  const unresolved = items
    .filter((it, i) => resolved[i] === null && !busy.includes(it.food_name))
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
  typedQuery,
  onResearch,
  onTypedQueryChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Throwing keeps the dialog open so the caller can toast and let them retry. */
  onConfirm: (items: VoiceFoodItem[]) => void | Promise<void>;
  meal?: MealPicker;
  confirmVerb?: string;
  /**
   * Foods already parsed elsewhere, to review instead of speaking.
   *
   * The food search uses this when a typed sentence turns out to name several
   * foods: the review list, its per-item quantity editing and its bulk log are
   * exactly what that needs, and none of it is specific to the microphone.
   */
  initialItems?: VoiceFoodItem[];
  /**
   * What the person typed, when the items came from the search box rather
   * than the microphone. The dialog then reads as a food search: the typed
   * words take the microphone's place, and a pencil makes them editable.
   */
  typedQuery?: string;
  /** Research: the same Search AI, on the edited words; false when it failed. */
  onResearch?: (text: string) => Promise<boolean>;
  /** The sentence after a row edit swapped the words for one food. */
  onTypedQueryChange?: (text: string) => void;
}) {
  /** The open microphone and what it has recorded so far. */
  const recRef = useRef<{
    rec: MediaRecorder;
    stream: MediaStream;
    chunks: Blob[];
  } | null>(null);
  /** Whole-day Power Log: foods sorted into meals by what was said. */
  const [power, setPower] = useState(false);
  const maxMs = power ? MAX_POWER_SPEECH_MS : MAX_SPEECH_MS;
  // Read by the recording timer, which must not restart if this changes.
  const maxMsRef = useRef(maxMs);
  maxMsRef.current = maxMs;
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  // What was heard, readable from timers and pointer handlers without
  // waiting for a render.
  const transcriptRef = useRef("");
  const [mode, setMode] = useState<MicMode>("idle");
  const modeRef = useRef<MicMode>("idle");
  const setMicMode = (m: MicMode) => {
    modeRef.current = m;
    setMode(m);
  };
  const pressStart = useRef(0);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /** The press that locked or stopped recording must not also count as a release. */
  const ignoreUp = useRef(false);
  const [hint, setHint] = useState(false);
  // The Food Search box: null while showing what was typed, the edited
  // words while the pencil has made it editable.
  const [draft, setDraft] = useState<string | null>(null);
  const [researching, setResearching] = useState(false);

  // One row at a time can be renamed and searched again. The row itself is
  // untouched until a search succeeds, so Cancel or a failure loses nothing.
  const [rowEdit, setRowEdit] = useState<{ i: number; text: string } | null>(
    null,
  );
  const [rowBusy, setRowBusy] = useState(false);
  /** The row whose bin was tapped, waiting for "Remove" to be confirmed. */
  const [confirmRemove, setConfirmRemove] = useState<number | null>(null);
  const researchRow = async () => {
    const text = rowEdit?.text.trim() ?? "";
    if (!rowEdit || text.length < 2) return;
    const old = items[rowEdit.i];
    setRowBusy(true);
    try {
      const food = await searchOneFood(text);
      if (!food) {
        toast.warning(`We couldn't find "${text}"`, {
          description: "Try another name for it.",
        });
        return;
      }
      setItems((prev) =>
        prev.map((it) =>
          it === old ? { ...priceItem(old, food), heard: text } : it,
        ),
      );
      // The same words change in what was said or typed.
      const from = old.heard ?? old.food_name;
      if (typedQuery) {
        const next = replaceWords(typedQuery, from, text);
        if (next !== typedQuery) onTypedQueryChange?.(next);
      } else if (transcript) {
        setTranscript(replaceWords(transcript, from, text));
      }
      setRowEdit(null);
    } catch (e) {
      toastAiError(e, "food row search");
    } finally {
      setRowBusy(false);
    }
  };
  const research = async () => {
    if (!draft || draft.trim().length < 2 || !onResearch) return;
    setResearching(true);
    try {
      // A failed Research keeps the edit open, so pressing it again retries
      // rather than retyping.
      if (await onResearch(draft)) setDraft(null);
    } finally {
      setResearching(false);
    }
  };
  const [elapsed, setElapsed] = useState(0);
  const [items, setItems] = useState<VoiceFoodItem[]>(initialItems ?? []);
  const [parsing, setParsing] = useState(false);
  const parseWait = useWaitLabel(parsing, "Parsing food items…", [
    "Understanding what you said…",
    "Looking up nutrition…",
    "Almost done…",
  ]);
  const [busy, setBusy] = useState(false);

  // Pre-parsed items arrive as a prop, and the dialog may already be mounted
  // when they change — a second sentence typed into the search box reuses the
  // same instance.
  useEffect(() => {
    if (initialItems) setItems(initialItems);
    // New rows: a row being edited no longer exists.
    setRowEdit(null);
    setConfirmRemove(null);
  }, [initialItems]);

  // Navigating away mid-recording must not leave the microphone live.
  useEffect(
    () => () => {
      const cur = recRef.current;
      recRef.current = null;
      if (cur && cur.rec.state !== "inactive") cur.rec.stop();
      cur?.stream.getTracks().forEach((t) => t.stop());
      clearTimeout(tapTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (!hint) return;
    const t = setTimeout(() => setHint(false), 3000);
    return () => clearTimeout(t);
  }, [hint]);

  /** Stop the microphone; resolves with what was recorded, null if nothing. */
  const stopRecorder = (): Promise<Blob | null> => {
    const cur = recRef.current;
    recRef.current = null;
    setRecording(false);
    if (!cur) return Promise.resolve(null);
    return new Promise((resolve) => {
      const done = () => {
        cur.stream.getTracks().forEach((t) => t.stop());
        resolve(
          cur.chunks.length
            ? new Blob(cur.chunks, { type: cur.rec.mimeType })
            : null,
        );
      };
      if (cur.rec.state === "inactive") return done();
      cur.rec.onstop = done;
      cur.rec.stop();
    });
  };

  /** Grouped by meal, in the user's meal order, for the review list. */
  const byMeal = (list: VoiceFoodItem[]) => {
    const order = meal?.options ?? [];
    return list.sort(
      (a, b) => order.indexOf(a.meal_type) - order.indexOf(b.meal_type),
    );
  };

  const parse = async (text: string) => {
    if (!text.trim()) return;
    setParsing(true);
    try {
      // A Power Log re-reads the words with its meal rules; the plain parse
      // would put every food in the picked meal.
      const parsed = power
        ? await (async () => {
            const meals = meal?.options ?? [];
            const { result: raw } = await serverVoiceGeminiParse({
              data: { text, meals, power, day: toLocalISO(new Date()) },
            });
            return byMeal(
              await resolveVoiceItems(
                readShortVoice(raw, {
                  meals,
                  picked: meal?.value ?? "Snack",
                  power,
                }).items,
              ),
            );
          })()
        : await parseVoiceFoodLog(text, meal?.value ?? "Snack");
      setItems(parsed);
      if (parsed.length === 0) toast.info("No food items detected. Try again.");
    } catch (e) {
      toastAiError(e, "voice parse");
    } finally {
      setParsing(false);
    }
  };

  /** Only the microphone button (or the 60 s limit) parses. Dismissing must not spend a request. */
  const finish = async () => {
    clearTimeout(tapTimer.current);
    setMicMode("idle");
    const clip = await stopRecorder();
    if (!clip) return;
    const audio = {
      base64: await blobToBase64(clip),
      mimeType: clip.type.split(";")[0] as "audio/webm",
    };
    setParsing(true);
    try {
      const meals = meal?.options ?? [];
      const { result: raw } = await serverVoiceGeminiParse({
        data: { ...audio, meals, power, day: toLocalISO(new Date()) },
      });
      const heard = readShortVoice(raw, {
        meals,
        picked: meal?.value ?? "Snack",
        power,
      });
      setTranscript(heard.transcript);
      transcriptRef.current = heard.transcript;
      const found = await resolveVoiceItems(heard.items);
      const parsed = power ? byMeal(found) : found;
      setItems(parsed);
      if (parsed.length === 0) toast.info("No food items detected. Try again.");
    } catch (e) {
      if ((e as Error)?.message?.includes(POWER_LOG_LIMIT_MESSAGE)) {
        toast(POWER_LOG_LIMIT_MESSAGE);
        setPower(false);
      } else toastAiError(e, "voice parse");
    } finally {
      setParsing(false);
    }
  };
  // The 60 s timer reads this, so it always calls the current render's finish.
  const finishRef = useRef(finish);
  finishRef.current = finish;

  /** A lone quick tap: nothing was meant to be said, so nothing is parsed. */
  const discard = () => {
    void stopRecorder();
    setMicMode("idle");
    setTranscript("");
    transcriptRef.current = "";
    setHint(true);
  };

  const active = mode !== "idle";
  useEffect(() => {
    if (!active) {
      setElapsed(0);
      return;
    }
    const started = Date.now();
    const iv = setInterval(() => {
      const ms = Date.now() - started;
      setElapsed(ms);
      if (ms >= maxMsRef.current) {
        clearInterval(iv);
        void finishRef.current();
      }
    }, 200);
    return () => clearInterval(iv);
  }, [active]);

  const onPressStart = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (parsing || e.button !== 0) return;
    // Keeps the release on this button even if a finger slides off it.
    e.currentTarget.setPointerCapture(e.pointerId);
    const m = modeRef.current;
    if (m === "locked") {
      ignoreUp.current = true;
      void finish();
      return;
    }
    if (m === "pending") {
      // Second tap: keep the recording the first tap started, hands-free.
      clearTimeout(tapTimer.current);
      ignoreUp.current = true;
      setMicMode("locked");
      return;
    }
    setHint(false);
    pressStart.current = Date.now();
    setMicMode("hold");
    if (!startRecording()) setMicMode("idle");
  };

  const onPressEnd = () => {
    if (ignoreUp.current) {
      ignoreUp.current = false;
      return;
    }
    if (modeRef.current !== "hold") return;
    if (Date.now() - pressStart.current >= HOLD_MS) {
      void finish();
      return;
    }
    setMicMode("pending");
    tapTimer.current = setTimeout(discard, DOUBLE_TAP_MS);
  };

  /** Keyboard has no hold: Enter or Space starts hands-free, again stops. */
  const onMicKey = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if ((e.key !== "Enter" && e.key !== " ") || e.repeat || parsing) return;
    e.preventDefault();
    if (modeRef.current === "idle") {
      setHint(false);
      setMicMode("locked");
      if (!startRecording()) setMicMode("idle");
    } else void finish();
  };

  /**
   * Opens the microphone and starts recording; false when this browser can't.
   * The clip is sent for transcription on release (see finish).
   */
  const startRecording = (): boolean => {
    if (
      typeof MediaRecorder === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      toast.error("Voice logging isn't available in this browser", {
        description: "Type what you ate in the search bar instead.",
      });
      return false;
    }
    setTranscript("");
    transcriptRef.current = "";
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        // Released before the microphone answered: a quick tap or a closed
        // dialog. Nothing to record.
        if (modeRef.current === "idle") {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const type = RECORDING_TYPES.find((t) =>
          MediaRecorder.isTypeSupported(t),
        );
        const rec = new MediaRecorder(
          stream,
          type ? { mimeType: type } : undefined,
        );
        const chunks: Blob[] = [];
        rec.ondataavailable = (e) => {
          if (e.data.size) chunks.push(e.data);
        };
        rec.start();
        recRef.current = { rec, stream, chunks };
        setRecording(true);
      })
      .catch((e) => {
        console.error("Microphone start failed", e);
        toast.error("Microphone access is off", {
          description: "Allow microphone access for this app, then try again.",
        });
        clearTimeout(tapTimer.current);
        setMicMode("idle");
      });
    return true;
  };

  // Every close clears the dialog: a dismissal, and the parent closing it
  // after Log, which never calls onOpenChange. A dismissed clip is never sent.
  useEffect(() => {
    if (open) return;
    void stopRecorder();
    clearTimeout(tapTimer.current);
    setMicMode("idle");
    setHint(false);
    setDraft(null);
    setRowEdit(null);
    setRecording(false);
    setTranscript("");
    transcriptRef.current = "";
    setItems([]);
  }, [open]);

  const confirm = async () => {
    setBusy(true);
    try {
      // Outside a Power Log every food goes to the meal shown now, even if the
      // picker changed after speaking.
      await onConfirm(
        power || !meal
          ? items
          : items.map((it) => ({ ...it, meal_type: meal.value })),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {typedQuery ? (
              <>
                <Search className="h-4 w-4" /> Food Search
              </>
            ) : (
              <>
                <Mic className="h-4 w-4" /> Voice Food Log
              </>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {meal && (
            <div className="space-y-1">
              <Label>Meal type</Label>
              <Select
                value={power ? POWER_LOG : meal.value}
                onValueChange={(v) => {
                  if (v !== POWER_LOG) {
                    setPower(false);
                    meal.onChange(v);
                    return;
                  }
                  // Say so before they speak for 45 s, not after.
                  void supabase
                    .rpc("power_logs_left", { p_day: toLocalISO(new Date()) })
                    .then(({ data }) => {
                      if (data === 0) toast(POWER_LOG_LIMIT_MESSAGE);
                      else setPower(true);
                    });
                }}
                disabled={active || parsing}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {meal.options.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                  <SelectItem value={POWER_LOG}>{POWER_LOG_LABEL}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          {typedQuery ? (
            draft === null ? (
              <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 py-2 pl-3 pr-1">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">You searched</p>
                  <p className="break-words text-sm font-medium">
                    {typedQuery}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setDraft(typedQuery)}
                  aria-label="Edit search"
                  title="Edit search"
                  className="shrink-0"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="rounded-lg border border-accent bg-muted/30 px-3 py-2">
                  <Label
                    htmlFor="food-search-edit"
                    className="text-xs font-normal text-muted-foreground"
                  >
                    Edit your search
                  </Label>
                  <Textarea
                    id="food-search-edit"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void research();
                      }
                      if (e.key === "Escape") {
                        e.stopPropagation();
                        setDraft(null);
                      }
                    }}
                    autoFocus
                    disabled={researching}
                    className="mt-1 min-h-[44px] resize-none border-none bg-transparent p-0 text-sm font-medium shadow-none focus-visible:ring-0"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDraft(null)}
                    disabled={researching}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => void research()}
                    disabled={researching || draft.trim().length < 2}
                    className="flex-1 gap-2 bg-accent text-accent-foreground hover:bg-accent/90"
                  >
                    {researching ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                    Research
                  </Button>
                </div>
              </div>
            )
          ) : (
            <>
              {power ? (
                // Only before anything is said; closing the dialog clears both.
                !transcript &&
                !parsing &&
                items.length === 0 && (
                  <div className="space-y-1.5 rounded-lg border border-border bg-muted/30 p-3 text-sm">
                    <p className="font-medium">
                      Name each meal, then what you ate in it.
                    </p>
                    <p className="italic text-muted-foreground">
                      "Breakfast, 2 idlis and filter coffee. Lunch, rice, sambar
                      and curd. Evening, 1 samosa and tea. Dinner, 3 chapatis
                      and paneer curry."
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Up to 45 seconds, in any language. Anything without a meal
                      goes to Snack. 2 whole-day logs a day.
                    </p>
                  </div>
                )
              ) : (
                <p className="text-sm text-muted-foreground">
                  Say what you ate naturally — e.g.{" "}
                  <em>"I had 2 rotis, a bowl of dal, and a banana"</em>
                </p>
              )}

              {/* Record button: hold to talk, or double-tap to talk hands-free.
              The ring fills over the 30 (Power Log: 45) seconds a recording may last. */}
              <div className="flex flex-col items-center gap-2">
                <div className="relative h-24 w-24">
                  <svg
                    className="absolute inset-0 -rotate-90"
                    viewBox="0 0 96 96"
                    aria-hidden="true"
                  >
                    <circle
                      cx="48"
                      cy="48"
                      r="44"
                      fill="none"
                      strokeWidth="4"
                      className="stroke-border"
                    />
                    <circle
                      cx="48"
                      cy="48"
                      r="44"
                      fill="none"
                      strokeWidth="4"
                      strokeLinecap="round"
                      strokeDasharray={RING}
                      strokeDashoffset={
                        RING * (1 - Math.min(1, elapsed / maxMs))
                      }
                      className={`transition-[stroke-dashoffset] duration-200 ease-linear motion-reduce:transition-none ${
                        elapsed > maxMs - 10_000
                          ? "stroke-destructive"
                          : "stroke-accent"
                      }`}
                    />
                  </svg>
                  <button
                    type="button"
                    onPointerDown={onPressStart}
                    onPointerUp={onPressEnd}
                    onPointerCancel={onPressEnd}
                    onKeyDown={onMicKey}
                    onContextMenu={(e) => e.preventDefault()}
                    disabled={parsing}
                    aria-label={
                      mode === "locked"
                        ? "Stop recording"
                        : "Hold to record, or double-tap to record hands-free"
                    }
                    aria-pressed={active}
                    style={{ touchAction: "none", WebkitTouchCallout: "none" }}
                    className={`absolute inset-2 flex select-none items-center justify-center rounded-full transition-[transform,background-color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50 motion-reduce:transition-none ${
                      mode === "hold"
                        ? "scale-95 bg-accent/25"
                        : active
                          ? "bg-accent/20"
                          : "bg-accent/10 hover:bg-accent/15"
                    }`}
                  >
                    {mode === "locked" ? (
                      <Square className="h-6 w-6 fill-accent text-accent" />
                    ) : (
                      <Mic className="h-8 w-8 text-accent" />
                    )}
                  </button>
                </div>
                <p
                  className="flex items-center gap-2 text-center text-xs text-muted-foreground"
                  aria-live="polite"
                >
                  <span className={hint ? "font-medium text-foreground" : ""}>
                    {mode === "hold"
                      ? "Release to finish"
                      : mode === "locked"
                        ? "Tap to stop"
                        : mode === "pending"
                          ? "Tap again to talk longer"
                          : MIC_HINT}
                  </span>
                  {active && (
                    <span
                      className={`tabular-nums ${
                        elapsed > maxMs - 10_000
                          ? "text-destructive"
                          : "text-foreground"
                      }`}
                    >
                      {`0:${String(Math.min(maxMs / 1000, Math.floor(elapsed / 1000))).padStart(2, "0")} / 0:${maxMs / 1000}`}
                    </span>
                  )}
                </p>
              </div>
            </>
          )}

          {parsing && (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> {parseWait.label}
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
                  <div key={i} className="space-y-1">
                    {power && item.meal_type !== items[i - 1]?.meal_type && (
                      <p className="pt-2 text-xs font-bold uppercase tracking-wider text-accent">
                        {item.meal_type}
                      </p>
                    )}
                    <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                      <div className="flex-1 mr-4 min-w-0">
                        {rowEdit?.i === i ? (
                          <div className="mb-1 flex items-center gap-1">
                            <Input
                              value={rowEdit.text}
                              onChange={(e) =>
                                setRowEdit({ i, text: e.target.value })
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  void researchRow();
                                }
                                if (e.key === "Escape") {
                                  e.stopPropagation();
                                  setRowEdit(null);
                                }
                              }}
                              autoFocus
                              disabled={rowBusy}
                              aria-label={`Food name for ${item.food_name}`}
                              className="h-8 min-w-0 flex-1 border-accent bg-background text-sm"
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Search this food again"
                              title="Research"
                              onClick={() => void researchRow()}
                              disabled={
                                rowBusy || rowEdit.text.trim().length < 2
                              }
                              className="h-8 w-8 shrink-0 text-accent hover:bg-accent/10"
                            >
                              {rowBusy ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Search className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Cancel editing"
                              title="Cancel"
                              onClick={() => setRowEdit(null)}
                              disabled={rowBusy}
                              className="h-8 w-8 shrink-0"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <span className="font-medium block text-base mb-1">
                            {item.food_name}
                          </span>
                        )}
                        {power && meal && (
                          <Select
                            value={item.meal_type}
                            onValueChange={(v) =>
                              setItems((prev) =>
                                prev.map((it, k) =>
                                  k === i ? { ...it, meal_type: v } : it,
                                ),
                              )
                            }
                          >
                            <SelectTrigger
                              aria-label={`Meal for ${item.food_name}`}
                              className="mb-1 h-7 w-auto gap-1 px-2 text-xs"
                            >
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
                        )}
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
                        <div className="flex items-center gap-3">
                          {rowEdit?.i !== i && (
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Edit ${item.food_name}`}
                              title="Edit"
                              className="h-6 w-6"
                              disabled={rowBusy}
                              onClick={() =>
                                setRowEdit({
                                  i,
                                  text: item.heard ?? item.food_name,
                                })
                              }
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {/* The bin sits beside the pencil, where a thumb can
                            land on the wrong one: removing asks first. */}
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Remove ${item.food_name}`}
                            className="h-6 w-6 text-destructive hover:bg-destructive/10"
                            disabled={rowBusy}
                            onClick={() => setConfirmRemove(i)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        <span className="text-xs text-muted-foreground whitespace-nowrap mt-1">
                          {Math.round(item.calories)} kcal · P
                          {item.protein_g.toFixed(0)} · F
                          {(item.fiber_g || 0).toFixed(0)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    // A typed search is redone by editing what was typed.
                    if (typedQuery) return setDraft(typedQuery);
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
                  {items.length === 1
                    ? `${confirmVerb} 1 item`
                    : `${confirmVerb} all ${items.length} items`}
                </Button>
              </div>
              <p className="text-center text-[11px] text-muted-foreground">
                AI can make mistakes. Check the food and weight before logging.
              </p>
            </div>
          )}
        </div>
        {/* Centred confirmation for the bin, above this dialog. */}
        <Dialog
          open={confirmRemove !== null && !!items[confirmRemove]}
          onOpenChange={(o) => !o && setConfirmRemove(null)}
        >
          <DialogContent className="max-w-xs gap-4 rounded-xl">
            <DialogHeader className="text-center sm:text-center">
              <DialogTitle>Remove this food?</DialogTitle>
              <DialogDescription>
                {confirmRemove !== null && items[confirmRemove]
                  ? `${items[confirmRemove].food_name} will be taken off this list.`
                  : ""}
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => setConfirmRemove(null)}>
                Keep
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  const n = confirmRemove;
                  setConfirmRemove(null);
                  setRowEdit(null);
                  setItems((prev) => prev.filter((_, k) => k !== n));
                }}
              >
                Remove
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
