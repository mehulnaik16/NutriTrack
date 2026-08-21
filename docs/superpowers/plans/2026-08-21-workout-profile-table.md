# Workout Profile Table Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the never-actually-live `user_profiles.workout_prefs` jsonb column with a real, dedicated `workout_profile` table, so the "Set up my training" questionnaire on `/workout-setup` is durably saved server-side instead of silently living only in the browser's `localStorage` — and surface + let users edit those answers from a new "Workout details" card on the Profile page, matching the existing "Profile details" card's look and edit flow.

**Architecture:** One new table, one row per user (`user_id` primary key, RLS-scoped), with a normalized column per question instead of a jsonb blob — matching the indexed-column approach already used for `workout_plans.custom_plan_day_idx`. `src/lib/workoutPrefs.ts` is the only application code that touches this table; its exported functions (`saveWorkoutPrefs`, `loadWorkoutPrefs`, `getCachedWorkoutPrefs`) keep their exact same signatures and the `WorkoutPrefs` TypeScript shape, so `workout-setup.tsx`, `workout.tsx`, and every other call site need zero changes. `src/routes/profile.tsx` gets a new menu card and sub-page built from the same `InfoRow`/`InfoCell`/`SubHeader`/`Select`-dropdown primitives its existing "Profile details" sub-page already uses, wired to those same `saveWorkoutPrefs`/`loadWorkoutPrefs` functions.

**Tech Stack:** Supabase Postgres (RLS), `@supabase/supabase-js` client-side calls (no server function — same pattern as every other table in this app), TypeScript/React (TanStack Start), Radix `Select` (`@/components/ui/select`) for dropdowns.

**Spec:** This document — requirements came directly from the user in conversation (create a dedicated `workout_profile` table for the questionnaire answers; explain current data flow; add a matching "Workout details" card + edit page on Profile, next to "Profile details").

## Global Constraints

- RLS must be enabled on the new table with `auth.uid() = user_id` policies (matches every existing table per `ARCHITECTURE.md` §6) — no table in this app skips RLS.
- No service-role client usage; all reads/writes go through the browser Supabase client with the anon key, exactly like `user_profiles` today.
- `WorkoutPrefs` (the exported TS interface in `src/lib/workoutPrefs.ts`) must not change shape — every consumer (`workout-setup.tsx`, `workout.tsx`) depends on it and must not need edits.
- One row per user (`user_id` is the primary key) — this mirrors `user_profiles`, not the multi-row `workout_plans` pattern.
- No automated test runner exists in this repo (`package.json` has no vitest/jest/playwright) — verification steps below are direct SQL checks (via the Supabase MCP tools) plus a manual UI walkthrough, not invented unit tests.
- Migration files must be named with the exact version Supabase assigns when applied via `mcp__Supabase__apply_migration` (confirmed via `mcp__Supabase__list_migrations`), so `supabase db push` never tries to re-apply them. This is the same procedure already used for `20260821085756_custom_plan_day_idx.sql`.
- The new Profile sub-page must reuse `profile.tsx`'s existing `SubHeader`, `InfoRow`, `InfoCell` components and its `isEditing`-toggle + `Select`-dropdown edit pattern verbatim — no new UI primitives, no new edit-mode convention.

---

## Task 1: Create the `workout_profile` table

**Files:**
- Create: `supabase/migrations/<assigned_version>_create_workout_profile.sql` (exact filename determined in Step 3)

**Interfaces:**
- Produces: table `public.workout_profile` with columns:
  - `user_id uuid primary key references auth.users(id) on delete cascade`
  - `fitness_level text not null check (fitness_level in ('beginner','intermediate','expert','pro'))`
  - `fitness_goal text not null check (fitness_goal in ('build_muscle','general_fitness','conditioning','strength'))`
  - `bench_weight_kg numeric`, `bench_reps smallint`
  - `squat_weight_kg numeric`, `squat_reps smallint`
  - `deadlift_weight_kg numeric`, `deadlift_reps smallint`
  - `training_days_per_week smallint not null check (training_days_per_week between 1 and 7)`
  - `cardio_activities text[] not null default '{}'`
  - `muscles_per_workout text not null default 'not_sure' check (muscles_per_workout in ('1','2','3','not_sure'))`
  - `preferred_workout_time_min smallint not null check (preferred_workout_time_min between 30 and 120)`
  - `preferred_training_plan text not null check (preferred_training_plan in ('ai_generated','library','custom'))`
  - `completed_at timestamptz not null default now()`
  - `updated_at timestamptz not null default now()`
  - RLS policy `"Users manage own workout profile"` for `ALL` operations, `using (auth.uid() = user_id) with check (auth.uid() = user_id)`

