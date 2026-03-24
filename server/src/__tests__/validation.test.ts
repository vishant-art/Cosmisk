import { describe, it, expect } from 'vitest';
import {
  loginSchema,
  registerSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  teamInviteSchema,
  teamRoleSchema,
  teamAcceptSchema,
  idParamSchema,
  contentBankQuerySchema,
  contentSaveSchema,
  automationCreateSchema,
  checkoutSchema,
  verifyPaymentSchema,
  swipeFileSaveSchema,
  profileUpdateSchema,
  imageGenerateSchema,
  videoGenerateSchema,
  agentRunsQuerySchema,
  agentDecisionsQuerySchema,
  datePresetQuerySchema,
  autopilotAlertsQuerySchema,
  autopilotMarkReadSchema,
  reportGenerateSchema,
  reportWeeklySchema,
  aiChatSchema,
  oauthCodeSchema,
  contentUpdateSchema,
  directorBriefSchema,
  creativeScoreSchema,
  competitorSearchSchema,
  ugcCreateProjectSchema,
} from '../validation/schemas.js';

/* ------------------------------------------------------------------ */
/*  Auth schemas                                                       */
/* ------------------------------------------------------------------ */

describe('loginSchema', () => {
  it('accepts valid email + password', () => {
    const r = loginSchema.safeParse({ email: 'user@test.com', password: 'secret123' });
    expect(r.success).toBe(true);
  });

  it('rejects missing password', () => {
    const r = loginSchema.safeParse({ email: 'user@test.com' });
    expect(r.success).toBe(false);
  });

  it('rejects invalid email', () => {
    const r = loginSchema.safeParse({ email: 'notanemail', password: 'x' });
    expect(r.success).toBe(false);
  });

  it('rejects empty password', () => {
    const r = loginSchema.safeParse({ email: 'a@b.com', password: '' });
    expect(r.success).toBe(false);
  });
});

describe('registerSchema', () => {
  it('accepts valid registration', () => {
    const r = registerSchema.safeParse({ name: 'Test', email: 'a@b.com', password: 'longpassword' });
    expect(r.success).toBe(true);
  });

  it('rejects short password', () => {
    const r = registerSchema.safeParse({ name: 'Test', email: 'a@b.com', password: '1234567' });
    expect(r.success).toBe(false);
  });

  it('rejects empty name', () => {
    const r = registerSchema.safeParse({ name: '', email: 'a@b.com', password: '12345678' });
    expect(r.success).toBe(false);
  });

  it('rejects name over 200 chars', () => {
    const r = registerSchema.safeParse({ name: 'a'.repeat(201), email: 'a@b.com', password: '12345678' });
    expect(r.success).toBe(false);
  });
});

describe('forgotPasswordSchema', () => {
  it('accepts valid email', () => {
    expect(forgotPasswordSchema.safeParse({ email: 'a@b.com' }).success).toBe(true);
  });
  it('rejects missing email', () => {
    expect(forgotPasswordSchema.safeParse({}).success).toBe(false);
  });
});

