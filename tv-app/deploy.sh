#!/bin/bash
# My TV: download the latest version, add your photos, install it on the TV and open it.
# Run with:  bash ~/tizen-projects/HelloTV/deploy.sh

TV=192.168.1.5:26101
PROFILE=BU8000
APP_DIR="$HOME/tizen-projects/HelloTV"
PHOTOS="$HOME/Pictures/TV Photos"
URL=https://raw.githubusercontent.com/abjincy-dot/docman-v2/claude/fervent-fermat-mrg4wl/tv-app
TIZEN="$HOME/tizen-studio/tools/ide/bin/tizen"
SDB="$HOME/tizen-studio/tools/sdb"

fail() { echo; echo "❌ $1"; echo "   Send Claude a photo of this window."; exit 1; }

cd "$APP_DIR" || fail "Folder $APP_DIR not found"

echo "1/5  Downloading the latest My TV..."
for f in index.html config.xml icon.png deploy.sh; do
  curl -fsSL "$URL/$f" -o "$f.new" || fail "Could not download $f"
done
for f in index.html config.xml icon.png deploy.sh; do mv "$f.new" "$f"; done

echo "2/5  Adding your photos from: $PHOTOS"
mkdir -p "$PHOTOS"
rm -rf photos && mkdir photos
shopt -s nullglob nocaseglob
n=0; list=""
for p in "$PHOTOS"/*.jpg "$PHOTOS"/*.jpeg "$PHOTOS"/*.png "$PHOTOS"/*.heic; do
  n=$((n+1))
  sips -s format jpeg -s formatOptions 80 -Z 1920 "$p" --out "photos/$n.jpg" >/dev/null 2>&1 || { n=$((n-1)); continue; }
  list="$list\"photos/$n.jpg\","
done
echo "var MY_PHOTOS = [${list%,}];" > photos.js
echo "     $n photos added"

reconnect() {
  "$SDB" disconnect "$TV" >/dev/null 2>&1
  [ "$1" = "hard" ] && { "$SDB" kill-server >/dev/null 2>&1; sleep 1; "$SDB" start-server >/dev/null 2>&1; }
  "$SDB" connect "$TV" >/dev/null 2>&1
  sleep 1
  "$SDB" devices | grep -q "$TV"
}

echo "3/5  Connecting to the TV..."
reconnect || reconnect hard || fail "TV not found. Make sure the TV is ON (not standby) and on the same Wi-Fi."

echo "4/5  Building and installing (this takes about 10 seconds)..."
rm -f ./*.wgt
"$TIZEN" package -t wgt -s "$PROFILE" -- . >/dev/null 2>&1 || fail "Could not build the app"
mv ./*.wgt MyTV.wgt 2>/dev/null
do_install() { OUT=$("$TIZEN" install -n MyTV.wgt -s "$TV" -- . 2>&1); echo "$OUT" | grep -q "install completed"; }
if ! do_install; then
  echo "     Connection was stale, reconnecting and trying again..."
  reconnect hard || fail "Lost the connection to the TV. Make sure the TV is ON."
  do_install || { echo "$OUT" | tail -5; fail "Install failed"; }
fi

echo "5/5  Opening My TV on the TV..."
"$TIZEN" run -p HelloTV001.HelloTV -s "$TV" >/dev/null 2>&1
echo
echo "✅ Done! Look at the TV."
echo "   (If the TV shows the Apps screen, open My TV from the Home row.)"
