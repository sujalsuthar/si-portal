import PDFDocument from 'pdfkit';

export interface ExamPaperQuestion {
  sequence: number;
  questionText: string;
  questionType: string;
  marks: number;
  options?: string[] | null;
}

export interface ExamPaperData {
  title: string;
  courseName?: string;
  batchName: string;
  subject: string;
  examDate?: Date | null;
  durationMinutes?: number | null;
  totalMarks: number;
  questions: ExamPaperQuestion[];
}

export function generateExamPaperPdf(data: ExamPaperData): InstanceType<typeof PDFDocument> {
  const doc = new PDFDocument({ margin: 50, size: 'A4' });

  doc.fontSize(18).font('Helvetica-Bold').text(data.title, { align: 'center' });
  doc.moveDown(0.3);
  doc.fontSize(11).font('Helvetica').text(
    `${data.courseName ? data.courseName + ' | ' : ''}Batch: ${data.batchName} | Subject: ${data.subject}`,
    { align: 'center' },
  );
  const meta: string[] = [];
  if (data.examDate) meta.push(`Date: ${data.examDate.toDateString()}`);
  if (data.durationMinutes) meta.push(`Duration: ${data.durationMinutes} minutes`);
  meta.push(`Total Marks: ${data.totalMarks}`);
  doc.text(meta.join('   |   '), { align: 'center' });
  doc.moveDown();
  doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
  doc.moveDown();

  data.questions.forEach((q) => {
    doc.fontSize(11).font('Helvetica-Bold').text(`Q${q.sequence}. `, { continued: true }).font('Helvetica').text(`${q.questionText}  [${q.marks} marks]`);
    if (q.options && q.options.length > 0) {
      q.options.forEach((opt, i) => {
        doc.fontSize(10).text(`   ${String.fromCharCode(97 + i)}) ${opt}`);
      });
    }
    doc.moveDown(0.6);
  });

  return doc;
}

export interface CertificatePdfData {
  studentName: string;
  courseName: string;
  batchName?: string;
  completionDate: Date;
  issueDate: Date;
  certificateNumber: string;
  qrDataUrl: string; // data:image/png;base64,...
}

export function generateCertificatePdf(data: CertificatePdfData): InstanceType<typeof PDFDocument> {
  const doc = new PDFDocument({ margin: 0, size: 'A4', layout: 'landscape' });
  const { width, height } = doc.page;

  doc.rect(0, 0, width, height).fill('#f7f9fc');
  doc.lineWidth(6).strokeColor('#1e3a8a').rect(24, 24, width - 48, height - 48).stroke();
  doc.lineWidth(1.5).strokeColor('#c9a227').rect(36, 36, width - 72, height - 72).stroke();

  doc.fillColor('#1e3a8a').font('Helvetica-Bold').fontSize(30).text('CERTIFICATE OF COMPLETION', 0, 90, { align: 'center' });
  doc.font('Helvetica').fontSize(13).fillColor('#444').text('This is to certify that', 0, 150, { align: 'center' });

  doc.font('Helvetica-Bold').fontSize(28).fillColor('#111').text(data.studentName, 0, 180, { align: 'center' });

  doc
    .font('Helvetica')
    .fontSize(14)
    .fillColor('#333')
    .text(`has successfully completed the course`, 0, 225, { align: 'center' });
  doc.font('Helvetica-Bold').fontSize(18).fillColor('#1e3a8a').text(data.courseName, 0, 248, { align: 'center' });
  if (data.batchName) {
    doc.font('Helvetica').fontSize(11).fillColor('#555').text(`Batch: ${data.batchName}`, 0, 275, { align: 'center' });
  }

  doc
    .font('Helvetica')
    .fontSize(11)
    .fillColor('#333')
    .text(
      `Completion Date: ${data.completionDate.toDateString()}      Issue Date: ${data.issueDate.toDateString()}`,
      0,
      310,
      { align: 'center' },
    );

  doc.image(data.qrDataUrl, width - 150, height - 150, { width: 90, height: 90 });
  doc.font('Helvetica').fontSize(9).fillColor('#555').text('Scan to verify', width - 150, height - 55, { width: 90, align: 'center' });

  doc.font('Helvetica').fontSize(9).fillColor('#777').text(`Certificate No: ${data.certificateNumber}`, 50, height - 55);

  return doc;
}

export interface ReceiptPdfData {
  receiptNumber: string;
  studentName: string;
  studentCode: string;
  amount: number;
  mode: string;
  reference?: string | null;
  paidAt: Date;
  issuedAt: Date;
  verificationCode: string;
  balanceAfter: number;
}

/**
 * Renders a payment receipt as a PDF. The `verificationCode` printed here is an HMAC-derived
 * integrity value the server can re-check — described to users as a verification code, not a
 * cryptographic signature (that distinction matters: a keyed hash proves integrity to the
 * institution holding the key, it does not let a third party verify the document independently).
 */
export function generateReceiptPdf(data: ReceiptPdfData): InstanceType<typeof PDFDocument> {
  const doc = new PDFDocument({ margin: 50, size: 'A5' });

  doc.fontSize(16).font('Helvetica-Bold').text('PAYMENT RECEIPT', { align: 'center' });
  doc.moveDown(0.3);
  doc.fontSize(10).font('Helvetica').fillColor('#555').text('SI Portal', { align: 'center' });
  doc.moveDown();
  doc.moveTo(50, doc.y).lineTo(390, doc.y).strokeColor('#ccc').stroke();
  doc.moveDown();

  doc.fillColor('black').fontSize(11);
  const row = (label: string, value: string) => {
    doc.font('Helvetica-Bold').text(`${label}: `, { continued: true }).font('Helvetica').text(value);
  };
  row('Receipt No.', data.receiptNumber);
  row('Student', `${data.studentName} (${data.studentCode})`);
  row('Amount Paid', `Rs. ${data.amount.toLocaleString('en-IN')}`);
  row('Payment Mode', data.mode);
  if (data.reference) row('Reference', data.reference);
  row('Payment Date', data.paidAt.toDateString());
  row('Issued On', data.issuedAt.toDateString());
  row('Balance After Payment', `Rs. ${data.balanceAfter.toLocaleString('en-IN')}`);

  doc.moveDown();
  doc.fontSize(8).fillColor('#888').text(`Verification code: ${data.verificationCode}`, { align: 'left' });
  doc.text('This receipt can be verified without logging in via the public verification page.', { align: 'left' });

  return doc;
}
