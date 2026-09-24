# DOCMAN — Play Store assets

## Upload these five things

| Item | Where in Play Console |
|---|---|
| `docman_play_store_icon_512.png` | App icon (512 x 512) |
| `docman-feature-graphic-1024x500.png` | Feature graphic (1024 x 500) |
| `final-8/` — all 8 PNGs | Phone screenshots (1080 x 2100) |
| `store_listing_copy.md` | Copy-paste the title and descriptions |
| `play_console_data_safety_and_rating.md` | Type these answers into the forms |

Privacy policy URL: **https://abjincy-dot.github.io/docman-privacy/** (already live)

The AAB to upload is built at
`docman-native/android/app/build/outputs/bundle/release/app-release.aab`

## Also here

- `privacy-policy/` — source of the live policy page. Edit `index.html`, push it
  to the `abjincy-dot/docman-privacy` repo, and GitHub Pages updates in ~30s.
- `screen-width-sweep/` — test tool. Loads the real app at 320/360/384/412/800dp
  and reports any element that overflows or collides. Run it after any UI change.
  See its own README.
- `_sources/` — originals kept in case something needs remaking: the feature
  graphic you supplied at its original 1730x909, the 3D folder
  icon source, the four superseded feature graphics and their HTML sources, the 17
  uncropped screenshots, and an OCR test PDF. Nothing here gets uploaded.

## Screenshot rules (why they are 1080 x 2100)

The S23 shoots 1080 x 2316, which is 2.14:1. Play caps screenshots at 2:1, so
96px of status bar and 120px of gesture bar are cropped off, giving 1.944:1.
