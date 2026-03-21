import { config } from '../config.js';
import { safeFetch } from '../utils/safe-fetch.js';

export async function sendPasswordResetEmail(
  to: string,
  name: string,
  token: string,
): Promise<boolean> {
  if (!config.resendApiKey) {
    console.warn('[Email] RESEND_API_KEY not set — password reset email not sent');
    return false;
  }

  const resetUrl = `${config.appUrl}/reset-password?token=${token}`;

  const resp = await safeFetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.resendApiKey}`,
    },
    body: JSON.stringify({
      from: config.alertEmailFrom,
      to: [to],
      subject: 'Reset your Cosmisk password',
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
          <div style="text-align: center; margin-bottom: 32px;">
            <h1 style="font-size: 24px; font-weight: 700; color: #1a1a2e; letter-spacing: 2px; margin: 0;">COSMISK</h1>
          </div>
          <div style="background: #ffffff; border-radius: 12px; padding: 32px; border: 1px solid #e5e7eb;">
            <h2 style="color: #1a1a2e; font-size: 20px; margin: 0 0 8px;">Reset your password</h2>
            <p style="color: #6b7280; font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
              Hi ${name || 'there'}, we received a request to reset your password. Click the button below to choose a new one.
            </p>
            <div style="text-align: center; margin: 32px 0;">
              <a href="${resetUrl}" style="display: inline-block; padding: 14px 32px; background: #6366f1; color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 15px; font-weight: 600;">
                Reset Password
              </a>
            </div>
            <p style="color: #9ca3af; font-size: 13px; line-height: 1.5; margin: 0;">
              This link expires in 1 hour. If you didn't request this, you can safely ignore this email.
            </p>
          </div>
          <p style="color: #d1d5db; font-size: 11px; text-align: center; margin-top: 24px;">
            Cosmisk &mdash; Creative Intelligence Platform
          </p>
        </div>
      `,
    }),
    service: 'Resend Email (Password Reset)',
    timeoutMs: 10_000,
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    console.error(`[Email] Password reset email failed: ${resp.status} ${text}`);
    return false;
  }

  return true;
}

export async function sendTeamInviteEmail(
  to: string,
  name: string,
  inviterName: string,
  token: string,
): Promise<boolean> {
  if (!config.resendApiKey) {
    console.warn('[Email] RESEND_API_KEY not set — team invite email not sent');
    return false;
  }

  const acceptUrl = `${config.appUrl}/accept-invite?token=${token}`;

  const resp = await safeFetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.resendApiKey}`,
    },
    body: JSON.stringify({
      from: config.alertEmailFrom,
      to: [to],
      subject: `${inviterName} invited you to Cosmisk`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
          <div style="text-align: center; margin-bottom: 32px;">
            <h1 style="font-size: 24px; font-weight: 700; color: #1a1a2e; letter-spacing: 2px; margin: 0;">COSMISK</h1>
          </div>
          <div style="background: #ffffff; border-radius: 12px; padding: 32px; border: 1px solid #e5e7eb;">
            <h2 style="color: #1a1a2e; font-size: 20px; margin: 0 0 8px;">You're invited to join a team</h2>
            <p style="color: #6b7280; font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
              Hi ${name || 'there'}, <strong>${inviterName}</strong> has invited you to collaborate on Cosmisk — the Creative Intelligence Platform.
            </p>
            <div style="text-align: center; margin: 32px 0;">
              <a href="${acceptUrl}" style="display: inline-block; padding: 14px 32px; background: #6366f1; color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 15px; font-weight: 600;">
                Accept Invitation
              </a>
            </div>
            <p style="color: #9ca3af; font-size: 13px; line-height: 1.5; margin: 0;">
              This invitation expires in 7 days. If you don't have a Cosmisk account, you'll be prompted to create one.
            </p>
          </div>
          <p style="color: #d1d5db; font-size: 11px; text-align: center; margin-top: 24px;">
            Cosmisk &mdash; Creative Intelligence Platform
          </p>
        </div>
      `,
    }),
    service: 'Resend Email (Team Invite)',
    timeoutMs: 10_000,
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    console.error(`[Email] Team invite email failed: ${resp.status} ${text}`);
    return false;
  }

  return true;
}
