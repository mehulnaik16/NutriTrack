/**
 * Pages after the quiz, each with its own line: the intro, "Create an
 * account", the phone page, then the commitment page (not built yet). The quiz
 * keeps its own 6-step line.
 */
export const SIGNUP_PAGES = 4;

/**
 * Back arrow plus a thin line that fills as the user moves through sign-up.
 * After the quiz it also shows "1/4"; the quiz itself hides the count
 * (`showCount={false}`) so nobody counts the questions left.
 */
export function SignupProgress({
  page,
  total = SIGNUP_PAGES,
  showCount = true,
  label,
  onBack,
}: {
  page: number;
  total?: number;
  showCount?: boolean;
  label: string;
  onBack: () => void;
}) {
  return (
    <div className="mb-8 flex items-center gap-3">
      <button
        type="button"
        aria-label="Back"
        className="-ml-2 p-2 text-accent"
        onClick={onBack}
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m15 18-6-6 6-6" />
        </svg>
      </button>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={page}
        className="h-1 flex-1 overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-500"
          style={{ width: `${(page / total) * 100}%` }}
        />
      </div>
      {showCount && (
        <span className="text-sm font-semibold tabular-nums text-muted-foreground">
          {page}/{total}
        </span>
      )}
    </div>
  );
}
