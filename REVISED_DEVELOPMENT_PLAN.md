# COSMISK: REVISED DEVELOPMENT PLAN

**Document Version:** 2.0
**Date:** April 9, 2026
**Status:** For Developer Review & Sign-off

---

## EXECUTIVE SUMMARY

Cosmisk is **85-90% built** with 89 modules, 100+ API endpoints, and working integrations for Meta Ads, Google Ads, and Claude AI. This revised plan focuses on:

1. **Gap filling** - Complete partially built features (Shopify, TikTok, Veo/Nano Banana)
2. **Stabilization** - Fix bugs, improve error handling, add monitoring
3. **Production readiness** - Deploy, load test, prepare for 1,000 users

**Timeline:** 4 weeks (May 1 - May 28)

---

## PHASE 0: CODEBASE AUDIT & ALIGNMENT (May 1-3)

**Duration:** 3 days
**Goal:** Understand existing code before writing new code

### Deliverables

| Task | Owner | Output |
|------|-------|--------|
| Clone repo and run locally | Dev Team | Working local environment |
| Review all 27 backend routes | Dev Team | Document: "What each route does" |
| Review all 27 services | Dev Team | Document: "Service dependencies" |
| Test existing features manually | Dev Team | Bug list (add to Phase 1) |
| Meet with Product Owner | Both | Clarify scope, answer questions |

### Questions to Answer

1. ✅ **Conflict Resolution:** Shopify is source of truth for orders, Meta for ad spend
2. ✅ **Data Duration:** Last 90 days for analysis, last 30 days for training
3. ✅ **API Access:** All Meta/Google APIs already configured, Shopify needs setup
4. ✅ **AI Model:** Use Claude (already integrated), NOT Gemini
5. ✅ **Winning Metrics:** ROAS > 2x OR CPA < account average triggers Auto Mode
6. ✅ **Media Specs:** Support 1:1, 9:16, 16:9 aspect ratios

### Exit Criteria
- [ ] Developers can run frontend + backend locally
- [ ] Developers have documented understanding of existing code
- [ ] All open questions answered
- [ ] Bug list created for Phase 1

---

## PHASE 1: STABILIZATION & BUG FIXES (May 4-10)

**Duration:** 7 days
**Goal:** Fix critical bugs, improve reliability

### Already Fixed (April 9)
- [x] Silent error catch blocks (8 locations)
- [x] Pagination on list endpoints
- [x] Daily cost limits in job queue

### Remaining Bug Fixes

| Bug | File(s) | Priority | Est. Hours |
|-----|---------|----------|------------|
| Type safety (`as any` casts) | 20+ locations in routes | HIGH | 8h |
| Polling without backoff | creative-engine, notifications | MEDIUM | 4h |
| Missing DB indexes | user_usage.period, automations | MEDIUM | 2h |
| Token refresh proactive | auth.ts, scheduled job | MEDIUM | 4h |
| Email delivery verification | auth.ts, morning-briefing | MEDIUM | 3h |

### Infrastructure Setup

| Task | Tool | Priority | Est. Hours |
|------|------|----------|------------|
| Deploy to Railway/Render | Railway CLI | HIGH | 4h |
| PostgreSQL migration | Prisma/Drizzle | HIGH | 8h |
| Set up Sentry error monitoring | Sentry SDK | HIGH | 2h |
| Configure CDN for media | Cloudflare R2 | MEDIUM | 4h |
| Set up staging environment | Railway | HIGH | 2h |

### Exit Criteria
- [ ] All HIGH priority bugs fixed
- [ ] Staging environment running
- [ ] Sentry capturing errors
- [ ] CI/CD pipeline configured

---

## PHASE 2: FEATURE COMPLETION (May 11-21)

**Duration:** 11 days
**Goal:** Complete partially built features

### 2A: Shopify Integration (May 11-14)

**Current State:** OAuth scripts exist, not wired to backend

