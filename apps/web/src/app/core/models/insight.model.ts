// Intelligence "client card" contract now lives in @cosmisk/types (the shared
// web↔api package) and is re-exported here so existing `./insight.model`
// imports keep resolving unchanged.
export type { InsightPriority, InsightActionType, AiInsight } from '@cosmisk/types';
