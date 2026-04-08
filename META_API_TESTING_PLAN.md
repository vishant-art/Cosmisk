# Meta API Testing Plan -- Cosmisk

**Tester:** _______________
**Date:** _______________
**Test Account:** act_XXXXXXXXX
**Environment:** Development / Staging / Production

---

## Prerequisites

Before starting, ensure:
- [ ] A Meta Business Account with at least 1 ad account connected
- [ ] The ad account has recent ad data (last 30 days of active campaigns)
- [ ] At least 1 video ad and 1 image ad exist in the account
- [ ] Server is running locally (`cd server && npm run dev`)
- [ ] Frontend is running (`ng serve`)
- [ ] You have a valid JWT token (login via the app first)
- [ ] `.env` has valid `META_APP_ID`, `META_APP_SECRET`, `ANTHROPIC_API_KEY`

**How to get JWT for curl tests:**
```bash
# Login and copy the token from the response
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "your@email.com", "password": "yourpass"}'

# Use it in subsequent requests
export TOKEN="your_jwt_token_here"
```

---

## Section 1: OAuth & Token Management

### 1.1 Connect Meta Account
| # | Test | Steps | Expected Result | Pass? |
|---|------|-------|-----------------|-------|
| 1 | OAuth redirect | Click "Connect Meta" in Settings | Redirects to Facebook login page | |
| 2 | Token exchange | Complete Facebook login | Redirected back to app, shows "Connected" | |
| 3 | Token stored encrypted | Check DB: `SELECT * FROM meta_tokens WHERE user_id='...'` | Token value is encrypted (not plaintext), contains `:` separators | |
| 4 | Long-lived token | Check token expiry in DB | `expires_at` is ~60 days from now | |

### 1.2 Check Connection Status
```bash
curl http://localhost:3000/auth/meta-status \
  -H "Authorization: Bearer $TOKEN"
```
| # | Test | Expected Result | Pass? |
|---|------|-----------------|-------|
| 5 | Valid token | `{ connected: true, username: "...", accountCount: N }` | |
| 6 | Expired token | Disconnect, reconnect with expired token mock -- should show `connected: false` | |

### 1.3 Disconnect
```bash
curl -X POST http://localhost:3000/auth/meta-disconnect \
  -H "Authorization: Bearer $TOKEN"
```
| # | Test | Expected Result | Pass? |
|---|------|-----------------|-------|
| 7 | Disconnect | `{ success: true }`, token deleted from DB | |
| 8 | After disconnect | All Meta-dependent endpoints return appropriate error (not crash) | |

---

## Section 2: Ad Accounts

### 2.1 List Accounts
```bash
curl "http://localhost:3000/ad-accounts/list?limit=100" \
  -H "Authorization: Bearer $TOKEN"
```
| # | Test | Expected Result | Pass? |
|---|------|-----------------|-------|
| 9 | Returns all accounts | `accounts` array with id, name, business_name, currency | |
| 10 | Pagination works | If user has 25+ accounts, all should appear (not just first 25) | |
| 11 | Account status | Active accounts have `account_status: 1` | |
| 12 | Caching | Second call within 5 min is faster (cached) | |
| 13 | Currency present | Each account has `currency` field (USD, INR, etc.) | |

### 2.2 Account KPIs
```bash
curl "http://localhost:3000/ad-accounts/kpis?account_id=act_XXX&credential_group=system&date_preset=last_7d" \
  -H "Authorization: Bearer $TOKEN"
```
| # | Test | Expected Result | Pass? |
|---|------|-----------------|-------|
| 14 | Returns KPIs | spend, revenue, roas, cpa, ctr, impressions, clicks, conversions, cpc, aov | |
| 15 | Each KPI has value + change | `{ value: 1234, change: 12.5 }` format | |
| 16 | Sparkline data | `sparkline` array with daily values | |
| 17 | Different presets | Test with `last_7d`, `last_14d`, `last_30d` -- values should differ | |
| 18 | Zero-spend account | Returns zeroes, no crash | |
| 19 | Currency formatting | Matches account currency (INR shows rupees, USD shows dollars) | |

