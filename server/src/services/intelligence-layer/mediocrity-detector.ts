/**
 * Mediocrity Detector
 *
 * Aggressively filters out:
 * - Dashboard-level insights (any MB sees these in 5 minutes)
 * - Generic recommendations ("test new creatives", "scale winners")
 * - Obvious seasonality ("prepare for Diwali")
 * - AI-consultant language ("leverage your data", "moving forward")
 * - Verbose low-value content
 *
 * For ₹50L+/month accounts, if a senior media buyer already knows it,
 * it should NOT be shipped.
 */

// ============================================================================
// Types
// ============================================================================

export interface MediocrityPattern {
  category: string;
  pattern: RegExp;
  description: string;
  severity: 'fatal' | 'major' | 'minor';
  example: string;
}

export interface MediocrityMatch {
  category: string;
  matched: string;
  description: string;
  severity: 'fatal' | 'major' | 'minor';
}

export interface MediocrityEvaluation {
  isMediocre: boolean;
  matches: MediocrityMatch[];
  severityCounts: {
    fatal: number;
    major: number;
    minor: number;
  };
  overallSeverity: 'none' | 'minor' | 'major' | 'fatal';
  humanReadable: string;
  wouldSeniorMBKnow: boolean;
  couldDashboardShow: boolean;
}

// ============================================================================
// Mediocrity Patterns
// ============================================================================

