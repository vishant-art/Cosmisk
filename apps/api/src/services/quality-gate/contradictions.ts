/**
 * Quality Gate — Contradiction detection & resolution
 */

import { CONTRADICTORY_ACTIONS } from './constants.js';
import { checkEvidenceQuality } from './evidence.js';
import type { DecisionInput } from './types.js';

/**
 * Detect contradictions between decisions
 * Returns conflicts that should be surfaced instead of contradictory advice
 */
export function detectContradictions(decisions: DecisionInput[]): {
  hasContradictions: boolean;
  conflicts: Array<{
    decision1: DecisionInput;
    decision2: DecisionInput;
    reason: string;
  }>;
  recommendations: string[];
} {
  const conflicts: Array<{
    decision1: DecisionInput;
    decision2: DecisionInput;
    reason: string;
  }> = [];

  // Group decisions by target (normalize target name)
  const byTarget = new Map<string, DecisionInput[]>();
  for (const decision of decisions) {
    const normalizedTarget = decision.targetName.toLowerCase().trim();
    if (!byTarget.has(normalizedTarget)) {
      byTarget.set(normalizedTarget, []);
    }
    byTarget.get(normalizedTarget)!.push(decision);
  }

  // Check for contradictions within each target
  for (const [target, targetDecisions] of byTarget) {
    if (targetDecisions.length < 2) continue;

    for (let i = 0; i < targetDecisions.length; i++) {
      for (let j = i + 1; j < targetDecisions.length; j++) {
        const d1 = targetDecisions[i];
        const d2 = targetDecisions[j];
        const action1 = d1.suggestedAction.toLowerCase();
        const action2 = d2.suggestedAction.toLowerCase();

        // Check if actions are contradictory
        for (const [group1, group2] of CONTRADICTORY_ACTIONS) {
          const d1InGroup1 = group1.some(a => action1.includes(a));
          const d1InGroup2 = group2.some(a => action1.includes(a));
          const d2InGroup1 = group1.some(a => action2.includes(a));
          const d2InGroup2 = group2.some(a => action2.includes(a));

          if ((d1InGroup1 && d2InGroup2) || (d1InGroup2 && d2InGroup1)) {
            conflicts.push({
              decision1: d1,
              decision2: d2,
              reason: `Contradictory actions on "${target}": "${d1.suggestedAction}" vs "${d2.suggestedAction}"`,
            });
          }
        }
      }
    }
  }

  // Generate recommendations for resolving conflicts
  const recommendations: string[] = [];
  for (const conflict of conflicts) {
    // Compare evidence quality to recommend which to follow
    const ev1Quality = checkEvidenceQuality(conflict.decision1.evidence);
    const ev2Quality = checkEvidenceQuality(conflict.decision2.evidence);

    if (ev1Quality.confidence > ev2Quality.confidence + 0.2) {
      recommendations.push(
        `Conflict on "${conflict.decision1.targetName}": Prefer "${conflict.decision1.suggestedAction}" ` +
        `(confidence ${(ev1Quality.confidence * 100).toFixed(0)}% vs ${(ev2Quality.confidence * 100).toFixed(0)}%)`
      );
    } else if (ev2Quality.confidence > ev1Quality.confidence + 0.2) {
      recommendations.push(
        `Conflict on "${conflict.decision2.targetName}": Prefer "${conflict.decision2.suggestedAction}" ` +
        `(confidence ${(ev2Quality.confidence * 100).toFixed(0)}% vs ${(ev1Quality.confidence * 100).toFixed(0)}%)`
      );
    } else {
      recommendations.push(
        `Conflict on "${conflict.decision1.targetName}": Manual review needed — ` +
        `"${conflict.decision1.suggestedAction}" vs "${conflict.decision2.suggestedAction}" ` +
        `(similar confidence levels)`
      );
    }
  }

  return {
    hasContradictions: conflicts.length > 0,
    conflicts,
    recommendations,
  };
}

/**
 * Resolve contradictions by keeping the higher-confidence decision
 */
export function resolveContradictions(decisions: DecisionInput[]): {
  resolved: DecisionInput[];
  dropped: DecisionInput[];
  conflicts: string[];
} {
  const detection = detectContradictions(decisions);

  if (!detection.hasContradictions) {
    return { resolved: decisions, dropped: [], conflicts: [] };
  }

  const dropped: DecisionInput[] = [];
  const toRemove = new Set<DecisionInput>();

  for (const conflict of detection.conflicts) {
    const ev1 = checkEvidenceQuality(conflict.decision1.evidence);
    const ev2 = checkEvidenceQuality(conflict.decision2.evidence);

    // Keep higher confidence, drop lower
    if (ev1.confidence >= ev2.confidence) {
      toRemove.add(conflict.decision2);
      dropped.push(conflict.decision2);
    } else {
      toRemove.add(conflict.decision1);
      dropped.push(conflict.decision1);
    }
  }

  const resolved = decisions.filter(d => !toRemove.has(d));

  return {
    resolved,
    dropped,
    conflicts: detection.recommendations,
  };
}