### 2.3 Top Ads
```bash
curl "http://localhost:3000/ad-accounts/top-ads?account_id=act_XXX&credential_group=system&limit=20&date_preset=last_30d" \
  -H "Authorization: Bearer $TOKEN"
```
| # | Test | Expected Result | Pass? |
|---|------|-----------------|-------|
| 20 | Returns ads sorted by spend | Array of ads with name, metrics (roas, cpa, ctr, spend) | |
| 21 | Thumbnails present | Each ad has `thumbnail_url` (not null/empty) | |
| 22 | Limit respected | Requesting limit=5 returns max 5 | |
| 23 | Video ads identified | Video ads have `object_type: 'VIDEO'` and `video_id` | |

### 2.4 Video Source
```bash
curl "http://localhost:3000/ad-accounts/video-source?video_id=XXXXX&account_id=act_XXX&credential_group=system" \
  -H "Authorization: Bearer $TOKEN"
```
| # | Test | Expected Result | Pass? |
|---|------|-----------------|-------|
| 24 | Returns playable URL | `source` field with video URL (not Facebook page link) | |
| 25 | Invalid video_id | Returns error gracefully, no 500 crash | |

---

## Section 3: Dashboard

### 3.1 KPI Dashboard (Frontend)
| # | Test | Steps | Expected Result | Pass? |
|---|------|-------|-----------------|-------|
| 26 | KPI cards load | Go to /app/dashboard | All KPI cards show values with trends | |
| 27 | Account switcher | Switch to different ad account | KPI values refresh to new account's data | |
| 28 | Date range change | Change date preset dropdown | Values update accordingly | |

### 3.2 Chart Data
```bash
curl "http://localhost:3000/dashboard/chart?account_id=act_XXX&credential_group=system&date_preset=last_7d" \
  -H "Authorization: Bearer $TOKEN"
```
| # | Test | Expected Result | Pass? |
|---|------|-----------------|-------|
| 29 | Daily data points | Array with one entry per day, each has date/roas/spend/revenue/ctr/cpa | |
| 30 | Dates are correct | Dates match the requested range | |
| 31 | Chart renders | Frontend chart displays without errors | |

### 3.3 Insights
```bash
curl "http://localhost:3000/dashboard/insights?account_id=act_XXX&credential_group=system&date_preset=last_7d" \
  -H "Authorization: Bearer $TOKEN"
```
| # | Test | Expected Result | Pass? |
|---|------|-----------------|-------|
| 32 | Returns insights array | Each insight has title, description, type, priority | |
| 33 | Insights are contextual | Reference actual campaign names and metrics (not generic) | |
| 34 | Confidence assessed | Low-spend insights mention data confidence caveats | |

### 3.4 Top Creatives Widget
```bash
curl "http://localhost:3000/dashboard/top-creatives?account_id=act_XXX&credential_group=system" \
  -H "Authorization: Bearer $TOKEN"
```
| # | Test | Expected Result | Pass? |
|---|------|-----------------|-------|
| 35 | Returns top 6 | Max 6 ads, sorted by ROAS | |
| 36 | Thumbnails load | Image URLs are accessible (not 404) | |

---

## Section 4: Creatives / Creative Cockpit

### 4.1 Creatives List
```bash
curl "http://localhost:3000/creatives/list?account_id=act_XXX&credential_group=system&date_preset=last_30d" \
  -H "Authorization: Bearer $TOKEN"
```
| # | Test | Expected Result | Pass? |
|---|------|-----------------|-------|
| 37 | All ads returned | Array with id, name, metrics, thumbnail | |
| 38 | Sorted by spend | First ad has highest spend | |
| 39 | Status included | Each ad has effective_status | |

### 4.2 Creative Detail
```bash
curl "http://localhost:3000/creatives/detail?ad_id=XXXXX&account_id=act_XXX&credential_group=system" \
  -H "Authorization: Bearer $TOKEN"
```
| # | Test | Expected Result | Pass? |
|---|------|-----------------|-------|
| 40 | Full ad detail | Name, metrics, campaign name, ad set name, creative body/title | |
| 41 | 30-day metrics | ROAS, CPA, CTR, spend, impressions, conversions present | |
| 42 | Creative fields | thumbnail_url, object_type present | |
| 43 | Invalid ad_id | Returns error, no crash | |

