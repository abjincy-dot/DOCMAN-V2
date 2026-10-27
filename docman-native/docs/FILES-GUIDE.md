# DOCMAN project: what to keep and what is safe to delete (20 Oct 2026)

`P` = `C:\Users\abiji\Desktop\DOCMAN PLAY STORE`   |   `N` = `P\docman-native`   |   `A` = `P\DOCMAN Play Store Assets`

Nothing here has been deleted yet. This is only the list.

## IMPORTANT: KEEP

| Location | What it is |
|---|---|
| `C:\Users\abiji\Documents\DOCMAN-Keys` | **Signing key. Never delete. Keep a copy on USB or cloud.** Without it the app can never be updated. |
| `N\www\` (app.js, index.html, style.css, manifest.json, Images, Fonts, vendor) | The whole web layer (the real code) |
| `N\android\app\src\` | All native Java code and resources |
| `N\android\app\build.gradle` | versionCode / versionName / signing |
| `N\android\app\proguard-rules.pro` | R8 rules |
| `N\android\build.gradle`, `settings.gradle`, `gradle.properties`, `variables.gradle`, `capacitor.settings.gradle`, `gradlew`, `gradlew.bat`, `gradle\` | Gradle build setup |
| `N\android\keystore.properties`, `N\android\local.properties` | Signing config and SDK path |
| `N\capacitor.config.json`, `N\package.json`, `N\package-lock.json` | Capacitor / npm setup |
| `N\patches\@capacitor+local-notifications+6.1.3.patch` | Notification fix (lost without it) |
| `N\assets\` | Icon source (do not run the assets generator without checking) |
| `N\docs\`, `N\tools\serve-www.js` | Notes and the local test server |
| `N\CLAUDE.md`, `CURRENT_STATE.md`, `PROGRESS.md`, `HANDOVER.md`, `AI_HANDOVER.md`, `DECISIONS.md`, `NEXT_TASK.md`, `ISSUES.md` | Project memory and notes |
| `N\.git`, `N\.gitignore`, `P\.git`, `P\.gitignore` | Version history |
| `N\node_modules\` (152 MB) | Needed for builds; rebuildable with `npm install` |
| `N\preview\` : `shot-light.js`, `light-panel.css`, `card-colour.css`, `stat-card-style.css`, `note-style.css` | Preview tool and the sources of the recent styles |
| `A\release\DOCMAN-1.0.0-versioncode75-UPLOAD-THIS.aab` + `RELEASE-NOTES-versioncode75.txt` | **The file to upload** |
| `A\signing\docman-public-key.pem`, `docman-signing-certificate.pem` | Key certificates |
| `A\icon\`, `A\feature-graphic\` | Store icon and feature graphic |
| `A\screens-2026-10-20\` | Newest screenshots |
| `A\privacy-policy\` | Source of the live privacy policy |
| `A\store_listing_play_console_1.0.0-2026-10-15.txt` | Newest store listing text |
| `A\play_console_data_safety_and_rating.md`, `A\README.md` | Console answers and guide |
| `A\screen-width-sweep\` | UI overflow test tool |

## NOT IMPORTANT: safe to delete

| Location | Size | Why |
|---|---|---|
| `N\app.js` and `N\style.css` (in the root, not in www) | 0.6 MB | Stale Aug/Sep copies that cause confusion |
| `N\android\app\build\` | 912 MB | Rebuilds on the next build |
| `N\android\app\release\app-release.aab` (13 Aug) | 34 MB | Very old build |
| `N\android\.gradle\`, `N\android\build\` | 30 MB | Rebuild automatically |
| `A\release\` versioncode67 to 74 AABs and the old RELEASE-NOTES (70, 71, 73, 74) | about 100 MB | Replaced by 75 |
| `A\screens-your-set-2026-10-19\` | 54 MB | Replaced by the 20 Oct set |
| `N\preview\` all the other files (calendar-icon-v4 to v20, tray, rail, bar, clock and similar) | about 40 MB | Finished experiments |
| `P\backups\*.before-*` (app.js, style.css, index.html) and `calendar-tray-*.png` | about 10 MB | Experiment backups; delete after 75 is tested |
| `A\dev-backups\` | 0.5 MB | Old .bak files |
| `A\store_listing_play_console.txt`, `store_listing_play_console_1.0.0.txt` | tiny | Older versions of the listing text |
| `A\docman_play_store_icon_512.png`, `A\docman-feature-graphic-final-1024x500.png` | 0.7 MB | Newer ones are in icon/ and feature-graphic/ |

## YOUR CALL

| Location | Size | Note |
|---|---|---|
| `A\signing\docman-verification.apk` | 49 MB | Only needed to re-verify the signing |
| `A\_sources\` | 12 MB | Originals for remaking old graphics |
| `P\backups\DOCMAN-backup-2026-09-27-2105.tar.gz` | 21 MB | Older code backup |
| `A\privacy-policy-change-2026-10-*.md` | tiny | Keep the 17 Oct one until that policy is pushed to GitHub |

Before cleaning: nothing since commit 592c388 (15 Oct) is committed. Commit or zip `docman-native` first.
