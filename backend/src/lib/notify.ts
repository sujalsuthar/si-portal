import nodemailer from 'nodemailer';
import { NotificationCategory, NotificationChannel, DeliveryStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { env } from '@/config/env';
import { logger } from '@/lib/logger';
import { getScoringConfig } from '@/lib/scoring';

const transporter = env.smtp.host
  ? nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.secure,
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
    })
  : null;

interface NotifyInput {
  userId: string;
  category: NotificationCategory;
  title: string;
  message: string;
  link?: string;
  channels?: NotificationChannel[];
}

/**
 * Creates the in-app notification record and best-effort dispatches to the requested channels.
 * SMS/WhatsApp are recorded as SKIPPED (no third-party credentials configured in this deployment);
 * the adapter interface (send()) is the integration point for Phase 8 messaging providers.
 */
/** True if the current hour falls inside the configured quiet-hours window (wraps past midnight). */
function isQuietHoursNow(start: number | null, end: number | null): boolean {
  if (start == null || end == null) return false;
  const hour = new Date().getHours();
  if (start === end) return false;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

export async function notify(input: NotifyInput) {
  const channels = input.channels ?? [NotificationChannel.IN_APP];

  // Honor the user's per-category channel opt-outs (FR-NOT-07). Opting out of IN_APP means the
  // event never appears in their notification centre at all; absence of a preference row defaults
  // both channels to on.
  const preference = await prisma.notificationPreference.findUnique({
    where: { userId_category: { userId: input.userId, category: input.category } },
  });
  if (preference && !preference.inApp) return null;

  const notification = await prisma.notification.create({
    data: {
      userId: input.userId,
      category: input.category,
      title: input.title,
      message: input.message,
      link: input.link,
    },
  });

  const config = await getScoringConfig();
  const inQuietHours = isQuietHoursNow(config.quietHoursStart, config.quietHoursEnd);

  for (const channel of channels) {
    if (channel === NotificationChannel.IN_APP) {
      await prisma.notificationDelivery.create({
        data: { notificationId: notification.id, channel, status: DeliveryStatus.SENT, sentAt: new Date() },
      });
      continue;
    }

    // Non-urgent channels (everything but in-app) are deferred during the configured quiet-hours window.
    if (inQuietHours) {
      await prisma.notificationDelivery.create({
        data: { notificationId: notification.id, channel, status: DeliveryStatus.SKIPPED, error: 'Suppressed during quiet hours' },
      });
      continue;
    }

    if (channel === NotificationChannel.EMAIL) {
      if (preference && !preference.email) {
        await prisma.notificationDelivery.create({
          data: { notificationId: notification.id, channel, status: DeliveryStatus.SKIPPED, error: 'Opted out of email for this category' },
        });
        continue;
      }
      await dispatchEmail(notification.id, input);
      continue;
    }

    // SMS / WHATSAPP: no provider configured in this deployment. Recorded for auditability.
    await prisma.notificationDelivery.create({
      data: { notificationId: notification.id, channel, status: DeliveryStatus.SKIPPED, error: 'No provider configured' },
    });
  }

  return notification;
}

/** Substitutes {{title}}/{{message}} placeholders in an editable template's subject/body. */
function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
}

async function dispatchEmail(notificationId: string, input: NotifyInput) {
  if (!transporter) {
    await prisma.notificationDelivery.create({
      data: { notificationId, channel: NotificationChannel.EMAIL, status: DeliveryStatus.SKIPPED, error: 'SMTP not configured' },
    });
    return;
  }
  try {
    const user = await prisma.user.findUnique({ where: { id: input.userId }, select: { email: true } });
    if (!user) throw new Error('User not found');

    const template = await prisma.notificationTemplate.findUnique({
      where: { category_channel: { category: input.category, channel: NotificationChannel.EMAIL } },
    });
    const vars = { title: input.title, message: input.message };
    const subject = template ? renderTemplate(template.subjectTemplate, vars) : input.title;
    const text = template ? renderTemplate(template.bodyTemplate, vars) : input.message;

    await transporter.sendMail({
      from: env.smtp.from,
      to: user.email,
      subject,
      text,
    });
    await prisma.notificationDelivery.create({
      data: { notificationId, channel: NotificationChannel.EMAIL, status: DeliveryStatus.SENT, sentAt: new Date() },
    });
  } catch (err) {
    logger.error('Email dispatch failed', err);
    await prisma.notificationDelivery.create({
      data: {
        notificationId,
        channel: NotificationChannel.EMAIL,
        status: DeliveryStatus.FAILED,
        error: err instanceof Error ? err.message : 'Unknown error',
      },
    });
  }
}

/** Notify every user linked as a parent of the given student. */
export async function notifyStudentParents(studentId: string, input: Omit<NotifyInput, 'userId'>) {
  const links = await prisma.studentParent.findMany({
    where: { studentId },
    include: { parent: { include: { user: true } } },
  });
  for (const link of links) {
    await notify({ ...input, userId: link.parent.user.id, channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL] });
  }
}
