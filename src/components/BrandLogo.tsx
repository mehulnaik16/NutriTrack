import { useId } from "react";

interface BrandLogoProps {
  className?: string;
  size?: number | string;
}

/**
 * Authentic Dombelz Brand Logo Symbol.
 * Reconstructed with 180° rotational symmetry from the official geometric monogram.
 * Pure SVG vector that takes the active theme color via `currentColor`.
 */
export function BrandLogo({
  className = "h-8 w-8 text-accent",
  size,
}: BrandLogoProps) {
  const maskId = useId();

  return (
    <svg
      viewBox="0 0 100 100"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={size ? { width: size, height: size } : undefined}
      aria-label="Dombelz Logo"
    >
      <defs>
        {/* Punch out the two circular junction notches */}
        <mask id={maskId}>
          <rect width="100" height="100" fill="white" />
          {/* Upper-Right Circular Notch */}
          <circle cx="64.5" cy="35.5" r="5.5" fill="black" />
          {/* Lower-Left Circular Notch */}
          <circle cx="35.5" cy="64.5" r="5.5" fill="black" />
        </mask>
      </defs>

      <g mask={`url(#${maskId})`}>
        {/* ======================================================== */}
        {/* ROW 0 (TOP)                                              */}
        {/* ======================================================== */}
        {/* Tile 1: Top-Left Rounded Horizontal Bar (x: 8-34, y: 8-34) */}
        <rect x="8" y="8" width="26" height="26" rx="8" />

        {/* Tile 2: Top-Center Square (x: 37-63, y: 8-34) */}
        <rect x="37" y="8" width="26" height="26" rx="3" />

        {/* Tile 3: Top-Right Quarter-Circle Arch (x: 66-92, y: 8-34) */}
        <path d="M 66 8 L 68 8 C 81.25 8 92 18.75 92 32 L 92 34 L 66 34 Z" />

        {/* ======================================================== */}
        {/* ROW 1 (MIDDLE)                                           */}
        {/* ======================================================== */}
        {/* Tile 4: Middle-Right Curved Arc (x: 66-92, y: 37-63) */}
        <path d="M 66 37 L 92 37 L 92 39 C 92 52.25 81.25 63 68 63 L 66 63 Z" />

        {/* Tile 5: Center Core Square (x: 37-63, y: 37-63) */}
        <rect x="37" y="37" width="26" height="26" rx="3" />

        {/* Tile 6: Middle-Left Curved Arc (x: 8-34, y: 37-63) - 180° rotation of Tile 4 */}
        <path d="M 34 63 L 8 63 L 8 61 C 8 47.75 18.75 37 32 37 L 34 37 Z" />

        {/* ======================================================== */}
        {/* ROW 2 (BOTTOM)                                           */}
        {/* ======================================================== */}
        {/* Tile 7: Bottom-Left Quarter-Circle Arch (x: 8-34, y: 66-92) - 180° rotation of Tile 3 */}
        <path d="M 34 92 L 32 92 C 18.75 92 8 81.25 8 68 L 8 66 L 34 66 Z" />

        {/* Tile 8: Bottom-Center Square (x: 37-63, y: 66-92) - 180° rotation of Tile 2 */}
        <rect x="37" y="66" width="26" height="26" rx="3" />

        {/* Tile 9: Bottom-Right Rounded Horizontal Bar (x: 66-92, y: 66-92) - 180° rotation of Tile 1 */}
        <rect x="66" y="66" width="26" height="26" rx="8" />
      </g>
    </svg>
  );
}
