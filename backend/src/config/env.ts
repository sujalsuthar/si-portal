import dotenv from 'dotenv';

dotenv.config();

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProduction: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT ?? 4000),
  appUrl: process.env.APP_URL ?? 'http://localhost:4000',
  webUrl: process.env.WEB_URL ?? 'http://localhost:5173',

  databaseUrl: required('DATABASE_URL'),

  jwtAccessSecret: required('JWT_ACCESS_SECRET'),
  jwtRefreshSecret: required('JWT_REFRESH_SECRET'),
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',

  // Keyed hash used to detect tampering with issued receipts (a verification code, not a signature).
  receiptHmacSecret: process.env.RECEIPT_HMAC_SECRET || required('JWT_ACCESS_SECRET'),

  // Backups: encrypted at rest with this key (falls back to the access secret so backups work
  // out of the box; set a dedicated long random value for a real deployment).
  backupEncryptionKey: process.env.BACKUP_ENCRYPTION_KEY || required('JWT_ACCESS_SECRET'),
  // Optional second path (e.g. a mounted network share or cloud-sync folder) backups are also copied to.
  backupOffsiteDir: process.env.BACKUP_OFFSITE_DIR || '',
  // Cron expression for the automatic nightly backup; set empty to disable scheduling entirely.
  // Defaults to 23:59 daily per the 4.0 issue log ("Backups should be taken automatically every
  // day at midnight (11:59 PM / 23:59 PM)").
  backupScheduleCron: process.env.BACKUP_SCHEDULE_CRON ?? '59 23 * * *',

  seedAdminEmail: process.env.SEED_ADMIN_EMAIL ?? 'admin@siportal.edu',
  seedAdminPassword: process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!',

  uploadDir: process.env.UPLOAD_DIR ?? 'uploads',
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB ?? 10),

  smtp: {
    host: process.env.SMTP_HOST ?? '',
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    from: process.env.SMTP_FROM ?? 'SI Portal <no-reply@siportal.edu>',
  },

  rateLimit: {
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 900000),
    max: Number(process.env.RATE_LIMIT_MAX ?? 300),
  },
};
