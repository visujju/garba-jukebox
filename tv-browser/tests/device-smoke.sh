#!/usr/bin/env bash
# Runs on an already-booted Android TV emulator. Uses only a local fixture server.
set -Eeuo pipefail
trap 'echo "::error title=TV Browser smoke test::Command failed at line $LINENO: $BASH_COMMAND"' ERR

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
    adb logcat -d -v time > "${RUNNER_TEMP:-/tmp}/tv-browser-logcat.txt" || true
    grep -Ei 'AndroidRuntime|FATAL EXCEPTION|com.visujju.tvbrowser|lowmemorykiller|lmkd|inputmethod|process .* died|killing' "${RUNNER_TEMP:-/tmp}/tv-browser-logcat.txt" | grep -Ev 'AppsFilter|katniss_' | tail -250 || true
    python3 - "$UI" "${RUNNER_TEMP:-/tmp}/tv-browser-logcat.txt" <<'PY' || true
import pathlib, re, sys, xml.etree.ElementTree as ET
try:
    nodes = list(ET.parse(sys.argv[1]).getroot().iter('node'))
    focused = [(n.get('text'), n.get('content-desc')) for n in nodes if n.get('focused') == 'true']
    labels = [n.get('text') or n.get('content-desc') for n in nodes if n.get('text') or n.get('content-desc')]
    hierarchy = ('Focused: ' + str(focused) + '\nLabels: ' + str(labels))[:2500]
    print('::notice title=TV Browser hierarchy::' + hierarchy.replace('%', '%25').replace('\n', '%0A'))
except Exception as exc:
    print('::notice title=TV Browser hierarchy::' + str(exc))
lines = pathlib.Path(sys.argv[2]).read_text(errors='replace').splitlines()
fatal = [i for i, line in enumerate(lines) if 'FATAL EXCEPTION' in line or 'Fatal signal' in line]
stack = lines[fatal[-1]:fatal[-1] + 12] if fatal else []
interesting = [line[:220] for line in lines if re.search(r'ActivityManager.*(Process .*has died|Killing)|lmkd', line, re.I)
               and re.search(r'tvbrowser|gms|webview|lmkd', line, re.I)]
text = '\n'.join(stack + interesting[-12:])[:2500]
print('::notice title=TV Browser Android log::' + text.replace('%', '%25').replace('\n', '%0A'))
PY
  fi
}
trap cleanup EXIT
# Keep Play Store auto-updates from restarting Google Play Services (and
# dependent apps) in the middle of this isolated, local-fixture test.
adb shell pm disable-user --user 0 com.android.vending || true
adb reverse "tcp:$PORT" "tcp:$PORT"
# Let first-boot Android TV services settle before opening WebView.
sleep 15
adb logcat -c
adb install -r tv-browser/app/build/outputs/apk/debug/app-debug.apk
# Start with a clean app state even if a previous emulator attempt was interrupted.
adb shell pm clear com.visujju.tvbrowser
adb shell wm size 1920x1080
adb shell wm density 320
adb shell input keyevent KEYCODE_WAKEUP
adb shell am start -W -n com.visujju.tvbrowser/.MainActivity

# uiautomator can temporarily lose its accessibility connection on an
# emulator. Retry a failed dump instead of mistaking it for an app failure.
dump_ui() {
  for attempt in 1 2 3 4; do
    if adb shell uiautomator dump /sdcard/tv-browser-window.xml >/dev/null 2>&1 \
        && adb exec-out cat /sdcard/tv-browser-window.xml > "$UI" \
        && python3 -c 'import sys, xml.etree.ElementTree as e; e.parse(sys.argv[1])' "$UI" 2>/dev/null; then
      return 0
    fi
    echo 'UIAutomator dump unavailable; retrying.' >&2
  done
  return 1
}

