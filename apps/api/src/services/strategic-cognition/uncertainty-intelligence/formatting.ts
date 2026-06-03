/**
 * Formatting Helpers
 */

import { type DistributionType, type UncertainEstimate } from './types.js';

/**
 * Format an uncertain estimate for operator display
 */
export function formatUncertainEstimate(estimate: UncertainEstimate): string {
  const { variable, pointEstimate, unit, confidenceInterval, distribution, evidenceQuality, majorUncertaintySources } = estimate;

  const distributionDesc: Record<DistributionType, string> = {
    'normal': 'symmetric',
    'uniform': 'uniform',
    'skewed_right': 'more upside potential',
    'skewed_left': 'more downside risk',
    'bimodal': 'two likely outcomes',
  };

  let output = `${variable} estimate:\n`;
  output += `  Point estimate: ${pointEstimate.toFixed(2)}${unit}\n`;
  output += `  80% confidence interval: ${confidenceInterval.low.toFixed(2)} to ${confidenceInterval.high.toFixed(2)}${unit}\n`;
  output += `  Distribution: ${distributionDesc[distribution]}\n`;
  output += `  Evidence quality: ${evidenceQuality}\n`;

  if (majorUncertaintySources.length > 0) {
    output += `  Key uncertainties:\n`;
    for (const source of majorUncertaintySources.slice(0, 3)) {
      output += `    - ${source.name}: ${source.description}\n`;
    }
  }

  return output;
}
