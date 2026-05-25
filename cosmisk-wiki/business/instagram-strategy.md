# Instagram Strategy — Content & Growth Hub

> Vishant's Instagram presence, content strategy, and audit tools.
> Central hub for IG content creation and analysis.

## Profile

| Field | Value |
|-------|-------|
| **Username** | @vishant.jain06 |
| **URL** | instagram.com/vishant.jain06 |
| **Bio** | "Vishant Jain \| Facebook Ads" |
| **Posts** | 139 |
| **Followers** | 3,239 |
| **Following** | 150 |
| **Last Audit** | May 1, 2026 |

---

## Content Pillars (Same as LinkedIn)

| Pillar | IG Format | Example |
|--------|-----------|---------|
| **The Gap** | Carousel, Reels | "5 gaps where your ad spend disappears" |
| **AI Building** | Reels, Stories | "Built this AI agent in 30 mins" |
| **Real Numbers** | Carousel | Case study with before/after |
| **Behind the Scenes** | Stories, Reels | Building Cosmisk footage |
| **Quick Tips** | Reels (< 60s) | "One thing killing your ROAS" |

---

## Scripts & Tools Inventory

### Audit Scripts
| Script                             | Purpose                | Output             |
| ---------------------------------- | ---------------------- | ------------------ |
| `audit-instagram.js`               | Profile scraper v1     | Profile data       |
| `audit-instagram-v2.js`            | Mobile viewport audit  | Screenshots + JSON |
| `instagram-audit-authenticated.js` | Authenticated scraping | Full post data     |

### Screenshot Scripts
| Script                       | Purpose                   | Output        |
| ---------------------------- | ------------------------- | ------------- |
| `screenshot-instagram.js`    | Single post capture v1    | PNG           |
| `screenshot-instagram-v2.js` | Post capture v2           | PNG           |
| `screenshot-instagram-v3.js` | Handles popups, scrolling | Multiple PNGs |

### Output Files
| File | Location | Content |
|------|----------|---------|
| `audit-report.json` | instagram-audit/ | Profile stats, post analysis |
| `full-audit-report.json` | instagram-audit/ | Complete audit data |
| `profile-mobile.png` | instagram-audit/ | Mobile viewport screenshot |
| `profile-scrolled.png` | instagram-audit/ | Scrolled feed screenshot |

---

## Content Types & Performance

| Type | Best For | Engagement Pattern |
|------|----------|-------------------|
| **Carousels** | Educational, case studies | High saves, shares |
| **Reels** | Tips, behind-scenes, AI demos | High reach, new followers |
| **Stories** | Daily updates, polls, BTS | Engagement, DMs |
| **Static Posts** | Results, announcements | Saves, comments |

---

## Competitor Accounts (Study These)

### Primary Competitor: @moksh.vasant

| Metric | Value |
|--------|-------|
| **Username** | @moksh.vasant |
| **Followers** | 140,000 |
| **Posts** | 27 |
| **Engagement Rate** | 0.86% |
| **Analysis Script** | `analyze-moksh-vasant.js` |
| **Data File** | `moksh-vasant-analysis.json` |

**Why Study:**
- 140K followers with only 27 posts = high-quality content strategy
- Static posts outperform reels (8,754 and 5,456 likes on top posts)
- India-based creator in similar niche
- Proves you don't need high volume, just high quality

**What Works for Moksh:**
- Educational static posts with clean design
- Simple, direct captions
- Consistent visual branding
- Quality over quantity (27 posts → 140K followers)

### Other Competitors

| Account | Focus | Style | Followers |
|---------|-------|-------|-----------|
| @themikefutia | Claude Code, AI building | Reels, demos | Growing |
| @barryhott | Ugly Ads, contrarian | Educational reels | ~50K |
| @socialinsider | Analytics, data | Carousels, infographics | 100K+ |
| @latercom | Social media tips | Educational | 500K+ |

---

## Frame.io Integration

Video assets stored in Frame.io for review:
- `frameio-Video-01.png` through `frameio-Video-30.png` in `instagram-audit/`
- Used for content planning and approval workflow

---

## Content Ideas Backlog

### From LinkedIn (Repurpose)
- "5 Gaps" → Carousel
- Case studies → Before/after carousel
- "I just built X" → Reels

### IG-Native Ideas
- Timelapse of building with Claude Code
- "Day in the life" building AI
- Quick tip reels (< 30s)
- Story polls: "Which gap costs you most?"

---

## Tools Used

| Tool | Purpose |
|------|---------|
| **Puppeteer** | Profile auditing, screenshots |
| **Frame.io** | Video asset review |
| **Canva** | Quick graphics (avoid for final) |
| **CapCut** | Reels editing |
| **Later/Buffer** | Scheduling |

---

## Growth Strategy

### Current Phase: Establish Authority
1. Post 3-4x/week (reels + carousels)
2. Focus on "AI + Ads" niche
3. Repurpose LinkedIn content
4. Engage in comments on competitor posts

### Target Metrics
| Metric | Current | Target (90 days) |
|--------|---------|------------------|
| Followers | 3,239 | 5,000 |
| Avg. Likes | ? | 200+ |
| Reel Views | ? | 5K+ avg |
| Saves | ? | 50+ per carousel |

---

## Session Learnings Log

### May 17, 2026: Competitor Analysis + Wiki Structure
- Added Moksh Vasant (@moksh.vasant) as primary competitor to study
- Key insight: 140K followers with only 27 posts = quality > quantity
- Static posts can outperform reels (8,754 likes on top post)
- Analysis script: `analyze-moksh-vasant.js`
- Data file: `moksh-vasant-analysis.json`

### May 2026: Audit Setup
- Built Puppeteer scripts for profile auditing
- Mobile viewport captures more accurate feed view
- Login popups require escape key handling
- Frame.io integration for video review workflow

---

## Related

- [[linkedin-strategy]] — Cross-platform content
- [[positioning]] — Brand positioning
- [[the-gap]] — Core content framework
- [[casorro]] — Case study content
- [[pratapsons]] — Case study content
- [[COMPETITOR_VISUAL_ANALYSIS]] — Visual research
- [[HOMEPAGE_DESIGN]] — Design language
