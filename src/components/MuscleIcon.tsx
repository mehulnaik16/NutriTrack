import { MUSCLE_EMOJI, MUSCLE_IMG, type StandardMuscle } from "@/lib/musclePlan";

/**
 * Small emoji-sized muscle-group icon. Renders the anatomy reference image when
 * one exists, else the group's emoji (Rest Day → 😴). Decorative, so aria-hidden.
 */
export function MuscleIcon({
  muscle,
  className = "h-6 w-6",
}: {
  muscle: StandardMuscle;
  className?: string;
}) {
  const src = MUSCLE_IMG[muscle];
  if (!src) return <span aria-hidden>{MUSCLE_EMOJI[muscle]}</span>;
  return (
    <img
      src={src}
      alt=""
      aria-hidden
      className={`shrink-0 rounded-md object-cover ${className}`}
    />
  );
}
