#!/usr/bin/env bash
# Runs on an already-booted Android TV emulator. Uses only a local fixture server.
set -euo pipefail

PORT=8765
LOG="${RUNNER_TEMP:-/tmp}/tv-browser-fixture.log"
UI="${RUNNER_TEMP:-/tmp}/tv-browser-ui.xml"
python3 -u -m http.server "$PORT" --bind 127.0.0.1 --directory tv-browser/tests/fixtures > "$LOG" 2>&1 &
SERVER=$!
cleanup() {
  local result=$?
  kill "$SERVER" 2>/dev/null || true
  if [ "$result" -ne 0 ]; then
    echo '--- Failure diagnostics ---'
    cat "$LOG" || true
    adb shell dumpsys activity activities | grep -E 'mResumedActivity|topResumedActivity' || true
    adb logcat -d -v time | grep -Ei 'AndroidRuntime|FATAL EXCEPTION|com.visujju.tvbrowser|lowmemorykiller|lmkd|inputmethod|process .* died|killing' | grep -Ev 'AppsFilter|katniss_' | tail -250 || true
  fi
}
trap cleanup EXIT
# Keep Play Store auto-updates from restarting Google Play Services (and
# dependent apps) in the middle of this isolated, local-fixture test.
adb shell pm disable-user --user 0 com.android.vending
adb reverse "tcp:$PORT" "tcp:$PORT"
adb logcat -c
adb install -r tv-browser/app/build/outputs/apk/debug/app-debug.apk
# Start with a clean app state even if a previous emulator attempt was interrupted.
adb shell pm clear com.visujju.tvbrowser
adb shell wm size 1920x1080
adb shell wm density 320
adb shell input keyevent KEYCODE_WAKEUP
adb shell am start -W -n com.visujju.tvbrowser/.MainActivity

