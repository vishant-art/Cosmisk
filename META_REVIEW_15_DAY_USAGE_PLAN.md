# 15-Day Daily Usage Plan -- Meta App Review

## Why This Exists

Meta rejected our app because they didn't see real API calls. Before resubmitting, we need to show **15 days of consistent, real API usage** across all 4 permissions we request:
- `ads_read` -- Reading ad data
- `ads_management` -- Creating/managing campaigns
- `business_management` -- Accessing business ad accounts
- `pages_read_engagement` -- Reading page data for ad publishing

Meta can see every API call our app makes on their side. They want proof that this is a real app with real usage, not a one-time demo.

---

## Setup (Day 0 -- Before You Start)

1. Open the app at [APP_URL]
2. Log in with your account
3. Connect your Meta ad account (Settings > Connect Meta)
4. Make sure you have:
   - At least 1 active ad account with running campaigns
   - A Facebook Page connected to the ad account
   - At least a few ads that have been running (even small budget)

---

## Daily Routine (10-15 minutes per day)

Do ALL of these every single day for 15 days. Each action generates real API calls that Meta will see.

### Morning (Every Day)

#### 1. Open Dashboard (ads_read + business_management)
- Log in to the app
- Go to Dashboard
- Wait for KPIs to load fully (spend, ROAS, CPA, etc.)
- Look at the chart -- hover over data points
- Read the AI insights section
- Check the top creatives section

**API calls generated:** ~4-5 calls (account insights, daily data, campaign data, top ads)

#### 2. Switch Between Accounts (business_management)
- Click the account switcher dropdown
- Switch to a different ad account (if you have multiple)
- Wait for dashboard to reload with new account data
- Switch back to the original account

**API calls generated:** ~5 calls per switch (account list + KPIs reload)

#### 3. Check Analytics (ads_read)
- Go to Analytics page
- Wait for campaign breakdown to load
- Wait for audience breakdown to load
- Look at the trend arrows

**API calls generated:** ~3 calls (campaign insights, audience insights, trends)

#### 4. Check Autopilot (ads_read)
- Go to Autopilot page
- If there's a "Run Scan" button, click it
- Read any alerts that appear

