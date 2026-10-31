#!/usr/bin/env bash
# Android TV emulator system services sometimes restart during first boot and
# kill WebView apps that depend on the Google fonts provider. Retry once only
# when logcat confirms that specific emulator condition.
set -euo pipefail
LOG="${RUNNER_TEMP:-/tmp}/lumen-tv-first-attempt.log"
if bash lumen-tv/tests/device-smoke.sh > "$LOG" 2>&1; then
  cat "$LOG"
  exit 0
fi
if adb logcat -d -v brief | grep -E 'Process com\.google\.android\.gms\.persistent .*has died' >/dev/null \
    && adb logcat -d -v brief | grep -E 'Killing .*com\.visujju\.lumentv.*depends on provider com\.google\.android\.gms' >/dev/null; then
  # First-attempt diagnostics remain visible without marking a successful
  # retried check as having application errors.
  sed 's/^::error /::warning /' "$LOG"
  echo 'Google Play Services restarted and killed the app; retrying once on the settled emulator.'
  sleep 10
  bash lumen-tv/tests/device-smoke.sh
else
  cat "$LOG"
  exit 1
fi
