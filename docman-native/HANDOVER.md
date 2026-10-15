# DOCMAN — Handover (13 Oct 2026, night)

Start a **new chat** and point it at this file, plus CLAUDE.md and ISSUES.md.
Everything here is settled; none of it needs re-discovering.

**One line if you read nothing else:** **63 / 1.0.2 is on Internal testing**; **65 / 1.0.4**
is built on disk and not uploaded. It carries the PDF scroll fix and the note editor rework
(§2i). The one thing still owed is tomorrow morning's expiry check (§2g).

---

## 1. Standing rules — do not break these

- **Never build an AAB for Play** without first telling the user the `versionCode` /
  `versionName` and waiting for a yes.
- **Never upload or publish to Play** unless told to. The user presses the final button.
- Verify a build from **inside the APK/AAB**, never from the build log and never from
  the number the Console shows.
- Always say **explicitly** whether the user has to test something.
- Send a **rendered PNG** of any UI change and wait for approval before building to the phone.
- End every reply with a **token readout**.
- `installDebug` installs the separate **"DOCMAN dev"** app (`com.docman.dev`), never the
  real one. Tell the user to open that icon.
- Never `innerHTML +=` on a container the app already wired up.
- The user has said: *verify things yourself instead of repeatedly asking me to test.*
- Files/notes/folders use the **⋯ row menu**; only departments use long-press.
- **Write this file as each piece of work lands, not at the end of the chat.** The user
  clears chats between sessions, so anything not written here is lost — and a chat can stop
  without warning (context limit, a crash, the user closing it), which leaves no last turn to
  write in. Finish a fix, write it down; then carry on.
- Play listing screenshots carry **no status bar, no nav bar, no notification icons** —
  the whole existing set is app content only. Crop them off before handing one over.

## 2. Where everything stands, 12 Oct 2026 (late evening)

| | |
|---|---|
| Live on **Closed testing – Alpha** | **versionCode 61 / 1.0.0**, published 12 Oct |
| **Production** | **Inactive** — promoting needs no new upload |
| **Built, verified, NOT uploaded** | **62 / 1.0.1** — `DOCMAN Play Store Assets/release/DOCMAN-1.0.1-versioncode62-UPLOAD-THIS.aab` (§2f) |
| Next build number after that | **63** (59 and 60 were built but never accepted) |
| Branch | `docman-2026-09-24-pdf-search-ui-animations` |
| Cache markers in `www/index.html` | `app.js?v=596`, `style.css?v=642` — already in 62. **Bump both again** on the next build |
| Uncommitted | `www/app.js`, `www/index.html`, `www/style.css`, `android/app/build.gradle`, this file. `www/serve-www.js` moved to `tools/`. **Nothing committed this session** |
| Store listing icon | new flat one, live |
| Privacy policy | 12 Oct version, live |
| New listing screenshot | `screens-note-2026-10-12/note-editor-v596-1080x1920.png` — replaces `note-ruled-…`, whose layout is now wrong. **Not uploaded** |

**Where to pick up:** 62 is sitting on disk, fully verified, with a Play Console *Internal
testing* draft release open and empty, waiting for that file. Upload there first (yours
alone), check it on the phone, then **Promote** to Closed testing — no second upload. The
Internal testing track's "Create new release" button is greyed out because that draft
already exists; use **Edit release** on it.

**61 was verified properly**: the installed APK was pulled off the phone and its
`assets/public/index.html` read for the `?v=` markers. Do this after every Play upload —
the Console's version number alone once hid a stale web layer for days.

### minSdk is now 24
Play refused versionCode 60 outright:

> *Play automatic protection requires a minimum SDK version of 24 or higher. The uploaded
> App Bundle has a minimum SDK version of 23.*

Automatic protection is **on** at app level and worth keeping — the app has a paid tier
(`docman_pro`) that it protects. So `android/variables.gradle` went 23 → 24 and **Android 6
is no longer supported**. Nobody lost the app; only 12 testers had it.

### Release notes need language tags
The Console box wants `<en-US>` … `</en-US>` around the text. Plain text gives
*"Line 1: text outside language tags. Release notes provided for 0 language."*

### Publishing overview
Submitting while another review runs offers **"Restart review"** — it cancels and restarts,
but one review covering everything still beats two in sequence. After submitting, the page
runs *"quick checks… minutes remaining"* and looks like nothing happened. It did.

## 2a. Note editor — two fixes, 12 Oct evening (shipped in 62)

Both were reported by eye and then **measured** through the debuggable WebView before a
line was changed. Both are in `www/`; **versionCode 61 on Play does not have them.**

**1. The card was clipped under the status bar when the keyboard was up.**
`#noteModal.modal` reserves `max(12px, env(safe-area-inset-top))` on top (34px on the S23)
plus 12px below, but `.note-modal-card` was capped at `var(--vvh) - 24px`. 441 > 419, so the
card did not fit, and `align-items: center` spilled it equally at both ends — the head went
under the status bar. The cap now subtracts the padding the overlay actually reserves
(`style.css`, the `--vvh` rule). Measured after: card top 34, bottom 453, viewport 465.

**2. Ruled lines sat above the words instead of under them.**
The rules are the background of `.note-field-body`, and a background starts at the **padding
box** while the text starts a `padding-top` lower (9px here) — so every 22px band ran 9px high,
straight through the text. `paintNoteRuling()` in `app.js` (replaces `noteRuledBackground()`)
now draws a tile exactly one line high and offsets it by the field's own `padding-top`.

**3. Fallout from fix 1:** the card lost 22px, which cut the size/ruling row in half. With the
keyboard up the writing box now gives 50px back (`.modal.keyboard-open .note-content-input`,
200px → 150px). Measured after: `scrollHeight === clientHeight`, nothing clipped.

**A live patch is not a fix.** Injecting the corrected background through devtools worked, then
vanished the moment the user tapped a colour — the app's own `paintNoteModalColor` redrew it
from the old code in the installed APK. If a live patch must survive, wrap the function
(`window.paintNoteModalColor`) rather than just restyling the element.

