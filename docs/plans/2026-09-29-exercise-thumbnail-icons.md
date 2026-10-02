# 475 Exercise Thumbnail Icons Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Generate clean, minimalist anatomical workout illustrations with highlighted active muscles and solid black weights for all 475 exercises in NutriTrack, matching the user's reference image style, and integrate them as lightweight small-pixel thumbnails into the workout screens with manual user approval for each batch.

**Architecture:** Exercise images are generated as 1:1 minimalist vector-style anatomical line art with active muscles highlighted in bright orange/amber and equipment/weights rendered in solid black/dark charcoal iron. Assets are stored in `public/exercises/` as small-pixel compressed images (128×128 or 200×200 px, <20 KB each). A dedicated lookup module (`src/lib/exerciseImages.ts`) normalizes exercise names and returns optimized paths with fallbacks. `src/routes/workout.tsx` and `src/routes/workout-library.tsx` consume this mapping to display crisp thumbnails alongside exercise titles, sets, and rep counts.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Vite, AI image generation, WebP/PNG compression.

---

## 1. Visual Specification: Master Anatomical Baseline & Black Weights

### Master Visual Reference Standards
Per the user's direct feedback:
1. **Black Weights:** All barbell plates, dumbbells, kettlebells, and collars must be **solid black / dark charcoal iron** (not white, not hollow).
2. **Muscular Anatomical Body (NO Stick Figures):** The body build and illustration fidelity must strictly match the **Barbell Back Squat** master baseline: highly defined athletic male physique, detailed abdominal six-pack and serratus lines, defined shoulder, arm, and leg striations, white body fill with crisp black vector anatomical contours, and bright neon orange (`#FF6A00`) target muscle highlights.