# uiautomator waits for UI idle; a dump checks the real Android view hierarchy.
show_focus() {
  echo "--- Current activity and focused views ---"
  adb shell dumpsys activity activities | grep -E 'mResumedActivity|topResumedActivity' || true
  adb shell uiautomator dump /sdcard/tv-browser-window.xml >/dev/null
  adb exec-out cat /sdcard/tv-browser-window.xml > "$UI"
  python3 - "$UI" <<'PY'
import sys, xml.etree.ElementTree as ET
nodes = list(ET.parse(sys.argv[1]).getroot().iter('node'))
print('Packages:', sorted({n.get('package', '') for n in nodes}))
print('Focused:', [(n.get('class'), n.get('text'), n.get('content-desc'))
                   for n in nodes if n.get('focused') == 'true'])
print('WebViews:', [(n.get('text'), n.get('content-desc'), n.get('focused'), n.get('bounds'))
                   for n in nodes if n.get('class') == 'android.webkit.WebView'])
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
  show_focus || true
  adb logcat -d -v time | grep -E 'com.visujju.tvbrowser|AndroidRuntime|lowmemorykiller|lmkd' | tail -100 || true
  return 1
}
wait_for_title() {
  local title="$1"
  for attempt in $(seq 1 12); do
    adb shell uiautomator dump /sdcard/tv-browser-window.xml >/dev/null
    adb exec-out cat /sdcard/tv-browser-window.xml > "$UI"
    if python3 - "$UI" "$title" <<'PY'
import sys, xml.etree.ElementTree as ET
nodes = ET.parse(sys.argv[1]).getroot().iter('node')
sys.exit(0 if any(n.get('class') == 'android.webkit.WebView' and n.get('text') == sys.argv[2]
                  for n in nodes) else 1)
PY
    then
      echo "WebView rendered: $title"
      return 0
    fi
  done
  echo "Timed out waiting for page title: $title"
  show_focus || true
  return 1
}
wait_for_text() {
  local text="$1"
  for attempt in $(seq 1 10); do
    adb shell uiautomator dump /sdcard/tv-browser-window.xml >/dev/null
    adb exec-out cat /sdcard/tv-browser-window.xml > "$UI"
    if python3 - "$UI" "$text" <<'PY'
import sys, xml.etree.ElementTree as ET
nodes = ET.parse(sys.argv[1]).getroot().iter('node')
sys.exit(0 if any(n.get('text') == sys.argv[2] for n in nodes) else 1)
PY
    then
      echo "Found on TV: $text"
      return 0
    fi
  done
  echo "Timed out waiting for on-screen text: $text"
  show_focus || true
  return 1
}
assert_fullscreen() {
  python3 - "$UI" <<'PY'
import re, sys, xml.etree.ElementTree as ET
nodes = list(ET.parse(sys.argv[1]).getroot().iter('node'))
assert not any(n.get('content-desc') == 'Open address or search' for n in nodes), 'Toolbar is still visible'
assert any(n.get('text') == 'HTTP • NOT ENCRYPTED' for n in nodes), 'Full-screen HTTP warning is missing'
views = [n for n in nodes if n.get('class') == 'android.webkit.WebView']
assert views, 'No WebView on screen'
bounds = [tuple(map(int, re.findall(r'\d+', v.get('bounds', '')))) for v in views]
assert any(len(b) == 4 and b[0] == 0 and b[1] == 0 and b[2] >= 1900 and b[3] >= 1060
           for b in bounds), bounds
print('Full-screen WebView and HTTP warning verified:', bounds)
PY
}
assert_toolbar() {
  python3 - "$UI" <<'PY'
import sys, xml.etree.ElementTree as ET
nodes = list(ET.parse(sys.argv[1]).getroot().iter('node'))
assert any(n.get('content-desc') == 'Open address or search' for n in nodes), 'Toolbar did not appear'
assert any(n.get('content-desc') == 'Search or enter a web address' and n.get('focused') == 'true'
           for n in nodes), 'Address bar is not focused'
assert any(n.get('content-desc') == 'Return to full-screen page' and n.get('enabled') == 'true'
           for n in nodes), 'FULL control is not available'
print('Toolbar and address focus verified')
PY
}
focus_ad_toggle() {
  adb shell input keyevent KEYCODE_MENU
  show_focus
  assert_toolbar
  # From the address bar: GO, FULL, HOME, SAVE, SAVED, CLEAR, BLOCK.
  adb shell input keyevent KEYCODE_DPAD_RIGHT KEYCODE_DPAD_RIGHT KEYCODE_DPAD_RIGHT \
    KEYCODE_DPAD_RIGHT KEYCODE_DPAD_RIGHT KEYCODE_DPAD_RIGHT KEYCODE_DPAD_RIGHT
  show_focus
  python3 - "$UI" <<'PY'
import sys, xml.etree.ElementTree as ET
nodes = list(ET.parse(sys.argv[1]).getroot().iter('node'))
assert any(n.get('focused') == 'true' and n.get('content-desc', '').startswith('Ad blocking ')
           for n in nodes), 'Ad-block toggle is not remote-focusable'
print('Ad-block toggle is focused')
PY
}

show_focus
# Optional visual diagnostic for the isolated emulator (contains no user data).
if [ "${TV_BROWSER_CAPTURE_HOME:-0}" = 1 ]; then
  adb exec-out screencap -p > "${RUNNER_TEMP:-/tmp}/tv-browser-home.png"
  cat > "${RUNNER_TEMP:-/tmp}/ScaleScreenshot.java" <<'JAVA'
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.File;
import javax.imageio.ImageIO;
class ScaleScreenshot {
    public static void main(String[] args) throws Exception {
        BufferedImage original = ImageIO.read(new File(args[0]));
        BufferedImage scaled = new BufferedImage(720, 405, BufferedImage.TYPE_INT_RGB);
        Graphics2D graphics = scaled.createGraphics();
        graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
        graphics.drawImage(original, 0, 0, 720, 405, null);
        graphics.dispose();
        ImageIO.write(scaled, "jpg", new File(args[1]));
    }
}
JAVA
  java -Djava.awt.headless=true "${RUNNER_TEMP:-/tmp}/ScaleScreenshot.java" "${RUNNER_TEMP:-/tmp}/tv-browser-home.png" "${RUNNER_TEMP:-/tmp}/tv-browser-home.jpg"
  printf '::notice file=tv-browser/README.md,line=1,title=TV home screenshot::%s\n' "$(base64 -w0 "${RUNNER_TEMP:-/tmp}/tv-browser-home.jpg")"
