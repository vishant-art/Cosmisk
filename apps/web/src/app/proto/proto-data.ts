/**
 * SLICE 1 PROTOTYPE — DETERMINISTIC DEMO DATA
 *
 * Every value here is fabricated for visual review. Nothing is fetched.
 * The brand ("Nectar Supplements") and the creative set are carried over from
 * apps/web/src/app/shared/data/demo-data.ts so the prototype stays visually
 * consistent with the shipped demo dashboard.
 *
 * NO REAL CUSTOMER DATA. NO API CALLS. NO ENV TOKENS.
 */

/** The fictional operator every screen is prefilled for. */
export const DEMO_EMAIL = 'priya@nectarsupplements.in';

/* ------------------------------------------------------------------ */
/* Brand discovery — what Cosmisk "learned" from the website URL alone */
/* ------------------------------------------------------------------ */

export interface DiscoveredBrand {
  name: string;
  website: string;
  category: string;
  positioning: string;
  priceRange: string;
  pricePoint: 'Budget' | 'Mid-market' | 'Premium';
  productCount: number;
  topProducts: { name: string; price: string }[];
  audience: string;
  geography: string;
  trustSignals: string[];
  confidence: 'high' | 'medium' | 'low';
}

export const DISCOVERED_BRAND: DiscoveredBrand = {
  name: 'Nectar Supplements',
  website: 'nectarsupplements.in',
  category: 'Health & Wellness — Nutraceuticals',
  positioning:
    'Clean-label daily supplements for urban Indian women, sold on a subscription-first model.',
  priceRange: '₹599 – ₹2,499',
  pricePoint: 'Mid-market',
  productCount: 14,
  topProducts: [
    { name: 'Marine Collagen Peptides — 30 servings', price: '₹1,899' },
    { name: 'Daily Multivitamin for Women', price: '₹999' },
    { name: 'Plant Protein — Chocolate, 1kg', price: '₹2,499' },
    { name: 'Biotin + Zinc Hair Complex', price: '₹599' },
  ],
  audience: 'Women 25–40, metro tier-1, health-conscious, repeat buyers',
  geography: 'India — Mumbai, Bengaluru, Delhi NCR, Pune, Hyderabad',
  trustSignals: [
    '4.6★ from 2,847 reviews',
    'FSSAI certified',
    '30-day money-back guarantee',
    'Free shipping above ₹799',
  ],
  confidence: 'high',
};

/* ------------------------------------------------------------------ */
/* Creatives                                                           */
/* ------------------------------------------------------------------ */

export interface ProtoCreative {
  id: string;
  name: string;
  format: 'video' | 'static' | 'carousel';
  status: 'winning' | 'stable' | 'fatiguing';
  thumbBg: string;
  thumbText: string;
  roas: number;
  roasWas?: number;
  ctr: number;
  ctrWas?: number;
  spend: number;
  revenue: number;
  frequency: number;
  daysActive: number;
  changePct: number;
  direction: 'up' | 'down' | 'flat';
  hook: string;
}

/**
 * ARITHMETIC CONTRACT — every number below must survive being checked.
 *
 *   per creative:  spend × roas = revenue           (exact, all six)
 *   these six:     ₹10,10,000 spend · ₹33,61,000 revenue
 *   whole account: ₹18,40,000 spend · ₹58,90,000 revenue · ROAS 3.2
 *   the other 41:  ₹8,30,000 spend · ₹25,29,000 revenue · ROAS 3.05
 *
 * All figures are LAST 30 DAYS, so they compare directly against the KPI strip.
 * `daysActive` is how long the creative has been live, which is longer.
 */