### 4.3 Creative Analysis
```bash
curl -X POST http://localhost:3000/creatives/analyze \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"ad_id": "XXXXX", "account_id": "act_XXX", "credential_group": "system"}'
```
| # | Test | Expected Result | Pass? |
|---|------|-----------------|-------|
| 44 | Returns analysis | Score, strengths, weaknesses, recommendations | |
| 45 | Benchmarks used | Analysis compares ad vs account averages | |
| 46 | Low-spend caveat | If ad has very low spend, analysis mentions confidence issue | |

### 4.4 Creative Recommendations
```bash
curl "http://localhost:3000/creatives/recommendations?account_id=act_XXX&credential_group=system" \
  -H "Authorization: Bearer $TOKEN"
```
| # | Test | Expected Result | Pass? |
|---|------|-----------------|-------|
| 47 | Categorized recs | Scale, pause, iterate, video vs image comparison | |
| 48 | Specific ad names | Recommendations reference actual ad names, not generic advice | |

---

## Section 5: Analytics

### 5.1 Full Analytics
```bash
curl "http://localhost:3000/analytics/full?account_id=act_XXX&credential_group=system&date_preset=last_30d" \
  -H "Authorization: Bearer $TOKEN"
```
| # | Test | Expected Result | Pass? |
|---|------|-----------------|-------|
| 49 | Campaign breakdown | Array of campaigns with spend, roas, cpa, ctr, trend arrows | |
| 50 | Audience breakdown | Age/gender segments with metrics | |
| 51 | Trends present | Each campaign has trend direction (up/down/flat) | |
| 52 | Multiple campaigns | If account has 10+ campaigns, all appear | |

---

## Section 6: Brain (Multi-Brand Patterns)

### 6.1 Brain Patterns
```bash
curl "http://localhost:3000/brain/patterns?credential_group=system&date_preset=last_30d" \
  -H "Authorization: Bearer $TOKEN"
```
| # | Test | Expected Result | Pass? |
|---|------|-----------------|-------|
| 53 | Multi-brand data | Returns data grouped by brand/account | |
| 54 | Pattern detection | Identifies high ROAS campaigns, optimization opportunities | |
| 55 | Campaign-level detail | Each pattern references specific campaign names | |
| 56 | Handles many accounts | Doesn't timeout with 10+ accounts (should take <30s) | |

---

## Section 7: Director Lab (Briefs + Publishing)

### 7.1 Generate Brief
```bash
curl -X POST http://localhost:3000/director/generate-brief \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "account_id": "act_XXX",
    "credential_group": "system",
    "format": "Video",
    "tones": ["Urgent", "Aspirational"],
    "target_audience": "Women 25-35",
    "product_focus": "Skincare serum"
  }'
```
| # | Test | Expected Result | Pass? |
|---|------|-----------------|-------|
| 57 | Brief generated | Returns brief with hookScript, scenes, visualDna, audioDna | |
| 58 | Data-backed hooks | Hook patterns reference actual top performers from account | |
| 59 | Variations returned | 3-4 variation briefs included | |
| 60 | Without account_id | Still works (generic brief, no data backing) | |

### 7.2 Auto-Publish to Meta (WRITE -- USE TEST ACCOUNT ONLY)
```bash
curl -X POST http://localhost:3000/director/auto-publish \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "account_id": "act_XXX",
    "credential_group": "system",
    "page_id": "XXXXX",
    "headline": "Test Ad",
    "primary_text": "Test primary text",
    "link": "https://example.com",
    "image_url": "https://picsum.photos/1200/628",
    "daily_budget": "100",
    "campaign_name": "TEST_DO_NOT_SCALE"
  }'
```
| # | Test | Expected Result | Pass? |
|---|------|-----------------|-------|
| 61 | Campaign created | Returns campaign_id | |
| 62 | Ad set created | Returns adset_id | |
| 63 | Creative created | Returns creative_id | |
| 64 | Ad created | Returns ad_id with PAUSED status | |
| 65 | Visible in Meta | Ad appears in Meta Ads Manager (paused) | |
| 66 | Missing fields | Returns validation error, not Meta API error | |

**IMPORTANT: After test, pause/delete the test campaign in Meta Ads Manager!**

