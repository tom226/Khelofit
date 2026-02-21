# KheloFit Project & Marketing Plan

## Snapshot
- Scope: MVP (Phase 1), V1.1, V1.2; Indian market health + sports + events.
- Tech: Node.js/Express, MongoDB, React Native (apps), Razorpay, LLM APIs.
- Target: Beta Bangalore, Hindi/English first; expand to 8 languages by V1.1.

## Product Phases
- Phase 1 (MVP, 6 weeks): OTP auth, onboarding, AI coach (HI/EN), meal logging (50K foods), activity logging (GPS + manual sports), matchmaking (create/join), events list + Razorpay test booking, points/referrals, push; admin for food/events.
- Phase 1.1 (Weeks 7-10): 8 languages, social feed, community groups, wearable integration (Noise/boAt/Mi Band), Ayurveda plans, restaurant calories, voice AI, city leaderboards.
- Phase 1.2 (Weeks 11-16): Virtual events, corporate wellness dashboard, points marketplace, advanced reports, AI event recommendations, cricket scorecard, family dashboard, insurance pilot.

## Delivery Timeline (high level)
- Weeks 1-2: Auth/OTP, profiles, schemas, CI, env/secrets; start food DB import.
- Weeks 2-4: AI coach integration, meal search, health score; GPS + manual activity logging.
- Weeks 3-4: Matchmaking create/join, notifications; stats aggregation.
- Weeks 4-5: Events model, seed 50 events, Razorpay test checkout; ticket payloads.
- Weeks 5-6: Points, referrals, push via FCM, basic admin for foods/events; RN app screens for all flows.
- Weeks 7-10: Localization 8 langs, social feed, groups, wearables, Ayurveda, restaurant calories, voice AI, leaderboards.
- Weeks 11-16: Virtual events, corporate wellness, marketplace for points, reports, AI recs, cricket scorecard, family/insurance pilots.

## Engineering Workstreams
- Backend: Auth/OTP, users/goals, meals, activities, matchmaking, events, payments, referrals, notifications, reports.
- Data: Food DB ingestion and search; event curation; telemetry for engagement.
- Mobile (RN): Auth/onboarding, home dashboard, meal log, activity log, matchmaking UI, events browse/booking, referrals, notifications, localization.
- Infra/DevOps: CI (lint/test), staging/prod envs, logging, health checks, rate limiting, secrets management.
- Admin tools: Food/event curation, waitlist/users view, basic metrics.

## Marketing Plan (Phase 1 launch → 12 weeks)
- Channels: Instagram/YouTube Shorts; WhatsApp viral loops (Health Score share, match invites); micro-influencers (cricket/running); running event partnerships; college ambassadors; PR (YourStory/Inc42); ASO/Google Ads branded search.
- Budget (Y1 guidance): ~₹37 lakh; for Phase 1 allocate ~₹8-10 lakh over 12 weeks, front-loaded on creative and micro-influencers.
- Growth loops: Health Score sharing, sports matchmaking invites, event social proof, referral rewards, leaderboards competition.
- Launch cities: Soft launch Bangalore (Weeks 5-6), add Mumbai/Delhi (Weeks 7-10), Pune/Hyderabad/Chennai (Weeks 11-12).

## KPIs (Phase 1)
- Acquisition: 100K registered, 30K MAU by Month 3.
- Engagement: DAU/MAU ≥25%, meals logged/user/day ≥1.5, activities/week/user ≥1.
- Virality: K-factor ≥0.5, ≥15% new users from referral.
- Revenue (test): Razorpay test conversions; prep pricing ₹299/mo premium.

## Risks & Mitigations
- Retention: Mitigate with streaks, points, social features, notifications.
- AI accuracy: Human-verified food DB, fallback manual logging; tight prompts and evals.
- Supply (events): Manually seed 50+ events; partnerships; free listings initially.
- Data privacy/cost: DPDP compliance, consent, PII minimization; cache prompts, monitor LLM cost.

## Next Actions
- Confirm OTP provider (MSG91 vs Twilio) and Razorpay test keys in env.
- Ingest food DB seed; lock search API contract for mobile.
- Finalize city rollout order and creative calendar for first 6 weeks.