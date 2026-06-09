/**
 * CLIENT CONTEXT STORE
 *
 * Persistent client configuration that agents reference on every run.
 * This solves the "agent doesn't know the client setup" problem.
 *
 * Features:
 * - Multi-account Meta Ads setup (India + USA + etc.)
 * - Multi-store Shopify setup
 * - Client brief and business context
 * - Geographic segmentation rules
 */

import { getDbAdapter } from '../db/adapter.js';
import { logger } from '../utils/logger.js';

// ============================================================================
// TYPES
// ============================================================================

export interface MetaAccount {
  id: string;           // act_XXXXXXXXXX
  name: string;         // "Pratapsons India"
  region: string;       // "India" | "USA" | "Global"
  currency: string;     // "INR" | "USD"
  isActive: boolean;
}

export interface ShopifyStore {
  domain: string;       // pratapsons.myshopify.com
  name: string;         // "Pratapsons India"
  region: string;       // "India" | "USA" | "Global"
  accessToken?: string; // Encrypted
  isActive: boolean;
}

export interface ClientBrief {
  category: string;           // "Premium Ethnic Menswear"
  targetAudience: string;     // "NRI + India affluent males 28-55"
  avgOrderValue: string;      // "₹3500-5000"
  seasonality: string;        // "Wedding season peaks: Oct-Feb, Apr-Jun"
  competitors: string[];      // ["Manyavar", "FabIndia", "Raymond"]
  brandVoice: string;         // "Heritage, craftsmanship, premium quality"
  primaryGoals: string[];     // ["Scale USA", "Maintain India ROAS"]
  knownConstraints: string[]; // ["Limited creative bandwidth", "COD heavy in India"]
}

export interface GeographicSegment {
  name: string;         // "Tier-2 India"
  regions: string[];    // ["Jaipur", "Lucknow", "Chandigarh"]
  performance: 'high' | 'medium' | 'low' | 'unknown';
  notes: string;
}

export interface ClientContext {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;

  // Multi-account setup
  metaAccounts: MetaAccount[];

  // Multi-store setup
  shopifyStores: ShopifyStore[];

  // Business context
  brief: ClientBrief;

  // Geographic understanding
  geoSegments: GeographicSegment[];

  // Agent configuration
  agentConfig: {
    reportFrequency: 'daily' | 'weekly' | 'biweekly';
    alertThresholds: {
      roasDropPercent: number;      // Alert if ROAS drops by this %
      spendWasteThreshold: number;  // Alert if waste > this amount
      oosAlertThreshold: number;    // Alert if OOS waste > this
    };
    enabledAgents: string[];        // Which agents to run
    deliveryChannels: ('whatsapp' | 'slack' | 'email')[];
  };
}

// ============================================================================
// DATABASE SETUP
// ============================================================================

let tablesInitialized = false;

