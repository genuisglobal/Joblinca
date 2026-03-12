/**
 * PII masking utilities for protecting user data before sending to external APIs.
 *
 * Masks personally identifiable information (PII) in text while preserving
 * the structure needed for AI parsing (e.g., resume analysis).
 */

// Phone numbers: international and local formats
const PHONE_PATTERNS = [
  /(\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{2,4}[-.\s]?\d{2,4}[-.\s]?\d{0,4}/g,
];

// Email addresses
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// Street addresses (common patterns — catches most but not all)
const ADDRESS_PATTERNS = [
  // "123 Main Street" style
  /\d{1,5}\s+[\w\s]{2,30}(?:Street|St|Avenue|Ave|Boulevard|Blvd|Road|Rd|Drive|Dr|Lane|Ln|Court|Ct|Way|Place|Pl|Terrace|Circle)\b\.?/gi,
  // PO Box
  /P\.?\s*O\.?\s*Box\s+\d+/gi,
  // BP (Boîte Postale — Cameroon/French format)
  /B\.?\s*P\.?\s*:?\s*\d+/gi,
];

// Social Security / National ID numbers (various formats)
const ID_PATTERNS = [
  // US SSN: 123-45-6789
  /\b\d{3}-\d{2}-\d{4}\b/g,
  // Generic long number sequences that look like IDs (9+ digits)
  /\b\d{9,13}\b/g,
];

/**
 * Mask PII in text before sending to external AI services.
 *
 * Replaces sensitive data with placeholder tokens that preserve document
 * structure while removing identifiable information.
 *
 * @param text - Raw text containing potential PII
 * @returns Text with PII replaced by [MASKED_*] tokens
 */
export function maskPII(text: string): string {
  let masked = text;

  // Mask emails first (before phone, since emails may contain digits)
  masked = masked.replace(EMAIL_PATTERN, '[MASKED_EMAIL]');

  // Mask phone numbers
  for (const pattern of PHONE_PATTERNS) {
    masked = masked.replace(pattern, (match) => {
      // Only mask if it looks like a real phone number (has enough digits)
      const digits = match.replace(/\D/g, '');
      if (digits.length >= 7) {
        return '[MASKED_PHONE]';
      }
      return match;
    });
  }

  // Mask addresses
  for (const pattern of ADDRESS_PATTERNS) {
    masked = masked.replace(pattern, '[MASKED_ADDRESS]');
  }

  // Mask ID numbers
  for (const pattern of ID_PATTERNS) {
    masked = masked.replace(pattern, (match) => {
      // Don't mask year-like numbers (1950-2030) or short sequences
      const num = parseInt(match, 10);
      if (match.length <= 4 && num >= 1950 && num <= 2030) {
        return match;
      }
      // Don't mask numbers that could be salary/amounts (followed by XAF, FCFA, etc.)
      return '[MASKED_ID]';
    });
  }

  return masked;
}
