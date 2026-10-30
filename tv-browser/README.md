# TV Browser

A separate Android/Google TV browser (Android 8.0 / API 26 or newer). It does not modify StreamTV. The app uses Android System WebView; an internet connection and an enabled, up-to-date WebView are needed.

## Using a remote

1. From the home screen, select **Search or enter address**, or pick a quick link. Type a web address or search words and press **Go** on the keyboard or in the toolbar. Searches are sent to Google.
2. On a page, the directional buttons move the pointer and **OK** clicks. Hold an arrow at a page edge to scroll. At the top of a page, pressing Up again focuses the address bar.
3. Press **Back** to return to the previous page; hold **Back** for about a second (or press **Menu** if your remote has one) to focus the toolbar. When the address bar is focused and the keyboard is closed, press Down to return to the page.
4. **Save** stores the current page, and **Saved** opens or removes saved pages. **Clear** removes cookies, WebView site storage and cache, and the current session's history; saved pages are kept and can be removed separately.

The browser has one window. It handles fullscreen WebView video where the site and device support it. A simple user-clicked new-window link may open in the current window; scripted pop-ups and separate windows are blocked. File downloads and uploads, camera, microphone, geolocation and protected-media permission requests are unavailable. Third-party cookies and mixed HTTP content on HTTPS pages are blocked. Some sign-ins, websites, remote controls, ads and videos may therefore not work; playback and DRM are not guaranteed. No ad-blocker or content provider is included.

## Privacy and security

- This is **not** a private/incognito browser. Cookies, site storage, and explicitly saved page addresses can remain on the TV; saved pages are stored in app-private preferences without encryption. Android backup is disabled. A URL can itself contain passwords or access tokens, so do not save or share sensitive links. Clear browsing data separately from saved pages when needed. Android's app-data reset removes both.
- HTTP addresses are allowed for compatibility and shown as **HTTP • NOT ENCRYPTED**. Prefer HTTPS and do not enter passwords or payment details on HTTP pages or untrusted sites. Certificate errors are never bypassed and Safe Browsing is enabled.
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

`testDebugUnitTest` covers address resolution, unsafe schemes and remote-pointer edge movement. It does **not** exercise WebView rendering, a real remote, a TV keyboard, website sign-in, video or DRM. Those need testing on an Android TV/Google TV device. The browser relies on the installed System WebView, so behavior also depends on its version and each website.
