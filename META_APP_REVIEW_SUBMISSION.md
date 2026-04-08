# Meta App Review -- Submission Guide for Cosmisk

Send this to your employee. They need to record screencasts and prepare materials for each permission below.

---

## What is Meta App Review?

Meta requires apps to prove they actually use each permission they request. For each permission, you need:
1. A **screencast** (screen recording) showing the feature in action
2. A **step-by-step test guide** for the Meta reviewer
3. A **justification** explaining why you need it

Our app requests **4 permissions**. Below are exact instructions for each.

---

## Permission 1: `ads_read`

**What it does:** Lets us read ad performance data (spend, ROAS, CTR, etc.)

**Why we need it:** Cosmisk is an ad analytics platform. We show dashboards, campaign breakdowns, creative analysis, AI insights, and reports -- all powered by reading ad data from Meta.

### Features that use this permission:

| Feature | What it reads |
|---------|--------------|
| Dashboard KPIs | Account-level spend, ROAS, CPA, CTR, conversions |
| Dashboard Chart | Daily performance trends |
| Dashboard Insights | Campaign-level data for AI analysis |
| Creative Cockpit | All ads with thumbnails and metrics |
| Creative Detail | Individual ad performance + benchmarks |
| Creative Analysis | Ad metrics vs account averages |
| Analytics | Campaign breakdown + audience demographics |
| Brain Patterns | Cross-account pattern detection |
| Reports | Full account report with AI narrative |
| Autopilot | Daily alerts (ROAS decline, CPA spike, scaling opportunities) |
| Director Lab | Top performers data to generate briefs |
| UGC Studio | Top ads data to generate scripts |
| Assets Vault | Creative library with campaign folders |

### Screencast Script (Record This):

**Length:** 3-5 minutes

1. Open the app and log in
2. Show the **Dashboard** -- point out:
   - KPI cards (spend, ROAS, CPA, etc.)
   - Performance chart (daily trends)
   - Top creatives section
   - AI insights section
3. Switch to a different **ad account** using the dropdown -- show data updates
4. Go to **Analytics** page -- show:
   - Campaign breakdown table with metrics
   - Audience demographics breakdown
5. Go to **Creative Cockpit** -- show:
   - Grid of ads with thumbnails and metrics
   - Click one ad to show the detail page with full analysis
6. Go to **Autopilot** -- show alerts referencing specific campaigns
7. Go to **Reports** -- generate a report showing it pulls real data

**Narration example:**
> "This is Cosmisk, an ad analytics platform. We use ads_read to show our users their ad performance in real-time. Here on the dashboard, you can see KPI cards showing spend, ROAS, and other metrics pulled from the Meta Ads API. When I switch accounts, the data refreshes. On the Analytics page, we break down performance by campaign and audience demographics. The Creative Cockpit shows all ads with their performance metrics and AI-powered DNA analysis."

### Test Instructions for Meta Reviewer:

```
1. Go to [YOUR_APP_URL]
2. Create an account or use test credentials: [EMAIL] / [PASSWORD]
3. Connect a Meta ad account (Settings > Connect Meta)
4. Navigate to Dashboard -- you will see KPI cards with real ad data
5. Navigate to Analytics -- you will see campaign and audience breakdowns
6. Navigate to Creative Cockpit -- you will see all ads from your account with performance metrics
7. Click any ad to see detailed analysis
8. Navigate to Reports > Generate Report -- a full performance report is generated
```

---

## Permission 2: `ads_management`

**What it does:** Lets us create and manage campaigns, ad sets, and ads on Meta.

**Why we need it:** Cosmisk lets users publish AI-generated ad creatives directly to their Meta ad account, and pause/activate campaigns from within the app.

### Features that use this permission:

| Feature | What it does |
|---------|-------------|
| Director Lab > Auto-Publish | Creates campaign + ad set + ad creative + ad on Meta |
| Director Lab > Update Status | Pauses or activates campaigns |

### API Calls Made:
- `POST /{account_id}/campaigns` -- Create campaign
- `POST /{account_id}/adsets` -- Create ad set
- `POST /{account_id}/adcreatives` -- Create ad creative
- `POST /{account_id}/ads` -- Create ad
- `POST /{campaign_id}` -- Update campaign status (ACTIVE/PAUSED)

### Screencast Script (Record This):

**Length:** 2-3 minutes

1. Open **Director Lab**
2. Select a base creative from the dropdown (shows top performers)
3. Set format, tones, target audience
4. Click **Generate Brief** -- show the AI-generated brief
5. Review the variations and approve one
6. Click **Publish to Meta**
7. Fill in the publish form (ad account, page, budget)
8. Click **Publish** -- show success message
9. Open **Meta Ads Manager** in another tab -- show the newly created campaign (it will be paused)
10. Back in Cosmisk, show the **Pause/Activate** toggle working

**Narration example:**
> "Cosmisk's Director Lab lets users generate AI-powered ad briefs based on their top performers, then publish approved creatives directly to Meta. Here I'm generating a brief, approving a variation, and publishing it. The campaign is created in paused state so the user can review before spending. I can also pause or activate campaigns from within Cosmisk."

### Test Instructions for Meta Reviewer:

```
1. Log in to the app
2. Navigate to Director Lab
3. Select any base creative, choose "Video" format
4. Click "Generate Brief" -- an AI brief is generated using your ad data
5. Approve one or more variations
6. Click "Publish to Meta"
7. Select your ad account, enter a Facebook Page ID, and set budget
8. Click Publish -- a new campaign will be created in your Meta Ads Manager (paused)
9. Verify in Meta Ads Manager that the campaign exists
```

