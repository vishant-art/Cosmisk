/**
 * Quality Gate — Evidence validation & claim verification
 */

import type { ConfidenceFactors, Evidence } from './types.js';

/**
 * Check evidence quality — is the recommendation backed by verifiable data?
 */
export function checkEvidenceQuality(evidence?: Evidence[]): {
  quality: 'strong' | 'moderate' | 'weak' | 'none';
  score: number;
  issues: string[];
  confidence: number;
  factors: ConfidenceFactors;
} {
  if (!evidence || evidence.length === 0) {
    return {
      quality: 'none',
      score: 0,
      issues: ['No evidence provided — recommendation cannot be verified'],
      confidence: 0.2,
      factors: { dataFreshness: 0, signalStrength: 0, corroboratingSignals: 0 },
    };
  }

  const issues: string[] = [];
  let totalFreshness = 0;
  let totalStrength = 0;

  for (const e of evidence) {
    // Check data freshness (within 24h = fresh, 7d = stale)
    const ageHours = (Date.now() - new Date(e.timestamp).getTime()) / (1000 * 60 * 60);
    if (ageHours > 168) { // > 7 days
      issues.push(`Stale evidence: ${e.metric} is ${Math.round(ageHours / 24)} days old`);
      totalFreshness += 0.3;
    } else if (ageHours > 24) {
      totalFreshness += 0.7;
    } else {
      totalFreshness += 1.0;
    }

    // Check signal strength (significant change vs noise)
    if (e.changePercent !== undefined) {
      const absChange = Math.abs(e.changePercent);
      if (absChange < 5) {
        issues.push(`Weak signal: ${e.metric} change of ${e.changePercent}% may be noise`);
        totalStrength += 0.3;
      } else if (absChange < 15) {
        totalStrength += 0.6;
      } else if (absChange < 30) {
        totalStrength += 0.8;
      } else {
        totalStrength += 1.0;
      }
    } else {
      totalStrength += 0.5; // Unknown strength
    }

    // Check for required fields
    if (!e.source) {
      issues.push(`Missing source for ${e.metric} evidence`);
    }
    if (!e.timestamp) {
      issues.push(`Missing timestamp for ${e.metric} evidence`);
    }
  }

  const avgFreshness = totalFreshness / evidence.length;
  const avgStrength = totalStrength / evidence.length;
  const corroboratingSignals = Math.min(evidence.length / 3, 1); // 3+ signals = 100%

  // Calculate overall confidence
  const confidence = (avgFreshness * 0.3) + (avgStrength * 0.4) + (corroboratingSignals * 0.3);

  // Determine quality tier
  let quality: 'strong' | 'moderate' | 'weak' | 'none';
  let score: number;

  if (evidence.length >= 2 && confidence >= 0.7 && issues.length === 0) {
    quality = 'strong';
    score = 90 + (confidence * 10);
  } else if (evidence.length >= 1 && confidence >= 0.5) {
    quality = 'moderate';
    score = 60 + (confidence * 30);
  } else if (evidence.length >= 1) {
    quality = 'weak';
    score = 30 + (confidence * 30);
  } else {
    quality = 'none';
    score = 10;
  }

  return {
    quality,
    score,
    issues,
    confidence,
    factors: {
      dataFreshness: avgFreshness,
      signalStrength: avgStrength,
      corroboratingSignals,
    },
  };
}

/**
 * Extract numeric claims from text for verification
 * e.g., "CTR dropped 40%" -> { metric: 'CTR', claim: 'dropped', value: 40, unit: '%' }
 */
