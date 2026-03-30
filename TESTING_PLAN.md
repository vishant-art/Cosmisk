# Cosmisk Testing Plan

## 1. Current State

### Existing Tests
| Category | Count | Location | Framework |
|---|---|---|---|
| Backend Unit Tests | 8 | `server/src/__tests__/` | Vitest |
| E2E Tests | 6 | `e2e/` | Playwright |
| Frontend Unit Tests | 0 | — | Karma/Jasmine (configured, unused) |
| CI Pipeline | 4 jobs | `.github/workflows/ci.yml` | GitHub Actions |

### Existing Backend Unit Tests
- `automation-engine.test.ts` — Rule evaluation logic
- `creative-patterns.test.ts` — DNA pattern matching
- `validation.test.ts` — Zod schema validation
- `billing.test.ts` — Subscription logic
- `insights-parser.test.ts` — Meta insights parsing
- `token-crypto.test.ts` — Encryption/decryption
- `trend-analyzer.test.ts` — Trend calculation
- `routes-integration.test.ts` — API endpoint testing

### Existing E2E Tests
- `01-auth.spec.ts` — Login/signup flows
- `03-real-data.spec.ts` — Real Meta API data integration
- `05-morning-journey.spec.ts` — Morning routine (dashboard > alerts > actions)
- `06-user-journeys.spec.ts` — Real user personas with problem-solving verdicts
- `07-interactions.spec.ts` — Feature interactions
- `ci-smoke.spec.ts` — Quick smoke tests for CI

---

## 2. Testing Gaps (Priority Order)

### P0 — Critical (must have before production)
1. **Frontend unit tests** — zero coverage on 35 feature modules, 13 services, 16 shared components
2. **Auth & security tests** — JWT handling, token refresh, guards, interceptors, password reset
3. **API route tests** — only 1 integration test file covers routes; 25 route files untested
4. **Agent system tests** — autopilot-engine, content-agent, agent-memory have no tests

### P1 — High Priority
5. **Database layer tests** — schema migrations, CRUD operations, index performance
6. **Payment flow tests** — Stripe/Razorpay webhook handling, subscription state machine
7. **External API mock tests** — Meta Graph API, Google Ads API, TikTok API service mocks
8. **Error handling tests** — error interceptor, API error responses, graceful degradation

### P2 — Medium Priority
9. **Performance tests** — API response times, frontend bundle size regression, SQLite query performance
10. **Accessibility tests** — WCAG compliance, keyboard navigation, screen reader support
11. **Visual regression tests** — screenshot comparisons for key pages

### P3 — Nice to Have
12. **Load/stress tests** — concurrent users, rate limiter behavior under load
13. **Cross-browser E2E** — Safari, Firefox coverage (currently Chromium only)
14. **Mobile responsive tests** — viewport testing for all breakpoints

---

## 3. Implementation Plan

### Phase 1: Foundation (Week 1-2)

#### 3.1 Frontend Unit Tests — Angular Services
**Target:** 13 core services in `src/app/core/services/`

| Service | Test File | Key Test Cases |
|---|---|---|
| `auth.service.ts` | `auth.service.spec.ts` | Login/signup API calls, token storage, logout cleanup, user state management |
| `api.service.ts` | `api.service.spec.ts` | Base URL resolution, HTTP method wrappers, error propagation |
| `brand.service.ts` | `brand.service.spec.ts` | Brand CRUD, active brand switching, brand list caching |
| `creative-engine.service.ts` | `creative-engine.service.spec.ts` | Sprint creation, job polling, status transitions |
| `ugc.service.ts` | `ugc.service.spec.ts` | Project/concept/script CRUD operations |
| `media-gen.service.ts` | `media-gen.service.spec.ts` | Video/image generation requests, status polling |
| `ai.service.ts` | `ai.service.spec.ts` | Chat message sending, streaming responses |
| `ad-account.service.ts` | `ad-account.service.spec.ts` | Account listing, sync triggers, connection status |
| `notification.service.ts` | `notification.service.spec.ts` | Notification creation, read/unread state |
| `toast.service.ts` | `toast.service.spec.ts` | Toast display, auto-dismiss, type variants |
| `date-range.service.ts` | `date-range.service.spec.ts` | Range calculation, preset ranges, custom ranges |
| `meta-oauth.service.ts` | `meta-oauth.service.spec.ts` | OAuth redirect, callback handling, token exchange |
| `autopilot-badge.service.ts` | `autopilot-badge.service.spec.ts` | Badge count, alert acknowledgment |

