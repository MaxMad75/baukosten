import JSZip from 'jszip';

const SUPPORTED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png', '.xlsx', '.xls'];
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
const MAX_ZIP_SIZE = 50 * 1024 * 1024; // 50 MB

export interface ZipEntry {
  name: string;
  path: string;
  size: number;
  selected: boolean;
  file: JSZip.JSZipObject;
  hash?: string;
  isDuplicate?: boolean;
  duplicateTitle?: string;
}

export async function extractZip(file: File): Promise<ZipEntry[]> {
  if (file.size > MAX_ZIP_SIZE) {
    throw new Error(`ZIP-Datei ist zu groß (max. ${MAX_ZIP_SIZE / 1024 / 1024} MB)`);
  }

  const zip = await JSZip.loadAsync(file);
  const entries: ZipEntry[] = [];

  zip.forEach((relativePath, zipEntry) => {
    if (zipEntry.dir) return;

    const ext = relativePath.substring(relativePath.lastIndexOf('.')).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.includes(ext)) return;

    // Extract just the filename
    const name = relativePath.split('/').pop() || relativePath;

    entries.push({
      name,
      path: relativePath,
      size: 0, // will be known after decompression
      selected: true,
      file: zipEntry,
    });
  });

  // Get actual sizes (decompressed)
  await Promise.all(
    entries.map(async (entry) => {
      const blob = await entry.file.async('blob');
      entry.size = blob.size;
    })
  );

  // Filter out files that are too large
  return entries.filter((e) => e.size <= MAX_FILE_SIZE);
}

export async function zipEntryToFile(entry: ZipEntry): Promise<File> {
  const blob = await entry.file.async('blob');
  return new File([blob], entry.name, { type: getMimeType(entry.name) });
}

function getMimeType(filename: string): string {
  const ext = filename.substring(filename.lastIndexOf('.')).toLowerCase();
  const map: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xls': 'application/vnd.ms-excel',
  };
  return map[ext] || 'application/octet-stream';
}
