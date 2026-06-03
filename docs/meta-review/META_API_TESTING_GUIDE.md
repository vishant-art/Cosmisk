# Cosmisk -- Meta API Testing Guide

Hi! This guide walks you through testing every Meta API integration in Cosmisk. Follow each step in order. Mark each test as PASS / FAIL and note any errors.

---

## Setup (Do This First)

### Step 1: Get the app running
```bash
# Terminal 1 -- Start backend
cd /path/to/Cosmisk/server
npm install
npm run dev
# Should say: Server listening on port 3000

# Terminal 2 -- Start frontend
cd /path/to/Cosmisk
npm install
ng serve
# Should say: Angular Live Development Server on http://localhost:4200
```

### Step 2: Create an account & connect Meta
1. Open http://localhost:4200 in your browser
2. Sign up with your email
3. Complete the onboarding steps
4. Go to Settings (bottom of sidebar) and click "Connect Meta"
5. Log in with a Facebook account that has access to ad accounts
6. After redirect, you should see "Connected" with your name

### Step 3: Get your JWT token (for API testing)
```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "YOUR_EMAIL", "password": "YOUR_PASSWORD"}'
```
Copy the `token` value from the response. You'll use it in every test below.

### Step 4: Set up your terminal
```bash
# Paste your token here (replace the xxx)
export TOKEN="xxx"

# Find your ad account ID -- run this:
curl -s http://localhost:3000/ad-accounts/list \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

# Look for "id": "act_XXXXXXXXX" in the output
# Pick one account and save it:
export ACCOUNT="act_XXXXXXXXX"
```

You're ready. Go through each section below.

---

## Test 1: Ad Accounts

**What we're testing:** Can the app fetch your Meta ad accounts correctly?

### 1a. List all accounts
```bash
curl -s "http://localhost:3000/ad-accounts/list?limit=100" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```
Check:
- [ ] Response has `"success": true`
- [ ] `accounts` array is not empty
- [ ] Each account has: `id`, `name`, `currency`
- [ ] Count matches what you see in Meta Business Manager

### 1b. Account KPIs
```bash
curl -s "http://localhost:3000/ad-accounts/kpis?account_id=$ACCOUNT&credential_group=system&date_preset=last_7d" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```
Check:
- [ ] Returns spend, revenue, roas, cpa, ctr, impressions, clicks, conversions
- [ ] Each metric has `value` and `change` (percentage vs previous period)
- [ ] Numbers roughly match what Meta Ads Manager shows for last 7 days

### 1c. Try different date ranges
```bash
# Last 30 days
curl -s "http://localhost:3000/ad-accounts/kpis?account_id=$ACCOUNT&credential_group=system&date_preset=last_30d" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```
Check:
- [ ] Spend is higher than the 7-day number (makes sense)
- [ ] No errors

---

## Test 2: Dashboard

**What we're testing:** Does the main dashboard load real data?

### 2a. Open the dashboard in browser
1. Go to http://localhost:4200/app/dashboard
2. Make sure the correct ad account is selected in the top dropdown

Check:
- [ ] KPI cards show numbers (not zero, not loading forever)
- [ ] Chart shows daily data points
- [ ] "Top Creatives" section shows ads with thumbnails
- [ ] "Insights" section shows actionable items

### 2b. Chart data API
```bash
curl -s "http://localhost:3000/dashboard/chart?account_id=$ACCOUNT&credential_group=system&date_preset=last_7d" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```
Check:
- [ ] Returns array with 7 entries (one per day)
- [ ] Each entry has: date, roas, spend, revenue, ctr, cpa

### 2c. Insights API
```bash
curl -s "http://localhost:3000/dashboard/insights?account_id=$ACCOUNT&credential_group=system&date_preset=last_7d" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```
Check:
- [ ] Returns insights array
- [ ] Insights mention actual campaign names (not generic text like "your campaign")
- [ ] Each insight has type and priority

### 2d. Switch accounts
1. In the browser, switch to a different ad account using the dropdown
Check:
- [ ] All numbers update to the new account's data
- [ ] No errors in browser console (F12 > Console)

---

## Test 3: Creatives

**What we're testing:** Can the app list and analyze individual ads?

### 3a. List creatives
```bash
curl -s "http://localhost:3000/creatives/list?account_id=$ACCOUNT&credential_group=system&date_preset=last_30d" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```
Check:
- [ ] Returns array of ads
- [ ] Each ad has: id, name, metrics (roas, spend, ctr), thumbnail_url
- [ ] Sorted by spend (highest first)

