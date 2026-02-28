# Progress Log

## 2026-02-25
- Fixed waitlist 500s by normalizing duplicate checks and async pre-save hook.
- Disabled dev rate limiting; waitlist submits succeed; duplicate returns friendly message.
- Patched landing page smooth-scroll selector bug.
- Verified server startup (`npm start`) and health endpoint.
- Added OTP delivery integration hooks (Twilio SMS, SendGrid email) with env-gated senders and email stored on users.
- Added MSG91-first SMS OTP support (fallback to Twilio) and updated .env example.
- Added basic email/password auth (register/login) with bcrypt hashing alongside OTP.

## Next Up
- Add real OTP delivery (SMS/email) with provider creds via env.
- Wire OTP UI flow after provider is chosen.
- Prepare deployment scripts (PM2/env) once OTP flow is done.
