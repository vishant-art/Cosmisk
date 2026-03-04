import 'dotenv/config';

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  metaAppId: process.env.META_APP_ID || '675224542133938',
  metaAppSecret: process.env.META_APP_SECRET || '',
  tokenEncryptionKey: process.env.TOKEN_ENCRYPTION_KEY || 'dev-encryption-key-change-me-now!',
  databasePath: process.env.DATABASE_PATH || './data/cosmisk.db',
  nodeEnv: process.env.NODE_ENV || 'development',
  graphApiVersion: 'v22.0',
  graphApiBase: 'https://graph.facebook.com/v22.0',
  corsOrigins: [
    'http://localhost:4200',
    'https://cosmisk.ai',
    'https://www.cosmisk.ai',
    'https://app.cosmisk.ai',
  ] as string[],
} as const;
