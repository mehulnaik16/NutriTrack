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
    const { data, error } = await supabase
      .from("user_profiles")
      .select("id, timezone")
      .eq("id", userId)
      .maybeSingle();
    // On error leave it undetermined rather than asserting "no profile" — a
    // transient failure must not bounce a fully onboarded user into the quiz.
    setHasProfile(error ? null : !!data);

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
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
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
