# Lumen TV

Lumen TV is a **separate Android TV demo app** with a cinematic dashboard, a featured title, a grid of fictional movies and series, Search, Movies, Live TV, My List and Settings. It does not modify TV Browser or Cinejoy.

The catalog and artwork are fictional. **There are no films, streams, channels, playback service or account connected.** Title details and My List work, but there is deliberately no Play button. The Live TV page explains that a licensed source and player would need to be integrated separately. The demo works offline; the app does not request Internet access.

## TV and remote

- Android TV / Google TV with Android 8.0 (API 26) or later and an up-to-date Android System WebView.
- Use the remote's arrow buttons to move focus and OK to select. Left from the content reaches the navigation rail; Back closes an open panel or returns home. Back from Home exits the app.
- Search, movie genre filters, title details, My List and reduced-motion preferences are functional. My List and the motion setting are stored locally on the TV and are removed when app data is cleared or the app is uninstalled.
- The layout scales up to an 8K browser viewport. The generated source artwork is **1376 × 768**, not native 8K; actual display output depends on the TV and Android rendering configuration.

## Install a debug build

The GitHub Actions **Build Lumen TV APK** workflow publishes a `Lumen-TV-APK` artifact containing `Lumen-TV-debug.apk`. This is a developer-signed test build, not a Play Store release.

On an Android phone, download and extract that ZIP, transfer the APK to your TV with USB or a trusted file-transfer app, then open it using the TV's file manager. If Android asks, allow that file manager to install unknown apps, install Lumen TV, and turn the permission off again afterward. Lumen TV should appear in the TV app launcher. Only install an APK from a source you trust.

Alternatively, with Android platform tools and an authorized TV connection:

```sh
adb install -r Lumen-TV-debug.apk
```

A debug build signed by a different machine may not upgrade an existing copy. If Android reports a signature conflict, uninstalling the old copy allows installation but deletes its local My List and settings.

## Build and test

Use JDK 17, Android SDK 35 and Android build tools 35.0.0. From this directory:

```sh
./gradlew :app:assembleDebug
# app/build/outputs/apk/debug/app-debug.apk
```

The web interface can also be previewed from a computer:

```sh
python3 -m http.server 4173 --bind 0.0.0.0 --directory web
```

To run browser and manifest tests:

```sh
npm ci
npx playwright install chromium
npm test
python3 -m unittest discover -s tests -v
```

The Android TV emulator workflow additionally exercises the packaged WebView, D-pad, Back, live-channel empty state and local persistence. This does not replace testing on a physical TV and remote.
