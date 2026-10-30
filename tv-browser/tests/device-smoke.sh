#!/usr/bin/env bash
# Runs on an already-booted Android TV emulator. Uses only a local fixture server.
set -euo pipefail

PORT=8765
LOG="${RUNNER_TEMP:-/tmp}/tv-browser-fixture.log"
UI="${RUNNER_TEMP:-/tmp}/tv-browser-ui.xml"
python3 -u -m http.server "$PORT" --bind 127.0.0.1 --directory tv-browser/tests/fixtures > "$LOG" 2>&1 &
SERVER=$!
trap 'kill "$SERVER" 2>/dev/null || true' EXIT
adb reverse "tcp:$PORT" "tcp:$PORT"
adb logcat -c
adb install -r tv-browser/app/build/outputs/apk/debug/app-debug.apk
adb shell wm size 1920x1080
adb shell wm density 320
adb shell input keyevent KEYCODE_WAKEUP
adb shell am start -W -n com.visujju.tvbrowser/.MainActivity

# uiautomator waits for UI idle; a dump checks the real Android view hierarchy.
adb shell uiautomator dump /sdcard/tv-browser-window.xml >/dev/null
adb exec-out cat /sdcard/tv-browser-window.xml > "$UI"
python3 - "$UI" <<'PY'
import sys, xml.etree.ElementTree as ET
root = ET.parse(sys.argv[1]).getroot()
nodes = list(root.iter('node'))
labels = [(n.get('text', ''), n.get('content-desc', ''), n.get('focused', '')) for n in nodes]
print('Home screen:', labels)
assert any('TV BROWSER' in text for text, _, _ in labels), 'App home did not launch'
assert any('Search or enter an address' in desc and focused == 'true'
           for _, desc, focused in labels), 'Home search is not initially focused'
PY

# Activate the home search, enter the local URL using keyboard events, and submit it.
adb shell input keyevent KEYCODE_DPAD_CENTER
adb shell input text "http://127.0.0.1:$PORT/"
adb shell input keyevent KEYCODE_ENTER

show_focus() {
  echo "--- Current activity and focused views ---"
  adb shell dumpsys activity activities | grep -E 'mResumedActivity|topResumedActivity' || true
  adb shell uiautomator dump /sdcard/tv-browser-window.xml >/dev/null || true
  adb exec-out cat /sdcard/tv-browser-window.xml > "$UI" || true
  python3 - "$UI" <<'PY'
import sys, xml.etree.ElementTree as ET
try:
    nodes = list(ET.parse(sys.argv[1]).getroot().iter('node'))
    print('Packages:', sorted({n.get('package', '') for n in nodes}))
    print('Focused:', [(n.get('class'), n.get('text'), n.get('content-desc'))
                       for n in nodes if n.get('focused') == 'true'])
    print('WebViews:', [(n.get('text'), n.get('content-desc'), n.get('focused'))
                       for n in nodes if n.get('class') == 'android.webkit.WebView'])
except ET.ParseError as error:
    print('Could not parse window:', error)
PY
}
wait_for_request() {
  local path="$1"
  for attempt in $(seq 1 30); do
    if grep -Fq "GET $path " "$LOG"; then return 0; fi
    sleep 1
  done
  echo "Timed out waiting for GET $path"
  cat "$LOG"
  show_focus
  adb logcat -d -v time | grep -E 'com.visujju.tvbrowser|AndroidRuntime|lowmemorykiller|lmkd' | tail -100 || true
  return 1
}
wait_for_request '/'
show_focus

# The fixture is one viewport-sized link; the browser's center pointer should click it.
adb shell input keyevent KEYCODE_DPAD_CENTER
show_focus
wait_for_request '/clicked.html'

# There must be no fatal app exception during the interaction.
if adb logcat -d -s AndroidRuntime:E | grep -Fq 'FATAL EXCEPTION'; then
  adb logcat -d -s AndroidRuntime:E
  exit 1
fi
printf '\nTV Browser launched, submitted an address, and clicked a page using D-pad OK.\n'
cat "$LOG"
