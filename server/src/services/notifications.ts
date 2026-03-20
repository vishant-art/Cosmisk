/**
 * Notification dispatch — Slack webhooks + email (Resend API).
 * Looks up user preferences and sends to configured channels.
 */

import { config } from '../config.js';
import { getDb } from '../db/index.js';
import { safeFetch } from '../utils/safe-fetch.js';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface Alert {
  type: string;
  title: string;
  content: string;
  severity: 'info' | 'warning' | 'critical';
  accountId?: string;
}

interface NotificationPreferences {
  slack_webhook?: string;
  email_alerts?: boolean;
  alert_types?: string[];
}

/* ------------------------------------------------------------------ */
/*  Slack notification                                                  */
/* ------------------------------------------------------------------ */

async function sendSlackNotification(webhookUrl: string, alert: Alert): Promise<boolean> {
  const severityEmoji: Record<string, string> = {
    info: ':information_source:',
    warning: ':warning:',
    critical: ':rotating_light:',
  };

  try {
    const resp = await safeFetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `${severityEmoji[alert.severity] || ''} *${alert.title}*`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `${severityEmoji[alert.severity] || ''} *${alert.title}*\n${alert.content}`,
            },
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: `Type: \`${alert.type}\` | Severity: \`${alert.severity}\`${alert.accountId ? ` | Account: \`${alert.accountId}\`` : ''}`,
              },
            ],
          },
        ],
      }),
      service: 'Slack Webhook',
      timeoutMs: 10_000,
    });
    return resp.ok;
  } catch (err: unknown) {
    console.error('[Notifications] Slack send failed:', err);
    return false;
  }
}

/* ------------------------------------------------------------------ */
/*  Email notification (Resend API)                                    */
/* ------------------------------------------------------------------ */

async function sendEmailNotification(to: string, alert: Alert): Promise<boolean> {
  if (!config.resendApiKey) return false;

  try {
    const resp = await safeFetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.resendApiKey}`,
      },
      body: JSON.stringify({
        from: config.alertEmailFrom,
        to: [to],
        subject: `[Cosmisk ${alert.severity.toUpperCase()}] ${alert.title}`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: ${alert.severity === 'critical' ? '#dc2626' : alert.severity === 'warning' ? '#d97706' : '#2563eb'}">
              ${alert.title}
            </h2>
            <p style="color: #374151; font-size: 16px; line-height: 1.6;">${alert.content}</p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
            <p style="color: #9ca3af; font-size: 12px;">
              Alert type: ${alert.type} | Severity: ${alert.severity}${alert.accountId ? ` | Account: ${alert.accountId}` : ''}
            </p>
          </div>
        `,
      }),
      service: 'Resend Email',
      timeoutMs: 10_000,
    });
    return resp.ok;
  } catch (err: unknown) {
    console.error('[Notifications] Email send failed:', err);
    return false;
  }
}

/* ------------------------------------------------------------------ */
/*  Public: dispatch alert to user's configured channels               */
/* ------------------------------------------------------------------ */

export async function notifyAlert(userId: string, alert: Alert): Promise<void> {
  const db = getDb();

  // Get user preferences + email
  const user = db.prepare(
    'SELECT email, notification_preferences FROM users WHERE id = ?'
  ).get(userId) as { email: string; notification_preferences?: string } | undefined;

  if (!user) return;

  let prefs: NotificationPreferences = {};
  try {
    prefs = user.notification_preferences ? JSON.parse(user.notification_preferences) : {};
  } catch { /* use defaults */ }

  // If user has alert_types filter, skip alerts not in the list
  if (prefs.alert_types?.length && !prefs.alert_types.includes(alert.type)) {
    return;
  }

  const promises: Promise<boolean>[] = [];

  // Slack: user-level webhook > global webhook
  const slackUrl = prefs.slack_webhook || config.slackWebhookUrl;
  if (slackUrl) {
    promises.push(sendSlackNotification(slackUrl, alert));
  }

  // Email: if user has email_alerts enabled (default true for critical)
  const shouldEmail = prefs.email_alerts ?? (alert.severity === 'critical');
  if (shouldEmail && user.email) {
    promises.push(sendEmailNotification(user.email, alert));
  }

  if (promises.length > 0) {
    const results = await Promise.allSettled(promises);
    const sent = results.filter(r => r.status === 'fulfilled' && r.value).length;
    if (sent > 0) {
      console.log(`[Notifications] Sent ${sent} notification(s) for alert "${alert.title}" to user ${userId}`);
    }
  }
}
