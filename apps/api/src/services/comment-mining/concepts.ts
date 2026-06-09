/**
 * Comment Mining Agent — creative concept generation (rule-based + AI).
 */

import { config } from '../../config.js';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../utils/logger.js';
import type {
  AdFormat,
  ClassifiedComment,
  CommentCategory,
  CommentPattern,
  CreativeConceptFromComments,
  CustomerLanguage,
} from './types.js';

/**
 * Generate creative concepts from comment patterns using AI
 * This is the core "Comment → Creative Concept Generator"
 */
export async function generateCreativeConcepts(
  patterns: CommentPattern[],
  language: CustomerLanguage,
  brandContext: { name: string; category: string },
  classifiedComments?: ClassifiedComment[]
): Promise<CreativeConceptFromComments[]> {

  const concepts: CreativeConceptFromComments[] = [];

  // Phase 1: Rule-based concepts for guaranteed coverage
  const ruleBasedConcepts = generateRuleBasedConcepts(patterns, language, brandContext);
  concepts.push(...ruleBasedConcepts);

  // Phase 2: AI-generated concepts for creative depth
  if (patterns.length >= 5) {
    try {
      const aiConcepts = await generateAIConceptsFromPatterns(patterns, language, brandContext, classifiedComments);
      concepts.push(...aiConcepts);
    } catch (err) {
      logger.warn({ err }, '[CommentMining] AI concept generation failed, using rule-based only');
    }
  }

  // Phase 2.5: Generate UGC scripts for concepts that need them (batch AI call)
  const conceptsNeedingScripts = concepts.filter(c =>
    c.adFormats?.includes('ugc_script') && !c.ugcScript
  );
  if (conceptsNeedingScripts.length > 0) {
    try {
      await generateUGCScriptsBatch(conceptsNeedingScripts, brandContext);
    } catch (err) {
      logger.warn({ err }, '[CommentMining] Batch script generation failed');
    }
  }

  // Phase 3: Deduplicate and prioritize
  const uniqueConcepts = deduplicateConcepts(concepts);
  const prioritizedConcepts = prioritizeConcepts(uniqueConcepts, patterns);

  return prioritizedConcepts;
}

/**
 * Rule-based concept generation (fast, reliable)
 */