### 3b. Get one ad's detail
Pick an ad ID from the list above, then:
```bash
export AD_ID="PASTE_AD_ID_HERE"

curl -s "http://localhost:3000/creatives/detail?ad_id=$AD_ID&account_id=$ACCOUNT&credential_group=system" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```
Check:
- [ ] Returns full detail: name, campaign name, ad set name, metrics
- [ ] Has creative fields: thumbnail, body text, title
- [ ] Metrics match what you see in Meta Ads Manager

### 3c. Analyze a creative
```bash
curl -s -X POST http://localhost:3000/creatives/analyze \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"ad_id\": \"$AD_ID\", \"account_id\": \"$ACCOUNT\", \"credential_group\": \"system\"}" | python3 -m json.tool
```
Check:
- [ ] Returns analysis with score, strengths, weaknesses
- [ ] Compares ad performance vs account averages
- [ ] If the ad has very low spend, mentions that data confidence is low

### 3d. Get recommendations
```bash
curl -s "http://localhost:3000/creatives/recommendations?account_id=$ACCOUNT&credential_group=system" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```
Check:
- [ ] Returns categorized recommendations (scale, pause, iterate)
- [ ] References actual ad names

### 3e. Test in browser
1. Go to http://localhost:4200/app/creative-cockpit
Check:
- [ ] Grid of creatives loads with thumbnails
- [ ] Clicking a creative shows detail page
- [ ] DNA badges appear (hook, visual, audio tags)

---

## Test 4: Analytics

**What we're testing:** Campaign and audience breakdowns

### 4a. Full analytics
```bash
curl -s "http://localhost:3000/analytics/full?account_id=$ACCOUNT&credential_group=system&date_preset=last_30d" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```
Check:
- [ ] Campaign breakdown: array of campaigns with spend, roas, cpa, ctr
- [ ] Each campaign has a trend direction (up/down/flat)
- [ ] Audience breakdown: age/gender segments with metrics
- [ ] Campaign names match what's in Meta Ads Manager

### 4b. Test in browser
1. Go to http://localhost:4200/app/analytics
Check:
- [ ] Campaign table renders with all campaigns
- [ ] Audience chart/table shows demographic data
- [ ] Trend arrows show correctly

---

## Test 5: Brain (Pattern Detection)

**What we're testing:** Cross-account pattern analysis

```bash
curl -s "http://localhost:3000/brain/patterns?credential_group=system&date_preset=last_30d" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```
Check:
- [ ] Returns data for multiple accounts/brands (if you have more than one)
- [ ] Pattern items identify high/low performing campaigns
- [ ] Campaign names are specific (not generic)
- [ ] Response time is under 30 seconds (even with many accounts)

Browser test:
1. Go to http://localhost:4200/app/brain
- [ ] Pattern cards render correctly

---

## Test 6: Director Lab

**What we're testing:** AI brief generation from real ad data

### 6a. Generate a brief
```bash
curl -s -X POST http://localhost:3000/director/generate-brief \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"account_id\": \"$ACCOUNT\",
    \"credential_group\": \"system\",
    \"format\": \"Video\",
    \"tones\": [\"Urgent\"],
    \"target_audience\": \"Women 25-35\",
    \"product_focus\": \"Skincare\"
  }" | python3 -m json.tool
```
Check:
- [ ] Returns brief with hook patterns, visual patterns, scenes
- [ ] Hook patterns reference your actual top performing ads
- [ ] Variations array has 3-4 options
- [ ] Not generic -- mentions real ad names and metrics

### 6b. Test in browser
1. Go to http://localhost:4200/app/director-lab
Check:
- [ ] Top performers dropdown populates with your ads
- [ ] Generating a brief shows data-backed hooks
- [ ] Brief displays with scenes, CTA, audio direction

### 6c. Publish test (ONLY ON A TEST ACCOUNT)
> WARNING: This creates a real campaign on Meta. Only do this on a test/sandbox account.

If you have a test ad account and a Facebook Page:
```bash
curl -s -X POST http://localhost:3000/director/auto-publish \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"account_id\": \"$ACCOUNT\",
    \"credential_group\": \"system\",
    \"page_id\": \"YOUR_PAGE_ID\",
    \"headline\": \"TEST - Delete Me\",
    \"primary_text\": \"This is a test ad\",
    \"link\": \"https://example.com\",
    \"image_url\": \"https://picsum.photos/1200/628\",
    \"daily_budget\": \"100\",
    \"campaign_name\": \"COSMISK_TEST_DELETE_ME\"
  }" | python3 -m json.tool
```
Check:
- [ ] Returns campaign_id, adset_id, ad_id
- [ ] Ad appears in Meta Ads Manager (should be PAUSED)
- [ ] CLEAN UP: Delete the test campaign in Meta Ads Manager after testing!

