# Visual Creative Memory System — Architecture Design

> Eliminate repeated analysis. Build persistent creative intelligence. Compound knowledge.

**Status:** DESIGN DOCUMENT
**Date:** May 16, 2026
**Priority:** CRITICAL (token waste: 25k-210k/day)

**Related:**
- [[strategic-cognition]] — Worldview synthesis that consumes this memory
- [[evidence-providers]] — Agents that feed into this system
- [[closed-loop]] — How memory enables closed-loop learning
- [[QUALITY_CRISIS_AUDIT]] — Why this system is needed
- [[ANTI_PATTERNS]] — Quality rules for outputs
- [[FOUNDER_DIRECTIVES]] — Vishant's explicit rules

---

## PART 1: CURRENT STATE AUDIT

### What Exists (Working)

| System | Location | Status |
|--------|----------|--------|
| Agent Memory | agent-memory.ts | 3-tier (core, episodic, entities) — works |
| Intelligence Persistence | intelligence-persistence.ts | Predictions, recommendations — works |
| Strategic Memory | strategic-memory.ts | Week-to-week continuity — works |
| Visual Analyzer | visual-analyzer.ts | VideoDNA extraction — works but wasteful |
| Creative Detection | creative-detection.ts | Detects new creatives — works |
| DNA Cache | dna_cache table | Stores analysis — keyed by ad_id (wrong) |

### What's Broken (Causing Waste)

| Problem | Impact | Token Waste |
|---------|--------|-------------|
| Keyed by ad_id, not content hash | Same creative, different ID = re-analyzed | 6000 tokens/ad/week |
| No central coordinator | Multiple agents trigger same analysis | 50% duplication |
| Entity extraction duplicated | Same entity extracted 5-10x | 5k-10k tokens/day |
| In-memory caches lost on restart | 8 services recompute summaries | 25k-200k tokens/restart |
| No incremental analysis | 1-pixel edit = full re-analysis | Wasted Gemini uploads |

### Estimated Total Waste

```
Daily: 25k-210k tokens wasted
Monthly: 750k-6.3M tokens wasted
Cost: $1.13-$9.45/month pure waste
```

---

## PART 2: VISUAL CREATIVE MEMORY SYSTEM

### Core Principle

> Analyze once. Store forever. Reuse continuously.

Every creative asset should develop "strategic memory" that compounds over time.

### Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    VISUAL CREATIVE MEMORY SYSTEM                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────┐     ┌──────────────┐     ┌───────────────────┐    │
│  │   INGEST    │────▶│   ANALYZE    │────▶│      STORE        │    │
│  │  (Detect)   │     │  (Once Only) │     │   (Persistent)    │    │
│  └─────────────┘     └──────────────┘     └───────────────────┘    │
│         │                   │                       │               │
│         ▼                   ▼                       ▼               │
│  ┌─────────────┐     ┌──────────────┐     ┌───────────────────┐    │
│  │  FINGERPRINT│     │  COORDINATE  │     │    RETRIEVE       │    │
│  │  (Hash)     │     │  (Dedupe)    │     │    (Reuse)        │    │
│  └─────────────┘     └──────────────┘     └───────────────────┘    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Database Schema

