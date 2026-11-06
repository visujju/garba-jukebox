#!/usr/bin/env bash
# Android TV emulator system services may restart during first boot and kill
# WebView apps dependent on Google's font provider. Retry only for that case.
set -euo pipefail
LOG="${RUNNER_TEMP:-/tmp}/tv-browser-first-attempt.log"
if bash tv-browser/tests/device-smoke.sh > "$LOG" 2>&1; then
  cat "$LOG"
  exit 0
fi
if adb logcat -d -v brief | grep -E 'Process com\.google\.android\.gms\.persistent .*has died' >/dev/null \
    && adb logcat -d -v brief | grep -E 'Killing .*com\.visujju\.tvbrowser.*depends on provider com\.google\.android\.gms' >/dev/null; then
  sed 's/^::error /::warning /' "$LOG"
  echo 'Google Play Services restarted and killed the browser; retrying once on the settled emulator.'
  sleep 10
  bash tv-browser/tests/device-smoke.sh
else
  cat "$LOG"
  exit 1
fi
