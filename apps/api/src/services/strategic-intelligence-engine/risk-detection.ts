/**
 * Strategic Intelligence Engine — Strategic Risk Detection
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  StrategicRisk,
  AudiencePsychologyReport,
  CommentSignalInput,
  FatigueSignalInput,
  PerformanceSignalInput
} from './types.js';

export function detectStrategicRisks(
  audiencePsychology: AudiencePsychologyReport,
  fatigueSignals: FatigueSignalInput[],
  performanceSignals: PerformanceSignalInput,
  commentSignals: CommentSignalInput[]
): StrategicRisk[] {
  const risks: StrategicRisk[] = [];

  // TRUST CONTAMINATION RISK
  if (audiencePsychology.trustLandscape.overallTrust === 'contaminated' ||
      audiencePsychology.trustLandscape.overallTrust === 'eroding') {

    const trustComments = commentSignals.filter(s =>
      s.pattern.toLowerCase().match(/fraud|fake|scam|legit/)
    );

    risks.push({
      id: uuidv4(),
      severity: audiencePsychology.trustLandscape.overallTrust === 'contaminated' ? 'critical' : 'high',
      riskType: 'trust',
      observation: `${trustComments.reduce((sum, s) => sum + s.frequency, 0)} comments questioning brand legitimacy. Trust landscape: ${audiencePsychology.trustLandscape.overallTrust}.`,
      interpretation: `The audience is entering legitimacy-verification mode. Cold traffic is now performing brand trust checks before product evaluation. Public skepticism in comments is contaminating perception for all viewers, not just commenters.`,
      businessImpact: `CAC will increase as conversion requires additional trust-building touchpoints. Cold audience conversion rate declining as first-click skepticism rises. Scaling becomes progressively harder as each new audience segment encounters public doubt signals.`,
      strategicImplication: `This is not a customer service issue—it is a brand trust infrastructure problem. Addressing individual complaints will not solve systemic perception contamination. Requires trust-first creative systems and operational transparency content.`,
      estimatedImpact: {
        cacIncrease: '+25-40%',
        conversionDecline: '-30-45%',
        trustScore: 'Critical decline',
        scalingRisk: 'High—new audiences encounter doubt signals'
      },
      strategicDirection: [
        'Founder visibility and transparency content',
        'Behind-the-scenes fulfillment documentation',
        'Proactive delivery tracking showcases',
        'COD reassurance for first-time buyers',
        'Customer unboxing aggregation as trust content',
        'Operational excellence as brand narrative'
      ],
      creativeSystemsNeeded: [
        'Trust-first acquisition funnel',
        'Legitimacy proof content library',
        'Founder transparency series',
        'Customer verification content system',
        'Operational proof creative rotation'
      ],
      detectedAt: new Date().toISOString()
    });
  }

  // CREATIVE FATIGUE AS STRATEGIC SIGNAL
  const highFatigueCreatives = fatigueSignals.filter(f => f.fatigueScore > 70);
  if (highFatigueCreatives.length > 0) {

    const avgCtrDrop = highFatigueCreatives.reduce((sum, f) => sum + f.ctrDrop, 0) / highFatigueCreatives.length;

    risks.push({
      id: uuidv4(),
      severity: avgCtrDrop > 40 ? 'high' : 'medium',
      riskType: 'cac',
      observation: `${highFatigueCreatives.length} creative(s) showing ${Math.round(avgCtrDrop)}% average CTR decline.`,
      interpretation: `The current creative approach is exhausting audience receptivity. This is not just creative fatigue—it indicates the emotional angle or narrative structure is saturating in the audience's mental space. The "reason to pay attention" is diminishing.`,
      businessImpact: `Continued spending on fatigued approaches compounds negative returns. Each impression reinforces audience dismissal patterns rather than consideration. CAC trajectory is unsustainable without narrative evolution.`,
      strategicImplication: `The winning factor in current creatives needs decomposition. Often, the surface execution (visuals, hook) is fatiguing while the underlying emotional structure remains viable. Requires identifying what's actually working versus what's exhausting.`,
      estimatedImpact: {
        cacIncrease: '+15-30%',
        conversionDecline: '-20-35%',
        scalingRisk: 'Medium—diminishing returns on proven concepts'
      },
      strategicDirection: [
        'Decompose winning creatives into transferable components',
        'Identify emotional structure vs. visual execution fatigue',
        'Develop variation strategy that preserves what works',
        'Test narrative evolution, not just visual refresh',
        'Consider format shift if emotional angle is saturated'
      ],
      creativeSystemsNeeded: [
        'Winning element extraction system',
        'Variation development with structure preservation',
        'Format diversification for proven emotional angles',
        'Narrative evolution testing framework'
      ],
      detectedAt: new Date().toISOString()
    });
  }

  // ASPIRATION FATIGUE RISK
  const desireComments = commentSignals.filter(s => s.category === 'desire');
  const praiseComments = commentSignals.filter(s => s.category === 'praise');
  const objectionComments = commentSignals.filter(s => s.category === 'objection' || s.category === 'question');

  const aspirationFatigueSignal =
    desireComments.length > 0 &&
    objectionComments.length > desireComments.length * 2 &&
    praiseComments.length < objectionComments.length;

  if (aspirationFatigueSignal) {
    risks.push({
      id: uuidv4(),
      severity: 'medium',
      riskType: 'positioning',
      observation: `Objection-to-desire ratio is ${(objectionComments.length / Math.max(desireComments.length, 1)).toFixed(1)}:1. Audience is questioning more than aspiring.`,
      interpretation: `The audience may be experiencing aspiration fatigue. They've seen enough "lifestyle promise" content—they now want proof, specifics, and reassurance. The persuasion system of "inspire desire" is saturating; "validate decision" is emerging.`,
      businessImpact: `Continued aspiration-heavy creative investment yields diminishing returns. Audience is psychologically past the "dream" stage and into "verify" stage. Creative spend is misaligned with audience psychological position.`,
      strategicImplication: `The category is maturing from aspiration-driven to validation-driven purchasing. Early-majority buyers require different persuasion architecture than early adopters. Creative strategy must evolve from "imagine having this" to "here's proof it works."`,
      estimatedImpact: {
        conversionDecline: '-15-25%',
        scalingRisk: 'Medium—aspiration approach reaching ceiling'
      },
      strategicDirection: [
        'Shift from aspiration to validation creative weight',
        'Increase proof-point density in content',
        'Feature customer verification, not just aspiration',
        'Lead with specifics, not lifestyle',
        'Develop "for people like you who already decided" content'
      ],
      creativeSystemsNeeded: [
        'Validation-first creative system',
        'Proof-point content library',
        'Customer verification showcase system',
        'Specificity-focused hooks'
      ],
      detectedAt: new Date().toISOString()
    });
  }

  return risks.sort((a, b) => {
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });
}