```sql
-- Creative fingerprint registry (content-based deduplication)
CREATE TABLE creative_fingerprints (
  fingerprint_id TEXT PRIMARY KEY,          -- pHash or MD5 of content
  content_type TEXT NOT NULL,               -- 'video' | 'image' | 'carousel'
  content_hash TEXT NOT NULL,               -- MD5 of raw bytes
  perceptual_hash TEXT,                     -- pHash for videos/images
  duration_ms INTEGER,                      -- Video duration
  frame_count INTEGER,                      -- Extracted frames
  file_size_bytes INTEGER,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  analysis_status TEXT DEFAULT 'pending',   -- 'pending' | 'analyzing' | 'complete' | 'failed'
  analysis_version INTEGER DEFAULT 1        -- Increment when analysis schema changes
);

-- Map external IDs to fingerprints (many ad_ids can map to one fingerprint)
CREATE TABLE creative_id_mappings (
  external_id TEXT NOT NULL,                -- Meta ad_id, TikTok creative_id, etc.
  platform TEXT NOT NULL,                   -- 'meta' | 'tiktok' | 'google'
  fingerprint_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  first_mapped_at TEXT NOT NULL,
  FOREIGN KEY (fingerprint_id) REFERENCES creative_fingerprints(fingerprint_id),
  PRIMARY KEY (external_id, platform)
);

-- Deep visual analysis (stored once per fingerprint, reused across all mapped IDs)
CREATE TABLE creative_visual_analysis (
  fingerprint_id TEXT PRIMARY KEY,
  analyzed_at TEXT NOT NULL,
  analyzer_version TEXT NOT NULL,           -- 'gemini-2.5-flash-v1'

  -- Hook Analysis
  hook_type TEXT,                           -- 'curiosity' | 'fear' | 'transformation' | etc.
  hook_duration_ms INTEGER,
  hook_strength_score REAL,                 -- 0-100
  hook_transcript TEXT,

  -- Visual Style
  visual_style TEXT,                        -- JSON: palette, composition, transitions
  typography_style TEXT,                    -- JSON: fonts, positioning, animation
  layout_structure TEXT,                    -- JSON: grid, hierarchy, flow

  -- Full VideoDNA (100+ patterns)
  video_dna TEXT NOT NULL,                  -- Full JSON blob from visual-analyzer

  FOREIGN KEY (fingerprint_id) REFERENCES creative_fingerprints(fingerprint_id)
);

-- Strategic analysis (evolves over time, separate from visual)
CREATE TABLE creative_strategic_analysis (
  fingerprint_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  analyzed_at TEXT NOT NULL,

  -- Persuasion System
  persuasion_strategy TEXT,                 -- 'social_proof' | 'scarcity' | 'authority' | etc.
  persuasion_strength REAL,                 -- 0-100
  trust_architecture TEXT,                  -- JSON: trust signals detected
  emotional_triggers TEXT,                  -- JSON: emotions targeted

  -- Audience Response (updated weekly)
  target_audience TEXT,
  audience_resonance_score REAL,            -- 0-100 based on engagement

  -- Strategic Role
  strategic_role TEXT,                      -- 'hero' | 'test' | 'scale' | 'retention'
  funnel_position TEXT,                     -- 'awareness' | 'consideration' | 'conversion'

  PRIMARY KEY (fingerprint_id, client_id),
  FOREIGN KEY (fingerprint_id) REFERENCES creative_fingerprints(fingerprint_id)
);

-- Performance history (tracks evolution over time)
CREATE TABLE creative_performance_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fingerprint_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,

  -- Core Metrics
  spend REAL,
  impressions INTEGER,
  clicks INTEGER,
  conversions INTEGER,
  roas REAL,
  ctr REAL,
  cpa REAL,

  -- Fatigue Indicators
  frequency REAL,
  ctr_trend TEXT,                           -- 'rising' | 'stable' | 'declining'
  conversion_trend TEXT,
  fatigue_score REAL,                       -- 0-100 (computed from trends)

  -- Trust Indicators
  comment_sentiment REAL,                   -- -1 to +1
  trust_signals_count INTEGER,

  FOREIGN KEY (fingerprint_id) REFERENCES creative_fingerprints(fingerprint_id)
);

-- Fatigue lifecycle tracking
CREATE TABLE creative_fatigue_lifecycle (
  fingerprint_id TEXT NOT NULL,
  client_id TEXT NOT NULL,

  -- Lifecycle State
  lifecycle_stage TEXT DEFAULT 'fresh',     -- 'fresh' | 'performing' | 'fatiguing' | 'fatigued' | 'retired'
  stage_entered_at TEXT NOT NULL,

  -- Fatigue Prediction
  predicted_fatigue_date TEXT,              -- When we predict fatigue will hit
  fatigue_confidence REAL,                  -- 0-100
  fatigue_reason TEXT,                      -- 'frequency_saturation' | 'hook_decay' | 'audience_exhaustion'

  -- Replacement
  replacement_recommended_at TEXT,
  replacement_creative_id TEXT,             -- Suggested replacement

  PRIMARY KEY (fingerprint_id, client_id),
  FOREIGN KEY (fingerprint_id) REFERENCES creative_fingerprints(fingerprint_id)
);

-- Recommendations tied to creatives
CREATE TABLE creative_recommendations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fingerprint_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  created_at TEXT NOT NULL,

  recommendation_type TEXT NOT NULL,        -- 'pause' | 'scale' | 'refresh' | 'replace' | 'retire'
  reasoning TEXT NOT NULL,
  estimated_impact TEXT,
  urgency TEXT,                             -- 'low' | 'medium' | 'high' | 'critical'

  -- Status
  status TEXT DEFAULT 'open',               -- 'open' | 'executed' | 'ignored' | 'superseded'
  executed_at TEXT,
  outcome TEXT,                             -- What actually happened

  FOREIGN KEY (fingerprint_id) REFERENCES creative_fingerprints(fingerprint_id)
);

-- Indexes for efficient retrieval
CREATE INDEX idx_fingerprints_status ON creative_fingerprints(analysis_status);
CREATE INDEX idx_id_mappings_fingerprint ON creative_id_mappings(fingerprint_id);
CREATE INDEX idx_id_mappings_client ON creative_id_mappings(client_id);
CREATE INDEX idx_performance_fingerprint_period ON creative_performance_history(fingerprint_id, period_start);
CREATE INDEX idx_fatigue_client_stage ON creative_fatigue_lifecycle(client_id, lifecycle_stage);
CREATE INDEX idx_recommendations_status ON creative_recommendations(status, client_id);
```

