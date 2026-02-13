import * as XLSX from '@e965/xlsx';

export async function extractTextFromExcel(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });

  let fullText = '';

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet, { FS: ' | ', RS: '\n' });
    fullText += `=== ${sheetName} ===\n${csv}\n\n`;
  }

  return fullText;
}