### Screenshots handed over for the listing
`DOCMAN Play Store Assets/screens-note-2026-10-12/` — `note-ruled-1080x1920.png` and
`reminders-1080x1920.png`, 9:16 to match `final-8-9x16`. Status bar and nav bar cropped, and
the Samsung **Edge-panel handle** (a grey sliver on the right edge, not a scrollbar — CSS
cannot hide it) covered with its own mirrored neighbouring strip via ffmpeg. The raw 2316
versions were deleted: they carried wifi/battery/notification icons.

The user may upload these before 62 ships. The only mismatch with 61 is the 9px rule offset;
with no keyboard in frame the clipping fix is not visible either way.

## 2b. Search results pill + suggestions dropdown, 12 Oct evening (shipped in 62)

Reported by eye, then measured through the debuggable WebView before anything changed.
**Approved on the phone as a live patch; the patches were then removed and the work written
into  properly. In 62.**

**The pill was clipped and too narrow.** Measured: the suggestions dropdown ran 172→**262**,
the pill started at **255** — a 7px overlap, and the dropdown carries `z-index: 500`, so it
painted over the pill's head. The pill was also only **302px** wide against the cards' 362,
because `display: inline-flex` shrink-wrapped it to its text.

**The dropdown is now off** (`renderSearchSuggestions()` returns early, in `www/app.js`). It
repeated, word for word, the result cards rendering underneath it as you type, and floated
over the Recent / Sort / Dashboard / Recycle Bin row to do it. Everything below the early
return is intact, so it is one line away from returning. **What it showed and the cards do
not: each match's folder path** ("Personal/IDs & Cer…"). The user was offered moving that
onto the cards and has not answered — if two files share a name, the cards cannot tell them
apart. Worth raising again.

**The pill now wears the search field's own skin**, `#101216` with `1px solid #ff8c28` — not
the gradient ring. The gradient `.search-container::before` is **dead**: an override at
style.css ~6015 sets `::before { display: none }` and a flat orange border. Read that block,
not the one at 577, when matching the search field.

Also: block-level flex with `margin-right: -10px`, the same bleed the cards carry, so both
end on the same line; height **50px → 38px**; Clear pushed right by its own `margin-left: auto`.

### A trap worth remembering
The preview patch used `display: flex !important`, which **beat `.hidden { display: none
!important }`** — so the pill stopped hiding and stranded itself at the bottom of the home
screen, under the departments, with Clear behind the + FAB. The user saw this and said it was
wrong. **The shipped rule carries no `!important`, and that was then tested on the device**:
`clearSearch()` → `hiddenClass true, display none, height 0`. Any future rule on `#searchInfo`
must stay specific-but-not-important, or the pill never goes away.

## 2c. Note ruling now scrolls with the text, 12 Oct evening (shipped in 62)

The ruled lines stayed put while the words scrolled, so past the first screenful every line
sat wrong. The rules were the background of `.note-field-body`, **and that element does not
scroll -- the `<textarea>` inside it does.** The §2a padding-top fix was right for the first
screen and could never hold for the second.

`paintNoteRuling()` now paints them on `#noteContent` itself with
**`background-attachment: local`**, which ties a background to the content rather than the
box. The textarea carries `padding: 0`, so the padding-top correction is gone with it, and
its `line-height` comes from the same `noteLineFor()` the tile height does.
`.note-content-input` sets `background: none !important`, so every rule property is set with
`setProperty(..., 'important')` and cleared by name through `NOTE_RULE_PROPS`.

**Verified on the installed dev build** (`style.css?v=631`, `app.js?v=585`): on the textarea,
`background-attachment: local`, tile `100% 22px` against a `line-height` of 22px, padding-top
0, and the parent no longer carries an image, so the rules cannot double up. With 40 lines in
the box, `scrollHeight 880 / clientHeight 200` and `scrollTop 110` applied.
**Measured, not seen** -- an "expiring soon" dialog sat over the modal at screenshot time, so
nobody has yet watched the lines travel with the words. Worth one human look.

## 2d. Bulleted lines in notes, 12 Oct evening (shipped in 62)

Asked for as "press enter shows bullets". The user's own worry was that bullets would get in
the way of writing ordinary prose, so **Enter continues a list and only a list**:

- **start** -- `- ` or `* ` at the head of a line becomes `• ` (there is no room in the style
  row for a toolbar button, and this needs no chrome at all)
- **carry** -- Enter on a line that already begins `• ` opens the next one bulleted
- **end** -- Enter on a bullet with nothing after it drops the marker and leaves a plain line
- a plain line, a selection, or Shift/Ctrl/Alt+Enter are never touched

`wireNoteBullets()` in `www/app.js`, wired from `prepareNoteModal()` behind the same
`dataset` guard `wireNoteReadToEdit()` uses. Edits go through `document.execCommand` rather
than assigning `.value`, **which would wipe the textarea's undo stack**; there is a manual
fallback if the command is refused. `maxlength` does not apply to a programmatic edit, so the
1000-character cap is read from `field.maxLength` and a plain newline is inserted instead
when a marker would not fit.

**Verified on the installed dev build**, seven cases, against the real `#noteContent` in the
real modal, with the field's contents restored afterwards: plain Enter not intercepted;
`- ` → `• `; `* ` → `• `; Enter carries the marker; three items chain correctly; Enter on an
empty bullet drops it; Enter on a plain second line not intercepted.

### The space was the bug, and a synthetic test hid it
The first cut required `- ` **with a space**. Recorded from the real keyboard, the user types
`-` and then a letter, no space, every time -- so the marker never appeared and it read as
"enter bullet not working". It converts on the **second** character now: `- ` → `• `, and
`-m` → `• m`. Converting on the dash alone would make "- milk" into "•&nbsp;&nbsp;milk".
`--` and `*-` are left alone, since that is someone drawing a rule.

Two lessons, both already in §9 and both repeated here anyway:
- A synthetic `KeyboardEvent` proved nothing. `adb shell input keyevent 66` on the focused
  field is a real press and is what found this. Enter **does** arrive as `key: 'Enter'`,
  keyCode 13 -- the Android IME 229 path was a red herring.
- `adb shell input text "- milk"` **eats the space** and delivers junk. Pass `%s`, or set the
  value through devtools and press only the key under test.

