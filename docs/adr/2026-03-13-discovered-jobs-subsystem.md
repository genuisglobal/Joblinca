# ADR: Keep Aggregated Jobs in a Separate `discovered_jobs` Subsystem

- Status: Accepted
- Date: 2026-03-13

## Context

Joblinca's core marketplace is built around trust. Native jobs in `public.jobs`
already participate in recruiter ownership, moderation, lifecycle management,
applications, reports, and visibility rules. The existing `public.external_jobs`
table is a lightweight feed store for remote jobs and does not support the
provenance, moderation, claim, dedupe, or recruiter outreach workflows required
for a trust-first aggregation engine.

The platform needs aggregation to solve cold start and support recruiter
acquisition, but discovered jobs must not be treated as equivalent to verified
native jobs. Mixing them directly into `public.jobs` would blur the trust
boundary, complicate existing business logic, and make moderation harder to
reason about.

## Decision

Job aggregation will use a separate `discovered_jobs` subsystem.

- `public.jobs` remains the system of record for verified native jobs.
- `public.external_jobs` remains a legacy feed path until it is deliberately
  migrated onto the new connector framework.
- Externally discovered jobs land in dedicated aggregation tables first.
- Discovered jobs can only become native `jobs` through an explicit claim,
  admin import, or later conversion flow.
- Public product surfaces must continue to distinguish verified jobs from
  discovered jobs at both the data and UI levels.

## Consequences

### Positive

- Preserves Joblinca's trust boundary and badge semantics.
- Keeps the existing recruiter ATS and application flow stable.
- Allows source provenance, run history, dedupe, scoring, moderation, and claim
  workflows to evolve without destabilizing native jobs.
- Supports gradual rollout: admin-only operations first, public discovered-job
  surfaces later.

### Tradeoffs

- Adds new schema and admin tooling instead of reusing `external_jobs`.
- Requires explicit conversion rules between discovered jobs and native jobs.
- Creates two job supply lanes that must be explained clearly in the product.

## Implementation Notes

The first implementation phase is additive:

1. Create aggregation foundation tables and provenance fields.
2. Add admin-only source, run, and discovered-job control surfaces.
3. Keep public discovered-job exposure disabled until moderation and trust rules
   are operational.