| Task | Description | Est. Hours |
|------|-------------|------------|
| Create `/shopify` routes | OAuth exchange, token storage | 4h |
| Add ShopifyApiService | Orders, products, customers API | 8h |
| Add to normalization layer | Map Shopify → unified schema | 4h |
| Dashboard integration | Show Shopify metrics alongside Meta/Google | 4h |
| Test with real store | End-to-end verification | 4h |

**Deliverable:** Shopify data visible in Dashboard, blended ROAS calculated

### 2B: Veo + Nano Banana 2 Integration (May 15-18)

**Current State:** API provider framework exists, just need to add new providers

| Task | Description | Est. Hours |
|------|-------------|------------|
| Add VeoProvider class | Implement generate() and checkStatus() | 6h |
| Add NanoBananaProvider class | Implement generate() for images | 4h |
| Update api-providers.ts | Register new providers | 1h |
| Test video generation | End-to-end with job queue | 4h |
| Test image generation | Verify carousel support | 3h |
| Update cost tracking | Add Veo/NB costs to ledger | 2h |

**Deliverable:** Creative Engine can generate with Veo (video) and Nano Banana (images)

### 2C: TikTok Ads Completion (May 19-21)

**Current State:** OAuth routes exist, no data ingestion

| Task | Description | Est. Hours |
|------|-------------|------------|
| Complete TikTokApiService | Campaign insights, ad data | 8h |
| Add to Dashboard | TikTok tab with KPIs | 4h |
| Add to Brain patterns | Include TikTok in cross-platform analysis | 4h |
| Test with real account | End-to-end verification | 4h |

**Deliverable:** TikTok Ads data visible alongside Meta/Google

### Exit Criteria
- [ ] Shopify orders/revenue flowing into Dashboard
- [ ] Veo video generation working end-to-end
- [ ] Nano Banana image generation working
- [ ] TikTok Ads data visible (if in scope)
- [ ] All three platforms showing blended ROAS

---

## PHASE 3: DEMO PREPARATION (May 22-28)

**Duration:** 7 days
**Goal:** Production-ready for 1,000 user demo

### 3A: Load Testing (May 22-24)

| Test | Tool | Target | Est. Hours |
|------|------|--------|------------|
| API load test | k6 / Artillery | 100 concurrent users | 4h |
| Database stress test | Custom script | 10,000 rows | 2h |
| Job queue stress test | Custom script | 50 concurrent jobs | 3h |
| Frontend performance | Lighthouse | Score > 80 | 2h |

### 3B: Demo Flow Creation (May 25-26)

| Demo Scenario | Duration | Key Features Shown |
|---------------|----------|-------------------|
| **Onboarding** | 2 min | Connect Meta, see data flow |
| **Dashboard Overview** | 3 min | KPIs, charts, AI insights |
| **AI Chat** | 2 min | Ask "What's my best campaign?" |
| **Creative Generation** | 3 min | Sprint → Generate → Review |
| **Autopilot Demo** | 2 min | Show alerts, agent decisions |

### 3C: Fallback Mechanisms (May 25-26)

| Failure Point | Fallback Strategy |
|---------------|------------------|
| Meta API slow | Cached data + "Refreshing..." indicator |
| Claude API down | Graceful error + retry button |
| Video generation fails | Show placeholder + error message |
| Database overload | Read replicas + connection pooling |

### 3D: Final Polish (May 27-28)

| Task | Priority |
|------|----------|
| Demo account with realistic data | HIGH |
| Rehearsal with stakeholders | HIGH |
| Fix any last-minute bugs | HIGH |
| Documentation for handoff | MEDIUM |

### Exit Criteria
- [ ] Load test passing for 100 concurrent users
- [ ] Demo script rehearsed 3+ times
- [ ] All fallbacks tested
- [ ] Zero critical bugs in demo flow

---

## FEATURE SCOPE MATRIX

### IN SCOPE (Developer Must Deliver)

| Feature | Phase | Status |
|---------|-------|--------|
| Shopify Integration | 2A | Not started |
| Veo Video Provider | 2B | Not started |
| Nano Banana Image Provider | 2B | Not started |
| Bug fixes (critical) | 1 | Partial |
| Production deployment | 1 | Not started |
| Load testing | 3 | Not started |