#### 3.2 Frontend Unit Tests — Guards & Interceptors

| File | Test Cases |
|---|---|
| `authGuard` | Authenticated user passes, unauthenticated redirects to `/login`, token expiry handling |
| `onboardingGuard` | Complete user passes, incomplete redirects to `/onboarding` |
| `authInterceptor` | Token attached to requests, skips public endpoints, handles missing token |
| `errorInterceptor` | 401 triggers logout, 403 shows forbidden toast, 500 shows error toast, network error handling |

#### 3.3 Frontend Unit Tests — Shared Components

| Component | Test Cases |
|---|---|
| `sidebar` | Navigation links render, active route highlighting, collapse/expand |
| `topbar` | Search input, notification badge, user menu |
| `modal` | Open/close, backdrop click dismiss, escape key dismiss |
| `kpi-card` | Value display, trend arrow direction, loading state |
| `insight-card` | Content rendering, action button click |
| `creative-card` | Thumbnail display, metadata rendering, click handler |
| `status-badge` | Correct color per status (winning/stable/fatiguing) |
| `dna-badge` | Correct color per type (hook/visual/audio) |
| `command-palette` | Open on Cmd+K, search filtering, action execution |
| `toast` | Renders message, auto-dismiss timer, close button |
| `loading-spinner` | Visibility toggle, size variants |
| `empty-state` | Message display, action button |

#### 3.4 Frontend Unit Tests — Pipes & Directives

| Item | Test Cases |
|---|---|
| `indian-currency.pipe` | Formats numbers with INR commas (1,00,000), handles zero/null |
| `relative-time.pipe` | "just now", "5 minutes ago", "2 hours ago", "yesterday", date fallback |
| `animate-on-scroll` | Adds class on intersection, removes on exit |
| `count-up` | Animates from 0 to target, handles decimals |

---

### Phase 2: Backend Coverage (Week 2-3)

#### 3.5 Backend API Route Tests
**Framework:** Vitest + Fastify inject

| Route File | Test Cases |
|---|---|
| `auth.ts` | Signup validation, login success/failure, password reset flow, JWT token generation |
| `dashboard.ts` | KPI aggregation with/without data, date range filtering |
| `analytics.ts` | Campaign-level metrics, ad-level metrics, empty state handling |
| `brands.ts` | CRUD operations, brand switching, validation errors |
| `creative-engine.ts` | Sprint creation, job status polling, sprint listing |
| `ugc.ts` | Project CRUD, concept generation, script generation |
| `automations.ts` | Rule CRUD, rule activation/deactivation |
| `autopilot.ts` | Alert listing, decision recording, alert acknowledgment |
| `agent.ts` | Agent run history, decision history, memory queries |
| `billing.ts` | Subscription creation, webhook handling, plan changes |
| `team.ts` | Invite creation, invite acceptance, role management |
| `content.ts` | Content bank CRUD, platform filtering |
| `swipe-file.ts` | Swipe item CRUD, DNA tagging |
| `reports.ts` | Report generation, report listing |
| `assets.ts` | Asset upload/listing, asset deletion |
| `campaigns.ts` | Campaign CRUD, status updates |
| `score.ts` | Score calculation, score history |
| `competitor-spy.ts` | Competitor search, ad library fetching |
| `media-gen.ts` | Generation request, status polling, provider selection |
| `ai.ts` | Chat message handling, context management |
| `brain.ts` | Knowledge base queries, insight retrieval |
| `director.ts` | Brief generation, direction management |
| `ad-accounts.ts` | Account listing, sync, reconnection |
| `google-ads.ts` | Account connection, metric fetching |
| `tiktok-ads.ts` | Account connection, metric fetching |