# uiautomator waits for UI idle; a dump checks the real Android view hierarchy.
show_focus() {
  echo "--- Current activity and focused views ---"
  adb shell dumpsys activity activities | grep -E 'mResumedActivity|topResumedActivity' || true
  dump_ui
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
    if ! dump_ui; then continue; fi
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
  echo "::error title=TV Browser timeout::Timed out waiting for page title: $title"
  show_focus || true
  return 1
}
wait_for_text() {
  local text="$1"
  for attempt in $(seq 1 10); do
    if ! dump_ui; then continue; fi
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
  echo "::error title=TV Browser timeout::Timed out waiting for on-screen text: $text"
  show_focus || true
  return 1
}
read_scroll_position() {
  dump_ui
  python3 - "$UI" <<'PY'
import re, sys, xml.etree.ElementTree as ET
nodes = list(ET.parse(sys.argv[1]).getroot().iter('node'))
for node in nodes:
    match = re.fullmatch(r'SCROLL Y: (\d+)', node.get('text', ''))
    if match:
        print(match.group(1))
        sys.exit(0)
sys.exit(1)
PY
}
wait_for_scroll_increase() {
  local before="$1" current
  for attempt in $(seq 1 10); do
    if current=$(read_scroll_position) && [ "$current" -gt "$before" ]; then
      echo "Page scrolled from $before to $current"
      return 0
    fi
  done
  echo "::error title=TV Browser scrolling::Scroll did not increase from $before"
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
assert_remote_mode() {
  python3 - "$UI" "$1" <<'PY'
import sys, xml.etree.ElementTree as ET
nodes = list(ET.parse(sys.argv[1]).getroot().iter('node'))
expected = 'Item focus mode, selected' if sys.argv[2] == 'items' else 'Page scroll mode, selected'
other = 'Page scroll mode' if sys.argv[2] == 'items' else 'Item focus mode'
assert any(n.get('content-desc') == expected and n.get('selected') == 'true'
           and n.get('focusable') == 'true' for n in nodes), f'{expected} not selected'
assert any(n.get('content-desc') == other and n.get('selected') != 'true'
           and n.get('focusable') == 'true' for n in nodes), f'{other} not available'
assert any(n.get('content-desc') == 'Arena.ai help, opens a separate website' and n.get('focusable') == 'true'
           for n in nodes), 'AI help is not remote-focusable'
print('Remote mode selected:', sys.argv[2])
PY
}
focus_mode_controls() {
  adb shell input keyevent KEYCODE_MENU
  show_focus
  assert_toolbar
  adb shell input keyevent KEYCODE_DPAD_UP
  show_focus
  python3 - "$UI" <<'PY'
import sys, xml.etree.ElementTree as ET
nodes = list(ET.parse(sys.argv[1]).getroot().iter('node'))
assert any(n.get('content-desc', '').startswith('Item focus mode') and n.get('focused') == 'true'
           for n in nodes), 'Up from the address bar did not reach ITEMS'
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
assert_remote_mode items

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

# Exercise the newer remote behavior against a local page with a slightly
# staggered row, a background-image card and an ordinary text field.
adb shell input keyevent KEYCODE_DPAD_CENTER
adb shell input text "http://127.0.0.1:$PORT/remote-controls.html"
adb shell input keyevent KEYCODE_ENTER
wait_for_title 'TV Browser remote controls test'
wait_for_text 'TV remote helper: ready'
wait_for_text 'FOCUSED: first'
adb shell input keyevent KEYCODE_DPAD_DOWN
wait_for_text 'FOCUSED: below'
adb shell input keyevent KEYCODE_DPAD_UP
wait_for_text 'FOCUSED: first'
adb shell input keyevent KEYCODE_DPAD_RIGHT
wait_for_text 'FOCUSED: same-row'
adb shell input keyevent KEYCODE_DPAD_DOWN
wait_for_text 'FOCUSED: background-card'
adb shell input keyevent KEYCODE_DPAD_CENTER
wait_for_text 'BACKGROUND CARD: opened'
adb shell input keyevent KEYCODE_DPAD_LEFT
wait_for_text 'FOCUSED: below'
adb shell input keyevent KEYCODE_DPAD_DOWN
wait_for_text 'FOCUSED: entry'
# Enter and dismiss the TV keyboard, then Right at the end of the text should
# move to the adjacent button rather than trapping focus in the field.
adb shell input keyevent KEYCODE_DPAD_CENTER
adb shell input text remote_edge
show_focus
python3 - "$UI" <<'PY'
import sys, xml.etree.ElementTree as ET
nodes = ET.parse(sys.argv[1]).getroot().iter('node')
assert any('remote_edge' in n.get('text', '') for n in nodes), 'Remote text entry failed'
PY
adb shell input keyevent KEYCODE_BACK
wait_for_text 'FOCUSED: entry'
adb shell input keyevent KEYCODE_DPAD_RIGHT
wait_for_text 'FOCUSED: after'

# The top controls are reachable from the address bar and clearly identify the
# selected mode. AI help explains that Arena.ai is a separate site; do not open
# an external network connection in this isolated test.
focus_mode_controls
adb shell input keyevent KEYCODE_DPAD_RIGHT KEYCODE_DPAD_RIGHT
show_focus
python3 - "$UI" <<'PY'
import sys, xml.etree.ElementTree as ET
nodes = list(ET.parse(sys.argv[1]).getroot().iter('node'))
assert any(n.get('content-desc') == 'Arena.ai help, opens a separate website' and n.get('focused') == 'true'
           for n in nodes), 'AI help cannot be reached using the remote'
PY
adb shell input keyevent KEYCODE_DPAD_CENTER
wait_for_text 'Arena.ai help'
python3 - "$UI" <<'PY'
import sys, xml.etree.ElementTree as ET
nodes = list(ET.parse(sys.argv[1]).getroot().iter('node'))
text = ' '.join(n.get('text', '') for n in nodes)
assert 'separate Arena.ai website' in text and 'will not automatically receive this conversation' in text
assert 'cannot automatically update the app' in text
print('Separate AI site and privacy explanation verified')
PY
adb shell input keyevent KEYCODE_BACK
# Wait for the dialog window to close before sending the next D-pad key.
show_focus
adb shell input keyevent KEYCODE_DPAD_LEFT
show_focus
python3 - "$UI" <<'PY'
import sys, xml.etree.ElementTree as ET
nodes = list(ET.parse(sys.argv[1]).getroot().iter('node'))
assert any(n.get('content-desc') == 'Page scroll mode' and n.get('focused') == 'true'
           for n in nodes), 'SCROLL is not remote-focusable'
PY
before_requests=$(grep -Fc 'GET /remote-controls.html ' "$LOG")
adb shell input keyevent KEYCODE_DPAD_CENTER
show_focus
assert_remote_mode scroll
wait_for_text 'BACKGROUND CARD: opened'
test "$(grep -Fc 'GET /remote-controls.html ' "$LOG")" = "$before_requests"
# Returning to the existing document must scroll instead of jumping focus.
adb shell input keyevent KEYCODE_BACK
wait_for_text 'CURRENT: after'
before_scroll=$(read_scroll_position)
adb shell input keyevent KEYCODE_DPAD_DOWN
wait_for_scroll_increase "$before_scroll"
wait_for_text 'CURRENT: after'

# Switch straight back to item focus without reloading, then check a real
# directional move from the previously selected card.
focus_mode_controls
adb shell input keyevent KEYCODE_DPAD_CENTER
show_focus
assert_remote_mode items
adb shell input keyevent KEYCODE_BACK
adb shell input keyevent KEYCODE_DPAD_UP
wait_for_text 'CURRENT: background-card'
test "$(grep -Fc 'GET /remote-controls.html ' "$LOG")" = "$before_requests"

# Leave SCROLL selected, restart the app and verify the saved setting applies
# to a newly loaded page as well as to the selected button on Home.
focus_mode_controls
adb shell input keyevent KEYCODE_DPAD_RIGHT KEYCODE_DPAD_CENTER
show_focus
assert_remote_mode scroll
adb shell am force-stop com.visujju.tvbrowser
adb shell am start -W -n com.visujju.tvbrowser/.MainActivity
show_focus
assert_remote_mode scroll
adb shell input keyevent KEYCODE_DPAD_CENTER
adb shell input text "http://127.0.0.1:$PORT/remote-controls.html"
adb shell input keyevent KEYCODE_ENTER
wait_for_title 'TV Browser remote controls test'
wait_for_text 'TV remote helper: ready'
wait_for_text 'CURRENT: first'
before_scroll=$(read_scroll_position)
adb shell input keyevent KEYCODE_DPAD_DOWN
wait_for_scroll_increase "$before_scroll"
wait_for_text 'CURRENT: first'
# Reset to the default so the remaining browser tests use item navigation.
focus_mode_controls
adb shell input keyevent KEYCODE_DPAD_CENTER
show_focus
assert_remote_mode items
adb shell input keyevent KEYCODE_BACK
# Return to Home for the original browser, download and safety smoke tests.
adb shell input keyevent KEYCODE_MENU
show_focus
assert_toolbar
adb shell input keyevent KEYCODE_DPAD_RIGHT KEYCODE_DPAD_RIGHT KEYCODE_DPAD_RIGHT KEYCODE_DPAD_CENTER
wait_for_text 'Your shortcuts'

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

# After a reload WebView may restore an old page focus. Move to the first card
# from the actual current state, then verify geometric navigation in the grid.
for attempt in $(seq 1 4); do
  dump_ui
  focused=$(python3 - "$UI" <<'PY'
import sys, xml.etree.ElementTree as ET
nodes = ET.parse(sys.argv[1]).getroot().iter('node')
print(next((n.get('text') for n in nodes if n.get('text', '').startswith('FOCUSED: ')), ''))
PY
)
  case "$focused" in
    'FOCUSED: first') break ;;
    'FOCUSED: none') adb shell input keyevent KEYCODE_DPAD_RIGHT ;;
    'FOCUSED: third') adb shell input keyevent KEYCODE_DPAD_UP ;;
    'FOCUSED: second-poster') adb shell input keyevent KEYCODE_DPAD_LEFT ;;
    *) echo "Unexpected fixture focus: $focused"; show_focus; exit 1 ;;
  esac