### A rule nobody can see is not a feature
Typing `-` is undiscoverable, so there is a **bullet button** in the note footer, and the
typing shortcut is now just a bonus. `noteToggleBulletLine()` toggles the caret's own line;
`syncNoteBulletBtn()` lights the button when the caret sits on a bullet. It is bound on
**mousedown with preventDefault**, because a click would move focus off the textarea, drop
the keyboard, and lose the caret the toggle has to read.

### Where the controls sit
Footer row, left to right: **ruled page, bullets, … Cancel, Save** -- all four on one line,
with `.note-toggles { margin-right: auto }` holding the pair left. Swatches and the px
stepper share the row above (202 + 10 + 105 = 317 of 328; the older note claiming they could
not share a line was written when the toggles were still up there).

**The writing area did not change**: paper 188 / textarea 150 with the keyboard up, the same
numbers as before any of this. The *card* went 393 → 359 because a whole control row left it.

### Two traps in that footer
1. The footer carries the generic `.modal-footer` class as well, whose rules are written for
   a footer holding exactly Cancel and Save: `button { border-radius: 999px; padding: 10px
   20px }`, `button:first-child` grey, **`button:last-child` amber**. `:last-child` means last
   child of its *own* parent, so the second toggle qualified -- which is why the bullet button
   came out **yellow and pill-shaped**, 40px wide from the side padding. Those score (0,2,1)
   against `.note-lined-btn`'s (0,1,0) and win in any file order, so the square shape, fill
   and border are restated at `.note-modal-foot .note-toggles .note-lined-btn`, which is
   (0,3,0).
2. `.note-modal-foot button:first-child` styled Cancel. With the toggles nested ahead of it
   Cancel is no longer a first child, so those rules are now `> #noteCancelBtn`, and the other
   footer button rules are `> button` so they cannot reach into `.note-toggles`.

Icons: `fa-align-justify` and `fa-list-ul` were two near-identical stacks of horizontal
strokes. Ruled page is **`fa-file-lines`** now -- a sheet with ruling on it -- and the glyphs
went 0.85rem → 0.95rem. The hairline on both toggles and on the px stepper went
`rgba(255,255,255,0.18)` → `0.55`; at 0.18 they read as holes in the card, not buttons.

## 2e. The note editor across screen sizes — swept, 12 Oct evening

**All of the above was tuned on one phone, and two pieces of it were broken everywhere else.**
The user asked whether it would hold on other sizes. It would not have.

A harness drives the real page through `Emulation.setDeviceMetricsOverride` over the same
devtools socket (`evsize.js` + `robust.js` in the scratchpad), sets `--vvh` to the fraction
the keyboard leaves, adds `.keyboard-open`, and asserts what actually matters: card within
its cap, head below the status bar, nothing overlapping, Save inside the card, no sideways
scroll, and nothing cut off that cannot be scrolled to.

**What it caught:**
1. **Swatches ran through the stepper below ~376px.** Six swatches (202) + gap + stepper
   (105) = 317; a 384px phone gives the row 328, a **360px phone 304**, and 360 is the most
   common width on Android. `.note-colors` was `flex: 0 1 auto`, so it shrank below its own
   contents instead of sending the stepper to the next line. Now `flex: 0 0 auto`, and the
   stepper wraps where there is no room. **The comment I deleted said this**; one device
   talked me out of it.
2. **A fixed `min-height: 208px` pushed the page past the card on short screens.** Now
   `min(208px, calc(var(--vvh) * 0.45))` -- exactly 208 on this phone, smaller where the
   viewport is.
3. **The footer row overflowed at 320px.** Two toggles + Cancel + Save need 285 + 28 of
   padding = 313 against 292. The footer is `flex-wrap: wrap` now, so the toggles take their
   own line there and Save stays reachable.

**Fifteen portrait sizes pass**, 300x540 through 768x1024. The layout degrades in steps:
≥384 both rows single; 360–383 the stepper wraps; ≤340 the footer wraps too.

**Landscape was failing and does not matter**: `MainActivity` is
`android:screenOrientation="portrait"` in the manifest, so the web layer never rotates.
`PdfViewerActivity` is the only `fullUser` one and is native Java, not this CSS. Do not spend
time on landscape CSS for the web layer.

**Two things this method cannot do.** `adb screencap` grabs the device surface, so a
screenshot taken under emulation still shows the real geometry -- the measurements are the
evidence, screenshots of emulated sizes are not. And none of it is a real device: §3 still
stands, the app has only ever run on the one Galaxy S23.

**Display size matters as much as the model.** Turning Samsung's Display size up drops the
CSS width of this very phone from 384 toward 320, so the narrow cases are reachable without
owning another handset -- worth a pass before release.

## 2f. Build 62 / 1.0.1 — built, verified, NOT uploaded

`DOCMAN Play Store Assets/release/DOCMAN-1.0.1-versioncode62-UPLOAD-THIS.aab`
(the real release folder, not the stray one on the Desktop that once burned 54).

Everything below was read **out of the bundle**, never off a build log:

| | |
|---|---|
| versionCode | **62** (protobuf `26 2 "62"` in base/manifest) |
| versionName | **1.0.1** (`26 5 "1.0.1"`; "1.0.0" absent) |
| Web layer | `style.css?v=642`, `app.js?v=596` |
| Signature | `jarsigner -verify` → jar verified |
| Size | 61.4 MB |

### Testing on DOCMAN dev is valid for this build, and here is the proof
The debug APK was pulled off the phone and its `assets/public/*` hashed against the same
files inside the AAB:

```
app.js      241646df1b4d22c9 == 241646df1b4d22c9
index.html  233c656c072998d3 == 233c656c072998d3
style.css   7bd8dff81d1aa25a == 7bd8dff81d1aa25a
```

**Zero Java files changed this session** -- every change is in `www/`. `minifyEnabled true`
and `shrinkResources true` are release-only, but R8 processes Java bytecode and
`shrinkResources` trims `res/`; neither touches `assets/`. So what runs in DOCMAN dev is
byte-identical to what Play ships.

**This stops being true the moment a change touches Java.** Then R8 is in play, debug does
not run it, and the release build has to be exercised itself -- upload to **Internal testing**
(yours alone, does not disturb the 12 on Closed testing) and promote from there.

