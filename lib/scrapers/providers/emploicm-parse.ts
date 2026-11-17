/**
 * Pure parsing helpers for the Emploi.cm scraper (no I/O, unit-tested in
 * tests/emploicm-parse.test.js).
 *
 * 2026-11: Emploi.cm moved from Drupal `.views-row` cards to
 *   <div class="card card-job" data-href="https://www.emploi.cm/offre-emploi-cameroun/slug-1264651">
 *     <picture><a><img src="logo"></a></picture>
 *     <div class="card-job-detail">
 *       <h3><a href="/offre-emploi-cameroun/slug-1264651">Title</a></h3>
 *       <a class="card-job-company company-name">Company</a>
 *       <div class="card-job-description"><p>excerpt</p></div>
 *       <ul><li>Contrat proposé : <strong>CDI</strong></li> ...</ul>
 *       <time datetime="2026-11-17">17.11.2026</time>
 * so the old selectors matched nothing.
 *
 * Every Emploi.cm page (including real listings) also embeds Cloudflare's
 * passive bot-management beacon `/cdn-cgi/challenge-platform/scripts/jsd/main.js`.
 * The old check treated the substring "challenge-platform" as a blocking
 * challenge, so every run aborted as failed before parsing anything.
 */

const cheerio = require('cheerio/slim') as typeof import('cheerio');

const BASE_URL = 'https://www.emploi.cm';

export interface EmploiCmCard {
  jobId: string;
  title: string;
  url: string;
  company: string | null;
  logo: string | null;
  description: string | null;
  /** ISO date (YYYY-MM-DD) from <time datetime>, or null. */
  postedDate: string | null;
  education?: string;
  experience?: string;
  contract?: string;
  region?: string;
  skills?: string;
}

/**
 * True only for an actual interstitial challenge page ("Just a moment..."),
 * not for normal pages that merely load the passive challenge-platform beacon.
 */
export function isCloudflareChallenge(html: string): boolean {
  if (/<title>\s*Just a moment/i.test(html)) return true;
  if (html.includes('window._cf_chl_opt')) return true;
  if (html.includes('cf-browser-verification')) return true;
  if (/id="challenge-(form|running|stage)"/.test(html)) return true;
  return false;
}

function squash(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function absolute(href: string): string {
  return href.startsWith('http') ? href : `${BASE_URL}${href.startsWith('/') ? '' : '/'}${href}`;
}

export function parseEmploiCmListing(html: string): { cards: EmploiCmCard[]; hasNext: boolean } {
  const $ = cheerio.load(html);
  const cards: EmploiCmCard[] = [];

  $('.card-job').each((_, el) => {
    const $card = $(el);
    const $titleLink = $card.find('h3 a').first();
    const title = squash($titleLink.text());
    const href = $titleLink.attr('href') || $card.attr('data-href') || '';
    if (!title || !href) return;

    const url = absolute(href);
    const idMatch = url.match(/-(\d+)\/?$/);
    const jobId = idMatch ? idMatch[1] : url;

    const logoSrc = $card.find('picture img').attr('src') || null;
    const description = squash($card.find('.card-job-description p').text()).slice(0, 500) || null;
    const datetime = $card.find('time[datetime]').attr('datetime') || null;

    const card: EmploiCmCard = {
      jobId,
      title,
      url,
      company: squash($card.find('.card-job-company').text()) || null,
      logo: logoSrc ? absolute(logoSrc) : null,
      description,
      postedDate: datetime && /^\d{4}-\d{2}-\d{2}/.test(datetime) ? datetime.slice(0, 10) : null,
    };

    $card.find('ul li').each((_, li) => {
      const $li = $(li);
      const label = squash($li.clone().children('strong').remove().end().text()).toLowerCase();
      const value = squash($li.find('strong').text());
      if (!value) return;
      if (label.includes('études') || label.includes('etudes')) card.education = value;
      else if (label.includes('expérience') || label.includes('experience')) card.experience = value;
      else if (label.includes('contrat')) card.contract = value;
      else if (label.includes('région') || label.includes('region')) card.region = value;
      else if (label.includes('compétence') || label.includes('competence')) card.skills = value;
    });

    cards.push(card);
  });

  const hasNext = $('li.pager-next a').length > 0 || $('a[title*="suivante"]').length > 0;
  return { cards, hasNext };
}