### 7.3 Update Campaign Status (WRITE)
```bash
curl -X POST http://localhost:3000/director/update-status \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"campaign_id": "XXXXX", "credential_group": "system", "status": "PAUSED"}'
```
| # | Test | Expected Result | Pass? |
|---|------|-----------------|-------|
| 67 | Pause works | Campaign status changes to PAUSED in Meta | |
| 68 | Activate works | Campaign status changes to ACTIVE | |
| 69 | Invalid campaign_id | Error returned, no crash | |

---

## Section 8: UGC Studio (Data-Backed Scripts)

### 8.1 Onboard Project with Meta Data
```bash
curl -X POST http://localhost:3000/ugc-onboarding \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test UGC Project",
    "brand_name": "TestBrand",
    "brief": {
      "product_description": "Premium skincare serum",
      "target_audience": "Women 25-35"
    },
    "account_id": "act_XXX",
    "credential_group": "system",
    "currency": "INR",
    "num_concepts": 4
  }'
```
| # | Test | Expected Result | Pass? |
|---|------|-----------------|-------|
| 70 | Concepts reference top ads | Generated concepts mention actual top performers by name | |
| 71 | ROAS/CPA data used | Concept descriptions reference real metrics | |
| 72 | Without account_id | Falls back to generic concepts (still works) | |

---

## Section 9: Reports

### 9.1 Generate Report
```bash
curl "http://localhost:3000/reports/generate?account_id=act_XXX&credential_group=system&date_preset=last_7d" \
  -H "Authorization: Bearer $TOKEN"
```
| # | Test | Expected Result | Pass? |
|---|------|-----------------|-------|
| 73 | Report generated | Returns report with KPIs, campaign breakdown, top ads, audience data | |
| 74 | AI narrative | Includes AI-generated narrative (not just raw numbers) | |
| 75 | Currency correct | All monetary values in correct currency | |

---

## Section 10: Assets Vault

### 10.1 Assets List
```bash
curl "http://localhost:3000/assets/list?account_id=act_XXX&credential_group=system" \
  -H "Authorization: Bearer $TOKEN"
```
| # | Test | Expected Result | Pass? |
|---|------|-----------------|-------|
| 76 | All creatives listed | Returns files with thumbnail, type (image/video), campaign name | |
| 77 | Pagination | Large accounts (100+ ads) return all items | |

### 10.2 Folder Structure
```bash
curl "http://localhost:3000/assets/folders?account_id=act_XXX&credential_group=system" \
  -H "Authorization: Bearer $TOKEN"
```
| # | Test | Expected Result | Pass? |
|---|------|-----------------|-------|
| 78 | Campaign folders | Returns folder tree grouped by campaign | |
| 79 | Ad counts per folder | Each folder shows number of ads | |

---

## Section 11: Autopilot

### 11.1 Manual Trigger
```bash
curl -X POST http://localhost:3000/autopilot/run \
  -H "Authorization: Bearer $TOKEN"
```
| # | Test | Expected Result | Pass? |
|---|------|-----------------|-------|
| 80 | Alerts generated | Creates alerts in DB for connected accounts | |
| 81 | Alert types | ROAS decline, CPA spike, or scaling opportunity (depends on data) | |
| 82 | Campaign names in alerts | Each alert references specific campaign names | |

### 11.2 Read Alerts
```bash
curl "http://localhost:3000/autopilot/alerts" \
  -H "Authorization: Bearer $TOKEN"
```
| # | Test | Expected Result | Pass? |
|---|------|-----------------|-------|
| 83 | Alerts returned | Array of alerts with type, message, account info | |
| 84 | Unread count | `GET /autopilot/unread-count` returns correct number | |
| 85 | Mark read | `POST /autopilot/mark-read` with alert ID marks it as read | |

---

## Section 12: Brands

### 12.1 Brand List
```bash
curl "http://localhost:3000/brands/list" \
  -H "Authorization: Bearer $TOKEN"
```
| # | Test | Expected Result | Pass? |
|---|------|-----------------|-------|
| 86 | Brands listed | Returns brands grouped by business_name | |
| 87 | Account counts | Each brand shows number of ad accounts | |

---

## Section 13: Campaign Suggestions

