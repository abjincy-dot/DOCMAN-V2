# DOCMAN — screen sweep report

**Build 63 / 1.0.2** (`app.js?v=597`, `style.css?v=643`) — the same web layer that is in the
AAB now on Internal testing.
Run 13 Oct 2026. **22 screen sizes × 12 screens = 264 checks. Zero failures, zero JS errors.**

---

## Why this exists

The app has only ever run on one phone, a Galaxy S23. No pre-launch report has ever been
generated. Rather than ask the 12 closed testers to install and hunt for faults, the web layer
was served locally and driven through every screen at 22 viewport sizes, from a foldable cover
screen to a tablet.

## What was checked, at every size

| | |
|---|---|
| Home | files tab and notes tab |
| Dashboard | |
| Recents | |
| Favourites | |
| Recycle Bin | |
| Settings | |
| Statistics | |
| Expiring documents | |
| Note editor | opened and closed |
| Search | typed, results rendered, cleared |

And on each of those, four things had to hold:

1. **Nothing painted past the right edge** — except inside a row the user can swipe, which is
   deliberate.
2. **The page itself never scrolls sideways.**
3. **No text cut off** inside its own box by a fixed height.
4. **No button, card or input stranded outside the screen** where a finger cannot reach it.

Any JavaScript error or unhandled rejection was recorded as a failure.

## Sizes

| width | heights |
|---|---|
| 280 | 653 |
| 300 | 540 |
| 320 | 480, 568, 640, 854 |
| 344 | 882 |
| 360 | 640, 740, 800 |
| 375 | 667 |
| 384 | 823 (the S23, the only real device so far) |
| 390 | 844 |
| 393 | 851 |
| 411 | 731 |
| 412 | 915 |
| 428 | 926 |
| 480 | 1024 |
| 540 | 720 |
| 600 | 960 |
| 768 | 1024 |
| 800 | 1280 |

That spans a foldable's outer screen (280), small and budget phones (320–360), the common
Android width (360), the S23 (384), large phones (390–428), and tablets (600–800). Larger
system font or Display size shows up as a narrower CSS width, so the 280–340 rows cover an
ordinary phone with bigger text as well.

## Result

**264 of 264 clean.** No overflow, no sideways scroll, no clipped text, no unreachable
control, no JavaScript error at any size.

### One thing the sweep flagged and then cleared
At 360px the Recents sub-tab row — *Continue Reading · Opened · Added · Modified* — measures
434px against a 360px screen, so "Modified" starts off screen. It is **not a fault**: the row
is `overflow-x: auto` and genuinely scrollable, so it is swiped to like any other scroller.
The first version of the probe called this a failure; the probe was wrong and was corrected to
ignore anything inside a scrollable ancestor.

---

## What this does NOT cover — read this part

The web layer was served over `http://localhost:4173` in a desktop browser. **Capacitor is not
present there**, so everything that reaches native code was never exercised:

- expiry and reminder **notifications** (the whole of §2g)
- the native **PDF viewer**, and every tool inside it
- **biometric** unlock
- the **file picker**, camera, and the ML Kit **document scanner**
- **Filesystem**, Share, Haptics
- anything behind `isNativePlatform()`

It also cannot see anything that only differs on a real device: R8's effect on Java, actual
touch handling, device fonts, manufacturer skins, real memory limits, or genuine Android
version differences. Every size here is an **emulated viewport**, not a phone.

**So: layout and web-layer logic are now evidenced across 22 sizes. Native behaviour is still
evidenced on exactly one phone.** The honest gap is unchanged, it is just much smaller.

## How to run it again

```bash
node tools/serve-www.js        # serves www/ on http://localhost:4173
```

Then open it in the browser pane, skip onboarding, and install `__probe` and `__sweep` (the
two functions used here — they live in this session's transcript, and are worth lifting into
`tools/` if this is repeated). Drive the viewport with the pane's resize, run `__sweep()` per
size, and collect anything that is not `ok`.

Worth doing before any release that touches `www/`, and **essential before the cleanup pass**
in §8, which has no test suite behind it.