done
wait_for_text 'FOCUSED: first'
# Real D-pad events should follow geometry, not a fixed HTML/tab sequence.
adb shell input keyevent KEYCODE_DPAD_DOWN
wait_for_text 'FOCUSED: third'
wait_for_text 'SPATIAL: handled'
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

# A refused local connection exercises the browser-owned error screen and its
# D-pad recovery controls (it does not test any third-party website). Go Home
# first so the address field is empty rather than depending on text selection.
adb shell input keyevent KEYCODE_MENU
show_focus
assert_toolbar
adb shell input keyevent KEYCODE_DPAD_RIGHT KEYCODE_DPAD_RIGHT KEYCODE_DPAD_RIGHT KEYCODE_DPAD_CENTER
wait_for_text 'Your shortcuts'
adb shell input keyevent KEYCODE_DPAD_CENTER
adb shell input text 'http://127.0.0.1:8766/'
adb shell input keyevent KEYCODE_ENTER
wait_for_text "This page couldn't be opened"
show_focus
python3 - "$UI" <<'PY'
import sys, xml.etree.ElementTree as ET
nodes = list(ET.parse(sys.argv[1]).getroot().iter('node'))
assert any(n.get('content-desc') == 'Try opening this page again' and n.get('focused') == 'true'
           for n in nodes), 'Retry is not focused on the error screen'