async function ensureTables(): Promise<void> {
  if (tablesInitialized) {
    return;
  }

  // Main client context table
  await getDbAdapter().exec(`
    CREATE TABLE IF NOT EXISTS client_contexts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      context_json TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  tablesInitialized = true;
  logger.info('[ClientContext] Tables initialized');
}

// ============================================================================
// CRUD OPERATIONS
// ============================================================================

export async function createClientContext(context: ClientContext): Promise<ClientContext> {
  await ensureTables();

  const now = new Date().toISOString();
  context.createdAt = now;
  context.updatedAt = now;

  await getDbAdapter().run(`
    INSERT INTO client_contexts (id, name, context_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `, [
    context.id,
    context.name,
    JSON.stringify(context),
    context.createdAt,
    context.updatedAt
  ]);

  logger.info(`[ClientContext] Created context for ${context.id}`);
  return context;
}

export async function getClientContext(clientId: string): Promise<ClientContext | null> {
  await ensureTables();

  const row = await getDbAdapter().get<{ context_json: string }>(`
    SELECT context_json FROM client_contexts WHERE id = ?
  `, [clientId]);

  if (!row) {
    return null;
  }

  return JSON.parse(row.context_json) as ClientContext;
}

export async function updateClientContext(clientId: string, updates: Partial<ClientContext>): Promise<ClientContext | null> {
  await ensureTables();

  const existing = await getClientContext(clientId);
  if (!existing) {
    return null;
  }

  const updated: ClientContext = {
    ...existing,
    ...updates,
    id: existing.id, // Prevent ID change
    updatedAt: new Date().toISOString()
  };

  await getDbAdapter().run(`
    UPDATE client_contexts
    SET context_json = ?, updated_at = ?
    WHERE id = ?
  `, [JSON.stringify(updated), updated.updatedAt, clientId]);

  logger.info(`[ClientContext] Updated context for ${clientId}`);
  return updated;
}

export async function listClientContexts(): Promise<ClientContext[]> {
  await ensureTables();

  const rows = await getDbAdapter().all<{ context_json: string }>(`
    SELECT context_json FROM client_contexts ORDER BY name
  `);

  return rows.map(row => JSON.parse(row.context_json) as ClientContext);
}

export async function deleteClientContext(clientId: string): Promise<boolean> {
  await ensureTables();

  const result = await getDbAdapter().run(`
    DELETE FROM client_contexts WHERE id = ?
  `, [clientId]);

  return result.changes > 0;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get all active Meta accounts for a client
 */
export async function getActiveMetaAccounts(clientId: string): Promise<MetaAccount[]> {
  const context = await getClientContext(clientId);
  if (!context) return [];
  return context.metaAccounts.filter(a => a.isActive);
}

/**
 * Get all active Shopify stores for a client
 */
export async function getActiveShopifyStores(clientId: string): Promise<ShopifyStore[]> {
  const context = await getClientContext(clientId);
  if (!context) return [];
  return context.shopifyStores.filter(s => s.isActive);
}

/**
 * Get Meta account by region
 */
export async function getMetaAccountByRegion(clientId: string, region: string): Promise<MetaAccount | null> {
  const context = await getClientContext(clientId);
  if (!context) return null;
  return context.metaAccounts.find(a => a.region.toLowerCase() === region.toLowerCase()) || null;
}

/**
 * Get Shopify store by region
 */
export async function getShopifyStoreByRegion(clientId: string, region: string): Promise<ShopifyStore | null> {
  const context = await getClientContext(clientId);
  if (!context) return null;
  return context.shopifyStores.find(s => s.region.toLowerCase() === region.toLowerCase()) || null;
}

/**
 * Get client brief for agent context injection
 */
export async function getClientBriefForAgent(clientId: string): Promise<string> {
  const context = await getClientContext(clientId);
  if (!context) return '';

  const brief = context.brief;
  return `
CLIENT: ${context.name}
CATEGORY: ${brief.category}
TARGET AUDIENCE: ${brief.targetAudience}
AVG ORDER VALUE: ${brief.avgOrderValue}
SEASONALITY: ${brief.seasonality}
COMPETITORS: ${brief.competitors.join(', ')}
BRAND VOICE: ${brief.brandVoice}
PRIMARY GOALS: ${brief.primaryGoals.join(', ')}
CONSTRAINTS: ${brief.knownConstraints.join(', ')}

ACCOUNTS:
${context.metaAccounts.map(a => `- Meta ${a.region}: ${a.id} (${a.currency})`).join('\n')}

STORES:
${context.shopifyStores.map(s => `- Shopify ${s.region}: ${s.domain}`).join('\n')}

GEO SEGMENTS:
${context.geoSegments.map(g => `- ${g.name}: ${g.performance} performance`).join('\n')}
`.trim();
}

// ============================================================================
// PRATAPSONS DEFAULT CONTEXT
// ============================================================================

export const PRATAPSONS_CONTEXT: ClientContext = {
  id: 'pratapsons',
  name: 'Pratap Sons',
  createdAt: '',
  updatedAt: '',

  metaAccounts: [
    {
      id: 'act_1738503939658460',
      name: 'Pratapsons Global (USA)',
      region: 'USA',
      currency: 'USD',
      isActive: true
    },
    {
      id: 'act_INDIA_PLACEHOLDER', // Need actual ID
      name: 'Pratapsons India',
      region: 'India',
      currency: 'INR',
      isActive: false // Enable when ID is added
    }
  ],

  shopifyStores: [
    {
      domain: 'pratapsons-usa.myshopify.com',
      name: 'Pratapsons Global',
      region: 'USA',
      isActive: true
    },
    {
      domain: 'pratapsons.myshopify.com',
      name: 'Pratapsons India',
      region: 'India',
      isActive: false // Enable when access token is added
    }
  ],

  brief: {
    category: 'Premium Ethnic Menswear',
    targetAudience: 'NRI males 28-55 (USA), Affluent Indian males 30-50 (India)',
    avgOrderValue: '₹3,500-5,000 (India), $150-250 (USA)',
    seasonality: 'Wedding season peaks: Oct-Feb (Shaadi), Apr-Jun (Summer weddings)',
    competitors: ['Manyavar', 'FabIndia', 'Raymond Ethnix', 'Tasva'],
    brandVoice: 'Heritage craftsmanship, Jaipur tradition, premium quality, artisan-made',
    primaryGoals: [
      'Scale USA market profitably',
      'Maintain India ROAS above 3x',
      'Build wedding season inventory'
    ],
    knownConstraints: [
      'Limited creative production bandwidth',
      'COD heavy in India (affects cash flow)',
      'Sizing issues mentioned in comments'
    ]
  },

  geoSegments: [
    {
      name: 'USA - NRI Hubs',
      regions: ['New Jersey', 'California', 'Texas', 'Illinois'],
      performance: 'high',
      notes: 'Strong wedding-related purchases'
    },
    {
      name: 'India - Metro',
      regions: ['Mumbai', 'Delhi', 'Bangalore', 'Chennai'],
      performance: 'medium',
      notes: 'High competition, price-sensitive'
    },
    {
      name: 'India - Tier 2',
      regions: ['Jaipur', 'Lucknow', 'Ahmedabad', 'Chandigarh'],
      performance: 'high',
      notes: '2.8x ROAS vs metro - underexploited'
    }
  ],

  agentConfig: {
    reportFrequency: 'weekly',
    alertThresholds: {
      roasDropPercent: 20,
      spendWasteThreshold: 50000, // ₹50K
      oosAlertThreshold: 10000    // ₹10K
    },
    enabledAgents: [
      'elite-decision-compression',
      'oos-detector',
      'discount-leakage',
      'ad-watchdog',
      'creative-intelligence',
      'strategic-cognition'
    ],
    deliveryChannels: ['whatsapp', 'email']
  }
};

/**
 * Initialize Pratapsons context if not exists
 */
export async function initializePratapsonsContext(): Promise<ClientContext> {
  const existing = await getClientContext('pratapsons');
  if (existing) {
    logger.info('[ClientContext] Pratapsons context already exists');
    return existing;
  }

  return createClientContext(PRATAPSONS_CONTEXT);
}
