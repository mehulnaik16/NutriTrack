/**
 * Which try a "Search AI" tap is. The server rotates the model order on it
 * (searchChain in server/aiRoutes.ts): 1, 2, 3, then back to 1. A failure
 * moves it on and an answer resets it.
 *
 * Module state on purpose: every search box in this tab shares it, so a
 * failure in the food log's search box and a retry in the meal builder's
 * count as consecutive attempts. A reload starts again at 1.
 */
let failures = 0;

export const searchAttempt = () => ((failures % 3) + 1) as 1 | 2 | 3;

export function recordSearchOutcome(answered: boolean) {
  failures = answered ? 0 : failures + 1;
}
