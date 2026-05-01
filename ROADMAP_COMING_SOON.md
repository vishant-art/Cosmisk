# Roadmap: Features Coming Soon

> **For:** Partner understanding what we're building next
> **Context:** These are promised on the website but not yet fully built

---

## The 6 Functions: Current Status

| # | Function | LP Promises | Current Status | What's Missing |
|---|----------|-------------|----------------|----------------|
| 1 | 24/7 Monitoring | "Watches continuously" | ⚠️ Manual trigger | Automated cron jobs |
| 2 | Fatigue Prediction | "48-72 hours ahead" | ✅ Built | - |
| 3 | Pattern Learning | "Learns what works" | ⚠️ Partial | Deeper pattern analysis |
| 4 | Brief Generation | "Auto-creates briefs" | ✅ Built | - |
| 5 | Auto Production | "Generates creatives" | ❌ Not built | Full Creative Engine |
| 6 | Approval Workflow | "30 min/week" | ⚠️ Basic | Polished approval UI |

---

## What We're Building Next

### 1. True 24/7 Monitoring (P1)

**What LP says:**
> "It watches your CTR, CPM, frequency continuously"

**What's built:**
- Watchdog agent exists but runs on-demand
- User has to trigger or check dashboard

**What we're adding:**
- Automated cron job running every 4-6 hours
- Real-time alerts via WhatsApp when issues detected
- No manual checking needed

**Why it matters for ads:**
> "You can literally say: The system watches while you sleep. At 3 AM, if your ad starts tanking, you get an alert before you wake up."

---

### 2. Shopify Integration (P0 - Blocked)

**What LP implies:**
> Product-level intelligence, OOS detection, wasted spend on wrong products

**What's built:**
- OOS Detector code exists
- Matching logic ready

**What's missing:**
- Shopify OAuth flow (blocked by auth security fixes)
- Live connection to client's Shopify store

**Why it matters for ads:**
> "We connect to your Shopify. We see which products are out of stock. We automatically stop wasting money on them. No other tool does this."

**Timeline:** Waiting on developer to fix auth (~1-2 weeks)

---

### 3. Auto Production / Creative Engine (P3)

**What LP says:**
> "Auto-generates videos, statics, carousels based on winning patterns"

**What's built:**
- Brief generation (tells you WHAT to make)
- Creative Scorer (predicts performance before launch)
- Pattern analysis (knows what works)

**What's NOT built:**
- Actual video/image generation
- Connection to Sora 2, HeyGen, ElevenLabs
- Auto-upload to Meta

**What we're adding:**

| Component | Tool | What It Does |
|-----------|------|--------------|
| Video Generation | Sora 2, Veo 3 | Generate product videos from briefs |
| Avatar Videos | HeyGen | AI talking head UGC |
| Voice Cloning | ElevenLabs | Founder voice, voiceovers |
| Static Images | Midjourney, DALL-E | Product shots, lifestyle images |
| Auto-Publish | Meta Ads API | Push directly to ad account |

**Why it matters for ads:**
> "The system doesn't just tell you what to make. It MAKES it. You approve, it publishes. That's the 30 minutes a week."

**Timeline:** After Shopify integration (~3-4 weeks)

---

### 4. WhatsApp Alerts (P2)

**What LP says:**
> "Alerts you before performance drops"

**What's built:**
- Alert generation logic
- Slack integration (partial)

**What's NOT built:**
- WhatsApp Business API integration
- Real-time push notifications

**What we're adding:**
- Connect WhatsApp Business API
- Send alerts directly to founder's phone
- Critical alerts = immediate push
- Daily summary = morning digest

**Why it matters for ads:**
> "You're not checking dashboards. Your phone buzzes. 'Hey, your Summer Sale campaign is fatiguing. We've generated 3 replacement briefs. Tap to approve.'"

---

### 5. Enhanced Pattern Learning (P2)

**What LP says:**
> "Identifies what works for YOUR specific audience"

**What's built:**
- Creative DNA analysis (hook, visual, audio tags)
- Basic pattern matching
- Agent memory (learns from decisions)

**What we're adding:**
- Cross-account pattern learning (anonymized)
- Vertical-specific insights (fashion vs beauty)
- Seasonal pattern detection
- Competitor pattern analysis

**Why it matters for ads:**
> "It's not just generic best practices. It learns YOUR audience. After 30 days, it knows that your customers respond to 'Problem-Solution' hooks but ignore 'Discount' hooks."

---

### 6. Approval Workflow UI (P2)

**What LP says:**
> "You spend 30-45 min/week approving"

**What's built:**
- Dashboard shows alerts and briefs
- Manual approval flow

**What we're adding:**
- One-tap approve/reject on mobile
- Batch approval (approve 5 briefs at once)
- "Trust mode" - auto-approve high-confidence briefs
- Weekly approval digest

**Why it matters for ads:**
> "Open app. See 5 briefs. Swipe right to approve, swipe left to reject. Done. That's your 30 minutes."

---

## Priority Order

| Priority | Feature | Why This Order |
|----------|---------|----------------|
| **P0** | Shopify Integration | Unlocks product-level intelligence (core value prop) |
| **P1** | True 24/7 Monitoring | Makes "always watching" claim real |
| **P2** | WhatsApp Alerts | Delivers the "alert before you notice" promise |
| **P2** | Approval Workflow UI | Makes "30 min/week" feel effortless |
| **P2** | Enhanced Pattern Learning | Deepens the "learns over time" moat |
| **P3** | Creative Engine | The big one - auto-production |

---

## For Ad Scripts: How to Talk About Coming Features

### DO say:
- "The system will generate replacements automatically" (future tense OK)
- "Alerts come straight to your WhatsApp" (we're building this)
- "It learns what works for YOUR audience over time" (true, getting better)

### DON'T say:
- "We generate 50 creatives for you" (not built yet, also wrong positioning)
- "AI makes your ads" (too vague, sounds like commodity)
- "Fully automated" (approval step is intentional, not a limitation)

### Frame it as:
> "The system handles the intelligence. You handle the approval. That's the partnership."

---

## Visual for Ads: The Full Loop (Coming Soon)

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│   📊 DATA                    🔮 PREDICT                         │
│   System watches your       Alerts you 48-72 hours              │
│   Meta + Shopify 24/7       BEFORE performance drops            │
│         │                           │                           │
│         ▼                           ▼                           │
│   🎯 DECIDE                  📝 BRIEF                           │
│   Identifies winners,        Auto-generates exactly             │
│   kills losers               what to create next                │
│         │                           │                           │
│         ▼                           ▼                           │
│   🎬 CREATE                  ✅ APPROVE                         │
│   System produces            You tap approve                    │
│   videos, statics            (30 min/week)                      │
│         │                           │                           │
│         └───────────────────────────┘                           │
│                     │                                            │
│                     ▼                                            │
│              🚀 PUBLISH                                          │
│              Live on Meta                                        │
│              Performance tracked                                 │
│              Loop repeats                                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Summary for Partner

**What to emphasize in ads:**
1. **Prediction** - "Know before it happens" (BUILT)
2. **Intelligence** - "Data-driven decisions" (BUILT)
3. **Briefs** - "Tells you exactly what to make" (BUILT)
4. **Time savings** - "30 min/week" (BUILDING the seamless flow)
5. **Auto-production** - "System creates for you" (COMING SOON - be careful with tense)

**The honest positioning:**
> "Today, we predict and brief. Soon, we predict, brief, AND produce. The full loop."

---

*Last updated: May 1, 2026*