export const PROTO_CREATIVES: ProtoCreative[] = [
  {
    id: 'cr-003', name: '₹999 for 30 Days', format: 'static', status: 'winning',
    thumbBg: '#D1FAE5', thumbText: '#065F46',
    roas: 5.2, ctr: 3.2, spend: 190000, revenue: 988000, frequency: 2.1,
    daysActive: 28, changePct: 8, direction: 'up', hook: 'Price Anchor',
  },
  {
    id: 'cr-001', name: 'Collagen Glow-Up', format: 'video', status: 'winning',
    thumbBg: '#FEF3C7', thumbText: '#92400E',
    roas: 4.8, ctr: 2.1, spend: 150000, revenue: 720000, frequency: 3.4,
    daysActive: 14, changePct: 12, direction: 'up', hook: 'Shock Statement',
  },
  {
    id: 'cr-006', name: 'Unboxing', format: 'video', status: 'winning',
    thumbBg: '#FEF3C7', thumbText: '#92400E',
    roas: 4.2, ctr: 2.8, spend: 90000, revenue: 378000, frequency: 1.8,
    daysActive: 7, changePct: 18, direction: 'up', hook: 'Curiosity',
  },
  {
    id: 'cr-002', name: 'Morning Routine with Nectar', format: 'video', status: 'stable',
    thumbBg: '#DBEAFE', thumbText: '#1E40AF',
    roas: 3.9, ctr: 1.8, spend: 90000, revenue: 351000, frequency: 3.1,
    daysActive: 21, changePct: 2, direction: 'flat', hook: 'Personal Story',
  },
  {
    id: 'cr-004', name: 'Before/After 60 Days', format: 'carousel', status: 'fatiguing',
    thumbBg: '#FEE2E2', thumbText: '#EF4444',
    roas: 2.1, roasWas: 3.6, ctr: 1.2, ctrWas: 2.4,
    spend: 140000, revenue: 294000, frequency: 5.2,
    daysActive: 35, changePct: -18, direction: 'down', hook: 'Transformation',
  },
  {
    id: 'cr-007', name: 'Summer Sale 40% Off', format: 'static', status: 'fatiguing',
    thumbBg: '#FEE2E2', thumbText: '#EF4444',
    roas: 1.8, roasWas: 3.4, ctr: 1.1, ctrWas: 2.6,
    spend: 350000, revenue: 630000, frequency: 6.8,
    daysActive: 42, changePct: -24, direction: 'down', hook: 'Urgency',
  },
];

/** Shown under the creative table so the subset is explicit, not implied. */
export const CREATIVES_SHOWN_NOTE = '6 of 47 shown · ₹10.1L of ₹18.4L spend';

/* ------------------------------------------------------------------ */
/* The first finding — the "aha" moment                                */
/* ------------------------------------------------------------------ */

export interface Evidence {
  label: string;
  value: string;
  detail?: string;
  tone?: 'bad' | 'good' | 'neutral';
}