export function generateRuleBasedConcepts(
  patterns: CommentPattern[],
  language: CustomerLanguage,
  brandContext: { name: string; category: string }
): CreativeConceptFromComments[] {
  const concepts: CreativeConceptFromComments[] = [];

  // 1. Social proof from praise (highest confidence)
  const topPraise = patterns
    .filter(p => p.category === 'praise' && p.frequency >= 2)
    .slice(0, 4);

  for (const praise of topPraise) {
    concepts.push({
      id: uuidv4(),
      type: 'social_proof',
      hook: `"${praise.pattern}" — ${praise.frequency}+ customers agree`,
      hookSource: 'exact_quote',
      sourceComments: praise.exampleComments.slice(0, 3),
      visualDirection: 'Customer photos/screenshots with quote overlay, product in lifestyle context',
      copyPoints: [
        `Real customer quote: "${praise.pattern}"`,
        'Show diversity of happy customers',
        'Include purchase count or review count'
      ],
      targetEmotion: 'trust',
      confidence: Math.min(95, 60 + praise.frequency * 5),
      estimatedImpact: praise.frequency >= 5 ? 'High — proven resonance' : 'Medium — emerging pattern',
      adFormats: ['static_image', 'carousel', 'ugc_script'],
      primaryCopy: `${praise.frequency}+ customers said "${praise.pattern}"`,
      secondaryCopy: `Join thousands who already love ${brandContext.name}`,
      cta: 'Shop Now',
      priority: calculatePriority(praise.frequency, 'praise')
    });
  }

  // 2. Objection handlers (high ROI - removes purchase barriers)
  const topObjections = patterns
    .filter(p => p.category === 'objection' && p.frequency >= 2)
    .slice(0, 4);

  for (const objection of topObjections) {
    const hook = generateObjectionHook(objection.pattern);
    concepts.push({
      id: uuidv4(),
      type: 'objection_handler',
      hook,
      hookSource: 'derived',
      sourceComments: objection.exampleComments.slice(0, 3),
      visualDirection: 'Split screen: concern on left, proof/answer on right. End with happy customer.',
      copyPoints: [
        `Acknowledge the concern: "${objection.pattern}"`,
        'Provide concrete proof (sizing chart, return policy, etc.)',
        'Feature customer who had same concern and was satisfied'
      ],
      targetEmotion: 'reassurance',
      confidence: Math.min(90, 55 + objection.frequency * 5),
      estimatedImpact: `${objection.frequency} potential customers have this doubt — address it`,
      adFormats: ['ugc_script', 'video_hook', 'static_image'],
      primaryCopy: hook,
      secondaryCopy: `We hear you. Here's the truth about ${brandContext.name}`,
      cta: 'See For Yourself',
      priority: calculatePriority(objection.frequency, 'objection') + 2 // Boost objection handlers
    });
  }

  // 3. Desire amplifiers from desire comments
  const topDesires = patterns
    .filter(p => p.category === 'desire' && p.frequency >= 2)
    .slice(0, 3);

  for (const desire of topDesires) {
    concepts.push({
      id: uuidv4(),
      type: 'desire_amplifier',
      hook: `That feeling when ${desire.pattern.toLowerCase()}...`,
      hookSource: 'derived',
      sourceComments: desire.exampleComments.slice(0, 3),
      visualDirection: 'Aspirational lifestyle shot. Customer living the dream. Slow motion reveal.',
      copyPoints: [
        `Tap into the desire: "${desire.pattern}"`,
        'Show the transformation/result',
        'Make it feel attainable'
      ],
      targetEmotion: 'desire',
      confidence: Math.min(85, 50 + desire.frequency * 5),
      estimatedImpact: 'Converts window shoppers to buyers',
      adFormats: ['video_hook', 'story_ad', 'carousel'],
      primaryCopy: `You've been wanting this. Now make it happen.`,
      secondaryCopy: desire.pattern,
      cta: 'Get Yours',
      priority: calculatePriority(desire.frequency, 'desire')
    });
  }

  // 4. Scenario ads from use cases
  const topUseCases = patterns
    .filter(p => p.category === 'use_case')
    .slice(0, 3);

  for (const useCase of topUseCases) {
    const occasion = language.useCases.find(u => u.phrase === useCase.pattern)?.occasion || 'any occasion';
    concepts.push({
      id: uuidv4(),
      type: 'scenario',
      hook: `Perfect for ${occasion}`,
      hookSource: 'synthesized',
      sourceComments: useCase.exampleComments.slice(0, 3),
      visualDirection: `Real customer in ${occasion} setting. Before/during/after the event. Show reactions from others.`,
      copyPoints: [
        `Position product for ${occasion}`,
        'Show real customer story',
        'Highlight compliments received'
      ],
      targetEmotion: 'aspiration',
      confidence: 70,
      estimatedImpact: 'Expands perceived use cases, reaches new audiences',
      adFormats: ['carousel', 'ugc_script', 'video_hook'],
      primaryCopy: `Made for ${occasion}. Loved by customers.`,
      secondaryCopy: `"${useCase.pattern}" — real customer`,
      cta: 'Shop The Look',
      priority: calculatePriority(useCase.frequency, 'use_case')
    });
  }

  // 5. Fear reversal from frustration/questions
  const topFears = patterns
    .filter(p => (p.category === 'frustration' || p.category === 'question') && p.frequency >= 2)
    .slice(0, 2);

  for (const fear of topFears) {
    concepts.push({
      id: uuidv4(),
      type: 'fear_reversal',
      hook: `What if ${fear.pattern.toLowerCase()}? Here's our promise...`,
      hookSource: 'derived',
      sourceComments: fear.exampleComments.slice(0, 3),
      visualDirection: 'Start with the fear/concern, transition to solution, end with guarantee.',
      copyPoints: [
        `Name the fear: "${fear.pattern}"`,
        'Show how you solve it',
        'Offer guarantee or proof'
      ],
      targetEmotion: 'relief',
      confidence: 65,
      estimatedImpact: 'Removes final barrier to purchase',
      adFormats: ['ugc_script', 'static_image'],
      primaryCopy: `Worried about ${fear.pattern.toLowerCase()}?`,
      secondaryCopy: `We've got you covered. Here's our promise.`,
      cta: 'Risk-Free Trial',
      priority: calculatePriority(fear.frequency, 'frustration') + 1
    });
  }

  // 6. Comparison/differentiation from comparison comments
  const topComparisons = patterns
    .filter(p => p.category === 'comparison')
    .slice(0, 2);

  for (const comp of topComparisons) {
    const competitor = language.comparisons.find(c => c.phrase === comp.pattern)?.competitor;
    concepts.push({
      id: uuidv4(),
      type: 'differentiation',
      hook: competitor ? `Why customers switched from ${competitor}` : `Why customers chose us`,
      hookSource: 'synthesized',
      sourceComments: comp.exampleComments.slice(0, 3),
      visualDirection: 'Side-by-side comparison. Focus on our advantage. Customer testimonial about switching.',
      copyPoints: [
        'Highlight key differentiator',
        'Show customer who made the switch',
        'Don\'t bash competitor, elevate yourself'
      ],
      targetEmotion: 'confidence',
      confidence: 60,
      estimatedImpact: 'Converts competitor\'s customers',
      adFormats: ['carousel', 'ugc_script'],
      primaryCopy: `"${comp.pattern}" — real customer review`,
      cta: 'Make The Switch',
      priority: calculatePriority(comp.frequency, 'comparison')
    });
  }

  // 7. Synthesized hook from top emotional descriptors
  if (language.emotionalDescriptors.length >= 3) {
    const topPhrases = language.emotionalDescriptors.slice(0, 3);
    const combinedHook = topPhrases.map(p => p.phrase).join(' • ');

    concepts.push({
      id: uuidv4(),
      type: 'community',
      hook: combinedHook,
      hookSource: 'synthesized',
      sourceComments: [],
      visualDirection: 'Montage of customer reactions. Quick cuts. End with product.',
      copyPoints: [
        'Rapid-fire customer phrases',
        'Show diversity of happy customers',
        'Energy and excitement'
      ],
      targetEmotion: 'belonging',
      confidence: 80,
      estimatedImpact: 'High — combines proven emotional triggers',
      adFormats: ['video_hook', 'carousel', 'story_ad'],
      primaryCopy: combinedHook,
      secondaryCopy: `Join ${topPhrases.reduce((sum, p) => sum + p.count, 0)}+ happy customers`,
      cta: 'Join The Community',
      priority: 7
    });
  }

  return concepts;
}