- [ ] **Step 1: Write the migration SQL**

```sql
-- One row per user, replacing the never-applied user_profiles.workout_prefs
-- jsonb column with real, queryable columns for the /workout-setup
-- questionnaire (fitness level, goal, strongest lifts, training days,
-- cardio preferences, muscles/session, session length, plan choice).
create table public.workout_profile (
  user_id uuid primary key references auth.users(id) on delete cascade,
  fitness_level text not null
    check (fitness_level in ('beginner','intermediate','expert','pro')),
  fitness_goal text not null
    check (fitness_goal in ('build_muscle','general_fitness','conditioning','strength')),
  bench_weight_kg numeric,
  bench_reps smallint,
  squat_weight_kg numeric,
  squat_reps smallint,
  deadlift_weight_kg numeric,
  deadlift_reps smallint,
  training_days_per_week smallint not null
    check (training_days_per_week between 1 and 7),
  cardio_activities text[] not null default '{}',
  muscles_per_workout text not null default 'not_sure'
    check (muscles_per_workout in ('1','2','3','not_sure')),
  preferred_workout_time_min smallint not null
    check (preferred_workout_time_min between 30 and 120),
  preferred_training_plan text not null
    check (preferred_training_plan in ('ai_generated','library','custom')),
  completed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.workout_profile enable row level security;

create policy "Users manage own workout profile"
  on public.workout_profile
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

- [ ] **Step 2: Apply it to the live database**

Call `mcp__Supabase__apply_migration` with `project_id` = the NutriTrack project id (confirm via `mcp__Supabase__list_projects` — it was `xadkrjfvsjdfhjcmxwbh` as of this plan), `name: "create_workout_profile"`, and the SQL from Step 1 as `query`.

- [ ] **Step 3: Confirm the assigned version and write the matching local file**

Call `mcp__Supabase__list_migrations` with the same `project_id`. Find the entry with `name: "create_workout_profile"` — its `version` (e.g. `20260821093015`) is the file prefix. Write the exact SQL from Step 1 to `supabase/migrations/<version>_create_workout_profile.sql`.

- [ ] **Step 4: Verify the table and RLS exist**

Call `mcp__Supabase__execute_sql` with:

```sql
select column_name, data_type, column_default, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'workout_profile'
order by ordinal_position;
```

Expected: 16 rows matching the columns in Step 1.

Then:

```sql
select polname, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'workout_profile';
```

Expected: one row, `polname = 'Users manage own workout profile'`, `cmd = 'ALL'`.

- [ ] **Step 5: Commit the migration file**

Deliver `supabase/migrations/<version>_create_workout_profile.sql` to the user's machine (`SendUserFile` + `device_commit_files` per this project's file-sharing flow) at `supabase/migrations/<version>_create_workout_profile.sql` under the connected `NutriTrack` folder.

---

## Task 2: Point `workoutPrefs.ts` at the new table

**Files:**
- Modify: `src/lib/workoutPrefs.ts` (whole file — `saveWorkoutPrefs`, `loadWorkoutPrefs`; `getCachedWorkoutPrefs`, `defaultLiftForExercise`, `isRecommendedCardio`, and every exported constant/type are untouched)

**Interfaces:**
- Consumes: table `public.workout_profile` from Task 1 (all 16 columns).
- Produces (unchanged from today — this is what keeps `workout-setup.tsx` and `workout.tsx` edit-free):
  - `saveWorkoutPrefs(userId: string, prefs: WorkoutPrefs): Promise<{ dbSaved: boolean }>`
  - `loadWorkoutPrefs(userId: string): Promise<WorkoutPrefs | null>`
  - `getCachedWorkoutPrefs(userId: string): WorkoutPrefs | null` (localStorage-only, no DB — untouched)

- [ ] **Step 1: Add row↔prefs mapping helpers**

Insert these two functions above `saveWorkoutPrefs` in `src/lib/workoutPrefs.ts` (after the `lsKey` helper):

```typescript
/** WorkoutPrefs (app shape) → workout_profile row (DB shape). */
function toRow(userId: string, prefs: WorkoutPrefs) {
  return {
    user_id: userId,
    fitness_level: prefs.fitnessLevel,
    fitness_goal: prefs.fitnessGoal,
    bench_weight_kg: prefs.strongestLifts.benchPress.weight,
    bench_reps: prefs.strongestLifts.benchPress.reps,
    squat_weight_kg: prefs.strongestLifts.squat.weight,
    squat_reps: prefs.strongestLifts.squat.reps,
    deadlift_weight_kg: prefs.strongestLifts.deadlift.weight,
    deadlift_reps: prefs.strongestLifts.deadlift.reps,
    training_days_per_week: prefs.trainingDaysPerWeek,
    cardio_activities: prefs.cardioActivities,
    muscles_per_workout: String(prefs.musclesPerWorkout),
    preferred_workout_time_min: prefs.preferredWorkoutTime,
    preferred_training_plan: prefs.preferredTrainingPlan,
    updated_at: new Date().toISOString(),
  };
}

