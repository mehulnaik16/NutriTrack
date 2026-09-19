# Backlog

Work that is agreed but not built, with enough context that picking it up later
does not mean re-deciding it. Ticked items stay until the release that ships
them, so the reasoning is still here when something looks odd in production.

## App launch

- [ ] **Intro animation on cold start.** The native shell loads a remote URL
      (`server.url` in `capacitor.config.ts`), so between the static splash
      drawable and the first paint of the deployed page there is a plain gap
      with nothing happening — noticeably dull on a slow connection, and long
      enough to read as the app having hung. Wanted: a short branded animation
      covering that window.

      References the user gave: <https://jitter.video/templates/ui-elements/>
      and <https://lordicon.com/>.

      Constraints worth knowing before starting:
      - The animation has to live in the **native shell**, not the web bundle.
        Anything served from the remote URL can only start after the very gap
        it is meant to cover. That means `@capacitor/splash-screen` with
        `launchAutoHide: false`, hidden from the web app once it has painted.
      - Android draws `@drawable/splash` (see
        `android/app/src/main/res/values/styles.xml`) before any JavaScript
        runs. A Lottie or animated-vector asset replaces that; an exported
        video does not.
      - Lordicon ships Lottie JSON. Android can play it through the Lottie
        library, or it can be converted to an `AnimatedVectorDrawable` for the
        launch theme, which needs no dependency but supports far less.
      - Keep it under roughly 1.5s and make it interruptible. An animation the
        user has to sit through on every launch is worse than the gap it
        replaced.

## Notifications

- [ ] Delete `/debug/notifications` once the feature is confirmed working on
      real devices. It is signed-in-only and reads nothing but the caller's own
      profile, so it is safe to leave deployed in the meantime.

## Ops

- [ ] Apply `supabase/migrations/20260919120000_ops_write_tools.sql`. Held for
      human review because it rewrites `recompute_access`, which is the fold
      that decides who has paid access. The rewrite adds exactly one union
      branch (manual grants) and changes nothing else.

## Nutrition

- [ ] Adaptive TDEE. Spec:
      <https://claude.ai/code/artifact/ab23a830-5288-49a8-83a9-da72cef563d4>
