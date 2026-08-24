# DOCMAN — Native Android Setup (Capacitor)

This folder is a ready-made Capacitor project wrapping your DOCMAN PWA.

## What's already done
- `www/` — a copy of your PWA (index.html, app.js, style.css, sw.js, manifest.json, icons, Images, vendor)
- `capacitor.config.json` — app id `com.oarcel.docman`, app name `DOCMAN`, theme color matched to your `#0a1128`
- `android/` — full native Android Studio project already generated, with
  `@capacitor/filesystem`, `@capacitor/haptics`, `@capacitor/share` wired in
  (these are the exact plugins your `app.js` already checks for via `window.Capacitor.Plugins`)
- `assets/icon.png` — your existing 512×512 icon, staged for icon/splash generation

## Steps to run (in Git Bash, inside this folder)

### 1. Install dependencies
    npm install

### 2. Generate real app icons + splash screen (replaces the default Capacitor placeholder icon)
    npm install --save-dev @capacitor/assets
    npx capacitor-assets generate --android

This reads `assets/icon.png` / `assets/splash.png` and writes all mipmap
densities + splash screens into `android/app/src/main/res/`.

### 3. Sync web assets + plugins into the native project
    npx cap sync android

Run this again any time you change files in `www/`.

### 4. Open in Android Studio
    npx cap open android

Let Gradle sync finish (first time can take a few minutes — downloads
Gradle + Android deps). Then just hit Run ▶ with an emulator or a USB-connected
device (enable USB debugging).

### 5. Keeping www/ in sync with your live PWA
`www/` is a **copy**, not a symlink, so your GitHub Pages source is untouched.
Whenever you update the real PWA files, re-copy them here, e.g.:

    cp -r /path/to/DOCMAN-V1-main/{index.html,app.js,style.css,sw.js,manifest.json,icons,Images,vendor} www/
    npx cap sync android

## Two things worth doing before your first real build

1. **Gate the service worker so it doesn't register inside the Capacitor WebView.**
   Your `index.html` currently registers `sw.js` unconditionally. Inside the
   native app you don't need it (Capacitor already serves everything locally
   and offline), and running it can cause stale-cache weirdness on native.
   Wrap the registration:

   ```js
   if ('serviceWorker' in navigator && !window.Capacitor) {
     navigator.serviceWorker.register('./sw.js')...
   }
   ```

2. **462-page PDF crash fix.** Since this native wrapper uses the same
   Android WebView + PDFium WASM path as your PWA, the large-PDF
   out-of-memory crash you're debugging will happen in the native app too.
   Worth landing the `defaultBufferSize` + JPEG-render-format fix before
   your first Play Store build/test, since it's the same underlying issue,
   not something Capacitor fixes for you.

## App signing (later, for Play Store / release APK)
Debug builds run fine as-is. For a release build you'll need a keystore:

    keytool -genkey -v -keystore docman-release.keystore -alias docman -keyalg RSA -keysize 2048 -validity 10000

Then configure `android/app/build.gradle` `signingConfigs` — ask me when you
get to this step and I'll walk you through it.