assert any(n.get('content-desc') == 'Return to the browser home' and n.get('focusable') == 'true'
           for n in nodes), 'Home is not available on the error screen'
PY
adb shell input keyevent KEYCODE_DPAD_RIGHT
show_focus
python3 - "$UI" <<'PY'
import sys, xml.etree.ElementTree as ET
nodes = ET.parse(sys.argv[1]).getroot().iter('node')
assert any(n.get('content-desc') == 'Return to the browser home' and n.get('focused') == 'true'
           for n in nodes), 'Could not move from Retry to Home'
PY
adb shell input keyevent KEYCODE_DPAD_CENTER
wait_for_text 'Your shortcuts'
show_focus
python3 - "$UI" <<'PY'
import sys, xml.etree.ElementTree as ET
nodes = ET.parse(sys.argv[1]).getroot().iter('node')
assert any(n.get('content-desc') == 'Search or enter an address' and n.get('focused') == 'true'
           for n in nodes), 'Home search is not focused after recovery'
print('Error screen recovery verified')
PY

# Exercise real DownloadManager downloads with a local fixture. The first link
# is deliberately not an APK; it only checks the warning and safe default.
adb shell 'rm -f /sdcard/Download/tv-browser-fixture-*.bin /sdcard/Download/tv-browser-fake-*.apk'
adb shell input keyevent KEYCODE_DPAD_CENTER
adb shell input text "http://127.0.0.1:$PORT/download.html"
adb shell input keyevent KEYCODE_ENTER
wait_for_title 'TV Browser download test'
wait_for_text 'Download fixtures'
adb shell input keyevent KEYCODE_DPAD_DOWN
show_focus
adb shell input keyevent KEYCODE_DPAD_CENTER
wait_for_text 'Download file?'
show_focus
python3 - "$UI" <<'PY'
import sys, xml.etree.ElementTree as ET
nodes = list(ET.parse(sys.argv[1]).getroot().iter('node'))
assert any('This is an app installer (APK)' in n.get('text', '') for n in nodes), 'APK warning missing'
assert any(n.get('text', '').lower() == 'cancel' and n.get('focused') == 'true'
           for n in nodes), 'Download confirmation should default to Cancel'