fi
python3 - "$UI" <<'PY'
import sys, xml.etree.ElementTree as ET
nodes = list(ET.parse(sys.argv[1]).getroot().iter('node'))
labels = [(n.get('text', ''), n.get('content-desc', ''), n.get('focused', '')) for n in nodes]
print('Home screen:', labels)
assert any('TV BROWSER' in text for text, _, _ in labels), 'App home did not launch'
assert any('made bigger.' in text for text, _, _ in labels), 'Home headline is missing'
assert any('Search or enter an address' in desc and focused == 'true'
           for _, desc, focused in labels), 'Home search is not initially focused'
assert any(desc == 'Ad blocking on; select to turn off' for _, desc, _ in labels), 'Ad blocking is not on by default'
for label in ('Cinejoy.pk', 'PVRPlay', 'Netmirror.plus', 'Arena.ai',
              'Google', 'YouTube', 'Wikipedia', 'DuckDuckGo'):
    assert any(n.get('content-desc', '').startswith(label + ',')
               and n.get('clickable') == 'true' and n.get('focusable') == 'true'
               for n in nodes), f'{label} shortcut is missing or not remote-focusable'
print('Home headline and all shortcuts are available')
PY

# Check that the D-pad can leave the Home search for the shortcut grid and return.
adb shell input keyevent KEYCODE_DPAD_RIGHT
show_focus
python3 - "$UI" <<'PY'
import sys, xml.etree.ElementTree as ET
nodes = list(ET.parse(sys.argv[1]).getroot().iter('node'))
labels = ('Cinejoy.pk,', 'PVRPlay,', 'Netmirror.plus,', 'Arena.ai,',
          'Google,', 'YouTube,', 'Wikipedia,', 'DuckDuckGo,')
assert any(n.get('focused') == 'true' and n.get('content-desc', '').startswith(labels)
           for n in nodes), 'D-pad could not reach a shortcut from Home search'
print('D-pad reached the shortcut grid')
PY
# Each row has two cards. Verify a right-and-left round trip without losing focus.
first_card=$(python3 - "$UI" <<'PY'
import sys, xml.etree.ElementTree as ET
nodes = ET.parse(sys.argv[1]).getroot().iter('node')
print(next(n.get('content-desc', '') for n in nodes if n.get('focused') == 'true'))
PY
)
case "$first_card" in
  'Cinejoy.pk,'*) second_card='PVRPlay,' ;;
  'Netmirror.plus,'*) second_card='Arena.ai,' ;;
  'Google,'*) second_card='YouTube,' ;;
  'Wikipedia,'*) second_card='DuckDuckGo,' ;;
  *) echo "Expected the first card in a row, found: $first_card"; exit 1 ;;
esac
adb shell input keyevent KEYCODE_DPAD_RIGHT
show_focus
python3 - "$UI" "$second_card" <<'PY'
import sys, xml.etree.ElementTree as ET
nodes = ET.parse(sys.argv[1]).getroot().iter('node')
assert any(n.get('focused') == 'true' and n.get('content-desc', '').startswith(sys.argv[2])
           for n in nodes), 'D-pad did not reach the neighboring shortcut'
print('D-pad reached the neighboring shortcut')
PY
adb shell input keyevent KEYCODE_DPAD_LEFT
show_focus
python3 - "$UI" "$first_card" <<'PY'
import sys, xml.etree.ElementTree as ET
nodes = ET.parse(sys.argv[1]).getroot().iter('node')
assert any(n.get('focused') == 'true' and n.get('content-desc') == sys.argv[2]
           for n in nodes), 'D-pad did not return to the first shortcut'
PY
adb shell input keyevent KEYCODE_DPAD_LEFT
show_focus
python3 - "$UI" <<'PY'
import sys, xml.etree.ElementTree as ET
nodes = list(ET.parse(sys.argv[1]).getroot().iter('node'))
assert any(n.get('focused') == 'true' and n.get('content-desc') == 'Search or enter an address'
           for n in nodes), 'D-pad could not return to Home search'
PY

# Activate the home search, enter the local URL using keyboard events, and submit it.
adb shell input keyevent KEYCODE_DPAD_CENTER
adb shell input text "http://127.0.0.1:$PORT/"
adb shell input keyevent KEYCODE_ENTER
wait_for_request '/'
wait_for_title 'TV Browser remote test'
wait_for_text 'TV focus ready'
wait_for_text 'FOCUSED: none'
wait_for_text 'AD: hidden'
wait_for_text 'HELP: visible'
show_focus
assert_fullscreen