### 13.1 AI Campaign Suggestion
```bash
curl "http://localhost:3000/campaigns/suggest?account_id=act_XXX&credential_group=system" \
  -H "Authorization: Bearer $TOKEN"
```
| # | Test | Expected Result | Pass? |
|---|------|-----------------|-------|
| 88 | Suggestion returned | Budget, objective, targeting recommendation | |
| 89 | Data-backed | References actual ROAS trends and campaign performance | |
| 90 | Confidence caveats | Low-data accounts get appropriate caveats | |

---

## Section 14: Error Handling & Edge Cases

| # | Test | Steps | Expected Result | Pass? |
|---|------|-------|-----------------|-------|
| 91 | Expired Meta token | Disconnect & don't reconnect, hit any endpoint | Clear error message (not raw Meta error) | |
| 92 | Invalid account_id | Use `act_000000` | Error message, no server crash | |
| 93 | Rate limiting | Rapidly call 50+ requests | 429 status returned, app recovers | |
| 94 | No ad data | Use account with zero ads | Empty results, no crash | |
| 95 | Network timeout | Kill internet mid-request | Timeout error after ~30s, clear message | |
| 96 | Concurrent requests | Open 3 browser tabs, all loading dashboard | All load correctly (no race conditions) | |
| 97 | Account with no spend | Use account that never ran ads | Shows $0 everywhere, no division-by-zero | |
| 98 | Very old data | Use `last_365d` preset (if supported) | Returns data or clear "not supported" message | |

---

## Section 15: Frontend Integration Tests

| # | Test | Steps | Expected Result | Pass? |
|---|------|-------|-----------------|-------|
| 99 | Dashboard loads | Navigate to /app/dashboard | KPIs, chart, insights, top creatives all render | |
| 100 | Account switcher | Click account dropdown, select different account | All data refreshes to new account | |
| 101 | Creative Cockpit | Navigate to /app/creative-cockpit | Grid of creatives with DNA badges | |
| 102 | Click creative | Click any creative card | Detail page with metrics, analysis, DNA | |
| 103 | Director Lab | Navigate to /app/director-lab | Top performers load, brief generation works | |
| 104 | UGC Studio | Create new project with account connected | Concepts reference real ad data | |
| 105 | Analytics page | Navigate to /app/analytics | Campaign + audience breakdowns render | |
| 106 | Brain page | Navigate to /app/brain | Multi-brand patterns detected | |
| 107 | Reports | Generate a report | Report renders with correct data | |
| 108 | Assets Vault | Navigate to /app/assets | Creative files with campaign folders | |
| 109 | Settings > Meta | Navigate to /app/settings | Shows connected status, account count | |
| 110 | Autopilot | Navigate to /app/autopilot | Alerts listed with badge count | |

---

## Summary Scorecard

| Section | Total Tests | Passed | Failed | Blocked |
|---------|------------|--------|--------|---------|
| 1. OAuth & Tokens | 8 | | | |
| 2. Ad Accounts | 16 | | | |
| 3. Dashboard | 10 | | | |
| 4. Creatives | 12 | | | |
| 5. Analytics | 4 | | | |
| 6. Brain | 4 | | | |
| 7. Director Lab | 13 | | | |
| 8. UGC Studio | 3 | | | |
| 9. Reports | 3 | | | |
| 10. Assets Vault | 4 | | | |
| 11. Autopilot | 6 | | | |
| 12. Brands | 2 | | | |
| 13. Campaign Suggest | 3 | | | |
| 14. Error Handling | 8 | | | |
| 15. Frontend Integration | 12 | | | |
| **TOTAL** | **110** | | | |

---

## Notes for Tester

1. **NEVER test write operations (Section 7.2, 7.3) on a live production ad account.** Use a test/sandbox account.
2. Replace `act_XXX` with your actual ad account ID (format: `act_1234567890`).
3. Replace `XXXXX` with actual ad IDs, video IDs, or campaign IDs from your account.
4. `credential_group` is always `"system"` unless testing multi-credential setups.
5. If a test fails, note the **exact error message** and **HTTP status code** in the Pass column.
6. For rate limiting tests (test 93), space them out -- Meta's rate limits are per-account, hitting them could affect real campaigns.
7. The JWT token expires in 7 days. If tests span multiple days, re-login.
