# Dashboard Design Plan

> Status: PLANNED (not built yet)
> Priority: Future milestone
> Last updated: 2026-05-16

## Overview

Build a real-time dashboard for clients to see their Intelligence Operating System running live - similar to the landing page "How It Works" visualization but as actual functional software.

## Design Reference

Based on landing page terminal visualization (Instig8-inspired):
- Terminal-style dark canvas (#09090B)
- Three-column layout: Pipeline | Main Output | Activity Feed
- Sequential step animations
- Live progress indicators

## Core Components

### 1. Pipeline Panel (Left)
Steps that animate sequentially:
1. Connect platforms
2. Sync Meta Ads data
3. Sync Shopify inventory
4. Run gap detection
5. Score creatives
6. Analyze comments
7. Synthesize worldview
8. Generate priority
9. Send to WhatsApp

States: `pending` → `active` → `done`

### 2. Main Output Panel (Center)
Tabs: DETECT | SYNTHESIZE | DECIDE | ACT

Each tab shows:
- Real terminal-style output
- Key metrics with color coding
- Progress bar for current operation
- Blinking cursor effect

### 3. Activity Feed (Right)
- Timestamped log entries
- Color-coded by severity
- "NEXT ACTION" card at bottom

## Animation Specs

```css
/* Sequential step reveal */
@keyframes step-reveal {
  0% { opacity: 0; transform: translateX(-20px); }
  100% { opacity: 1; transform: translateX(0); }
}

/* Staggered delays: 0.3s per step */
Step 1: delay 0s
Step 2: delay 0.3s
Step 3: delay 0.6s
...
Step 9: delay 2.4s
```

## Data Sources (When Built)

| Component | Data Source |
|-----------|-------------|
| Pipeline status | Real-time job queue |
| Gap detection | OOS detector + Ad watchdog |
| Creative scores | Creative scorer |
| Comments | Comment mining agent |
| Worldview | Synthesis engine |
| Priority | Strategic cognition |

## Tech Stack

- Next.js 14 + TypeScript
- Real-time: Socket.io or Server-Sent Events
- State: React Query for server state
- Charts: Recharts (if needed)

## Client Access

- Per-client authenticated view
- Show only their brand's data
- Historical playback option

## NOT Building Now

This is a future milestone. Current focus is:
1. Landing page (os.smashed.agency)
2. Backend agents working
3. WhatsApp delivery

Dashboard comes after we have paying clients.