---

## Test 7: UGC Studio

**What we're testing:** Script generation using real ad performance data

### 7a. Create a UGC project
```bash
curl -s -X POST http://localhost:3000/ugc-onboarding \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"Test UGC\",
    \"brand_name\": \"TestBrand\",
    \"brief\": {
      \"product_description\": \"Premium product\",
      \"target_audience\": \"Young adults\"
    },
    \"account_id\": \"$ACCOUNT\",
    \"credential_group\": \"system\",
    \"currency\": \"INR\",
    \"num_concepts\": 3
  }" | python3 -m json.tool
```
Check:
- [ ] Returns project with concepts
- [ ] Concepts reference your top performing ads by name
- [ ] Concept descriptions mention real metrics (ROAS, spend)

### 7b. Test in browser
1. Go to http://localhost:4200/app/ugc-studio
2. Click "New Project" and fill in the form
Check:
- [ ] Project creates successfully
- [ ] Concepts appear with data-backed descriptions

---

## Test 8: Reports

```bash
curl -s "http://localhost:3000/reports/generate?account_id=$ACCOUNT&credential_group=system&date_preset=last_7d" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```
Check:
- [ ] Report includes KPIs, campaign breakdown, top ads
- [ ] AI narrative section exists (not just raw numbers)
- [ ] Currency is correct (INR/USD matches your account)

---

## Test 9: Autopilot

### 9a. Trigger a scan
```bash
curl -s -X POST http://localhost:3000/autopilot/run \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```
Check:
- [ ] Returns success
- [ ] Alerts generated (at least 1 if account has active campaigns)

### 9b. Read alerts
```bash
curl -s http://localhost:3000/autopilot/alerts \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```
Check:
- [ ] Returns array of alerts
- [ ] Alerts mention specific campaign names
- [ ] Alert types make sense (ROAS decline, CPA spike, scaling opportunity)

### 9c. Unread count
```bash
curl -s http://localhost:3000/autopilot/unread-count \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```
Check:
- [ ] Returns a number matching unread alerts

---

## Test 10: Assets Vault

```bash
curl -s "http://localhost:3000/assets/list?account_id=$ACCOUNT&credential_group=system" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```
Check:
- [ ] Returns list of creative files
- [ ] Each has thumbnail, type (image/video), campaign name

```bash
curl -s "http://localhost:3000/assets/folders?account_id=$ACCOUNT&credential_group=system" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```
Check:
- [ ] Returns folder structure grouped by campaign
- [ ] Campaign names match Meta Ads Manager

---

## Test 11: Error Handling

These tests check that the app doesn't crash on bad input.

### 11a. Invalid account ID
```bash
curl -s "http://localhost:3000/ad-accounts/kpis?account_id=act_000000&credential_group=system&date_preset=last_7d" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```
Check:
- [ ] Returns an error message (not a server crash / 500 with stack trace)

### 11b. Invalid ad ID
```bash
curl -s "http://localhost:3000/creatives/detail?ad_id=99999&account_id=$ACCOUNT&credential_group=system" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```
Check:
- [ ] Returns an error message, not a crash

### 11c. Missing auth token
```bash
curl -s "http://localhost:3000/ad-accounts/list?limit=10" | python3 -m json.tool
```
Check:
- [ ] Returns 401 Unauthorized (not a crash or data leak)

### 11d. No Meta connection
1. Disconnect Meta in Settings
2. Try any endpoint:
```bash
curl -s "http://localhost:3000/ad-accounts/kpis?account_id=$ACCOUNT&credential_group=system&date_preset=last_7d" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```
Check:
- [ ] Returns clear error like "Meta not connected" (not a raw exception)
- [ ] Re-connect Meta after this test!

---

## Test 12: Video Playback

```bash
# First get a video ad's video_id from the creatives list (look for object_type: VIDEO)
export VIDEO_ID="PASTE_VIDEO_ID_HERE"

curl -s "http://localhost:3000/ad-accounts/video-source?video_id=$VIDEO_ID&account_id=$ACCOUNT&credential_group=system" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```
Check:
- [ ] Returns a `source` URL that plays in browser
- [ ] Opening the URL in a new tab plays the video

---

## When You're Done

Fill in this summary and send it back:

```
Total tests: 65
Passed: ___
Failed: ___
Skipped: ___ (with reason)

Failed tests (list test number and error):
-
-
-

Browser/console errors noticed:
-
-

Other observations:
-
-
```

If any test gives you a server error (500), copy the full error from the terminal where the server is running -- it will have the stack trace we need to fix it.