**API calls generated:** ~5 calls per account (today's data, 7d data, daily trends, campaign data, campaign trends)

---

### Midday Tasks (Pick 2-3 different ones each day)

#### 5. Browse Creatives (ads_read)
- Go to Creative Cockpit
- Scroll through the creative grid
- Click on 2-3 different ads to view their detail pages
- For each ad, wait for the full analysis to load

**API calls generated:** ~2 calls per ad detail view

#### 6. Analyze a Creative (ads_read)
- On a creative detail page, click "Analyze" (if available)
- Wait for the analysis to complete
- Read the strengths, weaknesses, and recommendations

**API calls generated:** ~2 calls (ad insights + account benchmarks)

#### 7. Check Recommendations (ads_read)
- Go to Creatives > Recommendations
- Wait for scale/pause/iterate suggestions to load

**API calls generated:** ~1-2 calls

#### 8. Generate a Director Brief (ads_read + pages_read_engagement)
- Go to Director Lab
- Select a base creative from the dropdown (this fetches top ads)
- Choose format, tones, and audience
- Click "Generate Brief"
- Review the brief (hooks, scenes, variations)

**API calls generated:** ~3-4 calls (top ads, base creative detail, account currency, page data)

#### 9. View Brain Patterns (ads_read + business_management)
- Go to Brain page
- Wait for cross-brand pattern analysis to load
- Review patterns for each brand

**API calls generated:** ~3-5 calls per brand (account list, insights per account, campaign insights)

#### 10. Generate a Report (ads_read)
- Go to Reports
- Click "Generate Report"
- Select your ad account and date range
- Wait for the full report to generate

**API calls generated:** ~5 calls (KPIs, campaign breakdown, top ads, audience, currency)

#### 11. Browse Assets (ads_read)
- Go to Assets Vault
- Wait for the creative files to load
- Click on Folders view
- Browse campaign folders

**API calls generated:** ~2-3 calls (ads list, campaigns list, ads with campaign grouping)

#### 12. View Video Ads (ads_read)
- In Creative Cockpit, find a video ad
- Click to view it -- the video player loads the source URL

**API calls generated:** ~1-3 calls (video source with fallbacks)

---

### Weekly Tasks (Do these on the days marked)

#### Day 1, 5, 10: Publish a Test Ad (ads_management + pages_read_engagement)
- Go to Director Lab
- Generate a brief
- Approve a variation
- Click "Publish to Meta"
- Fill in: your test ad account, your Facebook Page, low budget (Rs 100)
- Publish -- a paused campaign will be created
- Go to Meta Ads Manager and verify it appeared
- Delete or archive the test campaign in Meta Ads Manager after confirming

**API calls generated:** ~4 write calls (create campaign, ad set, creative, ad)

#### Day 2, 7, 12: Pause/Activate a Campaign (ads_management)
- If you have a test campaign from step above, toggle its status:
  - Pause it from the app
  - Then activate it
  - Then pause it again
- Or use the Director Lab "Update Status" feature on any campaign

**API calls generated:** ~1-2 write calls per toggle

#### Day 3, 8, 13: Create a UGC Project (ads_read)
- Go to UGC Studio
- Click "New Project"
- Fill in brand name, product description, target audience
- Make sure an ad account is selected (so it fetches real data)
- Generate -- concepts will reference your actual top ads

**API calls generated:** ~2-3 calls (top ads fetch, metrics)

#### Day 4, 9, 14: Run Campaign Suggestions (ads_read)
- Go to Campaign Builder
- Click "Get AI Suggestion"
- Wait for the recommendation to load

**API calls generated:** ~2-3 calls (campaign insights, daily trends)

---

## Daily Log

Fill this in every day and send a screenshot/update:

| Day | Date | Done? | Dashboard | Analytics | Autopilot | Creatives | Director | Brain | Report | Publish | Notes |
|-----|------|-------|-----------|-----------|-----------|-----------|----------|-------|--------|---------|-------|
| 1 | _____ | | Y/N | Y/N | Y/N | Y/N | Y/N | Y/N | Y/N | Y/N | |
| 2 | _____ | | Y/N | Y/N | Y/N | Y/N | Y/N | Y/N | Y/N | Y/N | |
| 3 | _____ | | Y/N | Y/N | Y/N | Y/N | Y/N | Y/N | Y/N | Y/N | |
| 4 | _____ | | Y/N | Y/N | Y/N | Y/N | Y/N | Y/N | Y/N | Y/N | |
| 5 | _____ | | Y/N | Y/N | Y/N | Y/N | Y/N | Y/N | Y/N | Y/N | |
| 6 | _____ | | Y/N | Y/N | Y/N | Y/N | Y/N | Y/N | Y/N | Y/N | |
| 7 | _____ | | Y/N | Y/N | Y/N | Y/N | Y/N | Y/N | Y/N | Y/N | |
| 8 | _____ | | Y/N | Y/N | Y/N | Y/N | Y/N | Y/N | Y/N | Y/N | |
| 9 | _____ | | Y/N | Y/N | Y/N | Y/N | Y/N | Y/N | Y/N | Y/N | |
| 10 | _____ | | Y/N | Y/N | Y/N | Y/N | Y/N | Y/N | Y/N | Y/N | |
| 11 | _____ | | Y/N | Y/N | Y/N | Y/N | Y/N | Y/N | Y/N | Y/N | |
| 12 | _____ | | Y/N | Y/N | Y/N | Y/N | Y/N | Y/N | Y/N | Y/N | |
| 13 | _____ | | Y/N | Y/N | Y/N | Y/N | Y/N | Y/N | Y/N | Y/N | |
| 14 | _____ | | Y/N | Y/N | Y/N | Y/N | Y/N | Y/N | Y/N | Y/N | |
| 15 | _____ | | Y/N | Y/N | Y/N | Y/N | Y/N | Y/N | Y/N | Y/N | |

---

## API Call Estimate Per Day

If you follow the full routine:

| Permission | API Calls/Day | 15-Day Total |
|-----------|---------------|-------------|
| `ads_read` | ~25-40 calls | ~375-600 |
| `ads_management` | ~2-4 calls (on publish days) | ~20-30 |
| `business_management` | ~5-10 calls | ~75-150 |
| `pages_read_engagement` | ~1-2 calls (on publish/brief days) | ~15-30 |
| **Total** | **~35-55/day** | **~500-800** |

This should be enough activity for Meta to see real, consistent usage across all permissions.

---

## Important Rules

1. **Do this EVERY DAY for 15 days straight.** No skipping days. Meta looks for consistent usage.
2. **Use the actual app UI**, not curl commands. The API calls need to come from the real app.
3. **Use real ad accounts with real data.** Don't use dummy accounts with no ads.
4. **Don't spam.** Space out your actions naturally over 10-15 minutes. Don't click everything in 30 seconds.
5. **Delete test campaigns** after publishing. Don't leave 15 test campaigns running.
6. **If the app errors, note it.** Screenshot the error and report it -- we need to fix before resubmission.
7. **Use multiple ad accounts** if available. This shows business_management usage.
8. **Don't do this from localhost.** Use the production/staging URL so Meta sees the correct App ID.

---

## After 15 Days

Once 15 days of usage are complete:
1. Go to https://developers.facebook.com/apps/675224542133938/
2. Check the API Explorer / App Dashboard for usage graphs
3. Confirm all 4 permissions show activity
4. Submit for review with screencasts and test instructions
5. Provide test credentials the reviewer can use
