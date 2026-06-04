// @cosmisk/types — shared contracts across apps (web ↔ api).
//
// First contract (Phase 6): the intelligence-layer "client card" / insight
// shape — the output the Watchdog produces and the web renders. Typed once
// here so web and api cannot drift. apps/web re-exports these from its
// insight.model; apps/api adopts them when the intelligence seam is activated
// (it needs TS project references first — it sits outside the npm workspace).

/** Visual/semantic priority of an insight card. */
export type InsightPriority = 'alert' | 'positive' | 'pattern' | 'info';

/** The action a founder can take from an insight card. */
export type InsightActionType = 'navigate' | 'scale' | 'pause' | 'reduce' | 'increase';

/** An intelligence "client card" surfaced to the founder. */
export interface AiInsight {
  id: string;
  priority: InsightPriority;
  title: string;
  description: string;
  actionLabel: string;
  actionRoute: string;
  actionType?: InsightActionType;
  actionPayload?: Record<string, any>;
  creativeId?: string;
  createdAt: string;
}
