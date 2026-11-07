/**
 * Pure parsing helpers for the JobInCamer scraper (no I/O, unit-tested in
 * tests/jobincamer-parse.test.js).
 *
 * Listing cards carry a meta line of the form
 *   "COMPANY | Publi&#xe9; le DD-MM-YYYY | Postuler avant le DD-MM-YYYY"
 * Older cards also had a location segment after the company, but as of
 * 2026-11 none do, so the second segment is usually the publish date. The
 * scraper used to store that segment verbatim (HTML entities and all) as the
 * job's location. The real location only appears on the job's own page:
 *   "... Localisation: Douala, Cameroun Secteur: ..."
 */

const NAMED_ENTITIES: Record<string, string> = {
  '&amp;': '&', '&quot;': '"', '&#039;': "'", '&apos;': "'", '&nbsp;': ' ',
  '&lt;': '<', '&gt;': '>',
  '&eacute;': 'é', '&egrave;': 'è', '&ecirc;': 'ê', '&euml;': 'ë',
  '&agrave;': 'à', '&acirc;': 'â', '&ocirc;': 'ô', '&ucirc;': 'û',
  '&ugrave;': 'ù', '&iuml;': 'ï', '&icirc;': 'î', '&ccedil;': 'ç',
  '&Eacute;': 'É', '&Egrave;': 'È',
};

export function decodeEntities(text: string): string {
  let result = text.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)));
  result = result.replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));
  for (const [entity, char] of Object.entries(NAMED_ENTITIES)) {
    result = result.split(entity).join(char);
  }
  return result;
}

/** A meta-line segment that is a date ("Publié le …", "Postuler avant le …"), not a place. */
function isDateSegment(segment: string): boolean {
  return /^(publi|postuler|date|expire)/i.test(segment) || /\d{2}[-/]\d{2}[-/]\d{4}/.test(segment);
}

/** Split a raw meta-line (HTML) into decoded, trimmed segments. */
export function splitMetaLine(metaHtml: string): string[] {
  const text = decodeEntities(metaHtml.replace(/<[^>]+>/g, ' '));
  return text
    .split('|')
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

/** Location from the listing meta segments, or null when the card has none. */
export function locationFromMetaParts(parts: string[]): string | null {
  const candidate = parts[1];
  if (!candidate || isDateSegment(candidate)) return null;
  return candidate;
}

/** Location from a job page's flattened text ("Localisation: Douala, Cameroun Secteur: …"). */
export function locationFromDetailText(text: string): string | null {
  const match = decodeEntities(text).match(
    /Localisation\s*:\s*(.+?)\s+(?:Secteur|Niveau|Exp[ée]rience|Type|Salaire|Contrat|Date)\b/i
  );
  if (!match) return null;
  const location = match[1]
    .replace(/,?\s*Cameroun\s*$/i, '')
    .replace(/,?\s*Cameroon\s*$/i, '')
    .trim();
  if (!location || location.length > 80 || isDateSegment(location)) return null;
  return location;
}
