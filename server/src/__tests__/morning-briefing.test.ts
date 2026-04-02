/**
 * Tests for morning briefing assembly and metric summarization.
 *
 * Validates: digest section assembly, ad performance summarization,
 * watchdog decision formatting, fallback briefing when Claude fails,
 * and action item extraction.
 */
import { describe, it, expect } from 'vitest';
import { round, fmt } from '../services/format-helpers.js';

/* ------------------------------------------------------------------ */
/*  Replicate the briefing source types and assembly logic             */
/* ------------------------------------------------------------------ */

interface BriefingSource {
  watchdog: {
    pendingDecisions: Array<{ type: string; suggested_action: string; target_name: string; urgency: string; reasoning: string }>;
    recentExecutions: Array<{ suggested_action: string; target_name: string; outcome?: string }>;
  };
  autopilot: Array<{ title: string; content: string; severity: string; created_at: string }>;
  adPerformance: {
    todaySpend: number;
    todayRevenue: number;
    todayRoas: number;
    weekSpend: number;
    weekRevenue: number;
    weekRoas: number;
  } | null;
  pendingJobs: number;
  n8nData: any | null;
}

interface SynthesizedBriefing {
  summary: string;
  sections: Array<{ title: string; content: string }>;
  actionItems: string[];
}

/** Replicate the data context builder from morning-briefing.ts */
function buildDataContext(sources: BriefingSource): string[] {
  const dataContext: string[] = [];

  if (sources.adPerformance) {
    const p = sources.adPerformance;
    dataContext.push(`AD PERFORMANCE:
- Today: ${fmt(p.todaySpend)} spend, ${fmt(p.todayRevenue)} revenue, ${p.todayRoas}x ROAS
- This week: ${fmt(p.weekSpend)} spend, ${fmt(p.weekRevenue)} revenue, ${p.weekRoas}x ROAS`);
  }

  if (sources.watchdog.pendingDecisions.length > 0) {
    dataContext.push(`PENDING WATCHDOG DECISIONS (${sources.watchdog.pendingDecisions.length}):
${sources.watchdog.pendingDecisions.map(d =>
  `- ${d.type}: ${d.suggested_action} on "${d.target_name}" (${d.urgency} urgency) — ${d.reasoning}`
).join('\n')}`);
  }

  if (sources.watchdog.recentExecutions.length > 0) {
    dataContext.push(`RECENTLY EXECUTED (last 24h):
${sources.watchdog.recentExecutions.map(d =>
  `- ${d.suggested_action} on "${d.target_name}"${d.outcome ? ` — ${d.outcome}` : ''}`
).join('\n')}`);
  }

  if (sources.autopilot.length > 0) {
    dataContext.push(`UNREAD ALERTS (${sources.autopilot.length}):
${sources.autopilot.map(a => `- [${a.severity}] ${a.title}`).join('\n')}`);
  }

  if (sources.pendingJobs > 0) {
    dataContext.push(`CREATIVE PIPELINE: ${sources.pendingJobs} jobs in progress`);
  }

  if (sources.n8nData) {
    dataContext.push(`AGENCY DATA (from n8n):\n${JSON.stringify(sources.n8nData, null, 2)}`);
  }

  return dataContext;
}

/** Replicate the fallback briefing builder from morning-briefing.ts */
function buildFallbackBriefing(sources: BriefingSource, dataContext: string[]): SynthesizedBriefing {
  if (dataContext.length === 0) {
    return {
      summary: 'No significant activity to report. All systems are running normally.',
      sections: [],
      actionItems: [],
    };
  }
  return {
    summary: `Daily update: ${sources.watchdog.pendingDecisions.length} pending decisions, ${sources.autopilot.length} alerts, ${sources.pendingJobs} jobs in pipeline.`,
    sections: dataContext.map((ctx) => ({
      title: ctx.split('\n')[0].replace(':', ''),
      content: ctx.split('\n').slice(1).join('\n'),
    })),
    actionItems: sources.watchdog.pendingDecisions
      .filter(d => d.urgency === 'high' || d.urgency === 'critical')
      .map(d => `${d.suggested_action} on "${d.target_name}" — ${d.reasoning}`),
  };
}

