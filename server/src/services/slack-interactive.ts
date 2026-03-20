import { config } from '../config.js';
import { getDb } from '../db/index.js';
import { executeDecision } from './ad-watchdog.js';
import { safeFetch } from '../utils/safe-fetch.js';
import type { AgentDecisionRow } from '../types/index.js';
import crypto from 'node:crypto';

/* ------------------------------------------------------------------ */
/*  Slack Block Kit: Watchdog Briefing                                 */
/* ------------------------------------------------------------------ */

interface BriefingDecision {
  id: string;
  type: string;
  targetName: string;
  reasoning: string;
  confidence: string;
  urgency: string;
  suggestedAction: string;
  estimatedImpact: string | null;
}

const URGENCY_EMOJI: Record<string, string> = {
  critical: ':rotating_light:',
  high: ':warning:',
  medium: ':large_blue_circle:',
  low: ':white_circle:',
};

const ACTION_LABELS: Record<string, string> = {
  pause: 'Pause',
  reduce_budget: 'Reduce Budget 20%',
  increase_budget: 'Increase Budget 20%',
  new_creative: 'Launch New Creative',
  monitor: 'Monitor (No Action)',
};

export function buildWatchdogBlocks(
  accountName: string,
  decisions: BriefingDecision[],
): any[] {
  const blocks: any[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `Ad Watchdog: ${accountName}`, emoji: true },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `Found *${decisions.length}* recommendation${decisions.length > 1 ? 's' : ''} requiring your attention.`,
      },
    },
    { type: 'divider' },
  ];

  for (const d of decisions) {
    const emoji = URGENCY_EMOJI[d.urgency] || ':large_blue_circle:';
    const actionLabel = ACTION_LABELS[d.suggestedAction] || d.suggestedAction;

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${emoji} *${d.type.replace(/_/g, ' ').toUpperCase()}* — ${d.targetName}\n${d.reasoning}\n_Suggested: ${actionLabel}${d.estimatedImpact ? ` | Impact: ${d.estimatedImpact}` : ''} | Confidence: ${d.confidence}_`,
      },
    });

    // Only add approve/reject buttons for actionable decisions
    if (d.suggestedAction !== 'monitor') {
      blocks.push({
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: `Approve: ${actionLabel}`, emoji: true },
            style: 'primary',
            action_id: `watchdog_approve_${d.id}`,
            value: d.id,
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Reject', emoji: true },
            style: 'danger',
            action_id: `watchdog_reject_${d.id}`,
            value: d.id,
          },
        ],
      });
    }

    blocks.push({ type: 'divider' });
  }

  return blocks;
}

/* ------------------------------------------------------------------ */
/*  Send interactive briefing via Slack                                 */
/* ------------------------------------------------------------------ */

export async function sendWatchdogBriefing(
  accountName: string,
  decisions: BriefingDecision[],
  webhookUrl?: string,
): Promise<boolean> {
  const url = webhookUrl || config.slackWebhookUrl;
  if (!url) {
    console.warn('[SlackInteractive] No Slack webhook URL configured');
    return false;
  }

  const blocks = buildWatchdogBlocks(accountName, decisions);
  const fallbackText = `Ad Watchdog: ${decisions.length} recommendations for ${accountName}`;

  try {
    const resp = await safeFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: fallbackText, blocks }),
      service: 'Slack Webhook',
      timeoutMs: 10_000,
    });
    return resp.ok;
  } catch (err: unknown) {
    console.error('[SlackInteractive] Send failed:', err);
    return false;
  }
}

/* ------------------------------------------------------------------ */
/*  Verify Slack request signature                                     */
/* ------------------------------------------------------------------ */

export function verifySlackSignature(
  signingSecret: string,
  timestamp: string,
  body: string,
  signature: string,
): boolean {
  // Reject if timestamp is more than 5 minutes old
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp, 10)) > 300) return false;

  const sigBasestring = `v0:${timestamp}:${body}`;
  const mySignature = 'v0=' + crypto
    .createHmac('sha256', signingSecret)
    .update(sigBasestring, 'utf8')
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(mySignature, 'utf8'),
    Buffer.from(signature, 'utf8'),
  );
}

/* ------------------------------------------------------------------ */
/*  Handle Slack interactive action (button click)                     */
/* ------------------------------------------------------------------ */

export async function handleSlackAction(payload: any): Promise<{ text: string }> {
  const actions = payload.actions || [];
  if (actions.length === 0) return { text: 'No action received' };

  const action = actions[0];
  const actionId: string = action.action_id || '';
  const decisionId: string = action.value || '';

  const db = getDb();
  const decision = db.prepare('SELECT * FROM agent_decisions WHERE id = ?').get(decisionId) as AgentDecisionRow | undefined;
  if (!decision) return { text: `Decision ${decisionId} not found` };

  if (actionId.startsWith('watchdog_approve_')) {
    // Approve and execute
    db.prepare(`
      UPDATE agent_decisions SET status = 'approved', approved_at = datetime('now')
      WHERE id = ?
    `).run(decisionId);

    const result = await executeDecision(decisionId);
    const actionLabel = ACTION_LABELS[decision.suggested_action] || decision.suggested_action;

    if (result.success) {
      return { text: `Approved and executed: ${actionLabel} on "${decision.target_name}"` };
    } else {
      return { text: `Approved but execution failed: ${result.message}` };
    }
  } else if (actionId.startsWith('watchdog_reject_')) {
    db.prepare(`
      UPDATE agent_decisions SET status = 'rejected'
      WHERE id = ?
    `).run(decisionId);
    return { text: `Rejected recommendation for "${decision.target_name}"` };
  }

  return { text: 'Unknown action' };
}

/* ------------------------------------------------------------------ */
/*  Morning Briefing: formatted Slack message                          */
/* ------------------------------------------------------------------ */

export function buildMorningBriefingBlocks(briefing: {
  summary: string;
  sections: Array<{ title: string; content: string }>;
  actionItems: string[];
}): any[] {
  const blocks: any[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: 'Good Morning — Your Daily Briefing', emoji: true },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: briefing.summary },
    },
    { type: 'divider' },
  ];

  for (const section of briefing.sections) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${section.title}*\n${section.content}`,
      },
    });
  }

  if (briefing.actionItems.length > 0) {
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Action Items*\n${briefing.actionItems.map((a, i) => `${i + 1}. ${a}`).join('\n')}`,
      },
    });
  }

  return blocks;
}

export async function sendMorningBriefing(
  briefing: { summary: string; sections: Array<{ title: string; content: string }>; actionItems: string[] },
  webhookUrl?: string,
): Promise<boolean> {
  const url = webhookUrl || config.slackWebhookUrl;
  if (!url) return false;

  const blocks = buildMorningBriefingBlocks(briefing);

  try {
    const resp = await safeFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'Your daily briefing is ready',
        blocks,
      }),
      service: 'Slack Webhook',
      timeoutMs: 10_000,
    });
    return resp.ok;
  } catch (err: unknown) {
    console.error('[SlackInteractive] Morning briefing send failed:', err);
    return false;
  }
}