---

## PART 3: CREATIVE CHANGE DETECTION

### When Re-Analysis IS Needed

| Trigger | Detection Method | Action |
|---------|-----------------|--------|
| New creative launched | `fingerprint_id` not in registry | Full analysis |
| Creative content modified | New `content_hash` for same `external_id` | Full re-analysis, version++  |
| New variation uploaded | Similar `perceptual_hash` but different `content_hash` | Delta analysis |
| Major performance shift | ROAS drops >30% in 7 days | Strategic re-analysis only |
| Entering fatigue stage | `frequency > 3.5` + `ctr_trend = declining` | Update lifecycle stage |
| New audience reacting | Comment sentiment shift >0.3 | Trust re-analysis only |

### When Re-Analysis IS NOT Needed

| Scenario | Why Skip |
|----------|----------|
| Same creative, different ad_id | Already analyzed via fingerprint |
| Daily watchdog runs | Retrieve cached analysis |
| Multiple agents requesting same creative | Dedupe via coordinator |
| Performance metrics update | Update performance_history, not visual analysis |
| Name/copy change only | Visual analysis unchanged |

### Fingerprinting Algorithm

```typescript
// creative-fingerprint.ts

import crypto from 'crypto';

export interface CreativeFingerprint {
  fingerprintId: string;
  contentType: 'video' | 'image' | 'carousel';
  contentHash: string;       // MD5 of raw bytes
  perceptualHash?: string;   // pHash for visual similarity
  durationMs?: number;
  frameCount?: number;
  fileSizeBytes: number;
}

export async function fingerprintCreative(
  contentUrl: string,
  contentType: 'video' | 'image'
): Promise<CreativeFingerprint> {
  // 1. Download content
  const response = await fetch(contentUrl);
  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  // 2. Compute content hash (exact match)
  const contentHash = crypto.createHash('md5').update(bytes).digest('hex');

  // 3. Compute perceptual hash (visual similarity)
  let perceptualHash: string | undefined;
  if (contentType === 'video') {
    // Extract keyframes, compute pHash of each, concatenate
    perceptualHash = await computeVideoPerceptualHash(bytes);
  } else {
    // Compute pHash of image
    perceptualHash = await computeImagePerceptualHash(bytes);
  }

  // 4. Generate fingerprint ID (combination of hashes)
  const fingerprintId = crypto
    .createHash('sha256')
    .update(`${contentHash}:${perceptualHash || ''}`)
    .digest('hex')
    .substring(0, 32);

  return {
    fingerprintId,
    contentType,
    contentHash,
    perceptualHash,
    fileSizeBytes: bytes.length,
    // durationMs and frameCount extracted during download
  };
}

// Detect if creative is "similar enough" to skip re-analysis
export function isSimilarCreative(
  existing: CreativeFingerprint,
  candidate: CreativeFingerprint
): { similar: boolean; reason: string } {
  // Exact match
  if (existing.contentHash === candidate.contentHash) {
    return { similar: true, reason: 'exact_content_match' };
  }

  // Perceptual similarity (Hamming distance < threshold)
  if (existing.perceptualHash && candidate.perceptualHash) {
    const distance = hammingDistance(existing.perceptualHash, candidate.perceptualHash);
    if (distance < 5) { // Very similar
      return { similar: true, reason: 'perceptual_match' };
    }
    if (distance < 10) { // Minor variation
      return { similar: true, reason: 'minor_variation' };
    }
  }

  return { similar: false, reason: 'different_content' };
}
```

---

## PART 4: ANALYSIS COORDINATOR

### The Deduplication Layer