/** workout_profile row (DB shape) → WorkoutPrefs (app shape). */
function fromRow(row: any): WorkoutPrefs {
  const lift = (w: number | null, r: number | null) => ({ weight: w, reps: r });
  const muscles = row.muscles_per_workout;
  return {
    fitnessLevel: row.fitness_level,
    fitnessGoal: row.fitness_goal,
    strongestLifts: {
      benchPress: lift(row.bench_weight_kg, row.bench_reps),
      squat: lift(row.squat_weight_kg, row.squat_reps),
      deadlift: lift(row.deadlift_weight_kg, row.deadlift_reps),
    },
    trainingDaysPerWeek: row.training_days_per_week,
    cardioActivities: row.cardio_activities ?? [],
    musclesPerWorkout: muscles === "not_sure" ? "not_sure" : (Number(muscles) as 1 | 2 | 3),
    preferredWorkoutTime: row.preferred_workout_time_min,
    preferredTrainingPlan: row.preferred_training_plan,
    completedAt: row.completed_at,
  };
}
```

- [ ] **Step 2: Rewrite `saveWorkoutPrefs` to upsert into `workout_profile`**

Replace the existing `saveWorkoutPrefs` function body:

```typescript
/** Save to DB (workout_profile row) and localStorage cache. Never throws. */
export async function saveWorkoutPrefs(
  userId: string,
  prefs: WorkoutPrefs,
): Promise<{ dbSaved: boolean }> {
  const payload = { ...prefs, completedAt: new Date().toISOString() };
  try {
    localStorage.setItem(lsKey(userId), JSON.stringify(payload));
  } catch {
    /* storage full/blocked — DB is still attempted */
  }
  const { error } = await supabase
    .from("workout_profile")
    .upsert(toRow(userId, prefs) as any, { onConflict: "user_id" });
  if (error) {
    console.warn("[workoutPrefs] DB save failed:", error.message);
    return { dbSaved: false };
  }
  return { dbSaved: true };
}
```

- [ ] **Step 3: Rewrite `loadWorkoutPrefs` to read from `workout_profile`**

Replace the existing `loadWorkoutPrefs` function body:

```typescript
/** Load prefs: localStorage first (fast), then DB (authoritative). */
export async function loadWorkoutPrefs(
  userId: string,
): Promise<WorkoutPrefs | null> {
  let cached: WorkoutPrefs | null = null;
  try {
    const raw = localStorage.getItem(lsKey(userId));
    if (raw) cached = JSON.parse(raw) as WorkoutPrefs;
  } catch {
    /* ignore */
  }

  const { data, error } = await supabase
    .from("workout_profile")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  const dbPrefs = !error && data ? fromRow(data) : null;

  if (dbPrefs) {
    try {
      localStorage.setItem(lsKey(userId), JSON.stringify(dbPrefs));
    } catch {
      /* ignore */
    }
    return dbPrefs;
  }
  return cached;
}
```

- [ ] **Step 4: Verify `getCachedWorkoutPrefs`, `defaultLiftForExercise`, `isRecommendedCardio` are unchanged**

Read `src/lib/workoutPrefs.ts` after editing and confirm these three functions (and every export from `FITNESS_LEVELS` through `SPLIT_GUIDE`) are byte-identical to before this task — they operate only on the `WorkoutPrefs` shape, never touch the DB, and must not be touched.

- [ ] **Step 5: Type-check the file**

Run: `cd <repo root> && npx tsc --noEmit --jsx react-jsx --esModuleInterop --skipLibCheck --target es2020 --moduleResolution bundler src/lib/workoutPrefs.ts 2>&1 | grep -E "error TS1[0-9]{3}"`
Expected: no output (no parse errors). Property-existence errors on `supabase.from("workout_profile")` are expected and fine until the generated Supabase types are refreshed (see Task 3) — only fail the step on a genuine syntax error (`TS1xxx`).

- [ ] **Step 6: Manual round-trip verification**

1. Open `/workout-setup` in the app, complete all 8 steps, hit Finish/Generate.
2. Run via `mcp__Supabase__execute_sql`: `select * from public.workout_profile where user_id = '<your auth user id>';` — confirm one row with the values you entered.
3. Reload the app in a different browser/incognito window (same account) and open `/workout-setup` again — confirm it pre-fills from the values just saved (proves the DB round-trip works, not just localStorage).

- [ ] **Step 7: Commit**

Deliver `src/lib/workoutPrefs.ts` to the user's machine via the established `SendUserFile` + `device_commit_files` flow (re-stage first per this project's convention — files here have drifted mid-session before; diff the freshly staged copy against the last-known-good version before re-editing if it has).

---

## Task 3: Add a "Workout details" card to the Profile page

**Files:**
- Modify: `src/routes/profile.tsx` (imports; `PAGE_VALUES` array `:90-93`; `type Page` union `:139-149`; `MENU_ITEMS` array `:156-166`; component state `:213-223`; the `user_profiles` load `useEffect` `:272-299`; `updateProfile` `:301-361`; insert a new page block between the end of the `"details"` block `:716-717` and the `/* ─── MENU PAGE ─── */` comment `:719`)

**Interfaces:**
- Consumes: `WorkoutPrefs`, `saveWorkoutPrefs`, `loadWorkoutPrefs`, `FITNESS_LEVELS`, `FITNESS_GOALS`, `CARDIO_OPTIONS` from `src/lib/workoutPrefs.ts` (Task 2 — must be done first).
- Produces: a `"workout-details"` `Page` value, reachable both from the Profile menu grid and from `navigate({ to: "/profile", search: { page: "workout-details" } })` elsewhere in the app if ever needed.

- [ ] **Step 1: Import the workout-prefs API**

Add this import to `src/routes/profile.tsx`, near the existing `@/lib/nutrition` import (after line 88):

```typescript
import {
  type WorkoutPrefs,
  FITNESS_LEVELS,
  FITNESS_GOALS,
  CARDIO_OPTIONS,
  saveWorkoutPrefs,
  loadWorkoutPrefs,
} from "@/lib/workoutPrefs";
```

`Dumbbell` (used for the menu-card icon and empty-state icon) is already imported from `lucide-react` at line 35 — no icon import needed.

- [ ] **Step 2: Register the new page in the search-param whitelist and the `Page` type**

`validateSearch` silently drops any `page` value not in `PAGE_VALUES` (`src/routes/profile.tsx:90-93`) — skipping this step means the card navigates nowhere. Change:

```typescript
const PAGE_VALUES: readonly Page[] = [
  "menu", "details", "theme", "transactions", "pricing",
  "settings", "help", "about", "refer", "achievements",
];
```

to:

```typescript
const PAGE_VALUES: readonly Page[] = [
  "menu", "details", "workout-details", "theme", "transactions", "pricing",
  "settings", "help", "about", "refer", "achievements",
];
```

And change the `Page` union (`:139-149`) from:

```typescript
type Page =
  | "menu"
  | "details"
  | "theme"