/**
 * AI-generated concepts for creative depth
 */
export async function generateAIConceptsFromPatterns(
  patterns: CommentPattern[],
  language: CustomerLanguage,
  brandContext: { name: string; category: string },
  classifiedComments?: ClassifiedComment[]
): Promise<CreativeConceptFromComments[]> {
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const gemini = new GoogleGenerativeAI(config.geminiApiKey || '');
  const model = gemini.getGenerativeModel({ model: 'gemini-2.5-flash' });

  // Build context for AI
  const patternSummary = patterns.slice(0, 15).map(p =>
    `- "${p.pattern}" (${p.category}, mentioned ${p.frequency}x)`
  ).join('\n');

  const emotionalSummary = language.emotionalDescriptors.slice(0, 5)
    .map(e => `"${e.phrase}" (${e.count}x)`).join(', ');

  const painPoints = language.painPointsSolved.slice(0, 5)
    .map(p => `"${p.phrase}" (${p.count}x)`).join(', ');

  // Get raw high-engagement comments for authentic voice
  const highEngagement = classifiedComments
    ?.filter(c => c.creativeRelevance >= 70)
    .slice(0, 10)
    .map(c => `"${c.text}" [${c.category}]`)
    .join('\n') || '';

  const prompt = `You are a senior D2C creative strategist. Based on real customer comments, generate 3 unique ad concepts.

BRAND: ${brandContext.name} (${brandContext.category})

TOP COMMENT PATTERNS:
${patternSummary}

EMOTIONAL LANGUAGE CUSTOMERS USE:
${emotionalSummary}

PAIN POINTS MENTIONED:
${painPoints}

${highEngagement ? `HIGH-VALUE COMMENTS (exact quotes):
${highEngagement}` : ''}

Generate 3 ad concepts that:
1. Use EXACT customer language (not marketing speak)
2. Address real concerns or amplify real desires
3. Feel authentic, not salesy
4. Could work as UGC, static, or video

UGC SCRIPT FORMAT (30-second framework):
[HOOK - 0:00-0:03] Opening line that grabs attention (use customer language)
[ADDRESS - 0:03-0:15] Story/concern acknowledgment *with B-roll directions in asterisks*
[PROOF - 0:15-0:25] Demonstrate/show product solving it *with visual cues*
[CTA - 0:25-0:30] Call to action

Return ONLY valid JSON array:
[{
  "type": "objection_handler|social_proof|desire_amplifier|transformation|fear_reversal",
  "hook": "The opening line/hook (under 10 words)",
  "primaryCopy": "Main ad copy (1-2 sentences)",
  "visualDirection": "What the visual should show",
  "ugcScript": "Full 30-second script with [HOOK], [ADDRESS], [PROOF], [CTA] sections and timing",
  "targetEmotion": "primary emotion to trigger",
  "whyThisWorks": "brief explanation",
  "priority": 1-10
}]`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const jsonStr = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    const aiConcepts = JSON.parse(jsonStr);

    return aiConcepts.map((c: any) => ({
      id: uuidv4(),
      type: c.type || 'social_proof',
      hook: c.hook,
      hookSource: 'synthesized' as const,
      sourceComments: [],
      visualDirection: c.visualDirection,
      copyPoints: [c.whyThisWorks],
      targetEmotion: c.targetEmotion,
      confidence: 75,
      estimatedImpact: c.whyThisWorks,
      adFormats: ['ugc_script', 'static_image', 'video_hook'] as AdFormat[],
      primaryCopy: c.primaryCopy,
      cta: 'Shop Now',
      ugcScript: typeof c.ugcScript === 'string' ? c.ugcScript : undefined,
      priority: c.priority || 5
    }));

  } catch (err) {
    logger.warn({ err }, '[CommentMining] AI concept generation failed');
    return [];
  }
}

