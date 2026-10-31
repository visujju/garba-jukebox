#!/usr/bin/env bash
# Android TV emulator system services can restart during first boot and kill a
# dependent WebView process. Retry once only when Android reports app death;
# a reproducible crash or an ordinary focus/test failure still fails the job.
set -euo pipefail
if bash lumen-tv/tests/device-smoke.sh; then
  exit 0
fi
if adb logcat -d -v brief | grep -E 'Force removing ActivityRecord.*com\.visujju\.lumentv.*app died' >/dev/null; then
  echo 'The emulator killed the app while system services were settling; retrying once.'
  sleep 10
  bash lumen-tv/tests/device-smoke.sh
else
  exit 1
fi
