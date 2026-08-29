import ExcelJS from 'exceljs';
import { Response } from 'express';

/** Normalizes spreadsheet header keys for flexible column matching. */
function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
}

/** Reads the first worksheet from an uploaded Excel buffer into row objects keyed by normalized headers. */
export async function parseExcelUpload(buffer: Buffer | Uint8Array): Promise<Record<string, string>[]> {
  const workbook = new ExcelJS.Workbook();
  // exceljs Buffer typings differ from Node 22; runtime accepts multer memory buffers.
  await workbook.xlsx.load(buffer as never);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col - 1] = normalizeHeader(cell.value);
  });

  const rows: Record<string, string>[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const record: Record<string, string> = {};
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      const key = headers[col - 1];
      if (!key) return;
      record[key] = String(cell.value ?? '').trim();
    });
    if (Object.values(record).some(Boolean)) rows.push(record);
  });
  return rows;
}

export function excelField(row: Record<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    const value = row[normalizeHeader(key)];
    if (value) return value;
  }
  return '';
}

export interface ExcelColumn {
  header: string;
  key: string;
  width?: number;
}

export async function sendExcel(res: Response, filename: string, columns: ExcelColumn[], rows: Record<string, unknown>[]) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Report');
  sheet.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 20 }));
  sheet.getRow(1).font = { bold: true };
  rows.forEach((row) => sheet.addRow(row));

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
}
