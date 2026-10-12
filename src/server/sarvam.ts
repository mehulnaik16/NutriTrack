/**
 * Speech to text for voice food logging: Sarvam's Saaras model
 * (docs.sarvam.ai/api-reference/speech-to-text/transcribe). One recorded clip
 * in, its words out. Sarvam's REST endpoint takes up to 30 s per request, which
 * is why the voice dialog stops recording at 30 s.
 */
import { AI_BUSY } from "@/server/aiChain";

const SARVAM_STT_URL = "https://api.sarvam.ai/speech-to-text";
const SARVAM_STT_MODEL = "saaras:v4";

export async function sarvamTranscribe(
  audio: Blob,
  filename: string,
): Promise<string> {
  const key = (process.env.SARVAM_API_KEY ?? "").trim();
  if (!key) throw new Error("SARVAM_API_KEY is not configured.");

  const form = new FormData();
  form.append("file", audio, filename);
  form.append("model", SARVAM_STT_MODEL);
  // Indian-language words stay in their own script and English words stay
  // English ("दो roti और dal"), which the food parser reads as it is;
  // a translation would turn dish names into descriptions.
  form.append("mode", "codemix");
  // Any of the 22 Indian languages or English, detected per clip.
  form.append("language_code", "unknown");

  let res: Response;
  try {
    res = await fetch(SARVAM_STT_URL, {
      method: "POST",
      headers: { "api-subscription-key": key },
      body: form,
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    // Timed out or unreachable: the client shows its "try again" copy.
    throw new Error(`${AI_BUSY}: Sarvam unreachable (${(e as Error).name})`);
  }
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    if (res.status === 429 || res.status >= 500)
      throw new Error(`${AI_BUSY}: Sarvam ${res.status} ${detail}`);
    throw new Error(`Sarvam ${res.status}: ${detail}`);
  }
  const data = (await res.json()) as { transcript?: string };
  return (data.transcript ?? "").trim();
}
