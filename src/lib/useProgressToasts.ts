/**
 * Tell the user about the three things that happen to them while they are
 * looking somewhere else: a badge unlocked, a level crossed, a friend request
 * arrived.
 *
 * All three are the same move — ask the server what is true now, compare it
 * against what this browser last saw, announce the difference. The achievement
 * half of this already existed, but it lived inside RankPage's loader, so a
 * badge earned while logging food was announced only if and when the user
 * happened to open the Achievements page. Now it runs wherever they are.
 *
 * Mounted once, in NotificationReconciler — see src/routes/__root.tsx.
 */

import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/client";
import { loadProgress } from "@/lib/progress";
import { leveledUp, newIds } from "@/lib/seen";
import { ACHIEVEMENT_BY_ID } from "@/lib/xpConfig";

/** Minimum gap between runs, to survive rapid app switching. */
const MIN_INTERVAL_MS = 60_000;

let lastRunAt = 0;

/* localStorage keys. `ach_seen_` is deliberately the one RankPage already
   wrote, so nobody upgrading gets re-told about badges they have had for
   weeks. */
const achKey = (uid: string) => `ach_seen_${uid}`;
const lvlKey = (uid: string) => `lvl_seen_${uid}`;
const frqKey = (uid: string) => `frq_seen_${uid}`;

/** Private-mode and storage-blocked browsers throw on access. These toasts are
 *  cosmetic; never let them break a render. */
function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full / blocked — carry on */
  }
}

export function useProgressToasts(userId: string | null): void {
  const navigate = useNavigate();

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    const run = async () => {
      const now = Date.now();
      // Android fires a foreground event on every task-switcher glance, and
      // this is five queries and an RPC.
      if (now - lastRunAt < MIN_INTERVAL_MS) return;
      lastRunAt = now;

      const [snapshot, requests] = await Promise.all([
        loadProgress(userId),
        supabase.rpc("get_friend_requests"),
      ]);
      if (cancelled || !snapshot) return;

      // ── Achievements ──
      const earnedIds = snapshot.earned.map((e) => e.achievement_id);
      const freshIds = new Set(
        newIds(read<string[]>(achKey(userId)), earnedIds),
      );
      snapshot.earned
        .filter((e) => freshIds.has(e.achievement_id))
        .forEach((e) =>
          toast(
            `Achievement Unlocked! ${ACHIEVEMENT_BY_ID[e.achievement_id]?.title ?? "New badge"}`,
            {
              description: `+${e.xp} XP earned!`,
              icon: "🏅",
              duration: 4000,
            },
          ),
        );
      write(achKey(userId), earnedIds);

      // ── Level ──
      if (leveledUp(read<number>(lvlKey(userId)), snapshot.level)) {
        toast(`Level ${snapshot.level} reached!`, {
          description: `${snapshot.totalXP.toLocaleString()} XP total. Keep going.`,
          icon: "⭐",
          duration: 5000,
        });
      }
      write(lvlKey(userId), snapshot.level);

      // ── Friend requests ──
      const incoming = (requests.data ?? []).filter(
        (r: { direction: string }) => r.direction === "incoming",
      ) as { friendship_id: string; full_name: string; username: string }[];
      const incomingIds = incoming.map((r) => r.friendship_id);
      const freshReqs = new Set(
        newIds(read<string[]>(frqKey(userId)), incomingIds),
      );
      incoming
        .filter((r) => freshReqs.has(r.friendship_id))
        .forEach((r) =>
          toast(
            `${r.full_name ?? `@${r.username}`} sent you a friend request`,
            {
              icon: "👋",
              duration: 8000,
              action: {
                label: "View",
                // ponytail: lands on /hub, not the REQUESTS tab — that tab is
                // component state rather than a URL (FriendsPanel.tsx). Deep-link
                // it if people start missing the requests once they arrive.
                onClick: () => void navigate({ to: "/hub" }),
              },
            },
          ),
        );
      write(frqKey(userId), incomingIds);
    };

    void run();

    // One listener for both web and the Capacitor webview. The reminder hook
    // next door needs Capacitor's own appStateChange because it must run on
    // native only; this one wants every foreground on every platform.
    const onVisible = () => {
      if (document.visibilityState === "visible") void run();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [userId, navigate]);
}
