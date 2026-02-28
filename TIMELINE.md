# KheloFit Phase 1 Timeline & Issue Backlog (Draft)

## Timeline (Weeks)

| Week | Track | Deliverables |
|------|-------|--------------|
| 1 | Backend/Infra | OTP auth (MSG91/Twilio), sessions/JWT, user profiles; schemas (users, meals, activities, events, referrals); CI/lint/test wiring; env/secrets; rate limits. |
| 2 | Backend/Data | Food DB import pipeline (50K items) + search API; AI coach scaffolding with guardrails; staging env. |
| 3 | Product/API | Meal logging API (text search), health score calc; GPS + manual activity logging; matchmaking create/join API; notifications skeleton. |
| 4 | Product/API | Events model + seed 50 events; Razorpay test checkout; ticket payloads; stats aggregation; matchmaking refinement; push hooks. |
| 5 | Product/API | Points/streaks; referrals; in-app notification feed stub; admin UI for foods/events; error tracking/logging. |
| 6 | Mobile (RN) | Auth/onboarding, home dashboard (health score), meal log, activity log, matchmaking UI, events browse/booking, referrals; Hindi/English localization; QA round. |

## Issue Backlog (to open in GitHub)

- Backend
  - BE-001 Auth: phone OTP (MSG91/Twilio), JWT/session middleware.
  - BE-002 User profile: goals/language/sports prefs CRUD.
  - BE-003 Food DB ingest + search API (50K items); relevance tuning.
  - BE-004 Meal logging API; nutrition breakdown; daily aggregates.
  - BE-005 Activity logging: GPS run + manual sports; stats aggregation.
  - BE-006 Matchmaking API: create/join match; basic matching rules; notifications.
  - BE-007 Events: model, listing, detail; seed 50 events; Razorpay test checkout; ticket issuance.
  - BE-008 Gamification: points, streaks, referral rewards; leaderboards stub.
  - BE-009 Notifications: push via FCM; email/SMS for OTP/confirmations.
  - BE-010 Admin endpoints: foods/events curation; waitlist/users view.

- Mobile (React Native)
  - RN-001 Auth + OTP UI; onboarding flow (language/goals/sports).
  - RN-002 Home dashboard (health score, quick actions).
  - RN-003 Meal logging UI (search, recent, photo stub); nutrition view.
  - RN-004 Activity logging (GPS run, manual sports); stats view.
  - RN-005 Matchmaking UI (create/join, match detail, share invite).
  - RN-006 Events browse/detail/booking (Razorpay test flow); tickets view.
  - RN-007 Referrals + points display; streaks.
  - RN-008 Localization HI/EN; error/empty states; offline guards.

- Data/Content
  - DATA-001 Food dataset QA; gaps list; update job.
  - DATA-002 Event curation: 50 seeded events with pricing/date/geo.

- Infra/Quality
  - INFRA-001 CI pipeline (lint/test); env templates.
  - INFRA-002 Logging/monitoring; health checks; error alerts.
  - INFRA-003 Security: rate limits (already in place), input validation, DPDP consent flags, PII handling.

## Notes
- This is a draft; not pushed to remote per request. Open issues/milestones manually in GitHub when ready.