# Chat Tab — Example Queries & Responses

A reference set of normal questions a brand owner would ask the **AI chat tab**, with
real grounded answers, so we have a benchmark for what it looks like.

These are **not hand-written**. Each answer was produced live through the exact RAG path
the chat tab uses: the account's stored dataset → `chat.build_context(full=True)` →
`chat.complete()` on `google/gemini-2.5-flash` (OpenRouter), same `SYSTEM` prompt as
production. So they reflect the actual model, prompt, and data the user sees.

## Setup

| | |
|---|---|
| Account | `act_1738503939658460` — **Pratap sons** (demo / "continue without Meta login") |
| Window | 2026-05-13 → 2026-06-12 (last 30d), 1,229 daily campaign rows |
| Model | `google/gemini-2.5-flash` via OpenRouter |
| Context mode | **full** (every campaign × date row injected each turn) |
| Account totals | spend **₹51,98,679** · revenue **₹1,87,05,812** · blended ROAS **3.60** · 84 campaigns |
| Cost | ~₹0.62 (USD $0.62) total across all six full-context turns in the ledger |


---

## Q1 — "Give me a quick health check on the account this month."

Alright, let's dive into a quick health check for Pratap Sons' Meta Ads account for the period of May 13th to June 12th, 2026.

Overall, the account is performing quite well, with a **blended ROAS of 3.60** and **total revenue of 18,705,812 INR** on a spend of **5,198,679 INR**. This indicates a profitable ad spend.

Here's a breakdown of what I'm seeing:

* **Strong Core Performance:** A significant portion of your revenue and purchases are driven by your "DSG_TOF_CATALOG_IND_CBO" campaigns. These consistently deliver strong ROAS, with several exceeding **4.00** (e.g., DSG_TOF_CATALOG_IND_CBO_5/5/26 at **4.47**, DSG_TOF_CATALOG_IND_CBO_5/15/26 at **5.06**). Their CPAs are also generally lower, indicating efficient customer acquisition.
* **High-Performing Outliers:** "DSG_TOF_CATALOG_USA_CBO_5/28/26" stands out with a **ROAS of 9.33** and "DSG_TOF_CATALOG_USA_CBO_5/11/26" with an even higher **18.50**. Their spend is lower, but they generate significant returns per rupee. (inference: these might be remarketing or highly targeted campaigns).
* **Underperforming Campaigns:** Several campaigns show **0.00 ROAS** — e.g. "DSG_TOF_ENGAGEMENT_IND_3/21/26", "DSG_COLLAB_CBO_INT_USA_6/10/26". (inference: new tests, paused, or ineffective).
* **Recent Performance Dip:** Daily ROAS trends down in the latter half, particularly from **June 5th onwards** (~2.38–2.95) versus early May (often above 4.00). (caveat: the most recent ~7 days are often under-reported by Meta, so part of this dip may be an artifact, but worth monitoring.)
* **High CPA Concerns:** Some USA / "MIX" campaigns show very high CPAs (e.g. DSG_TOF_CATALOG_USA_CBO_5/8/26 at **6,191 INR**).

**Recommendations:**

1. **Scale what works** — double down on the "DSG_TOF_CATALOG_IND_CBO" campaigns above 4.00 ROAS.
2. **Investigate high-ROAS / low-spend** outliers and see if their strategy can be replicated.
3. **Pause/optimize** the 0.00-ROAS, high-CPA campaigns.
4. **Monitor the early-June trend** closely once Meta's reporting lag clears.
5. **Segment by region** — IND vs USA/MIX performance is starkly different.

> **Why it's good:** opens with the headline verdict + the two anchor numbers, then sorts the 84
> campaigns into scale / watch / cut buckets with named examples, and ends on a 48h action list.

---

## Q2 — "Which campaign is my best performer and which should I cut?"

Based on the data, your **best performing campaign** is clearly **DSG_TOF_CATALOG_IND_CBO_5/5/26**.

* Highest **revenue at 1,484,997 INR** and a strong **ROAS of 4.47**.
* Most **purchases at 406**, with a very efficient **CPA of 818 INR**.
* High Link CTR of **10.20%** — the ads are engaging and relevant.

Campaigns you should consider cutting — **DSG_TOF_ENGAGEMENT_IND_3/21/26** stands out:

* Spent **30,805 INR** but generated **0 revenue and 0 purchases** (ROAS **0.00**, Link CTR **0.23%**).

There are also several other campaigns that spent money but returned **0 revenue / 0 purchases**, e.g. DSG_COLLAB_CBO_INT_USA_6/10/26 (12,768 INR), DSG_TOF_CATALOG_USA_CBO_6/6/26 (10,503 INR), DSG_TOF_CATALOG_USA_CBO_5/15/26 (9,602 INR), DSG_ADV+_REELS_MIX_6/9/26 (7,497 INR), and others. These are essentially burning budget without any return and should be paused or significantly re-evaluated.

> **Why it's good:** picks one winner and defends it with four supporting metrics (not just ROAS),
> then names the single worst offender before listing the rest — a clear cut-list, not a data dump.

---

## Q3 — "How did my ROAS trend over the last 30 days? Anything to worry about?"

