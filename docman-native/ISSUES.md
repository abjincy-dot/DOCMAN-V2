# DOCMAN — open issues

Started 2026-10-10. Play right now: **58** on Internal testing and in review for
Closed testing (12 testers). Anything marked "needs 59" is written and verified
on the device in DOCMAN dev, but has not reached a Play build.

Section A (7, 8, 10) and all of section B except the back-button sweep (1, 2, 6)
are done as of 2026-10-11. None of section A turned out to be the bug as
described: the delete path was already correct, the alerts were never stacking,
and the lock screen never left the app. Each time the reported symptom was real
and the cause was somewhere else.

---

## Reported 2026-10-10

Numbered as they were given. Effort is a guess until each one is looked at.

### A. Real faults

**7. An alert outlives the document it belongs to** — *fixed, needs 59*
Not the delete path. Deleting was measured on the device: 36 armed alarms went
when the file went, and all 36 came back when it was restored. What was broken
is that an expiry alarm is keyed on **folder path + file name**, and four things
changed one of those without moving the alarm with it:

- renaming a file — 38 alarms left armed under the old name
- moving a file to another folder — the same, under the old path
- renaming a folder or department — every alarm in the whole branch orphaned,
  and every note reminder under it left pointing at a path that no longer
  exists, so "Open note" led nowhere
- emptying the Recycle Bin — a note's reminder row survived the note being gone
  for good, with an Open button leading nowhere

An orphaned alarm still fires, and tapping it lands on "file not available",
which is what was reported. Fixed with one `reKeyFileAlerts` helper called from
all three rename/move paths, plus reminder cleanup on permanent delete. Also:
restoring an already-acknowledged document no longer starts alerting again.

**8. The expiry alert arrives every 30 minutes** — *fixed, needs 59*
Measured on the device with four alerts a minute apart in the real alert's own
shape: the shade held exactly one at a time, 990001 → 990002 → 990003 → 990004,
each replacing the one before. **The group patch works; nothing stacks.** The
complaint was the cadence itself. The expiry day fired every 30 minutes from
07:00 to 21:00 and each repeat is scheduled under its own id, so each arrived as
a fresh banner with sound and vibration — 29 interruptions for one document in
one day. Now 09:00 and 17:00. An "expires tomorrow" alert was added as well,
because nothing used to be said between "in 3 days" and "today", the last two
days anything can still be renewed in time. Slots per document: 38 → 12, which
also matters because Android caps how many an app may keep pending — the old
number ran that budget out after about a dozen dated documents, and documents
past that quietly got no alerts at all.

**10. The app-lock screen appears over other apps** — *fixed, needs 59*
Not the lock screen, which is a DOM overlay and cannot leave the app. It was
the fingerprint prompt the lock screen asks for: that is a native system
dialog, and Android brings DOCMAN forward to host it. Auto Lock runs on a timer
that keeps ticking after DOCMAN is backgrounded, so the lock could arm --
correctly -- while the person was in another app, and then ask for a
fingerprint on top of it.

Locking in the background is right and stays; only the asking now waits for
DOCMAN to be on screen. Measured both halves on the device: arming the lock
while the launcher had focus left focus exactly where it was, with the lock
screen up inside the app; bringing DOCMAN back put `BiometricPromptRoot` in
focus, so unlocking still works.

### B. Confusing or inconsistent

**1. Two settings rows do nearly the same thing** — *fixed, needs 59*
Real, and worse than it looked: both asked for the same three Android
permissions. "Expiry & reminder alerts" (Alerts & security) had the better name,
the better place and a subtitle that said what the state actually was, but
tapping it fired the permission requests directly, showing nothing, and it never
touched battery or autostart. "Reminder delivery" (App) had the screen that
explains each one and does cover them. One row now, with both halves: the kept
row opens that screen, over Settings so Done returns there, and on the way back
it re-reads its own subtitle and re-arms the alarms -- anything scheduled while
a permission was missing had been downgraded to inexact and would have stayed
that way. `fixAlertPermissions` is gone.

**2. The Add Reminder button is yellow** — *fixed, needs 59*
Not only the colour. Three pills sat in that row and two were filled: the
selected tab, and an Add button in amber that read louder than the selection
beside it, so it looked like a third tab. Two tabs and an action are not three
tabs. It is now a round violet "+" -- the panel's own violet, the one the
selected day wears in the calendar just below -- so only the selection stays
filled and the two tabs get the width back (115px to 125px each). Four options
were rendered on the phone and D was chosen.

