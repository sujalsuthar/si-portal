import { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';
import { env } from '@/config/env';

const UPLOAD_ROOT = path.resolve(process.cwd(), env.uploadDir);
for (const sub of ['photos', 'attachments', 'certificates', 'evidence']) {
  fs.mkdirSync(path.join(UPLOAD_ROOT, sub), { recursive: true });
}

const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
]);

function storageFor(subdir: string) {
  return multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, path.join(UPLOAD_ROOT, subdir)),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  });
}

function fileFilter(_req: unknown, file: Express.Multer.File, cb: multer.FileFilterCallback) {
  if (!ALLOWED_MIME.has(file.mimetype)) {
    return cb(new Error(`Unsupported file type: ${file.mimetype}`));
  }
  cb(null, true);
}

const limits = { fileSize: env.maxUploadMb * 1024 * 1024 };

const FEED_ATTACHMENT_MIME = new Set(['image/jpeg', 'image/png', 'application/pdf']);

function feedFileFilter(_req: unknown, file: Express.Multer.File, cb: multer.FileFilterCallback) {
  if (!FEED_ATTACHMENT_MIME.has(file.mimetype)) {
    return cb(new Error('Only JPG/JPEG and PDF files are allowed'));
  }
  cb(null, true);
}

const feedAttachmentLimits = { fileSize: 2 * 1024 * 1024 };

export const uploadPhoto = multer({ storage: storageFor('photos'), fileFilter, limits });
export const uploadAttachment = multer({ storage: storageFor('attachments'), fileFilter, limits });
export const uploadFeedAttachment = multer({ storage: storageFor('attachments'), fileFilter: feedFileFilter, limits: feedAttachmentLimits });
export const uploadEvidence = multer({ storage: storageFor('evidence'), fileFilter, limits });

const EXCEL_MIME = new Set([
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

function excelFileFilter(_req: unknown, file: Express.Multer.File, cb: multer.FileFilterCallback) {
  if (!EXCEL_MIME.has(file.mimetype)) {
    return cb(new Error('Only Excel files (.xlsx, .xls) are allowed'));
  }
  cb(null, true);
}

export const uploadExcel = multer({
  storage: multer.memoryStorage(),
  fileFilter: excelFileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

export function publicUploadUrl(subdir: string, filename: string): string {
  return `/uploads/${subdir}/${filename}`;
}

/** Runs multer only for multipart requests so JSON POST bodies stay intact. */
export function optionalEvidenceUpload(req: Request, res: Response, next: NextFunction) {
  if (req.is('multipart/form-data')) {
    return uploadEvidence.single('evidence')(req, res, next);
  }
  next();
}