```typescript
// analysis-coordinator.ts

import { getDb } from '../db/index.js';
import { fingerprintCreative } from './creative-fingerprint.js';
import { analyzeVideoWithGemini } from './visual-analyzer.js';

// In-flight analysis tracking (prevents duplicate concurrent requests)
const analysisInFlight = new Map<string, Promise<VisualAnalysis>>();

export async function getOrAnalyzeCreative(
  externalId: string,
  platform: 'meta' | 'tiktok',
  contentUrl: string,
  contentType: 'video' | 'image',
  clientId: string
): Promise<VisualAnalysis> {
  const db = getDb();

  // 1. Compute fingerprint
  const fingerprint = await fingerprintCreative(contentUrl, contentType);

  // 2. Check if fingerprint exists
  const existing = db.prepare(`
    SELECT * FROM creative_fingerprints WHERE fingerprint_id = ?
  `).get(fingerprint.fingerprintId);

  if (existing && existing.analysis_status === 'complete') {
    // 3a. Fingerprint exists, map external ID and return cached analysis
    ensureIdMapping(db, externalId, platform, fingerprint.fingerprintId, clientId);
    return getCachedAnalysis(db, fingerprint.fingerprintId);
  }

  // 3b. Check if analysis is already in-flight (prevent duplicate concurrent requests)
  if (analysisInFlight.has(fingerprint.fingerprintId)) {
    // Wait for existing analysis to complete
    return analysisInFlight.get(fingerprint.fingerprintId)!;
  }

  // 4. Start new analysis (and track in-flight)
  const analysisPromise = runAnalysis(db, fingerprint, contentUrl, contentType, clientId);
  analysisInFlight.set(fingerprint.fingerprintId, analysisPromise);

  try {
    const result = await analysisPromise;
    ensureIdMapping(db, externalId, platform, fingerprint.fingerprintId, clientId);
    return result;
  } finally {
    analysisInFlight.delete(fingerprint.fingerprintId);
  }
}

async function runAnalysis(
  db: Database,
  fingerprint: CreativeFingerprint,
  contentUrl: string,
  contentType: 'video' | 'image',
  clientId: string
): Promise<VisualAnalysis> {
  // Mark as analyzing
  db.prepare(`
    INSERT INTO creative_fingerprints (fingerprint_id, content_type, content_hash, perceptual_hash,
      file_size_bytes, first_seen_at, last_seen_at, analysis_status)
    VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'), 'analyzing')
    ON CONFLICT(fingerprint_id) DO UPDATE SET analysis_status = 'analyzing', last_seen_at = datetime('now')
  `).run(
    fingerprint.fingerprintId,
    fingerprint.contentType,
    fingerprint.contentHash,
    fingerprint.perceptualHash,
    fingerprint.fileSizeBytes
  );

  try {
    // Run actual analysis (expensive Gemini call)
    const videoDna = await analyzeVideoWithGemini(contentUrl, contentType);

    // Store visual analysis
    db.prepare(`
      INSERT INTO creative_visual_analysis (fingerprint_id, analyzed_at, analyzer_version,
        hook_type, hook_duration_ms, hook_strength_score, hook_transcript,
        visual_style, typography_style, layout_structure, video_dna)
      VALUES (?, datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      fingerprint.fingerprintId,
      'gemini-2.5-flash-v1',
      videoDna.hooks?.[0]?.category,
      videoDna.hooks?.[0]?.hook_duration_seconds ? videoDna.hooks[0].hook_duration_seconds * 1000 : null,
      videoDna.hooks?.[0]?.confidence,
      videoDna.hooks?.[0]?.transcript,
      JSON.stringify(videoDna.visual_style),
      JSON.stringify(videoDna.text_overlay),
      JSON.stringify(videoDna.editing_style),
      JSON.stringify(videoDna)
    );

    // Mark as complete
    db.prepare(`
      UPDATE creative_fingerprints SET analysis_status = 'complete' WHERE fingerprint_id = ?
    `).run(fingerprint.fingerprintId);

    return {
      fingerprintId: fingerprint.fingerprintId,
      videoDna,
      analyzedAt: new Date().toISOString(),
    };
  } catch (error) {
    // Mark as failed
    db.prepare(`
      UPDATE creative_fingerprints SET analysis_status = 'failed' WHERE fingerprint_id = ?
    `).run(fingerprint.fingerprintId);
    throw error;
  }
}

function ensureIdMapping(db: Database, externalId: string, platform: string, fingerprintId: string, clientId: string) {
  db.prepare(`
    INSERT INTO creative_id_mappings (external_id, platform, fingerprint_id, client_id, first_mapped_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(external_id, platform) DO UPDATE SET fingerprint_id = ?, client_id = ?
  `).run(externalId, platform, fingerprintId, clientId, fingerprintId, clientId);
}

