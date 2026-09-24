# Screen-width sweep

Loads the real app in iframes at the Android width buckets that actually ship
(320 / 360 / 384 / 412 / 800 dp) and walks the DOM at each one, flagging:

- **PAGE** — the document scrolls sideways
- **OFF-SCREEN** — a visible element's right edge is past the viewport
- **OVERLAP** — an absolutely/fixed-positioned element is painted *on top of*
  visible text (confirmed with `elementFromPoint`, so a card's own background
  layer sitting behind its label is not reported)
- **TEXT-SPILL** — text doesn't fit its box and won't ellipsize

`control.html` is the detector's own test: it re-injects the pre-fix header CSS,
which had a known real overlap at 320px. If `control.html` does NOT report
`#settingsBtn covers "MAN"`, the detector is broken and a "clean" result from
`sweep.html` means nothing.

## Running it

The harness reads the app's DOM across an iframe boundary, so it must be served
from the SAME origin as `index.html`:

    cp -r "DOCMAN Play Store Assets/screen-width-sweep" docman-native/www/_sweep
    # serve docman-native/www on :4173, then open
    #   http://localhost:4173/_sweep/control.html   (must report 2 findings)
    #   http://localhost:4173/_sweep/sweep.html     (should report 0)
    rm -rf docman-native/www/_sweep      # never ship this inside www/

It lives outside `www/` because Capacitor copies all of `www/` into the APK.

## Known blind spot

The detector compares element *boxes*. It cannot see crowding caused by a glow,
drop-shadow or artwork that spills outside its box — which is exactly why the
settings gear looked like it touched the wordmark on a 360dp phone while
measuring 26.5px of clearance. Box-level clean still needs one look on a device.

## The other two harnesses

- **`stress-sweep.html`** — same detector, but each state first replaces the
  real names with worst-case ones ("Insurance & Warranty Papers 2024-2025",
  "Scanned_Aadhaar_Card_Front_And_Back_2024_Final_v3.pdf") and/or raises the
  root font size to 130% / 150% to stand in for Android's Font size setting.
  Long names came back clean everywhere; large font did not, and is what
  drove the header clipping fix.
- **`regress.html`** — prints the wordmark size, tagline size and gear
  clearance at each width under DEFAULT settings. Run it after any header
  change to prove a 384dp phone still renders exactly as before:

      320px  wordmark 22.72px  clearance 17.0px
      360px  wordmark 25.56px  clearance 51.4px
      384px  wordmark 27.20px  clearance 49.5px   <- must stay 27.20 / 49.5
      412px  wordmark 27.20px  clearance 77.5px

## Watch out when running

`npx serve` runs out of file descriptors after roughly 35 iframe loads
(`EMFILE: too many open files`) and dies mid-sweep. The symptom is a run
that suddenly reports `[ERROR] Cannot read properties of null` for every
remaining state -- that is the server, not the app. Restart it and re-run
the affected widths.
