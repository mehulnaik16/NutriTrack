import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/client";
import { syncTimezone } from "@/lib/timezone";
import { cancelAll } from "@/lib/notifications";
import { applyTheme, getLocalTheme } from "@/lib/theme";
import { clearHistoryCache } from "@/lib/historyCache";

interface AuthCtx {
  user: User | null;
  session: Session | null;
  loading: boolean;
  /**
   * Whether the user has finished onboarding, i.e. has a user_profiles row.
   * `null` means "not determined yet" — distinct from `false`, which means
   * checked and genuinely absent. A signed-in user without a profile is a real
   * state: OAuth creates the session, the quiz creates the profile.
   */
  hasProfile: boolean | null;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  user: null,
  session: null,
  loading: true,
  hasProfile: null,
  refreshProfile: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasProfile, setHasProfile] = useState<boolean | null>(null);

  const userId = session?.user?.id ?? null;

  const refreshProfile = useCallback(async () => {
    if (!userId) {
      setHasProfile(null);
      return;
    }
    const localBefore = getLocalTheme();
    const { data, error } = await supabase
      .from("user_profiles")
      .select("id, timezone, theme")
      .eq("id", userId)
      .maybeSingle();
    // On error leave it undetermined rather than asserting "no profile" — a
    // transient failure must not bounce a fully onboarded user into the quiz.
    setHasProfile(error ? null : !!data);

    // The theme follows the account. Same read, no extra round trip: adopt the
    // account's theme, or seed it from this device if none was ever saved.
    // If the theme was picked on this device while the read was in flight,
    // that pick is newer than the row we got back — keep it.
    const local = getLocalTheme();
    if (data && local === localBefore) {
      if (data.theme && data.theme !== local) applyTheme(data.theme);
      else if (!data.theme)
        supabase
          .from("user_profiles")
          .update({ theme: local })
          .eq("id", userId)
          .then();
    }

    // Piggy-backs on the read above so a device that has moved zones costs one
    // write and no extra round trip. Deliberately not awaited: notification
    // scheduling can run a launch behind, and sign-in must not wait on it.
    if (data) void syncTimezone(userId, data.timezone);
  }, [userId]);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setLoading(false);
    });
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      setLoading(false);
      if (!data.session) return;
      // getSession trusts storage. An account deleted elsewhere keeps a token
      // that still passes RLS until it expires, so the quiz would skip signUp
      // and write a profile for a user that no longer exists. Only a definite
      // "no such user" signs out — offline or a flaky network keeps the session.
      const { error } = await supabase.auth.getUser();
      if (error?.code === "user_not_found") {
        await supabase.auth.signOut({ scope: "local" });
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  return (
    <Ctx.Provider
      value={{
        user: session?.user ?? null,
        session,
        loading,
        hasProfile,
        refreshProfile,
        signOut: async () => {
          // Alarms live in the OS, not the session. Without this the next
          // person on the phone keeps getting the last account's reminders.
          await cancelAll().catch(() => {});
          // Cached old logs stay on the device otherwise.
          if (userId) await clearHistoryCache(userId);
          await supabase.auth.signOut();
          setHasProfile(null);
        },
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
