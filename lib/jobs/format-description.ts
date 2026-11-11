/**
 * Turn a job description into display blocks (headings, paragraphs, lists).
 *
 * Most aggregated descriptions arrive as one unbroken block of text (all 18
 * sampled on 2026-11-08 had no line breaks), with section headings inline
 * ("... Missions principales Veiller à ...") and lists either separated by
 * semicolons or run together as capitalised verbs ("... fiable Contribuer à
 * ... Sécuriser ..."). This recovers that structure for reading on phones.
 *
 * Guarantees (tests/format-description.test.js):
 * - Output is plain text in typed blocks; rendering never uses innerHTML.
 * - No words are dropped or reordered, except a leading repeat of the job
 *   title and the scraper preamble "Trusted listing ... Job description".
 * - Text that already has line breaks keeps its own structure.
 */

export type DescriptionBlock =
  | { type: 'heading'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] };

const NAMED_ENTITIES: Record<string, string> = {
  '&amp;': '&', '&quot;': '"', '&#39;': "'", '&#039;': "'", '&apos;': "'", '&nbsp;': ' ',
  '&lt;': '<', '&gt;': '>', '&eacute;': 'é', '&egrave;': 'è', '&ecirc;': 'ê', '&agrave;': 'à',
  '&ccedil;': 'ç', '&ocirc;': 'ô', '&ucirc;': 'û', '&icirc;': 'î', '&rsquo;': '’', '&laquo;': '«',
  '&raquo;': '»',
};

export function decodeEntities(text: string): string {
  let out = text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => safeCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => safeCodePoint(parseInt(dec, 10)));
  for (const [entity, char] of Object.entries(NAMED_ENTITIES)) out = out.split(entity).join(char);
  return out;
}

function safeCodePoint(code: number): string {
  try {
    return String.fromCodePoint(code);
  } catch {
    return '';
  }
}

// Section headings seen in Cameroonian postings (FR + EN). Matched only when
// capitalised and followed by ":" or a capitalised word, so ordinary
// mid-sentence uses ("le profil recherché") are left alone.
const HEADINGS = [
  'Description du poste', 'Description de poste', 'Missions principales', 'Mission principale',
  'Activités principales', 'Activité principale', 'Activités et tâches', 'Activités', 'Principales responsabilités',
  'Responsabilités', 'Missions', 'Profil recherché', 'Profil du candidat', 'Profil', 'Compétences requises',
  'Compétences', 'Qualifications requises', 'Qualifications', 'Formation', 'Expérience requise',
  'Dossier de candidature', 'Pièces à fournir', 'Composition du dossier', 'Comment postuler',
  'Modalités de candidature', 'Conditions', 'Avantages', 'Nous offrons', 'Le poste', 'Contexte',
  'Rattachement hiérarchique', 'Lieu de travail', 'Type de contrat', 'Date limite',
  'Key responsibilities', 'Responsibilities', 'Requirements', 'Qualifications and experience',
  'What we offer', 'Benefits', 'How to apply', 'About the role', 'About us', 'Job description',
];

const HEADING_RE = new RegExp(
  `(^|[.;:!?)]\\s+|\\s)(${HEADINGS.sort((a, b) => b.length - a.length).map(escapeRe).join('|')})(\\s*:\\s*|\\s+(?=[A-ZÀ-Ý]))`,
  'g'
);

function escapeRe(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const BULLET_LINE_RE = /^\s*(?:[-•*·▪●◦✓✔➢►]|\d{1,2}[.)])\s+/;

function normalizeSpaces(text: string): string {
  return text.replace(/[ \t ]+/g, ' ').trim();
}

function stripPreamble(text: string, title?: string | null): string {
  let out = text;
  // "Trusted listing <title> <company> ... Job description This job was
  // published in French by the employer: applications are made in French."
  const trusted = out.match(/^Trusted listing\b[\s\S]{0,400}?\bJob description\s+/);
  if (trusted) out = out.slice(trusted[0].length);
  out = out.replace(/^This job was published in \w+ by the employer: applications are made in \w+\.\s*/, '');

  if (title) {
    const t = normalizeSpaces(decodeEntities(title));
    if (t.length >= 8 && out.toLowerCase().startsWith(t.toLowerCase())) {
      out = out.slice(t.length).replace(/^[\s:–—-]+/, '');
    }
  }
  return out;
}

