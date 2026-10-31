# TV Browser

A separate Android/Google TV browser (Android 8.0 / API 26 or newer). It does not modify StreamTV. The app uses Android System WebView; an internet connection and an enabled, up-to-date WebView are needed.

## Control from an Android phone

The browser uses normal Android TV remote buttons; there is no separate remote app or server to install on the TV. On a compatible Android TV/Google TV device:

1. Install or open **Google TV** on your Android phone. Connect the phone and TV to the same Wi-Fi network.
2. In Google TV, choose **Connect TV** (the remote button), choose your TV, enter the code shown on the TV, and tap **Pair**. The exact label may vary with the app version. See [Google's setup guide](https://support.google.com/androidtv/answer/6122465?hl=en).
3. Open **TV Browser** on the TV and use the phone remote's **D-pad, OK and Back**. When a text field is active, the phone keyboard may be offered by the Google TV remote, depending on your TV and its remote service.

Pairing relies on Google's Android TV Remote Service and a compatible TV. It is not implemented by this app; some devices or configurations do not support the Google TV phone remote. Pairing and phone keyboard behavior have not been tested on a physical TV.

## Using the browser

1. From Home, select **Search or enter address**, or pick a quick link. Shortcuts include **Cinejoy.pk**, **PVRPlay**, **Netmirror.plus** and **Arena.ai**, as well as Google, YouTube, Wikipedia and DuckDuckGo. Enter a web address or search words and press **Go**. Searches are sent to Google.
2. Websites open **full-screen**. Use the arrows to move the highlight to a nearby picture, link, button or form field in that direction, and press **OK** to open it. The page can scroll as you move between items. Press **Back** to return to the previous page (or exit full-screen video).
3. To bring back the address bar and browser buttons, **hold Back**, or scroll to the top of the page and **hold Up**. A remote with a **Menu** button can also use it. From the address bar with the keyboard closed, press **Down**, or choose **FULL**, to return to the full-screen page. A short Back also closes the toolbar.
4. **Save** stores the current page, and **Saved** opens or removes saved pages. **Clear** removes cookies, WebView site storage and cache, and the current session's history; saved pages and downloaded files are kept and can be removed separately.
5. When a website starts a download, review the displayed filename and initial source and choose **Download** or **Cancel**. To check a download, hold **Back**, move right across the toolbar to **FILES**, and select it. Choose **Refresh** to update the status; select a finished file to open it or delete it. Downloads are saved in the TV's public **Downloads** folder and can also be opened with a compatible file manager. Android 8–9 will ask for storage permission before saving there. A device must have Android's Download Manager enabled.

The PVRPlay shortcut opens the user-supplied `https://dbhnmkjasgbvsdkjbskkvnskjbfckldsnckjbckjnxkjcsknxjvkjxnvcxknvku.pvrplay.fun/` address instead of the old `pvrplay.in` address. Shortcuts lead to independent third-party sites; content, availability and streaming rights are not verified.

The browser tries to choose the nearest selectable item in the direction pressed, rather than following the page's HTML order. It respects website-handled keys and text fields, adds a high-contrast focus outline (including around focusable media and frames), and tries to make large images and some non-standard cards selectable, including cards added after a page loads. The browser does not redesign third-party websites. A decorative picture may be highlighted even though it cannot be opened. Some websites use canvas, embedded frames or custom controls that cannot be navigated this way; selecting every picture or playing every video is not guaranteed.

The browser has one window. A simple user-clicked new-window link may open in the current window; scripted pop-ups and separate windows are blocked. **BLOCK ON** in the toolbar means the additional ad filter is enabled by default: it blocks requests to a small offline list of known ad hosts and hides some clearly marked small floating ads. Select it to turn filtering off and reload the page if a site stops working; select **BLOCK OFF** to turn it back on. The choice is saved on the TV. Separate/scripted windows remain blocked even when ad filtering is off. The filter is best-effort, not a complete ad blocker: unlisted ads, ads inside embedded players, and video ads may still appear.

Downloads support explicit HTTP and HTTPS URLs. Blob/data links and downloads requiring cookies, a referrer, or other authenticated session headers may not work. The browser does not forward those headers to Android's Download Manager, which may follow redirects outside the browser's ad filter. Website-controlled filenames and MIME types are not proof of a file's contents. Some devices cannot open particular file types.

Fullscreen WebView video works only where the site and device support it. File uploads, camera, microphone, geolocation and protected-media permission requests are unavailable. Third-party cookies and mixed HTTP content on HTTPS pages are blocked. Some sign-ins, websites, remote controls and videos may therefore not work; playback and DRM are not guaranteed. The app does not provide any content.

## Privacy and security

- This is **not** a private/incognito browser. Cookies, site storage, and explicitly saved page addresses can remain on the TV; saved pages are stored in app-private preferences without encryption. Android backup is disabled. A URL can itself contain passwords or access tokens, so do not save or share sensitive links. Clear browsing data separately from saved pages when needed. Android's app-data reset removes both.
- HTTP addresses are allowed for compatibility and shown as **HTTP • NOT ENCRYPTED**, including as a small overlay when the toolbar is hidden. Prefer HTTPS and do not enter passwords or payment details on HTTP pages or untrusted sites. Certificate errors are never bypassed and Safe Browsing is enabled. HTTPS protects the connection; it does not prove that a website or its update prompts are trustworthy.
- TV Browser has no in-app updater. A website's **Update Required** message is not a TV Browser update, and a successful download does not verify the file. Independently verify an APK's publisher and source before installing it. APKs are never opened or installed automatically. If you explicitly open one, Android may ask you to allow installations from TV Browser; disable that permission afterward. The browser does not intentionally hide or bypass update prompts; its ad filter can occasionally misidentify website content.
- Android's Download Manager receives and retains the download URL (which may include access tokens), filename and status. Public Downloads can remain on the device after clearing browsing data or uninstalling this app. The in-app list tracks the latest 80 browser downloads; older files remain in Downloads. The browser warns for an initial HTTP URL, but cannot verify redirect destinations or scan downloaded files for malware.
- File/content access from the WebView is disabled, unsupported URI schemes are not opened, and no native JavaScript bridge is exposed. JavaScript and first-party cookies are enabled because many websites require them. The app runs small focus-support and optional floating-ad-filter scripts in web pages; neither collects or sends page data. The ad-host list is stored in the app and is not remotely updated. Websites, WebView/Safe Browsing services and the chosen search engine may receive information as part of normal browsing; this app has no separate analytics SDK.

## Build

Open the `tv-browser/` directory in Android Studio, or use JDK 17 and Android SDK Platform 35:

```sh
cd tv-browser
./gradlew :app:testDebugUnitTest :app:assembleDebug
```

The result is `app/build/outputs/apk/debug/app-debug.apk`. The repository's **Build TV Browser APK** GitHub Actions workflow also builds and uploads a `TV-Browser-APK` artifact when this project changes. Download the artifact, unzip it on an Android phone, transfer the APK to the TV and install it with an authorized file manager. Enable installation from unknown sources only for the app doing the install, and turn that permission off afterward.

This is a debug build, not a Play Store release. GitHub-hosted runners can generate different debug signing keys on different builds. If an update reports a signing conflict, a reinstall may be necessary; uninstalling clears saved pages, cookies and other app data. Use a securely managed release key for ongoing releases.

## Tests and limitations

`testDebugUnitTest` covers address resolution, unsafe schemes, ad-host matching and download validation. `npm ci && npm run test:focus` checks directional navigation, page-controlled keys, modal dialogs, native controls, non-standard cards, dynamically inserted images and floating-ad filtering. The Android TV emulator smoke test checks the Home shortcuts, address input, full-screen HTTP warning, moving between picture cards, selecting a non-standard poster, toolbar restoration, Back navigation, error recovery, download confirmation and a local Download Manager fixture. These tests do **not** pair a phone or exercise an actual remote, website sign-in, video or DRM. Those need testing on a compatible physical Android TV/Google TV device. Behavior also depends on the installed System WebView and each website.
