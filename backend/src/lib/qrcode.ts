import QRCode from 'qrcode';
import { env } from '@/config/env';

export async function generateVerificationQrDataUrl(certificateNumber: string): Promise<string> {
  const url = `${env.webUrl}/verify/${encodeURIComponent(certificateNumber)}`;
  return QRCode.toDataURL(url, { margin: 1, width: 300 });
}
