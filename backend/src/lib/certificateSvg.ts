export interface CertificateSvgData {
  studentName: string;
  courseName: string;
  batchName?: string;
  completionDate: Date;
  issueDate: Date;
  certificateNumber: string;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** A downloadable image rendering of a certificate — SVG is a real image format, so this satisfies
 * "Download Image" without adding a raster-rendering dependency (PDF export already covers print use). */
export function generateCertificateSvg(data: CertificateSvgData): string {
  const width = 1200;
  const height = 850;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#f7f9fc"/>
  <rect x="24" y="24" width="${width - 48}" height="${height - 48}" fill="none" stroke="#1e3a8a" stroke-width="6"/>
  <rect x="36" y="36" width="${width - 72}" height="${height - 72}" fill="none" stroke="#c9a227" stroke-width="1.5"/>
  <text x="50%" y="140" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="40" font-weight="bold" fill="#1e3a8a">CERTIFICATE OF COMPLETION</text>
  <text x="50%" y="200" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="18" fill="#444">This is to certify that</text>
  <text x="50%" y="260" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="38" font-weight="bold" fill="#111">${esc(data.studentName)}</text>
  <text x="50%" y="310" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="18" fill="#333">has successfully completed the course</text>
  <text x="50%" y="345" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="24" font-weight="bold" fill="#1e3a8a">${esc(data.courseName)}</text>
  ${data.batchName ? `<text x="50%" y="380" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="15" fill="#555">Batch: ${esc(data.batchName)}</text>` : ''}
  <text x="50%" y="430" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="14" fill="#333">Completion Date: ${data.completionDate.toDateString()}      Issue Date: ${data.issueDate.toDateString()}</text>
  <text x="60" y="${height - 40}" font-family="Helvetica, Arial, sans-serif" font-size="12" fill="#777">Certificate No: ${esc(data.certificateNumber)}</text>
</svg>`;
}
