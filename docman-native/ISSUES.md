# DOCMAN — open issues

Started 2026-10-10. Play right now: **58** on Internal testing and in review for
Closed testing (12 testers). Anything marked "in 59" is written but has not
reached a build.

---

## Reported 2026-10-10

Numbered as they were given. Effort is a guess until each one is looked at.

### A. Real faults

**7. A reminder outlives the file it belongs to**
Set a reminder on a file, delete the file, and the reminder still fires. Opening
the notification lands on an error — the file is not there. The alert should go
when the file does, and come back if the file is restored from the Recycle Bin.
Expiry alerts were already handled this way on 2026-10-07; file reminders were
not. *Medium. Data consistency — fix early.*

**8. One reminder still stacks a banner every 30 minutes**
A reminder repeats every 30 minutes for 3 hours (7 times). Each repeat is meant
to replace the one before it, and the node_modules patch that does this tested
clean on 2026-10-08: three alerts in one group left exactly one in the shade.
Reported as still happening, so either that test did not match what the app
really schedules, or something else posts them. *Medium to high — needs
watching on the device over a real 30-minute gap.*

**10. The app-lock screen appears over other apps**
Turn on screen lock, put DOCMAN in the background, open another app, and
DOCMAN's lock window comes up on top of it. *Medium. Visible and alarming;
worth treating as high.*

### B. Confusing or inconsistent

**1. Two settings rows do nearly the same thing**
"Expiry & reminder alerts" and "Reminder delivery" sit near each other and read
alike. The second was added on 2026-10-08. They should be merged, or clearly
separated. *Small.*

**2. The Add Reminder button is yellow**
Expiry and reminder buttons elsewhere use different colours, so this one does
not match. *Small — colour only.*

**6. FILES / NOTES does not go back to FILES**
Switch to NOTES, go home, come back, and it is still on NOTES. It should always
open on FILES. *Small.*

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

**4. Note text cannot be selected or copied**
*Small to medium.*

**9. Paste into a note**
Copy text from a file and paste it into a note. *Small to medium, once 4 is
done.*

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
