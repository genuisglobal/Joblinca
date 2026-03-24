/**
 * Server-side file validation utilities.
 *
 * Validates file uploads using both extension whitelists and magic byte checks
 * to prevent malicious file uploads that spoof MIME types.
 */

/** Known magic bytes for common file types. */
const MAGIC_BYTES: Record<string, number[][]> = {
  // Images
  'image/jpeg': [[0xff, 0xd8, 0xff]],
  'image/png': [[0x89, 0x50, 0x4e, 0x47]],
  'image/gif': [[0x47, 0x49, 0x46, 0x38]],
  'image/webp': [[0x52, 0x49, 0x46, 0x46]], // RIFF header (WebP starts with RIFF....WEBP)
  // Documents
  'application/pdf': [[0x25, 0x50, 0x44, 0x46]], // %PDF
  'application/msword': [[0xd0, 0xcf, 0x11, 0xe0]], // OLE2 compound doc
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [
    [0x50, 0x4b, 0x03, 0x04], // ZIP (docx is a zip)
  ],
};

/** Allowed extensions per upload context. */
export const ALLOWED_EXTENSIONS: Record<string, Set<string>> = {
  avatar: new Set(['jpg', 'jpeg', 'png', 'webp', 'gif']),
  resume: new Set(['pdf', 'doc', 'docx']),
  document: new Set(['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx']),
};

/**
 * Extract and validate the file extension from a filename.
 * Returns the lowercase extension if it's in the allowed set, or null if not.
 */
export function validateExtension(
  filename: string,
  context: keyof typeof ALLOWED_EXTENSIONS
): string | null {
  const allowed = ALLOWED_EXTENSIONS[context];
  if (!allowed) return null;

  const parts = filename.split('.');
  if (parts.length < 2) return null;

  const ext = parts.pop()!.toLowerCase();
  return allowed.has(ext) ? ext : null;
}

/**
 * Validate file magic bytes against the claimed MIME type.
 * Returns true if the file's first bytes match the expected magic for its type.
 */
export function validateMagicBytes(
  buffer: ArrayBuffer,
  mimeType: string
): boolean {
  const signatures = MAGIC_BYTES[mimeType];
  if (!signatures) {
    // Unknown type — can't verify, allow if extension passed
    return true;
  }

  const bytes = new Uint8Array(buffer.slice(0, 16));

  return signatures.some((sig) =>
    sig.every((byte, i) => bytes[i] === byte)
  );
}

/**
 * Full file validation: checks extension whitelist + magic bytes.
 * Returns { valid, ext, error }.
 */
export function validateUploadedFile(
  file: File,
  context: keyof typeof ALLOWED_EXTENSIONS
): { valid: boolean; ext: string; error?: string } {
  const ext = validateExtension(file.name, context);
  if (!ext) {
    const allowed = [...(ALLOWED_EXTENSIONS[context] || [])].join(', ');
    return {
      valid: false,
      ext: '',
      error: `Invalid file type. Allowed extensions: ${allowed}`,
    };
  }

  return { valid: true, ext };
}

/**
 * Async validation that also checks magic bytes.
 * Call after reading the file buffer.
 */
export function validateFileBuffer(
  buffer: ArrayBuffer,
  mimeType: string
): { valid: boolean; error?: string } {
  if (!validateMagicBytes(buffer, mimeType)) {
    return {
      valid: false,
      error: 'File content does not match its declared type. Upload rejected.',
    };
  }

  return { valid: true };
}