#### 3.6 Backend Service Tests

| Service | Test Cases |
|---|---|
| `autopilot-engine.ts` | Decision logic for pause/resume/budget adjust, confidence scoring, threshold evaluation |
| `content-agent.ts` | Brief generation from top performers, memory integration |
| `morning-briefing.ts` | Digest assembly, metric summarization |
| `agent-memory.ts` | Core memory CRUD, episode storage/retrieval, entity tracking, relevance scoring |
| `meta-api.ts` | API call construction, response parsing, error handling (mock HTTP) |
| `google-ads-api.ts` | Query building, response mapping, auth refresh |
| `automation-engine.ts` | Rule evaluation edge cases (extend existing tests) |
| `sprint-planner.ts` | Plan generation, slot allocation, constraint validation |
| `plan-scorer.ts` | Score calculation, weighting logic |
| `email.ts` | Template rendering, send via Resend API (mocked) |
| `notifications.ts` | Notification dispatch, channel routing |
| `job-queue.ts` | Job scheduling, retry logic, completion handling |
| `token-crypto.ts` | Edge cases (extend existing: empty strings, invalid keys) |
| `api-providers.ts` | Provider selection, request formatting per provider, response normalization |

#### 3.7 Database Tests

| Area | Test Cases |
|---|---|
| Schema creation | All 30+ tables created successfully, indexes exist |
| User CRUD | Create, read, update, delete user records |
| Cascade operations | Deleting user cascades to related records |
| Concurrent access | Simultaneous read/write operations on SQLite |
| Data integrity | Foreign key constraints enforced, unique constraints work |

---

### Phase 3: Security & Integration (Week 3-4)

#### 3.8 Security Tests

| Area | Test Cases |
|---|---|
| Authentication | JWT expiration, invalid tokens rejected, refresh flow |
| Authorization | User can only access own data, team role enforcement |
| Input validation | SQL injection attempts blocked, XSS payloads sanitized |
| Rate limiting | Rate limiter triggers after threshold, resets after window |
| CORS | Only whitelisted origins accepted, preflight requests handled |
| Token encryption | Encrypted tokens cannot be read without key, rotation works |
| Password security | bcrypt hashing, minimum password requirements |
| API key protection | Keys not leaked in responses, proper env var handling |

#### 3.9 Integration Tests (Mocked External APIs)

| Integration | Test Cases |
|---|---|
| Meta Graph API | Campaign fetch, insights query, token refresh, rate limit handling |
| Google Ads API | Customer listing, report query, auth flow |
| TikTok Ads API | Account listing, ad metrics, auth callback |
| Stripe | Checkout session creation, webhook signature validation, subscription lifecycle |
| Razorpay | Order creation, payment verification, webhook handling |
| Claude AI | Chat completion, streaming, token counting, error recovery |
| Video providers | HeyGen/Kling/Creatify/Flux request formatting, status polling, callback handling |
| Resend email | Send request, template rendering, error handling |

---

### Phase 4: E2E & Performance (Week 4-5)

#### 3.10 E2E Test Expansion (Playwright)

| Test Suite | Scenarios |
|---|---|
| `02-onboarding.spec.ts` | Full onboarding flow, brand creation, ad account connection |
| `04-creative-engine.spec.ts` | Sprint creation, job monitoring, asset download |
| `08-automations.spec.ts` | Rule creation, activation, trigger simulation |
| `09-billing.spec.ts` | Plan selection, checkout redirect, plan change |
| `10-team.spec.ts` | Invite member, accept invite, role switching |
| `11-settings.spec.ts` | Profile update, Meta OAuth connect, notification preferences |
| `12-content-bank.spec.ts` | Content creation, platform filtering, scheduling |
| `13-ugc-studio.spec.ts` | Project creation, concept generation, script generation |
| `14-reports.spec.ts` | Report generation, PDF export, sharing |
| `15-ai-studio.spec.ts` | Chat interaction, context awareness, suggestion clicks |