export function extractNumericClaims(text: string): Array<{
  metric: string;
  claim: 'dropped' | 'increased' | 'is' | 'was';
  value: number;
  unit: string;
  originalText: string;
}> {
  const claims: Array<{
    metric: string;
    claim: 'dropped' | 'increased' | 'is' | 'was';
    value: number;
    unit: string;
    originalText: string;
  }> = [];

  // Pattern: "METRIC dropped/increased/is X%/X"
  const patterns = [
    /(\w+)\s+(dropped|decreased|declined|fell)\s+(?:by\s+)?(\d+(?:\.\d+)?)\s*(%|percent|x|times)?/gi,
    /(\w+)\s+(increased|rose|grew|spiked)\s+(?:by\s+)?(\d+(?:\.\d+)?)\s*(%|percent|x|times)?/gi,
    /(\w+)\s+(?:is|was)\s+(\d+(?:\.\d+)?)\s*(%|percent|x|₹|\$)/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const metric = match[1].toUpperCase();
      const claimWord = match[2]?.toLowerCase() || 'is';
      const value = parseFloat(match[3]);
      const unit = match[4] || '';

      let claim: 'dropped' | 'increased' | 'is' | 'was' = 'is';
      if (['dropped', 'decreased', 'declined', 'fell'].includes(claimWord)) {
        claim = 'dropped';
      } else if (['increased', 'rose', 'grew', 'spiked'].includes(claimWord)) {
        claim = 'increased';
      }

      claims.push({
        metric,
        claim,
        value,
        unit,
        originalText: match[0],
      });
    }
  }

  return claims;
}

/**
 * Verify claims against provided evidence
 * Returns which claims are verified, unverified, or contradicted
 */
export function verifyClaims(
  text: string,
  evidence?: Evidence[],
): {
  verified: string[];
  unverified: string[];
  contradicted: string[];
  verificationScore: number;
} {
  const claims = extractNumericClaims(text);
  const verified: string[] = [];
  const unverified: string[] = [];
  const contradicted: string[] = [];

  if (!evidence || evidence.length === 0) {
    // All claims are unverified without evidence
    return {
      verified: [],
      unverified: claims.map(c => c.originalText),
      contradicted: [],
      verificationScore: claims.length === 0 ? 1.0 : 0.0,
    };
  }

  for (const claim of claims) {
    // Find matching evidence
    const matchingEvidence = evidence.find(e =>
      e.metric.toUpperCase().includes(claim.metric) ||
      claim.metric.includes(e.metric.toUpperCase())
    );

    if (!matchingEvidence) {
      unverified.push(claim.originalText);
      continue;
    }

    // Check if claim matches evidence
    if (claim.claim === 'dropped' || claim.claim === 'increased') {
      // Verify direction and magnitude
      if (matchingEvidence.changePercent !== undefined) {
        const evidenceDirection = matchingEvidence.changePercent < 0 ? 'dropped' : 'increased';
        const evidenceMagnitude = Math.abs(matchingEvidence.changePercent);

        // Allow 20% tolerance in magnitude
        const magnitudeDiff = Math.abs(evidenceMagnitude - claim.value);
        const magnitudeMatch = magnitudeDiff <= claim.value * 0.2 || magnitudeDiff <= 5;

        if (evidenceDirection === claim.claim && magnitudeMatch) {
          verified.push(claim.originalText);
        } else if (evidenceDirection !== claim.claim) {
          contradicted.push(`${claim.originalText} (evidence shows ${matchingEvidence.changePercent}%)`);
        } else {
          unverified.push(`${claim.originalText} (evidence shows ${matchingEvidence.changePercent}%)`);
        }
      } else {
        unverified.push(claim.originalText);
      }
    } else {
      // 'is' or 'was' claim — check value match
      const evidenceValue = matchingEvidence.currentValue;
      const valueDiff = Math.abs(evidenceValue - claim.value);
      const valueMatch = valueDiff <= claim.value * 0.1 || valueDiff <= 1;

      if (valueMatch) {
        verified.push(claim.originalText);
      } else {
        unverified.push(`${claim.originalText} (evidence shows ${evidenceValue})`);
      }
    }
  }

  // Calculate verification score
  const totalClaims = claims.length;
  if (totalClaims === 0) {
    return { verified, unverified, contradicted, verificationScore: 1.0 };
  }

  const verificationScore =
    (verified.length * 1.0 + unverified.length * 0.3 - contradicted.length * 0.5) / totalClaims;

  return {
    verified,
    unverified,
    contradicted,
    verificationScore: Math.max(0, Math.min(1, verificationScore)),
  };
}
