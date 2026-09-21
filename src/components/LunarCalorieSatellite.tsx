import { useMemo } from "react";
import { Flame } from "lucide-react";

interface LunarCalorieSatelliteProps {
  totals: {
    calories: number;
    protein?: number;
    carbs?: number;
    fat?: number;
    fiber?: number;
  };
  target: number;
  remaining: number;
}

export function LunarCalorieSatellite({ totals, target, remaining }: LunarCalorieSatelliteProps) {
  const calories = Math.max(0, Math.round(totals.calories || 0));
  const calorieTarget = Math.max(1, target || 2000);
  const ratio = calories / calorieTarget;
  const percentage = Math.round(ratio * 100);
  const isSurplus = ratio > 1.0;
  const surplusPct = Math.round((ratio - 1) * 100);

  // Clamped ratio for positioning along the 360-degree circle (0.0 to 1.0)
  const clampedRatio = Math.min(1, Math.max(0, ratio));

  // Coordinate system (340 x 340 viewBox)
  const cx = 170;
  const cy = 170;
  const moonR = 110; // 1.5x enlarged Moon diameter (220px)
  const orbitR = 138; // Orbital path where Chandrayaan satellite flies

  // Calculate satellite orbit angle:
  // Starts at North (12 o'clock = -90 degrees)
  // Advances clockwise by clampedRatio * 360 degrees
  const angleDeg = -90 + clampedRatio * 360;
  const angleRad = (angleDeg * Math.PI) / 180;

  // Satellite position on the circular orbit track
  const satX = cx + orbitR * Math.cos(angleRad);
  const satY = cy + orbitR * Math.sin(angleRad);

  // Satellite heading (tangent to circle facing clockwise in flight direction)
  const satHeading = angleDeg + 90;

  // Trailing Saffron Laser Trajectory Arc Path:
  // From 12 o'clock (cx, cy - orbitR) = (170, 32) clockwise to (satX, satY)
  const trailPath = useMemo(() => {
    if (clampedRatio <= 0.003) return "";
    if (clampedRatio >= 0.997) {
      // Full complete orbit circle
      return `M ${cx - orbitR} ${cy} A ${orbitR} ${orbitR} 0 1 0 ${cx + orbitR} ${cy} A ${orbitR} ${orbitR} 0 1 0 ${cx - orbitR} ${cy} Z`;
    }
    const startX = cx;
    const startY = cy - orbitR;
    const largeArcFlag = clampedRatio > 0.5 ? 1 : 0;
    return `M ${startX} ${startY} A ${orbitR} ${orbitR} 0 ${largeArcFlag} 1 ${satX.toFixed(2)} ${satY.toFixed(2)}`;
  }, [clampedRatio, cx, cy, orbitR, satX, satY]);

  return (
    <div className="flex flex-col items-center select-none">
      {/* Outer Telemetry Moon & Orbit Frame */}
      <div className="relative h-72 w-72 sm:h-80 sm:w-80 flex items-center justify-center">
        {/* Ambient atmospheric moon glow */}
        <div
          className="pointer-events-none absolute inset-6 rounded-full blur-2xl transition-opacity duration-1000"
          style={{
            background: isSurplus
              ? "radial-gradient(circle, rgba(255,103,31,0.3) 0%, rgba(251,191,36,0.15) 70%, transparent 100%)"
              : `radial-gradient(circle, rgba(56,189,248,0.18) 0%, rgba(255,103,31,${(clampedRatio * 0.22).toFixed(2)}) 70%, transparent 100%)`,
          }}
        />

        {/* SVG Canvas for Moon, Orbit, Trajectory, and Chandrayaan Satellite */}
        <svg
          viewBox="0 0 340 340"
          className="w-full h-full drop-shadow-2xl overflow-visible"
        >
          <defs>
            {/* Moon Image Circular Clip Path */}
            <clipPath id="satellite-moon-clip">
              <circle cx={cx} cy={cy} r={moonR} />
            </clipPath>

            {/* Glowing Laser Trail Filter */}
            <filter id="sat-laser-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>

            {/* Spherical 3D Lighting Overlay for Photographic Moon */}
            <radialGradient id="sat-moon-depth" cx="38%" cy="36%" r="62%">
              <stop offset="65%" stopColor="#ffffff" stopOpacity="0.05" />
              <stop offset="88%" stopColor="#000000" stopOpacity="0.32" />
              <stop offset="100%" stopColor="#000000" stopOpacity="0.75" />
            </radialGradient>

            {/* Saffron Laser Trajectory Gradient */}
            <linearGradient id="sat-laser-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FF671F" />
              <stop offset="65%" stopColor="#FF671F" />
              <stop offset="100%" stopColor="#FBBF24" />
            </linearGradient>

            {/* Gold MLI Foil Texture for Satellite Body */}
            <linearGradient id="sat-gold-foil" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#F59E0B" />
              <stop offset="45%" stopColor="#FBBF24" />
              <stop offset="100%" stopColor="#B45309" />
            </linearGradient>

            {/* Solar Array Blue Cells Gradient */}
            <linearGradient id="sat-solar-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#1E3A8A" />
              <stop offset="40%" stopColor="#2563EB" />
              <stop offset="80%" stopColor="#1D4ED8" />
              <stop offset="100%" stopColor="#172554" />
            </linearGradient>

            {/* Parabolic Dish Antenna Gradient */}
            <linearGradient id="sat-dish-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#F8FAFC" />
              <stop offset="70%" stopColor="#CBD5E1" />
              <stop offset="100%" stopColor="#64748B" />
            </linearGradient>
          </defs>

          {/* =================================================== */}
          {/* ORBITAL TELEMETRY COMPASS (OUTER RETICLE)           */}
          {/* =================================================== */}
          <circle
            cx={cx}
            cy={cy}
            r="162"
            fill="none"
            stroke="#1c293d"
            strokeWidth="1"
            strokeDasharray="3 3"
            opacity="0.7"
          />

          {/* Cardinal Axis Markers */}
          <line x1={cx} y1="4" x2={cx} y2="13" stroke="#FF671F" strokeWidth="1.5" />
          <line x1={cx} y1="327" x2={cx} y2="336" stroke="#38bdf8" strokeWidth="1.5" />
          <line x1="4" y1={cy} x2="13" y2={cy} stroke="#64748b" strokeWidth="1.5" />
          <line x1="327" y1={cy} x2="336" y2={cy} stroke="#64748b" strokeWidth="1.5" />

          <text x={cx} y="11" textAnchor="middle" fill="#FF671F" fontSize="7" fontFamily="monospace" fontWeight="bold">
            000° N
          </text>
          <text x={cx} y="335" textAnchor="middle" fill="#38bdf8" fontSize="7" fontFamily="monospace">
            180° S
          </text>
          <text x="3" y={cy + 2.5} textAnchor="start" fill="#64748b" fontSize="7" fontFamily="monospace">
            270° W
          </text>
          <text x="337" y={cy + 2.5} textAnchor="end" fill="#64748b" fontSize="7" fontFamily="monospace">
            090° E
          </text>

          {/* =================================================== */}
          {/* 1.5x ENLARGED PHOTOGRAPHIC MOON (100% UNOBSTRUCTED) */}
          {/* =================================================== */}
          {/* Soft Atmospheric Backglow */}
          <circle
            cx={cx}
            cy={cy}
            r={moonR + 3}
            fill="none"
            stroke="rgba(56, 189, 248, 0.2)"
            strokeWidth="3"
            filter="blur(3px)"
          />

          {/* High-Resolution Photographic Moon Sphere */}
          <image
            href="/images/moon.jpg"
            x={cx - moonR}
            y={cy - moonR}
            width={moonR * 2}
            height={moonR * 2}
            clipPath="url(#satellite-moon-clip)"
            preserveAspectRatio="xMidYMid slice"
          />

          {/* 3D Depth & Spherical Vignette Overlay */}
          <circle
            cx={cx}
            cy={cy}
            r={moonR}
            fill="url(#sat-moon-depth)"
            pointerEvents="none"
          />

          {/* Subtle Moon Rim Border Ring */}
          <circle
            cx={cx}
            cy={cy}
            r={moonR}
            fill="none"
            stroke="#475569"
            strokeWidth="1"
            opacity="0.65"
            pointerEvents="none"
          />

          {/* =================================================== */}
          {/* SATELLITE ORBIT TRACK & SAFFRON LASER TRAJECTORY    */}
          {/* =================================================== */}
          {/* Dashed Inactive Orbit Guide Track */}
          <circle
            cx={cx}
            cy={cy}
            r={orbitR}
            fill="none"
            stroke="#25334a"
            strokeWidth="1.2"
            strokeDasharray="4 4"
            opacity="0.6"
          />

          {/* Trailing Glowing Saffron Laser Trajectory Arc */}
          {trailPath && (
            <g>
              {/* Outer soft halo */}
              <path
                d={trailPath}
                fill="none"
                stroke="#FF671F"
                strokeWidth="6"
                strokeLinecap="round"
                opacity="0.45"
                filter="url(#sat-laser-glow)"
              />
              {/* Core solid laser beam */}
              <path
                d={trailPath}
                fill="none"
                stroke="url(#sat-laser-grad)"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              {/* Inner telemetry core dash */}
              <path
                d={trailPath}
                fill="none"
                stroke="#ffffff"
                strokeWidth="1"
                strokeDasharray="2 3"
                strokeLinecap="round"
                opacity="0.8"
              />
            </g>
          )}

          {/* Orbital Insertion Point (12 o'clock / 000° N) */}
          <circle cx={cx} cy={cy - orbitR} r="3" fill="#FF671F" />
          <circle cx={cx} cy={cy - orbitR} r="5.5" fill="none" stroke="#FF671F" strokeWidth="1" opacity="0.6" />

          {/* =================================================== */}
          {/* ISRO CHANDRAYAAN ORBITER SATELLITE (VECTOR MODEL)   */}
          {/* Positioned at (satX, satY) facing tangentially      */}
          {/* =================================================== */}
          <g
            transform={`translate(${satX.toFixed(2)}, ${satY.toFixed(2)}) rotate(${satHeading.toFixed(2)})`}
            className="transition-transform duration-500 ease-out cursor-pointer drop-shadow-[0_0_10px_rgba(255,103,31,0.8)]"
          >
            {/* Ion Thruster Particle Exhaust Plume (trailing behind) */}
            <g opacity="0.85">
              <line x1="-14" y1="0" x2="-22" y2="0" stroke="#00F0FF" strokeWidth="2" strokeLinecap="round" opacity="0.9" />
              <line x1="-14" y1="-2" x2="-19" y2="-2" stroke="#FF671F" strokeWidth="1.2" strokeLinecap="round" opacity="0.75" />
              <line x1="-14" y1="2" x2="-19" y2="2" stroke="#FF671F" strokeWidth="1.2" strokeLinecap="round" opacity="0.75" />
              <circle cx="-16" cy="0" r="2.5" fill="#00F0FF" opacity="0.6" filter="blur(1px)" />
            </g>

            {/* Left Solar Panel Wing (Extended Upper) */}
            <g>
              {/* Panel Strut Bracket */}
              <line x1="0" y1="-6" x2="0" y2="-10" stroke="#94A3B8" strokeWidth="1.2" />
              {/* Solar Array Main Body */}
              <rect
                x="-5.5"
                y="-25"
                width="11"
                height="15"
                rx="1"
                fill="url(#sat-solar-grad)"
                stroke="#60A5FA"
                strokeWidth="0.6"
              />
              {/* Photovoltaic Cell Grid Lines */}
              <line x1="-5.5" y1="-20" x2="5.5" y2="-20" stroke="#93C5FD" strokeWidth="0.5" opacity="0.8" />
              <line x1="-5.5" y1="-15" x2="5.5" y2="-15" stroke="#93C5FD" strokeWidth="0.5" opacity="0.8" />
              <line x1="0" y1="-25" x2="0" y2="-10" stroke="#93C5FD" strokeWidth="0.5" opacity="0.8" />
            </g>

            {/* Right Solar Panel Wing (Extended Lower) */}
            <g>
              {/* Panel Strut Bracket */}
              <line x1="0" y1="6" x2="0" y2="10" stroke="#94A3B8" strokeWidth="1.2" />
              {/* Solar Array Main Body */}
              <rect
                x="-5.5"
                y="10"
                width="11"
                height="15"
                rx="1"
                fill="url(#sat-solar-grad)"
                stroke="#60A5FA"
                strokeWidth="0.6"
              />
              {/* Photovoltaic Cell Grid Lines */}
              <line x1="-5.5" y1="15" x2="5.5" y2="15" stroke="#93C5FD" strokeWidth="0.5" opacity="0.8" />
              <line x1="-5.5" y1="20" x2="5.5" y2="20" stroke="#93C5FD" strokeWidth="0.5" opacity="0.8" />
              <line x1="0" y1="10" x2="0" y2="25" stroke="#93C5FD" strokeWidth="0.5" opacity="0.8" />
            </g>

            {/* Main Satellite Bus Chassis (Gold MLI Foil Cube) */}
            <rect
              x="-8"
              y="-7"
              width="16"
              height="14"
              rx="2"
              fill="url(#sat-gold-foil)"
              stroke="#B45309"
              strokeWidth="0.8"
            />

            {/* Foil Thermal Quilting Highlight Lines */}
            <line x1="-8" y1="0" x2="8" y2="0" stroke="#FBBF24" strokeWidth="0.5" opacity="0.7" />
            <line x1="0" y1="-7" x2="0" y2="7" stroke="#FBBF24" strokeWidth="0.5" opacity="0.7" />

            {/* High-Gain Parabolic Communications Dish (Pointing inward toward Moon/Earth) */}
            <g transform="translate(2, -1)">
              {/* Antenna Mast Gimbal */}
              <line x1="4" y1="1" x2="8" y2="2" stroke="#CBD5E1" strokeWidth="1" />
              {/* Parabolic Reflector Dish */}
              <ellipse
                cx="9"
                cy="2"
                rx="3"
                ry="5"
                fill="url(#sat-dish-grad)"
                stroke="#475569"
                strokeWidth="0.5"
                transform="rotate(15 9 2)"
              />
              {/* Sub-reflector Feed Horn */}
              <circle cx="11" cy="2.5" r="0.8" fill="#FF671F" />
            </g>

            {/* Optical Payloads / Star Tracker Sensors (Front edge) */}
            <circle cx="8" cy="-4" r="1.4" fill="#0f172a" stroke="#ffffff" strokeWidth="0.5" />
            <circle cx="8" cy="-4" r="0.6" fill="#00f0ff" />

            {/* Mini Indian Tricolor Indicator on Chassis */}
            <g transform="translate(-5, -4)">
              <rect x="0" y="0" width="4" height="1.2" fill="#FF671F" />
              <rect x="0" y="1.2" width="4" height="1.2" fill="#FFFFFF" />
              <rect x="0" y="2.4" width="4" height="1.2" fill="#046A38" />
            </g>
          </g>
        </svg>
      </div>

      {/* =================================================== */}
      {/* MINIMAL FLOATING TELEMETRY PILL (50% REDUCED TEXT)  */}
      {/* Zero center obstruction on the photographic Moon   */}
      {/* =================================================== */}
      <div className="mt-2 flex flex-col items-center gap-1.5">
        {/* Compact Glass Capsule */}
        <div
          className={`flex items-center gap-2.5 px-4 py-1.5 rounded-full backdrop-blur-md bg-[#080c16]/85 border shadow-xl transition-all duration-300 ${
            isSurplus
              ? "border-[#FF671F]/60 shadow-[0_0_16px_rgba(255,103,31,0.3)]"
              : "border-[#334155]/60 shadow-[0_0_14px_rgba(0,0,0,0.85)]"
          }`}
        >
          {/* Flame Icon */}
          <div className="flex items-center justify-center">
            {isSurplus ? (
              <Flame className="h-4 w-4 text-[#FF671F] animate-bounce drop-shadow-[0_0_6px_rgba(255,103,31,0.8)]" />
            ) : calories > 0 ? (
              <Flame className="h-4 w-4 text-[#FF671F] drop-shadow-[0_0_4px_rgba(255,103,31,0.5)]" />
            ) : (
              <Flame className="h-4 w-4 text-slate-500" />
            )}
          </div>

          {/* Calorie Burn (Cut by 50% from 36px to ~18px / text-lg) */}
          <div className="flex items-baseline gap-1">
            <span className="font-display text-lg sm:text-xl font-bold tracking-tight text-[#F8FAFC]">
              {calories.toLocaleString()}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-wider font-semibold text-[#94a3b8]">
              / {calorieTarget.toLocaleString()} kcal
            </span>
          </div>

          {/* Percentage Tag */}
          <span
            className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded ${
              isSurplus
                ? "bg-[#FF671F]/20 text-[#FF671F]"
                : percentage >= 100
                  ? "bg-emerald-500/20 text-emerald-300"
                  : "bg-sky-500/15 text-sky-300"
            }`}
          >
            {percentage}%
          </span>
        </div>

        {/* Satellite Sub-Telemetry Readout */}
        <div className="text-[10px] font-mono font-semibold tracking-wider">
          {remaining > 0 ? (
            <span className="text-emerald-400">
              ORBITAL DELTA: <span className="font-bold">{Math.round(remaining).toLocaleString()} KCAL</span> REMAINING
            </span>
          ) : remaining === 0 ? (
            <span className="text-emerald-300 font-bold">
              ✓ 100% NOMINAL ORBITAL TARGET ACHIEVED
            </span>
          ) : (
            <span className="text-[#FF671F] font-bold">
              SURPLUS PROP_BURN: +{Math.abs(Math.round(remaining)).toLocaleString()} KCAL
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