function getCachedAnalysis(db: Database, fingerprintId: string): VisualAnalysis {
  const analysis = db.prepare(`
    SELECT * FROM creative_visual_analysis WHERE fingerprint_id = ?
  `).get(fingerprintId);

  return {
    fingerprintId,
    videoDna: JSON.parse(analysis.video_dna),
    analyzedAt: analysis.analyzed_at,
  };
}
```

---

## PART 5: WATCHDOG VISUAL ANALYSIS PIPELINE

### Operational Flow

```
┌────────────────────────────────────────────────────────────────────────────┐
│                      WATCHDOG VISUAL ANALYSIS PIPELINE                      │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. DETECT CREATIVES                                                        │
│     ├─ Query Meta API for active ads                                       │
│     ├─ Extract: ad_id, creative_id, thumbnail_url, video_url               │
│     └─ Filter: only ads with spend > threshold                             │
│                                                                             │
│  2. FINGERPRINT EACH CREATIVE                                              │
│     ├─ Download content (max 100MB)                                        │
│     ├─ Compute content_hash (MD5)                                          │
│     ├─ Compute perceptual_hash (pHash)                                     │
│     └─ Generate fingerprint_id                                             │
│                                                                             │
│  3. CHECK ANALYSIS CACHE                                                    │
│     ├─ Lookup: creative_fingerprints[fingerprint_id]                       │
│     ├─ IF complete → RETRIEVE (skip analysis)                              │
│     ├─ IF analyzing → WAIT (in-flight dedup)                               │
│     └─ IF missing → ANALYZE (new creative)                                 │
│                                                                             │
│  4. ANALYZE NEW CREATIVES ONLY                                             │
│     ├─ Upload to Gemini File API                                           │
│     ├─ Extract VideoDNA (100+ patterns)                                    │
│     ├─ Store in creative_visual_analysis                                   │
│     └─ Map external_id → fingerprint_id                                    │
│                                                                             │
│  5. RETRIEVE STRATEGIC ANALYSIS                                             │
│     ├─ Lookup: creative_strategic_analysis[fingerprint_id, client_id]      │
│     ├─ Lookup: creative_fatigue_lifecycle[fingerprint_id, client_id]       │
│     ├─ Lookup: creative_performance_history (last 30 days)                 │
│     └─ Assemble: CreativeIntelligence object                               │
│                                                                             │
│  6. UPDATE PERFORMANCE METRICS                                              │
│     ├─ Insert new row in creative_performance_history                      │
│     ├─ Compute fatigue_score from trends                                   │
│     ├─ Update lifecycle_stage if threshold crossed                         │
│     └─ Create recommendations if needed                                    │
│                                                                             │
│  7. RETURN INTELLIGENCE                                                     │
│     ├─ Visual analysis (from cache)                                        │
│     ├─ Strategic analysis (from cache)                                     │
│     ├─ Performance history (fresh)                                         │
│     ├─ Fatigue status (computed)                                           │
│     └─ Recommendations (if any)                                            │
│                                                                             │
└────────────────────────────────────────────────────────────────────────────┘
```

### Integration with ad-watchdog.ts

```typescript
// In ad-watchdog.ts

import { getOrAnalyzeCreative } from './analysis-coordinator.js';
import { getCreativeIntelligence, updateCreativePerformance } from './creative-intelligence.js';