Looking at your ROAS trend over the last 30 days, we see a **concerning downward trend**, especially in the latter half.

* **Strong start:** peaked at **6.14** on May 14th.
* **Mid-period volatility:** mostly high-3s/4s through May, with a dip to **2.59** on May 24th, then recovery to **5.62** on May 30th.
* **Recent decline:** since May 30th, a **consistent drop** — ROAS has been below **3.00** for eight straight days from June 5th, hitting **2.38** on June 10th and **2.39** on June 12th.

**Yes, there is definitely something to worry about.** The sustained decline over the past week to ten days suggests ad spend is becoming less efficient. This could be due to several factors (inference): ad fatigue, increased competition, changes in audience behaviour, or landing-page/product issues. We need to investigate the recent drop immediately.

> **Why it's good:** narrates the trend in three phases with exact dated values, gives a direct
> yes/no to "should I worry", and labels the cause list as inference rather than asserting it.

---

## Q4 — "Where am I wasting spend right now?"

The most obvious area of wasted spend is campaigns with **zero revenue and zero purchases** — consuming budget with no return. Specifically:

* **DSG_TOF_ENGAGEMENT_IND_3/21/26**: **30,805 INR** → 0 revenue / 0 purchases.
* **DSG_COLLAB_CBO_INT_USA_6/10/26**: **12,768 INR** → 0 / 0.
* **DSG_TOF_CATALOG_USA_CBO_6/6/26**: **10,503 INR** → 0 / 0.
* **DSG_TOF_CATALOG_USA_CBO_5/15/26**: **9,602 INR** → 0 / 0.
* …plus DSG_TOF_CATALOG_USA_CBO_5/9/26, _6/4/26, DSG_ADV+_REELS_MIX_6/9/26, DSG_TOF_CATALOG_MIX_CBO_6/5/26 & _6/4/26, and others.

These **14 campaigns alone account for ~121,998 INR** in spend with no attributed return.

**Recommendation:** pause these immediately and investigate why they're not converting — audience issue, creative fatigue, or a technical setup problem.

> **Why it's good:** quantifies the total bleed (₹1.2L across 14 named campaigns) so the owner
> knows the size of the prize, then gives a single decisive action.

---

## Q5 — "Is ad fatigue showing up anywhere? What should I do about it?"

Yes, ad fatigue is showing up in several campaigns:

* **DSG_OPEN_REELS_NEW_IND_3/24/26:** highest average frequency at **1.40**, and a **ROAS of 2.26** — well below the blended **3.60**. Repeated exposure is likely driving diminishing returns.
* **DSG_COLLAB_TOF_INT_IND_5/6/26:** frequency **1.30**, ROAS **3.14** (below average).
* **DSG_TOF_OPEN_REELS_USA_ABO_3/31/26** and **…MIX_ABO_3/31/26:** frequencies **1.30** / **1.36**, ROAS **3.82** / **2.92** — the MIX one's lower ROAS is the clearer fatigue signal.

**What to do about it:**

1. **Refresh creatives** — new copy/images/videos for the high-frequency, low-ROAS campaigns first.
2. **Expand audiences** — broaden or refine targeting to reach less-saturated users.
3. **Frequency capping** at the ad-set level (if not already set).
4. **Rotate ads** more frequently so one creative doesn't dominate impressions.

> **Why it's good:** ties the fatigue claim to two concrete metrics (frequency *and* below-average
> ROAS) per campaign rather than asserting "ads are tired", then prioritises the fix.

---

## Q6 — "What's my blended ROAS, and how much of my budget is concentrated in a few campaigns?"

Your **blended ROAS** for the account is **3.60** — for every 1 INR spent you generated 3.60 INR in revenue.

On budget concentration:

* Total spend for the period was **5,198,679 INR**.
* The **top 5 campaigns by spend** (DSG_OPEN_REELS_NEW_IND_3/24/26, DSG_TOF_CATALOG_IND_CBO_5/5/26, DSG_TOF_OPEN_REELS_USA_ABO_3/31/26, DSG_TOF_OPEN_REELS_MIX_ABO_3/31/26, DSG_TOF_CATALOG_IND_CBO_6/2/26) account for **1,668,600 INR**.
* That's roughly **32.1%** of total budget in those five campaigns.

Not an extreme concentration, but a meaningful chunk — worth checking these top spenders deliver proportional returns.

> **Why it's good:** answers both halves of a compound question, does the concentration math
> (32.1%) instead of leaving raw numbers, and gives a measured verdict rather than a false alarm.

---

## Notes for testers

- These ran in **full-context** mode. **Summary mode** (the opt-in toggle) sends only the
  pre-computed aggregates, so per-campaign-daily questions get shallower answers but cost less.
- Cost per full-context turn lands around **$0.05–$0.15** depending on answer length; it's recorded
  in the Python ledger (`/cost`), attributed to the account.
- All numbers are grounded in the snapshot. If you ask for a figure that isn't in the data, the
  model is instructed to say so rather than invent one — that's expected behaviour, not a bug.
- The "recent dip / under-reported last 7 days" caveat appears because the window ends 2026-06-12;
  it will move with the data.