```

to:

```typescript
type Page =
  | "menu"
  | "details"
  | "workout-details"
  | "theme"
```

- [ ] **Step 3: Add the menu card next to "Profile details"**

In `MENU_ITEMS` (`:156-166`), insert a new entry directly after the `"details"` entry so it renders as the next card in the grid:

```typescript
const MENU_ITEMS: {
  id: Page;
  icon: React.ReactNode;
  label: string;
}[] = [
  { id: "details",         icon: <User className="h-7 w-7 md:h-[26px] md:w-[26px]" />,      label: "Profile details" },
  { id: "workout-details", icon: <Dumbbell className="h-7 w-7 md:h-[26px] md:w-[26px]" />,   label: "Workout details" },
  { id: "achievements", icon: <Award className="h-7 w-7 md:h-[26px] md:w-[26px]" />,         label: "Achievements" },
  { id: "transactions", icon: <ListOrdered className="h-7 w-7 md:h-[26px] md:w-[26px]" />,   label: "Plan & billing" },
  { id: "theme",        icon: <Palette className="h-7 w-7 md:h-[26px] md:w-[26px]" />,       label: "Theme" },
  { id: "pricing",      icon: <Tag className="h-7 w-7 md:h-[26px] md:w-[26px]" />,           label: "Pricing" },
  { id: "settings",     icon: <Settings className="h-7 w-7 md:h-[26px] md:w-[26px]" />,      label: "Settings" },
  { id: "help",         icon: <MessageCircle className="h-7 w-7 md:h-[26px] md:w-[26px]" />, label: "Help & support" },
  { id: "about",        icon: <Info className="h-7 w-7 md:h-[26px] md:w-[26px]" />,          label: "About us" },
  { id: "refer",        icon: <Gift className="h-7 w-7 md:h-[26px] md:w-[26px]" />,          label: "Invite friends" },
];
```

The existing `MENU_ITEMS.map(...)` render block (`:753-767`) needs no changes — it already renders whatever is in this array.

- [ ] **Step 4: Add edit-draft state for every question**

Add this block directly after the existing `const [theme, setTheme] = useState<string>("dark");` line (`:223`):

```typescript
  const [wp, setWp] = useState<WorkoutPrefs | null>(null);
  const [isEditingWp, setIsEditingWp] = useState(false);
  const [savingWp, setSavingWp] = useState(false);
  const [wpLevel, setWpLevel] = useState<WorkoutPrefs["fitnessLevel"]>("beginner");
  const [wpGoal, setWpGoal] = useState<WorkoutPrefs["fitnessGoal"]>("build_muscle");
  const [wpBenchW, setWpBenchW] = useState("");
  const [wpBenchR, setWpBenchR] = useState("");
  const [wpSquatW, setWpSquatW] = useState("");
  const [wpSquatR, setWpSquatR] = useState("");
  const [wpDeadliftW, setWpDeadliftW] = useState("");
  const [wpDeadliftR, setWpDeadliftR] = useState("");
  const [wpDays, setWpDays] = useState(3);
  const [wpCardio, setWpCardio] = useState("");
  const [wpMuscles, setWpMuscles] = useState<WorkoutPrefs["musclesPerWorkout"]>("not_sure");
  const [wpDuration, setWpDuration] = useState(60);
  const [wpPlanChoice, setWpPlanChoice] =
    useState<WorkoutPrefs["preferredTrainingPlan"]>("ai_generated");
