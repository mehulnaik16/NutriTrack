import React from "react";
import { Rocket, Satellite, Radio, Compass, ArrowDown, CheckCircle2 } from "lucide-react";

interface ChandrayaanDescentWidgetProps {
  currentWeight?: number | null;
  goalWeight?: number | null;
  weightDiff?: number | null;
  unit?: string;
}

export function ChandrayaanDescentWidget({
  currentWeight,
  goalWeight,
  weightDiff,
  unit = "kg",
}: ChandrayaanDescentWidgetProps) {
  const cur = currentWeight ? Number(currentWeight) : 75.0;
  const goal = goalWeight ? Number(goalWeight) : 70.0;
  const delta = currentWeight && goalWeight ? Number((cur - goal).toFixed(1)) : null;

  // Calculate descent ratio (0 = high orbit LOI, 1 = touchdown at target)
  // Assume a typical journey might span 10kg delta
  let descentProgress = 0.5;
  if (goalWeight && currentWeight) {
    if (cur <= goal) {
      descentProgress = 1.0;
    } else {
      // e.g. 5kg away -> 0.5; 10kg away -> 0.1
      const remaining = cur - goal;
      descentProgress = Math.max(0.08, Math.min(0.95, 1 - remaining / 12));
    }
  }

  // Curve coordinates: M 40 45 Q 160 65 310 165
  // Parametric quadratic bezier: B(t) = (1-t)^2*P0 + 2(1-t)t*P1 + t^2*P2
  const p0 = { x: 40, y: 45 };
  const p1 = { x: 170, y: 65 };
  const p2 = { x: 305, y: 155 };

  const t = descentProgress;
  const landerX =
    Math.pow(1 - t, 2) * p0.x + 2 * (1 - t) * t * p1.x + Math.pow(t, 2) * p2.x;
  const landerY =
    Math.pow(1 - t, 2) * p0.y + 2 * (1 - t) * t * p1.y + Math.pow(t, 2) * p2.y;

  return (
    <div className="relative overflow-hidden rounded-xl border border-[#25334a] bg-gradient-to-b from-[#0e1626] via-[#090d18] to-[#060810] text-[#f8fafc] p-4 sm:p-5 shadow-2xl mb-6">
      {/* Top Aerospace Status Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1c293d] pb-3 mb-3">
        <div className="flex items-center gap-2.5">
          {/* Mini Indian Tricolor Indicator */}
          <div className="flex flex-col h-3.5 w-4 rounded-xs overflow-hidden border border-[#334155]">
            <div className="h-1/3 bg-[#FF671F]" />
            <div className="h-1/3 bg-white flex items-center justify-center">
              <div className="h-1 w-1 rounded-full bg-[#000080]" />
            </div>
            <div className="h-1/3 bg-[#046A38]" />
          </div>
          <div>
            <span className="font-mono text-[10px] font-bold tracking-widest text-[#FF671F] uppercase">
              ISTRAC // MOX-2 BENGALURU
            </span>
            <h3 className="font-['Space_Grotesk',sans-serif] text-sm font-bold tracking-wide text-white flex items-center gap-1.5">
              CHANDRAYAAN-3 LUNAR DESCENT TELEMETRY
            </h3>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#101b2e] border border-[#1e3a5f] text-[10px] font-mono text-[#10B981]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#10B981] animate-ping" />
            <span>S-BAND: LOCKED</span>
          </div>
          <div className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded bg-[#162033] text-[10px] font-mono text-muted-foreground">
            <Radio className="h-3 w-3 text-[#FF671F]" />
            <span>MET: T+NOMINAL</span>
          </div>
        </div>
      </div>

      {/* Trajectory Canvas SVG */}
      <div className="w-full flex justify-center">
        <svg
          viewBox="0 0 360 200"
          className="w-full max-w-[500px] select-none overflow-visible"
        >
          <defs>
            <linearGradient id="orbitPathGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#FF671F" />
              <stop offset="60%" stopColor="#FBBF24" />
              <stop offset="100%" stopColor="#10B981" />
            </linearGradient>

            <linearGradient id="lunarSurfaceGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#334155" />
              <stop offset="30%" stopColor="#1e293b" />
              <stop offset="100%" stopColor="#0f172a" />
            </linearGradient>

            <radialGradient id="touchdownGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#10B981" stopOpacity="0.7" />
              <stop offset="100%" stopColor="#10B981" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Starfield / Deep Space subtle dots */}
          {[
            { cx: 20, cy: 20, r: 0.8 },
            { cx: 90, cy: 15, r: 0.7 },
            { cx: 160, cy: 25, r: 0.9 },
            { cx: 240, cy: 18, r: 0.6 },
            { cx: 330, cy: 30, r: 0.8 },
            { cx: 70, cy: 75, r: 0.5 },
            { cx: 130, cy: 90, r: 0.7 },
            { cx: 210, cy: 60, r: 0.8 },
          ].map((s, idx) => (
            <circle key={idx} cx={s.cx} cy={s.cy} r={s.r} fill="#94a3b8" opacity="0.6" />
          ))}

          {/* Lunar South Pole Curved Surface */}
          <path
            d="M -10 185 Q 180 160 370 185 L 370 210 L -10 210 Z"
            fill="url(#lunarSurfaceGrad)"
            stroke="#475569"
            strokeWidth="1"
          />

          {/* Lunar surface craters */}
          <ellipse cx="80" cy="184" rx="22" ry="4" fill="#1e293b" stroke="#334155" strokeWidth="0.8" />
          <ellipse cx="200" cy="180" rx="16" ry="3" fill="#1e293b" stroke="#334155" strokeWidth="0.8" />
          <ellipse cx="320" cy="187" rx="28" ry="4" fill="#1e293b" stroke="#334155" strokeWidth="0.8" />

          {/* Shiv Shakti Point Landing Beacon Marker */}
          <circle cx={p2.x} cy={p2.y + 22} r="14" fill="url(#touchdownGlow)" />
          <circle cx={p2.x} cy={p2.y + 22} r="3" fill="#10B981" />
          <line
            x1={p2.x}
            y1={p2.y + 22}
            x2={p2.x}
            y2={p2.y + 8}
            stroke="#10B981"
            strokeWidth="1.2"
            strokeDasharray="2 2"
          />
          <text
            x={p2.x}
            y={196}
            textAnchor="middle"
            fill="#10B981"
            fontSize="6"
            fontFamily="Space Grotesk, sans-serif"
            fontWeight="bold"
            letterSpacing="0.05em"
          >
            SHIV SHAKTI POINT ({goal} {unit})
          </text>

          {/* Descent Trajectory Curve */}
          <path
            d={`M ${p0.x} ${p0.y} Q ${p1.x} ${p1.y} ${p2.x} ${p2.y}`}
            fill="none"
            stroke="url(#orbitPathGrad)"
            strokeWidth="2.5"
            strokeDasharray="4 2"
          />

          {/* Phase Waypoint 1: LOI (Lunar Orbit Insertion) */}
          <circle cx={p0.x} cy={p0.y} r="3.5" fill="#FF671F" stroke="#080C16" strokeWidth="1.5" />
          <text
            x={p0.x}
            y={p0.y - 8}
            textAnchor="middle"
            fill="#FF671F"
            fontSize="6.5"
            fontFamily="monospace"
            fontWeight="bold"
          >
            LOI-1
          </text>

          {/* Phase Waypoint 2: Rough Braking Phase */}
          <circle cx={145} cy={60} r="3" fill="#FBBF24" stroke="#080C16" strokeWidth="1.5" />
          <text
            x={145}
            y={52}
            textAnchor="middle"
            fill="#FBBF24"
            fontSize="6"
            fontFamily="monospace"
          >
            ROUGH BRAKE
          </text>

          {/* Phase Waypoint 3: Fine Braking Phase */}
          <circle cx={225} cy={95} r="3" fill="#38BDF8" stroke="#080C16" strokeWidth="1.5" />
          <text
            x={225}
            y={88}
            textAnchor="middle"
            fill="#38BDF8"
            fontSize="6"
            fontFamily="monospace"
          >
            FINE BRAKE
          </text>

          {/* Vikram Lander Icon at Current Payload Mass Position */}
          <g
            className="transition-all duration-700 ease-out"
            style={{ transform: `translate(${landerX}px, ${landerY}px)` }}
          >
            {/* Thruster exhaust plume */}
            <polygon
              points="-3,14 0,22 3,14"
              fill="#FF671F"
              opacity="0.9"
              className="animate-pulse"
            />
            <polygon
              points="-1.5,14 0,19 1.5,14"
              fill="#FBBF24"
              opacity="0.9"
            />

            {/* Vikram Lander Body (Golden Multi-Layer Insulation Foil) */}
            <polygon
              points="-9,5 -6,-7 6,-7 9,5 7,14 -7,14"
              fill="#F59E0B"
              stroke="#D97706"
              strokeWidth="0.8"
            />

            {/* Top Instrument Dome / Avionics */}
            <rect
              x="-4"
              y="-10"
              width="8"
              height="3.5"
              rx="1"
              fill="#E2E8F0"
              stroke="#64748B"
              strokeWidth="0.5"
            />

            {/* High Gain Communication Antenna Dish */}
            <circle cx="0" cy="-12" r="2.5" fill="#38BDF8" />
            <line x1="0" y1="-10" x2="0" y2="-14" stroke="#38BDF8" strokeWidth="0.8" />

            {/* Solar Panels (Wings) */}
            <rect x="-14" y="-2" width="5" height="10" rx="0.5" fill="#1E3A8A" stroke="#3B82F6" strokeWidth="0.5" />
            <rect x="9" y="-2" width="5" height="10" rx="0.5" fill="#1E3A8A" stroke="#3B82F6" strokeWidth="0.5" />

            {/* 4 Landing Legs & Footpads */}
            <line x1="-7" y1="12" x2="-12" y2="18" stroke="#94A3B8" strokeWidth="1.2" />
            <line x1="-14" y1="18" x2="-10" y2="18" stroke="#CBD5E1" strokeWidth="1.5" />

            <line x1="7" y1="12" x2="12" y2="18" stroke="#94A3B8" strokeWidth="1.2" />
            <line x1="10" y1="18" x2="14" y2="18" stroke="#CBD5E1" strokeWidth="1.5" />

            {/* Stamped Live Payload Mass Badge above lander */}
            <rect
              x="-24"
              y="-27"
              width="48"
              height="12"
              rx="2.5"
              fill="#080C16"
              stroke="#FF671F"
              strokeWidth="1"
            />
            <text
              x="0"
              y="-18.5"
              textAnchor="middle"
              fill="#FFFFFF"
              fontSize="7"
              fontFamily="monospace"
              fontWeight="bold"
            >
              {cur ? `${cur} ${unit}` : "--"}
            </text>
          </g>
        </svg>
      </div>

      {/* ISRO Flight Telemetry Readouts / Altimeter Metrics */}
      <div className="grid grid-cols-3 gap-2 border-t border-[#1c293d] pt-3 mt-1 text-center">
        {/* Metric 1: Current Payload Mass */}
        <div className="rounded-lg bg-[#0e1726] border border-[#1e2d42] p-2.5">
          <p className="font-mono text-[10px] uppercase font-bold tracking-wider text-[#94a3b8]">
            Payload Mass (Alt)
          </p>
          <div className="flex items-baseline justify-center gap-1 mt-0.5">
            <span className="font-['Share_Tech_Mono',monospace] text-xl font-black text-white">
              {cur ?? "--"}
            </span>
            <span className="text-[10px] font-mono text-[#FF671F] font-semibold">
              {unit}
            </span>
          </div>
          <span className="text-[9px] font-mono text-muted-foreground block mt-0.5">
            {delta !== null && delta <= 0 ? "TOUCHDOWN LOCK" : "DESCENT ACTIVE"}
          </span>
        </div>

        {/* Metric 2: Perigee Target (Goal) */}
        <div className="rounded-lg bg-[#0e1726] border border-[#1e2d42] p-2.5">
          <p className="font-mono text-[10px] uppercase font-bold tracking-wider text-[#94a3b8]">
            Perigee Target
          </p>
          <div className="flex items-baseline justify-center gap-1 mt-0.5">
            <span className="font-['Share_Tech_Mono',monospace] text-xl font-black text-white">
              {goal ?? "--"}
            </span>
            <span className="text-[10px] font-mono text-[#10B981] font-semibold">
              {unit}
            </span>
          </div>
          <span className="text-[9px] font-mono text-[#10B981] block mt-0.5">
            SHIV SHAKTI PT
          </span>
        </div>

        {/* Metric 3: Delta Vector */}
        <div className="rounded-lg bg-[#0e1726] border border-[#1e2d42] p-2.5">
          <p className="font-mono text-[10px] uppercase font-bold tracking-wider text-[#94a3b8]">
            Descent Delta
          </p>
          <div className="flex items-center justify-center gap-1 mt-0.5">
            {delta !== null ? (
              <>
                {delta <= 0 ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-[#10B981]" />
                ) : (
                  <ArrowDown className="h-3.5 w-3.5 text-[#FF671F]" />
                )}
                <span
                  className={`font-['Share_Tech_Mono',monospace] text-lg font-black ${
                    delta <= 0 ? "text-[#10B981]" : "text-[#FF671F]"
                  }`}
                >
                  {Math.abs(delta).toFixed(1)}
                </span>
                <span className="text-[9px] font-mono text-muted-foreground">
                  {unit}
                </span>
              </>
            ) : (
              <span className="font-['Share_Tech_Mono',monospace] text-lg font-black text-muted-foreground">
                --
              </span>
            )}
          </div>
          <span className="text-[9px] font-mono text-muted-foreground block mt-0.5">
            {delta !== null && delta <= 0 ? "TARGET REACHED" : `${Math.abs(delta || 0)} ${unit} REMAIN`}
          </span>
        </div>
      </div>

      {/* Subsystem Status Footer Bar */}
      <div className="mt-3 flex items-center justify-between text-[9px] font-mono text-muted-foreground border-t border-[#162233] pt-2">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-[#FF671F]" />
          4x 800N THROTTLEABLE ENGINES: ACTIVE
        </span>
        <span className="text-[#10B981]">TRAJECTORY: NOMINAL</span>
      </div>
    </div>
  );
}
