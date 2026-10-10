import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { applyTheme, getLocalTheme } from "@/lib/theme";

// Supabase (~200 KB) is loaded on demand, not imported here: this provider sits
// at the root, so a static import put it in the bundle every visitor downloads
// first — including logged-out visitors on the landing page, who don't need it
// to see the page.
const loadClient = () =>
  import("@/integrations/client").then((m) => m.supabase);

/**
 * A logged-out visitor on the landing page: no stored Supabase session and no
 * sign-in redirect in the URL. Same token test as the head script in
 * __root.tsx. Only then is "signed out" known without asking Supabase.
 */
function knownSignedOutOnLanding(): boolean {
  if (typeof window === "undefined" || location.pathname !== "/") return false;
  if (/[?#&](code|access_token|error)=/.test(location.search + location.hash))
    return false;
  try {
    return !Object.keys(localStorage).some((k) => /^sb-.+-auth-token$/.test(k));
  } catch {
    return false;
  }
}

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
    const supabase = await loadClient();
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
    if (data)
      void import("@/lib/timezone").then((m) =>
        m.syncTimezone(userId, data.timezone),
      );
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe = () => {};

    const start = () =>
      loadClient().then((supabase) => {
        if (cancelled) return;
        const {
          data: { subscription },
        } = supabase.auth.onAuthStateChange((_e, s) => {
          setSession(s);
          setLoading(false);
        });
        unsubscribe = () => subscription.unsubscribe();
        supabase.auth.getSession().then(async ({ data }) => {
          setSession(data.session);
          setLoading(false);
          if (!data.session) return;
          // getSession trusts storage. An account deleted elsewhere keeps a
          // token that still passes RLS until it expires, so the quiz would
          // skip signUp and write a profile for a user that no longer exists.
          // Only a definite "no such user" signs out — offline or a flaky
          // network keeps the session.
          const { error } = await supabase.auth.getUser();
          if (error?.code === "user_not_found") {
            await supabase.auth.signOut({ scope: "local" });
          }
        });
      });

    if (knownSignedOutOnLanding()) {
      // Nothing to wait for: render signed-out now, and fetch Supabase once the
      // browser is idle so a sign-in from this page is still picked up.
      setLoading(false);
      const idle = window.requestIdleCallback ?? ((f) => setTimeout(f, 1500));
      idle(() => void start());
    } else {
      void start();
    }
    return () => {
      cancelled = true;
      unsubscribe();
    };
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
          // Loaded on demand: the notifications module pulls in Capacitor and
          // the quote bank, which the landing page's first paint doesn't need.
          await import("@/lib/notifications")
            .then((m) => m.cancelAll())
            .catch(() => {});
          // Cached old logs stay on the device otherwise.
          if (userId)
            await import("@/lib/historyCache").then((m) =>
              m.clearHistoryCache(userId),
            );
          await import("@/services/storage").then((m) => m.clearPhotoCache());
          await (await loadClient()).auth.signOut();
          setHasProfile(null);
        },
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
