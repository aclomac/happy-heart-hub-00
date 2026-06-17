#!/usr/bin/env bash
# Copies generated ERPOVO placeholder icons and splash into the
# native Android project AFTER `bun run cap:add:android` has created
# the /android folder. Safe to re-run.
#
# Usage:
#   bun run cap:add:android        # one-time, creates ./android
#   bash scripts/install-android-assets.sh
#   bun run cap:sync
#   bun run android:build:debug
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/public/android"
ANDROID="$ROOT/android/app/src/main"

if [ ! -d "$ANDROID" ]; then
  echo "ERROR: $ANDROID not found. Run 'bun run cap:add:android' first." >&2
  exit 1
fi

declare -A SIZES=(
  [mdpi]=48 [hdpi]=72 [xhdpi]=96 [xxhdpi]=144 [xxxhdpi]=192
)

for density in "${!SIZES[@]}"; do
  dir="$ANDROID/res/mipmap-$density"
  mkdir -p "$dir"
  cp "$SRC/icons/ic_launcher-$density.png" "$dir/ic_launcher.png"
  cp "$SRC/icons/ic_launcher-$density.png" "$dir/ic_launcher_round.png"
  cp "$SRC/icons/ic_launcher-$density.png" "$dir/ic_launcher_foreground.png"
done

# Splash (used by @capacitor/splash-screen via androidSplashResourceName: "splash")
for density in mdpi hdpi xhdpi xxhdpi xxxhdpi; do
  dir="$ANDROID/res/drawable-$density"
  mkdir -p "$dir"
  cp "$SRC/splash-2732.png" "$dir/splash.png"
done
mkdir -p "$ANDROID/res/drawable"
cp "$SRC/splash-2732.png" "$ANDROID/res/drawable/splash.png"

echo "✓ ERPOVO placeholder icons + splash installed under android/app/src/main/res/"
echo "  Replace with branded artwork before Play Store release."
