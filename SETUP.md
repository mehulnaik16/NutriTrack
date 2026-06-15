# Setup Guide — FitTrack

## 1. Run the Supabase migration
Supabase dashboard → SQL Editor → paste and run:
`supabase/migrations/20260602_new_features.sql`

## 2. Create the Storage bucket (one time, manual)
Supabase dashboard → Storage → New bucket
- Name: `weight-photos`
- Public: ✅ Yes

## 3. Add environment variables
Copy `.env.example` → `.env` (or update your existing `env` file):

```
VITE_GROQ_KEY_1=gsk_...   ← your first key
VITE_GROQ_KEY_2=gsk_...   ← your second key
VITE_GROQ_KEY_3=gsk_...   ← your third key
```

To add more keys later: just add VITE_GROQ_KEY_4, VITE_GROQ_KEY_5, etc.
No code changes needed — the app picks them up automatically.

## 4. Drop files into your project
```
src/
  lib/
    groq.ts             ← new (key rotation client)
  routes/
    workout.tsx         ← new
    weight.tsx          ← new
    dashboard.tsx       ← updated
  components/
    Header.tsx          ← updated
    FoodSearch.tsx      ← updated (voice + camera + barcode)
    WaterStreak.tsx     ← new
    WeeklyReport.tsx    ← new
```

## 5. Start dev server
```bash
npm run dev
```

## Features & what powers them
| Feature | Model |
|---|---|
| Workout plan generation | Llama 3.3 70B |
| AI food photo recognition | Llama 4 Scout (vision) |
| Voice food logging | Whisper Large v3 Turbo → Llama 4 Scout |
| AI motivation (weight) | Llama 3.3 70B |
| Weekly AI report | Llama 3.3 70B |

## Key rotation behaviour
- Keys tried in order: KEY_1 → KEY_2 → KEY_3 → ...
- On 429 rate limit: marks that key as limited for `retry-after` seconds, tries next key
- On 5xx server error: short 10s backoff, tries next key
- All keys exhausted: throws error with clear message
