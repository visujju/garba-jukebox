#!/usr/bin/env bash
# Retry only if the emulator itself restarted Google Play Services and killed the app.
set -euo pipefail

if bash tv-browser/tests/device-smoke.sh; then
  exit 0
fi
if adb logcat -d -v brief | grep -E 'Process com\.google\.android\.gms\.persistent .*has died' >/dev/null; then
  echo 'Google Play Services restarted during the test; retrying once on the settled emulator.'
  bash tv-browser/tests/device-smoke.sh
else
  exit 1
fi
