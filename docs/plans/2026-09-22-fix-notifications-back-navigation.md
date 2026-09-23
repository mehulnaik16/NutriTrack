# Fix Notifications Back-Navigation Loop Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Eliminate the infinite navigation loop between `/profile` and `/notifications` by using router history popping with a safe fallback instead of pushing new route entries.

**Architecture:** Replace the hardcoded `navigate({ to: "/profile" })` push in `src/routes/notifications.tsx` with a standard `router.history.back()` call that pops the route off the browser stack. If no previous entry exists in the current session (direct link), safely fall back to `navigate({ to: "/profile", replace: true })`.

**Tech Stack:** React 19, TypeScript, TanStack Router (`useRouter`, `useNavigate`).

---

### Task 1: Update Back Navigation in Notifications Page

**Files:**
- Modify: `src/routes/notifications.tsx`

**Step 1: Inspect and trace the navigation handler**
Verify imports in `src/routes/notifications.tsx`:
```tsx
import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
```

**Step 2: Add resilient `goBack` function**
```tsx
const router = useRouter();
const goBack = () => {
  if (typeof window !== "undefined" && window.history.length > 1) {
    router.history.back();
  } else {
    navigate({ to: "/profile", replace: true });
  }
};
```

**Step 3: Update header back button**
In the header:
```tsx
<Button
  variant="ghost"
  size="icon"
  onClick={goBack}
  aria-label="Back to profile"
>
  <ArrowLeft className="h-5 w-5" />
</Button>
```

**Step 4: Typecheck and verification**
Run: `npx tsc --noEmit`
Expected: Zero errors in `src/routes/notifications.tsx`.

**Step 5: Verify on localhost**
1. Open `http://localhost:8080/profile`.
2. Click the "Notifications" category card.
3. On `/notifications`, click the back button (`<ArrowLeft />`).
4. Confirm you are back on `/profile`.
5. On `/profile`, click the back button again.
6. Confirm it navigates to the previous page (e.g. `/dashboard` or home), NOT back into `/notifications`.
