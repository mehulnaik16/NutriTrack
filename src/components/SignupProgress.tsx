/**
 * Pages in sign-up, one line from first to last: the 6 quiz steps, the intro,
 * "Create an account", pricing, then the phone number last. The commitment
 * page (between account and pricing) will make it 11.
 */
export const SIGNUP_PAGES = 10;

/** Page numbers after the quiz, so callers never hard-code a position. */
export const INTRO_PAGE = 7;
export const ACCOUNT_PAGE = 8;
export const PRICING_PAGE = 9;
export const FINAL_QUESTION_PAGE = 10;

/**
 * How full the line is on a page, 0-1. Fast early, slow late: big jumps on
 * the first pages so sign-up feels quick to get through, small ones near the
 * end. With 10 pages: 17, 33, 47, 60, 71, 81, 89, 94, 98, 100 %.
 */
const progressFill = (page: number) =>
  1 - (1 - Math.min(page, SIGNUP_PAGES) / SIGNUP_PAGES) ** 1.8;

/**
 * Back arrow plus a thin line that fills as the user moves through sign-up.
 * No "3/9" count, so nobody counts the pages left.
 */
export function SignupProgress({
  page,
  label,
  onBack,
}: {
  page: number;
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
        aria-valuemax={SIGNUP_PAGES}
        aria-valuenow={page}
        className="h-1 flex-1 overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-500"
          style={{ width: `${progressFill(page) * 100}%` }}
        />
      </div>
    </div>
  );
}
