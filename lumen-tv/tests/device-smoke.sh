#!/usr/bin/env bash
# Exercise the bundled, offline UI in a real Android TV emulator WebView.
set -euo pipefail
UI="${RUNNER_TEMP:-/tmp}/lumen-tv-window.xml"

show_focus() {
  adb shell uiautomator dump /sdcard/lumen-tv-window.xml >/dev/null
  adb exec-out cat /sdcard/lumen-tv-window.xml > "$UI"
  python3 - "$UI" <<'PY'
import sys, xml.etree.ElementTree as ET
nodes = list(ET.parse(sys.argv[1]).getroot().iter('node'))
print('Packages:', sorted({n.get('package', '') for n in nodes}))
print('Focused:', [(n.get('class'), n.get('text'), n.get('content-desc'))
                   for n in nodes if n.get('focused') == 'true'])
print('WebViews:', [(n.get('text'), n.get('bounds')) for n in nodes
                    if n.get('class') == 'android.webkit.WebView'])
PY
}
cleanup() {
  local result=$?
  if [ "$result" -ne 0 ]; then
    echo '--- Lumen TV failure diagnostics ---'
    show_focus || true
    cat "$UI" || true
    adb shell dumpsys activity activities | grep -E 'mResumedActivity|topResumedActivity' || true
    adb logcat -d -v time | grep -Ei 'lumentv|AndroidRuntime|FATAL EXCEPTION|WebView|chromium|process .* died|lmkd' | tail -200 || true
  fi
}
trap cleanup EXIT

# System updates can restart Play Services during a test run.
adb shell pm disable-user --user 0 com.android.vending || true
adb logcat -c
adb install -r lumen-tv/app/build/outputs/apk/debug/app-debug.apk
adb shell pm clear com.visujju.lumentv
adb shell wm size 1920x1080
adb shell wm density 320
adb shell input keyevent KEYCODE_WAKEUP
adb shell am start -W -n com.visujju.lumentv/.MainActivity

wait_for_node() {
  local label="$1" focused="${2:-any}"
  for attempt in $(seq 1 12); do
    adb shell uiautomator dump /sdcard/lumen-tv-window.xml >/dev/null
    adb exec-out cat /sdcard/lumen-tv-window.xml > "$UI"
    if python3 - "$UI" "$label" "$focused" <<'PY'
import sys, xml.etree.ElementTree as ET
nodes = ET.parse(sys.argv[1]).getroot().iter('node')
label, focused = sys.argv[2:]
sys.exit(0 if any(label.lower() in (n.get('text', '') + ' ' + n.get('content-desc', '')).lower()
                  and (focused != 'focused' or n.get('focused') == 'true') for n in nodes) else 1)
PY
    then echo "Found $label ($focused)"; return 0; fi
  done
  echo "Timed out waiting for $label ($focused)"
  return 1
}

# The HTTPS-looking appassets origin must render the packaged files without
# requesting INTERNET permission. Initial focus and all subsequent key events
# are checked in the actual WebView accessibility hierarchy.
wait_for_node 'Explore title' focused
wait_for_node 'Lumen TV — Stories worth staying in for'
show_focus
adb shell input keyevent KEYCODE_DPAD_RIGHT
wait_for_node 'Add to My List' focused
adb shell input keyevent KEYCODE_DPAD_CENTER
wait_for_node 'In My List' focused
adb shell input keyevent KEYCODE_DPAD_LEFT
wait_for_node 'Explore title' focused
adb shell input keyevent KEYCODE_DPAD_CENTER
wait_for_node 'No video is available to play'
wait_for_node 'In My List' focused
adb shell input keyevent KEYCODE_BACK
wait_for_node 'Explore title' focused

# Down reaches the first image, Right reaches the next, and OK opens it.
adb shell input keyevent KEYCODE_DPAD_DOWN
wait_for_node 'Midnight District, Series, open details' focused
adb shell input keyevent KEYCODE_DPAD_RIGHT
wait_for_node 'Northbound, Movie, open details' focused
adb shell input keyevent KEYCODE_DPAD_CENTER
wait_for_node 'No video is available to play'
wait_for_node 'Northbound'
adb shell input keyevent KEYCODE_BACK
wait_for_node 'Northbound, Movie, open details' focused

# Navigate from the grid to the rail using only arrows, then enter Live TV.
adb shell input keyevent KEYCODE_DPAD_LEFT
wait_for_node 'Midnight District, Series, open details' focused
adb shell input keyevent KEYCODE_DPAD_LEFT
wait_for_node 'Settings' focused
adb shell input keyevent KEYCODE_DPAD_UP
wait_for_node 'Live TV' focused
adb shell input keyevent KEYCODE_DPAD_CENTER
wait_for_node 'NO CHANNELS CONNECTED'
adb shell input keyevent KEYCODE_BACK
wait_for_node 'Explore title' focused

# Local My List survives a full process restart.
adb shell am force-stop com.visujju.lumentv
adb shell am start -W -n com.visujju.lumentv/.MainActivity
wait_for_node 'In My List'
wait_for_node 'Explore title' focused
show_focus
if adb logcat -d -v brief | grep -A4 'FATAL EXCEPTION' | grep -q 'com.visujju.lumentv'; then
  echo 'The app crashed during the test'; exit 1
fi
echo 'Lumen TV offline rendering, D-pad, Back, live-TV state, and persistence passed.'
