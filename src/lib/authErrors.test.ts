/* Runnable self-check for the auth error copy. No test framework in this repo,
   so this is a plain assert script — same convention as referral.test.ts.

   Build and run:
     npx tsc --outDir <tmp> --target es2020 --module es2020 \
       --moduleResolution bundler --skipLibCheck \
       src/lib/authErrors.ts src/lib/authErrors.test.ts
     sed -i 's|from "./authErrors"|from "./authErrors.js"|' <tmp>/*.js
     node <tmp>/authErrors.test.js

   Exits non-zero on the first failure. */
import assert from "node:assert";
import { authErrorMessage, isAlreadyRegistered } from "./authErrors";

// The Google-only account case: no password exists, so GoTrue reports the same
// string it uses for a typo. The copy has to mention Google either way.
assert.match(
  authErrorMessage("Invalid login credentials"),
  /Continue with Google/,
);

// Signing up again with an address that already has an account.
assert.match(
  authErrorMessage("User already registered"),
  /already has an account/,
);
assert.ok(isAlreadyRegistered("User already registered"));
assert.ok(isAlreadyRegistered("user_already_exists"));
assert.ok(!isAlreadyRegistered("Invalid login credentials"));
assert.ok(!isAlreadyRegistered(undefined));

// Anything else passes through untouched, so a real cause is never hidden.
assert.equal(
  authErrorMessage("Email rate limit exceeded"),
  "Email rate limit exceeded",
);
assert.match(authErrorMessage(undefined), /Something went wrong/);
assert.match(authErrorMessage("   "), /Something went wrong/);

console.log("authErrors self-check passed");