---

## Permission 3: `business_management`

**What it does:** Lets us access ad accounts under a Business Manager.

**Why we need it:** Most advertisers manage multiple ad accounts under a Business Manager. Without this permission, we can only see personal ad accounts, not business-managed ones. Our app supports multi-brand management, and agencies use it to manage multiple client accounts.

### Features that use this permission:

| Feature | What it does |
|---------|-------------|
| Ad Account List | Fetches all accounts under user's Business Manager |
| Account Switcher | Lets users switch between accounts |
| Brain (Multi-Brand) | Analyzes patterns across all brand accounts |
| Brands List | Groups accounts by business name |

### API Call Made:
- `GET /me/adaccounts` with pagination -- returns all accounts including business-managed ones

### Screencast Script (Record This):

**Length:** 1-2 minutes

1. Show the **account switcher** dropdown -- point out multiple accounts from different businesses
2. Show the **Brands** page -- accounts grouped by business name
3. Go to **Brain** -- show pattern analysis across multiple brand accounts
4. Switch between accounts -- show that data refreshes for each

**Narration example:**
> "Cosmisk supports multi-brand management. Agencies and businesses managing multiple ad accounts need business_management to see all their accounts. Here you can see the account switcher showing accounts from different businesses. The Brain feature analyzes patterns across all brands. Without business_management, users with Business Manager accounts wouldn't see any of their ad accounts."

### Test Instructions for Meta Reviewer:

```
1. Log in with a Facebook account that has a Business Manager with multiple ad accounts
2. Go to Settings > Connect Meta
3. After connecting, click the account dropdown in the sidebar
4. You should see all your Business Manager ad accounts listed
5. Navigate to Brain -- it analyzes patterns across all your brand accounts
```

---

## Permission 4: `pages_read_engagement`

**What it does:** Lets us read Facebook Pages the user manages.

**Why we need it:** When publishing ads to Meta, we need the user's Facebook Page ID to create ad creatives. Ad creatives on Meta require a `page_id` in the `object_story_spec`. We also use it to list available pages for the publish flow.

### Features that use this permission:

| Feature | What it does |
|---------|-------------|
| Director Lab > Publish | Needs page_id to create ad creative on Meta |
| Campaign Builder | Needs page_id for campaign creation |

### Screencast Script (Record This):

**Length:** 1 minute

1. Go to **Director Lab**
2. Generate a brief and approve a variation
3. Click **Publish to Meta**
4. Show the form where user selects their Facebook Page
5. Point out that the Page is required by Meta's API to create an ad

**Narration example:**
> "When publishing ads to Meta, the API requires a Facebook Page ID in the ad creative's object_story_spec. We use pages_read_engagement to let users select which Page their ad should be associated with. Without this, we cannot create ad creatives on Meta."

### Test Instructions for Meta Reviewer:

```
1. Log in and go to Director Lab
2. Generate and approve a brief
3. Click "Publish to Meta"
4. In the publish form, notice the Facebook Page field -- this is populated using pages_read_engagement
5. The ad creative cannot be created without a valid Page ID
```

---

## Recording Tips

### Tools to record screencasts:
- **Mac:** QuickTime Player > File > New Screen Recording (free)
- **Windows:** OBS Studio (free) or Xbox Game Bar (Win+G)
- **Chrome extension:** Loom (free tier)

### Requirements from Meta:
- Video must show the **actual app in use** (not mockups)
- Must demonstrate the **specific permission** being used
- Should be **under 5 minutes** per permission
- Audio narration is helpful but not required
- Resolution: at least 720p
- Format: MP4 or MOV

### What NOT to do:
- Don't show code or API calls (Meta wants to see the user-facing product)
- Don't speed up the video
- Don't use fake/dummy data if you can avoid it
- Don't record with a phone pointing at your screen

---

## Submission Checklist

For each permission, you need to upload on the Meta App Dashboard (developers.facebook.com):

| Permission | Screencast | Test Instructions | Justification | Status |
|-----------|------------|-------------------|---------------|--------|
| `ads_read` | [ ] Recorded | [ ] Written (above) | [ ] Written (above) | |
| `ads_management` | [ ] Recorded | [ ] Written (above) | [ ] Written (above) | |
| `business_management` | [ ] Recorded | [ ] Written (above) | [ ] Written (above) | |
| `pages_read_engagement` | [ ] Recorded | [ ] Written (above) | [ ] Written (above) | |

### Also needed:
- [ ] Privacy Policy URL (must be public and mention Meta data usage)
- [ ] Terms of Service URL
- [ ] App icon (1024x1024)
- [ ] Data Deletion callback URL or instructions
- [ ] App domain verified in Meta Business Settings

### Where to submit:
1. Go to https://developers.facebook.com/apps/675224542133938/review/
2. Click "Request Permissions"
3. For each permission, fill in:
   - **Usage description** (use the "Why we need it" text above)
   - **Screencast** (upload the recording)
   - **Test instructions** (paste from above, replace [YOUR_APP_URL] with your actual URL)
   - **Test user** (provide login credentials the reviewer can use)
4. Submit for review

### Common rejection reasons to avoid:
1. **"Could not verify usage"** -- Make sure the screencast clearly shows the permission being used
2. **"App not functional"** -- App must be live and accessible, not localhost
3. **"No test user provided"** -- Always provide working test credentials
4. **"Privacy policy missing"** -- Must be accessible at the URL you provided
5. **"Feature not visible"** -- Every permission must map to a visible user-facing feature