assert any('unencrypted HTTP' in n.get('text', '') for n in nodes), 'HTTP download warning missing'
print('APK and HTTP warnings verified; Cancel is focused')
PY
adb shell input keyevent KEYCODE_DPAD_CENTER
# Cancel must not enqueue the fake APK.
if adb shell ls /sdcard/Download/ | tr -d '\r' | grep -q '^tv-browser-fake-'; then
  echo 'Cancelling unexpectedly created a fake APK in Downloads'; exit 1
fi

# Download the harmless binary fixture after explicitly selecting Download.
# Closing a dialog can restore or clear DOM focus depending on WebView version.
selected=false
for attempt in $(seq 1 3); do
  adb shell input keyevent KEYCODE_DPAD_DOWN
  show_focus
  if python3 - "$UI" <<'PY'
import sys, xml.etree.ElementTree as ET
nodes = ET.parse(sys.argv[1]).getroot().iter('node')
sys.exit(0 if any(n.get('content-desc') == 'Download a test file' and n.get('focused') == 'true'
                  for n in nodes) else 1)
PY
  then
    selected=true
    break
  fi
done
if [ "$selected" != true ]; then echo 'Could not focus the binary download link'; exit 1; fi
adb shell input keyevent KEYCODE_DPAD_CENTER
wait_for_text 'Download file?'
show_focus
python3 - "$UI" <<'PY'
import sys, xml.etree.ElementTree as ET
nodes = ET.parse(sys.argv[1]).getroot().iter('node')
assert any('tv-browser-fixture-' in n.get('text', '') for n in nodes), 'Wrong download offered'
PY
adb shell input keyevent KEYCODE_DPAD_RIGHT
show_focus
python3 - "$UI" <<'PY'
import sys, xml.etree.ElementTree as ET
nodes = ET.parse(sys.argv[1]).getroot().iter('node')
assert any(n.get('text', '').lower() == 'download' and n.get('focused') == 'true'
           for n in nodes), 'Could not focus Download with the D-pad'
PY
adb shell input keyevent KEYCODE_DPAD_CENTER
file=''
for attempt in $(seq 1 30); do
  file=$(adb shell ls /sdcard/Download/ | tr -d '\r' | grep -E '^tv-browser-fixture-[0-9a-f]{8}\.bin$' | head -1 || true)
  if [ -n "$file" ]; then
    adb exec-out cat "/sdcard/Download/$file" > "${RUNNER_TEMP:-/tmp}/tv-browser-downloaded.bin" || true
    if cmp -s tv-browser/tests/fixtures/tv-browser-fixture.bin "${RUNNER_TEMP:-/tmp}/tv-browser-downloaded.bin"; then break; fi
  fi
  sleep 1
done
if [ -z "$file" ] || ! cmp -s tv-browser/tests/fixtures/tv-browser-fixture.bin "${RUNNER_TEMP:-/tmp}/tv-browser-downloaded.bin"; then
  echo 'The confirmed fixture download did not complete'; exit 1
fi
printf 'Confirmed fixture download saved to Downloads: %s\n' "$file"

# FILES must be reachable from the toolbar and display the completed download.
adb shell input keyevent KEYCODE_MENU
show_focus
assert_toolbar
adb shell input keyevent KEYCODE_DPAD_RIGHT KEYCODE_DPAD_RIGHT KEYCODE_DPAD_RIGHT \
  KEYCODE_DPAD_RIGHT KEYCODE_DPAD_RIGHT KEYCODE_DPAD_RIGHT KEYCODE_DPAD_RIGHT KEYCODE_DPAD_RIGHT
