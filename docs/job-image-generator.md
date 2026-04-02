# Job Marketing Image Generator

This pipeline turns structured job payloads into vertical marketing creatives sized for TikTok, Reels, and WhatsApp Status.

In the app workflow, automatic generation now happens when a job becomes approved, not when it is first created.
Approval generates all 3 default variants, stores them in Cloudinary/cache, and saves the primary variant to `jobs.image_url`.

## Why This Implementation

- The repo already ships with `playwright`, so adding Puppeteer would duplicate browser tooling for no gain.
- `node-html-to-image` is lighter, but Playwright gives better CSS fidelity, easier browser lifecycle control, and cleaner debugging for production HTML templates.
- Cloudinary upload is done with signed `fetch` calls instead of the Cloudinary SDK to keep the dependency surface small.

## API

Route: `POST /api/generate-job-images`

Auth:

- Admin session, or
- `Authorization: Bearer <JOB_IMAGE_GENERATOR_TOKEN>`

Accepted body shapes:

```json
[
  {
    "title": "Accountant",
    "location": "Douala",
    "salary": "150,000 XAF",
    "company": "Confidential",
    "type": "Full-time"
  }
]
```

```json
{
  "jobs": [
    {
      "title": "Accountant",
      "location": "Douala",
      "salary": "150,000 XAF",
      "company": "Confidential",
      "type": "Full-time"
    }
  ],
  "options": {
    "variations": 3,
    "concurrency": 4,
    "delivery": "cloudinary"
  }
}
```

Admin retrieval route:

- `GET /api/admin/jobs/:id/marketing-images`
- Requires an active admin session
- Returns the latest stored variant for each variation key and marks which one is currently saved as `jobs.image_url`

Admin regenerate route:

- `POST /api/admin/jobs/:id/marketing-images`
- Requires an active admin session
- Re-renders and re-persists the 3 default approved-job variants after a job is edited

Example response shape:

```json
{
  "ok": true,
  "template_version": "joblinca-reels-v1",
  "requested_jobs": 1,
  "requested_images": 3,
  "generated_images": 3,
  "cached_images": 0,
  "failed_images": 0,
  "duration_ms": 1824,
  "results": [
    {
      "job_title": "Accountant",
      "variation": "urgent-location",
      "headline": "Urgent hiring in Douala",
      "image_url": "https://res.cloudinary.com/...",
      "public_id": "job-marketing/...",
      "cached": false
    }
  ],
  "errors": [],
  "warnings": []
}
```

## Local Setup

1. Install dependencies.
2. Install Chromium for Playwright:

```powershell
npx playwright install chromium
```

3. Fill in the new environment variables in `.env.local`:

```env
JOB_IMAGE_GENERATOR_TOKEN=...
JOB_IMAGE_GENERATOR_CONCURRENCY=4
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
CLOUDINARY_UPLOAD_FOLDER=job-marketing
```

4. Apply Supabase migrations so the cache table exists:

```powershell
supabase db push
```

## Example Template

The canonical HTML/CSS template lives in [template.ts](/C:/Users/USER/Downloads/Joblinca%20Project/Joblinca/lib/job-image-generator/template.ts) as `JOB_MARKETING_TEMPLATE`.

Its placeholder contract is:

```html
<div class="badge">{{badge_text}}</div>
<p class="headline">{{headline}}</p>
<div class="company">{{company}}</div>
<h1 class="title">{{title}}</h1>
<div class="meta-pill">{{location}}</div>
<div class="meta-pill">{{type}}</div>
<span class="salary-value">{{salary}}</span>
<span class="cta-main">{{cta_text}}</span>
```

## Scaling Notes

- The current route supports up to 100 jobs per request with bounded concurrency.
- This is good enough for the stated 100–300 images/day target if requests are spread out.
- Once the workflow becomes truly bursty, move the trigger into a background worker and keep the API route as a job enqueue endpoint only.
- The included `job_marketing_assets` table caches repeat generations by normalized input hash so unchanged jobs do not re-render.
