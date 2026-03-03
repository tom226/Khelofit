# Google OAuth Setup (Web + Android + iOS)

This project now supports Google login across:
- Web (Google Identity Services)
- Android (Capacitor GoogleAuth plugin)
- iOS (Capacitor GoogleAuth plugin)

## 1) Google Cloud Console

Create OAuth clients in one Google Cloud project:

1. **Web client**
   - Type: Web application
   - Add Authorized JavaScript origins (example):
     - `http://localhost:3000`
     - your production domain
   - Add Authorized redirect URIs if required by your deployment flow.

2. **Android client**
   - Type: Android
   - Package name: `com.khelofit.app`
   - SHA-1 fingerprint from your keystore.

3. **iOS client**
   - Type: iOS
   - Bundle ID: `com.khelofit.app`

## 2) Backend env variables

Update `.env` with these values:

- `GOOGLE_WEB_CLIENT_ID=` (required)
- `GOOGLE_ANDROID_CLIENT_ID=` (recommended)
- `GOOGLE_IOS_CLIENT_ID=` (recommended)

Backward compatibility still works with `GOOGLE_CLIENT_ID`, but use `GOOGLE_WEB_CLIENT_ID` going forward.

## 3) Capacitor config

In `capacitor.config.json`, set:

- `plugins.GoogleAuth.serverClientId` = your **Web client ID**

This is required to receive verifiable ID tokens on native.

## 4) Android setup

- Keep app package as `com.khelofit.app`.
- If you use Firebase services, keep `android/app/google-services.json` aligned with the same project.
- Run:
  - `npm run android:sync`
  - `npm run android:open`

## 5) iOS setup

- `ios` platform is added.
- Replace URL scheme placeholder in `ios/App/App/Info.plist`:
  - `REVERSED_CLIENT_ID_FROM_GOOGLE_SERVICE_INFO_PLIST`
  - with the real `REVERSED_CLIENT_ID` from your iOS Google client (or `GoogleService-Info.plist`).
- On macOS:
  - `npm run ios:sync`
  - `npm run ios:open`
  - Run `pod install` if prompted by Xcode.

## 6) API endpoints used

- `GET /api/auth/google-config`
- `POST /api/auth/google-login`
  - Accepts `credential` (web) or `idToken` (native)

## 7) Quick validation checklist

- Web: "Continue with Google" works on `/app`
- Android: native Google dialog appears; login returns token and opens app session
- iOS: same behavior after URL scheme + pods are configured on Mac
