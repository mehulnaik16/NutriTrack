// AUTO-GENERATED from the "15 Workout Plans" doc. Do not hand-edit — regenerate
// via scratchpad gen.mjs/emit2.mjs if the source doc changes. Each plan is stored
// verbatim as a non-custom workout_plans row (plan_json), so the Workout page's
// existing AI-plan render shows it; `source:"library"` marks it for the Profile
// plan-type label. Monday = Day 1 … Sunday = Day 7. Exercise names are reconciled
// to EXERCISES_DB (src/lib/exercises.ts) so plan exercises pin/favorite/log by the
// same canonical name everywhere.

export interface LibraryPlanExercise {
  name: string;
  sets: number;
  reps: string;
}
export interface LibraryPlanDay {
  day: string;
  name: string;
  focus: string;
  exercises: LibraryPlanExercise[];
}
export interface LibraryPlan {
  id: number;
  name: string;
  blurb: string;
  plan: {
    goal: string;
    days_per_week: number;
    days: LibraryPlanDay[];
    source: "library";
    library_id: number;
    library_name: string;
  };
}

export const WORKOUT_LIBRARY: LibraryPlan[] = [
  {
    "id": 1,
    "name": "THE CLASSIC BRO SPLIT (1 Muscle Per Day)",
    "blurb": "The foundation. One major muscle group per day with surgical precision.",
    "plan": {
      "goal": "Classic Bro Split",
      "days_per_week": 5,
      "days": [
        {
          "day": "Day 1",
          "name": "Chest",
          "focus": "Chest",
          "exercises": [
            {
              "name": "Barbell Bench Press",
              "sets": 4,
              "reps": "8–10"
            },
            {
              "name": "Dumbbell Incline Bench Press",
              "sets": 4,
              "reps": "8–12"
            },
            {
              "name": "Cable Crossover Fly",
              "sets": 3,
              "reps": "12–15"
            },
            {
              "name": "Chest Dip",
              "sets": 3,
              "reps": "8–12"
            },
            {
              "name": "Push Up",
              "sets": 2,
              "reps": "AMRAP"
            }
          ]
        },
        {
          "day": "Day 2",
          "name": "Back",
          "focus": "Back",
          "exercises": [
            {
              "name": "Deadlift",
              "sets": 4,
              "reps": "5"
            },
            {
              "name": "Pull Up",
              "sets": 4,
              "reps": "6–10"
            },
            {
              "name": "Barbell Row",
              "sets": 4,
              "reps": "8–12"
            },
            {
              "name": "Lat Pulldown",
              "sets": 3,
              "reps": "10–12"
            },
            {
              "name": "Cable Face Pull",
              "sets": 3,
              "reps": "15–20"
            }
          ]
        },
        {
          "day": "Day 3",
          "name": "Shoulders",
          "focus": "Shoulders",
          "exercises": [
            {
              "name": "Barbell Shoulder Press",
              "sets": 4,
              "reps": "6–10"
            },
            {
              "name": "Dumbbell Lateral Raise",
              "sets": 4,
              "reps": "10–15"
            },
            {
              "name": "Dumbbell Front Raise",
              "sets": 3,
              "reps": "10–15"
            },
            {
              "name": "Cable Reverse Fly",
              "sets": 3,
              "reps": "12–15"
            },
            {
              "name": "Dumbbell Shrug",
              "sets": 4,
              "reps": "10–12"
            }
          ]
        },
        {
          "day": "Day 4",
          "name": "Legs",
          "focus": "Legs",
          "exercises": [
            {
              "name": "Back Squat",
              "sets": 4,
              "reps": "6–10"
            },
            {
              "name": "Barbell Romanian Deadlift",
              "sets": 4,
              "reps": "8–12"
            },
            {
              "name": "Leg Press",
              "sets": 4,
              "reps": "10–15"
            },
            {
              "name": "Seated Leg Curl",
              "sets": 3,
              "reps": "12–15"
            },
            {
              "name": "Calf Raise",
              "sets": 4,
              "reps": "15–20"
            }
          ]
        },
        {
          "day": "Day 5",
          "name": "Arms",
          "focus": "Arms",
          "exercises": [
            {
              "name": "Barbell Curl",
              "sets": 4,
              "reps": "8–12"
            },
            {
              "name": "EZ Bar Skullcrusher",
              "sets": 4,
              "reps": "8–12"
            },
            {
              "name": "Hammer Curls",
              "sets": 3,
              "reps": "10–15"
            },
            {
              "name": "Tricep Pushdown",
              "sets": 3,
              "reps": "10–15"
            },
            {
              "name": "Preacher Curl",
              "sets": 3,
              "reps": "10–12"
            }
          ]
        },
        {
          "day": "Day 6",
          "name": "Active Recovery",
          "focus": "Active Recovery",
          "exercises": [
            {
              "name": "Light cardio / stretching",
              "sets": 1,
              "reps": "20–30 min"
            }
          ]
        },
        {
          "day": "Day 7",
          "name": "Rest",
          "focus": "Rest",
          "exercises": [
            {
              "name": "Complete rest",
              "sets": 1,
              "reps": "—"
            }
          ]
        }
      ],
      "source": "library",
      "library_id": 1,
      "library_name": "THE CLASSIC BRO SPLIT (1 Muscle Per Day)"
    }
  },
  {
    "id": 2,
    "name": "PUSH/PULL/LEGS + UPPER/LOWER (Hybrid – 2–3 Muscles Per Day)",
    "blurb": "The ULPPL split—trains each muscle twice a week for maximum growth.",
    "plan": {
      "goal": "Push/Pull/Legs + Upper/Lower",
      "days_per_week": 5,
      "days": [
        {
          "day": "Day 1",
          "name": "Push (Chest, Shoulders, Triceps)",
          "focus": "Push (Chest, Shoulders, Triceps)",
          "exercises": [
            {
              "name": "Barbell Bench Press",
              "sets": 4,
              "reps": "6–8"
            },
            {
              "name": "Barbell Shoulder Press",
              "sets": 4,
              "reps": "6–10"
            },
            {
              "name": "Dumbbell Incline Bench Press",
              "sets": 3,
              "reps": "8–12"
            },
            {
              "name": "Dumbbell Lateral Raise",
              "sets": 3,
              "reps": "12–15"
            },
            {
              "name": "Tricep Pushdown",
              "sets": 3,
              "reps": "10–12"
            }
          ]
        },
        {
          "day": "Day 2",
          "name": "Pull (Back, Biceps)",
          "focus": "Pull (Back, Biceps)",
          "exercises": [
            {
              "name": "Deadlift",
              "sets": 4,
              "reps": "5"
            },
            {
              "name": "Pull Up",
              "sets": 4,
              "reps": "6–10"
            },
            {
              "name": "Cable Row",
              "sets": 4,
              "reps": "8–12"
            },
            {
              "name": "Cable Face Pull",
              "sets": 3,
              "reps": "15–20"
            },
            {
              "name": "Barbell Curl",
              "sets": 3,
              "reps": "10–12"
            }
          ]
        },
        {
          "day": "Day 3",
          "name": "Legs",
          "focus": "Legs",
          "exercises": [
            {
              "name": "Back Squat",
              "sets": 4,
              "reps": "6–10"
            },
            {
              "name": "Barbell Romanian Deadlift",
              "sets": 4,
              "reps": "8–12"
            },
            {
              "name": "Leg Press",
              "sets": 4,
              "reps": "10–15"
            },
            {
              "name": "Seated Leg Curl",
              "sets": 3,
              "reps": "12–15"
            },
            {
              "name": "Calf Raise",
              "sets": 4,
              "reps": "15–20"
            }
          ]
        },
        {
          "day": "Day 4",
          "name": "Upper Body",
          "focus": "Upper Body",
          "exercises": [
            {
              "name": "Barbell Incline Bench Press",
              "sets": 4,
              "reps": "8–10"
            },
            {
              "name": "Barbell Row",
              "sets": 4,
              "reps": "8–12"
            },
            {
              "name": "Dumbbell Shoulder Press",
              "sets": 3,
              "reps": "8–12"
            },
            {
              "name": "Dumbbell Lateral Raise",
              "sets": 3,
              "reps": "12–15"
            },
            {
              "name": "Barbell Curls / Tricep Extensions",
              "sets": 3,
              "reps": "10–12"
            }
          ]
        },
        {
          "day": "Day 5",
          "name": "Lower Body",
          "focus": "Lower Body",
          "exercises": [
            {
              "name": "Front Squat",
              "sets": 4,
              "reps": "6–10"
            },
            {
              "name": "Sumo Deadlift",
              "sets": 4,
              "reps": "6–10"
            },
            {
              "name": "Leg Press",
              "sets": 4,
              "reps": "10–15"
            },
            {
              "name": "Seated Leg Curl",
              "sets": 3,
              "reps": "12–15"
            },
            {
              "name": "Calf Raise",
              "sets": 4,
              "reps": "15–20"
            }
          ]
        },
        {
          "day": "Day 6",
          "name": "Active Recovery",
          "focus": "Active Recovery",
          "exercises": [
            {
              "name": "Light cardio / mobility",
              "sets": 1,
              "reps": "20–30 min"
            }
          ]
        },
        {
          "day": "Day 7",
          "name": "Rest",
          "focus": "Rest",
          "exercises": [
            {
              "name": "Complete rest",
              "sets": 1,
              "reps": "—"
            }
          ]
        }
      ],
      "source": "library",
      "library_id": 2,
      "library_name": "PUSH/PULL/LEGS + UPPER/LOWER (Hybrid – 2–3 Muscles Per Day)"
    }
  },
  {
    "id": 3,
    "name": "THE POWERBUILDING SPLIT (Strength + Hypertrophy – 1–2 Muscles Per Day)",
    "blurb": "Combines heavy strength work with high-volume hypertrophy for size and power.",
    "plan": {
      "goal": "Powerbuilding Split",
      "days_per_week": 5,
      "days": [
        {
          "day": "Day 1",
          "name": "Chest + Triceps",
          "focus": "Chest + Triceps",
          "exercises": [
            {
              "name": "Barbell Bench Press",
              "sets": 5,
              "reps": "4–6"
            },
            {
              "name": "Dumbbell Incline Bench Press",
              "sets": 4,
              "reps": "8–12"
            },
            {
              "name": "Cable Crossover Fly",
              "sets": 3,
              "reps": "12–15"
            },
            {
              "name": "Close Grip Bench Press",
              "sets": 4,
              "reps": "6–10"
            },
            {
              "name": "Tricep Pushdown",
              "sets": 3,
              "reps": "10–15"
            }
          ]
        },
        {
          "day": "Day 2",
          "name": "Back + Biceps",
          "focus": "Back + Biceps",
          "exercises": [
            {
              "name": "Deadlift",
              "sets": 5,
              "reps": "4–6"
            },
            {
              "name": "Pull Up",
              "sets": 4,
              "reps": "6–10"
            },
            {
              "name": "Barbell Row",
              "sets": 4,
              "reps": "8–12"
            },
            {
              "name": "Barbell Curl",
              "sets": 4,
              "reps": "8–12"
            },
            {
              "name": "Hammer Curls",
              "sets": 3,
              "reps": "10–15"
            }
          ]
        },
        {
          "day": "Day 3",
          "name": "Shoulders + Traps",
          "focus": "Shoulders + Traps",
          "exercises": [
            {
              "name": "Barbell Shoulder Press",
              "sets": 5,
              "reps": "4–6"
            },
            {
              "name": "Dumbbell Lateral Raise",
              "sets": 4,
              "reps": "10–15"
            },
            {
              "name": "Barbell Shrug",
              "sets": 4,
              "reps": "10–12"
            },
            {
              "name": "Machine Reverse Fly",
              "sets": 3,
              "reps": "12–15"
            },
            {
              "name": "Dumbbell Front Raise",
              "sets": 3,
              "reps": "10–15"
            }
          ]
        },
        {
          "day": "Day 4",
          "name": "Legs",
          "focus": "Legs",
          "exercises": [
            {
              "name": "Back Squat",
              "sets": 5,
              "reps": "4–6"
            },
            {
              "name": "Barbell Romanian Deadlift",
              "sets": 4,
              "reps": "8–12"
            },
            {
              "name": "Leg Press",
              "sets": 4,
              "reps": "10–15"
            },
            {
              "name": "Seated Leg Curl",
              "sets": 3,
              "reps": "12–15"
            },
            {
              "name": "Calf Raise",
              "sets": 4,
              "reps": "15–20"
            }
          ]
        },
        {
          "day": "Day 5",
          "name": "Arms (Biceps + Triceps)",
          "focus": "Arms (Biceps + Triceps)",
          "exercises": [
            {
              "name": "Barbell Curl",
              "sets": 4,
              "reps": "8–12"
            },
            {
              "name": "EZ Bar Skullcrusher",
              "sets": 4,
              "reps": "8–12"
            },
            {
              "name": "Preacher Curl",
              "sets": 3,
              "reps": "10–12"
            },
            {
              "name": "Tricep Pushdown",
              "sets": 3,
              "reps": "10–15"
            },
            {
              "name": "Dumbbell Concentration Curl",
              "sets": 3,
              "reps": "10–12"
            }
          ]
        },
        {
          "day": "Day 6",
          "name": "Active Recovery",
          "focus": "Active Recovery",
          "exercises": [
            {
              "name": "Light cardio / stretching",
              "sets": 1,
              "reps": "20–30 min"
            }
          ]
        },
        {
          "day": "Day 7",
          "name": "Rest",
          "focus": "Rest",
          "exercises": [
            {
              "name": "Complete rest",
              "sets": 1,
              "reps": "—"
            }
          ]
        }
      ],
      "source": "library",
      "library_id": 3,
      "library_name": "THE POWERBUILDING SPLIT (Strength + Hypertrophy – 1–2 Muscles Per Day)"
    }
  },
  {
    "id": 4,
    "name": "THE 5-DAY UPPER/LOWER WITH ARMS FOCUS (2 Muscles Per Day)",
    "blurb": "Hits upper body twice, lower body twice, and a dedicated arm day.",
    "plan": {
      "goal": "5-Day Upper/Lower With Arms Focus",
      "days_per_week": 5,
      "days": [
        {
          "day": "Day 1",
          "name": "Upper Body 1",
          "focus": "Upper Body 1",
          "exercises": [
            {
              "name": "Barbell Bench Press",
              "sets": 4,
              "reps": "6–10"
            },
            {
              "name": "Barbell Row",
              "sets": 4,
              "reps": "8–12"
            },
            {
              "name": "Barbell Shoulder Press",
              "sets": 4,
              "reps": "6–10"
            },
            {
              "name": "Pull Up",
              "sets": 3,
              "reps": "8–12"
            },
            {
              "name": "Dumbbell Lateral Raise",
              "sets": 3,
              "reps": "12–15"
            }
          ]
        },
        {
          "day": "Day 2",
          "name": "Lower Body 1",
          "focus": "Lower Body 1",
          "exercises": [
            {
              "name": "Back Squat",
              "sets": 4,
              "reps": "6–10"
            },
            {
              "name": "Barbell Romanian Deadlift",
              "sets": 4,
              "reps": "8–12"
            },
            {
              "name": "Leg Press",
              "sets": 4,
              "reps": "10–15"
            },
            {
              "name": "Seated Leg Curl",
              "sets": 3,
              "reps": "12–15"
            },
            {
              "name": "Calf Raise",
              "sets": 4,
              "reps": "15–20"
            }
          ]
        },
        {
          "day": "Day 3",
          "name": "Arms",
          "focus": "Arms",
          "exercises": [
            {
              "name": "Barbell Curl",
              "sets": 4,
              "reps": "8–12"
            },
            {
              "name": "EZ Bar Skullcrusher",
              "sets": 4,
              "reps": "8–12"
            },
            {
              "name": "Hammer Curls",
              "sets": 3,
              "reps": "10–15"
            },
            {
              "name": "Tricep Pushdown",
              "sets": 3,
              "reps": "10–15"
            },
            {
              "name": "Preacher Curl",
              "sets": 3,
              "reps": "10–12"
            }
          ]
        },
        {
          "day": "Day 4",
          "name": "Upper Body 2",
          "focus": "Upper Body 2",
          "exercises": [
            {
              "name": "Dumbbell Incline Bench Press",
              "sets": 4,
              "reps": "8–12"
            },
            {
              "name": "Cable Row",
              "sets": 4,
              "reps": "8–12"
            },
            {
              "name": "Dumbbell Shoulder Press",
              "sets": 4,
              "reps": "8–12"
            },
            {
              "name": "Cable Face Pull",
              "sets": 3,
              "reps": "15–20"
            },
            {
              "name": "Dumbbell Shrug",
              "sets": 3,
              "reps": "10–12"
            }
          ]
        },
        {
          "day": "Day 5",
          "name": "Lower Body 2",
          "focus": "Lower Body 2",
          "exercises": [
            {
              "name": "Front Squat",
              "sets": 4,
              "reps": "6–10"
            },
            {
              "name": "Sumo Deadlift",
              "sets": 4,
              "reps": "6–10"
            },
            {
              "name": "Leg Press",
              "sets": 4,
              "reps": "10–15"
            },
            {
              "name": "Seated Leg Curl",
              "sets": 3,
              "reps": "12–15"
            },
            {
              "name": "Calf Raise",
              "sets": 4,
              "reps": "15–20"
            }
          ]
        },
        {
          "day": "Day 6",
          "name": "Active Recovery",
          "focus": "Active Recovery",
          "exercises": [
            {
              "name": "Light cardio / mobility",
              "sets": 1,
              "reps": "20–30 min"
            }
          ]
        },
        {
          "day": "Day 7",
          "name": "Rest",
          "focus": "Rest",
          "exercises": [
            {
              "name": "Complete rest",
              "sets": 1,
              "reps": "—"
            }
          ]
        }
      ],
      "source": "library",
      "library_id": 4,
      "library_name": "THE 5-DAY UPPER/LOWER WITH ARMS FOCUS (2 Muscles Per Day)"
    }
  },
  {
    "id": 5,
    "name": "THE PUSH/PULL/LEGS (PPL) – 5-DAY VARIATION (3 Muscles Per Day)",
    "blurb": "Classic PPL structure with two push and two pull days, one leg day.",
    "plan": {
      "goal": "Push/Pull/Legs",
      "days_per_week": 5,
      "days": [
        {
          "day": "Day 1",
          "name": "Push 1 (Chest, Shoulders, Triceps)",
          "focus": "Push 1 (Chest, Shoulders, Triceps)",
          "exercises": [
            {
              "name": "Barbell Bench Press",
              "sets": 4,
              "reps": "6–8"
            },
            {
              "name": "Barbell Shoulder Press",
              "sets": 4,
              "reps": "6–10"
            },
            {
              "name": "Dumbbell Incline Bench Press",
              "sets": 3,
              "reps": "8–12"
            },
            {
              "name": "Dumbbell Lateral Raise",
              "sets": 3,
              "reps": "12–15"
            },
            {
              "name": "Tricep Pushdown",
              "sets": 3,
              "reps": "10–12"
            }
          ]
        },
        {
          "day": "Day 2",
          "name": "Pull 1 (Back, Biceps, Rear Delts)",
          "focus": "Pull 1 (Back, Biceps, Rear Delts)",
          "exercises": [
            {
              "name": "Deadlift",
              "sets": 4,
              "reps": "5"
            },
            {
              "name": "Pull Up",
              "sets": 4,
              "reps": "6–10"
            },
            {
              "name": "Barbell Row",
              "sets": 4,
              "reps": "8–12"
            },
            {
              "name": "Cable Face Pull",
              "sets": 3,
              "reps": "15–20"
            },
            {
              "name": "Barbell Curl",
              "sets": 3,
              "reps": "10–12"
            }
          ]
        },
        {
          "day": "Day 3",
          "name": "Legs",
          "focus": "Legs",
          "exercises": [
            {
              "name": "Back Squat",
              "sets": 4,
              "reps": "6–10"
            },
            {
              "name": "Barbell Romanian Deadlift",
              "sets": 4,
              "reps": "8–12"
            },
            {
              "name": "Leg Press",
              "sets": 4,
              "reps": "10–15"
            },
            {
              "name": "Seated Leg Curl",
              "sets": 3,
              "reps": "12–15"
            },
            {
              "name": "Calf Raise",
              "sets": 4,
              "reps": "15–20"
            }
          ]
        },
        {
          "day": "Day 4",
          "name": "Push 2",
          "focus": "Push 2",
          "exercises": [
            {
              "name": "Barbell Incline Bench Press",
              "sets": 4,
              "reps": "8–12"
            },
            {
              "name": "Dumbbell Shoulder Press",
              "sets": 4,
              "reps": "8–12"
            },
            {
              "name": "Cable Crossover Fly",
              "sets": 3,
              "reps": "12–15"
            },
            {
              "name": "Dumbbell Lateral Raise",
              "sets": 3,
              "reps": "12–15"
            },
            {
              "name": "EZ Bar Skullcrusher",
              "sets": 3,
              "reps": "10–12"
            }
          ]
        },
        {
          "day": "Day 5",
          "name": "Pull 2",
          "focus": "Pull 2",
          "exercises": [
            {
              "name": "Cable Row",
              "sets": 4,
              "reps": "8–12"
            },
            {
              "name": "Lat Pulldown",
              "sets": 4,
              "reps": "8–12"
            },
            {
              "name": "Dumbbell Row",
              "sets": 3,
              "reps": "8–12"
            },
            {
              "name": "Cable Reverse Fly",
              "sets": 3,
              "reps": "12–15"
            },
            {
              "name": "Hammer Curls",
              "sets": 3,
              "reps": "10–15"
            }
          ]
        },
        {
          "day": "Day 6",
          "name": "Active Recovery",
          "focus": "Active Recovery",
          "exercises": [
            {
              "name": "Light cardio / stretching",
              "sets": 1,
              "reps": "20–30 min"
            }
          ]
        },
        {
          "day": "Day 7",
          "name": "Rest",
          "focus": "Rest",
          "exercises": [
            {
              "name": "Complete rest",
              "sets": 1,
              "reps": "—"
            }
          ]
        }
      ],
      "source": "library",
      "library_id": 5,
      "library_name": "THE PUSH/PULL/LEGS (PPL) – 5-DAY VARIATION (3 Muscles Per Day)"
    }
  },
  {
    "id": 6,
    "name": "THE STRENGTH FOCUS (Low Reps, Heavy Weights – 1 Muscle Per Day)",
    "blurb": "For maximal strength gains. Each day focuses on one primary lift.",
    "plan": {
      "goal": "Strength Focus",
      "days_per_week": 5,
      "days": [
        {
          "day": "Day 1",
          "name": "Chest",
          "focus": "Chest",
          "exercises": [
            {
              "name": "Barbell Bench Press",
              "sets": 5,
              "reps": "4–6"
            },
            {
              "name": "Dumbbell Incline Bench Press",
              "sets": 4,
              "reps": "6–8"
            },
            {
              "name": "Chest Dip",
              "sets": 3,
              "reps": "6–10"
            },
            {
              "name": "Cable Crossover Fly",
              "sets": 3,
              "reps": "10–12"
            }
          ]
        },
        {
          "day": "Day 2",
          "name": "Back",
          "focus": "Back",
          "exercises": [
            {
              "name": "Deadlift",
              "sets": 5,
              "reps": "3–5"
            },
            {
              "name": "Pull Up",
              "sets": 4,
              "reps": "5–8"
            },
            {
              "name": "Barbell Row",
              "sets": 4,
              "reps": "6–8"
            },
            {
              "name": "Cable Face Pull",
              "sets": 3,
              "reps": "12–15"
            }
          ]
        },
        {
          "day": "Day 3",
          "name": "Shoulders",
          "focus": "Shoulders",
          "exercises": [
            {
              "name": "Barbell Shoulder Press",
              "sets": 5,
              "reps": "4–6"
            },
            {
              "name": "Dumbbell Lateral Raise",
              "sets": 4,
              "reps": "8–10"
            },
            {
              "name": "Barbell Shrug",
              "sets": 4,
              "reps": "8–10"
            },
            {
              "name": "Machine Reverse Fly",
              "sets": 3,
              "reps": "12–15"
            }
          ]
        },
        {
          "day": "Day 4",
          "name": "Legs",
          "focus": "Legs",
          "exercises": [
            {
              "name": "Back Squat",
              "sets": 5,
              "reps": "4–6"
            },
            {
              "name": "Barbell Romanian Deadlift",
              "sets": 4,
              "reps": "6–8"
            },
            {
              "name": "Leg Press",
              "sets": 4,
              "reps": "8–10"
            },
            {
              "name": "Calf Raise",
              "sets": 4,
              "reps": "12–15"
            }
          ]
        },
        {
          "day": "Day 5",
          "name": "Arms",
          "focus": "Arms",
          "exercises": [
            {
              "name": "Barbell Curl",
              "sets": 4,
              "reps": "6–8"
            },
            {
              "name": "Close Grip Bench Press",
              "sets": 4,
              "reps": "6–8"
            },
            {
              "name": "Preacher Curl",
              "sets": 3,
              "reps": "8–10"
            },
            {
              "name": "Tricep Pushdown",
              "sets": 3,
              "reps": "8–10"
            }
          ]
        },
        {
          "day": "Day 6",
          "name": "Active Recovery",
          "focus": "Active Recovery",
          "exercises": [
            {
              "name": "Light cardio / mobility",
              "sets": 1,
              "reps": "20–30 min"
            }
          ]
        },
        {
          "day": "Day 7",
          "name": "Rest",
          "focus": "Rest",
          "exercises": [
            {
              "name": "Complete rest",
              "sets": 1,
              "reps": "—"
            }
          ]
        }
      ],
      "source": "library",
      "library_id": 6,
      "library_name": "THE STRENGTH FOCUS (Low Reps, Heavy Weights – 1 Muscle Per Day)"
    }
  },
  {
    "id": 7,
    "name": "THE VOLUME MONSTER (High Volume, Moderate Weight – 2 Muscles Per Day)",
    "blurb": "For pure hypertrophy. Higher sets and reps to stimulate maximum muscle growth.",
    "plan": {
      "goal": "Volume Monster",
      "days_per_week": 5,
      "days": [
        {
          "day": "Day 1",
          "name": "Chest + Triceps",
          "focus": "Chest + Triceps",
          "exercises": [
            {
              "name": "Barbell Bench Press",
              "sets": 5,
              "reps": "8–12"
            },
            {
              "name": "Dumbbell Incline Bench Press",
              "sets": 4,
              "reps": "10–15"
            },
            {
              "name": "Cable Crossover Fly",
              "sets": 4,
              "reps": "12–15"
            },
            {
              "name": "Chest Dip",
              "sets": 4,
              "reps": "10–15"
            },
            {
              "name": "Tricep Pushdown",
              "sets": 4,
              "reps": "12–15"
            },
            {
              "name": "EZ Bar Overhead Tricep Extension",
              "sets": 3,
              "reps": "12–15"
            }
          ]
        },
        {
          "day": "Day 2",
          "name": "Back + Biceps",
          "focus": "Back + Biceps",
          "exercises": [
            {
              "name": "Lat Pulldown",
              "sets": 5,
              "reps": "10–12"
            },
            {
              "name": "Cable Row",
              "sets": 5,
              "reps": "10–12"
            },
            {
              "name": "Dumbbell Row",
              "sets": 4,
              "reps": "10–12"
            },
            {
              "name": "Barbell Curl",
              "sets": 4,
              "reps": "10–12"
            },
            {
              "name": "Hammer Curls",
              "sets": 4,
              "reps": "10–15"
            },
            {
              "name": "Dumbbell Concentration Curl",
              "sets": 3,
              "reps": "12–15"
            }
          ]
        },
        {
          "day": "Day 3",
          "name": "Shoulders + Traps",
          "focus": "Shoulders + Traps",
          "exercises": [
            {
              "name": "Dumbbell Shoulder Press",
              "sets": 5,
              "reps": "10–12"
            },
            {
              "name": "Dumbbell Lateral Raise",
              "sets": 5,
              "reps": "12–15"
            },
            {
              "name": "Dumbbell Front Raise",
              "sets": 4,
              "reps": "12–15"
            },
            {
              "name": "Cable Reverse Fly",
              "sets": 4,
              "reps": "12–15"
            },
            {
              "name": "Dumbbell Shrug",
              "sets": 5,
              "reps": "10–12"
            }
          ]
        },
        {
          "day": "Day 4",
          "name": "Legs",
          "focus": "Legs",
          "exercises": [
            {
              "name": "Back Squat",
              "sets": 5,
              "reps": "8–12"
            },
            {
              "name": "Leg Press",
              "sets": 5,
              "reps": "12–15"
            },
            {
              "name": "Barbell Romanian Deadlift",
              "sets": 4,
              "reps": "10–12"
            },
            {
              "name": "Seated Leg Curl",
              "sets": 4,
              "reps": "12–15"
            },
            {
              "name": "Leg Extension",
              "sets": 4,
              "reps": "12–15"
            },
            {
              "name": "Calf Raise",
              "sets": 5,
              "reps": "15–20"
            }
          ]
        },
        {
          "day": "Day 5",
          "name": "Arms (Biceps + Triceps)",
          "focus": "Arms (Biceps + Triceps)",
          "exercises": [
            {
              "name": "Barbell Curl",
              "sets": 4,
              "reps": "10–12"
            },
            {
              "name": "EZ Bar Skullcrusher",
              "sets": 4,
              "reps": "10–12"
            },
            {
              "name": "Preacher Curl",
              "sets": 4,
              "reps": "10–12"
            },
            {
              "name": "Tricep Pushdown",
              "sets": 4,
              "reps": "12–15"
            },
            {
              "name": "Cable Bicep Curl",
              "sets": 3,
              "reps": "12–15"
            },
            {
              "name": "Chest Dip",
              "sets": 3,
              "reps": "12–15"
            }
          ]
        },
        {
          "day": "Day 6",
          "name": "Active Recovery",
          "focus": "Active Recovery",
          "exercises": [
            {
              "name": "Light cardio / stretching",
              "sets": 1,
              "reps": "20–30 min"
            }
          ]
        },
        {
          "day": "Day 7",
          "name": "Rest",
          "focus": "Rest",
          "exercises": [
            {
              "name": "Complete rest",
              "sets": 1,
              "reps": "—"
            }
          ]
        }
      ],
      "source": "library",
      "library_id": 7,
      "library_name": "THE VOLUME MONSTER (High Volume, Moderate Weight – 2 Muscles Per Day)"
    }
  },
  {
    "id": 8,
    "name": "THE DUMBBELL-ONLY PLAN (No Barbell – 2 Muscles Per Day)",
    "blurb": "Perfect for home gyms or when barbells aren't available.",
    "plan": {
      "goal": "Dumbbell-Only Plan",
      "days_per_week": 5,
      "days": [
        {
          "day": "Day 1",
          "name": "Chest + Triceps",
          "focus": "Chest + Triceps",
          "exercises": [
            {
              "name": "Dumbbell Bench Press",
              "sets": 4,
              "reps": "8–12"
            },
            {
              "name": "Dumbbell Incline Bench Press",
              "sets": 4,
              "reps": "8–12"
            },
            {
              "name": "Dumbbell Fly",
              "sets": 3,
              "reps": "12–15"
            },
            {
              "name": "Dumbbell Pullover",
              "sets": 3,
              "reps": "10–12"
            },
            {
              "name": "Dumbbell Tricep Extension",
              "sets": 3,
              "reps": "10–15"
            }
          ]
        },
        {
          "day": "Day 2",
          "name": "Back + Biceps",
          "focus": "Back + Biceps",
          "exercises": [
            {
              "name": "Dumbbell Row",
              "sets": 4,
              "reps": "8–12"
            },
            {
              "name": "Dumbbell Pullover",
              "sets": 4,
              "reps": "10–12"
            },
            {
              "name": "Renegade Row",
              "sets": 3,
              "reps": "10–12"
            },
            {
              "name": "Dumbbell Bicep Curl",
              "sets": 4,
              "reps": "10–12"
            },
            {
              "name": "Hammer Curls",
              "sets": 3,
              "reps": "10–15"
            }
          ]
        },
        {
          "day": "Day 3",
          "name": "Shoulders + Traps",
          "focus": "Shoulders + Traps",
          "exercises": [
            {
              "name": "Dumbbell Shoulder Press",
              "sets": 4,
              "reps": "8–12"
            },
            {
              "name": "Dumbbell Lateral Raise",
              "sets": 4,
              "reps": "12–15"
            },
            {
              "name": "Dumbbell Front Raise",
              "sets": 3,
              "reps": "12–15"
            },
            {
              "name": "Dumbbell Reverse Fly (Standing)",
              "sets": 3,
              "reps": "12–15"
            },
            {
              "name": "Dumbbell Shrug",
              "sets": 4,
              "reps": "10–12"
            }
          ]
        },
        {
          "day": "Day 4",
          "name": "Legs",
          "focus": "Legs",
          "exercises": [
            {
              "name": "Dumbbell Squat",
              "sets": 4,
              "reps": "8–12"
            },
            {
              "name": "Dumbbell Lunge",
              "sets": 4,
              "reps": "10–12"
            },
            {
              "name": "Dumbbell Romanian Deadlift",
              "sets": 4,
              "reps": "10–12"
            },
            {
              "name": "Dumbbell Calf Raise",
              "sets": 4,
              "reps": "15–20"
            },
            {
              "name": "Goblet Squat",
              "sets": 3,
              "reps": "10–12"
            }
          ]
        },
        {
          "day": "Day 5",
          "name": "Arms",
          "focus": "Arms",
          "exercises": [
            {
              "name": "Dumbbell Bicep Curl",
              "sets": 4,
              "reps": "10–12"
            },
            {
              "name": "Dumbbell Tricep Extension",
              "sets": 4,
              "reps": "10–12"
            },
            {
              "name": "Hammer Curls",
              "sets": 3,
              "reps": "10–15"
            },
            {
              "name": "Dumbbell Kickbacks",
              "sets": 3,
              "reps": "12–15"
            },
            {
              "name": "Dumbbell Concentration Curl",
              "sets": 3,
              "reps": "10–12"
            }
          ]
        },
        {
          "day": "Day 6",
          "name": "Active Recovery",
          "focus": "Active Recovery",
          "exercises": [
            {
              "name": "Light cardio / mobility",
              "sets": 1,
              "reps": "20–30 min"
            }
          ]
        },
        {
          "day": "Day 7",
          "name": "Rest",
          "focus": "Rest",
          "exercises": [
            {
              "name": "Complete rest",
              "sets": 1,
              "reps": "—"
            }
          ]
        }
      ],
      "source": "library",
      "library_id": 8,
      "library_name": "THE DUMBBELL-ONLY PLAN (No Barbell – 2 Muscles Per Day)"
    }
  },
  {
    "id": 9,
    "name": "THE 5-DAY FULL-BODY SPLIT (3 Muscles Per Day – Compound Focus)",
    "blurb": "Hits the whole body with compound lifts every day, but with different emphasis.",
    "plan": {
      "goal": "5-Day Full-Body Split",
      "days_per_week": 5,
      "days": [
        {
          "day": "Day 1",
          "name": "Push (Chest, Shoulders, Triceps)",
          "focus": "Push (Chest, Shoulders, Triceps)",
          "exercises": [
            {
              "name": "Barbell Bench Press",
              "sets": 4,
              "reps": "6–10"
            },
            {
              "name": "Barbell Shoulder Press",
              "sets": 4,
              "reps": "6–10"
            },
            {
              "name": "Chest Dip",
              "sets": 3,
              "reps": "8–12"
            },
            {
              "name": "Dumbbell Lateral Raise",
              "sets": 3,
              "reps": "12–15"
            },
            {
              "name": "Tricep Pushdown",
              "sets": 3,
              "reps": "10–12"
            }
          ]
        },
        {
          "day": "Day 2",
          "name": "Pull (Back, Biceps, Rear Delts)",
          "focus": "Pull (Back, Biceps, Rear Delts)",
          "exercises": [
            {
              "name": "Deadlift",
              "sets": 4,
              "reps": "5"
            },
            {
              "name": "Pull Up",
              "sets": 4,
              "reps": "6–10"
            },
            {
              "name": "Barbell Row",
              "sets": 4,
              "reps": "8–12"
            },
            {
              "name": "Cable Face Pull",
              "sets": 3,
              "reps": "15–20"
            },
            {
              "name": "Barbell Curl",
              "sets": 3,
              "reps": "10–12"
            }
          ]
        },
        {
          "day": "Day 3",
          "name": "Legs (Quads, Hamstrings, Glutes)",
          "focus": "Legs (Quads, Hamstrings, Glutes)",
          "exercises": [
            {
              "name": "Back Squat",
              "sets": 4,
              "reps": "6–10"
            },
            {
              "name": "Barbell Romanian Deadlift",
              "sets": 4,
              "reps": "8–12"
            },
            {
              "name": "Leg Press",
              "sets": 4,
              "reps": "10–15"
            },
            {
              "name": "Seated Leg Curl",
              "sets": 3,
              "reps": "12–15"
            },
            {
              "name": "Calf Raise",
              "sets": 4,
              "reps": "15–20"
            }
          ]
        },
        {
          "day": "Day 4",
          "name": "Upper Body",
          "focus": "Upper Body",
          "exercises": [
            {
              "name": "Barbell Incline Bench Press",
              "sets": 4,
              "reps": "8–12"
            },
            {
              "name": "Cable Row",
              "sets": 4,
              "reps": "8–12"
            },
            {
              "name": "Dumbbell Shoulder Press",
              "sets": 3,
              "reps": "8–12"
            },
            {
              "name": "Dumbbell Lateral Raise",
              "sets": 3,
              "reps": "12–15"
            },
            {
              "name": "Barbell Curl",
              "sets": 3,
              "reps": "10–12"
            }
          ]
        },
        {
          "day": "Day 5",
          "name": "Lower Body + Core",
          "focus": "Lower Body + Core",
          "exercises": [
            {
              "name": "Front Squat",
              "sets": 4,
              "reps": "6–10"
            },
            {
              "name": "Sumo Deadlift",
              "sets": 4,
              "reps": "6–10"
            },
            {
              "name": "Leg Press",
              "sets": 4,
              "reps": "10–15"
            },
            {
              "name": "Seated Leg Curl",
              "sets": 3,
              "reps": "12–15"
            },
            {
              "name": "Plank",
              "sets": 3,
              "reps": "60 sec"
            }
          ]
        },
        {
          "day": "Day 6",
          "name": "Active Recovery",
          "focus": "Active Recovery",
          "exercises": [
            {
              "name": "Light cardio / stretching",
              "sets": 1,
              "reps": "20–30 min"
            }
          ]
        },
        {
          "day": "Day 7",
          "name": "Rest",
          "focus": "Rest",
          "exercises": [
            {
              "name": "Complete rest",
              "sets": 1,
              "reps": "—"
            }
          ]
        }
      ],
      "source": "library",
      "library_id": 9,
      "library_name": "THE 5-DAY FULL-BODY SPLIT (3 Muscles Per Day – Compound Focus)"
    }
  },
  {
    "id": 10,
    "name": "THE INTENSITY TECHNIQUE SPLIT (1–2 Muscles Per Day)",
    "blurb": "Incorporates dropsets, supersets, and forced reps for advanced lifters.",
    "plan": {
      "goal": "Intensity Technique Split",
      "days_per_week": 5,
      "days": [
        {
          "day": "Day 1",
          "name": "Chest + Triceps",
          "focus": "Chest + Triceps",
          "exercises": [
            {
              "name": "Barbell Bench Press",
              "sets": 4,
              "reps": "8–10"
            },
            {
              "name": "Dumbbell Incline Bench Press",
              "sets": 3,
              "reps": "10–12"
            },
            {
              "name": "Cable Crossover Fly",
              "sets": 3,
              "reps": "12–15"
            },
            {
              "name": "Close Grip Bench Press",
              "sets": 3,
              "reps": "8–10"
            },
            {
              "name": "Tricep Pushdown",
              "sets": 3,
              "reps": "12–15"
            }
          ]
        },
        {
          "day": "Day 2",
          "name": "Back + Biceps",
          "focus": "Back + Biceps",
          "exercises": [
            {
              "name": "Deadlift",
              "sets": 4,
              "reps": "5"
            },
            {
              "name": "Pull Up",
              "sets": 4,
              "reps": "6–10"
            },
            {
              "name": "Barbell Row",
              "sets": 4,
              "reps": "8–12"
            },
            {
              "name": "Barbell Curl",
              "sets": 3,
              "reps": "10–12"
            },
            {
              "name": "Hammer Curls",
              "sets": 3,
              "reps": "10–15"
            }
          ]
        },
        {
          "day": "Day 3",
          "name": "Shoulders + Traps",
          "focus": "Shoulders + Traps",
          "exercises": [
            {
              "name": "Barbell Shoulder Press",
              "sets": 4,
              "reps": "6–10"
            },
            {
              "name": "Dumbbell Lateral Raise",
              "sets": 4,
              "reps": "10–15"
            },
            {
              "name": "Barbell Shrug",
              "sets": 4,
              "reps": "10–12"
            },
            {
              "name": "Machine Reverse Fly",
              "sets": 3,
              "reps": "12–15"
            }
          ]
        },
        {
          "day": "Day 4",
          "name": "Legs",
          "focus": "Legs",
          "exercises": [
            {
              "name": "Back Squat",
              "sets": 4,
              "reps": "6–10"
            },
            {
              "name": "Barbell Romanian Deadlift",
              "sets": 4,
              "reps": "8–12"
            },
            {
              "name": "Leg Press",
              "sets": 4,
              "reps": "10–15"
            },
            {
              "name": "Seated Leg Curl",
              "sets": 3,
              "reps": "12–15"
            }
          ]
        },
        {
          "day": "Day 5",
          "name": "Arms",
          "focus": "Arms",
          "exercises": [
            {
              "name": "Barbell Curl",
              "sets": 4,
              "reps": "8–12"
            },
            {
              "name": "EZ Bar Skullcrusher",
              "sets": 4,
              "reps": "8–12"
            },
            {
              "name": "Preacher Curl",
              "sets": 3,
              "reps": "10–12"
            },
            {
              "name": "Tricep Pushdown",
              "sets": 3,
              "reps": "10–15"
            }
          ]
        },
        {
          "day": "Day 6",
          "name": "Active Recovery",
          "focus": "Active Recovery",
          "exercises": [
            {
              "name": "Light cardio / stretching",
              "sets": 1,
              "reps": "20–30 min"
            }
          ]
        },
        {
          "day": "Day 7",
          "name": "Rest",
          "focus": "Rest",
          "exercises": [
            {
              "name": "Complete rest",
              "sets": 1,
              "reps": "—"
            }
          ]
        }
      ],
      "source": "library",
      "library_id": 10,
      "library_name": "THE INTENSITY TECHNIQUE SPLIT (1–2 Muscles Per Day)"
    }
  },
  {
    "id": 11,
    "name": "THE FUNCTIONAL STRENGTH SPLIT (2 Muscles Per Day – Athletic Focus)",
    "blurb": "For athletes who need power, explosiveness, and endurance.",
    "plan": {
      "goal": "Functional Strength Split",
      "days_per_week": 5,
      "days": [
        {
          "day": "Day 1",
          "name": "Chest + Core",
          "focus": "Chest + Core",
          "exercises": [
            {
              "name": "Barbell Bench Press",
              "sets": 4,
              "reps": "6–10"
            },
            {
              "name": "Dumbbell Incline Bench Press",
              "sets": 4,
              "reps": "8–12"
            },
            {
              "name": "Plyometric Push-ups",
              "sets": 3,
              "reps": "10–15"
            },
            {
              "name": "Cable Wood Chop High to Low",
              "sets": 3,
              "reps": "12–15"
            },
            {
              "name": "Plank Shoulder Taps",
              "sets": 3,
              "reps": "45 sec"
            }
          ]
        },
        {
          "day": "Day 2",
          "name": "Back + Core",
          "focus": "Back + Core",
          "exercises": [
            {
              "name": "Deadlift",
              "sets": 4,
              "reps": "5"
            },
            {
              "name": "Pull Up",
              "sets": 4,
              "reps": "6–10"
            },
            {
              "name": "Barbell Row",
              "sets": 4,
              "reps": "8–12"
            },
            {
              "name": "Hanging Leg Raise",
              "sets": 3,
              "reps": "15–20"
            },
            {
              "name": "Russian Twist",
              "sets": 3,
              "reps": "20"
            }
          ]
        },
        {
          "day": "Day 3",
          "name": "Legs (Explosive)",
          "focus": "Legs (Explosive)",
          "exercises": [
            {
              "name": "Back Squat",
              "sets": 4,
              "reps": "6–10"
            },
            {
              "name": "Box Jump",
              "sets": 3,
              "reps": "8–10"
            },
            {
              "name": "Barbell Romanian Deadlift",
              "sets": 4,
              "reps": "8–12"
            },
            {
              "name": "Sled Push",
              "sets": 3,
              "reps": "20 yds"
            },
            {
              "name": "Calf Raise",
              "sets": 4,
              "reps": "15–20"
            }
          ]
        },
        {
          "day": "Day 4",
          "name": "Shoulders + Core",
          "focus": "Shoulders + Core",
          "exercises": [
            {
              "name": "Barbell Shoulder Press",
              "sets": 4,
              "reps": "6–10"
            },
            {
              "name": "Dumbbell Lateral Raise",
              "sets": 4,
              "reps": "10–15"
            },
            {
              "name": "Arnold Press",
              "sets": 3,
              "reps": "10–12"
            },
            {
              "name": "Medicine Ball Slams",
              "sets": 3,
              "reps": "15"
            },
            {
              "name": "Bicycle Crunch",
              "sets": 3,
              "reps": "20"
            }
          ]
        },
        {
          "day": "Day 5",
          "name": "Arms + Conditioning",
          "focus": "Arms + Conditioning",
          "exercises": [
            {
              "name": "Barbell Curl",
              "sets": 4,
              "reps": "8–12"
            },
            {
              "name": "EZ Bar Skullcrusher",
              "sets": 4,
              "reps": "8–12"
            },
            {
              "name": "Alternating Battle Rope",
              "sets": 3,
              "reps": "30 sec"
            },
            {
              "name": "Tricep Pushdown",
              "sets": 3,
              "reps": "10–15"
            },
            {
              "name": "Farmer's Carry",
              "sets": 3,
              "reps": "30 yds"
            }
          ]
        },
        {
          "day": "Day 6",
          "name": "Active Recovery",
          "focus": "Active Recovery",
          "exercises": [
            {
              "name": "Light cardio / mobility",
              "sets": 1,
              "reps": "20–30 min"
            }
          ]
        },
        {
          "day": "Day 7",
          "name": "Rest",
          "focus": "Rest",
          "exercises": [
            {
              "name": "Complete rest",
              "sets": 1,
              "reps": "—"
            }
          ]
        }
      ],
      "source": "library",
      "library_id": 11,
      "library_name": "THE FUNCTIONAL STRENGTH SPLIT (2 Muscles Per Day – Athletic Focus)"
    }
  },
  {
    "id": 12,
    "name": "THE MINIMALIST PLAN (1–2 Muscles Per Day – Only 5 Exercises Per Day)",
    "blurb": "For busy individuals who want maximum results with minimum time.",
    "plan": {
      "goal": "Minimalist Plan",
      "days_per_week": 5,
      "days": [
        {
          "day": "Day 1",
          "name": "Chest + Triceps",
          "focus": "Chest + Triceps",
          "exercises": [
            {
              "name": "Barbell Bench Press",
              "sets": 4,
              "reps": "8–10"
            },
            {
              "name": "Dumbbell Incline Bench Press",
              "sets": 3,
              "reps": "10–12"
            },
            {
              "name": "Chest Dip",
              "sets": 3,
              "reps": "8–12"
            },
            {
              "name": "Tricep Pushdown",
              "sets": 3,
              "reps": "10–15"
            },
            {
              "name": "Push Up",
              "sets": 2,
              "reps": "AMRAP"
            }
          ]
        },
        {
          "day": "Day 2",
          "name": "Back + Biceps",
          "focus": "Back + Biceps",
          "exercises": [
            {
              "name": "Deadlift",
              "sets": 4,
              "reps": "5"
            },
            {
              "name": "Pull Up",
              "sets": 4,
              "reps": "6–10"
            },
            {
              "name": "Barbell Row",
              "sets": 3,
              "reps": "8–12"
            },
            {
              "name": "Barbell Curl",
              "sets": 3,
              "reps": "10–12"
            },
            {
              "name": "Cable Face Pull",
              "sets": 3,
              "reps": "15–20"
            }
          ]
        },
        {
          "day": "Day 3",
          "name": "Shoulders + Traps",
          "focus": "Shoulders + Traps",
          "exercises": [
            {
              "name": "Barbell Shoulder Press",
              "sets": 4,
              "reps": "6–10"
            },
            {
              "name": "Dumbbell Lateral Raise",
              "sets": 4,
              "reps": "10–15"
            },
            {
              "name": "Barbell Shrug",
              "sets": 3,
              "reps": "10–12"
            },
            {
              "name": "Cable Reverse Fly",
              "sets": 3,
              "reps": "12–15"
            }
          ]
        },
        {
          "day": "Day 4",
          "name": "Legs",
          "focus": "Legs",
          "exercises": [
            {
              "name": "Back Squat",
              "sets": 4,
              "reps": "6–10"
            },
            {
              "name": "Barbell Romanian Deadlift",
              "sets": 3,
              "reps": "8–12"
            },
            {
              "name": "Leg Press",
              "sets": 3,
              "reps": "10–15"
            },
            {
              "name": "Seated Leg Curl",
              "sets": 3,
              "reps": "12–15"
            },
            {
              "name": "Calf Raise",
              "sets": 4,
              "reps": "15–20"
            }
          ]
        },
        {
          "day": "Day 5",
          "name": "Arms",
          "focus": "Arms",
          "exercises": [
            {
              "name": "Barbell Curl",
              "sets": 4,
              "reps": "8–12"
            },
            {
              "name": "EZ Bar Skullcrusher",
              "sets": 4,
              "reps": "8–12"
            },
            {
              "name": "Hammer Curls",
              "sets": 3,
              "reps": "10–15"
            },
            {
              "name": "Tricep Pushdown",
              "sets": 3,
              "reps": "10–15"
            }
          ]
        },
        {
          "day": "Day 6",
          "name": "Active Recovery",
          "focus": "Active Recovery",
          "exercises": [
            {
              "name": "Light cardio / stretching",
              "sets": 1,
              "reps": "20–30 min"
            }
          ]
        },
        {
          "day": "Day 7",
          "name": "Rest",
          "focus": "Rest",
          "exercises": [
            {
              "name": "Complete rest",
              "sets": 1,
              "reps": "—"
            }
          ]
        }
      ],
      "source": "library",
      "library_id": 12,
      "library_name": "THE MINIMALIST PLAN (1–2 Muscles Per Day – Only 5 Exercises Per Day)"
    }
  },
  {
    "id": 13,
    "name": "THE MR. OLYMPIA-INSPIRED SPLIT (1 Muscle Per Day – High Intensity)",
    "blurb": "Based on principles used by champions—high volume, heavy weight, and intensity.",
    "plan": {
      "goal": "Mr. Olympia-Inspired Split",
      "days_per_week": 5,
      "days": [
        {
          "day": "Day 1",
          "name": "Chest",
          "focus": "Chest",
          "exercises": [
            {
              "name": "Barbell Bench Press",
              "sets": 5,
              "reps": "6–10"
            },
            {
              "name": "Dumbbell Incline Bench Press",
              "sets": 5,
              "reps": "8–12"
            },
            {
              "name": "Cable Crossover Fly",
              "sets": 4,
              "reps": "12–15"
            },
            {
              "name": "Chest Dip",
              "sets": 4,
              "reps": "8–12"
            },
            {
              "name": "Push Up",
              "sets": 3,
              "reps": "AMRAP"
            }
          ]
        },
        {
          "day": "Day 2",
          "name": "Back",
          "focus": "Back",
          "exercises": [
            {
              "name": "Deadlift",
              "sets": 5,
              "reps": "3–5"
            },
            {
              "name": "Pull Up",
              "sets": 5,
              "reps": "6–10"
            },
            {
              "name": "T Bar Row",
              "sets": 5,
              "reps": "8–12"
            },
            {
              "name": "Lat Pulldown",
              "sets": 4,
              "reps": "10–12"
            },
            {
              "name": "Cable Face Pull",
              "sets": 4,
              "reps": "15–20"
            }
          ]
        },
        {
          "day": "Day 3",
          "name": "Shoulders",
          "focus": "Shoulders",
          "exercises": [
            {
              "name": "Barbell Shoulder Press",
              "sets": 5,
              "reps": "6–10"
            },
            {
              "name": "Dumbbell Lateral Raise",
              "sets": 5,
              "reps": "10–15"
            },
            {
              "name": "Dumbbell Front Raise",
              "sets": 4,
              "reps": "10–15"
            },
            {
              "name": "Cable Reverse Fly",
              "sets": 4,
              "reps": "12–15"
            },
            {
              "name": "Dumbbell Shrug",
              "sets": 5,
              "reps": "10–12"
            }
          ]
        },
        {
          "day": "Day 4",
          "name": "Legs",
          "focus": "Legs",
          "exercises": [
            {
              "name": "Back Squat",
              "sets": 5,
              "reps": "6–10"
            },
            {
              "name": "Barbell Romanian Deadlift",
              "sets": 5,
              "reps": "8–12"
            },
            {
              "name": "Leg Press",
              "sets": 5,
              "reps": "10–15"
            },
            {
              "name": "Seated Leg Curl",
              "sets": 4,
              "reps": "12–15"
            },
            {
              "name": "Leg Extension",
              "sets": 4,
              "reps": "12–15"
            },
            {
              "name": "Calf Raise",
              "sets": 5,
              "reps": "15–20"
            }
          ]
        },
        {
          "day": "Day 5",
          "name": "Arms",
          "focus": "Arms",
          "exercises": [
            {
              "name": "Barbell Curl",
              "sets": 5,
              "reps": "8–12"
            },
            {
              "name": "EZ Bar Skullcrusher",
              "sets": 5,
              "reps": "8–12"
            },
            {
              "name": "Preacher Curl",
              "sets": 4,
              "reps": "10–12"
            },
            {
              "name": "Tricep Pushdown",
              "sets": 4,
              "reps": "10–15"
            },
            {
              "name": "Dumbbell Concentration Curl",
              "sets": 4,
              "reps": "10–12"
            }
          ]
        },
        {
          "day": "Day 6",
          "name": "Active Recovery",
          "focus": "Active Recovery",
          "exercises": [
            {
              "name": "Light cardio / stretching",
              "sets": 1,
              "reps": "20–30 min"
            }
          ]
        },
        {
          "day": "Day 7",
          "name": "Rest",
          "focus": "Rest",
          "exercises": [
            {
              "name": "Complete rest",
              "sets": 1,
              "reps": "—"
            }
          ]
        }
      ],
      "source": "library",
      "library_id": 13,
      "library_name": "THE MR. OLYMPIA-INSPIRED SPLIT (1 Muscle Per Day – High Intensity)"
    }
  },
  {
    "id": 14,
    "name": "THE BODYWEIGHT + WEIGHTS HYBRID (2 Muscles Per Day)",
    "blurb": "Combines calisthenics with free weights for a balanced physique.",
    "plan": {
      "goal": "Bodyweight + Weights Hybrid",
      "days_per_week": 5,
      "days": [
        {
          "day": "Day 1",
          "name": "Chest + Triceps",
          "focus": "Chest + Triceps",
          "exercises": [
            {
              "name": "Barbell Bench Press",
              "sets": 4,
              "reps": "8–10"
            },
            {
              "name": "Dumbbell Incline Bench Press",
              "sets": 4,
              "reps": "8–12"
            },
            {
              "name": "Wide Push Up",
              "sets": 3,
              "reps": "15–20"
            },
            {
              "name": "Chest Dip",
              "sets": 3,
              "reps": "10–15"
            },
            {
              "name": "Tricep Pushdown",
              "sets": 3,
              "reps": "10–15"
            }
          ]
        },
        {
          "day": "Day 2",
          "name": "Back + Biceps",
          "focus": "Back + Biceps",
          "exercises": [
            {
              "name": "Pull Up",
              "sets": 4,
              "reps": "6–10"
            },
            {
              "name": "Barbell Row",
              "sets": 4,
              "reps": "8–12"
            },
            {
              "name": "Inverted Row",
              "sets": 3,
              "reps": "12–15"
            },
            {
              "name": "Barbell Curl",
              "sets": 4,
              "reps": "10–12"
            },
            {
              "name": "Chin Up",
              "sets": 3,
              "reps": "8–12"
            }
          ]
        },
        {
          "day": "Day 3",
          "name": "Shoulders + Traps",
          "focus": "Shoulders + Traps",
          "exercises": [
            {
              "name": "Barbell Shoulder Press",
              "sets": 4,
              "reps": "6–10"
            },
            {
              "name": "Handstand Push-ups (assisted)",
              "sets": 3,
              "reps": "5–10"
            },
            {
              "name": "Dumbbell Lateral Raise",
              "sets": 4,
              "reps": "10–15"
            },
            {
              "name": "Pike Push Up",
              "sets": 3,
              "reps": "12–15"
            },
            {
              "name": "Dumbbell Shrug",
              "sets": 4,
              "reps": "10–12"
            }
          ]
        },
        {
          "day": "Day 4",
          "name": "Legs",
          "focus": "Legs",
          "exercises": [
            {
              "name": "Back Squat",
              "sets": 4,
              "reps": "6–10"
            },
            {
              "name": "Barbell Romanian Deadlift",
              "sets": 4,
              "reps": "8–12"
            },
            {
              "name": "TRX Pistol Squat",
              "sets": 3,
              "reps": "5–10"
            },
            {
              "name": "Leg Press",
              "sets": 4,
              "reps": "10–15"
            },
            {
              "name": "Calf Raise",
              "sets": 4,
              "reps": "15–20"
            }
          ]
        },
        {
          "day": "Day 5",
          "name": "Arms + Core",
          "focus": "Arms + Core",
          "exercises": [
            {
              "name": "Barbell Curl",
              "sets": 4,
              "reps": "8–12"
            },
            {
              "name": "EZ Bar Skullcrusher",
              "sets": 4,
              "reps": "8–12"
            },
            {
              "name": "Tricep Dip",
              "sets": 3,
              "reps": "12–15"
            },
            {
              "name": "Plank",
              "sets": 3,
              "reps": "60 sec"
            },
            {
              "name": "Leg Raise",
              "sets": 3,
              "reps": "15–20"
            }
          ]
        },
        {
          "day": "Day 6",
          "name": "Active Recovery",
          "focus": "Active Recovery",
          "exercises": [
            {
              "name": "Light cardio / mobility",
              "sets": 1,
              "reps": "20–30 min"
            }
          ]
        },
        {
          "day": "Day 7",
          "name": "Rest",
          "focus": "Rest",
          "exercises": [
            {
              "name": "Complete rest",
              "sets": 1,
              "reps": "—"
            }
          ]
        }
      ],
      "source": "library",
      "library_id": 14,
      "library_name": "THE BODYWEIGHT + WEIGHTS HYBRID (2 Muscles Per Day)"
    }
  },
  {
    "id": 15,
    "name": "THE FINAL CUT – DEFINITION & CONDITIONING (2–3 Muscles Per Day)",
    "blurb": "Higher reps, shorter rest, and supersets for a shredded, conditioned look.",
    "plan": {
      "goal": "Final Cut – Definition & Conditioning",
      "days_per_week": 5,
      "days": [
        {
          "day": "Day 1",
          "name": "Chest + Shoulders",
          "focus": "Chest + Shoulders",
          "exercises": [
            {
              "name": "Barbell Bench Press",
              "sets": 4,
              "reps": "12–15"
            },
            {
              "name": "Dumbbell Incline Bench Press",
              "sets": 4,
              "reps": "12–15"
            },
            {
              "name": "Cable Crossover Fly",
              "sets": 3,
              "reps": "15–20"
            },
            {
              "name": "Dumbbell Lateral Raise",
              "sets": 4,
              "reps": "15–20"
            },
            {
              "name": "Dumbbell Front Raise",
              "sets": 3,
              "reps": "15–20"
            }
          ]
        },
        {
          "day": "Day 2",
          "name": "Back + Biceps",
          "focus": "Back + Biceps",
          "exercises": [
            {
              "name": "Lat Pulldown",
              "sets": 4,
              "reps": "12–15"
            },
            {
              "name": "Cable Row",
              "sets": 4,
              "reps": "12–15"
            },
            {
              "name": "Dumbbell Row",
              "sets": 4,
              "reps": "12–15"
            },
            {
              "name": "Barbell Curl",
              "sets": 4,
              "reps": "12–15"
            },
            {
              "name": "Hammer Curls",
              "sets": 3,
              "reps": "15–20"
            }
          ]
        },
        {
          "day": "Day 3",
          "name": "Legs",
          "focus": "Legs",
          "exercises": [
            {
              "name": "Back Squat",
              "sets": 4,
              "reps": "12–15"
            },
            {
              "name": "Leg Press",
              "sets": 4,
              "reps": "15–20"
            },
            {
              "name": "Barbell Romanian Deadlift",
              "sets": 4,
              "reps": "12–15"
            },
            {
              "name": "Seated Leg Curl",
              "sets": 4,
              "reps": "15–20"
            },
            {
              "name": "Calf Raise",
              "sets": 5,
              "reps": "20–25"
            }
          ]
        },
        {
          "day": "Day 4",
          "name": "Arms + Core",
          "focus": "Arms + Core",
          "exercises": [
            {
              "name": "Barbell Curl",
              "sets": 4,
              "reps": "12–15"
            },
            {
              "name": "EZ Bar Skullcrusher",
              "sets": 4,
              "reps": "12–15"
            },
            {
              "name": "Tricep Pushdown",
              "sets": 4,
              "reps": "15–20"
            },
            {
              "name": "Rope Crunch",
              "sets": 4,
              "reps": "15–20"
            },
            {
              "name": "Leg Raise",
              "sets": 4,
              "reps": "15–20"
            }
          ]
        },
        {
          "day": "Day 5",
          "name": "Full Body (Circuit)",
          "focus": "Full Body (Circuit)",
          "exercises": [
            {
              "name": "Back Squat",
              "sets": 3,
              "reps": "15–20"
            },
            {
              "name": "Pull Up",
              "sets": 3,
              "reps": "10–15"
            },
            {
              "name": "Barbell Bench Press",
              "sets": 3,
              "reps": "15–20"
            },
            {
              "name": "Barbell Shoulder Press",
              "sets": 3,
              "reps": "15–20"
            },
            {
              "name": "Barbell Curl",
              "sets": 3,
              "reps": "15–20"
            },
            {
              "name": "Plank",
              "sets": 3,
              "reps": "60 sec"
            }
          ]
        },
        {
          "day": "Day 6",
          "name": "Active Recovery",
          "focus": "Active Recovery",
          "exercises": [
            {
              "name": "Light cardio / stretching",
              "sets": 1,
              "reps": "20–30 min"
            }
          ]
        },
        {
          "day": "Day 7",
          "name": "Rest",
          "focus": "Rest",
          "exercises": [
            {
              "name": "Complete rest",
              "sets": 1,
              "reps": "—"
            }
          ]
        }
      ],
      "source": "library",
      "library_id": 15,
      "library_name": "THE FINAL CUT – DEFINITION & CONDITIONING (2–3 Muscles Per Day)"
    }
  }
];