### ALREADY DONE (Do Not Rebuild)

| Feature | Status | Notes |
|---------|--------|-------|
| Meta Ads OAuth + Data | ✅ Complete | 100% working |
| Google Ads OAuth + Data | ✅ Complete | 100% working |
| Claude AI Chat | ✅ Complete | With memory |
| Dashboard | ✅ Complete | KPIs, charts |
| Creative Engine | ✅ Complete | Sprint workflow |
| UGC Studio | ✅ Complete | Projects, scripts |
| Autopilot/Watchdog | ✅ Complete | Alerts working |
| Agent Memory | ✅ Complete | 3-tier system |
| Billing | ✅ Complete | Stripe + Razorpay |
| Reports | ✅ Complete | Auto-generation |

### OUT OF SCOPE (Future)

| Feature | Notes |
|---------|-------|
| Mobile app | Web-first approach |
| Agency multi-tenancy | Post-demo |
| Vision/image analysis | Nice-to-have |
| Offline mode | Post-demo |

---

## TECHNICAL DECISIONS

### AI Model
**Decision:** Use Claude (already integrated)
**Rationale:** 3-tier memory system already built, switching to Gemini would require rewrite

### Database
**Decision:** Migrate to PostgreSQL for production
**Rationale:** SQLite fine for dev, PostgreSQL needed for concurrent users

### Hosting
**Decision:** Railway or Render
**Rationale:** Simple deployment, auto-scaling, managed Postgres

### Media Storage
**Decision:** Cloudflare R2 or AWS S3
**Rationale:** CDN delivery, cost-effective, already returning cloud URLs

---

## DAILY STANDUPS

**Format:** 15-min async update (Slack/Discord)

```
What I completed yesterday:
What I'm working on today:
Blockers:
```

**Weekly Sync:** 30-min call every Monday to review progress

---

## RISK REGISTER

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Veo API changes | LOW | HIGH | Pin to stable version, have Kling fallback |
| Shopify OAuth issues | MEDIUM | MEDIUM | Use official Shopify SDK |
| Load test fails | MEDIUM | HIGH | Start testing early in Phase 3 |
| Scope creep | HIGH | HIGH | Strict scope, defer to "Future" |

---

## SIGN-OFF

### Product Owner
- [ ] Scope approved
- [ ] Timeline approved
- [ ] Budget confirmed

### Development Team
- [ ] Technical approach agreed
- [ ] Estimates reviewed
- [ ] Dependencies identified

### Date: _______________

---

## APPENDIX: EXISTING CODEBASE REFERENCE

### Backend Routes (27)
```
/ad-accounts, /agent, /ai, /analytics, /assets, /auth,
/automations, /autopilot, /billing, /brain, /brands,
/campaigns, /competitor-spy, /content, /creative-engine,
/creative-studio, /dashboard, /director, /google-ads,
/media, /reports, /score, /swipe-file, /team,
/tiktok-ads, /ugc, /ugc-workflows
```

### Backend Services (27)
```
ad-watchdog, agent-memory, api-providers, automation-engine,
autopilot-engine, content-agent, creative-patterns,
creative-scorer, creative-strategist, email, format-helpers,
google-ads-api, insights-parser, job-queue, meta-api,
meta-warmup, morning-briefing, notifications, plan-scorer,
platform-signals, report-agent, sales-agent, slack-interactive,
sprint-planner, token-crypto, trend-analyzer, visual-analyzer
```

### Frontend Features (35)
```
agency, agent, ai-studio, analytics, assets, attribution,
audit, auth, automations, autopilot, blog, brain, campaigns,
competitor-spy, contact, content-bank, creative-cockpit,
creative-engine, dashboard, director-lab, for-agencies,
graphic-studio, landing, legal, lighthouse, not-found,
onboarding, pitch-deck, pricing, reports, score, settings,
swipe-file, ugc-studio, waitlist
```