/**
 * Batch generate UGC scripts for concepts using Gemini AI
 */
export async function generateUGCScriptsBatch(
  concepts: CreativeConceptFromComments[],
  brandContext: { name: string; category: string }
): Promise<void> {
  if (concepts.length === 0) return;

  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const gemini = new GoogleGenerativeAI(config.geminiApiKey || '');
  const model = gemini.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const conceptSummaries = concepts.map((c, i) =>
    `${i + 1}. TYPE: ${c.type} | HOOK: "${c.hook}" | PATTERN: "${c.primaryCopy || c.hook}"`
  ).join('\n');

  const prompt = `You are a senior UGC ad scriptwriter. Generate 30-second scripts for these ad concepts.

BRAND: ${brandContext.name} (${brandContext.category})

CONCEPTS TO SCRIPT:
${conceptSummaries}

SCRIPT FORMAT (strict 30-second structure):
[HOOK - 0:00-0:03] Opening line that grabs attention, use customer language
[ADDRESS - 0:03-0:15] Story/acknowledgment *with B-roll directions in asterisks*
[PROOF - 0:15-0:25] Demonstrate product solving the concern *with visual cues*
[CTA - 0:25-0:30] Call to action

RULES:
- Conversational tone, like talking to a friend
- Use exact customer language from hooks, not marketing speak
- Include *B-roll directions* in asterisks
- Scripts must feel authentic, not salesy
- Each script must be production-ready

Return ONLY valid JSON array (same order as concepts):
[
  { "index": 1, "script": "Full formatted 30-second script with all sections" },
  ...
]`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const jsonStr = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    const scripts = JSON.parse(jsonStr);

    for (const s of scripts) {
      const idx = (s.index || 1) - 1;
      if (idx >= 0 && idx < concepts.length && typeof s.script === 'string') {
        concepts[idx].ugcScript = s.script;
      }
    }
  } catch (err) {
    logger.warn({ err }, '[CommentMining] Batch UGC script generation failed');
    // Concepts will just not have ugcScript - that's fine
  }
}

