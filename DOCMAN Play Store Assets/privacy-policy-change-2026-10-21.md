Privacy policy change, 21 Oct 2026 (PUSHED to abjincy-dot/docman-privacy main, commit d1699b5, live-verified)

Last updated date -> October 21, 2026.
Section 1: new list item "Calendar events you choose to import".
Section 6: new paragraph "Sync Calendar" (read-only, only when the button is pressed and the permission is allowed, never written back, never sent anywhere, permission can be withdrawn, imported reminders stay until deleted).

PLAY CONSOLE - DATA SAFETY FORM MUST BE UPDATED BEFORE UPLOADING THE BUILD THAT HAS READ_CALENDAR (versionCode 76 or later):
- The app now declares android.permission.READ_CALENDAR (runtime permission, asked only when "Sync Calendar" is pressed).
- Data safety: Data types > Calendar > "Calendar events". The app ACCESSES them on the device but does not COLLECT them off the device (nothing is transmitted or shared), so it is declared as not collected, the same way contacts/files are. Check Google's current definitions of "collect" in the form's help before answering; if the form wants it listed, mark: collected = No, shared = No, processed on device only.
- Permissions declaration / App content: no restricted-permission form exists for READ_CALENDAR, but the Console may ask for a justification: "Optional Sync Calendar button on the Reminders screen reads the user's own upcoming calendar events and lists them as reminders on the device. Read only; nothing leaves the device."
- Release notes for the build should mention Sync Calendar.

- Play Data Safety notes: `play_console_data_safety_and_rating.md` Permissions section should list READ_CALENDAR too (see privacy-policy-change-2026-10-21.md).

Also edited locally on 21 Oct: Section 9 now says Save a copy hands the backup to the Google Drive app save screen (or the file picker if Drive is missing); nothing is sent unless the user chooses where it goes.