async function analyzeCreativesForWatchdog(
  ads: AdForAnalysis[],
  clientId: string
): Promise<CreativeIntelligence[]> {
  const results: CreativeIntelligence[] = [];

  for (const ad of ads) {
    // 1. Get or analyze visual (cached if exists)
    const visualAnalysis = await getOrAnalyzeCreative(
      ad.id,
      'meta',
      ad.videoUrl || ad.thumbnailUrl,
      ad.videoUrl ? 'video' : 'image',
      clientId
    );

    // 2. Get strategic intelligence (always from cache)
    const intelligence = await getCreativeIntelligence(
      visualAnalysis.fingerprintId,
      clientId
    );

    // 3. Update performance metrics (always fresh)
    await updateCreativePerformance(
      visualAnalysis.fingerprintId,
      clientId,
      {
        spend: ad.insights.spend,
        impressions: ad.insights.impressions,
        clicks: ad.insights.clicks,
        conversions: ad.insights.conversions,
        roas: ad.insights.roas,
        ctr: ad.insights.ctr,
      }
    );

    results.push({
      adId: ad.id,
      adName: ad.name,
      fingerprintId: visualAnalysis.fingerprintId,
      visualAnalysis: visualAnalysis.videoDna,
      strategicAnalysis: intelligence.strategic,
      fatigueStatus: intelligence.fatigue,
      performanceHistory: intelligence.performance,
      recommendations: intelligence.recommendations,
    });
  }

  return results;
}
```

---

## PART 6: CLIENT-FACING VISUAL OUTPUTS

### What Founders Actually See

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     CREATIVE INTELLIGENCE REPORT                             │
│                     Pratapsons — Week of May 12, 2026                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  🚨 FATIGUE ALERT: "DSG_TOF_CATALOG_IND_CBO"                          │  │
│  │                                                                        │  │
│  │  [CREATIVE THUMBNAIL]  │  Status: FATIGUING                          │  │
│  │  ┌──────────────────┐  │  Frequency: 4.2x (was 2.8x last week)       │  │
│  │  │                  │  │  CTR Trend: ↓ 23% in 7 days                 │  │
│  │  │  [Video Frame]   │  │  ROAS: 2.1x → 1.4x                          │  │
│  │  │                  │  │                                              │  │
│  │  └──────────────────┘  │  Hook: "Transformation" (exhausted)         │  │
│  │                        │  Emotion: "Aspiration" (overused)            │  │
│  │                                                                        │  │
│  │  WHY: Your 35-44 audience has seen this 4.2x. The aspirational       │  │
│  │  "dream wardrobe" hook is now background noise. CTR cliff incoming.  │  │
│  │                                                                        │  │
│  │  DO THIS TOMORROW:                                                    │  │
│  │  1. Reduce budget 50% on this ad set (save ₹12,700/week)            │  │
│  │  2. Launch replacement with "Founder Story" hook (see below)         │  │
│  │                                                                        │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  📈 SCALE OPPORTUNITY: "WINTER_COLLECTION_UGC_01"                    │  │
│  │                                                                        │  │
│  │  [CREATIVE THUMBNAIL]  │  Status: PERFORMING                         │  │
│  │  ┌──────────────────┐  │  Frequency: 1.8x (healthy)                  │  │
│  │  │                  │  │  CTR Trend: ↑ 12% in 7 days                 │  │
│  │  │  [Video Frame]   │  │  ROAS: 3.8x (above account avg 2.9x)        │  │
│  │  │                  │  │                                              │  │
│  │  └──────────────────┘  │  Hook: "Social Proof" (fresh)               │  │
│  │                        │  Emotion: "Trust" (underutilized)            │  │
│  │                                                                        │  │
│  │  WHY: UGC format with trust signals outperforming catalog ads 2.7x.  │  │
│  │  Only 35% of budget allocated to UGC. Room to scale.                 │  │
│  │                                                                        │  │
│  │  DO THIS TOMORROW:                                                    │  │
│  │  1. Increase budget 25% (potential +₹18,000 revenue/week)           │  │
│  │  2. Create 2 more UGC variations (script templates below)            │  │
│  │                                                                        │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  FATIGUE EVOLUTION (Last 4 Weeks)                                     │  │
│  │                                                                        │  │
│  │  Ad Name                    W1    W2    W3    W4    Status           │  │
│  │  ───────────────────────────────────────────────────────────────────  │  │
│  │  DSG_TOF_CATALOG_IND_CBO   ░░░░  ░░▓▓  ▓▓▓▓  ████  FATIGUING        │  │
│  │  WINTER_COLLECTION_UGC_01  ░░░░  ░░░░  ░░░░  ░░░░  FRESH            │  │
│  │  FOUNDER_STORY_V2          ░░░░  ░░░░  ░░▓▓  ░░▓▓  PERFORMING       │  │
│  │  CAROUSEL_BEST_SELLERS     ░░▓▓  ▓▓▓▓  ████  ████  FATIGUED         │  │
│  │                                                                        │  │
│  │  Legend: ░░░░ Fresh  ░░▓▓ Performing  ▓▓▓▓ Fatiguing  ████ Fatigued  │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  PERSUASION SYSTEM EVOLUTION                                          │  │
│  │                                                                        │  │
│  │  Strategy         Last Week    This Week    Trend    Action          │  │
│  │  ─────────────────────────────────────────────────────────────────── │  │
│  │  Aspiration       45% budget   42% budget   ↓        Reduce further  │  │
│  │  Social Proof     15% budget   20% budget   ↑        Scale more      │  │
│  │  Urgency/Scarcity 25% budget   23% budget   →        Hold            │  │
│  │  Trust/Authority  15% budget   15% budget   →        Underutilized!  │  │
│  │                                                                        │  │
│  │  INSIGHT: You're over-indexed on Aspiration (45%) while Trust (15%)  │  │
│  │  outperforms by 1.8x ROAS. Rebalance toward Trust-heavy creatives.   │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  REPLACEMENT RECOMMENDATIONS                                          │  │
│  │                                                                        │  │
│  │  For "DSG_TOF_CATALOG_IND_CBO" (fatiguing):                          │  │
│  │                                                                        │  │
│  │  OPTION A: Founder Story Hook                                         │  │
│  │  ┌──────────────────────────────────────────────────────────────────┐│  │
│  │  │ Hook: "Why I started Pratapsons..."                              ││  │
│  │  │ Emotion: Trust + Authenticity                                    ││  │
│  │  │ Format: Vertical video, 15-30s                                   ││  │
│  │  │ Predicted ROAS: 2.8x-3.4x (based on category patterns)           ││  │
│  │  │ [GENERATE SCRIPT] [GENERATE STORYBOARD]                          ││  │
│  │  └──────────────────────────────────────────────────────────────────┘│  │
│  │                                                                        │  │
│  │  OPTION B: UGC Testimonial                                            │  │
│  │  ┌──────────────────────────────────────────────────────────────────┐│  │
│  │  │ Hook: Customer unboxing + first impression                       ││  │
│  │  │ Emotion: Social Proof + Anticipation                             ││  │
│  │  │ Format: Vertical video, 20-45s                                   ││  │
│  │  │ Predicted ROAS: 3.0x-3.6x (UGC outperforming for you)            ││  │
│  │  │ [GENERATE BRIEF] [FIND CREATORS]                                 ││  │
│  │  └──────────────────────────────────────────────────────────────────┘│  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### HTML Report Generation

```typescript
// creative-intelligence-report.ts

