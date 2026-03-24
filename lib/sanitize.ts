/**
 * Server-safe HTML sanitizer using a whitelist approach.
 * No npm dependencies — pure regex-based, works in Node and Edge runtimes.
 */

const ALLOWED_TAGS = new Set([
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'strong', 'em', 'b', 'i',
  'code', 'pre',
  'a',
  'ul', 'ol', 'li',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'blockquote',
  'hr', 'br',
  'img',
]);

/** Attributes allowed per-tag. `'*'` key applies to all tags. */
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  '*': new Set(['class']),
  a: new Set(['href', 'target', 'rel']),
  img: new Set(['src', 'alt']),
};

/** Returns true if the URL value is safe (http/https or relative). */
function isSafeUrl(value: string): boolean {
  const trimmed = value.trim().toLowerCase();
  // Block javascript:, data:, vbscript:, etc.
  if (/^(?:javascript|vbscript|data):/i.test(trimmed)) return false;
  // Allow http, https, mailto, tel, relative, and anchor-only URLs
  return true;
}

/** Sanitize a single attribute string, returning only safe key="value" pairs. */
function sanitizeAttributes(tag: string, attrString: string): string {
  const globalAllowed = ALLOWED_ATTRS['*'] ?? new Set();
  const tagAllowed = ALLOWED_ATTRS[tag] ?? new Set();

  const parts: string[] = [];

  // Match attribute patterns: name="value", name='value', name=value, or bare name
  const attrRegex = /([a-z][a-z0-9-]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|(\S+)))?/gi;
  let m: RegExpExecArray | null;

  while ((m = attrRegex.exec(attrString)) !== null) {
    const name = m[1].toLowerCase();
    const value = m[2] ?? m[3] ?? m[4] ?? '';

    // Skip event handlers (onclick, onerror, onload, etc.)
    if (name.startsWith('on')) continue;

    // Skip style attributes (blocks expression()/url() injection)
    if (name === 'style') continue;

    if (!globalAllowed.has(name) && !tagAllowed.has(name)) continue;

    // For href and src, validate the URL scheme
    if ((name === 'href' || name === 'src') && !isSafeUrl(value)) continue;

    parts.push(`${name}="${value.replace(/"/g, '&quot;')}"`);
  }

  return parts.length > 0 ? ' ' + parts.join(' ') : '';
}

/**
 * Strips dangerous HTML while preserving whitelisted tags and attributes.
 *
 * Strategy:
 *  1. Remove known-dangerous blocks entirely (script, style, iframe, etc.)
 *  2. Walk remaining tags; keep whitelisted tags with sanitized attributes,
 *     strip everything else (keep inner text).
 */
export function sanitizeHtml(html: string): string {
  let out = html;

  // 1. Remove entire dangerous blocks (opening + content + closing)
  const dangerousBlockTags = ['script', 'style', 'iframe', 'object', 'embed', 'form', 'applet', 'base', 'link', 'meta'];
  for (const tag of dangerousBlockTags) {
    // Remove opening+content+closing
    out = out.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}>`, 'gi'), '');
    // Remove self-closing or orphaned opening tags
    out = out.replace(new RegExp(`<${tag}\\b[^>]*/?>`, 'gi'), '');
  }

  // 2. Remove HTML comments (can hide payloads in some browsers)
  out = out.replace(/<!--[\s\S]*?-->/g, '');

  // 3. Process remaining tags
  out = out.replace(/<\/?([a-z][a-z0-9]*)\b([^>]*?)\s*\/?>/gi, (match, tagName: string, attrs: string) => {
    const tag = tagName.toLowerCase();
    const isClosing = match.startsWith('</');

    if (!ALLOWED_TAGS.has(tag)) {
      // Strip the tag but keep its text content (already handled by regex replacing only tags)
      return '';
    }

    if (isClosing) {
      return `</${tag}>`;
    }

    const isSelfClosing = match.endsWith('/>') || tag === 'br' || tag === 'hr' || tag === 'img';
    const safeAttrs = sanitizeAttributes(tag, attrs);

    return isSelfClosing ? `<${tag}${safeAttrs} />` : `<${tag}${safeAttrs}>`;
  });

  return out;
}