/** Split before a capitalised infinitive that follows a lowercase word. */
function splitVerbRun(text: string): string[] {
  return text.split(/(?<=[a-zà-ÿ0-9)])\s+(?=[A-ZÀ-Ý][a-zà-ÿ]+(?:er|ir|re)\s)/).map((i) => i.trim());
}

/** Split a heading-free section body into paragraph or list blocks. */
function bodyBlocks(body: string): DescriptionBlock[] {
  const text = normalizeSpaces(body);
  if (!text) return [];

  // Inline bullets: "• a • b • c"
  if ((text.match(/\s[•▪●◦]\s/g) || []).length >= 2) {
    const [lead, ...items] = text.split(/\s*[•▪●◦]\s+/);
    return [
      ...(lead.trim() ? [{ type: 'paragraph' as const, text: lead.trim() }] : []),
      { type: 'list', items: items.map((i) => i.trim()).filter(Boolean) },
    ];
  }

  // Semicolon-separated lists ("Faire A; Faire B; Faire C."), then run-together
  // verb lists inside each part ("... fiable Contribuer à ... Sécuriser ...").
  const semicolonParts = text.split(/\s*;\s*/).filter(Boolean);
  const items = semicolonParts.flatMap((part) => {
    const verbs = splitVerbRun(part);
    return verbs.length >= 3 ? verbs : [part];
  });
  if (semicolonParts.length >= 3 || items.length >= 3) {
    return [{ type: 'list', items: items.map((i) => i.replace(/[.;]\s*$/, '').trim()).filter(Boolean) }];
  }

  return [{ type: 'paragraph', text }];
}

/** Text that already has its own line breaks: keep them. */
function formatMultiline(text: string): DescriptionBlock[] {
  const blocks: DescriptionBlock[] = [];
  let list: string[] = [];
  const flushList = () => {
    if (list.length) blocks.push({ type: 'list', items: list });
    list = [];
  };

  for (const rawLine of text.split('\n')) {
    const line = normalizeSpaces(rawLine);
    if (!line) {
      flushList();
      continue;
    }
    if (BULLET_LINE_RE.test(line)) {
      list.push(line.replace(BULLET_LINE_RE, ''));
      continue;
    }
    flushList();
    if (line.length <= 60 && /:$/.test(line)) {
      blocks.push({ type: 'heading', text: line.replace(/:$/, '') });
    } else {
      const last = blocks[blocks.length - 1];
      // Consecutive non-blank lines form one paragraph.
      if (last && last.type === 'paragraph' && !/[.!?:]$/.test(last.text)) last.text += ` ${line}`;
      else blocks.push({ type: 'paragraph', text: line });
    }
  }
  flushList();
  return blocks;
}

export function formatJobDescription(
  description: string | null | undefined,
  title?: string | null
): DescriptionBlock[] {
  if (!description) return [];
  const decoded = decodeEntities(description).replace(/\r\n?/g, '\n').trim();
  if (!decoded) return [];

  if (/\n/.test(decoded)) {
    return formatMultiline(stripPreamble(decoded, title));
  }

  const text = normalizeSpaces(stripPreamble(decoded, title));
  const blocks: DescriptionBlock[] = [];
  let cursor = 0;
  HEADING_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  const sections: { heading: string | null; body: string }[] = [];
  let currentHeading: string | null = null;

  while ((match = HEADING_RE.exec(text))) {
    const headingStart = match.index + match[1].length;
    sections.push({ heading: currentHeading, body: text.slice(cursor, headingStart) });
    currentHeading = match[2];
    cursor = match.index + match[0].length;
  }
  sections.push({ heading: currentHeading, body: text.slice(cursor) });

  for (const section of sections) {
    if (section.heading) blocks.push({ type: 'heading', text: section.heading });
    blocks.push(...bodyBlocks(section.body));
  }
  return blocks.filter((b) => (b.type === 'list' ? b.items.length > 0 : b.text.trim().length > 0));
}

/** Total characters of visible text, used to decide whether to collapse. */
export function blocksTextLength(blocks: DescriptionBlock[]): number {
  return blocks.reduce((n, b) => n + (b.type === 'list' ? b.items.join(' ').length : b.text.length), 0);
}
