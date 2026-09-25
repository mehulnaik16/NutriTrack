/**
 * Which try an AI request is. The server rotates the model order on it
 * (server/aiRoutes.ts): a failure moves it on, an answer resets it.
 *
 *   Search AI:  1, 2, 3, then back to 1 (searchChain)
 *   Photo:      1, 2, then back to 1 (visionChain)
 *
 * Module state on purpose: every search box in this tab shares one counter,
 * so a failure in the food log's box and a retry in the meal builder's count
 * as consecutive attempts. A reload starts again at 1.
 */
function attemptCounter<N extends number>(cycle: N) {
  let failures = 0;
  return {
    current: () => ((failures % cycle) + 1) as 1 | 2 | 3,
    record: (answered: boolean) => {
      failures = answered ? 0 : failures + 1;
    },
  };
}

const search = attemptCounter(3);
export const searchAttempt = search.current;
export const recordSearchOutcome = search.record;

const photo = attemptCounter(2);
export const photoAttempt = photo.current as () => 1 | 2;
export const recordPhotoOutcome = photo.record;
