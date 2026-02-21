# KheloFit Phase 1 (MVP) Delivery Plan

## Goals (exit criteria)
- Staging backend + React Native app with: OTP auth, onboarding, AI coach (Hindi/English), meal logging (50K Indian foods), activity logging (running/GPS + manual sports), matchmaking (create/join matches), events (list + Razorpay test booking), points/referrals, push for key actions.
- Seeded food DB and 50 curated events.
- CI (lint/test) passing; deployment docs; basic monitoring/logging; privacy/disclaimers in place.

## Week-by-week
- **Week 1-2 – Foundations**: Auth (phone OTP via MSG91/Twilio), sessions/JWT; profiles (language/goals/sports prefs); schemas (users, sessions, meals, activities, events, referrals); repo/CI/env/secrets; rate limits.
- **Week 2-4 – Health & AI Coach**: LLM integration (Claude/OpenAI) with guardrails; prompt library (Hindi/English); meal logging API (text search on seeded food DB); photo upload stub; health score pipeline with daily recompute.
- **Week 2-3 – Food DB Seeding**: Import 50K Indian foods; nutrition lookup service; admin/script to add/update; relevance checks.
- **Week 3-4 – Activity Tracking**: Running/GPS endpoints; manual sports logs (cricket/gym/yoga); stats aggregation; city leaderboard stub.
- **Week 4-5 – Sports Matchmaking**: Create/join match requests (sport/location/time/level); simple matching rules; notifications via push/WhatsApp deep link.
- **Week 4-5 – Events Marketplace**: Event model; seed 50 curated events; booking API with Razorpay test mode; ticket/confirmation payloads.
- **Week 5 – Gamification & Referrals**: Points/streaks for logs/bookings; referral codes/rewards tied to users.
- **Week 5-6 – Notifications**: Push via FCM; email/SMS fallback for OTP/confirmations; in-app notification feed stub.
- **Week 2-6 (parallel) – Mobile App (React Native)**: Screens for auth/onboarding, home dashboard (health score), meal log, activity log, matchmaking, events browse/book, referrals; API client; error states; Hindi/English localization.
- **Week 5-6 – Admin/Event Ops**: Simple web/admin to curate foods/events and view waitlist/users.

## Quality & compliance
- CI: lint/test; Prettier/ESLint; basic API tests.
- Monitoring: health checks, minimal logging; error alerts.
- Data protection: consent flags; PII at rest where feasible; privacy policy & disclaimers.

## Deliverables
- Running staging app (backend + RN client) with the above features.
- Food DB and event seed loaded.
- CI green; deploy/runbook docs.