export const FIRST_FINDING = {
  severity: 'Costing you money' as const,
  confidence: 'High confidence' as const,
  basedOn: '42 days of account history · 47 creatives · 8 campaigns',

  headline: '₹4.9L a month is going to two creatives that stopped working three weeks ago.',

  subhead:
    'Both are still running at full budget. Neither has been paused. Together they are your ' +
    'second and fourth largest line items.',

  evidence: <Evidence[]>[
    {
      label: 'Summer Sale 40% Off',
      value: 'ROAS 1.8',
      detail: 'was 3.4 in its first 14 days · CTR 1.1% (was 2.6%) · ₹3,50,000 spent · ₹6,30,000 back · frequency 6.8 · live 42 days',
      tone: 'bad',
    },
    {
      label: 'Before/After 60 Days',
      value: 'ROAS 2.1',
      detail: 'was 3.6 in its first 14 days · CTR 1.2% (was 2.4%) · ₹1,40,000 spent · ₹2,94,000 back · frequency 5.2 · live 35 days',
      tone: 'bad',
    },
    {
      label: 'Account average ROAS',
      value: '3.2',
      detail: 'Both creatives are running roughly 40% below your own account average.',
      tone: 'neutral',
    },
    {
      label: '₹999 for 30 Days',
      value: 'ROAS 5.2',
      detail: 'frequency 2.1 · still improving week over week · not budget-capped',
      tone: 'good',
    },
  ],

  interpretation: [
    'These are your two oldest live creatives, and both are above frequency 5.0 — your audience has ' +
      'now seen each of them five to seven times.',
    'This is not a creative quality problem. Both opened above ROAS 3.4, which is at or above your ' +
      'account average. They worked, and then the audience ran out.',
    'The pattern is the angle, not the format: both lead on a promise (Urgency, Transformation) ' +
      'across a static and a carousel, while "₹999 for 30 Days" — also a static — leads on price ' +
      'and is your best at 5.2. Cosmisk holds that as a working pattern from six creatives, not a rule.',
  ],

  interpretationCaveat:
    'One alternative reading: a competitor may have entered the same auction and pushed your CPMs up. ' +
    'Cosmisk cannot see competitor auction data yet, so frequency is the stronger explanation.',

  recommendation: {
    action: 'Pause both creatives and move the combined ₹4,90,000 to "₹999 for 30 Days".',
    reasoning:
      'It is your highest-ROAS creative at 5.2, its frequency is only 2.1, and it is not budget-capped ' +
      '— so it has room to absorb the spend before it saturates.',

    /**
     * Shown as steps, not as a single confident number. A projection the user
     * cannot audit is indistinguishable from a guess, and Cosmisk is asking them
     * to move ₹4.9L on the strength of it.
     */
    projection: [
      { label: 'That ₹4,90,000 today', value: '₹9,24,000 back', note: 'blended ROAS 1.89 across the two' },
      { label: 'Same spend at 3.5 ROAS', value: '₹17,15,000 back', note: 'not 5.2 — see the haircut' },
      { label: 'Difference', value: '+₹7,91,000 / month', note: 'if the assumption holds' },
    ],
    projectionAssumption:
      'Modelled at ROAS 3.5, not the 5.2 that creative does today. Efficiency almost always falls when ' +
      'you put 6x the budget behind one creative, so Cosmisk assumes it lands nearer your account average.',
    caveat: 'Re-check frequency after 7 days. If it passes 4.0, this creative is saturating too.',
    effort: '2 minutes in Ads Manager',
  },
};

/* ------------------------------------------------------------------ */
/* Dashboard                                                           */
/* ------------------------------------------------------------------ */

export interface Kpi {
  label: string;
  value: string;
  change: string;
  dir: 'up' | 'down';
  /** Is this movement good for the user? null = neither good nor bad on its own. */
  good: boolean | null;
  sub: string;
}

/**
 * The account story in four numbers: you spent 12% more and got the same revenue
 * back, so ROAS fell 3.6 → 3.2 and the waste grew. This is the same story the
 * finding and the AI answer tell — they must never disagree.
 *
 *   prev 30d:  ₹16.4L spend × 3.6 = ₹59.0L revenue
 *   this 30d:  ₹18.4L spend × 3.2 = ₹58.9L revenue
 */
export const PROTO_KPI: Kpi[] = [
  { label: 'Spend', value: '₹18.4L', change: '+12.3%', dir: 'up', good: null, sub: 'vs previous 30 days' },
  { label: 'Revenue', value: '₹58.9L', change: '−0.2%', dir: 'down', good: false, sub: 'vs previous 30 days' },
  { label: 'ROAS', value: '3.2', change: '−0.4', dir: 'down', good: false, sub: 'was 3.6' },
  { label: 'Wasted spend', value: '₹4.9L', change: '+24%', dir: 'up', good: false, sub: 'flagged by Cosmisk' },
];

export interface Signal {
  kind: 'warning' | 'opportunity' | 'pattern';
  title: string;
  body: string;
  meta: string;
}

