import { extractTextFromPDF, renderPdfToImageBase64 } from './pdfExtractor';
import { extractTextFromExcel } from './excelExtractor';
import { fileToBase64 } from './imageToBase64';
import { supabase } from '@/integrations/supabase/client';

/** Below this, a PDF's text layer is considered missing (scanned document). */
const MIN_PDF_TEXT_LENGTH = 100;

export interface AnalysisBody {
  fileName: string;
  textContent?: string;
  imageBase64?: string;
}

/** Result of the analyze-document edge function. */
export interface AiResult {
  title?: string;
  document_type?: string;
  description?: string;
  company_name?: string | null;
  invoice_number?: string | null;
  amount?: number | null;
  invoice_date?: string | null;
  kostengruppe_code?: string | null;
}

/** File extensions the AI analysis supports. */
export const ANALYZABLE_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.xlsx', '.xls'];

export function isAnalyzable(fileName: string): boolean {
  const ext = fileName.substring(fileName.lastIndexOf('.')).toLowerCase();
  return ANALYZABLE_EXTENSIONS.includes(ext);
}

/**
 * Run the full AI document analysis for a file: extract text/image content
 * and call the analyze-document edge function. Returns null when the file
 * type is unsupported or the analysis fails — callers fall back to defaults.
 */
export async function analyzeDocumentFile(file: File): Promise<AiResult | null> {
  if (!isAnalyzable(file.name)) return null;
  try {
    const body = await buildAnalysisBody(file);
    const { data, error } = await supabase.functions.invoke('analyze-document', { body });
    if (error || !data?.data) return null;
    return data.data as AiResult;
  } catch {
    return null;
  }
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
    try {
      const text = await extractTextFromPDF(file);
      if (text.trim().length >= MIN_PDF_TEXT_LENGTH) {
        body.textContent = text;
      }
    } catch {
      // fall through to the image path
    }
    if (!body.textContent) {
      // Scanned PDF without a text layer: send first + last page as image
      body.imageBase64 = await renderPdfToImageBase64(file);
    }
  } else if (['.jpg', '.jpeg', '.png'].includes(ext)) {
    body.imageBase64 = await fileToBase64(file);
  } else if (['.xlsx', '.xls'].includes(ext)) {
    body.textContent = await extractTextFromExcel(file);
  } else {
    body.textContent = `Dateiname: ${file.name}`;
  }

  return body;
}