export function generateCreativeIntelligenceHTML(
  clientId: string,
  creatives: CreativeIntelligence[],
  weekOf: string
): string {
  const fatiguing = creatives.filter(c => c.fatigueStatus.stage === 'fatiguing');
  const scaling = creatives.filter(c =>
    c.fatigueStatus.stage === 'performing' &&
    c.performanceHistory[0]?.roas > 3.0
  );

  return `
<!DOCTYPE html>
<html>
<head>
  <title>Creative Intelligence Report — ${clientId}</title>
  <style>
    /* Premium report styling */
    body { font-family: 'Inter', sans-serif; background: #0a0a0a; color: #e5e5e5; }
    .card { background: #1a1a1a; border-radius: 12px; padding: 24px; margin: 16px 0; }
    .alert { border-left: 4px solid #ef4444; }
    .opportunity { border-left: 4px solid #22c55e; }
    .thumbnail { width: 120px; height: 120px; object-fit: cover; border-radius: 8px; }
    .fatigue-bar { height: 8px; border-radius: 4px; }
    .fresh { background: #22c55e; }
    .performing { background: #eab308; }
    .fatiguing { background: #f97316; }
    .fatigued { background: #ef4444; }
    .action-button { background: #3b82f6; color: white; padding: 8px 16px; border-radius: 6px; }
  </style>
</head>
<body>
  <h1>Creative Intelligence Report</h1>
  <p>Week of ${weekOf}</p>

  ${fatiguing.map(c => generateFatigueAlertCard(c)).join('')}
  ${scaling.map(c => generateScaleOpportunityCard(c)).join('')}

  ${generateFatigueEvolutionTable(creatives)}
  ${generatePersuasionSystemChart(creatives)}
  ${generateReplacementRecommendations(fatiguing)}
</body>
</html>
  `;
}
```

---

## PART 7: WEEK-TO-WEEK CREATIVE CONTINUITY

### What The System Tracks

```typescript
interface WeeklyCreativeSnapshot {
  weekOf: string;

  // Portfolio State
  totalCreatives: number;
  activeCreatives: number;
  newCreativesLaunched: number;
  creativesRetired: number;

  // Lifecycle Distribution
  freshCount: number;
  performingCount: number;
  fatiguingCount: number;
  fatiguedCount: number;

  // Persuasion Mix
  persuasionDistribution: {
    aspiration: number;      // % of budget
    socialProof: number;
    urgency: number;
    trust: number;
    curiosity: number;
    fear: number;
  };

  // Hook Mix
  hookDistribution: {
    transformation: number;
    curiosity: number;
    socialProof: number;
    founderStory: number;
    ugc: number;
    productDemo: number;
  };

  // Performance by Strategy
  roasByPersuasion: Record<string, number>;
  roasByHook: Record<string, number>;

  // Recommendations Made
  recommendationsMade: number;
  recommendationsExecuted: number;
  recommendationsIgnored: number;

  // Learning
  successfulPatterns: string[];    // What worked this week
  failedPatterns: string[];        // What didn't work
}
```

### Continuity Report

```
Week 1 → Week 2 Changes:

CREATIVE PORTFOLIO:
- Last week: 24 active creatives
- This week: 27 active creatives (+3 new, -0 retired)
- New launches matched 2/3 recommendations (67% execution rate)

FATIGUE EVOLUTION:
- "DSG_TOF_CATALOG_IND_CBO": Performing → Fatiguing (predicted last week)
- "WINTER_COLLECTION_UGC_01": Fresh → Performing (scaling opportunity confirmed)
- "CAROUSEL_BEST_SELLERS": Fatiguing → Fatigued (should have been paused Week 1)

