/* Runnable self-check for the XP system. No test framework installed, so this
   is a plain assert script:  node --experimental-strip-types src/lib/xpConfig.test.ts

   Per-achievement XP now comes from the `achievements` table via
   sync_achievements(), so these cases pass xp values in the way the server
   supplies them rather than reading them off a client constant. The numbers
   below mirror the migration seed. */
import assert from "node:assert";
import {
  XP_PER_LOG,
  XP_PER_LEVEL,
  ACHIEVEMENTS,
  ACHIEVEMENT_BY_ID,
  computeTotalXP,
  levelFromXP,
} from "./xpConfig.ts";

// As seeded in 20260914150000_achievements_catalog.sql.
const FIRST_BITE = 50;
const STREAK = 150; // streak_7

// 1. Fresh user: 0 logs, 0 achievements → totalXP 0, level 1, bar empty.
{
  const xp = computeTotalXP(0, []);
  const l = levelFromXP(xp);
  assert.equal(xp, 0);
  assert.equal(l.level, 1);
  assert.equal(l.xpIntoCurrentLevel, 0);
}

// 2. First log fires a target-1 badge (First Bite), so we assert on the 2nd log:
//    totalXP = XP_PER_LOG*2 + FIRST_BITE (from log 1). The formula is right;
//    the "clean" log to test is the 2nd, not the 1st.
{
  const xp = computeTotalXP(2, [FIRST_BITE]);
  assert.equal(xp, XP_PER_LOG * 2 + FIRST_BITE);
  assert.equal(levelFromXP(xp).level, 1); // well under 1000
}

// 3. Completing a 7-day streak adds EXACTLY that badge's xp, nothing more/less.
{
  const before = computeTotalXP(10, [FIRST_BITE]);
  const after = computeTotalXP(10, [FIRST_BITE, STREAK]);
  assert.equal(after - before, STREAK);
}

// 4. Crossing a 1000-XP boundary bumps level by exactly 1, bar shows progress
//    into the new level (not overflow).
{
  const justUnder = levelFromXP(XP_PER_LEVEL - 10);
  const justOver = levelFromXP(XP_PER_LEVEL + 10);
  assert.equal(justUnder.level, 1);
  assert.equal(justOver.level, 2);
  assert.equal(justOver.level - justUnder.level, 1);
  assert.equal(justOver.xpIntoCurrentLevel, 10); // reset into new level
  assert.ok(justOver.xpIntoCurrentLevel < XP_PER_LEVEL);
}

// 5. XP_PER_LOG is the only client-side knob left; achievement XP arrives from
//    the server, so an empty list contributes nothing.
{
  assert.equal(computeTotalXP(3, []), 3 * XP_PER_LOG);
}

// 6. Every presentation entry is reachable by the id the server returns —
//    a drifted id would render an unlabelled badge.
{
  for (const a of Object.values(ACHIEVEMENTS)) {
    assert.equal(ACHIEVEMENT_BY_ID[a.id]?.title, a.title, `unmapped id ${a.id}`);
  }
  assert.equal(Object.keys(ACHIEVEMENT_BY_ID).length, 19);
}

console.log("xpConfig self-check: all 6 cases passed ✓");
