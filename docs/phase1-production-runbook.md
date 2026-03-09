# Phase 1 Production Runbook

Use this runbook to execute Phase 1 production verification in the correct order.

## Files

- Full UAT matrix: [phase1-production-uat-matrix.csv](/C:/Users/USER/Downloads/Joblinca%20Project/Joblinca/docs/phase1-production-uat-matrix.csv)
- Critical-path matrix: [phase1-production-critical-path.csv](/C:/Users/USER/Downloads/Joblinca%20Project/Joblinca/docs/phase1-production-critical-path.csv)
- SQL verification script: [phase1-production-verification.sql](/C:/Users/USER/Downloads/Joblinca%20Project/Joblinca/docs/phase1-production-verification.sql)
- Postman collection: [joblinca-phase1-uat.postman_collection.json](/C:/Users/USER/Downloads/Joblinca%20Project/Joblinca/docs/joblinca-phase1-uat.postman_collection.json)
- Postman environment template: [joblinca-phase1-uat.postman_environment.json](/C:/Users/USER/Downloads/Joblinca%20Project/Joblinca/docs/joblinca-phase1-uat.postman_environment.json)

## Execution Order

1. Confirm all required migrations are applied.
2. Run the SQL verification script.
3. Import the Postman collection and environment.
4. Fill environment variables.
5. Run the Newman critical-path folder or execute the critical-path CSV manually.
6. If critical path passes, run the full UAT matrix.

## Required Environment Variables

Set these values in the Postman environment:

- `base_url`
  - Example: `https://joblinca.com`
- `cookie_header`
  - Supabase auth cookies for the currently logged-in test user
- `cron_secret`
  - Value of production `CRON_SECRET`
- `recruiter_id`
  - Recruiter A user id for admin on-behalf posting
- `recruiter_job_id`
  - Job id created during recruiter posting flow
- `admin_job_id`
  - Job id created during admin educational internship flow
- `application_id`
  - Application id created during the apply flow
- `pipeline_stage_id`
  - Optional stage id if you want to test explicit stage-id moves

## How To Capture Supabase Session Cookies

Authenticated app routes use Supabase session cookies, not bearer tokens.

1. Log in to the correct test user in the browser.
2. Open browser developer tools.
3. Open the Network tab.
4. Load any authenticated page or trigger any authenticated API request.
5. Copy the full `Cookie` request header value.
6. Paste it into Postman as `cookie_header`.

The cookie header should include the `sb-*` cookies issued by Supabase.

## SQL Verification

Run:

```sql
\i docs/phase1-production-verification.sql
```

If your SQL editor does not support `\i`, paste the file contents directly.

Blocking failures:

- non-draft applications missing `current_stage_id`
- internships missing `internship_track`
- educational internships not limited to `talent`
- live jobs missing pipelines
- recent match notifications missing `match_reason_signals`

## Postman Execution Notes

### Recruiter flow

1. Set `cookie_header` to Recruiter A.
2. Run:
   - `Recruiter Create Professional Internship`
   - `Get Pipeline`
3. Save the returned job id into `recruiter_job_id`.

### Admin flow

1. Set `cookie_header` to Admin A.
2. Set `recruiter_id`.
3. Run:
   - `Admin Create Educational Internship For Recruiter`
4. Save the returned job id into `admin_job_id`.

### Candidate flow

1. Set `cookie_header` to Talent A for educational eligibility preview.
2. Run `Eligibility Preview`.
3. Set `cookie_header` to Job Seeker A for professional application.
4. Run `Submit Application`.
5. Save the returned application id into `application_id`.

### ATS flow

1. Set `cookie_header` to Recruiter A.
2. Run:
   - `Get Pipeline`
   - `Move Application Stage`
   - `Submit Stage Feedback`
   - `Record Hiring Decision`
   - `Match Insights`

### Cron flow

1. Set `cron_secret`.
2. Run:
   - `Hourly Match Dispatch`
   - `Daily Match Dispatch`

## Newman Runner

Install the local dependency first if it is not already present:

```powershell
cmd /c npm install --save-dev newman
```

You can execute the collection from terminal with:

```powershell
npm run uat:phase1:newman
```

Critical path only:

```powershell
npm run uat:phase1:critical
```

Example with explicit values:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/run-phase1-uat-newman.ps1 `
  -BaseUrl "https://joblinca.com" `
  -CookieHeader "<browser cookie header>" `
  -CronSecret "<cron secret>" `
  -RecruiterId "<recruiter user id>" `
  -Folder "Posting"
```

The runner:

- uses [joblinca-phase1-uat.postman_collection.json](/C:/Users/USER/Downloads/Joblinca%20Project/Joblinca/docs/joblinca-phase1-uat.postman_collection.json)
- uses [joblinca-phase1-uat.postman_environment.json](/C:/Users/USER/Downloads/Joblinca%20Project/Joblinca/docs/joblinca-phase1-uat.postman_environment.json)
- exports a JSON report to `reports/phase1-uat-report.json`
- fails fast if `newman` is not installed

After a run, summarize the report with:

```powershell
npm run uat:phase1:report
```

The collection now auto-captures:

- `recruiter_job_id`
- `admin_job_id`
- `application_id`
- `pipeline_stage_id`

from successful API responses.

## Acceptance Standard

Do not mark Phase 1 production-ready unless all critical-path rows pass:

- posting
- eligibility
- final apply
- pipeline load
- ATS stage movement
- feedback
- hiring decision
- immediate matching
- hourly cron
- recruiter analytics
- admin analytics
- security checks
- educational internship end-to-end
- professional internship end-to-end

## Failure Handling

If a row fails:

1. Record the exact request and response.
2. Record the failing UAT id.
3. Check whether the issue is:
   - data/migration
   - auth/permission
   - ATS transition logic
   - matching dispatch
   - delivery provider
   - analytics/query issue
4. Fix the issue before continuing to full signoff.
