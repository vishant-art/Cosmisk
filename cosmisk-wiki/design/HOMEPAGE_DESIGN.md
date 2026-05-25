# Homepage Design — Smashed Agency Intelligence Layer

> Complete design specification using Instig8 "Agentic OS" patterns.

**Related:**
- [[BRUTAL_AUDIT_2026-05-16]] — Strategic positioning
- [[COMPETITOR_VISUAL_ANALYSIS]] — Visual analysis of Merydian & Instig8
- [[the-gap]] — One of six intelligence categories
- [[CLIENT_EXPERIENCE_LAYER]] — Product design

---

## DESIGN PHILOSOPHY

**Primary Inspiration: Instig8.ai (Agentic OS)**

Instig8 doesn't feel like it's *selling* you something — it feels like you've been granted access to a proprietary internal tool. This is the aesthetic we want.

**Secondary References:**
- Linear: Dark canvas, product-focused
- Vercel: Stark contrast, geometric sans

**Our Direction: "INTELLIGENCE OPERATING SYSTEM"**

The website should feel like a command center — you're accessing a proprietary system, not browsing a marketing page. Dense, modular, alive.

**Key Design Decisions:**
1. **Terminal dark canvas** (#09090B) — not soft dark, TERMINAL dark
2. **Agentic labeling** — `INTELLIGENCE 01 / CREATIVE // module: CreativeScorer`
3. **Live status indicators** — `STATUS ● ACTIVE` with infinite pulse
4. **Bento grid layout** — dashboard modules, not marketing sections
5. **Brutalist borders** — sharp corners, 1px solid, no soft radii
6. **Version numbers** — `COSMISK v2.1` in footer (implies versioned product)
7. **Bracket targeting** — `[ ]` hover effects on interactive elements

**Animation Libraries:**
- **Motion (Framer Motion):** https://github.com/motiondivision/motion — React component animations
- **GSAP:** https://github.com/greensock/gsap — Complex sequences, SplitText, counters

---

## COLOR SYSTEM

```yaml
colors:
  # Canvas (Terminal Dark — NOT soft dark)
  canvas: "#09090B"           # Pure terminal black
  surface-1: "#0F0F11"        # Card backgrounds
  surface-2: "#151517"        # Elevated surfaces
  surface-3: "#1A1A1D"        # Highest elevation

  # Accent
  primary: "#F5A623"          # Electric amber - THE accent
  primary-hover: "#FFC043"    # Lighter amber
  primary-muted: "#A67C1A"    # Darker amber

  # Text
  ink: "#EDEDED"              # Primary text (terminal white)
  ink-muted: "#A1A1AA"        # Secondary text (terminal gray)
  ink-subtle: "#71717A"       # Tertiary text

  # Live Status Colors
  live: "#10B981"             # Acid green for LIVE/ACTIVE
  live-glow: "#10B98140"      # 25% opacity for glow
  sync: "#3B82F6"             # Blue for SYNC indicators
  drift: "#EF4444"            # Red for DRIFT/ERROR

  # Borders (Brutalist)
  border: "#27272A"           # 1px solid borders
  border-hover: "#3F3F46"     # Hover state borders
  border-active: "#F5A62340"  # Amber glow on active

  # Special
  gradient-start: "#F5A623"   # Amber
  gradient-mid: "#FF6B35"     # Orange
  gradient-end: "#FF4757"     # Coral
```

**Why This Palette?**
- **Terminal black (#09090B)** — Instig8 uses this, feels like accessing a system
- **Acid green (#10B981)** — Live indicators that pulse, "system is alive"
- **Amber accent** — Not blue (every AI tool), not purple (Anthropic)
- **Brutalist borders** — 1px solid, sharp, no soft glow

---

## TYPOGRAPHY SYSTEM

```yaml
typography:
  # Display (Geist Sans — negative tracking)
  display-xl:
    fontFamily: "Geist, Inter, system-ui, sans-serif"
    fontSize: 64px
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: -2.5px

  display-lg:
    fontFamily: "Geist, Inter, system-ui, sans-serif"
    fontSize: 48px
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: -1.8px

  display-md:
    fontFamily: "Geist, Inter, system-ui, sans-serif"
    fontSize: 32px
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: -1.0px

  display-sm:
    fontFamily: "Geist, Inter, system-ui, sans-serif"
    fontSize: 24px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: -0.6px

  # Body
  body-lg:
    fontFamily: "Geist, Inter, system-ui, sans-serif"
    fontSize: 18px
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: 0

  body-md:
    fontFamily: "Geist, Inter, system-ui, sans-serif"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: 0

  # SYSTEM LABELS (Instig8 Pattern — Critical)
  system-header:
    fontFamily: "Geist Mono, JetBrains Mono, ui-monospace, monospace"
    fontSize: 11px
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: 1.5px
    textTransform: uppercase
    # Pattern: "INTELLIGENCE 01 / CREATIVE"

  system-tag:
    fontFamily: "Geist Mono, JetBrains Mono, ui-monospace, monospace"
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: 0
    # Pattern: "// module: CreativeScorer"

  system-status:
    fontFamily: "Geist Mono, JetBrains Mono, ui-monospace, monospace"
    fontSize: 10px
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: 0.5px
    textTransform: uppercase
    # Pattern: "STATUS ● ACTIVE"

  system-version:
    fontFamily: "Geist Mono, JetBrains Mono, ui-monospace, monospace"
    fontSize: 10px
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: 0
    # Pattern: "COSMISK v2.1.4"

  # Code/Technical
  mono-body:
    fontFamily: "Geist Mono, JetBrains Mono, ui-monospace, monospace"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: 0
```

**Instig8 Labeling System (MUST USE):**
```
Section Headers:    INTELLIGENCE 01 / CREATIVE
Module Tags:        // module: CreativeScorer
Status Indicators:  STATUS ● ACTIVE
Metrics:            SYNC ● REAL-TIME  |  DRIFT ● 0
Version:            COSMISK v2.1.4
Figure Labels:      FIG. 01 / SYSTEM ARCHITECTURE
```

---

## SPACING SYSTEM

```yaml
spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  xxl: 48px
  section: 80px    # Tighter than editorial sites

# BRUTALIST CORNERS (Instig8 Pattern)
rounded:
  none: 0px       # DEFAULT — use this most often
  xs: 2px         # Subtle softening
  sm: 4px         # Max for cards
  md: 6px         # Rare — only for specific elements
  pill: 9999px    # Status badges only
```

**Corner Philosophy:**
- Instig8 uses sharp corners (0-4px) — looks like software, not marketing
- Soft rounded corners (12px+) = "friendly SaaS" = NOT our vibe
- Exception: Status badges can use pill radius

---

## COMPONENT LIBRARY

### Buttons (Brutalist)

```yaml
button-primary:
  backgroundColor: "{colors.primary}"
  textColor: "#09090B"
  typography: "{typography.body-md}"
  fontWeight: 600
  rounded: "{rounded.xs}"          # Sharp corners
  padding: 12px 24px
  height: 48px
  hover:
    backgroundColor: "{colors.primary-hover}"
    # Bracket targeting effect:
    before: "["
    after: "]"

button-secondary:
  backgroundColor: "transparent"
  textColor: "{colors.ink}"
  border: "1px solid {colors.border}"
  typography: "{typography.body-md}"
  fontWeight: 500
  rounded: "{rounded.xs}"          # Sharp corners
  padding: 12px 24px
  height: 48px
  hover:
    border: "1px solid {colors.border-hover}"
    backgroundColor: "{colors.surface-1}"

button-ghost:
  backgroundColor: "transparent"
  textColor: "{colors.ink-muted}"
  typography: "{typography.body-md}"
  fontWeight: 500
  rounded: "{rounded.none}"
  padding: 12px 24px
```

### Cards (Bento Grid Modules)

```yaml
card-engine:
  # Instig8 "ENGINE" style card
  backgroundColor: "{colors.surface-1}"
  border: "1px solid {colors.border}"
  rounded: "{rounded.xs}"          # Sharp corners
  padding: 24px
  structure:
    - system-header: "INTELLIGENCE 01 / CREATIVE"
    - system-tag: "// module: CreativeScorer"
    - content: "..."
    - system-status: "STATUS ● ACTIVE"

card-stat:
  backgroundColor: "{colors.surface-1}"
  border: "1px solid {colors.border}"
  rounded: "{rounded.none}"        # Completely sharp
  padding: 24px

card-hover:
  border: "1px solid {colors.border-active}"
  # Optional: bracket corners appear on hover
```

### Status Indicators (Critical — Makes Site Feel Alive)

```yaml
status-live:
  # Pulsing green dot — MUST HAVE
  size: 6px
  backgroundColor: "{colors.live}"
  boxShadow: "0 0 8px {colors.live-glow}"
  animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite"
  # CSS:
  # @keyframes pulse {
  #   0%, 100% { opacity: 1; transform: scale(1); }
  #   50% { opacity: 0.7; transform: scale(1.15); }
  # }

status-badge:
  backgroundColor: "{colors.surface-2}"
  textColor: "{colors.ink-muted}"
  typography: "{typography.system-status}"
  rounded: "{rounded.pill}"
  padding: 4px 12px
  border: "1px solid {colors.border}"

status-metric:
  # Pattern: "SYNC ● REAL-TIME"
  display: "flex"
  alignItems: "center"
  gap: 6px
  typography: "{typography.system-status}"
```

### Bracket Targeting (Instig8 Hover Effect)

```css
/* Apply to interactive elements on hover */
.bracket-target {
  position: relative;
}
.bracket-target::before,
.bracket-target::after {
  content: "";
  position: absolute;
  width: 8px;
  height: 8px;
  border: 1px solid {colors.primary};
  opacity: 0;
  transition: opacity 0.2s ease;
}
.bracket-target::before {
  top: -4px;
  left: -4px;
  border-right: none;
  border-bottom: none;
}
.bracket-target::after {
  bottom: -4px;
  right: -4px;
  border-left: none;
  border-top: none;
}
.bracket-target:hover::before,
.bracket-target:hover::after {
  opacity: 1;
}
```

### System Labels

```yaml
label-section:
  # "INTELLIGENCE 01 / CREATIVE"
  typography: "{typography.system-header}"
  textColor: "{colors.ink-muted}"
  marginBottom: 16px

label-tag:
  # "// module: CreativeScorer"
  typography: "{typography.system-tag}"
  textColor: "{colors.ink-subtle}"

label-version:
  # "COSMISK v2.1.4"
  typography: "{typography.system-version}"
  textColor: "{colors.ink-subtle}"
```

---

## HOMEPAGE SECTIONS

### Section 1: HERO (Above Fold)

**Layout:** Full-width terminal dark canvas — command center aesthetic

```
┌─────────────────────────────────────────────────────────────────────┐
│ [NAV]                                                               │
│ SMASHED ▪ INTELLIGENCE    Products  Proof  About  [Access System →] │
│                           COSMISK v2.1.4                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  [system-header]                                                    │
│  INTELLIGENCE OPERATING SYSTEM / D2C                                │
│                                                                     │
│  [display-xl]                                                       │
│  We see what you can't see.                                         │
│  We tell you what to do about it.                                   │
│  [gradient text on "can't see"]                                     │
│                                                                     │
│  [system-tag]                                                       │
│  // 40+ agents watching | synthesis engine | decision compression   │
│                                                                     │
│  [button-primary: [ Access Intelligence → ] ]                       │
│  [button-secondary: View System Architecture]                       │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ [SYSTEM STATUS BAR — 1px border, sharp corners]             │    │
│  │                                                             │    │
│  │ STATUS ● LIVE   BRANDS ● 12   ALERTS TODAY ● 7              │    │
│  │ WASTE PREVENTED (MTD) ● ₹23.4L   SYNC ● REAL-TIME           │    │
│  │                                                             │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**CSS for gradient text:**
```css
.gradient-text {
  background: linear-gradient(135deg, #F5A623 0%, #FF6B35 50%, #FF4757 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
```

**Motion (GSAP + Motion):**
- **Hero text reveal:** GSAP SplitText, stagger 0.02s per character
- **Status bar:** Numbers count up with GSAP (duration: 2s, ease: power2.out)
- **Live pulse:** Infinite CSS keyframe on green dot
- **Gradient shimmer:** Subtle hue-rotate animation on headline (optional)

---

### Section 2: THE PROBLEM (Pattern Interrupt)

**Layout:** Full-width dark with centered content

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  [MONO-LABEL] THE PROBLEM                                           │
│                                                                     │
│  [display-lg]                                                       │
│  Your platforms don't talk to each other.                           │
│  Money leaks in the silence.                                        │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                                                               │  │
│  │   META ADS         THE GAP         SHOPIFY                    │  │
│  │   ┌─────┐         [MONEY]          ┌─────┐                    │  │
│  │   │     │ ───────→  💸  ←───────── │     │                    │  │
│  │   │ 📊  │         [FALLING]        │ 🛒  │                    │  │
│  │   └─────┘                          └─────┘                    │  │
│  │                                                               │  │
│  │   [Animated money particles falling between platforms]        │  │
│  │                                                               │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  [body-lg, ink-muted]                                               │
│  Meta sees Meta. Shopify sees Shopify.                              │
│  Nobody sees the 15-25% leaking between them.                       │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Motion:**
- Money particles animated falling between platforms
- Platforms pulsing slightly
- THE GAP label fading in

---

### Section 3: THE SIX INTELLIGENCE ENGINES

**Layout:** 3x2 Bento grid — looks like a dashboard, not marketing

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  [system-header]                                                    │
│  SYSTEM ARCHITECTURE / INTELLIGENCE ENGINES                         │
│                                                                     │
│  [display-lg]                                                       │
│  Six engines. One synthesis.                                        │
│  // compressed into a single daily decision                         │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ [BENTO GRID — 3x2, 1px borders, sharp corners]             │    │
│  │                                                             │    │
│  │ ┌───────────────┐ ┌───────────────┐ ┌───────────────┐      │    │
│  │ │ENGINE 01      │ │ENGINE 02      │ │ENGINE 03      │      │    │
│  │ │CREATIVE       │ │AUDIENCE       │ │PREDICTIVE     │      │    │
│  │ │               │ │               │ │               │      │    │
│  │ │// module:     │ │// module:     │ │// module:     │      │    │
│  │ │CreativeScorer │ │TrustTracker   │ │FatiguePredict │      │    │
│  │ │               │ │               │ │               │      │    │
│  │ │What to make,  │ │Trust states,  │ │Fatigue 7 days │      │    │
│  │ │when to kill,  │ │emotional      │ │before crash,  │      │    │
│  │ │what's dying   │ │exhaustion     │ │performance    │      │    │
│  │ │               │ │               │ │forecasting    │      │    │
│  │ │AGENTS ● 8     │ │AGENTS ● 6     │ │AGENTS ● 5     │      │    │
│  │ │STATUS ● LIVE  │ │STATUS ● LIVE  │ │STATUS ● LIVE  │      │    │
│  │ └───────────────┘ └───────────────┘ └───────────────┘      │    │
│  │                                                             │    │
│  │ ┌───────────────┐ ┌───────────────┐ ┌───────────────┐      │    │
│  │ │ENGINE 04      │ │ENGINE 05      │ │ENGINE 06      │      │    │
│  │ │STRATEGIC      │ │COMPETITIVE    │ │OPERATIONAL    │      │    │
│  │ │               │ │               │ │               │      │    │
│  │ │// module:     │ │// module:     │ │// module:     │      │    │
│  │ │WorldviewSynth │ │CompetitorSpy  │ │GapDetector    │      │    │
│  │ │               │ │               │ │               │      │    │
│  │ │Unified world- │ │What they're   │ │OOS waste,     │      │    │
│  │ │view, decision │ │doing, market  │ │discount leak, │      │    │
│  │ │compression    │ │patterns       │ │LTV gaps       │      │    │
│  │ │               │ │               │ │               │      │    │
│  │ │AGENTS ● 7     │ │AGENTS ● 4     │ │AGENTS ● 10    │      │    │
│  │ │STATUS ● LIVE  │ │STATUS ● LIVE  │ │STATUS ● LIVE  │      │    │
│  │ └───────────────┘ └───────────────┘ └───────────────┘      │    │
│  │                                                             │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  [system-status bar]                                                │
│  TOTAL AGENTS ● 40+   ALL ENGINES ● ACTIVE   SYNC ● REAL-TIME       │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Card Structure (Each Engine):**
```
┌─────────────────────────────────────┐
│ ENGINE 01 / CREATIVE                │  ← system-header
│ // module: CreativeScorer           │  ← system-tag (ink-subtle)
│                                     │
│ What creatives to make,             │  ← body-md (ink)
│ when to kill them,                  │
│ what's fatiguing                    │
│                                     │
│ ─────────────────────────────────── │  ← 1px border divider
│ AGENTS ● 8        STATUS ● LIVE     │  ← system-status + pulse
└─────────────────────────────────────┘
```

**Motion (GSAP + Motion):**
- Cards stagger in: 0.1s delay between each (GSAP stagger)
- Agent counts animate up: GSAP counter
- Live pulse: CSS infinite keyframe on all 6 status indicators
- Hover: Bracket corners `[ ]` appear, border turns amber

---

### Section 4: THE ONE THING (Product Preview)

**Layout:** Split - text left, WhatsApp mockup right

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  [MONO-LABEL] THE OUTPUT                                            │
│                                                                     │
│  ┌────────────────────────────┐  ┌────────────────────────────────┐ │
│  │                            │  │                                │ │
│  │ [display-lg]               │  │  [WHATSAPP MOCKUP]             │ │
│  │ You don't get a            │  │  ┌──────────────────────────┐  │ │
│  │ dashboard.                 │  │  │                          │  │ │
│  │                            │  │  │ 🚨 INTELLIGENCE ALERT    │  │ │
│  │ You get ONE decision       │  │  │                          │  │ │
│  │ per day.                   │  │  │ Fatigue detected:        │  │ │
│  │                            │  │  │ "DSG_TOF_CATALOG"        │  │ │
│  │ [body-lg]                  │  │  │                          │  │ │
│  │ 40+ agents watch.          │  │  │ 7 days before crash      │  │ │
│  │ All signals synthesize.    │  │  │ (87% confidence)         │  │ │
│  │ One WhatsApp arrives.      │  │  │                          │  │ │
│  │                            │  │  │ WHY: Same audience       │  │ │
│  │ THE ONE THING you need     │  │  │ seeing 4.2x frequency.   │  │ │
│  │ to do.                     │  │  │ Trust dropping.          │  │ │
│  │                            │  │  │                          │  │ │
│  │ ┌────────────────────────┐ │  │  │ DO THIS:                 │  │ │
│  │ │ Not more data.         │ │  │  │ Pause this creative.     │  │ │
│  │ │ Fewer decisions.       │ │  │  │ Launch founder-face      │  │ │
│  │ │ Bigger impact.         │ │  │  │ trust ad tomorrow.       │  │ │
│  │ └────────────────────────┘ │  │  │                          │  │ │
│  │                            │  │  │ Expected: Trust 50→65    │  │ │
│  │                            │  │  └──────────────────────────┘  │ │
│  │                            │  │                                │ │
│  └────────────────────────────┘  └────────────────────────────────┘ │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Motion:**
- WhatsApp message types in character by character
- Confidence percentage animates
- Subtle phone frame animation

---

### Section 5: PROOF (Stats + Social Proof)

**Layout:** Stats row + client results

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  [MONO-LABEL] THE PROOF                                             │
│                                                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │ [card-stat] │  │ [card-stat] │  │ [card-stat] │  │ [card-stat] │ │
│  │             │  │             │  │             │  │             │ │
│  │ ₹14 Cr      │  │ 2,600       │  │ 77          │  │ 47          │ │
│  │ [amber]     │  │ [amber]     │  │ [amber]     │  │ [amber]     │ │
│  │             │  │             │  │             │  │             │ │
│  │ waste       │  │ OOS         │  │ zombie      │  │ alerts      │ │
│  │ identified  │  │ products    │  │ campaigns   │  │ this week   │ │
│  │ (3 brands)  │  │ found       │  │ killed      │  │             │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘ │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ [CASE STUDY CARD]                                            │   │
│  │                                                              │   │
│  │ "We stopped checking dashboards.                             │   │
│  │  One WhatsApp per day tells us exactly what to do."          │   │
│  │                                                              │   │
│  │ — Founder, Ethnic Fashion Brand (₹40L/month spend)           │   │
│  │                                                              │   │
│  │ Week 1: Found ₹2.19L/month OOS waste                         │   │
│  │ Week 4: Detected trust erosion from COD spike                │   │
│  │ Week 8: Predicted fatigue 7 days early                       │   │
│  │ Week 12: ROAS stable at 4.2x (was 2.8x volatile)             │   │
│  │                                                              │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Motion:**
- Stats count up on scroll
- Case study timeline animates in sequence

---

### Section 6: HOW IT WORKS (Simple Flow)

**Layout:** 3-step horizontal flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  [MONO-LABEL] HOW IT WORKS                                          │
│                                                                     │
│  ┌───────────────┐      ┌───────────────┐      ┌───────────────┐    │
│  │               │      │               │      │               │    │
│  │      01       │ ───→ │      02       │ ───→ │      03       │    │
│  │               │      │               │      │               │    │
│  │ FREE SCAN     │      │ WEEKLY INTEL  │      │ COMPOUNDING   │    │
│  │               │      │               │      │               │    │
│  │ We analyze    │      │ One WhatsApp  │      │ Week 10 is    │    │
│  │ your business.│      │ per day with  │      │ smarter than  │    │
│  │ You see what's│      │ THE ONE THING.│      │ Week 1.       │    │
│  │ leaking.      │      │               │      │               │    │
│  │               │      │               │      │ Your brand's  │    │
│  │ [48 hours]    │      │ [Daily]       │      │ intelligence  │    │
│  │               │      │               │      │ compounds.    │    │
│  │               │      │               │      │               │    │
│  └───────────────┘      └───────────────┘      └───────────────┘    │
│                                                                     │
│  [button-primary: Start Free Scan →]                                │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

### Section 7: QUALIFICATION (For/Not For)

**Layout:** Two-column comparison

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  [MONO-LABEL] IS THIS FOR YOU?                                      │
│                                                                     │
│  ┌─────────────────────────────┐  ┌─────────────────────────────┐   │
│  │ [surface-1 with green      │  │ [surface-1 with red         │   │
│  │  border accent]            │  │  border accent]             │   │
│  │                            │  │                             │   │
│  │ ✓ THIS IS FOR YOU          │  │ ✗ THIS IS NOT FOR YOU       │   │
│  │                            │  │                             │   │
│  │ • ₹10L+/month on Meta      │  │ • Under ₹5L/month spend     │   │
│  │ • Running on Shopify       │  │ • Not on Shopify            │   │
│  │ • Want strategic clarity   │  │ • Want a self-serve tool    │   │
│  │ • Value decisions over     │  │ • Want more dashboards      │   │
│  │   dashboards               │  │ • Looking for "set and      │   │
│  │ • Ready for compounding    │  │   forget"                   │   │
│  │   intelligence             │  │                             │   │
│  │                            │  │                             │   │
│  └─────────────────────────────┘  └─────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

### Section 8: CTA (Final Conversion)

**Layout:** Full-width gradient band

```
┌─────────────────────────────────────────────────────────────────────┐
│  [GRADIENT BACKGROUND: amber → orange → coral]                      │
│                                                                     │
│  [display-lg, dark text]                                            │
│  See what's invisible.                                              │
│  Do what matters.                                                   │
│                                                                     │
│  [body-lg, dark text]                                               │
│  Free scan. 48 hours. No call required.                             │
│                                                                     │
│  ┌────────────────────────────────────────────────────────────┐     │
│  │ [FORM on gradient]                                         │     │
│  │                                                            │     │
│  │ Brand name: ________________                               │     │
│  │ Shopify URL: ________________                              │     │
│  │ Monthly spend: [dropdown]                                  │     │
│  │ WhatsApp: ________________                                 │     │
│  │                                                            │     │
│  │ [button-primary-dark: Get Your Free Scan →]                │     │
│  │                                                            │     │
│  └────────────────────────────────────────────────────────────┘     │
│                                                                     │
│  [Recent scans - scrolling ticker]                                  │
│  "Found ₹1.8L OOS waste" — Fashion brand, Mumbai                    │
│  "Detected trust erosion" — Beauty brand, Delhi                     │
│  "Predicted fatigue 7 days early" — Home decor, Bangalore           │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

### Section 9: FOOTER

**Layout:** System status + 4-column links + version number

```
┌─────────────────────────────────────────────────────────────────────┐
│  [1px border-top, border color]                                     │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ [SYSTEM STATUS — 1px border, sharp corners]                 │    │
│  │ ● SYSTEM ACTIVE   LAST ALERT ● 3h ago   UPTIME ● 99.9%     │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  SMASHED ▪ INTELLIGENCE                                             │
│  // we see what you can't see                                       │
│                                                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌───────────┐   │
│  │ SYSTEM      │  │ COMPANY     │  │ RESOURCES   │  │ LEGAL     │   │
│  │ [mono-sm]   │  │ [mono-sm]   │  │ [mono-sm]   │  │ [mono-sm] │   │
│  │             │  │             │  │             │  │           │   │
│  │ Intelligence│  │ About       │  │ Case Studies│  │ Privacy   │   │
│  │ Free Scan   │  │ Founders    │  │ Changelog   │  │ Terms     │   │
│  │ Pricing     │  │ Careers     │  │ API Docs    │  │           │   │
│  │ Architecture│  │             │  │             │  │           │   │
│  └─────────────┘  └─────────────┘  └─────────────┘  └───────────┘   │
│                                                                     │
│  ─────────────────────────────────────────────────────────────────  │
│                                                                     │
│  Built by Vishant & Sanskar              COSMISK v2.1.4             │
│  © 2026 Smashed Agency                   [system-version]           │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Critical Elements:**
- System status bar with live pulse indicator
- Version number in footer (implies versioned product)
- Monospace section headers
- "Changelog" and "API Docs" links (implies product, not service)

---

## MOTION & INTERACTION

**Libraries:** GSAP (complex sequences, counters) + Motion/Framer Motion (React components)

### Scroll Animations (GSAP ScrollTrigger)

```yaml
scroll-triggers:
  hero-text:
    type: "SplitText reveal"
    stagger: 0.02s
    ease: "power3.out"

  stat-numbers:
    type: "Counter"
    duration: 2s
    ease: "power2.out"

  engine-cards:
    type: "Stagger fade-up"
    stagger: 0.1s
    y: "20px → 0"
    opacity: "0 → 1"

  live-indicators:
    type: "CSS infinite"
    trigger: "none (always running)"
```

### Hover States (Brutalist)

```yaml
hover:
  card-engine:
    border: "1px solid {colors.primary}40"   # Amber glow
    transition: "150ms ease-out"
    # Bracket corners appear (see CSS above)

  button-primary:
    backgroundColor: "{colors.primary-hover}"
    # Text changes: "Access" → "[ Access ]"

  button-secondary:
    backgroundColor: "{colors.surface-1}"
    border: "1px solid {colors.border-hover}"

  nav-link:
    textColor: "{colors.ink}"
    # Underline appears from left
```

### Live Elements (Critical — Makes Site Feel Alive)

```yaml
live-indicators:
  status-pulse:
    animation: |
      @keyframes pulse {
        0%, 100% {
          opacity: 1;
          transform: scale(1);
          box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.4);
        }
        50% {
          opacity: 0.8;
          transform: scale(1.1);
          box-shadow: 0 0 8px 2px rgba(16, 185, 129, 0.2);
        }
      }
    duration: 2s
    timing: "cubic-bezier(0.4, 0, 0.6, 1)"
    iteration: "infinite"

  recent-alerts-ticker:
    animation: "scroll-left 40s linear infinite"
    pauseOnHover: true

  version-blink:
    # Optional: subtle blink on version number
    animation: "opacity 0.5s ease-in-out"
    trigger: "on page load, then stop"
```

### GSAP Code Patterns

```javascript
// Hero text reveal
gsap.from(".hero-title", {
  duration: 1,
  y: 30,
  opacity: 0,
  ease: "power3.out",
  stagger: 0.1
});

// Counter animation
gsap.to(".stat-number", {
  textContent: targetValue,
  duration: 2,
  ease: "power2.out",
  snap: { textContent: 1 },
  scrollTrigger: { trigger: ".stat-number", start: "top 80%" }
});

// Engine cards stagger
gsap.from(".engine-card", {
  y: 20,
  opacity: 0,
  duration: 0.6,
  stagger: 0.1,
  ease: "power2.out",
  scrollTrigger: { trigger: ".engines-grid", start: "top 70%" }
});
```

---

## RESPONSIVE BREAKPOINTS

```yaml
breakpoints:
  mobile: "< 768px"
    - Stack all columns
    - display-xl → 36px
    - Hamburger nav

  tablet: "768px - 1024px"
    - 2-column grids
    - display-xl → 48px

  desktop: "> 1024px"
    - Full 3-column grids
    - display-xl → 64px
```

---

## KEY PRINCIPLES (Instig8 "Agentic OS" Aesthetic)

1. **Operating System, not marketing page** — feels like accessing proprietary software
2. **In-Universe worldbuilding** — version numbers, engine labels, system status
3. **Terminal dark canvas** — #09090B, not soft dark
4. **Brutalist borders** — 1px solid, sharp corners (0-4px max)
5. **Live indicators everywhere** — pulsing dots, real-time sync status
6. **Monospace as design element** — section headers, tags, metrics
7. **Bracket targeting on hover** — `[ ]` corners appear on interactive elements
8. **GSAP + Motion** — complex sequences, SplitText, counters

---

## DO's AND DON'Ts

### DO (Instig8 Patterns)
- Use `ENGINE 01 / CREATIVE` labeling on every section
- Include `// module: ModuleName` tags
- Show `STATUS ● ACTIVE` with pulsing green dot
- Use version number in footer: `COSMISK v2.1.4`
- Use sharp corners (0-4px radius max)
- Use 1px solid borders on everything
- Animate stats with GSAP counters
- Use bracket `[ ]` hover effects
- Use monospace for ALL labels and metrics

### DON'T (Anti-Patterns)
- Don't use soft rounded corners (12px+) — looks like "friendly SaaS"
- Don't use blue accents — every AI tool does this
- Don't use gradient mesh backgrounds — too Stripe
- Don't use human photography in hero — we're showing a system
- Don't show dashboards — we're anti-dashboard
- Don't use "Request Demo" as CTA — use "Access System"
- Don't use light mode — terminal dark only
- Don't use serif fonts — this isn't editorial
- Don't animate everything — live pulses + scroll triggers only

---

## IMPLEMENTATION CHECKLIST

Before launch, verify:

- [ ] Canvas is #09090B (terminal dark, not soft dark)
- [ ] All section headers use `INTELLIGENCE 01 / CREATIVE` format
- [ ] All modules have `// module: Name` tags
- [ ] At least 6 live pulse indicators visible
- [ ] Version number in footer
- [ ] Bracket hover effects on cards/buttons
- [ ] GSAP counters on all stats
- [ ] Sharp corners everywhere (0-4px max)
- [ ] 1px solid borders on all cards
- [ ] Geist Mono for all system labels

---

*This document is the design spec for homepage implementation.*
*Primary reference: Instig8.ai "Agentic OS" aesthetic.*
*Animation: GSAP + Motion (Framer Motion).*