### Smoke test on the device, build 596
18/18 on the changed surface (search pill shows/hides/sizes, dropdown stays down, bullet
button, Enter carries, ruling attached to content with pitch == line-height, swatches, font
stepper, modal closes, **user notes byte-identical before and after**) and 7/7 on the
untouched views (Dashboard, Recents, Favourites, Recycle Bin, Settings, Statistics,
Expiring). **Zero JS errors, zero console.error, no FATAL, no ANR, process alive.**

An earlier run showed 4 failures that were **my wrong function names**, not the app:
the real ones are `openDashboardView`, `openRecycleBinView`, `openSettingsPage`,
`openStatisticsPanel`. Zero JS errors alongside a "failure" is the tell.

### Two strays were shipping inside the bundle
- **`ws.txt`** -- a scratch file I left in `www/`, 67 bytes of a localhost devtools URL. It
  reached `base/assets/public/ws.txt` in the first 62 build. Removed, rebuilt, confirmed gone.
- **`serve-www.js`** -- a Node dev server, referenced nowhere, that cannot even run in a
  WebView. **Moved to `docman-native/tools/`**, not deleted, so it still works for previews
  without riding along in the app.

Both found only by listing the bundle's contents. A build log would never have shown either.
`assets/public` now holds exactly: app.js, cordova.js, cordova_plugins.js, index.html,
manifest.json, style.css, plus Fonts/Images/vendor.

### Production access was re-checked in Play Console, 12 Oct
Signed in and looked, changing nothing. **Production track opens with "Create new release"
live and no gating notice**; Closed testing shows one active track, "Alpha", release
**61 (1.0.0)**. Neither page mentions the 12-tester / 14-day requirement anywhere. That gate
is passed, it is account state rather than per-build, and **no amount of re-uploading or
refactoring brings it back**.

## 2g. Build 63 / 1.0.2 — expiry alerts, 13 Oct. ON INTERNAL TESTING

Uploaded by the user to **Internal testing** on 13 Oct, 11:59 AM. 62 was never promoted and
never will be: 63 contains everything 62 had plus the two fixes below. The 12 testers on
Closed testing are still on **61** and have seen none of it.

`DOCMAN Play Store Assets/release/DOCMAN-1.0.2-versioncode63-UPLOAD-THIS.aab`

### The bug the user hit
They set an expiry on 12 Oct for 13 Oct. On the day: the in-app banner appeared, **no
notification ever arrived.**

**Cause: Android drops every pending alarm when an app is updated**, and the plugin's
`LocalNotificationRestoreReceiver` listens for `BOOT_COMPLETED`, `LOCKED_BOOT_COMPLETED` and
`QUICKBOOT_POWERON` only. They installed 62 that morning; the 09:00 alarm went with the
update; by the time the app was opened, `rescheduleAllExpiryNotifications()` ran and skipped
09:00 because `add()` drops any slot where `at <= now`. **This was never a 62 bug — every
release since the app existed has silently disarmed every expiry alert this way.**

Fixed in `android/app/src/main/AndroidManifest.xml`: the same receiver is re-declared with
`tools:node="merge"` and an `MY_PACKAGE_REPLACED` filter. The receiver never looks at which
action woke it — it rebuilds from its own storage and **re-fires anything already overdue 15
seconds later** — so the filter is the whole fix. Verified inside the AAB: the receiver
appears **once** (merged, not duplicated) carrying both `MY_PACKAGE_REPLACED` and
`BOOT_COMPLETED`.

**XML forbids `--` inside a comment.** The first build died on
`ManifestMerger2$MergeFailureException` because the comment used this project's prose dash.
The note in the manifest says so, for the next person.

### Issue #8 was fixed the wrong way, and is now fixed properly
§4 records #8 as "the complaint was the cadence itself" and cut the expiry day to
`[9, 17]`. **That misread it.** What the user objected to was *many banners for one
document*; the repeats themselves were wanted. Their words, 13 Oct: *"keep one banner but
repeat every 30 minutes with notification alert."*

`EXPIRY_DAY_HOURS` is now `EXPIRY_DAY_SLOTS`: **every 30 minutes, 07:00 to 21:00, 29 slots**,
ids 1000..1028 — which is exactly what `EXPIRY_LEGACY_DAY_SLOTS = 29` already cancels, so the
cancel range needed no change. Nothing at night.

One banner, not 29, is the **plugin patch** doing its job
(`patches/@capacitor+local-notifications+6.1.3.patch`): every repeat shares one group, the id
posted for a group is remembered in SharedPreferences, and the previous notification is
cancelled as the next arrives. That patch was written for exactly this schedule — the comment
inside it still says "repeats every 30 minutes".

### The alarm budget, which is why #8 was cut in the first place
29 dense slots for *every* dated document is what once exhausted Android's pending-alarm
cap, so past about a dozen documents the rest got nothing at all. So the dense slots are now
armed **only when the day is within `EXPIRY_DENSE_WITHIN_DAYS` (3)**. The 7-day, 3-day,
tomorrow and overdue alerts are single and always armed; they are what brings someone back
into the app, and every launch re-runs the scheduler, which is where a document that has come
close picks its dense slots up.

### Acknowledgement already behaves as asked
The notification has carried **"Got it"** and **"Renew date"** all along. "Got it" calls
`acknowledgeExpiry()`, which cancels the remaining alerts **and leaves the in-app banner
standing** — `getAllExpiringFiles()`, which feeds the banner, never looks at acknowledgement.
Only the launch pop-up is suppressed. Stop the nagging, keep the reminder. Nothing changed.

Android brings the app to the front for any action button, whatever the handler does. That is
why the *reminder* alert has no buttons (see the comment at `registerActionTypes`); the expiry
one keeps them because the trade is worth it there.

### Verified inside the AAB
versionCode **63**, versionName **1.0.2**, `app.js?v=597`, `style.css?v=643`, `jar verified`,
receiver merged once with both actions, `EXPIRY_DAY_HOURS` gone, no stray files.
**Not smoke-tested on a device — the phone was away all day.**

