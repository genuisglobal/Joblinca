"use client";

// This page serves as an alias for the primary job posting page.
// Recruiters can access it at /recruiter/post-job, which
// internally renders the same component used at /jobs/new.  By
// re-exporting the default export from the new job page, we avoid
// duplicating logic while providing a more intuitive URL for
// recruiters.

export { default } from '@/app/jobs/new/page';