```

- [ ] **Step 5: Load the workout profile alongside the profile**

Add a new `useEffect` directly after the existing `user_profiles` load effect closes (after `}, [user, navigate]);` at `:299`):

```typescript
  useEffect(() => {
    if (!user) return;
    loadWorkoutPrefs(user.id).then((p) => {
      if (!p) return;
      setWp(p);
      setWpLevel(p.fitnessLevel);
      setWpGoal(p.fitnessGoal);
      setWpBenchW(p.strongestLifts.benchPress.weight ? String(p.strongestLifts.benchPress.weight) : "");
      setWpBenchR(p.strongestLifts.benchPress.reps ? String(p.strongestLifts.benchPress.reps) : "");
      setWpSquatW(p.strongestLifts.squat.weight ? String(p.strongestLifts.squat.weight) : "");
      setWpSquatR(p.strongestLifts.squat.reps ? String(p.strongestLifts.squat.reps) : "");
      setWpDeadliftW(p.strongestLifts.deadlift.weight ? String(p.strongestLifts.deadlift.weight) : "");
      setWpDeadliftR(p.strongestLifts.deadlift.reps ? String(p.strongestLifts.deadlift.reps) : "");
      setWpDays(p.trainingDaysPerWeek);
      setWpCardio(p.cardioActivities.join(", "));
      setWpMuscles(p.musclesPerWorkout);
      setWpDuration(p.preferredWorkoutTime);
      setWpPlanChoice(p.preferredTrainingPlan);
    });
  }, [user]);
```

- [ ] **Step 6: Add the save handler**

Add this directly after `updateProfile` closes (after `};` at `:361`):

```typescript
  const updateWorkoutProfile = async () => {
    if (!user) return;
    setSavingWp(true);
    const lift = (w: string, r: string) => ({ weight: w ? +w : null, reps: r ? +r : null });
    const prefs: WorkoutPrefs = {
      fitnessLevel: wpLevel,
      fitnessGoal: wpGoal,
      strongestLifts: {
        benchPress: lift(wpBenchW, wpBenchR),
        squat: lift(wpSquatW, wpSquatR),
        deadlift: lift(wpDeadliftW, wpDeadliftR),
      },
      trainingDaysPerWeek: wpDays,
      cardioActivities: wpCardio.split(",").map((c) => c.trim()).filter(Boolean),
      musclesPerWorkout: wpMuscles,
      preferredWorkoutTime: wpDuration,
      preferredTrainingPlan: wpPlanChoice,
    };
    const { dbSaved } = await saveWorkoutPrefs(user.id, prefs);
    setSavingWp(false);
    if (!dbSaved) {
      toast.error("Could not save — check your connection");
      return;
    }
    toast.success("Workout details updated");
    setWp(prefs);
    setIsEditingWp(false);
  };
