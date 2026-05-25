# Competitor Visual Analysis — May 16, 2026

> Visual design extraction from Merydian.ai and Instig8.ai

## Two Design Archetypes

| Aspect | Merydian (Institutional) | Instig8 (Agentic OS) |
|--------|--------------------------|----------------------|
| **Feel** | Safe, mature, trustworthy | Powerful, technical, command-center |
| **Message** | "We're the adults who secure AI" | "You're accessing a $10M revenue machine" |
| **Best For** | Enterprise security, compliance | Multi-agent systems, revenue automation |

---

## COLOR SYSTEMS

### Merydian (Institutional / Security)
```
Background:     #000000 (dark mode) / #FFFFFF (light)
Accent:         Crimson Red (#DC2626) or Amber — "danger" highlights
Secondary:      Deep Navy / Metallic Silver — security feel
Text Primary:   #FFFFFF / #000000 (high contrast)
Text Body:      #64748B (slate gray)
```

### Instig8 (Terminal / HUD)
```
Background:     #050505 or #09090B (terminal dark)
Accent:         Acid Green (#10B981 or #00FF41) — "live" indicators
                OR Cyberpunk Yellow/Intense Blue
Text Primary:   #EDEDED (bright white headings)
Text Secondary: #A1A1AA (muted terminal gray)
```

**Our Choice:** Instig8 approach — Terminal dark with live status indicators

---

## TYPOGRAPHY

### Merydian
- **Display:** Halant (Serif) — editorial, consultancy feel
- **Body:** Inter (Sans-serif)
- **Effect:** Looks like McKinsey or white-shoe law firm
- **Tracking:** Tight on headings, generous line-height on body

### Instig8
- **Display:** Geometric Sans (Space Grotesk / Geist / Inter)
- **System:** Monospace (JetBrains Mono / Fira Code) — used as design element
- **Labels:** ALL CAPS for section headers (`ENGINE 01 / DIRECTION01`)
- **Tags:** Monospace for structural tags (`// agent: VisionNavigator`)
- **Tracking:** Wide letter-spacing on subheadings — blueprint feel

**Our Choice:** Instig8 approach — Geometric sans + aggressive monospace usage

---

## LAYOUT & SPACING

### Merydian
- Max-width: 1280px (`max-w-7xl`)
- Vertical padding: 96px between sections (`py-24`)
- Style: Editorial, long-form, deliberate pacing
- Grid: 3-column for team, timeline for deployment

### Instig8
- Style: Dense "Bento Box" / Dashboard layout
- Grid: Mathematical — 4x2 or 3x3 for "Engines"
- Effect: Looks like an interface, not a marketing page
- Structure: Server rack / architecture diagram aesthetic

**Our Choice:** Instig8 — Dashboard/Bento layout for intelligence modules

---

## VISUAL ELEMENTS

### Merydian
- **Imagery:** Human photography (CEO, COO, CTO portraits)
- **Data Viz:** Threat dashboards, enterprise software cards
- **Borders:** Soft radii (12px / `rounded-xl`)
- **Shadows:** Subtle enterprise feel

### Instig8
- **Imagery:** Schematics, wireframes, node-graphs, blueprints
- **Labels:** `FIG. 01 / SYSTEM ARCHITECTURE`
- **UI:** Badges, pill tags, status indicators
- **Borders:** Brutalist — sharp corners (0-4px radius)
- **Dividers:** 1px solid borders (`border-gray-800`)

**Our Choice:** Instig8 — Schematic imagery, live status indicators

---

## MOTION & INTERACTION

### Merydian
- Scroll: Fade-up animations, elegant timing
- Hover: Soft drop-shadow elevation + slight translate-y
- Feel: Grounded, professional

### Instig8
- Scroll: Snappy, machine-like, instantaneous
- Status: Infinite CSS pulse on `● LIVE` indicators
- Hover: Targeting bracket `[ ]` effect or neon border glow
- Feel: Dashboard is "alive"

**Our Choice:** Instig8 — Live pulse animations, bracket targeting effects

**Animation Libraries (per user):**
- Motion (Framer Motion): https://github.com/motiondivision/motion
- GSAP: https://github.com/greensock/gsap

---

## PREMIUM MICRO-DETAILS

### Merydian — "Authoritative Juxtaposition"
- Dangerous AI tech + 100-year-old bank design = psychological safety
- Real photos, named executives = accountability
- Day 1/3/5 timelines = operational maturity signal

### Instig8 — "In-Universe Worldbuilding"
- Doesn't feel like selling, feels like access to proprietary tool
- `VERSION AOS v8.4` — implies versioned product
- `ENGINE 01 / DIRECTION01 // agent: VisionNavigator` — IP feel
- `DRIFT ● 0`, `ALIGNMENT ● 100%` — live system metrics
- Micro-details: slashes, pulse dots, version numbers

**Our Choice:** Instig8 worldbuilding — Our 40+ agents as "Intelligence Engines"

---

## SMASHED AGENCY SYNTHESIS

Based on visual analysis, the **Instig8 "Agentic OS"** approach fits our positioning:

### Why Instig8 Over Merydian:
1. We have 40+ agents — "Operating System" framing works
2. Multi-agent = "Engines" not services
3. Live intelligence = pulse indicators make sense
4. Technical credibility without corporate stuffiness

### Adapted Design Language:

```
BACKGROUND:     #09090B (terminal dark)
ACCENT:         #F5A623 (electric amber — our brand)
LIVE INDICATOR: #10B981 (acid green for "active" states)
TEXT PRIMARY:   #EDEDED
TEXT SECONDARY: #71717A
BORDER:         #27272A (1px solid)

TYPOGRAPHY:
- Display: Geist Sans (negative tracking)
- System: Geist Mono (labels, tags, metrics)
- Pattern: ALL CAPS for section headers
- Tags: `// intelligence: CreativeScorer`

STRUCTURE:
- Bento grid for 6 Intelligence Categories
- Live status indicators on each module
- Version number in footer: `v2.1.4`
- Mathematical grid (not organic flow)

MOTION:
- Pulse animation on live indicators
- Bracket targeting on hover `[ ]`
- Snap scroll between sections
- GSAP for complex sequences
- Motion for React component animations
```

---

## SECTION MAPPING

| Instig8 Pattern | Our Adaptation |
|-----------------|----------------|
| `ENGINE 01 / DIRECTION01` | `INTELLIGENCE 01 / CREATIVE` |
| `// agent: VisionNavigator` | `// module: CreativeScorer` |
| `STATUS ● LIVE` | `STATUS ● ACTIVE` on running agents |
| `ALIGNMENT ● 100%` | `SYNC ● REAL-TIME` for data feeds |
| `VERSION AOS v8.4` | `COSMISK v2.1` in footer |
| 8 Engines grid | 6 Intelligence Categories grid |

---

## IMPLEMENTATION NOTES

### Must-Have Elements:
1. Terminal-dark canvas (#09090B)
2. Monospace labels on every section
3. At least 3 live pulse indicators
4. Bento grid for intelligence modules
5. Version number somewhere visible
6. Bracket hover effects on interactive elements

### Animation Priority:
1. Hero text reveal (GSAP SplitText)
2. Live status pulse (CSS infinite keyframe)
3. Section fade-in on scroll (Motion)
4. Hover bracket targeting (CSS transitions)
5. Number counters (GSAP)

### What NOT To Do:
- No soft, rounded corners everywhere
- No gradient mesh backgrounds (too Stripe)
- No human photography in hero
- No "Request Demo" as primary CTA
- No long-form editorial copy
