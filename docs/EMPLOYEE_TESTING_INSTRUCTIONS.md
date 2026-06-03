# Cosmisk -- Employee Meta API Testing Instructions

## Your Goal

Our Meta app is in "Development Mode" (failed review). You've been added as a **tester/developer** on our Meta app, so you can still connect your ad account and use the app. You need to **use the app daily for 15 days** so Meta sees real API activity before we resubmit for review.

---

## Step 1: Confirm You Have Access on Meta

1. Go to https://developers.facebook.com
2. Log in with your Facebook account
3. You should see the app **"Cosmisk"** (App ID: 675224542133938) under "My Apps"
4. If you DON'T see it, tell Vishat -- he needs to add you properly

### Check your role:
- Go to https://developers.facebook.com/apps/675224542133938/roles/roles/
- You should be listed as **Tester** or **Developer**
- If it says "pending", click Accept

---

## Step 2: Make Sure You Have an Ad Account

You need a Meta ad account with some real data. Check:

1. Go to https://business.facebook.com/settings/ad-accounts
2. You should see at least 1 ad account
3. Ideally it should have some recent campaigns (even paused ones with historical data)
4. If you don't have an ad account, create one at https://business.facebook.com

---

## Step 3: Sign Up on Cosmisk

1. Go to https://cosmisk.com (or whatever the production URL is -- ask Vishat)
2. Click **Sign Up**
3. Create an account with your email and a password
4. Complete the onboarding steps (brand name, website, etc.)

---

## Step 4: Connect Your Meta Account

This is the critical step. Since you're a tester on our Meta app, you can connect even though the app is in development mode.

1. After logging in, click **Settings** in the bottom of the left sidebar
2. Find the **"Connect Meta"** section
3. Click **"Connect Meta Account"**
4. A Facebook login popup will open
5. Log in with the **same Facebook account** that was added as tester on the Meta app
6. Grant ALL permissions when asked:
   - "Read your ads data" -- YES
   - "Manage your ads" -- YES
   - "Access your business accounts" -- YES
   - "Read your page engagement" -- YES
7. After granting permissions, the popup will redirect and close
8. Back on Cosmisk, you should see **"Connected"** with your name and number of ad accounts

### If connection fails:
- Make sure you're logging into the correct Facebook account (the one added as tester)
- Make sure you accepted the tester invite on developers.facebook.com
- Clear browser cookies and try again
- Check if popup was blocked by browser -- allow popups for this site

---

## Step 5: Select Your Ad Account

1. In the top-left area of the sidebar, you'll see an **account dropdown**
2. Click it and select your ad account
3. The dashboard should load with your real ad data (spend, ROAS, etc.)
4. If numbers show as 0 and you have active campaigns, something is wrong -- report it

---

## Step 6: Daily Usage Routine (Do This Every Day for 15 Days)

Each day, spend 10-15 minutes going through these features. This generates real Meta API calls.

### Every Day (Required):

| # | What to Do | Where | Time |
|---|-----------|-------|------|
| 1 | Open Dashboard, wait for everything to load | /app/dashboard | 1 min |
| 2 | Switch to a different ad account (if you have multiple), then switch back | Account dropdown | 1 min |
| 3 | Go to Analytics, wait for campaign + audience data to load | /app/analytics | 1 min |
| 4 | Go to Creative Cockpit, browse your ads, click on 2-3 of them | /app/creative-cockpit | 2 min |
| 5 | Go to Autopilot, click "Run Scan" if available | /app/autopilot | 1 min |
| 6 | Go to Brain, wait for patterns to load | /app/brain | 1 min |

### Rotate These (Do 2-3 different ones each day):

| # | What to Do | Where | Days |
|---|-----------|-------|------|
| 7 | Generate a Director Lab brief (select a creative, set format/tones, click Generate) | /app/director-lab | Days 1,4,7,10,13 |
| 8 | Create a UGC Studio project (fill in brand details, generate) | /app/ugc-studio | Days 2,5,8,11,14 |
| 9 | Generate a Report | /app/reports | Days 3,6,9,12,15 |
| 10 | Browse Assets Vault and Folders | /app/assets | Days 1,3,5,7,9,11,13,15 |
| 11 | View a video ad's playback (click play on a video creative) | Creative detail page | Days 2,4,6,8,10,12,14 |

### Publish Test Ads (3 times over 15 days):

Do this on **Day 1, Day 8, and Day 15**:

1. Go to Director Lab
2. Generate a brief
3. Approve a variation
4. Click "Publish to Meta"
5. Fill in your ad account, Facebook Page, budget (lowest possible like Rs 100)
6. Click Publish
7. Verify the campaign appeared in Meta Ads Manager (it will be paused)
8. **DELETE the test campaign in Meta Ads Manager immediately after** -- don't leave it running

This generates `ads_management` and `pages_read_engagement` API calls, which Meta needs to see.

---

## Daily Log (Fill This In)

Send this to Vishat at the end of each day (screenshot or message):

**Day ___  |  Date: ___________**
- [ ] Opened Dashboard (KPIs loaded)
- [ ] Switched accounts
- [ ] Checked Analytics
- [ ] Browsed Creatives (clicked ___ ads)
- [ ] Ran Autopilot scan
- [ ] Checked Brain patterns
- [ ] Extra: _________________ (Director brief / UGC project / Report / Assets / Publish)
- [ ] Any errors? _______________

---

## Troubleshooting

### "Meta not connected" error
- Go to Settings and reconnect
- Make sure you're using the Facebook account that's listed as a tester

### Dashboard shows all zeros
- Check that you selected the correct ad account
- Check that the account has recent data (last 30 days)
- Try changing the date range dropdown

### Popup blocked
- Browser blocked the Meta login popup
- Click the "popup blocked" icon in the address bar and allow it
- Try again

### "Session expired" or 401 errors
- Log out and log back in
- Your JWT token expires after 7 days

### Any other error
- Take a screenshot
- Note which page you were on and what you clicked
- Send to Vishat

---

## Rules

1. **Don't skip days.** Meta needs to see consistent daily usage over 15 days.
2. **Use the real app.** Don't make API calls from Postman or curl -- Meta tracks which app ID makes the calls.
3. **Space out your actions.** Don't rush through everything in 2 minutes. Take 10-15 minutes.
4. **Use real ad data.** The more real campaigns/ads in your account, the better.
5. **Delete test campaigns** after publish tests. Don't accumulate junk campaigns.
6. **Report errors immediately.** If something doesn't work, we need to fix it before resubmission.
