import { useAuth } from "@/lib/auth";
import { useReconcileOnForeground } from "@/lib/useReconcileOnForeground";
import { useProgressToasts } from "@/lib/useProgressToasts";
import { NotificationPrimerDialog } from "@/components/NotificationPrimerDialog";

/**
 * Signed-in-only root extras, lazy-loaded by __root.tsx so the landing page's
 * first paint doesn't wait on them (they pull in Capacitor, the quote bank and
 * the dialog primitives).
 *
 * The two hooks do opposite jobs: one rebuilds the OS alarms that fire when
 * the app is closed, the other announces things that happened while the user
 * was on another screen. They run here, below AuthProvider, because both need
 * the signed-in user.
 */
export default function SignedInExtras() {
  const { user } = useAuth();
  useReconcileOnForeground(user?.id ?? null);
  useProgressToasts(user?.id ?? null);
  return <NotificationPrimerDialog />;
}