### Confirmed on the phone, 13 Oct 12:29, on the real release build
The user installed 63 from Internal testing and sent screenshots. **It runs, it does not
crash**, and the web-layer work is all visibly alive:
- **Bullets** (the item they call #2): `• f` → Enter → `• ty` → Enter → `• `, carrying
  correctly, with the bullet button lit.
- The note editor's new footer layout: swatches and the px stepper sharing a row, ruled-page
  and bullet buttons on the Cancel/Save line.
- The expiry prompt at launch ("2 documents expiring soon") and the `1d left` badges.

So the crash risk that kept 62 and 63 off Closed testing is **answered for the web layer**:
it was exercised as a signed, R8-processed release build, not a debug one.

### The alarms were confirmed ARMED on the phone, 13 Oct 19:55
Checked over adb while the phone was connected, on the real release build 63:

- **108 alarms pending** = 3 documents x 36 times. Decoded, the times are exactly the design:
  **14 Oct 07:00 through 21:00 every 30 minutes (29 slots)**, then 09:00 daily 15-21 Oct.
- All `RTC_WAKEUP`, so they wake a sleeping phone.
- `appops get com.docman SCHEDULE_EXACT_ALARM` = **allow**, so they are exact, not
  deferrable.
- Channel `docman-alerts-v2`, **importance 5** (max) — sound and a heads-up banner.
- The `MY_PACKAGE_REPLACED` filter **is present in the installed build**, listed alongside
  the plugin's own boot actions, so the `tools:node="merge"` did merge.

So everything that can be proven before the alarms fire, is proven. What is left is whether
exactly ONE banner survives the repeats, which only tomorrow morning shows.

### Still unproven, and it can only be proven tomorrow
Both dated documents read **1d left**, so the 30-minute schedule has not run yet: the dense
slots belong to the expiry day itself. What is due on **14 Oct, from 07:00, every 30 minutes
to 21:00**:
1. A notification arrives, and **exactly one** stays in the tray, refreshed rather than
   stacked. This is the original complaint and the whole point of the change.
2. Nothing after 21:00.
3. "Got it" silences it while the in-app banner stays.

**And the receiver fix tests itself tomorrow.** Installing 63 was an app update, which under
the old behaviour would have wiped the pending alerts for those two documents. If the alerts
arrive tomorrow morning, `MY_PACKAGE_REPLACED` did its job. If nothing comes, that is a
separate fault and the first thing to look at is `adb shell dumpsys alarm | grep docman`
while the phone is reachable.

## 2h. App size — nothing shrank, two different numbers

The user saw ~42 MB for a fresh install earlier and 25-28 MB now, and asked what we had
removed. **Nothing.** Checked in the App bundle explorer:

| version | uploaded | size for new installs | update size |
|---|---|---|---|
| 45 (1.5.8) | 1 Oct | 28.5 MB | 1.75 MB |
| 58 (1.0.0) | 8 Oct | 28.6 MB | 1.75 MB |
| 61 (1.0.0) | 12 Oct | 28.5 MB | 1.77 MB |
| 63 (1.0.2) | 13 Oct | 28.5 MB | 1.69 MB |

Flat across a fortnight, and every AAB on disk is ~58.5 MB from 52 through 63. **28.5 MB is
what crosses the network** (Play splits the bundle for the one device); **~42 MB is what the
app occupies once installed**, which is the figure the Play listing and Settings show. Both
are right, they measure different things. If this comes up again, the bundle explorer settles
it in two clicks.

## 2i. Build 65 / 1.0.4 — PDF scroll, and the note editor reworked. 13 Oct night. NOT UPLOADED

`DOCMAN Play Store Assets/release/DOCMAN-1.0.4-versioncode65-UPLOAD-THIS.aab`, built
13 Oct 21:13, 58.5 MB.

**It is 65 / 1.0.4, not 64 / 1.0.3.** Play refused the first upload: *"Version code 64 has
already been used."* Nothing in this chat uploaded a 64, so something occupies that number
already — worth a look in the Console before the next build. The name went to 1.0.4 as well,
because whatever holds 64 may carry 1.0.3 and two rows reading 1.0.3 would be unreadable.
The 64 file on disk was renamed `superseded-...-DO-NOT-UPLOAD.aab` so it cannot be picked
by mistake.

Verified from inside the bundle: `app.js?v=603`, `style.css?v=645`,
every fix below present, no stray files, manifest carries 1.0.4 and the MY_PACKAGE_REPLACED
receiver. Everything below was tested on the phone through **DOCMAN dev** first and confirmed
by the user, which is what they asked for.

**The PDF fix cannot be string-checked in the bundle** — it is Java and R8 renames it. It was
confirmed on the device instead.

### The PDF bug: scrolling selected text (native)
Reported as *"while pdf scrolling text selection happens"*.

`PdfTextSelectionOverlayView` starts a long-press timer on ACTION_DOWN and cancels it only
when the FINGER moves past `longPressCancelSlopPx` (18dp). That slop is deliberately
generous — it was widened to stop hand tremor killing a word-select — but a **slow,
deliberate scroll stays inside 18dp for the whole 500ms**. The timer then fired mid-scroll,
sent PDFView an ACTION_CANCEL, and the scroll became a selection.

The fix does not touch the slop. It asks a better question: **did the PAGE move?**
`pageMovedSinceDown()` compares `pdfView.getCurrentXOffset()` / `getCurrentYOffset()` against
the values recorded at ACTION_DOWN, with 2dp of leeway. PDFView applies its own scroll slop
before it moves anything, so tremor cannot trip this — which is exactly why it does not
reintroduce the bug the 18dp was added for. Checked in two places:
- in ACTION_MOVE, alongside the existing slop test;
- **inside the long-press runnable itself**, which also closes a second, older bug: landing a
  finger on a page still flinging from the last gesture and holding still. No MOVE event
  arrives at all in that case, so the MOVE check alone would have missed it.

### The note editor
Four things, in the order they were asked for:

1. **Full-screen note page.** The card had `max-height` only, so it was content-sized and sat
   half-height with a 200px writing box. It now also has a **`height`** equal to that same
   cap, and the writing box — not the card — takes the slack (`flex: 1 1 auto` passed down
   through `.note-field-body`). 384x823: card 799, writing box 609 (was ~200). The keyboard
   case still works unchanged, because `--vvh` shrinking shrinks the card.
2. **Double tap to edit.** A long note is read by scrolling it, and that is one finger on the
   text — the same gesture that opened the keyboard. The writing box now needs a **double
   tap** (400ms); the title is one line with nothing to scroll, so a single tap still opens
   it. A hint line, `.note-read-hint`, shows *"Double tap the text to edit"* while reading and
   is hidden by CSS the moment editing starts.
3. **Colour / ruling / size no longer open the keyboard, and no longer summon Save+Cancel.**
   They used to call `leaveNoteReadMode()`, which made the fields editable — so a field that
   happened to hold focus while read-only suddenly had an editable one and Android opened the
   keyboard. Asked for: no Cancel and no Save while reading. Nothing is lost by that, because
   none of the three needs a decision: `noteStyleChanged()` **saves them on the spot** and
   read mode is never left. The text is untouched, so there is still nothing to cancel.
   `editingNoteFolder` was added so that save does not need the list.
4. **Ruling sat below the writing.** The rule was drawn at the line box's bottom edge. A 15px
   font in a 22px line is centred, so its baseline lands at 16 and the rule at 22 left the
   words floating ~6px above their own line. `noteBaselineOffset()` **measures** the baseline
   (an empty `vertical-align: baseline` inline-block inside a probe div, cached per
   font+size) and the rule is drawn at **baseline + 2**, so letters rest on it and descenders
   cross it, like ruled paper. Measured rather than hard-coded because the baseline's place
   depends on the font, which differs per device. Verified 12px-24px: the rule is always
   inside the line box.

### Two alerts landed on each other when the app was opened from a notification
Reported with a screenshot: tapping a REMINDER notification opened the app, put the
reminder's yellow sticky note on screen, and then the *"3 documents expiring soon"* dialog
dropped on top of it.

Nothing was wrong with either path; they simply did not know about each other. The tap is
handled through `handleNotificationAction` as soon as the data is ready, and the launch
checks run on their own timer **1.2s after load** (`checkExpiryTodayOnLoad` then
`checkLaunchAlertsOnLoad`).

`launchedFromNotification` is now set in the `localNotificationActionPerformed` listener,
**before** the event is either handled or queued, and **both** launch checks return early
when it is set. The reasoning: a tap on a notification is an answer to that alert, and it
already chose a destination; a second dialog about the same kind of thing is nagging.
Nothing is lost by skipping them — an unacknowledged expiry is still on the home banner and
in the Expiring panel, the modal runs again on the next ordinary launch, and tapping an
EXPIRY notification opens that document's modal from `handleNotificationAction` anyway.
The listener also removes an already-open `#customConfirm`, for the case where the tap
reaches the web layer after the dialog is up.

**Second bug, visible in the same screenshot:** the dialog's heading read **"View"**.
`showModal` does `const dlgTitle = title || resolvedOkLabel;` and this caller passed no
`title`, so the heading took the OK button's label. It now passes
`title: 'Needs your attention'`. **Any other `showConfirmModal` caller without a `title` has
the same bug** — worth a sweep if a heading ever looks like a verb.

### The bottom edge, and why env() is useless here
Making the card full height put its bottom under the gesture bar.
**`env(safe-area-inset-bottom)` resolves to 0 in this WebView** (targetSdk 35+ draws
edge-to-edge and does not publish the inset) — the rest of the app already works around this
by reading **`--nav-bottom`**, which MainActivity measures from the real window insets. The
note card now reserves `max(env(safe-area-inset-bottom, 0px), var(--nav-bottom, 0px))` at
both ends: the overlay's padding and the card's height.
**Use that pair anywhere else that touches the bottom edge.**

### The reminder sticky note sat on the navigation bar
Same trap as the note card, in a second place. `showReminderStickyNote`'s `place()` goes
below the row and flips above only when it does not fit — and it asked `innerHeight` whether
it fit. **`innerHeight` runs to the bottom of the SCREEN**, and this WebView is edge-to-edge,
so the navigation bar is inside it. For the last row in the panel the note "fitted" and was
drawn across the back and home keys.

`place()` now measures against `innerHeight - max(--safe-bottom, --nav-bottom)`, the same
pair the row menu already used. Verified at 384x823 with a 63px bar, four row positions:
rows at 120 and 400 still open downwards, rows at 640 and 700 flip above, all four clear the
bar and stay on screen.

**If a third thing ever hangs off the bottom edge, look here first.** Three separate places
have now made this same mistake.

### Swept across screen sizes
**21 sizes x 2 states (reading, keyboard up) = 42 checks. Zero failures, zero JS errors.**
280x653 through 800x1280. Each check: card inside the viewport, footer inside the card,
Save/Cancel hidden while reading, writing box never under 90px with the keyboard up, nothing
past the right edge, no clipped text, no control off screen.

Then **five nav-bar heights** (0 / 24 / 48 / 63 / 96px) at 360x640, because the bottom fix
depends on one: the card clears the bar by 12px every time, and loses nothing on a phone
without one.

**What that does NOT cover: the PDF fix.** It is Java; a browser cannot see it. It was tested
on the phone only.

## 3. The one thing still unresolved

**A pre-launch report has never been generated for this app** — not for 58, not yet for 61,
although both reached Closed testing, which is supposed to trigger one.

- The Pre-launch report **Settings page has no on/off switch**, so nothing was disabled.
- Google's own help: reports arrive within an hour, sometimes a few hours; if nothing comes
  within **two days**, upload a new bundle to trigger a fresh one.
- 61 went up on 12 Oct. If it also produces nothing, the next step is
  **Play Console → Help → Contact support**, *not* another build.

This is an extra safety net, not a gate: the 12-tester / 14-day requirement was already
satisfied and **production access was granted 7 Oct**. The app can launch without it.
But it also means **nothing has ever run on a device other than the user's Galaxy S23**.

## 4. Issues #1–#11 — all closed, all shipped in 61

| # | Reported | Actual cause | Fix |
|---|---|---|---|
| 1 | Duplicate settings rows | "Reminder delivery" repeated Expiry & Reminder alerts | Row removed |
| 2 | Add Reminder button not highlighted | — | Yellow highlight on the Reminders tab only; `+` became the word **ADD** |
| 3 | Note content search broken | Search worked; the result card showed nothing | Snippet added. **Locked notes excluded from search** |
| 4 | No Copy/Paste toolbar | *Not* selection. A global `contextmenu` `preventDefault()` killed Chromium's menu path | Handler returns early for editable fields and live selections |
| 5 | Press-and-hold preview | Asked for, then asked to remove | Removed |
| 6 | FILES/NOTES default | — | Done |
| 7 | Alert outlives its document | Delete was fine; **rename/move/folder-rename** were not | `reKeyFileAlerts()` + `sweepOrphanedExpiryAlarms()` |
| 8 | Expiry notification every 30 min | Cadence, not stacking. 38 alarm slots per document | `EXPIRY_DAY_HOURS = [9, 17]` → 12 slots; legacy 29 still cancelled on upgrade |
| 9 | Paste into note | — | Works |
| 10 | Lock screen over other apps | Not the lock screen — the **biometric prompt** | Fixed |
| 11 | Back button | Only the jump-into-a-folder sites were wrong | `navReturn`, below |

**The lesson, every single time:** *the reported symptom was real and the cause was somewhere
else.* Measure before theorising.

## 5. Key mechanisms

### Back navigation (`www/app.js`)
```js
let navReturn = null;   // { path: string[], restore: () => void }
function markNavReturn(restore) { navReturn = { path: currentPath.slice(), restore }; }
```
`goBack()` honours it first (unless in search mode), then nulls it. Marked at five jump
sites: Statistics largest file, Statistics largest folder, Dashboard department rows,
Dashboard expiring rows, Expiring panel. Cleared in `goHome`, `selectDepartment`,
`navigateToBreadcrumb`, subfolder entry. `returnToDashboard` was removed.

Two traps already hit: the settings panel id is **`settingsPanel-statistics`** (not
`statisticsScreen`), and the Expiring panel's tab must be captured **at leave time**,
because `close()` nulls `expdocLastTab` before restore runs.

### Note editor
- Six paper colours (`from` / `to` / `paper` / `edge`), ruled-page toggle, px text-size
  stepper (11–24, default 15). Font size **must** carry `!important` — a short-screen media
  query sets `font-size: 0.86rem !important`.
- **Read mode**: opens read-only so no keyboard appears; tapping the text starts editing,
  but clicks within 600 ms of opening are ignored (that is the tap that opened it).
- `updateNote` used to accept `color` and silently drop it. Fixed.
- The head holds: pen icon (36px) → title input → count → ✕. The note's own title is the
  headline, with an underline so it still reads as an editable field.

### Expiry date must start tomorrow
`showDateModal` gained `opts.minTomorrow`, used only by the two expiry call sites.
Calendar cell gets `disabled`, plus a Save-time guard.

### Tab pill
Measured with **layout** (`offsetLeft` / `offsetWidth` / `offsetTop`), never
`getBoundingClientRect()` — that reports painted geometry and ancestor transforms threw it
off. `openRecentsView` re-places it on a double rAF.

### Scan
`SCANNER_MODE_FULL`. After saving, a prompt asks what to call the scan. The ML Kit scanner
UI is a Play Services screen launched by IntentSender — **it cannot be restyled**.

### Native insets (`MainActivity.java`)
`exposeNavBarInsetToCss()` is a **read** (`ViewCompat.getRootWindowInsets` on a global-layout
listener), not an interception. `setOnApplyWindowInsetsListener` *replaces* a view's own
`onApplyWindowInsets`, which broke things.

## 6. Security pass — done

Serverless native app, so most of a generic web checklist does not apply. Two real findings,
both fixed:
- `@capacitor/android` → `^6.2.2` (GHSA-rvm3-566m-v7fv). `npm audit` clean. Both
  local-notifications patches survive via `patch-package` + `postinstall`.
- **Six unescaped file names** reaching `innerHTML` — Quick note (×2), Tags (×2), New expiry
  date, Expiry date — now `escapeHtml()`.

Deliberately **not** changed: the 6-character backup password minimum (flagged; the user's call).

## 7. Testing harness — reuse it, it works

- `adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>`, then Node 24's global
  `WebSocket` / `fetch` to drive the debuggable WebView.
- To prove a selection toolbar exists: tap to focus → `adb shell input keycombination 113 29`
  (Ctrl+A) → read `dumpsys window windows`. Window sizes are unambiguous: **selection handles
  124x62, caret handle 56x68, floating toolbar 1622x723**.
- **A long press in an editable field places a caret; it does not select a word.** Double-tap
  or Ctrl+A does. A long-press test proves nothing.
- To verify a shipped build: `adb shell pm path com.docman`, pull each APK, and read
  `assets/public/index.html` out of `base.apk` for the `?v=` markers.
- The devtools route still works and needs no build: `adb forward tcp:9222
  localabstract:webview_devtools_remote_<pid>` (pid from `adb shell cat /proc/net/unix |
  grep webview_devtools`), then `Runtime.evaluate` over the websocket. Read
  `getBoundingClientRect`, computed padding and `scrollHeight` vs `clientHeight` instead of
  squinting at a screenshot — that is how both fixes above were pinned down in minutes.

## 8. Still open

**Needs the phone and a human:**
- Long-press an image/card → the WebView's own menu must **not** appear (verified
  synthetically only).
- The row ⋯ button just above the nav bar still opens its menu (the inset code was rewritten).

**Needs a build:** nothing. Everything through §2e is in **62**, which is built and verified.

**The next thing to do:**
1. Upload 62 to **Internal testing** (draft release already open and empty there).
2. Install it from Play on the phone and use it — this is the first time the *release* build
   of this code runs anywhere.
3. **Promote** to Closed testing. The 12 testers only see it at this step.

**Decisions waiting on the user:**
- Promote to **Production** (no new upload needed once a build is on a track).
- **Search suggestions:** the dropdown is gone (§2b). Move its folder path onto the result
  cards, or accept losing it? Asked twice, still unanswered.
- **The cleanup/refactor pass** the user pasted on 12 Oct. Assessed, not run, and the
  assessment is worth keeping:
  - Most of it does not apply — no backend, no database, no API routes, no auth server.
  - Nothing to remove from dependencies: 7 deps, all used.
  - §6 already covers the security half.
  - **There are no tests at all**, no lint config, no type checking. "Run all available
    checks" means a build, nothing more.
  - **The dangerous part is "remove unused code."** 10 functions are reached only through
    inline `onclick=` in `index.html`, 4 of which appear exactly once in `app.js` — their own
    definition — and `app.js` writes `onclick=` into HTML strings in 11 more places. A
    dead-code pass deletes those, **the build passes**, and buttons die silently. §9 mistake
    #5 is this exact failure already happening once.
  - Even `console.log` removal is not mechanical: of the six, the one at the `AbortError`
    branch of the share handler is the only statement in its branch, and dropping the branch
    sends a user-cancelled share into the error path.
  - Safe subset, after 62 ships: drop `docs/archive` (60K, never shipped), audit the 287
    `addEventListener` calls for cleanup on modal close, and only then consider splitting
    `app.js` (19,673 lines) — with a smoke-test script written first.
- **Which icon is actually live on the listing?** The store icon and the feature graphic must
  match, and it is not settled which one they should match. `icon/docman-play-icon-512-
  UPLOAD-THIS.png` is the **glossy** one; the user says the new icon is the **flat** one
  (`Downloads/Flat DOCMAN Logo Icon.png`, 1254px, black outlines, yellow MAN), which is not in
  the assets folder at all. If the flat one is the real one, it still needs a 512 cut for the
  listing.

**Done, 12 Oct evening:** the feature graphic no longer carries the old purple icon —
`DOCMAN Play Store Assets/feature-graphic/docman-feature-graphic-1024x500-flaticon-2026-10-12.png`
(the flat icon composited in; the Sep 21 original is untouched beside it). **Not uploaded.**
The old tile was at x 19..287, y 90..353, found by luminance ramp. The flat source has no
alpha — its corners are solid black — so the shape was cut by flooding in from the four
corners, which never reaches the artwork's own black outlines. The field behind it is not
flat (a warm glow strengthens toward the bottom left), so the corners were filled from pixels
sampled just outside the tile rather than with one colour.

**Deferred in `ISSUES.md`:**
- PDF phrase search
- Opacity dial direction
- Backup password minimum (left at 6 on purpose)

**Settled, do not re-propose:**
- Fast-scrolling a 3000+ page PDF shows blank white pages until pdfium catches up. **Normal,
  not a bug.** A grey page backing was tried to make it read as "loading"; the user rejected
  it. Pages stay white.

## 9. Mistakes made — do not repeat them

1. Mistook **my own stand-in toolbar** for Android's and blamed the inset listener. The real
   cause was the `contextmenu` handler.
2. "Ruled out CSS" using a long press — an invalid test (see §7).
3. Wrote `/s+/g` instead of `/\s+/g` **twice** — heredocs and template literals eat
   backslashes, so note snippets lost every "s". Write replacements to a file, or use
   line-indexed edits, instead of inline heredocs.
4. Let bash eat **backticks** inside a `node -e` string, silently deleting two file paths
   from a document. Quote carefully or write the script to a file first.
5. Deleted `registerPlugin(BackupSavePlugin.class)` while removing another plugin. **The build
   still passed** — the class compiled in, it just was not on the bridge. Caught only by
   asking the running app for all 14 plugins by name.
6. `sed -i` on `max-width: 380px` hit **four** media queries instead of one. Count matches
   before writing.
7. Installed builds and restarted the app **while the user was mid-test**.
8. Changed the user's own "SkIn" note during testing (colour/lined/font). Restored it. Their
   data in DOCMAN dev is still their data.
9. Put a finished AAB in `Desktop\DOCMAN Play Store Assets\` — the **stray** folder whose name
   is nearly identical to the real one inside `Desktop\DOCMAN PLAY STORE\`. That folder once
   burned versionCode 54. The real one is
   `Desktop\DOCMAN PLAY STORE\DOCMAN Play Store Assets\release\`.

## 15 Oct 2026 — three changes since 65 (all in DOCMAN dev, none built into an AAB, none confirmed on the phone)
1. **Restore water level** follows the percentage (`app.js`, restore `report()` now calls
   `setBusyFill(pct)`). Before, only the text moved; the water stayed at its idle level.
2. **Note ink** darker/heavier: `#0b1220`, weight 500 (`style.css`, both note-paper rules).
3. **One expiry banner per date + alert kind** ("3 documents expire today"), no names on the
   lock screen (user rejected naming documents for privacy). Group key is
   `docman-expiry-<date>-<kind>`; the plugin patch (`TimedNotificationPublisher`) posts a
   sibling arriving within 90 s under the first one's id so it does not sound again. Patch
   file was written by hand because patch-package cannot diff here. Buttons only on a
   single-document banner; tapping a multi banner opens `showExpiryTodayModal` with all of
   them. Any change queues a re-arm of all alerts (1.5 s) so counts stay right.
- **Observed 14 Oct:** four documents gave four separate identical banners at 07:00 — one per
  document; the replace-the-repeat behaviour works per document. Change 3 is the response.
- **Open:** reminders still one banner each (offered, not decided). The 21:00 stop is still
  unobserved. Version number 1.0.4 vs 1.0.0 still undecided. Nothing committed.
- **Environment:** `JAVA_HOME` is unset; use Android Studio's JDK
  (`C:/Program Files/Android/Android Studio/jbr`). adb is at `%LOCALAPPDATA%/Android/Sdk/platform-tools`.
  Install = `npx cap sync android` then `android/gradlew installDebug`. Python is not installed.

**Decided 15 Oct:** the final AAB reads versionName 1.0.0 (code 66+). build.gradle edited only at the final build.

## 15 Oct 2026 (later) — expiry cards with document pictures
Built in `www/app.js` (`docCardHtml` etc., just above `showExpiringDocumentsPanel`) and `www/style.css`
(`.dc-*`, end of file). User approved the look from a rendered preview (card background sampled from
their reference: navy, magenta left glow, blue top-right). Own image wins; else name hint; else file
type. PDF first-page render is NOT built (needs a PdfNativePlugin method). Dashboard rows untouched.
Not installed: the phone was unplugged. Install = `npx cap sync android`, then `android/gradlew installDebug`
with JAVA_HOME at Android Studio's jbr.
