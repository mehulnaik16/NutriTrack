/**
 * Human wording for GoTrue auth failures.
 *
 * Google sign-in creates an account with no password at all, so a later attempt
 * to sign in with a password is rejected as "Invalid login credentials" — which
 * reads like a typo and sends people round the same wrong loop. The client
 * cannot read auth.identities to tell a wrong password from a Google-only
 * account, so the copy names both cases instead of guessing.
 */

const ALREADY_REGISTERED =
  /already registered|already exists|user_already_exists/i;

/** True when signUp failed because the email already has an account. */
export function isAlreadyRegistered(raw: string | undefined): boolean {
  return ALREADY_REGISTERED.test(raw ?? "");
}

export function authErrorMessage(raw: string | undefined): string {
  const msg = raw?.trim() ? raw : "Something went wrong. Try again.";
  if (/invalid login credentials/i.test(msg)) {
    return "That email and password don't match. If you signed up with Google, use Continue with Google instead.";
  }
  if (isAlreadyRegistered(msg)) {
    return "That email already has an account. Log in instead — with Google if that's how you signed up.";
  }
  return msg;
}