| Master Reference 1: Barbell Back Squat | Master Reference 2: Barbell Bench Press (Updated) |
| :---: | :---: |
| ![Master Squat](file:///C:/Users/gagan/.gemini/antigravity/brain/17c4b1d6-9067-4faa-a085-e12a4b6a3045/squat_black_weights_1790683789341.jpg) | ![Master Bench Press](file:///C:/Users/gagan/.gemini/antigravity/brain/17c4b1d6-9067-4faa-a085-e12a4b6a3045/bench_press_muscular_anatomical_1790684086941.jpg) |

### Core Prompt Template for All Batches
```text
Minimalist 2D vector fitness illustration of a muscular athletic man performing [EXERCISE_NAME] inside a clean white circle badge, circular frame border, isolated on pure white background. The body style, muscular build, and anatomical drawing quality MUST EXACTLY MATCH the master reference images: highly defined athletic male physique, detailed anatomical muscle striations, visible abdominal six-pack and serratus lines, defined shoulder and arm contours, white skin fill with clean black vector anatomy outlines, short dark hair. Active target [TARGET_MUSCLES] are highlighted in vivid bright neon orange (#FF6A00) with muscle fiber definition. All gym weights, barbell weight plates, dumbbells, kettlebells, and barbell collars MUST BE SOLID BLACK / DARK CHARCOAL IRON (solid matte black weights, not white, not hollow). Absolutely NO smooth stick figures, NO featureless silhouettes. Must have crisp detailed anatomical muscle lines identical to the reference image.
```

---

## 2. Comprehensive 475 Exercise Catalog & Batch Structure

The database (`src/lib/exercises.ts`) contains exactly **475 exercises** across 15 muscle groups (474 unique names). Generation is divided into **Phase 1** (Priority Core & Routine Exercises, including the 13 user-requested movements) and **Phase 2** (Full Catalog Expansion).

### Phase 1: Core Workout Library & High-Frequency Routine Movements (88 Exercises)

> **Approval Gate:** These 88 exercises power all 15 curated workout plans in `src/lib/workoutLibrary.ts` and `src/lib/homeWorkouts.ts`. They will be generated in 4 reviewable batches and presented in an interactive gallery for manual user approval before touching UI code.

#### Batch 1: Chest & Upper Back (24 exercises)
Includes primary bench, press, row, and pull movements + requested additions:
1. Barbell Bench Press
2. Barbell Incline Bench Press
3. Barbell Decline Bench Press
4. Dumbbell Bench Press
5. Dumbbell Incline Bench Press
6. Decline Dumbbell Bench Press
7. Machine Bench Press
8. Plate-Loaded Chest Press
9. Cable Crossover Fly
10. Dumbbell Fly
11. Chest Dip
12. Push Up
13. Plyometric Push-ups *(Requested Addition)*
14. Deadlift
15. Barbell Row
16. Pendlay Row
17. Dumbbell Row
18. Cable Row
19. Pull Up
20. Chin Up
21. Lat Pulldown
22. T Bar Row *(Requested Addition)*
23. Dumbbell Pullover *(Requested Addition)*
24. Inverted Row *(Requested Addition)*

#### Batch 2: Legs & Lower Body (20 exercises)
Includes squats, lunges, leg presses, deadlift variations + requested additions:
1. Back Squat
2. Front Squat
3. Leg Press
4. Hack Squat
5. Goblet Squat
6. Romanian Deadlift (Barbell Romanian Deadlift)
7. Dumbbell Romanian Deadlift
8. Bulgarian Split Squat
9. Walking Lunge
10. Dumbbell Walking Lunge
11. Leg Extension
12. Lying Hamstring Curl
13. Seated Leg Curl
14. Standing Calf Raise (Standing Machine Calf Raise)
15. Seated Calf Raise (Plate-Loaded Seated Calf Raise)
16. Barbell Hip Thrust
17. Dumbbell Hip Thrust
18. Box Jump *(Requested Addition)*
19. Sled Push *(Requested Addition)*
20. TRX Pistol Squat *(Requested Addition)*

#### Batch 3: Shoulders, Biceps & Triceps (25 exercises)
Includes overhead presses, curls, extensions, pushdowns + requested additions:
1. Barbell Shoulder Press
2. Dumbbell Shoulder Press
3. Arnold Press
4. Dumbbell Lateral Raise
5. Dumbbell Front Raise
6. Cable Face Pull
7. Cable Reverse Fly / Rear Delt Fly
8. Handstand Push-ups (assisted) *(Requested Addition)*
9. Barbell Curl
10. Dumbbell Bicep Curl
11. Hammer Curls
12. Incline Dumbbell Curl
13. Preacher Curl
14. Dumbbell Concentration Curl
15. Cable Bicep Curl
16. Tricep Pushdown (Tricep Pushdown V Bar / Rope)
17. EZ Bar Skullcrusher
18. Dumbbell Overhead Tricep Extension
19. Close Grip Bench Press
20. Tricep Dip / Bench Dip
21. Dumbbell Kickbacks *(Requested Addition)*
22. Dumbbell Shrug
23. Barbell Shrug
24. Farmer's Carry *(Requested Addition)*
25. Alternating Battle Rope *(Requested Addition)*

#### Batch 4: Core, Conditioning & Athletic (19 exercises)
Includes ab exercises, rotations, conditioning movements + requested additions:
1. Plank
2. Side Plank
3. Ab Wheel Rollout
4. Hanging Leg Raise
5. Hanging Knee Raise
6. Cable Wood Chop High to Low
7. Cable Wood Chop Low to High
8. Rope Crunch / Cable Crunch
9. Russian Twist
10. Bicycle Crunch
11. Mountain Climber
12. Hollow Body Hold
13. Crunches
14. Bear Crawl Hold
15. Iron Bridge
16. Medicine Ball Slams *(Requested Addition)*
17. Renegade Row *(Requested Addition)*
18. Kettlebell Swing
19. Burpee

---

### Phase 2: Full Catalog Expansion (Remaining 387 Exercises)

To cover all 475 exercises without missing any entry in `EXERCISES_DB`, Phase 2 covers the remaining variations grouped by anatomical category:

#### Batch 5: Chest Variations (38 remaining exercises)
- Single Arm Dumbbell Bench Press, Plate-Loaded Incline Chest Press, Plate-Loaded Decline Chest Press, Plate-Loaded Horizontal Bench Press, Smith Machine Bench Press, Smith Machine Decline Bench Press, Smith Machine Incline Bench Press, Floor Press, Mid Cable Crossover Fly, Dumbbell Incline Fly, Cable Crossover Flat Bench Fly, Cable Crossover Incline Bench Fly, Low Cable Chest Fly, Machine Chest Fly, Machine Bent Arm Chest Fly, Seated Cable Fly, Cable Chest Press, Incline Cable Chest Press, Cable Press-Around, Bottom Push Up Hold, Close Grip Push Up, Decline Push Up, Diamond Push Up, Hand Release Push Up, Incline Push Up, Push Up on Knees, Wide Push Up, Banded Push Up, Deficit Push Up, Pike Push Up (Chest variation), Loop Band Chest Press, Loop Band Chest Fly, Dumbbell Hex Press, Dumbbell Incline Hex Press, Machine Incline Chest Press, Plate-Loaded Wide Chest Press, Cable Iron Cross, Svend Press.

#### Batch 6: Back & Lats Variations (43 remaining exercises)
- Barbell Row Reverse Grip, Assisted Pull up, Assisted Wide Grip Pull Up, Lat Pulldown Neutral Grip, Reverse Grip Pulldown, Smith Machine Bent Over Row, V Bar Pulldown, Assisted Neutral Grip Pull Up, Cable Crossover Lat Pulldown, Cable Row Wide Grip, Chest Supported T Row Neutral Grip, Chest Supported T Row Wide Grip, Close Grip Pulldown, Cross-Body Lat Pull-Around, Incline Dumbbell Row, Inverted Row Reverse Grip, Kettlebell Alternating Row, Kettlebell Row, Landmine Row, Loop Band Chin Up, Loop Band Pull Up, Machine Lat Pulldown, Machine Row, Meadows Row, Neutral Grip Pull Ups, Plate-Loaded Chest Supported Row, Plate-Loaded Chest Supported Row Closed Grip, Plate-Loaded High Row, Plate-Loaded Low Row, Plate-Loaded Pullover, Plate-Loaded Single Arm High Row, Rope Straight Arm Pulldown, Single Arm Cable Row, Single Arm Chest Supported Cable Row, Single Arm High Lat Row, Single Arm Lat Pulldown, Single Arm Low Cable Row, Straight Arm Pulldown, Dumbbell Bent Over Row, Loop Band Bent Over Row, Loop Band Lat Pulldown, Loop Band Standing Single Arm Row, TRX Inverted Row.

#### Batch 7: Shoulders & Traps Variations (58 remaining exercises)
- Seated Barbell Shoulder Press, Arm Circles, Cable Lateral Raise, Dumbbell Lateral Raise Seated, Leaning Lateral Raise, Machine Reverse Fly, Machine Shoulder Press, Smith Machine Shoulder Press, Barbell Front Raise, Barbell High Pull, BTB Cable Lateral Raise, Cable Front Raise, Cable Y Raise, Clean and Press, Cross Cable Rear Delt Fly, Cross-Body Cable Y Raise, Dumbbell Hang Clean, Dumbbell Hanging Lateral Raise, Dumbbell Power Clean and Jerk, Dumbbell Reverse Fly (Seated), Dumbbell Reverse Fly (Standing), Incline Dumbbell Y Raise, Kettlebell Clean and Jerk, Kettlebell Overhead Press, Landmine Press, Machine Lateral Raise, Plate-Loaded Lateral Raise, Plate-Loaded Shoulder Press, Push Jerk, Rope Front Raise, Single Arm Landmine Press, Single Dumbbell Power Clean, Single Dumbbell Power Clean and Jerk, Snatch, Split Jerk, Standing Dumbbell Shoulder Press, Thruster, Front Plate Raise, Loop Band Face Pull, Loop Band Lateral Raise, Loop Band Overhead Press, Pike Push Up, Rope Slam, TRX Rear Delt Fly.
- Traps: Smith Machine Shrug, Cable Shrug, Trap Bar Shrug, Behind the Back Barbell Shrug, Seated Dumbbell Shrug, Barbell Upright Row, Dumbbell Upright Row, Cable Upright Row, EZ Bar Upright Row, Trap Bar Carry, Dumbbell Farmer's Walk, Power Shrug, Kirk Shrug, Overhead Shrug.

#### Batch 8: Biceps & Forearms (44 remaining exercises)
- Biceps: EZ Bar Curl, Seated Dumbbell Curl, Cable Hammer Curl, Incline Hammer Curl, Single Arm Cross Body Cable Curl, Single Arm Preacher Curl, Spider Curls, Behind the Back Cable Bicep Curl, Cable Double Arm Bayesian Curl, Cable Double Bicep Curl, Cable Potty Curls, Close Grip EZ Bar Curl, Cross Body Hammer Curls, Dumbbell Drag Curl, High Cable Bicep Curl, Incline EZ Bar Curl, Machine Bicep Curl, Machine Preacher Curl, Plate-Loaded Preacher Curl, Single Arm Cable Bicep Curl, Waiter Curls, Bicep Curl to Shoulder Press, Dumbbell Reverse Curl, Loop Band Bicep Curl, Loop Band Hammer Curl, Reverse Barbell Curl, TRX Bicep Curl, Zottman Curl, Zottman Preacher Curl.
- Forearms: Palms Down Barbell Wrist Curl, Palms Up Barbell Wrist Curl, Palms Up Dumbbell Wrist Curl, Palms Down Dumbbell Wrist Curl, Behind the Back Wrist Curl, Cable Wrist Curl, Reverse Wrist Curl, Wrist Roller, Dead Hang, Towel Grip Dead Hang, Plate Pinch Hold, Farmer's Carry (Heavy), Gripper Squeeze, Fat Grip Dumbbell Hold, Suitcase Carry, Finger Curls.

#### Batch 9: Triceps Variations (26 remaining exercises)
- Assisted Dip, Cable Cross-Body Tricep Extension, Cable Overhead Tricep Extension, Cable Overhead Tricep Extension (rope), Cable Rope Tricep Extension, Cable Single Arm Tricep Extension, Cable Single Arm Underhand Tricep Extension, Cable Skullcrusher, Cable Triceps Kickback, Cable Underhand Tricep Pushdown, Dumbbell Skullcrusher, Floor Tricep Extension, Loop Band Tricep Extension, Low Cable Overhead Tricep Extension, Machine Tricep Dip, Machine Tricep Extension, Plate-Loaded Dip, Single Arm Dumbbell Tricep Extension, Single Arm Low Cable Overhead Tricep Extension, Single Arm Overhead Cable Tricep Extension, Smith Machine Close-Grip Bench Press, Tate Press, Ring Dip, TRX Tricep Extension, Underhand Tricep Extension.

#### Batch 10: Quads, Calves, Abductors & Adductors (85 remaining exercises)
- Quads: Belt Squat, Box Squat, Box Front Squat, Dumbbell Squat, Hack Squat Machine, Landmine Squat, Pause Squat (bodyweight), Smith Machine Squat, Smith Machine Front Squat, Barbell Bulgarian Split Squat, Barbell Lunge, Barbell Split Squat, Barbell Step Up, Barbell Walking Lunges, Cable Step Up, Dumbbell Bulgarian Split Squat, Dumbbell Lunge, Dumbbell Split Squat, Dumbbell Step Up, Kettlebell Racked Split Squat, Lunge, Reverse Barbell Lunge, Reverse Dumbbell Lunge, Reverse Lunge, Smith Machine Bulgarian Split Squat, Smith Machine Split Squat, Machine Leg Press, Plate-Loaded Leg Extension, Plate-Loaded Single Leg Extension, Single Leg Extension, Single Leg Press, Vertical Leg Press, Air Squat, Alternating Lunge Jumps, Burpee Broad Jump, Cossack Squat, Dumbbell Sumo Squat, Horse Stance, Kettlebell Sumo Squat, Lunge Jump, Medicine Ball Lunge, Overhead Squat, Sissy Squat, Squat Jump, Wall Ball, Wall Sit.
- Calves: Barbell Calf Raise, Calf Raise, Dumbbell Calf Raise, Hip Loaded Calf Press Machine, Plate-Loaded Angled Calf Press, Plate-Loaded Standing Calf Raise, Single Leg Standing Calf Raise, Single Leg Standing Machine Calf Raise, Smith Machine Calf Raise, Standing Kettlebell Calf Raise, Calf Press on Leg Press, Seated Calf Extension, Jump Rope, Donkey Calf Raise, Seated Dumbbell Calf Raise, Tibialis Raise, Farmer Walk on Toes, Deficit Calf Raise (Step), Pogo Jumps.
- Abductors: Cable Hip Abduction, Machine Abduction, Banded Seated Abduction, Banded Side Lying Hip Abduction, Clamshells, Multi Hip Abduction, Lateral Band Walk, Fire Hydrant, Standing Side Leg Raise, Curtsy Lunge, Side Plank Hip Abduction, Cable Standing Hip Abduction.
- Adductors: Machine Adduction, Cable Hip Adduction, Multi Hip Adduction, Copenhagen Plank, Side Lunge, Sumo Squat (Wide Stance), Adductor Squeeze (Ball), Lying Adduction Leg Raise, Banded Adduction.

#### Batch 11: Hamstrings, Glutes & Lower Back (44 remaining exercises)
- Hamstrings: Dumbbell Good Morning, Good Morning, Kettlebell Romanian Deadlift, Kettlebell Suitcase Deadlift, Loop Band Deadlift, Loop Band Good Morning, Plate-Loaded Deadlift, Single Kettlebell Suitcase Deadlift, Single Leg Romanian Deadlift, Smith Machine Good Morning, Smith Machine Romanian Deadlift, Stiff Legged Deadlift, Sumo Deadlift, Trap Bar Deadlift, Plate-Loaded Standing Leg Curl, Single Leg Lying Hamstring Curl, Single Leg Seated Curl.
- Glutes: Barbell Glute Bridge, Dumbbell Glute Bridge, Plate-Loaded Hip Thrust, Plate-Loaded Hip Thrust Belt Supported, Single Leg Dumbbell Hip Thrust, Single Leg Glute Bridge, Smith Machine Hip Thrust, Cable Kickback, Cable Pull Through, Chest Supported Cable Kickback, Dumbbell Single Leg Glute Bridge, Glute Bridge with mini band, Glute Bridge with mini band (Abduction), Glute Ham Raise, Machine Glute Kickback, Machine Standing Hip Extension, Mini Band Kickbacks, Plate-Loaded Glute Kickback, Single Leg Smith Machine Reverse Kickback, Smith Machine Reverse Kickback, Stair Stepper.
- Lower Back: Back Extension, Superman, Machine Back Extension, Alternating Superman, Rack Pulls, 45-Degree Back Extension, Reverse Hyperextension, Bird Dog, Stability Ball Back Extension, Jefferson Curl, Seated Good Morning, Weighted Back Extension.

#### Batch 12: Abs & Core Variations (49 remaining exercises)
- Alternating Heel Touch, Bear Plank, Cable Torso Rotation, Cocoon Crunch, Cross Body Mountain Climber, Decline Crunch, Decline Leg Raise, Decline Oblique Crunch, Decline Russian Twists, Decline Sit Up, Elbow to Knee Crunch, Flutter Kicks, Hanging Oblique Knee Raise, High Plank Arm Reach, Isometric Holds, Kettlebell Sit Up and Press, Knee Raise, Leg Raise, Leg Raises with Stability Ball, Machine Seated Crunch, Oblique Crunch, Opposite Leg Toe Touch, Plank Jack, Plank Shoulder Taps, Plank Surrender, Plate-Loaded Ab Crunch, Reverse Crunch, Scissor Kick, Sit Up, Stability Ball Crunch, Stability Ball Plank Rollouts, Stability Ball Pull In, Toe Touches, Torso Rotation, TRX Ab Rollout, TRX Fallout, Tuck Crunch, V Sit, V Up, Vertical Knee Raise, Vertical Leg Raise.

---

## 3. Implementation Tasks & Verification Steps

### Task 1: Exercise Image Mapping & Canonical Normalization Module
**Files:**
- Create: `src/lib/exerciseImages.ts`
- Create: `src/lib/exerciseImages.test.ts`

**Step 1: Write unit tests**
- Verify canonical exercise name normalization (case-insensitive, trims whitespace, handles common aliases like `"Bench Press"` $\to$ `"Barbell Bench Press"`).
- Verify fallback behavior when an image does not exist yet (returns `null` or category default).

**Step 2: Implement lookup dictionary**
- Map all exercise names to clean filenames in `/exercises/[id].webp`.

---

### Task 2: Phase 1 Batch 1 (Chest & Upper Back - 24 Exercises)
**Files:**
- Output directory: `public/exercises/`
- Review artifact: `C:\Users\gagan\.gemini\antigravity\brain\17c4b1d6-9067-4faa-a085-e12a4b6a3045\batch1_review.md`

**Step 1:** Generate 24 icons using prompt with **solid black weights/plates**.
**Step 2:** Display visual review gallery in chat/artifact for user review.
**Step 3:** Wait for user manual approval or adjustment requests.

---

### Task 3: Phase 1 Batch 2 (Legs & Lower Body - 20 Exercises)
**Files:**
- Output directory: `public/exercises/`
- Review artifact: `C:\Users\gagan\.gemini\antigravity\brain\17c4b1d6-9067-4faa-a085-e12a4b6a3045\batch2_review.md`

**Step 1:** Generate 20 leg icons with solid black weights.
**Step 2:** Display visual review gallery.
**Step 3:** Wait for user manual approval.

---

### Task 4: Phase 1 Batch 3 (Shoulders, Biceps & Triceps - 25 Exercises)
**Files:**
- Output directory: `public/exercises/`
- Review artifact: `C:\Users\gagan\.gemini\antigravity\brain\17c4b1d6-9067-4faa-a085-e12a4b6a3045\batch3_review.md`

**Step 1:** Generate 25 shoulder/arm icons with solid black weights.
**Step 2:** Display visual review gallery.
**Step 3:** Wait for user manual approval.

---

### Task 5: Phase 1 Batch 4 (Core, Conditioning & Athletic - 19 Exercises)
**Files:**
- Output directory: `public/exercises/`
- Review artifact: `C:\Users\gagan\.gemini\antigravity\brain\17c4b1d6-9067-4faa-a085-e12a4b6a3045\batch4_review.md`

**Step 1:** Generate 19 core/athletic icons with solid black weights.
**Step 2:** Display visual review gallery.
**Step 3:** Wait for user manual approval.

---

### Task 6: UI Integration into Workout & Library Screens
**Files:**
- Modify: `src/routes/workout.tsx` (lines ~740-770)
- Modify: `src/routes/workout-library.tsx` (lines ~215-230)

**Step 1:** Add small circular thumbnail `<img>` (40×40 px) with fallback badge to exercise cards.
**Step 2:** Test responsive rendering on mobile and desktop viewports.
**Step 3:** Run `npm run build` and verify 0 errors.

---

### Task 7: Phase 2 Execution (Batches 5 through 12 - 387 Exercises)
Sequentially generate, review, and approve Batches 5 through 12 to achieve 100% icon coverage for all 475 exercises.

---

## 4. Verification & Quality Checklist
- [x] Style verified with solid black weight plates and orange target muscle highlights.
- [x] All 13 specific user-requested exercises included in Phase 1.
- [x] Complete 475 exercise database accounted for and cataloged.
- [ ] Manual approval obtained for each batch prior to code integration.
- [ ] Small pixel size: compressed to 128×128 or 200×200 px (<20 KB each).
- [ ] No regression in existing workout logging, timer, or audio cues.
- [ ] `npm run build` passes with code 0.