export const MEDIOCRITY_PATTERNS: MediocrityPattern[] = [
  // ============================================================================
  // FATAL: Dashboard Intelligence (any platform shows this)
  // ============================================================================
  {
    category: 'dashboard_intelligence',
    pattern: /ROAS (dropped|declined|increased|improved|is|was) (from|to|at|around)?\s*\d/i,
    description: 'ROAS movement - visible in any ads dashboard',
    severity: 'fatal',
    example: 'ROAS dropped from 3.2x to 2.8x',
  },
  {
    category: 'dashboard_intelligence',
    pattern: /CTR (is|was|dropped|declined|increased|improved) (low|high|to|from|by)?\s*\d*%?/i,
    description: 'CTR observation - visible in any ads dashboard',
    severity: 'fatal',
    example: 'CTR is declining at 1.2%',
  },
  {
    category: 'dashboard_intelligence',
    pattern: /CPA (spiked|dropped|increased|decreased|is|was) (to|from|by|at)?\s*[₹$]?\d/i,
    description: 'CPA movement - visible in any ads dashboard',
    severity: 'fatal',
    example: 'CPA spiked to ₹450',
  },
  {
    category: 'dashboard_intelligence',
    pattern: /frequency (is|was|reached|at) (high|too high|\d)/i,
    description: 'Frequency observation - visible in Meta dashboard',
    severity: 'fatal',
    example: 'Frequency is too high at 4.5',
  },
  {
    category: 'dashboard_intelligence',
    pattern: /spend (is|was|increased|decreased) (up|down|by|to)/i,
    description: 'Spend movement - visible in any dashboard',
    severity: 'major',
    example: 'Spend increased by 20%',
  },
  {
    category: 'dashboard_intelligence',
    pattern: /impressions (dropped|increased|are|were)/i,
    description: 'Impressions observation - visible in any dashboard',
    severity: 'major',
    example: 'Impressions dropped significantly',
  },
  {
    category: 'dashboard_intelligence',
    pattern: /conversion rate (is|was|dropped|increased)/i,
    description: 'Conversion rate observation - visible in analytics',
    severity: 'major',
    example: 'Conversion rate dropped to 2%',
  },

  // ============================================================================
  // FATAL: Generic Recommendations (every media buyer's first instinct)
  // ============================================================================
  {
    category: 'generic_recommendation',
    pattern: /test (new|different|more|additional) creatives?/i,
    description: 'Generic "test creatives" - every MB says this',
    severity: 'fatal',
    example: 'Test new creatives to improve performance',
  },
  {
    category: 'generic_recommendation',
    pattern: /scale (winning|top|best|high.?performing) (creatives?|campaigns?|ads?)/i,
    description: 'Generic "scale winners" - obvious advice',
    severity: 'fatal',
    example: 'Scale your winning creatives',
  },
  {
    category: 'generic_recommendation',
    pattern: /pause (under.?performing|losing|low.?performing|bad) (creatives?|campaigns?|ads?)/i,
    description: 'Generic "pause losers" - obvious advice',
    severity: 'fatal',
    example: 'Pause underperforming campaigns',
  },
  {
    category: 'generic_recommendation',
    pattern: /optimize (for|your) (better|improved|higher)/i,
    description: 'Vague optimization advice - meaningless',
    severity: 'major',
    example: 'Optimize for better results',
  },
  {
    category: 'generic_recommendation',
    pattern: /monitor (performance|metrics|results|closely|carefully)/i,
    description: 'Generic "monitor" advice - what else would they do?',
    severity: 'major',
    example: 'Continue monitoring performance closely',
  },
  {
    category: 'generic_recommendation',
    pattern: /consider (testing|trying|exploring|looking into)/i,
    description: 'Weak "consider" language - non-committal',
    severity: 'minor',
    example: 'Consider testing new audiences',
  },
  {
    category: 'generic_recommendation',
    pattern: /review (your|the) (targeting|audience|creative)/i,
    description: 'Generic "review" advice - not actionable',
    severity: 'minor',
    example: 'Review your audience targeting',
  },
  {
    category: 'generic_recommendation',
    pattern: /focus on (high.?performing|quality|better)/i,
    description: 'Generic "focus" advice - obvious',
    severity: 'minor',
    example: 'Focus on high-performing segments',
  },

  // ============================================================================
  // MAJOR: Obvious Seasonality (calendar shows this)
  // ============================================================================
  {
    category: 'obvious_seasonality',
    pattern: /prepare for (diwali|holi|christmas|new year|raksha bandhan|eid|navratri|durga puja)/i,
    description: 'Obvious festival prep - calendar shows this',
    severity: 'major',
    example: 'Prepare for Diwali season',
  },
  {
    category: 'obvious_seasonality',
    pattern: /seasonal (opportunity|trend|spike|demand)/i,
    description: 'Generic seasonality mention - obvious',
    severity: 'major',
    example: 'Seasonal opportunity approaching',
  },
  {
    category: 'obvious_seasonality',
    pattern: /upcoming (festival|holiday|season|sale)/i,
    description: 'Generic upcoming event - calendar shows this',
    severity: 'major',
    example: 'Prepare for the upcoming festival season',
  },
  {
    category: 'obvious_seasonality',
    pattern: /(summer|winter|monsoon|wedding) (season|collection) (opportunity|approaching)/i,
    description: 'Obvious seasonal mention',
    severity: 'minor',
    example: 'Wedding season opportunity',
  },

  // ============================================================================
  // MAJOR: AI-Consultant Language (sounds smart, says nothing)
  // ============================================================================
  {
    category: 'consultant_speak',
    pattern: /based on (best practices|industry standards|our analysis)/i,
    description: 'Consultant speak - vague authority claim',
    severity: 'major',
    example: 'Based on best practices, we recommend...',
  },
  {
    category: 'consultant_speak',
    pattern: /industry (standards|benchmarks|best practices)/i,
    description: 'Industry standards appeal - generic',
    severity: 'major',
    example: 'This is below industry benchmarks',
  },
  {
    category: 'consultant_speak',
    pattern: /moving forward/i,
    description: 'Filler phrase - adds nothing',
    severity: 'minor',
    example: 'Moving forward, we should...',
  },
  {
    category: 'consultant_speak',
    pattern: /low.?hanging fruit/i,
    description: 'Consultant cliché',
    severity: 'major',
    example: 'There are some low-hanging fruit opportunities',
  },
  {
    category: 'consultant_speak',
    pattern: /quick wins/i,
    description: 'Consultant cliché',
    severity: 'major',
    example: 'Focus on quick wins first',
  },
  {
    category: 'consultant_speak',
    pattern: /leverage (your|the|this) (data|insights|platform)/i,
    description: 'Vague leverage language',
    severity: 'minor',
    example: 'Leverage your data for better results',
  },
  {
    category: 'consultant_speak',
    pattern: /data.?driven (approach|strategy|decision)/i,
    description: 'Buzzword - what else would it be?',
    severity: 'minor',
    example: 'Take a data-driven approach',
  },
  {
    category: 'consultant_speak',
    pattern: /strategic (approach|initiative|direction)/i,
    description: 'Vague strategic language',
    severity: 'minor',
    example: 'This strategic approach will help',
  },
  {
    category: 'consultant_speak',
    pattern: /actionable insights/i,
    description: 'Meta-commentary instead of actual insight',
    severity: 'minor',
    example: 'Here are some actionable insights',
  },

  // ============================================================================
  // MINOR: Verbose Low-Value Content
  // ============================================================================
  {
    category: 'verbose_filler',
    pattern: /it('s| is) important to (note|mention|highlight|remember)/i,
    description: 'Filler phrase before content',
    severity: 'minor',
    example: "It's important to note that...",
  },
  {
    category: 'verbose_filler',
    pattern: /as (mentioned|noted|stated) (earlier|above|previously|before)/i,
    description: 'Self-referential filler',
    severity: 'minor',
    example: 'As mentioned earlier...',
  },
  {
    category: 'verbose_filler',
    pattern: /in (conclusion|summary|brief)/i,
    description: 'Summary marker in short content',
    severity: 'minor',
    example: 'In conclusion...',
  },
  {
    category: 'verbose_filler',
    pattern: /to (summarize|sum up|conclude)/i,
    description: 'Summary marker',
    severity: 'minor',
    example: 'To summarize...',
  },
  {
    category: 'verbose_filler',
    pattern: /at the end of the day/i,
    description: 'Cliché filler',
    severity: 'minor',
    example: 'At the end of the day...',
  },
  {
    category: 'verbose_filler',
    pattern: /needless to say/i,
    description: 'If needless, why say it?',
    severity: 'minor',
    example: 'Needless to say...',
  },

  // ============================================================================
  // MAJOR: Fake Sophistication (sounds deep, isn't)
  // ============================================================================
  {
    category: 'fake_sophistication',
    pattern: /deep.?dive into the data/i,
    description: 'Claims depth without evidence',
    severity: 'minor',
    example: 'After a deep-dive into the data...',
  },
  {
    category: 'fake_sophistication',
    pattern: /comprehensive analysis (shows|reveals|indicates)/i,
    description: 'Claims comprehensiveness without evidence',
    severity: 'minor',
    example: 'Our comprehensive analysis shows...',
  },
  {
    category: 'fake_sophistication',
    pattern: /thorough (review|analysis|examination)/i,
    description: 'Claims thoroughness without evidence',
    severity: 'minor',
    example: 'After a thorough review...',
  },
  {
    category: 'fake_sophistication',
    pattern: /upon further (analysis|review|investigation)/i,
    description: 'Vague further analysis claim',
    severity: 'minor',
    example: 'Upon further analysis...',
  },
];

// ============================================================================
// Detection Function
// ============================================================================

export function detectMediocrity(content: string): MediocrityEvaluation {
  const matches: MediocrityMatch[] = [];

  MEDIOCRITY_PATTERNS.forEach(pattern => {
    const match = content.match(pattern.pattern);
    if (match) {
      matches.push({
        category: pattern.category,
        matched: match[0],
        description: pattern.description,
        severity: pattern.severity,
      });
    }
  });

  // Count severities
  const severityCounts = {
    fatal: matches.filter(m => m.severity === 'fatal').length,
    major: matches.filter(m => m.severity === 'major').length,
    minor: matches.filter(m => m.severity === 'minor').length,
  };

  // Determine overall severity
  let overallSeverity: MediocrityEvaluation['overallSeverity'];
  if (severityCounts.fatal >= 1) {
    overallSeverity = 'fatal';
  } else if (severityCounts.major >= 2) {
    overallSeverity = 'fatal'; // Multiple major = fatal
  } else if (severityCounts.major >= 1) {
    overallSeverity = 'major';
  } else if (severityCounts.minor >= 3) {
    overallSeverity = 'major'; // Many minor = major
  } else if (severityCounts.minor >= 1) {
    overallSeverity = 'minor';
  } else {
    overallSeverity = 'none';
  }

  // Determine if mediocre
  const isMediocre = overallSeverity === 'fatal' || overallSeverity === 'major';

  // Check specific flags
  const dashboardMatches = matches.filter(m => m.category === 'dashboard_intelligence');
  const genericMatches = matches.filter(m => m.category === 'generic_recommendation');

  const couldDashboardShow = dashboardMatches.length >= 1;
  const wouldSeniorMBKnow = genericMatches.length >= 1 || dashboardMatches.length >= 1;

  // Generate human-readable explanation
  let humanReadable: string;
  if (overallSeverity === 'none') {
    humanReadable = 'No mediocrity patterns detected. Content appears to be substantive.';
  } else if (overallSeverity === 'fatal') {
    const fatalMatches = matches.filter(m => m.severity === 'fatal');
    humanReadable = `FATAL MEDIOCRITY: ${fatalMatches.length} patterns that any senior MB already knows. Found: "${fatalMatches.map(m => m.matched).join('", "')}"`;
  } else if (overallSeverity === 'major') {
    humanReadable = `MAJOR MEDIOCRITY: ${severityCounts.major} significant mediocrity patterns. This insight lacks depth.`;
  } else {
    humanReadable = `MINOR MEDIOCRITY: ${severityCounts.minor} minor patterns detected. Consider tightening language.`;
  }

  return {
    isMediocre,
    matches,
    severityCounts,
    overallSeverity,
    humanReadable,
    wouldSeniorMBKnow,
    couldDashboardShow,
  };
}

// ============================================================================
// Commoditization Check
// ============================================================================

export interface CommoditizationCheck {
  canGoogleAnalyticsShowThis: boolean;
  canTripleWhaleShowThis: boolean;
  canNorthbeamShowThis: boolean;
  canMetaAdsManagerShowThis: boolean;
  canSeniorMBIdentifyIn5Min: boolean;
  canHumanAnalystFindManually: boolean;
  isCommoditized: boolean;
  reasoning: string[];
}

export function checkCommoditization(content: string): CommoditizationCheck {
  const reasoning: string[] = [];

  // FIRST: Check for NON-COMMODITIZED elements (strategic analysis indicators)
  const nonCommoditizedPatterns = [
    /root cause.{0,30}(is not|isn't|is NOT)/i,
    /hidden.{0,20}(leverage|pattern|opportunity)/i,
    /cross.{0,10}source.{0,10}synthesis/i,
    /investigating.{0,20}\d+.{0,10}(sources|signals)/i,
    /compounding.{0,20}(effect|impact|risk)/i,
    /second.{0,10}order/i,
    /downstream.{0,20}(impact|effect)/i,
    /behavioral.{0,20}(shift|interpretation)/i,
    /saturation.{0,20}(audience|segment)/i,
    /face fatigue|trust decay/i,
    /LTV.{0,20}(cohort|impact|higher)/i,
    /untapped.{0,20}(segment|opportunity)/i,
    /rather than.{0,30}(fatigue|obvious)/i,
    /strategically significant/i,
    /fresh reach/i,
    /\d+ signal sources/i,
  ];

  let nonCommoditizedCount = 0;
  nonCommoditizedPatterns.forEach(pattern => {
    if (pattern.test(content)) {
      nonCommoditizedCount++;
    }
  });

  // If content has 3+ non-commoditized elements, it's strategic analysis
  const isStrategicAnalysis = nonCommoditizedCount >= 3;
  if (isStrategicAnalysis) {
    reasoning.push(`Strategic analysis detected: ${nonCommoditizedCount} non-commoditized elements`);
  }

  // Check for metrics any tool shows
  const metricPatterns = [
    { pattern: /ROAS|return on ad spend/i, tool: 'Any dashboard' },
    { pattern: /CTR|click.?through rate/i, tool: 'Any dashboard' },
    { pattern: /CPA|cost per acquisition/i, tool: 'Any dashboard' },
    { pattern: /CPM|cost per mille/i, tool: 'Any dashboard' },
    { pattern: /conversion rate/i, tool: 'Google Analytics' },
    { pattern: /frequency/i, tool: 'Meta Ads Manager' },
    { pattern: /reach/i, tool: 'Meta Ads Manager' },
    { pattern: /impressions/i, tool: 'Any dashboard' },
  ];

  let dashboardMetricsCount = 0;
  if (!isStrategicAnalysis) {
    // Only count metrics as commoditized if NOT in strategic analysis context
    metricPatterns.forEach(({ pattern, tool }) => {
      if (pattern.test(content)) {
        dashboardMetricsCount++;
        reasoning.push(`Metric visible in ${tool}`);
      }
    });
  }

  // These checks are softened when content is strategic analysis
  const canGoogleAnalyticsShowThis = !isStrategicAnalysis && /conversion|bounce rate|session|page view/i.test(content);
  const canTripleWhaleShowThis = !isStrategicAnalysis && /attribution|ROAS|blended|true ROAS/i.test(content);
  const canNorthbeamShowThis = !isStrategicAnalysis && /attribution|MER|media efficiency/i.test(content);
  const canMetaAdsManagerShowThis = !isStrategicAnalysis && /CTR|CPA|ROAS|frequency|reach|impressions/i.test(content);

  // Check for obvious analysis
  const obviousPatterns = [
    /is (under|over).?performing/i,
    /needs (improvement|optimization)/i,
    /shows (decline|increase|improvement)/i,
    /trending (up|down)/i,
  ];

  let obviousCount = 0;
  if (!isStrategicAnalysis) {
    obviousPatterns.forEach(pattern => {
      if (pattern.test(content)) {
        obviousCount++;
        reasoning.push('Obvious observation any analyst can make');
      }
    });
  }

  const canSeniorMBIdentifyIn5Min = !isStrategicAnalysis && (dashboardMetricsCount >= 2 || obviousCount >= 1);
  const canHumanAnalystFindManually = !isStrategicAnalysis && dashboardMetricsCount >= 1;

  // Content is NOT commoditized if it's strategic analysis
  const isCommoditized = !isStrategicAnalysis && (
    canGoogleAnalyticsShowThis ||
    canTripleWhaleShowThis ||
    canNorthbeamShowThis ||
    canMetaAdsManagerShowThis ||
    canSeniorMBIdentifyIn5Min ||
    canHumanAnalystFindManually
  );

  if (isCommoditized && reasoning.length === 0) {
    reasoning.push('Content relies on data any tool can surface');
  }

  return {
    canGoogleAnalyticsShowThis,
    canTripleWhaleShowThis,
    canNorthbeamShowThis,
    canMetaAdsManagerShowThis,
    canSeniorMBIdentifyIn5Min,
    canHumanAnalystFindManually,
    isCommoditized,
    reasoning,
  };
}

// ============================================================================
// Combined Quality Filter
// ============================================================================

export interface QualityFilterResult {
  passes: boolean;
  mediocrity: MediocrityEvaluation;
  commoditization: CommoditizationCheck;
  rejection?: {
    reason: string;
    category: string;
    evidence: string[];
  };
}

export function filterForQuality(content: string): QualityFilterResult {
  const mediocrity = detectMediocrity(content);
  const commoditization = checkCommoditization(content);

  // Determine if passes
  const passes = !mediocrity.isMediocre && !commoditization.isCommoditized;

  let rejection: QualityFilterResult['rejection'] | undefined;

  if (!passes) {
    if (mediocrity.overallSeverity === 'fatal') {
      rejection = {
        reason: 'Fatal mediocrity - content a senior media buyer already knows',
        category: 'mediocrity',
        evidence: mediocrity.matches.map(m => `"${m.matched}" - ${m.description}`),
      };
    } else if (commoditization.isCommoditized) {
      rejection = {
        reason: 'Commoditized intelligence - any dashboard tool can show this',
        category: 'commoditization',
        evidence: commoditization.reasoning,
      };
    } else {
      rejection = {
        reason: 'Content lacks strategic depth',
        category: 'depth',
        evidence: mediocrity.matches.map(m => `"${m.matched}"`),
      };
    }
  }

  return {
    passes,
    mediocrity,
    commoditization,
    rejection,
  };
}