**6. FILES / NOTES does not go back to FILES** — *fixed, needs 59*
The switch belongs to a folder but was remembered for the whole app, so a choice
made in one folder followed you into the next -- with its files, and anything
just added to it, behind an unexplained tap. Home is where a folder visit ends,
so that is where it goes back to FILES. render() already says "every navigation
lands here", which makes it the one place that catches every route home: the
back button, the breadcrumb, goHome, a department being deleted. The chrome was
split out of setActiveTab so this can put the pill back without re-rendering
(render is what calls it) or ticking the haptics.

**11. Back button behaviour, everywhere**
Check that back returns to the previous screen rather than jumping home, across
the whole app. Three cases have already been found this way (the row menu, the
intro, the reminder-setup screen), so a sweep is worth doing. *Medium — an
audit, not one fix.*

### C. Notes

These four overlap and are best done together.

**3. Note contents are not searchable**
Search should look inside a note, not only at its title. There is a
"searchNotes" toggle in Settings already — check what it covers. *Medium.*

**4 and 9. No Cut/Copy/Paste toolbar, anywhere in the app** — *OPEN*

Correcting an earlier entry here: the nav-bar inset listener was NOT the
cause. That conclusion came from mistaking the app's own stand-in bar, which
was in the build at the time and showed "Select all" and "Paste" in a dark
pill, for Android's. Removing the listener entirely changes nothing.

What is now known, measured without asking anyone to hold a phone -- a double
tap through adb selects a word the way a finger does, and the app's window list
says whether a toolbar exists (the two selection handles are 124x62 each; the
caret handle is 56x68; a toolbar is nothing like either):

- **A plain page in DOCMAN's own WebView gets the toolbar.** Writing a bare
  document over the app and double tapping a word in its textarea selected 9
  characters and produced a 1622x723 window. So the WebView, the activity and
  the native layer are all capable of it.
- **DOCMAN's page does not.** Same gesture in the note editor selects, and no
  toolbar window of any kind is created.

So it is something in the app's own page. Earlier attempts to rule out the CSS
were invalid: they used a long press, and a long press in an editable field
places a caret rather than selecting a word, so those tests proved nothing.

Next: bisect the page. A bare textarea injected into the live app page, then
into the modal, then the note's own -- the double tap needs to be made reliable
first (it only selects sometimes; input keycombination for ctrl+A is accepted
by this device and may be steadier).

The stand-in Copy/Paste bar was removed on request, so notes currently have
neither the system's bar nor one of their own. Restoring it is a few minutes'
work if this stays unsolved.

**5. Press and hold a note to preview it**
Rather than opening it to read. *Medium — new interaction.*

---

## Already written, waiting for build 59

Not in 58.

1. **Backup "Save a copy" went through the share sheet** — on a phone using
   AOSP's Sharesheet it crashed outright, "Intent Resolver keeps stopping",
   leaving the backup stuck on the device. Now uses the system file picker,
   which lists Drive, OneDrive, the SD card and local folders. `38ed38c`.
2. **A copy saved back onto the phone is no safer than the original** — Android
   gives no way to keep local storage out of the picker, so the destination is
   read back and a copy that never left is called out. Not committed.
3. **The reminder-setup screen ignored the back key** — `38ed38c`.
4. **"Create a Password" read as an app password** — now "Create a backup
   password", and the screen says the backup cannot be restored without it.
   Not committed.

---

## Known, deferred

1. **PDF phrase search finds nothing** — single words are found ("working" 1 of
   1, "days" 1 of 1) but "working days" is not, on a PDF whose text layer stores
   the words across a line break. Not OCR, and not the pdfium swap. The fix is
   to collapse whitespace in both page text and query, which also means redoing
   the index mapping the highlight positions use. Deferred 2026-10-08.
2. **Opacity starts at 100 while every other dial starts at 0** — correct, but
   it is the only dial that works backwards. Could become "Transparency 0..100".
   Raised 2026-10-08, no decision.

---

## Done and shipped

- Timezone: "today" came from UTC, so east of Greenwich the app called it
  yesterday until the offset passed (`4ed6e99`, in 56+).
- Navigation bar: eleven rules measured the bar with an inset that reports 0
  here, so buttons sat underneath it (`4ed6e99`).
- 16 KB page sizes: pdfiumandroid 1.0.20 shipped a 4096-aligned library that a
  16 KB device refuses to load (`4ed6e99`).
- The image editor baked pixels on every slider release, so blur and sharpen
  could never be turned down (`4ed6e99`).
- Saving an unedited image still wrote a file and spent a Pro try (`4ed6e99`).
- Document names and reminder text were readable on the lock screen (`c369de9`,
  in 58).
- Two patches to @capacitor/local-notifications lived only in node_modules, and
  any `npm install` reverted them (`319602d`).
