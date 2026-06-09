/**
 * Reality Testing — 4. Operator Behavior Learning
 *
 * Adapts to how operators actually work.
 */

import type { BehaviorEvent, BehaviorEventType, OperatorProfile } from './types.js';
import { behaviorStore, profileStore } from './stores.js';

/**
 * Track a behavior event
 */
export function trackBehavior(
  clientId: string,
  operatorId: string,
  eventType: BehaviorEventType,
  context: string,
  options?: {
    itemId?: string;
    itemType?: string;
    action?: string;
    duration?: number;
    metadata?: Record<string, unknown>;
  }
): BehaviorEvent {
  const event: BehaviorEvent = {
    id: `bev_${Date.now()}`,
    clientId,
    operatorId,
    timestamp: new Date().toISOString(),
    eventType,
    context,
    ...options,
  };

  const key = `${clientId}:${operatorId}`;
  const existing = behaviorStore.get(key) || [];
  existing.push(event);
  behaviorStore.set(key, existing);

  // Keep only last 1000 events
  if (existing.length > 1000) {
    behaviorStore.set(key, existing.slice(-1000));
  }

  return event;
}

/**
 * Build/update operator profile
 */
export function updateOperatorProfile(
  clientId: string,
  operatorId: string
): OperatorProfile {
  const key = `${clientId}:${operatorId}`;
  const events = behaviorStore.get(key) || [];

  // Get existing profile or create new
  let profile = profileStore.get(key);
  if (!profile) {
    profile = createDefaultProfile(operatorId, clientId);
  }

  // Update based on recent behavior
  const recentEvents = events.filter(e => {
    const age = Date.now() - new Date(e.timestamp).getTime();
    return age < 30 * 24 * 60 * 60 * 1000;  // Last 30 days
  });

  if (recentEvents.length === 0) {
    return profile;
  }

  // Calculate preferred times
  const hourCounts = new Map<number, number>();
  for (const e of recentEvents) {
    const hour = new Date(e.timestamp).getHours();
    hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
  }
  const topHours = Array.from(hourCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([h]) => `${h}:00`);
  profile.preferredTimes = topHours;

  // Calculate action rate
  const viewEvents = recentEvents.filter(e => e.eventType === 'view_insight');
  const actionEvents = recentEvents.filter(e => e.eventType === 'act_on_insight');
  profile.actionRate = viewEvents.length > 0
    ? Math.round((actionEvents.length / viewEvents.length) * 100)
    : 0;

  // Determine detail preference
  const expandEvents = recentEvents.filter(e => e.eventType === 'expand_detail').length;
  const collapseEvents = recentEvents.filter(e => e.eventType === 'collapse_detail').length;
  if (expandEvents > collapseEvents * 2) {
    profile.preferredDetailLevel = 'detailed';
    profile.wantsMoreDetail = true;
  } else if (collapseEvents > expandEvents * 2) {
    profile.preferredDetailLevel = 'tldr';
    profile.shouldSimplify = true;
  } else {
    profile.preferredDetailLevel = 'summary';
  }

  // Identify ignored insight types
  const dismissed = recentEvents.filter(e => e.eventType === 'dismiss_insight' || e.eventType === 'ignore_insight');
  const ignoredTypes = new Map<string, number>();
  for (const d of dismissed) {
    if (d.itemType) {
      ignoredTypes.set(d.itemType, (ignoredTypes.get(d.itemType) || 0) + 1);
    }
  }
  profile.ignoredInsightTypes = Array.from(ignoredTypes.entries())
    .filter(([_, count]) => count >= 3)
    .map(([type]) => type);

  // Identify preferred insight types
  const actedOn = recentEvents.filter(e => e.eventType === 'act_on_insight');
  const preferredTypes = new Map<string, number>();
  for (const a of actedOn) {
    if (a.itemType) {
      preferredTypes.set(a.itemType, (preferredTypes.get(a.itemType) || 0) + 1);
    }
  }
  profile.preferredInsightTypes = Array.from(preferredTypes.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([type]) => type);

  // Determine trust level
  const feedbackEvents = recentEvents.filter(e => e.eventType === 'rate_insight');
  profile.feedbackRate = viewEvents.length > 0
    ? Math.round((feedbackEvents.length / viewEvents.length) * 100)
    : 0;

  if (profile.actionRate > 40 && profile.feedbackRate > 20) {
    profile.trustLevel = 'high';
  } else if (profile.actionRate > 20) {
    profile.trustLevel = 'growing';
  } else {
    profile.trustLevel = 'skeptical';
  }

  // Urgency threshold based on what they act on
  const urgentActions = actedOn.filter(e =>
    e.metadata && (e.metadata['urgency'] === 'critical' || e.metadata['urgency'] === 'high')
  );
  if (urgentActions.length > actedOn.length * 0.8) {
    profile.urgencyThreshold = 'critical_only';
  } else if (urgentActions.length > actedOn.length * 0.5) {
    profile.urgencyThreshold = 'high_only';
  } else {
    profile.urgencyThreshold = 'all';
  }

  profile.lastUpdated = new Date().toISOString();
  profileStore.set(key, profile);

  return profile;
}

/**
 * Create default operator profile
 */
function createDefaultProfile(operatorId: string, clientId: string): OperatorProfile {
  return {
    operatorId,
    clientId,
    lastUpdated: new Date().toISOString(),
    preferredTimes: [],
    avgSessionDuration: 0,
    sessionsPerWeek: 0,
    preferredInsightTypes: [],
    ignoredInsightTypes: [],
    preferredDetailLevel: 'summary',
    urgencyThreshold: 'all',
    avgDecisionTime: 0,
    actionRate: 0,
    feedbackRate: 0,
    learningVelocity: 'moderate',
    trustLevel: 'growing',
    shouldSimplify: false,
    wantsMoreDetail: false,
    prefersVisual: false,
    needsUrgency: false,
  };
}

/**
 * Get personalization recommendations for an operator
 */
export function getPersonalizationRecommendations(
  profile: OperatorProfile
): string[] {
  const recommendations: string[] = [];

  if (profile.shouldSimplify) {
    recommendations.push('Show TL;DR by default, hide details');
  }

  if (profile.wantsMoreDetail) {
    recommendations.push('Show detailed view by default');
  }

  if (profile.ignoredInsightTypes.length > 0) {
    recommendations.push(`Deprioritize: ${profile.ignoredInsightTypes.join(', ')}`);
  }

  if (profile.preferredInsightTypes.length > 0) {
    recommendations.push(`Prioritize: ${profile.preferredInsightTypes.join(', ')}`);
  }

  if (profile.urgencyThreshold === 'critical_only') {
    recommendations.push('Only show critical urgency items');
  }

  if (profile.trustLevel === 'skeptical') {
    recommendations.push('Include more evidence and reasoning');
  }

  if (profile.preferredTimes.length > 0) {
    recommendations.push(`Best delivery times: ${profile.preferredTimes.join(', ')}`);
  }

  return recommendations;
}
