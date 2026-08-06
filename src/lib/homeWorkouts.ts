export interface WorkoutExercise {
  name: string;
  sets: string;
}

export interface HomeWorkoutRoutine {
  name: string;
  exercises: WorkoutExercise[];
}

export const HOME_WORKOUTS: HomeWorkoutRoutine[] = [
  {
    name: "Full Body Burn",
    exercises: [
      { name: "Warm Up", sets: "1 set" },
      { name: "Burpee", sets: "2 sets" },
      { name: "High Knees", sets: "2 sets" },
      { name: "Jump Squat", sets: "2 sets" },
      { name: "Mountain Climber", sets: "2 sets" },
      { name: "Kneeling Push Up", sets: "2 sets" },
    ]
  },
  {
    name: "High-Intensity Blast",
    exercises: [
      { name: "Warm Up", sets: "1 set" },
      { name: "Jumping Jack", sets: "3 sets" },
      { name: "Flutter Kicks", sets: "3 sets" },
      { name: "Frog Jumps", sets: "3 sets" },
      { name: "High Knee Skips", sets: "3 sets" },
    ]
  },
  {
    name: "No Equipment Lower Body",
    exercises: [
      { name: "Warm Up", sets: "1 set" },
      { name: "Bulgarian Split Squat", sets: "3 sets" },
      { name: "Nordic Hamstrings Curls", sets: "3 sets" },
      { name: "Squat (Bodyweight)", sets: "3 sets" },
      { name: "Reverse Lunge", sets: "3 sets" },
    ]
  },
  {
    name: "Explosive HIIT Workout",
    exercises: [
      { name: "Warm Up", sets: "1 set" },
      { name: "Box Jump", sets: "3 sets" },
      { name: "Clap Push Ups", sets: "3 sets" },
      { name: "Single Leg Glute Bridge", sets: "3 sets" },
      { name: "Mountain Climber", sets: "3 sets" },
      { name: "Jumping Lunge", sets: "3 sets" },
    ]
  },
  {
    name: "Push-up Routine",
    exercises: [
      { name: "Warm Up", sets: "1 set" },
      { name: "Decline Push Up", sets: "3 sets" },
      { name: "Pike Pushup", sets: "3 sets" },
      { name: "Push Up - Close Grip", sets: "3 sets" },
      { name: "Push Up", sets: "3 sets" },
      { name: "Incline Push Ups", sets: "2 sets" },
    ]
  },
  {
    name: "Home Pull Workout",
    exercises: [
      { name: "Warm Up", sets: "1 set" },
      { name: "Negative Pull Up", sets: "3 sets" },
      { name: "Bent Over Row (Dumbbell)", sets: "3 sets, 10-12 reps" },
      { name: "Lat Pulldown (Band)", sets: "3 sets, 15-20 reps" },
      { name: "Shrug (Dumbbell)", sets: "3 sets, 12-15 reps" },
      { name: "Bicep Curl (Dumbbell)", sets: "3 sets, 15-20 reps" },
    ]
  },
  {
    name: "At Home Routines (Exercise List)",
    exercises: [
      { name: "Warm Up", sets: "1 set" },
      { name: "Push Up", sets: "3 sets" },
      { name: "Inverted Row", sets: "3 sets" },
      { name: "Shoulder Press (Dumbbell)", sets: "3 sets, 12-15 reps" },
      { name: "Bicep Curl (Dumbbell)", sets: "3 sets, 15-20 reps" },
      { name: "Bench Dip", sets: "3 sets" },
    ]
  },
  {
    name: "At Home Routines (Exercise List - Alternative)",
    exercises: [
      { name: "Warm Up", sets: "1 set" },
      { name: "Pike Pushup", sets: "3 sets" },
      { name: "Bulgarian Split Squat", sets: "3 sets" },
      { name: "Push Up", sets: "3 sets" },
      { name: "Inverted Row", sets: "3 sets" },
      { name: "Single Leg Hip Thrust", sets: "3 sets" },
      { name: "Lat Pulldown (Band)", sets: "3 sets" },
      { name: "Hammer Curl (Band)", sets: "2 sets, 15-20 reps" },
      { name: "Bench Dip", sets: "3 sets" },
    ]
  },
  {
    name: "Core & Cardio",
    exercises: [
      { name: "Warm Up", sets: "1 set" },
      { name: "Plank Pushup", sets: "3 sets" },
      { name: "Russian Twist (Bodyweight)", sets: "3 sets" },
      { name: "Mountain Climber", sets: "3 sets" },
      { name: "Superman", sets: "3 sets" },
      { name: "High Knees", sets: "3 sets" },
    ]
  },
  {
    name: "Beginner Full Body",
    exercises: [
      { name: "Warm Up", sets: "1 set" },
      { name: "Squat (Bodyweight)", sets: "3 sets, 10-12 reps" },
      { name: "Push Up on Knees", sets: "3 sets, 8-10 reps" },
      { name: "Glute Bridge", sets: "3 sets, 12-15 reps" },
      { name: "Wall Sit", sets: "3 sets, 30 sec" },
      { name: "Plank", sets: "3 sets, 20-30 sec" },
      { name: "Bird Dog", sets: "2 sets, 10 reps/side" },
    ]
  },
  {
    name: "Core Crusher",
    exercises: [
      { name: "Warm Up", sets: "1 set" },
      { name: "Plank", sets: "3 sets, 45 sec" },
      { name: "Bicycle Crunch", sets: "3 sets, 20 reps" },
      { name: "Leg Raise", sets: "3 sets, 12-15 reps" },
      { name: "Side Plank", sets: "3 sets, 30 sec/side" },
      { name: "Reverse Crunch", sets: "3 sets, 15 reps" },
      { name: "Dead Bug", sets: "3 sets, 10 reps/side" },
      { name: "V Up", sets: "2 sets, 10-12 reps" },
    ]
  },
  {
    name: "Dumbbell Upper Body Pump",
    exercises: [
      { name: "Warm Up", sets: "1 set" },
      { name: "Dumbbell Bench Press (Floor)", sets: "3 sets, 10-12 reps" },
      { name: "Bent Over Row (Dumbbell)", sets: "3 sets, 10-12 reps" },
      { name: "Shoulder Press (Dumbbell)", sets: "3 sets, 10-12 reps" },
      { name: "Dumbbell Lateral Raise", sets: "3 sets, 12-15 reps" },
      { name: "Bicep Curl (Dumbbell)", sets: "3 sets, 12-15 reps" },
      { name: "Dumbbell Skullcrusher", sets: "3 sets, 10-12 reps" },
    ]
  },
  {
    name: "Dumbbell Leg Day",
    exercises: [
      { name: "Warm Up", sets: "1 set" },
      { name: "Dumbbell Goblet Squat", sets: "4 sets, 10-12 reps" },
      { name: "Dumbbell Romanian Deadlift", sets: "3 sets, 10-12 reps" },
      { name: "Dumbbell Walking Lunge", sets: "3 sets, 10 steps/leg" },
      { name: "Dumbbell Hip Thrust", sets: "3 sets, 12-15 reps" },
      { name: "Dumbbell Calf Raise", sets: "4 sets, 15-20 reps" },
    ]
  },
  {
    name: "Tabata 20 (No Equipment)",
    exercises: [
      { name: "Warm Up", sets: "1 set" },
      { name: "Jump Squat", sets: "8 rounds, 20s on / 10s off" },
      { name: "Push Up", sets: "8 rounds, 20s on / 10s off" },
      { name: "Mountain Climber", sets: "8 rounds, 20s on / 10s off" },
      { name: "Burpee", sets: "8 rounds, 20s on / 10s off" },
      { name: "Cool Down Stretch", sets: "1 set, 3 min" },
    ]
  },
  {
    name: "Morning Mobility (10 min)",
    exercises: [
      { name: "Cat-Cow Stretch", sets: "1 set, 60 sec" },
      { name: "World's Greatest Stretch", sets: "1 set, 5 reps/side" },
      { name: "Hip Circles", sets: "1 set, 10 reps/direction" },
      { name: "Downward Dog to Cobra", sets: "1 set, 8 reps" },
      { name: "Deep Squat Hold", sets: "2 sets, 30 sec" },
      { name: "Shoulder Pass Through", sets: "1 set, 10 reps" },
      { name: "Neck Rolls", sets: "1 set, 5 reps/direction" },
    ]
  }
];