PERSUASION SHIFT:
- Aspiration: 52% → 45% (-7%) — Good, following recommendation
- Trust: 12% → 15% (+3%) — More needed, underperforming potential
- Social Proof: 18% → 25% (+7%) — Excellent, this is working

PREDICTION ACCURACY:
- Last week predicted 3 creatives would fatigue: 2/3 correct (67%)
- Last week predicted UGC would scale: Confirmed (+35% ROAS)
- Updated confidence: Fatigue predictions now at 72% accuracy

LEARNINGS STORED:
- "UGC with trust signals outperforms catalog by 1.8x for this brand"
- "Aspiration hooks fatigue after 4.5 frequency for 35-44 demographic"
- "Founder-face content extends creative lifespan by 40%"
```

---

## PART 8: TOKEN-EFFICIENT ARCHITECTURE

### Before (Current Waste)

```
Agent Run #1: Watchdog
  → Download video, upload to Gemini, analyze → 2000 tokens

Agent Run #2: Creative Scorer (same creative)
  → Download video, upload to Gemini, analyze → 2000 tokens (DUPLICATE)

Agent Run #3: Fatigue Detector (same creative)
  → Download video, upload to Gemini, analyze → 2000 tokens (DUPLICATE)

Total: 6000 tokens for 1 creative
```

### After (With Coordinator)

```
Agent Run #1: Watchdog
  → Fingerprint creative
  → Check cache: MISS
  → Download, upload, analyze → 2000 tokens
  → Store in creative_visual_analysis

Agent Run #2: Creative Scorer (same creative)
  → Fingerprint creative
  → Check cache: HIT
  → Return cached analysis → 0 tokens

Agent Run #3: Fatigue Detector (same creative)
  → Fingerprint creative
  → Check cache: HIT
  → Return cached analysis → 0 tokens

Total: 2000 tokens for 1 creative (67% reduction)
```

### Token Savings Estimate

| Scenario | Before | After | Savings |
|----------|--------|-------|---------|
| Same creative analyzed 3x/week | 6000 tokens | 2000 tokens | 67% |
| 50 active creatives | 300k tokens/week | 100k tokens/week | 200k tokens |
| Monthly | 1.2M tokens | 400k tokens | 800k tokens |
| Cost @ $1.50/1M | $1.80/month | $0.60/month | $1.20/month |

Plus: In-memory cache persistence saves 25k-200k tokens per restart.

---

## PART 9: IMPLEMENTATION PRIORITY

### Phase 1: Content-Based Deduplication (Week 1)

**Files to create:**
- `creative-fingerprint.ts` — Fingerprinting algorithm
- `analysis-coordinator.ts` — Deduplication layer

**Files to modify:**
- `visual-analyzer.ts` — Use coordinator instead of direct analysis
- `ad-watchdog.ts` — Use coordinator for creative analysis

**Database changes:**
- Add `creative_fingerprints` table
- Add `creative_id_mappings` table
- Migrate existing `dna_cache` to new schema

**Expected impact:** 50-67% token reduction immediately.

### Phase 2: Strategic Analysis Persistence (Week 2)

**Files to create:**
- `creative-intelligence.ts` — Strategic analysis storage/retrieval
- `creative-lifecycle.ts` — Fatigue lifecycle management

**Database changes:**
- Add `creative_strategic_analysis` table
- Add `creative_fatigue_lifecycle` table
- Add `creative_performance_history` table

**Expected impact:** Week-to-week continuity established.

### Phase 3: Client-Facing Reports (Week 3)

**Files to create:**
- `creative-intelligence-report.ts` — HTML report generation
- Templates for visual outputs

**Expected impact:** Founder-grade visual intelligence.

### Phase 4: In-Memory Cache Persistence (Week 4)

**Files to modify:**
- All 8 services with in-memory Maps
- Add SQLite persistence with TTL

**Expected impact:** Eliminate restart waste.

---

## PART 10: FINAL GOAL

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  PERSISTENT VISUAL CREATIVE INTELLIGENCE SYSTEM                             │
│                                                                              │
│  Where:                                                                      │
│  • Every creative develops strategic memory                                  │
│  • Analysis compounds over time                                              │
│  • Agents reuse intelligence efficiently                                     │
│  • Token waste reduces by 67%+                                               │
│  • New creatives are automatically detected                                  │
│  • Only changed systems are re-analyzed                                      │
│  • Founders receive continuously evolving visual strategic intelligence      │
│                                                                              │
│  The system remembers. The system learns. The system compounds.              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

*This document is the architecture spec. Implementation follows.*
*Violating these patterns reintroduces token waste.*