export const PROTO_SIGNALS: Signal[] = [
  {
    kind: 'warning',
    title: '₹4.9L going to two dead creatives',
    body: '"Summer Sale 40% Off" (ROAS 1.8) and "Before/After 60 Days" (ROAS 2.1) are both above frequency 5.0 and still at full budget.',
    meta: 'Costing you money · High confidence',
  },
  {
    kind: 'opportunity',
    title: '"Unboxing" has room to scale',
    body: 'ROAS 4.2 and climbing, frequency only 1.8 after 7 days. It has not hit saturation and is not budget-capped.',
    meta: 'Opportunity · Medium confidence',
  },
  {
    kind: 'pattern',
    title: 'Price Anchor hooks outperform by 2.1x',
    body: 'Across 47 creatives, hooks that lead with a specific price return 2.1x the ROAS of every other hook type in your account.',
    meta: 'Pattern · Based on 42 days',
  },
];

/* ------------------------------------------------------------------ */
/* First AI interaction — pre-seeded from the finding above            */
/* ------------------------------------------------------------------ */

export const SUGGESTED_QUESTIONS = [
  'Why did ROAS drop?',
  'Which creative should I scale?',
  'What is working in my account right now?',
];

export interface AiBlock {
  type: 'takeaway' | 'diagnosis' | 'evidence' | 'interpretation' | 'action' | 'future';
  text?: string;
  rows?: { label: string; value: string; detail: string; tone?: 'bad' | 'good' | 'neutral' }[];
  items?: string[];
}

export const AI_ANSWER: Record<string, AiBlock[]> = {
  'Why did ROAS drop?': [
    {
      type: 'takeaway',
      text: 'Your blended ROAS did not drop across the account — it dropped in two creatives that are dragging the average down.',
    },
    {
      type: 'diagnosis',
      text:
        'Blended ROAS moved from 3.6 to 3.2 over the last 21 days. Isolating by creative, four of your six ' +
        'active creatives held or improved. The entire decline is concentrated in "Summer Sale 40% Off" and ' +
        '"Before/After 60 Days".',
    },
    {
      type: 'evidence',
      rows: [
        { label: 'Summer Sale 40% Off', value: '3.4 → 1.8', detail: 'frequency 6.8 · 42 days live · ₹3,50,000 spent', tone: 'bad' },
        { label: 'Before/After 60 Days', value: '3.6 → 2.1', detail: 'frequency 5.2 · 35 days live · ₹1,40,000 spent', tone: 'bad' },
        { label: '₹999 for 30 Days', value: '4.9 → 5.2', detail: 'frequency 2.1 · improving', tone: 'good' },
        { label: 'Unboxing', value: '3.6 → 4.2', detail: 'frequency 1.8 · improving', tone: 'good' },
      ],
    },
    {
      type: 'interpretation',
      items: [
        'Both declining creatives crossed frequency 5.0 about three weeks in, and both lost roughly half their CTR at the same point.',
        'Both opened above ROAS 3.4, so this is audience saturation rather than weak creative.',
        'Your two healthy creatives are both under frequency 2.2 — which is the clearest signal that the audience, not the message, is the constraint.',
        'Looking at the creative itself rather than the delivery: both decliners lead on a promise angle (Urgency, Transformation) across two different formats, while your best performer leads on a price. That is the pattern Cosmisk is currently carrying for your account — six creatives is thin evidence, so it will revise it as more run.',
      ],
    },
    {
      type: 'action',
      items: [
        'Pause "Summer Sale 40% Off" and "Before/After 60 Days" — together they are burning ₹4,90,000 a month at below-average return.',
        'Move that budget to "₹999 for 30 Days" (ROAS 5.2, frequency 2.1, not capped).',
        'Re-check frequency in 7 days. If it passes 4.0, rotate before it decays the same way.',
      ],
    },
    {
      type: 'future',
      text: 'Pause these two creatives and reallocate the budget for me',
    },
  ],
};
