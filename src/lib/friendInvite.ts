/**
 * A friend invite link (/hub?add=<username>) opened while signed out is kept
 * under this key across sign-in: hub.tsx saves it, dashboard.tsx resumes it.
 */
export const PENDING_ADD_KEY = "dombelz_pending_friend_add";
