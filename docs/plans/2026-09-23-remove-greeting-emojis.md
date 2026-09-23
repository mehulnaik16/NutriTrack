# Remove Greeting Emojis Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Remove the hand waving emoji `👋` from standard page greetings ("Hey, {name}") and the namaste emoji `🙏` from the Hub greeting ("Welcome to Hub, {name}").

**Architecture:** Update greeting template strings in `src/components/Header.tsx` for both desktop and mobile viewports.

**Tech Stack:** React, TypeScript, Vite.

---

### Task 1: Remove greeting emojis in Header component

**Files:**
- Modify: `src/components/Header.tsx:406-409`
- Modify: `src/components/Header.tsx:497-499`

**Step 1: Inspect target lines in `src/components/Header.tsx`**

Verify line 407 and line 498 where greetings are rendered.

**Step 2: Update greeting template strings**

Remove trailing ` 👋` and ` 🙏` from:
- Desktop greeting:
  ```tsx
  {pathname === "/hub" ? `Welcome to Hub, ${name}` : `Hey, ${name}`}
  ```
- Mobile greeting:
  ```tsx
  {name ? (pathname === "/hub" ? `Welcome to Hub, ${name}` : `Hey, ${name}`) : "Welcome back"}
  ```

**Step 3: Verify TypeScript compilation and build**

Run: `npm run build` or `npx tsc --noEmit`
Expected: PASS with 0 errors.