describe('resetPasswordSchema', () => {
  it('accepts valid token + password', () => {
    expect(resetPasswordSchema.safeParse({ token: 'abc123', password: '12345678' }).success).toBe(true);
  });
  it('rejects short password', () => {
    expect(resetPasswordSchema.safeParse({ token: 'abc', password: '1234' }).success).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  Team schemas                                                       */
/* ------------------------------------------------------------------ */

describe('teamInviteSchema', () => {
  it('accepts email with default role', () => {
    const r = teamInviteSchema.safeParse({ email: 'NEW@Test.COM' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.email).toBe('new@test.com'); // lowercased
      expect(r.data.role).toBe('viewer');         // default
    }
  });

  it('accepts all valid roles', () => {
    for (const role of ['admin', 'media_buyer', 'designer', 'viewer']) {
      expect(teamInviteSchema.safeParse({ email: 'a@b.com', role }).success).toBe(true);
    }
  });

  it('rejects invalid role', () => {
    expect(teamInviteSchema.safeParse({ email: 'a@b.com', role: 'superadmin' }).success).toBe(false);
  });

  it('rejects invalid email', () => {
    expect(teamInviteSchema.safeParse({ email: 'not-email' }).success).toBe(false);
  });
});

describe('teamRoleSchema', () => {
  it('accepts valid roles', () => {
    expect(teamRoleSchema.safeParse({ role: 'admin' }).success).toBe(true);
    expect(teamRoleSchema.safeParse({ role: 'media_buyer' }).success).toBe(true);
  });
  it('rejects owner role', () => {
    expect(teamRoleSchema.safeParse({ role: 'owner' }).success).toBe(false);
  });
});

describe('teamAcceptSchema', () => {
  it('accepts non-empty token', () => {
    expect(teamAcceptSchema.safeParse({ token: 'abc123' }).success).toBe(true);
  });
  it('rejects empty token', () => {
    expect(teamAcceptSchema.safeParse({ token: '' }).success).toBe(false);
  });
});

describe('idParamSchema', () => {
  it('accepts valid UUID', () => {
    expect(idParamSchema.safeParse({ id: '550e8400-e29b-41d4-a716-446655440000' }).success).toBe(true);
  });
  it('accepts uppercase UUID', () => {
    expect(idParamSchema.safeParse({ id: '550E8400-E29B-41D4-A716-446655440000' }).success).toBe(true);
  });
  it('rejects non-UUID string', () => {
    expect(idParamSchema.safeParse({ id: 'not-a-uuid' }).success).toBe(false);
  });
  it('rejects empty string', () => {
    expect(idParamSchema.safeParse({ id: '' }).success).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  Content schemas                                                    */
/* ------------------------------------------------------------------ */

describe('contentBankQuerySchema', () => {
  it('applies defaults for empty query', () => {
    const r = contentBankQuerySchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.limit).toBe(50);
      expect(r.data.offset).toBe(0);
    }
  });

  it('coerces string numbers', () => {
    const r = contentBankQuerySchema.safeParse({ limit: '25', offset: '10' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.limit).toBe(25);
      expect(r.data.offset).toBe(10);
    }
  });

  it('clamps limit to 100', () => {
    expect(contentBankQuerySchema.safeParse({ limit: '200' }).success).toBe(false);
  });

  it('rejects invalid status', () => {
    expect(contentBankQuerySchema.safeParse({ status: 'invalid' }).success).toBe(false);
  });
});

describe('contentSaveSchema', () => {
  it('accepts valid content', () => {
    const r = contentSaveSchema.safeParse({ platform: 'twitter', content_type: 'post', body: 'Hello world' });
    expect(r.success).toBe(true);
  });

  it('rejects missing body', () => {
    expect(contentSaveSchema.safeParse({ platform: 'twitter', content_type: 'post' }).success).toBe(false);
  });

  it('rejects body over 10000 chars', () => {
    expect(contentSaveSchema.safeParse({ platform: 'x', content_type: 'y', body: 'a'.repeat(10001) }).success).toBe(false);
  });

  it('accepts hashtags array', () => {
    const r = contentSaveSchema.safeParse({ platform: 'ig', content_type: 'post', body: 'test', hashtags: ['#a', '#b'] });
    expect(r.success).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  Automation schemas                                                 */
/* ------------------------------------------------------------------ */

describe('automationCreateSchema', () => {
  it('accepts valid automation', () => {
    const r = automationCreateSchema.safeParse({
      account_id: 'act_123',
      name: 'Pause high CPA',
      trigger_type: 'cpa_above',
      action_type: 'pause',
    });
    expect(r.success).toBe(true);
  });

  it('rejects invalid trigger_type', () => {
    expect(automationCreateSchema.safeParse({
      account_id: 'x', name: 'test', trigger_type: 'invalid', action_type: 'pause',
    }).success).toBe(false);
  });

  it('rejects invalid action_type', () => {
    expect(automationCreateSchema.safeParse({
      account_id: 'x', name: 'test', trigger_type: 'cpa_above', action_type: 'delete',
    }).success).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  Billing schemas                                                    */
/* ------------------------------------------------------------------ */

describe('checkoutSchema', () => {
  it('accepts valid checkout with defaults', () => {
    const r = checkoutSchema.safeParse({ plan: 'solo' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.interval).toBe('monthly');
      expect(r.data.gateway).toBe('razorpay');
    }
  });

  it('accepts annual interval', () => {
    const r = checkoutSchema.safeParse({ plan: 'growth', interval: 'annual', gateway: 'stripe' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.interval).toBe('annual');
      expect(r.data.gateway).toBe('stripe');
    }
  });

  it('rejects free plan', () => {
    expect(checkoutSchema.safeParse({ plan: 'free' }).success).toBe(false);
  });

  it('rejects invalid plan', () => {
    expect(checkoutSchema.safeParse({ plan: 'enterprise' }).success).toBe(false);
  });
});

describe('verifyPaymentSchema', () => {
  it('accepts valid payment data', () => {
    const r = verifyPaymentSchema.safeParse({
      razorpay_payment_id: 'pay_123',
      razorpay_subscription_id: 'sub_456',
      razorpay_signature: 'sig_789',
      plan: 'solo',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.interval).toBe('monthly'); // default
    }
  });

  it('rejects missing signature', () => {
    expect(verifyPaymentSchema.safeParse({
      razorpay_payment_id: 'pay_123',
      razorpay_subscription_id: 'sub_456',
      plan: 'solo',
    }).success).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  Swipe File schemas                                                 */
/* ------------------------------------------------------------------ */

describe('swipeFileSaveSchema', () => {
  it('accepts minimal swipe file with defaults', () => {
    const r = swipeFileSaveSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.brand).toBe('');
      expect(r.data.hookDna).toEqual([]);
      expect(r.data.visualDna).toEqual([]);
      expect(r.data.audioDna).toEqual([]);
    }
  });

  it('accepts full swipe file', () => {
    const r = swipeFileSaveSchema.safeParse({
      brand: 'Nike',
      thumbnail: 'https://example.com/thumb.jpg',
      hookDna: ['hook1', 'hook2'],
      visualDna: ['visual1'],
      audioDna: ['audio1'],
      notes: 'Great ad',
      sourceUrl: 'https://facebook.com/ads/123',
    });
    expect(r.success).toBe(true);
  });

  it('rejects invalid thumbnail URL', () => {
    expect(swipeFileSaveSchema.safeParse({ thumbnail: 'not-a-url' }).success).toBe(false);
  });

  it('rejects too many DNA tags', () => {
    expect(swipeFileSaveSchema.safeParse({ hookDna: Array(21).fill('tag') }).success).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  Settings schemas                                                   */
/* ------------------------------------------------------------------ */

describe('profileUpdateSchema', () => {
  it('accepts partial update', () => {
    expect(profileUpdateSchema.safeParse({ name: 'New Name' }).success).toBe(true);
  });

  it('accepts empty object', () => {
    expect(profileUpdateSchema.safeParse({}).success).toBe(true);
  });

  it('accepts empty string website_url', () => {
    expect(profileUpdateSchema.safeParse({ website_url: '' }).success).toBe(true);
  });

  it('accepts valid website_url', () => {
    expect(profileUpdateSchema.safeParse({ website_url: 'https://cosmisk.ai' }).success).toBe(true);
  });

  it('rejects invalid website_url', () => {
    expect(profileUpdateSchema.safeParse({ website_url: 'not-a-url' }).success).toBe(false);
  });

  it('rejects name over 200 chars', () => {
    expect(profileUpdateSchema.safeParse({ name: 'a'.repeat(201) }).success).toBe(false);
  });

  it('accepts goals array', () => {
    const r = profileUpdateSchema.safeParse({ goals: ['grow revenue', 'reduce CPA'] });
    expect(r.success).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  Media generation schemas                                           */
/* ------------------------------------------------------------------ */

describe('imageGenerateSchema', () => {
  it('accepts valid prompt', () => {
    expect(imageGenerateSchema.safeParse({ prompt: 'A beautiful sunset' }).success).toBe(true);
  });
  it('rejects empty prompt', () => {
    expect(imageGenerateSchema.safeParse({ prompt: '' }).success).toBe(false);
  });
  it('rejects missing prompt', () => {
    expect(imageGenerateSchema.safeParse({}).success).toBe(false);
  });
  it('accepts optional style and aspect_ratio', () => {
    const r = imageGenerateSchema.safeParse({ prompt: 'test', style: 'cinematic', aspect_ratio: '16:9' });
    expect(r.success).toBe(true);
  });
});

describe('videoGenerateSchema', () => {
  it('accepts valid script', () => {
    expect(videoGenerateSchema.safeParse({ script: 'Hello world video' }).success).toBe(true);
  });
  it('rejects empty script', () => {
    expect(videoGenerateSchema.safeParse({ script: '' }).success).toBe(false);
  });
  it('accepts duration as number', () => {
    const r = videoGenerateSchema.safeParse({ script: 'test', duration: 30 });
    expect(r.success).toBe(true);
  });
  it('rejects duration over 120', () => {
    expect(videoGenerateSchema.safeParse({ script: 'test', duration: 200 }).success).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  Agent query schemas                                                */
/* ------------------------------------------------------------------ */

describe('agentRunsQuerySchema', () => {
  it('applies defaults for empty query', () => {
    const r = agentRunsQuerySchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.limit).toBe(30);
      expect(r.data.agent_type).toBeUndefined();
    }
  });
  it('accepts valid agent_type', () => {
    expect(agentRunsQuerySchema.safeParse({ agent_type: 'watchdog' }).success).toBe(true);
    expect(agentRunsQuerySchema.safeParse({ agent_type: 'report' }).success).toBe(true);
  });
  it('rejects invalid agent_type', () => {
    expect(agentRunsQuerySchema.safeParse({ agent_type: 'invalid' }).success).toBe(false);
  });
});

describe('agentDecisionsQuerySchema', () => {
  it('applies defaults for empty query', () => {
    const r = agentDecisionsQuerySchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.limit).toBe(50);
  });
  it('accepts valid status', () => {
    expect(agentDecisionsQuerySchema.safeParse({ status: 'pending' }).success).toBe(true);
    expect(agentDecisionsQuerySchema.safeParse({ status: 'executed' }).success).toBe(true);
  });
  it('rejects invalid status', () => {
    expect(agentDecisionsQuerySchema.safeParse({ status: 'unknown' }).success).toBe(false);
  });
});

describe('datePresetQuerySchema', () => {
  it('defaults to last_7d', () => {
    const r = datePresetQuerySchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.date_preset).toBe('last_7d');
  });
  it('accepts valid presets', () => {
    expect(datePresetQuerySchema.safeParse({ date_preset: 'last_30d' }).success).toBe(true);
    expect(datePresetQuerySchema.safeParse({ date_preset: 'today' }).success).toBe(true);
  });
  it('rejects invalid preset', () => {
    expect(datePresetQuerySchema.safeParse({ date_preset: 'last_year' }).success).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  Autopilot schemas                                                  */
/* ------------------------------------------------------------------ */

describe('autopilotAlertsQuerySchema', () => {
  it('accepts defaults', () => {
    const r = autopilotAlertsQuerySchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.limit).toBe(50);
      expect(r.data.unread_only).toBe('false');
    }
  });
  it('accepts custom limit', () => {
    expect(autopilotAlertsQuerySchema.safeParse({ limit: '20', unread_only: 'true' }).success).toBe(true);
  });
  it('rejects limit > 200', () => {
    expect(autopilotAlertsQuerySchema.safeParse({ limit: '999' }).success).toBe(false);
  });
});

describe('autopilotMarkReadSchema', () => {
  it('accepts mark_all', () => {
    expect(autopilotMarkReadSchema.safeParse({ mark_all: true }).success).toBe(true);
  });
  it('accepts alert_ids', () => {
    expect(autopilotMarkReadSchema.safeParse({ alert_ids: ['abc', 'def'] }).success).toBe(true);
  });
  it('accepts empty body', () => {
    expect(autopilotMarkReadSchema.safeParse({}).success).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  Report schemas                                                     */
/* ------------------------------------------------------------------ */

describe('reportGenerateSchema', () => {
  it('accepts valid report request', () => {
    const r = reportGenerateSchema.safeParse({ account_id: 'act_123', type: 'performance' });
    expect(r.success).toBe(true);
  });
  it('rejects missing account_id', () => {
    expect(reportGenerateSchema.safeParse({ type: 'creative' }).success).toBe(false);
  });
  it('rejects invalid type', () => {
    expect(reportGenerateSchema.safeParse({ account_id: 'act_123', type: 'invalid' }).success).toBe(false);
  });
  it('defaults type to performance', () => {
    const r = reportGenerateSchema.safeParse({ account_id: 'act_123' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.type).toBe('performance');
  });
});

describe('reportWeeklySchema', () => {
  it('accepts valid account_id', () => {
    expect(reportWeeklySchema.safeParse({ account_id: 'act_123' }).success).toBe(true);
  });
  it('rejects empty account_id', () => {
    expect(reportWeeklySchema.safeParse({ account_id: '' }).success).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  AI Chat schema                                                     */
/* ------------------------------------------------------------------ */

describe('aiChatSchema', () => {
  it('accepts valid chat message', () => {
    const r = aiChatSchema.safeParse({ message: 'How are my ads doing?' });
    expect(r.success).toBe(true);
  });
  it('rejects empty message', () => {
    expect(aiChatSchema.safeParse({ message: '' }).success).toBe(false);
  });
  it('accepts message with history', () => {
    const r = aiChatSchema.safeParse({
      message: 'What about last week?',
      history: [{ role: 'user', content: 'Hi' }, { role: 'ai', content: 'Hello' }],
    });
    expect(r.success).toBe(true);
  });
  it('rejects history with invalid role', () => {
    expect(aiChatSchema.safeParse({
      message: 'test',
      history: [{ role: 'system', content: 'hack' }],
    }).success).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  OAuth code schema                                                  */
/* ------------------------------------------------------------------ */

describe('oauthCodeSchema', () => {
  it('accepts valid code', () => {
    expect(oauthCodeSchema.safeParse({ code: 'AQB1234' }).success).toBe(true);
  });
  it('rejects empty code', () => {
    expect(oauthCodeSchema.safeParse({ code: '' }).success).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  Content update schema                                              */
/* ------------------------------------------------------------------ */

describe('contentUpdateSchema', () => {
  it('accepts status update', () => {
    expect(contentUpdateSchema.safeParse({ status: 'posted' }).success).toBe(true);
  });
  it('rejects invalid status', () => {
    expect(contentUpdateSchema.safeParse({ status: 'invalid' }).success).toBe(false);
  });
  it('accepts body update', () => {
    expect(contentUpdateSchema.safeParse({ body: 'New content' }).success).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  Director Lab schemas                                               */
/* ------------------------------------------------------------------ */

describe('directorBriefSchema', () => {
  it('accepts valid brief', () => {
    expect(directorBriefSchema.safeParse({ format: 'ugc_video', target_audience: 'D2C brands' }).success).toBe(true);
  });
  it('accepts empty brief', () => {
    expect(directorBriefSchema.safeParse({}).success).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  Score schemas                                                      */
/* ------------------------------------------------------------------ */

describe('creativeScoreSchema', () => {
  it('accepts url + format', () => {
    expect(creativeScoreSchema.safeParse({ url: 'https://example.com/ad.mp4', format: 'video' }).success).toBe(true);
  });
  it('accepts empty object', () => {
    expect(creativeScoreSchema.safeParse({}).success).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  Competitor Spy schema                                              */
/* ------------------------------------------------------------------ */

describe('competitorSearchSchema', () => {
  it('accepts valid query', () => {
    const r = competitorSearchSchema.safeParse({ query: 'nike' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.limit).toBe(10);
  });
  it('rejects empty query', () => {
    expect(competitorSearchSchema.safeParse({ query: '' }).success).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  UGC schemas                                                        */
/* ------------------------------------------------------------------ */

describe('ugcCreateProjectSchema', () => {
  it('accepts valid project', () => {
    expect(ugcCreateProjectSchema.safeParse({ name: 'Summer Campaign', brand_name: 'Nike' }).success).toBe(true);
  });
  it('accepts empty body', () => {
    expect(ugcCreateProjectSchema.safeParse({}).success).toBe(true);
  });
  it('rejects too many concepts', () => {
    expect(ugcCreateProjectSchema.safeParse({ num_concepts: 100 }).success).toBe(false);
  });
});
