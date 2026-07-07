import { extractTextFromPDF } from './pdfExtractor';
import { extractTextFromExcel } from './excelExtractor';
import { fileToBase64 } from './imageToBase64';

export interface AnalysisBody {
  fileName: string;
  textContent?: string;
  imageBase64?: string;
}

/**
 * Build the request body for the analyze-document / analyze-invoice edge
 * functions from a file: text extraction for PDFs and Excel, base64 for
 * images, file name only for everything else.
 */
export async function buildAnalysisBody(file: File): Promise<AnalysisBody> {
  const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
  const body: AnalysisBody = { fileName: file.name };

  if (ext === '.pdf') {
    body.textContent = await extractTextFromPDF(file);
  } else if (['.jpg', '.jpeg', '.png'].includes(ext)) {
    body.imageBase64 = await fileToBase64(file);
  } else if (['.xlsx', '.xls'].includes(ext)) {
    body.textContent = await extractTextFromExcel(file);
  } else {
    body.textContent = `Dateiname: ${file.name}`;
  }

  return body;
}