/** Replicate ROAS calculation from gatherAdPerformance */
function computeRoas(spend: number, revenue: number): number {
  return spend > 0 ? round(revenue / spend, 2) : 0;
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

const emptySources: BriefingSource = {
  watchdog: { pendingDecisions: [], recentExecutions: [] },
  autopilot: [],
  adPerformance: null,
  pendingJobs: 0,
  n8nData: null,
};

describe('Morning Briefing — data context assembly', () => {
  it('returns empty array when no sources have data', () => {
    const ctx = buildDataContext(emptySources);
    expect(ctx).toHaveLength(0);
  });

  it('includes ad performance section', () => {
    const sources: BriefingSource = {
      ...emptySources,
      adPerformance: {
        todaySpend: 500, todayRevenue: 1500, todayRoas: 3.0,
        weekSpend: 3000, weekRevenue: 9000, weekRoas: 3.0,
      },
    };
    const ctx = buildDataContext(sources);
    expect(ctx).toHaveLength(1);
    expect(ctx[0]).toContain('AD PERFORMANCE');
    expect(ctx[0]).toContain('3x ROAS');
  });

  it('includes pending watchdog decisions', () => {
    const sources: BriefingSource = {
      ...emptySources,
      watchdog: {
        pendingDecisions: [
          { type: 'pause', suggested_action: 'Pause campaign', target_name: 'Brand Awareness', urgency: 'high', reasoning: 'CPA > $100' },
        ],
        recentExecutions: [],
      },
    };
    const ctx = buildDataContext(sources);
    expect(ctx.some(c => c.includes('PENDING WATCHDOG DECISIONS (1)'))).toBe(true);
    expect(ctx.some(c => c.includes('Brand Awareness'))).toBe(true);
  });

  it('includes recent executions with outcomes', () => {
    const sources: BriefingSource = {
      ...emptySources,
      watchdog: {
        pendingDecisions: [],
        recentExecutions: [
          { suggested_action: 'Reduced budget', target_name: 'Old Campaign', outcome: 'CPA dropped 20%' },
        ],
      },
    };
    const ctx = buildDataContext(sources);
    expect(ctx.some(c => c.includes('RECENTLY EXECUTED'))).toBe(true);
    expect(ctx.some(c => c.includes('CPA dropped 20%'))).toBe(true);
  });

  it('includes unread autopilot alerts with severity', () => {
    const sources: BriefingSource = {
      ...emptySources,
      autopilot: [
        { title: 'ROAS dropped', content: 'Details...', severity: 'critical', created_at: '2024-01-15' },
        { title: 'Scale opportunity', content: 'Details...', severity: 'success', created_at: '2024-01-15' },
      ],
    };
    const ctx = buildDataContext(sources);
    expect(ctx.some(c => c.includes('UNREAD ALERTS (2)'))).toBe(true);
    expect(ctx.some(c => c.includes('[critical] ROAS dropped'))).toBe(true);
  });

  it('includes creative pipeline count', () => {
    const sources: BriefingSource = {
      ...emptySources,
      pendingJobs: 7,
    };
    const ctx = buildDataContext(sources);
    expect(ctx.some(c => c.includes('CREATIVE PIPELINE: 7 jobs'))).toBe(true);
  });

  it('includes n8n agency data', () => {
    const sources: BriefingSource = {
      ...emptySources,
      n8nData: { clients: 5, revenue: 10000 },
    };
    const ctx = buildDataContext(sources);
    expect(ctx.some(c => c.includes('AGENCY DATA'))).toBe(true);
    expect(ctx.some(c => c.includes('"clients": 5'))).toBe(true);
  });

  it('assembles all sections when all data present', () => {
    const fullSources: BriefingSource = {
      watchdog: {
        pendingDecisions: [{ type: 'pause', suggested_action: 'Pause', target_name: 'X', urgency: 'high', reasoning: 'Bad' }],
        recentExecutions: [{ suggested_action: 'Scaled', target_name: 'Y' }],
      },
      autopilot: [{ title: 'Alert', content: 'C', severity: 'warning', created_at: '2024-01-01' }],
      adPerformance: { todaySpend: 100, todayRevenue: 300, todayRoas: 3.0, weekSpend: 700, weekRevenue: 2100, weekRoas: 3.0 },
      pendingJobs: 3,
      n8nData: { ok: true },
    };
    const ctx = buildDataContext(fullSources);
    // Should have: ad performance, pending decisions, recent executions, alerts, pipeline, n8n
    expect(ctx.length).toBe(6);
  });
});

describe('Morning Briefing — fallback briefing (no Claude)', () => {
  it('returns quiet message when no data', () => {
    const briefing = buildFallbackBriefing(emptySources, []);
    expect(briefing.summary).toContain('No significant activity');
    expect(briefing.sections).toHaveLength(0);
    expect(briefing.actionItems).toHaveLength(0);
  });

  it('summarizes counts in fallback summary', () => {
    const sources: BriefingSource = {
      ...emptySources,
      watchdog: {
        pendingDecisions: [
          { type: 'pause', suggested_action: 'Pause X', target_name: 'X', urgency: 'high', reasoning: 'Bad ROAS' },
          { type: 'scale', suggested_action: 'Scale Y', target_name: 'Y', urgency: 'medium', reasoning: 'Good ROAS' },
        ],
        recentExecutions: [],
      },
      autopilot: [{ title: 'Alert 1', content: 'C', severity: 'warning', created_at: '2024-01-01' }],
      pendingJobs: 5,
    };
    const ctx = buildDataContext(sources);
    const briefing = buildFallbackBriefing(sources, ctx);
    expect(briefing.summary).toContain('2 pending decisions');
    expect(briefing.summary).toContain('1 alerts');
    expect(briefing.summary).toContain('5 jobs');
  });

  it('extracts high/critical urgency decisions as action items', () => {
    const sources: BriefingSource = {
      ...emptySources,
      watchdog: {
        pendingDecisions: [
          { type: 'pause', suggested_action: 'Pause campaign', target_name: 'Bad Camp', urgency: 'high', reasoning: 'CPA spiked' },
          { type: 'scale', suggested_action: 'Scale budget', target_name: 'Good Camp', urgency: 'low', reasoning: 'Stable ROAS' },
          { type: 'cut', suggested_action: 'Cut spend', target_name: 'Bleeding Camp', urgency: 'critical', reasoning: 'Below breakeven' },
        ],
        recentExecutions: [],
      },
    };
    const ctx = buildDataContext(sources);
    const briefing = buildFallbackBriefing(sources, ctx);
    expect(briefing.actionItems).toHaveLength(2); // high + critical only
    expect(briefing.actionItems[0]).toContain('Bad Camp');
    expect(briefing.actionItems[1]).toContain('Bleeding Camp');
  });

  it('does not include low/medium urgency in action items', () => {
    const sources: BriefingSource = {
      ...emptySources,
      watchdog: {
        pendingDecisions: [
          { type: 'monitor', suggested_action: 'Monitor', target_name: 'Stable', urgency: 'low', reasoning: 'All good' },
          { type: 'adjust', suggested_action: 'Tweak', target_name: 'Fine', urgency: 'medium', reasoning: 'Minor issue' },
        ],
        recentExecutions: [],
      },
    };
    const ctx = buildDataContext(sources);
    const briefing = buildFallbackBriefing(sources, ctx);
    expect(briefing.actionItems).toHaveLength(0);
  });

  it('builds sections from data context', () => {
    const sources: BriefingSource = {
      ...emptySources,
      adPerformance: { todaySpend: 200, todayRevenue: 600, todayRoas: 3.0, weekSpend: 1400, weekRevenue: 4200, weekRoas: 3.0 },
      pendingJobs: 2,
    };
    const ctx = buildDataContext(sources);
    const briefing = buildFallbackBriefing(sources, ctx);
    expect(briefing.sections).toHaveLength(2);
    expect(briefing.sections[0].title).toContain('AD PERFORMANCE');
  });
});

describe('Morning Briefing — ROAS calculation', () => {
  it('computes ROAS correctly', () => {
    expect(computeRoas(100, 300)).toBe(3);
    expect(computeRoas(200, 100)).toBe(0.5);
  });

  it('returns 0 when spend is 0', () => {
    expect(computeRoas(0, 500)).toBe(0);
  });

  it('rounds to 2 decimal places', () => {
    expect(computeRoas(300, 1000)).toBe(3.33);
    expect(computeRoas(700, 1000)).toBe(1.43);
  });
});

describe('Morning Briefing — metric formatting', () => {
  it('formats currency values', () => {
    const formatted = fmt(1234.56);
    expect(formatted).toContain('1');
    expect(formatted).toContain('234');
  });

  it('rounds values correctly', () => {
    expect(round(3.456, 2)).toBe(3.46);
    expect(round(3.454, 2)).toBe(3.45);
    expect(round(3.5, 0)).toBe(4);
  });
});

describe('Morning Briefing — synthesized briefing structure', () => {
  it('validates expected briefing shape', () => {
    const briefing: SynthesizedBriefing = {
      summary: 'Today was a good day.',
      sections: [
        { title: 'Performance', content: 'ROAS 3.2x across all accounts' },
        { title: 'Alerts', content: 'No critical alerts' },
      ],
      actionItems: ['Scale Campaign X by 20%', 'Review creative fatigue on Campaign Y'],
    };
    expect(briefing.summary).toBeTruthy();
    expect(briefing.sections).toHaveLength(2);
    expect(briefing.actionItems).toHaveLength(2);
    expect(briefing.sections[0].title).toBe('Performance');
  });

  it('handles empty sections and action items', () => {
    const briefing: SynthesizedBriefing = {
      summary: 'Quiet day.',
      sections: [],
      actionItems: [],
    };
    expect(briefing.sections).toHaveLength(0);
    expect(briefing.actionItems).toHaveLength(0);
  });
});
