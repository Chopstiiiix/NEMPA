#!/usr/bin/env bash
#
# NEMPA — boot the Android emulator with working DNS, then build/install/launch.
#
# The Android emulator's built-in DNS forwarder (10.0.2.3) frequently gets into a
# bad state: raw IPs route fine but hostnames don't resolve, so every Supabase
# fetch fails silently and the feed shows its empty state. Booting with an
# explicit -dns-server fixes it. This script bakes that in so you never hit it.
#
# Usage:
#   ./scripts/run-android.sh            # boot emulator (DNS-safe) + launch app
#   ./scripts/run-android.sh --build    # also build web + cap sync + reinstall APK
#   AVD=Pixel_9_Pro ./scripts/run-android.sh
#
set -euo pipefail

# --- config (override via env) ----------------------------------------------
AVD="${AVD:-Pixel_9_Pro}"
DNS="${DNS:-8.8.8.8,8.8.4.4}"
APP_ID="${APP_ID:-ng.nempa.app}"
ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
JAVA_HOME="${JAVA_HOME:-/Applications/Android Studio.app/Contents/jbr/Contents/Home}"
export ANDROID_HOME JAVA_HOME

ADB="$ANDROID_HOME/platform-tools/adb"
EMULATOR="$ANDROID_HOME/emulator/emulator"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# --- sanity checks -----------------------------------------------------------
[ -x "$EMULATOR" ] || { echo "✗ emulator not found at $EMULATOR"; exit 1; }
if ! "$EMULATOR" -list-avds | grep -qx "$AVD"; then
  echo "✗ AVD '$AVD' not found. Available:"; "$EMULATOR" -list-avds | sed 's/^/    /'
  exit 1
fi

# --- boot emulator if not already running ------------------------------------
if "$ADB" devices | grep -q "emulator-.*device"; then
  echo "▶ emulator already running — reusing it"
else
  echo "▶ booting $AVD with DNS=$DNS ..."
  nohup "$EMULATOR" -avd "$AVD" -dns-server "$DNS" -netdelay none -netspeed full \
    > /tmp/nempa-emulator.log 2>&1 &
  "$ADB" wait-for-device
  echo "  waiting for boot to complete ..."
  until [ "$("$ADB" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; do
    sleep 3
  done
  echo "  ✓ boot complete"
fi

# --- verify DNS actually works -----------------------------------------------
echo "▶ checking DNS resolution inside emulator ..."
if "$ADB" shell "ping -c 1 -W 4 dl.google.com" >/dev/null 2>&1; then
  echo "  ✓ DNS OK"
else
  echo "  ⚠ DNS still failing — try a Cold Boot in Android Studio Device Manager"
fi

# --- optional rebuild + install ----------------------------------------------
if [ "${1:-}" = "--build" ]; then
  echo "▶ building web + cap sync ..."
  ( cd "$PROJECT_DIR" && npm run sync )
  echo "▶ installing debug APK (this is fast after the first build) ..."
  ( cd "$PROJECT_DIR/android" && ./gradlew :app:installDebug )
elif ! "$ADB" shell pm list packages | grep -q "$APP_ID"; then
  echo "▶ app not installed — building + installing ..."
  ( cd "$PROJECT_DIR" && npm run sync )
  ( cd "$PROJECT_DIR/android" && ./gradlew :app:installDebug )
fi

# --- launch ------------------------------------------------------------------
echo "▶ launching $APP_ID ..."
"$ADB" shell monkey -p "$APP_ID" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
echo "✓ done — NEMPA is running on $AVD"
