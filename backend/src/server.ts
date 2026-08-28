import cron from 'node-cron';
import { BackupType } from '@prisma/client';
import { createApp } from '@/app';
import { env } from '@/config/env';
import { logger } from '@/lib/logger';
import { runBackup } from '@/modules/backup/backup.controller';
import { runRetentionSweep } from '@/lib/retention';
import { runFeeOverdueReminders } from '@/lib/feeReminders';

const app = createApp();

app.listen(env.port, () => {
  logger.info(`SI Portal API listening on port ${env.port} (${env.nodeEnv})`);
});

if (env.backupScheduleCron) {
  cron.schedule(env.backupScheduleCron, () => {
    runBackup(BackupType.SCHEDULED, null).catch((err) => logger.error('Scheduled backup failed', err));
  });
  logger.info(`Scheduled automatic backups: "${env.backupScheduleCron}"`);
}

// Data-protection retention sweep — runs daily but only acts when explicitly enabled in Settings.
cron.schedule('0 3 * * *', () => {
  runRetentionSweep().catch((err) => logger.error('Retention sweep failed', err));
});

// Fee overdue reminders — runs daily, marks past-due instalments OVERDUE and notifies once per day.
cron.schedule('0 8 * * *', () => {
  runFeeOverdueReminders().catch((err) => logger.error('Fee overdue reminder sweep failed', err));
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', reason);
});