#### 3.11 Performance Tests

| Test | Target | Tool |
|---|---|---|
| API response time | < 200ms for dashboard, < 500ms for analytics | k6 or Artillery |
| Frontend bundle size | < 500KB initial load (gzipped) | Angular budget + CI check |
| SQLite query time | < 50ms for indexed queries | Vitest benchmarks |
| Image/asset loading | < 2s LCP on dashboard | Lighthouse CI |
| Concurrent users | 50 simultaneous without errors | k6 |

---

## 4. Test Infrastructure Additions

### 4.1 Frontend Test Setup
```bash
# Angular tests already configured via Karma/Jasmine in angular.json
# Generate test files alongside components:
ng generate component --skip-tests=false
```

### 4.2 Backend Test Utilities Needed
- **Test database factory** — in-memory SQLite for isolated test runs
- **Request factory** — helper to build authenticated Fastify inject requests
- **Mock factory** — reusable mocks for Meta API, Google Ads, Stripe, Claude
- **Seed data** — consistent test fixtures for users, brands, campaigns, ads

### 4.3 CI Pipeline Enhancements
```yaml
# Add to .github/workflows/ci.yml:
frontend-unit-tests:
  name: Frontend Unit Tests
  steps:
    - run: npx ng test --watch=false --browsers=ChromeHeadless

security-scan:
  name: Security Scan
  steps:
    - run: npm audit --audit-level=high
    - run: npx snyk test (optional)

coverage-report:
  name: Coverage Report
  steps:
    - run: npm test -- --coverage
    - uses: codecov/codecov-action@v4
```

### 4.4 Test Environment Variables
Create `server/.env.test` with safe defaults for all 65+ env vars (no real API keys).

---

## 5. Coverage Targets

| Layer | Current | Phase 1 | Phase 2 | Phase 3 | Phase 4 |
|---|---|---|---|---|---|
| Frontend Services | 0% | 80% | 80% | 80% | 85% |
| Frontend Components | 0% | 60% | 60% | 60% | 70% |
| Backend Routes | ~5% | 5% | 70% | 80% | 85% |
| Backend Services | ~15% | 15% | 60% | 75% | 80% |
| E2E Journeys | 6 specs | 6 | 6 | 6 | 16 |
| Security | 0% | 0% | 0% | 70% | 70% |

---

## 6. Running Tests

```bash
# Frontend unit tests
npm test                              # Watch mode
npx ng test --watch=false             # Single run (CI)

# Backend unit tests
cd server && npm test                 # Vitest
cd server && npx vitest --coverage    # With coverage

# E2E tests (full)
npx playwright test

# E2E tests (CI smoke)
npx playwright test --config=playwright.ci.config.ts

# All tests (CI equivalent)
npm run build && cd server && npm test && cd .. && npx playwright test
```

---

## 7. Priority Execution Order

1. **Week 1:** Auth service tests + guards/interceptors + pipes/directives (quick wins, critical path)
2. **Week 1-2:** Core service tests (api, brand, creative-engine) + shared component tests
3. **Week 2:** Backend route tests for auth, dashboard, billing, team (user-facing critical paths)
4. **Week 2-3:** Agent system tests (autopilot-engine, content-agent, agent-memory)
5. **Week 3:** Security tests + external API mock tests
6. **Week 3-4:** Remaining backend route + service tests
7. **Week 4:** Remaining frontend feature module tests
8. **Week 4-5:** New E2E specs + performance baseline tests
9. **Week 5:** CI pipeline enhancements, coverage gates, reporting