/**
 * Generate objection-specific hook
 */
export function generateObjectionHook(objection: string): string {
  const lower = objection.toLowerCase();

  if (lower.includes('price') || lower.includes('expensive') || lower.includes('worth') || lower.includes('cost')) {
    return `"Is it worth the price?" Let me show you...`;
  }
  if (lower.includes('fit') || lower.includes('size') || lower.includes('sizing')) {
    return `"Will it actually fit?" Here's the truth...`;
  }
  if (lower.includes('quality') || lower.includes('authentic') || lower.includes('real') || lower.includes('original')) {
    return `"Is this actually good quality?" Let me prove it...`;
  }
  if (lower.includes('return') || lower.includes('exchange') || lower.includes('refund')) {
    return `"What if I need to return it?" Here's our promise...`;
  }
  if (lower.includes('shipping') || lower.includes('delivery') || lower.includes('time')) {
    return `"When will it arrive?" Let's be honest...`;
  }
  if (lower.includes('fraud') || lower.includes('scam') || lower.includes('fake')) {
    return `"Is this legit?" I had the same doubt...`;
  }

  return `"${objection}" — here's what you need to know...`;
}

/**
 * Calculate priority score for a concept
 */
export function calculatePriority(frequency: number, category: CommentCategory): number {
  // Base priority by category
  const categoryBase: Record<CommentCategory, number> = {
    objection: 8,      // High priority - removes barriers
    frustration: 7,    // Address pain points
    desire: 6,         // Amplify wants
    praise: 5,         // Social proof
    use_case: 4,       // Scenario expansion
    comparison: 4,     // Competitive positioning
    question: 3,       // FAQ content
    other: 2
  };

  const base = categoryBase[category] || 3;

  // Boost by frequency
  const frequencyBoost = Math.min(2, frequency / 5);

  return Math.min(10, Math.round(base + frequencyBoost));
}

/**
 * Deduplicate similar concepts
 */
export function deduplicateConcepts(concepts: CreativeConceptFromComments[]): CreativeConceptFromComments[] {
  const seen = new Set<string>();
  const unique: CreativeConceptFromComments[] = [];

  for (const concept of concepts) {
    // Create a simple fingerprint
    const fingerprint = `${concept.type}-${concept.hook.toLowerCase().slice(0, 30)}`;

    if (!seen.has(fingerprint)) {
      seen.add(fingerprint);
      unique.push(concept);
    }
  }

  return unique;
}

/**
 * Prioritize concepts by ROI potential and renumber 1, 2, 3...
 */
export function prioritizeConcepts(
  concepts: CreativeConceptFromComments[],
  patterns: CommentPattern[]
): CreativeConceptFromComments[] {
  // Sort by priority score (highest first = most important)
  const sorted = concepts.sort((a, b) => b.priority - a.priority);

  // Renumber priorities sequentially: 1, 2, 3... (1 = create first)
  sorted.forEach((concept, index) => {
    concept.priority = index + 1;
  });

  return sorted;
}
