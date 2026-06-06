# Joblinca Screenshot Workflow

This workflow uses Playwright to capture ad-ready marketing screenshots from the live Joblinca site and save them to `ads/assets/`.

## Prerequisites

- Node.js 18+.
- Project dependencies installed from the Joblinca repo root.
- Playwright Chromium installed locally.
- Network access to the target Joblinca environment.

## Installation

From the project root:

```bash
npm install
npx playwright install chromium
```

If `playwright`, `tsx`, and Chromium are already installed in this repo, no extra install step is needed.

## Run

Default live site:

```bash
npx tsx scripts/ads/extract-joblinca-screenshots.ts
```

Override the base URL:

Unix/macOS:

```bash
JOBLINCA_BASE_URL="https://joblinca.com" npx tsx scripts/ads/extract-joblinca-screenshots.ts
```

PowerShell:

```powershell
$env:JOBLINCA_BASE_URL="https://joblinca.com"
npx tsx scripts/ads/extract-joblinca-screenshots.ts
```

## Output

The script rewrites the expected output set on each run:

- `ads/assets/01-homepage-hero.png`
- `ads/assets/02-homepage-how-it-works.png`
- `ads/assets/03-jobs-listing-page.png`
- `ads/assets/04-jobs-count-focus.png`
- `ads/assets/05-single-job-card.png`
- `ads/assets/06-single-job-detail-page.png`
- `ads/assets/07-apply-button-focus.png`
- `ads/assets/08-application-flow-step.png`
- `ads/assets/09-mobile-homepage.png`
- `ads/assets/10-mobile-jobs-page.png`
- `ads/assets/manifest.json`

## Fallback Logic

The script is designed to keep going even when one selector path fails.

- It prefers accessible roles, headings, stable internal links, and visible content patterns instead of brittle CSS-only selectors.
- It retries navigation, critical waits, and job-detail opening before giving up on a selector path.
- It dismisses or hides common screenshot blockers such as cookie banners, chat widgets, toast containers, and sticky overlays.
- If a target section cannot be isolated, it falls back to the closest meaningful visual alternative and still attempts to create the required file.
- If a step fails, the run continues and logs `step failed but continuing`.

## How Jobs and Apply Flow Detection Works

- Jobs page detection checks `/jobs` first, then other likely routes, then homepage links, then a homepage jobs section fallback.
- Job detail opening prefers stable `/jobs/<id>` links from listing cards before falling back to clicks.
- Apply flow detection classifies CTAs as:
  - separate Joblinca apply page
  - auth wall
  - inline or modal flow
  - external website
  - email
  - phone
  - WhatsApp
- External or off-site flows are handled safely by capturing the best on-page next-step context instead of forcing a broken outbound flow.

## Updating Selectors If The UI Changes

If Joblinca UI changes, update the candidate helpers inside [extract-joblinca-screenshots.ts](/C:/Users/USER/Downloads/Joblinca%20Project/Joblinca/scripts/ads/extract-joblinca-screenshots.ts):

- `heroCandidates()`
- `howItWorksCandidates()`
- `homepageJobsCandidates()`
- `jobsHeaderCandidates()`
- `jobsCountCandidates()`
- `jobCardCandidates()`
- `detailCandidates()`
- `applyPanelCandidates()`
- `applyCtaCandidates()`
- `applicationStepCandidates()`
- `authCandidates()`

Keep the selectors anchored to:

- accessible roles
- visible headings
- button or link text
- stable internal href patterns
- repeated content structures that are already visible to users

## Known Limitations

- Screenshots depend on the live environment having enough public jobs to show meaningful listing and detail states.
- The unauthenticated flow will often capture a sign-in wall instead of the full Joblinca application form, which is expected behavior for some jobs.
- External application methods can only be captured as safe on-page context unless you intentionally automate the external site too.
- Large UI redesigns can require selector updates even with the fallback logic in place.
