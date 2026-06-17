# ERPOVO Android Wrapper (Capacitor)

This folder is created by Capacitor after running `bun run cap:add:android`.
It wraps the published ERPOVO web app in a native Android shell.

## Identity

- **Package / Application ID:** `com.chairking.erpovo`
- **App Name:** `ERPOVO`
- **Default URL:** `https://happy-heart-hub-00.lovable.app` (Cloud Mode)
- **Override URL:** set `CAP_SERVER_URL` env before `cap sync`

## One-time setup (on a developer machine with Android SDK + JDK 17)

```bash
# 1. Install JS deps
bun install

# 2. Build the web bundle (or skip if loading remote URL only)
bun run build

# 3. Add the Android platform (creates /android)
bun run cap:add:android

# 4. Sync web assets + Capacitor plugins
bun run cap:sync

# 5. Open in Android Studio (recommended for first build)
bun run cap:open:android
```

## Build a debug APK (CLI)

```bash
cd android
./gradlew assembleDebug
# APK output:
# android/app/build/outputs/apk/debug/app-debug.apk
```

## Build a release APK (unsigned)

```bash
cd android
./gradlew assembleRelease
# android/app/build/outputs/apk/release/app-release-unsigned.apk
```

## Signing (required for Play Store, not for sideload testing)

1. Generate a keystore (once):
   ```bash
   keytool -genkey -v -keystore erpovo-release.keystore \
     -alias erpovo -keyalg RSA -keysize 2048 -validity 10000
   ```
2. Add to `android/keystore.properties` (gitignored):
   ```
   storeFile=../erpovo-release.keystore
   storePassword=********
   keyAlias=erpovo
   keyPassword=********
   ```
3. Wire `signingConfigs` in `android/app/build.gradle`.
4. Re-run `./gradlew assembleRelease` or `bundleRelease` for AAB.

A signing key is **NOT required now** for development / internal QA APKs
(debug builds are auto-signed with the Android debug key). It IS required
before Play Store upload.

## Assets still needed before public release

- `android/app/src/main/res/mipmap-*/ic_launcher.png` (replace placeholder)
- `android/app/src/main/res/drawable*/splash.png` (replace placeholder)
- Adaptive icon foreground + background (recommended)
- Play Store listing assets: 512×512 icon, feature graphic, screenshots

A simple SVG placeholder lives at `public/icon.svg` and is reused by the
PWA manifest; convert it to PNGs at the standard mipmap densities
(48/72/96/144/192 px) before release.

## Local Mode safety

The wrapper points at the existing web app. Local Mode keeps using the
browser IndexedDB inside the WebView — no data is sent to the cloud.
Sales / stock / purchase / payment cloud sync only runs when the user is
in Cloud Mode, identical to the web build.
