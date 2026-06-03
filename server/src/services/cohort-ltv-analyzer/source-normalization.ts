/**
 * Cohort LTV Analyzer — source normalization
 */

import type { AcquisitionSource } from './types.js';

// ============ SOURCE NORMALIZATION ============

const SOURCE_MAPPINGS: Record<string, AcquisitionSource> = {
  meta_ads: {
    key: 'meta_ads',
    displayName: 'Meta Ads',
    rawSources: ['facebook', 'fb', 'meta', 'instagram', 'ig'],
  },
  google_ads: {
    key: 'google_ads',
    displayName: 'Google Ads',
    rawSources: ['google', 'gads', 'adwords', 'googleads'],
  },
  direct: {
    key: 'direct',
    displayName: 'Direct/Organic',
    rawSources: ['direct', 'organic', ''],
  },
  email: {
    key: 'email',
    displayName: 'Email',
    rawSources: ['email', 'klaviyo', 'mailchimp', 'newsletter'],
  },
  affiliates: {
    key: 'affiliates',
    displayName: 'Affiliates',
    rawSources: ['affiliate', 'referral', 'partner'],
  },
};

export function normalizeSource(utmSource: string, utmTerm: string): AcquisitionSource {
  const source = (utmSource || '').toLowerCase().trim();

  // Check for Meta adset ID pattern (15-20 digit number in utm_term)
  if (utmTerm && /^\d{15,20}$/.test(utmTerm)) {
    return SOURCE_MAPPINGS['meta_ads'];
  }

  // Check for campaign name patterns (DSG_, TOF_, etc. - common Meta naming)
  if (source.startsWith('dsg_') || source.includes('_tof_') || source.includes('_mof_') || source.includes('_bof_')) {
    return SOURCE_MAPPINGS['meta_ads'];
  }

  // Check standard source mappings
  for (const [key, mapping] of Object.entries(SOURCE_MAPPINGS)) {
    for (const rawSource of mapping.rawSources) {
      if (rawSource && source.includes(rawSource)) {
        return mapping;
      }
    }
  }

  // If source starts with common Meta campaign prefixes
  if (source.includes('catalog') || source.includes('reel') || source.includes('video')) {
    return SOURCE_MAPPINGS['meta_ads'];
  }

  // If empty or "direct"
  if (!source || source === 'direct') {
    return SOURCE_MAPPINGS['direct'];
  }

  // Check for misconfigured UTM templates (unresolved placeholders)
  if (source.includes('{{') || source.includes('}}')) {
    return SOURCE_MAPPINGS['direct']; // Group with direct/unknown
  }

  // Unknown source - return as-is
  return {
    key: 'other',
    displayName: source.slice(0, 30),
    rawSources: [source],
  };
}