# Ad filtering hides a marked floating ad, keeps a helpful panel, and can be
# turned off and back on using only D-pad controls. Each toggle reloads the page.
focus_ad_toggle
adb shell input keyevent KEYCODE_DPAD_CENTER
wait_for_text 'AD: visible'
wait_for_text 'HELP: visible'
focus_ad_toggle
adb shell input keyevent KEYCODE_DPAD_CENTER
wait_for_text 'AD: hidden'
wait_for_text 'HELP: visible'
wait_for_text 'TV focus ready'
wait_for_text 'FOCUSED: none'

# Start from an unfocused page whose HTML order differs from its visual grid.
# Real D-pad events should follow geometry, not a fixed HTML/tab sequence.
adb shell input keyevent KEYCODE_DPAD_RIGHT
wait_for_text 'FOCUSED: first'
wait_for_text 'SPATIAL: handled'
adb shell input keyevent KEYCODE_DPAD_DOWN
wait_for_text 'FOCUSED: third'
adb shell input keyevent KEYCODE_DPAD_UP
wait_for_text 'FOCUSED: first'
adb shell input keyevent KEYCODE_DPAD_RIGHT
wait_for_text 'FOCUSED: second-poster'
show_focus
adb shell input keyevent KEYCODE_DPAD_CENTER
wait_for_request '/clicked.html?via=poster'
wait_for_title 'Remote click succeeded'
show_focus

# OK opens a focused web form field. Exercise keyboard text entry and Enter;
# this simulates key input, not Google TV phone pairing.
adb shell input keyevent KEYCODE_DPAD_CENTER
show_focus
adb shell input text remote_keyboard_test
show_focus
python3 - "$UI" <<'PY'
import sys, xml.etree.ElementTree as ET
nodes = list(ET.parse(sys.argv[1]).getroot().iter('node'))
assert any('remote_keyboard_test' in n.get('text', '') for n in nodes), 'Web form did not receive text'
print('Web form text input verified')
PY
# Close the TV keyboard, then test Enter with the editable field still focused.
adb shell input keyevent KEYCODE_BACK
show_focus
adb shell input keyevent KEYCODE_ENTER
wait_for_request '/submitted.html?query=remote_keyboard_test'
wait_for_title 'Remote form submitted'
show_focus
assert_fullscreen

# Google TV phone remotes supply the same D-pad events. Holding Up at the top
# reveals the address bar; Down returns to the page with no browser chrome.
adb shell input keyevent --longpress KEYCODE_DPAD_UP
show_focus
assert_toolbar
adb shell input keyevent KEYCODE_DPAD_DOWN
show_focus
assert_fullscreen

# Menu also reveals the toolbar; its FULL button returns to the page.
adb shell input keyevent KEYCODE_MENU
show_focus
assert_toolbar
adb shell input keyevent KEYCODE_DPAD_RIGHT KEYCODE_DPAD_RIGHT
show_focus
python3 - "$UI" <<'PY'
import sys, xml.etree.ElementTree as ET
nodes = list(ET.parse(sys.argv[1]).getroot().iter('node'))
assert any(n.get('content-desc') == 'Return to full-screen page' and n.get('focused') == 'true'
           for n in nodes), 'D-pad could not focus FULL'
PY
adb shell input keyevent KEYCODE_DPAD_CENTER
show_focus
assert_fullscreen

# A long Back opens controls, a short Back closes them, and the next Back
# navigates to the previous page instead of leaving the browser.
adb shell input keyevent --longpress KEYCODE_BACK
show_focus
assert_toolbar
adb shell input keyevent KEYCODE_BACK
show_focus
assert_fullscreen
adb shell input keyevent KEYCODE_BACK
wait_for_title 'Remote click succeeded'
show_focus
python3 - "$UI" <<'PY'
import sys, xml.etree.ElementTree as ET
nodes = list(ET.parse(sys.argv[1]).getroot().iter('node'))
assert any(n.get('class') == 'android.webkit.WebView' and n.get('text') == 'Remote click succeeded'
           for n in nodes), 'Back did not return to the previous page'
print('Back navigation verified')
PY

# There must be no fatal app exception during the interaction.
if adb logcat -d -s AndroidRuntime:E | grep -Fq 'FATAL EXCEPTION'; then
  adb logcat -d -s AndroidRuntime:E
  exit 1
fi
printf '\nTV Browser shortcuts, full-screen navigation, HTTP warning and D-pad controls passed.\n'
cat "$LOG"