```

- [ ] **Step 7: Add the "Workout details" sub-page**

Insert this block between the end of the `"details"` page block (the `}` closing `if (page === "details") { ... }` at `:716-717`) and the `/* ─── MENU PAGE ─── */` comment (`:719`):

```typescript
  /* ─── WORKOUT DETAILS PAGE ─── */
  if (page === "workout-details") {
    return (
      <div className="min-h-screen bg-background pb-24">
        <SubHeader
          title="Workout details"
          onBack={() => { setIsEditingWp(false); goBack(); }}
          action={
            !wp ? null : !isEditingWp ? (
              <Button
                size="sm"
                onClick={() => setIsEditingWp(true)}
                className="h-8 rounded-xl bg-foreground text-background text-xs font-semibold px-4 hover:opacity-90"
              >
                Edit
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setIsEditingWp(false)}>
                  Cancel
                </Button>
                <Button size="sm" className="h-8 text-xs" onClick={updateWorkoutProfile} disabled={savingWp}>
                  {savingWp ? "Saving…" : "Save"}
                </Button>
              </div>
            )
          }
        />
        <main className="mx-auto max-w-lg px-4 py-6 space-y-6">
          {!wp ? (
            <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center">
              <Dumbbell className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
              <p className="mb-1 text-sm font-semibold">You haven't set up your training yet</p>
              <p className="mb-4 text-xs text-muted-foreground">
                Answer a few questions on the Workout page to get a personalized plan.
              </p>
              <Button size="sm" onClick={() => navigate({ to: "/workout-setup" })} className="rounded-xl">
                Set up my training
              </Button>
            </div>
          ) : (
            <>
              {/* Training profile */}
              <section>
                <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
                  Training profile
                </p>
                <div className="rounded-2xl border border-border bg-card overflow-hidden divide-y divide-border">
                  {isEditingWp ? (
                    <div className="p-4 grid grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1 col-span-2">
                        <Label className="text-xs text-muted-foreground">Fitness level</Label>
                        <Select value={wpLevel} onValueChange={(v) => setWpLevel(v as WorkoutPrefs["fitnessLevel"])}>
                          <SelectTrigger className="h-9"><SelectValue placeholder="Fitness level" /></SelectTrigger>
                          <SelectContent>
                            {FITNESS_LEVELS.map(({ value, label }) => (
                              <SelectItem key={value} value={value}>{label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex flex-col gap-1 col-span-2">
                        <Label className="text-xs text-muted-foreground">Goal</Label>
                        <Select value={wpGoal} onValueChange={(v) => setWpGoal(v as WorkoutPrefs["fitnessGoal"])}>
                          <SelectTrigger className="h-9"><SelectValue placeholder="Goal" /></SelectTrigger>
                          <SelectContent>
                            {FITNESS_GOALS.map(({ value, label, emoji }) => (
                              <SelectItem key={value} value={value}>{emoji} {label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label className="text-xs text-muted-foreground">Training days/week</Label>
                        <Select value={String(wpDays)} onValueChange={(v) => setWpDays(+v)}>
                          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                              <SelectItem key={n} value={String(n)}>{n} {n === 1 ? "day" : "days"}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label className="text-xs text-muted-foreground">Session length</Label>
                        <Select value={String(wpDuration)} onValueChange={(v) => setWpDuration(+v)}>
                          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {[30, 40, 50, 60, 70, 80, 90, 100, 110, 120].map((m) => (
                              <SelectItem key={m} value={String(m)}>{m} min</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex flex-col gap-1 col-span-2">
                        <Label className="text-xs text-muted-foreground">Muscles per session</Label>
                        <Select
                          value={String(wpMuscles)}
                          onValueChange={(v) =>
                            setWpMuscles((v === "not_sure" ? "not_sure" : +v) as WorkoutPrefs["musclesPerWorkout"])
                          }
                        >
                          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">One</SelectItem>
                            <SelectItem value="2">Two</SelectItem>
                            <SelectItem value="3">Three</SelectItem>
                            <SelectItem value="not_sure">Not sure</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex flex-col gap-1 col-span-2">
                        <Label className="text-xs text-muted-foreground">Preferred plan type</Label>
                        <Select value={wpPlanChoice} onValueChange={(v) => setWpPlanChoice(v as WorkoutPrefs["preferredTrainingPlan"])}>
                          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ai_generated">Let AI pick for me</SelectItem>
                            <SelectItem value="library">Workout library</SelectItem>
                            <SelectItem value="custom">Build my own</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex flex-col gap-1 col-span-2">
                        <Label className="text-xs text-muted-foreground">Cardio you enjoy (comma-separated)</Label>
                        <Input
                          value={wpCardio}
                          onChange={(e) => setWpCardio(e.target.value)}
                          placeholder={CARDIO_OPTIONS.slice(0, 3).join(", ")}
                          className="h-9"
                        />
                      </div>
                    </div>
                  ) : (
                    <>
                      <InfoRow
                        label="Fitness level"
                        value={FITNESS_LEVELS.find((l) => l.value === wp.fitnessLevel)?.label ?? wp.fitnessLevel}
                      />
                      <InfoRow
                        label="Goal"
                        value={FITNESS_GOALS.find((g) => g.value === wp.fitnessGoal)?.label ?? wp.fitnessGoal}
                      />
                      <div className="grid grid-cols-2 divide-x divide-border">
                        <InfoCell label="Training days" value={`${wp.trainingDaysPerWeek}/week`} />
                        <InfoCell label="Session length" value={`${wp.preferredWorkoutTime} min`} />
                      </div>
                      <InfoRow
                        label="Muscles/session"
                        value={wp.musclesPerWorkout === "not_sure" ? "Not sure" : String(wp.musclesPerWorkout)}
                      />
                      <InfoRow
                        label="Plan type"
                        value={
                          wp.preferredTrainingPlan === "ai_generated"
                            ? "Let AI pick for me"
                            : wp.preferredTrainingPlan === "library"
                              ? "Workout library"
                              : "Build my own"
                        }
                      />
                      <InfoRow label="Cardio" value={wp.cardioActivities.length ? wp.cardioActivities.join(", ") : "None set"} />
                    </>
                  )}
                </div>
              </section>

              {/* Strongest lifts */}
              <section>
                <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
                  Strongest lifts
                </p>
                <div className="rounded-2xl border border-border bg-card overflow-hidden divide-y divide-border">
                  {isEditingWp ? (
                    <div className="p-4 grid grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1">
                        <Label className="text-xs text-muted-foreground">Bench (kg)</Label>
                        <Input type="number" value={wpBenchW} onChange={(e) => setWpBenchW(e.target.value)} className="h-9" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label className="text-xs text-muted-foreground">Bench reps</Label>
                        <Input type="number" value={wpBenchR} onChange={(e) => setWpBenchR(e.target.value)} className="h-9" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label className="text-xs text-muted-foreground">Squat (kg)</Label>
                        <Input type="number" value={wpSquatW} onChange={(e) => setWpSquatW(e.target.value)} className="h-9" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label className="text-xs text-muted-foreground">Squat reps</Label>
                        <Input type="number" value={wpSquatR} onChange={(e) => setWpSquatR(e.target.value)} className="h-9" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label className="text-xs text-muted-foreground">Deadlift (kg)</Label>
                        <Input type="number" value={wpDeadliftW} onChange={(e) => setWpDeadliftW(e.target.value)} className="h-9" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label className="text-xs text-muted-foreground">Deadlift reps</Label>
                        <Input type="number" value={wpDeadliftR} onChange={(e) => setWpDeadliftR(e.target.value)} className="h-9" />
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 divide-x divide-border">
                        <InfoCell
                          label="Bench"
                          value={wp.strongestLifts.benchPress.weight ? `${wp.strongestLifts.benchPress.weight}kg × ${wp.strongestLifts.benchPress.reps ?? "?"}` : "Not set"}
                        />
                        <InfoCell
                          label="Squat"
                          value={wp.strongestLifts.squat.weight ? `${wp.strongestLifts.squat.weight}kg × ${wp.strongestLifts.squat.reps ?? "?"}` : "Not set"}
                        />
                      </div>
                      <InfoCell
                        label="Deadlift"
                        value={wp.strongestLifts.deadlift.weight ? `${wp.strongestLifts.deadlift.weight}kg × ${wp.strongestLifts.deadlift.reps ?? "?"}` : "Not set"}
                      />
                    </>
                  )}
                </div>
              </section>
            </>
          )}
        </main>
      </div>
    );
  }

```

Note the empty-state branch (`!wp`): a user who has a `workout_profile` row but hasn't run `/workout-setup` sees a CTA instead of a broken edit form for null lift values — this only happens for users created after Task 1/2 ship who haven't visited `/workout-setup` yet.

- [ ] **Step 8: Type-check**

Run: `cd <repo root> && npx tsc --noEmit --jsx react-jsx --esModuleInterop --skipLibCheck --target es2020 --moduleResolution bundler src/routes/profile.tsx 2>&1 | grep -E "error TS1[0-9]{3}"`
Expected: no output.

- [ ] **Step 9: Manual verification**

1. Complete `/workout-setup` for a test account (or reuse the account from Task 2 Step 6).
2. Go to `/profile` → confirm a "Workout details" card appears immediately to the right of "Profile details" in the menu grid.
3. Tap it → confirm it shows the answers just entered (fitness level, goal, lifts, days, cardio, muscles/session, duration, plan type) in view mode.
4. Tap Edit → change the fitness level dropdown and the training-days dropdown → Save → confirm the toast, that the view reflects the change, and that `select * from public.workout_profile where user_id = '<id>'` (via `mcp__Supabase__execute_sql`) shows the updated row.
5. For an account with no `workout_profile` row: confirm the empty state (CTA to `/workout-setup`) renders instead of a broken form.

- [ ] **Step 10: Commit**

Deliver the updated `src/routes/profile.tsx` via the established `SendUserFile` + `device_commit_files` flow (re-stage first to check for drift, per this project's convention).

---

## Task 4 (optional cleanup): Retire the dead `user_profiles.workout_prefs` migration

**Files:**
- Modify: `supabase/migrations/20260806_workout_prefs.sql`

**Interfaces:** None — this is a repo-hygiene task with no runtime effect (the column it adds was confirmed never applied to the live DB in Task 1's investigation, so there is nothing to drop in Postgres).

- [ ] **Step 1: Replace the file's content with a comment explaining the supersession**

```sql
-- SUPERSEDED: this column was never applied to production (confirmed via
-- information_schema.columns on 2026-08-21). The /workout-setup
-- questionnaire is now stored in the dedicated `workout_profile` table —
-- see 20260821..._create_workout_profile.sql. This file is kept only so
-- migration history stays linear; it intentionally does nothing.
select 1;
```

- [ ] **Step 2: Commit**

Deliver the updated file to the user's machine the same way as Task 1/2.

---

## Self-Review Notes

- **Spec coverage:** "dedicated `workout_profile` table" → Task 1. "stores that questions answers" → all 8 wizard questions mapped to columns in Task 1/Task 2 Step 1. "how data goes now / how retrieved" → answered directly in conversation before this plan, and Task 2 preserves that same save/load shape against the new table. "workout details card next to profile details card, same update/edit functionality with dropdowns" → Task 3: card placement (Step 3), dropdown-based edit UI reusing `Select`/`InfoRow`/`InfoCell`/`SubHeader` (Steps 4-7), same edit/cancel/save affordance as "Profile details" (Step 7).
- **Placeholder scan:** no TBD/"add error handling"/"similar to Task N" — every step has literal SQL or TypeScript.
- **Type consistency:** `WorkoutPrefs`, `toRow`, `fromRow` field names checked against the actual `src/lib/workoutPrefs.ts` interface (`fitnessLevel`, `strongestLifts.benchPress.{weight,reps}`, `musclesPerWorkout: 1|2|3|"not_sure"`, etc.) — matches Task 2 Step 1/2/3 exactly, and Task 3's `wp*` state/`updateWorkoutProfile` reuse the identical field names and the same `saveWorkoutPrefs`/`loadWorkoutPrefs` signatures Task 2 produces.
- **Dependency order confirmed:** Task 3 cannot start before Task 2 ships (it imports `saveWorkoutPrefs`/`loadWorkoutPrefs` from the rewritten `workoutPrefs.ts`) and Task 2 cannot start before Task 1 (the table must exist). Task 4 is independent and can run any time after Task 1.
- **Caught mid-research, before it became a bug:** `profile.tsx` gates its `page` search param through a `PAGE_VALUES` whitelist (`:90-93`) separate from the `Page` type union — missing this would have shipped a card that silently fails to navigate. Task 3 Step 2 updates both.
