# DOCMAN Current State

## Current Version
1.0.4
Version Code: 65

> Note: `android/app/build.gradle` says versionName **1.0.4**, not 1.0.0.
> It went 1.0.2 (code 63, on Internal testing) → 1.0.3 (code 64, refused by Play:
> "Version code 64 has already been used") → **1.0.4 / code 65**, built 13 Oct, not uploaded.
> If the public launch is meant to read 1.0.0, that is a deliberate change to make before
> the next build, not something to assume.

## Current Objective
[Write what you are going to work on now]

## Current Problem
[Write the problem you are trying to solve]

## Files Involved
[Leave empty for now]

## Do NOT Change
[Leave empty for now]

## Last Completed Task
Built **65 / 1.0.4** and verified it from inside the bundle (13 Oct 21:13).
`DOCMAN Play Store Assets/release/DOCMAN-1.0.4-versioncode65-UPLOAD-THIS.aab`.
Nine fixes, each confirmed on the phone through DOCMAN dev: PDF slow-scroll no longer
selects text; note page full screen; double tap to edit; no Cancel/Save while reading;
ruling under the writing; note card and reminder sticky note clear the gesture bar; one
alert at a time when opened from a notification; dialog heading no longer reads "View".
`HANDOVER.md` §2i has the reasoning.

## Next Task
[Leave empty for now]

---

## Still open (not part of the template — delete if unwanted)

- **Unanswered:** did the expiry alerts behave on 14 Oct? 108 alarms were confirmed armed on
  the phone on 13 Oct (exact, max importance, 07:00–21:00 every 30 min). Whether exactly ONE
  banner arrived was never reported back.
- **65 / 1.0.4 has not been uploaded.** 63 is what is on Internal testing.
- **No pre-launch report has ever been generated**, for any build. Next step is Play Console
  → Help → Contact support, not another upload.
- **Nothing is committed.** Ten files have carried uncommitted work since 12 Oct, on branch
  `docman-2026-09-24-pdf-search-ui-animations`.

## 15 Oct 2026 addendum
Edited, unbuilt, unverified on device: restore water level tracks progress (`app.js`
`report()` calls `setBusyFill`); note text darker and heavier (`style.css`). Not in the 65 AAB.

Addendum: expiry banners merge per date (see PROGRESS.md 15 Oct). Unverified on device.

**Decision 15 Oct 2026 (user):** the FINAL AAB must be versionName 1.0.0. versionCode stays above 65 (66+; check the App bundle explorer, Play refused 64). Not yet changed in build.gradle — do it at the final-build step, after confirming with the user.

Addendum: expiry cards with document pictures built (see PROGRESS.md 15 Oct). Not installed or seen on device.

Addendum: work committed (02e4617) and pushed to the branch on GitHub. Previously "nothing committed" — now resolved.

**Current build: 1.0.0 / versionCode 66, built 15 Oct, not uploaded.** build.gradle now says 1.0.0 / 66.