show_focus
python3 - "$UI" <<'PY'
import sys, xml.etree.ElementTree as ET
nodes = ET.parse(sys.argv[1]).getroot().iter('node')
assert any(n.get('content-desc') == 'Show downloads' and n.get('focused') == 'true'
           for n in nodes), 'FILES is not reachable using the remote'
PY
adb shell input keyevent KEYCODE_DPAD_CENTER
wait_for_text 'Downloads'
listed=false
for attempt in $(seq 1 10); do
  show_focus
  if python3 - "$UI" <<'PY'
import sys, xml.etree.ElementTree as ET
nodes = ET.parse(sys.argv[1]).getroot().iter('node')
sys.exit(0 if any('tv-browser-fixture-' in n.get('text', '') and 'Complete' in n.get('text', '')
                  for n in nodes) else 1)
PY
  then
    listed=true
    break
  fi
  # Close and reopen FILES while Android finishes updating its status.
  adb shell input keyevent KEYCODE_BACK
  sleep 1
  adb shell input keyevent KEYCODE_DPAD_CENTER
  wait_for_text 'Downloads'
done
if [ "$listed" != true ]; then echo 'Completed file is missing from FILES'; exit 1; fi
echo 'Download list verified'

# Selecting an entry exposes the requested Open and explicit-delete actions.
adb shell input keyevent KEYCODE_DPAD_CENTER
wait_for_text "$file"
show_focus
python3 - "$UI" <<'PY'
import sys, xml.etree.ElementTree as ET
nodes = list(ET.parse(sys.argv[1]).getroot().iter('node'))
assert any(n.get('text', '').lower() == 'open' for n in nodes), 'Open action missing'
assert any(n.get('text', '').lower() == 'delete file' for n in nodes), 'Delete action missing'
assert any(n.get('text', '').lower() == 'back' and n.get('focused') == 'true'
           for n in nodes), 'File actions should default to Back'
print('Completed file actions verified')
PY
adb shell input keyevent KEYCODE_DPAD_LEFT
show_focus
python3 - "$UI" <<'PY'
import sys, xml.etree.ElementTree as ET
nodes = ET.parse(sys.argv[1]).getroot().iter('node')
assert any(n.get('text', '').lower() == 'delete file' and n.get('focused') == 'true'
           for n in nodes), 'Could not focus Delete file'
PY
adb shell input keyevent KEYCODE_DPAD_CENTER
wait_for_text 'Remove download?'
show_focus
python3 - "$UI" <<'PY'
import sys, xml.etree.ElementTree as ET
nodes = ET.parse(sys.argv[1]).getroot().iter('node')
assert any(n.get('text', '').lower() == 'keep' and n.get('focused') == 'true'
           for n in nodes), 'Deletion should default to Keep'
PY
adb shell input keyevent KEYCODE_DPAD_RIGHT KEYCODE_DPAD_CENTER
wait_for_text 'Downloads'
if adb shell ls /sdcard/Download/ | tr -d '\r' | grep -Fxq "$file"; then
  echo 'Confirmed Delete file did not remove the file'; exit 1
fi
echo 'Explicit deletion verified'
adb shell input keyevent KEYCODE_BACK

# Download the fake APK fixture, then exercise the explicit Open safety gate.
# The fixture is only text: it is never installed.
adb shell input keyevent KEYCODE_BACK
selected=false
for attempt in $(seq 1 3); do
  adb shell input keyevent KEYCODE_DPAD_UP
  show_focus
  if python3 - "$UI" <<'PY'
import sys, xml.etree.ElementTree as ET
nodes = ET.parse(sys.argv[1]).getroot().iter('node')
sys.exit(0 if any(n.get('content-desc') == 'Test APK warning (not an app)' and n.get('focused') == 'true'
                  for n in nodes) else 1)
PY
  then
    selected=true
    break
  fi
