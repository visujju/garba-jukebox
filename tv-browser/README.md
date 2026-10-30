# TV Browser

A separate Android/Google TV browser (Android 8.0 / API 26 or newer). It does not modify StreamTV. The app uses Android System WebView; an internet connection and an enabled, up-to-date WebView are needed.

## Control from an Android phone

The browser uses normal Android TV remote buttons; there is no separate remote app or server to install on the TV. On a compatible Android TV/Google TV device:

1. Install or open **Google TV** on your Android phone. Connect the phone and TV to the same Wi-Fi network.
2. In Google TV, choose **Connect TV** (the remote button), choose your TV, enter the code shown on the TV, and tap **Pair**. The exact label may vary with the app version. See [Google's setup guide](https://support.google.com/androidtv/answer/6122465?hl=en).
3. Open **TV Browser** on the TV and use the phone remote's **D-pad, OK and Back**. When a text field is active, the phone keyboard may be offered by the Google TV remote, depending on your TV and its remote service.

Pairing relies on Google's Android TV Remote Service and a compatible TV. It is not implemented by this app; some devices or configurations do not support the Google TV phone remote. Pairing and phone keyboard behavior have not been tested on a physical TV.

## Using the browser

1. From Home, select **Search or enter address**, or pick a quick link. Shortcuts include **Cinejoy.pk**, **PVRPlay.in**, **Netmirror.plus** and **Arena.ai**, as well as Google, YouTube, Wikipedia and DuckDuckGo. Enter a web address or search words and press **Go**. Searches are sent to Google.
2. Websites open **full-screen**. On a page, arrows move the pointer and **OK** clicks. Hold an arrow at a page edge to scroll. Press **Back** to return to the previous page (or exit full-screen video).
3. To bring back the address bar and browser buttons, **hold Back**, or move the pointer to the top edge and press Up again when the page is scrolled to the top. A remote with a **Menu** button can also use it. From the address bar with the keyboard closed, press **Down**, or choose **FULL**, to return to the full-screen page. A short Back also closes the toolbar.
4. **Save** stores the current page, and **Saved** opens or removes saved pages. **Clear** removes cookies, WebView site storage and cache, and the current session's history; saved pages are kept and can be removed separately.

The shortcuts lead to independent, third-party sites; content, availability and streaming rights are not verified. As checked on 30 October 2026, `https://pvrplay.in/` redirects to its own “moved” page. The shortcut intentionally retains the requested domain rather than choosing a replacement.

The browser has one window. It handles fullscreen WebView video where the site and device support it. A simple user-clicked new-window link may open in the current window; scripted pop-ups and separate windows are blocked. File downloads and uploads, camera, microphone, geolocation and protected-media permission requests are unavailable. Third-party cookies and mixed HTTP content on HTTPS pages are blocked. Some sign-ins, websites, remote controls, ads and videos may therefore not work; playback and DRM are not guaranteed. No ad-blocker or content provider is included.

## Privacy and security

- This is **not** a private/incognito browser. Cookies, site storage, and explicitly saved page addresses can remain on the TV; saved pages are stored in app-private preferences without encryption. Android backup is disabled. A URL can itself contain passwords or access tokens, so do not save or share sensitive links. Clear browsing data separately from saved pages when needed. Android's app-data reset removes both.
- HTTP addresses are allowed for compatibility and shown as **HTTP • NOT ENCRYPTED**, including as a small overlay when the toolbar is hidden. Prefer HTTPS and do not enter passwords or payment details on HTTP pages or untrusted sites. Certificate errors are never bypassed and Safe Browsing is enabled.
- File/content access from the WebView is disabled, unsupported URI schemes are not opened, and no native JavaScript bridge is exposed. JavaScript and first-party cookies are enabled because many websites require them. Websites, WebView/Safe Browsing services and the chosen search engine may receive information as part of normal browsing; this app has no separate analytics SDK.

## Build

Open the `tv-browser/` directory in Android Studio, or use JDK 17 and Android SDK Platform 35:

```sh
cd tv-browser
./gradlew :app:testDebugUnitTest :app:assembleDebug
```

The result is `app/build/outputs/apk/debug/app-debug.apk`. The repository's **Build TV Browser APK** GitHub Actions workflow also builds and uploads a `TV-Browser-APK` artifact when this project changes. Download the artifact, unzip it on an Android phone, transfer the APK to the TV and install it with an authorized file manager. Enable installation from unknown sources only for the app doing the install, and turn that permission off afterward.

This is a debug build, not a Play Store release. GitHub-hosted runners can generate different debug signing keys on different builds. If an update reports a signing conflict, a reinstall may be necessary; uninstalling clears saved pages, cookies and other app data. Use a securely managed release key for ongoing releases.

## Tests and limitations

`testDebugUnitTest` covers address resolution, unsafe schemes and remote-pointer edge movement. The Android TV emulator smoke test checks the requested Home shortcuts, address input, full-screen local HTTP page and its warning, D-pad click, toolbar restoration and Back navigation. These tests do **not** pair a phone or exercise an actual remote, website sign-in, video or DRM. Those need testing on a compatible physical Android TV/Google TV device. The browser relies on the installed System WebView, so behavior also depends on its version and each website.
