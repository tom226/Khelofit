# KheloFit Deploy Today Checklist

## What is live now
- Landing UI (unchanged): `/`
- Full user app UI (functional): `/app`
- API base: `/api/*`

## Local verify
```bash
npm install
npm start
```
- Landing: `http://localhost:3000/`
- User app: `http://localhost:3000/app`
- Health: `http://localhost:3000/api/health`

## Required environment variables
Set these in your deployment platform:
- `MONGODB_URI`
- `JWT_SECRET`
- `NODE_ENV=production`
- Optional OTP providers:
  - `MSG91_AUTHKEY`, `MSG91_TEMPLATE_ID`, `MSG91_SENDER`
  - or `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`
- Optional email OTP:
  - `SENDGRID_API_KEY`, `SENDGRID_FROM`

## Deploy notes
- Ensure MongoDB is reachable from your host.
- Use the app URL path `/app` for user flows.
- Keep `/` for marketing/landing conversion funnel.

## Android shell (already prepared)
```bash
npm run android:sync
npm run android:open
```
In Android Studio:
- Build debug APK: `Build > Build Bundle(s) / APK(s) > Build APK(s)`
- Build Play Store bundle: `Build > Generate Signed Bundle / APK > Android App Bundle`