done
if [ "$selected" != true ]; then echo 'Could not return to the APK fixture link'; exit 1; fi
adb shell input keyevent KEYCODE_DPAD_CENTER
wait_for_text 'Download file?'
adb shell input keyevent KEYCODE_DPAD_RIGHT KEYCODE_DPAD_CENTER
apk_file=''
for attempt in $(seq 1 30); do
  apk_file=$(adb shell ls /sdcard/Download/ | tr -d '\r' | grep -E '^tv-browser-fake-[0-9a-f]{8}\.apk$' | head -1 || true)
  if [ -n "$apk_file" ]; then
    adb exec-out cat "/sdcard/Download/$apk_file" > "${RUNNER_TEMP:-/tmp}/tv-browser-fake.apk" || true
    if cmp -s tv-browser/tests/fixtures/tv-browser-fake.apk "${RUNNER_TEMP:-/tmp}/tv-browser-fake.apk"; then break; fi
  fi
  sleep 1
done
if [ -z "$apk_file" ] || ! cmp -s tv-browser/tests/fixtures/tv-browser-fake.apk "${RUNNER_TEMP:-/tmp}/tv-browser-fake.apk"; then
  echo 'The fake APK fixture did not download'; exit 1
fi
adb shell input keyevent KEYCODE_MENU
show_focus
assert_toolbar
adb shell input keyevent KEYCODE_DPAD_RIGHT KEYCODE_DPAD_RIGHT KEYCODE_DPAD_RIGHT \
  KEYCODE_DPAD_RIGHT KEYCODE_DPAD_RIGHT KEYCODE_DPAD_RIGHT KEYCODE_DPAD_RIGHT KEYCODE_DPAD_RIGHT
adb shell input keyevent KEYCODE_DPAD_CENTER
wait_for_text 'Downloads'
listed=false
for attempt in $(seq 1 10); do
  show_focus
  if python3 - "$UI" <<'PY'
import sys, xml.etree.ElementTree as ET
nodes = ET.parse(sys.argv[1]).getroot().iter('node')
sys.exit(0 if any('tv-browser-fake-' in n.get('text', '') and 'Complete' in n.get('text', '')
                  for n in nodes) else 1)
PY
  then
    listed=true
    break
  fi
  adb shell input keyevent KEYCODE_BACK
  sleep 1
  adb shell input keyevent KEYCODE_DPAD_CENTER
  wait_for_text 'Downloads'
done
if [ "$listed" != true ]; then echo 'Completed APK fixture is missing from FILES'; exit 1; fi
adb shell input keyevent KEYCODE_DPAD_CENTER
wait_for_text "$apk_file"
show_focus
python3 - "$UI" <<'PY'
import sys, xml.etree.ElementTree as ET
nodes = list(ET.parse(sys.argv[1]).getroot().iter('node'))
assert any('Only open this APK if you have independently verified its source.' in n.get('text', '')
           for n in nodes), 'APK open warning missing'
assert any(n.get('text', '').lower() == 'back' and n.get('focused') == 'true'
           for n in nodes), 'APK actions should default to Back'
PY
adb shell input keyevent KEYCODE_DPAD_RIGHT KEYCODE_DPAD_CENTER
wait_for_text 'Allow app installation?'
show_focus
python3 - "$UI" <<'PY'
import sys, xml.etree.ElementTree as ET
nodes = ET.parse(sys.argv[1]).getroot().iter('node')
assert any(n.get('text', '').lower() == 'cancel' and n.get('focused') == 'true'
           for n in nodes), 'Installer permission guidance should default to Cancel'
print('APK is never installed automatically; explicit permission guidance verified')
PY
adb shell input keyevent KEYCODE_DPAD_CENTER

# Check for this app's fatal exceptions; UIAutomator or system services may
# log their own transient crashes on a busy emulator and are not the browser.
adb logcat -d -s AndroidRuntime:E > "${RUNNER_TEMP:-/tmp}/tv-browser-runtime.log"
python3 - "${RUNNER_TEMP:-/tmp}/tv-browser-runtime.log" <<'PY'
import pathlib, sys
lines = pathlib.Path(sys.argv[1]).read_text(errors='replace').splitlines()
for i, line in enumerate(lines):
    if 'FATAL EXCEPTION' in line and any('com.visujju.tvbrowser' in x for x in lines[i:i + 8]):
        print('\n'.join(lines[i:i + 20]))
        raise SystemExit('TV Browser crashed during the test')
PY
printf '\nTV Browser shortcuts, full-screen navigation, HTTP warning and D-pad controls passed.\n'
cat "$LOG"
