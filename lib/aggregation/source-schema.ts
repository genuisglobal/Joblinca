import { z } from 'zod';

const sourceTypeSchema = z.enum(['api', 'rss', 'ats', 'html', 'manual']);

function optionalTrimmedString() {
  return z
    .string()
    .trim()
    .transform((value) => (value.length > 0 ? value : null))
    .nullable()
    .optional();
}

function normalizedStringArray() {
  return z
    .array(z.string().trim().min(1))
    .optional()
    .transform((items) => items ?? []);
}

export const createAggregationSourceSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug must use lowercase letters, numbers, and hyphens'),
  sourceType: sourceTypeSchema,
  platformRegionId: z.string().trim().min(2).max(16).default('cm'),
  baseUrl: optionalTrimmedString(),
  sourceHomeUrl: optionalTrimmedString(),
  allowedDomains: normalizedStringArray(),
  requiresAttribution: z.boolean().optional().default(true),
  attributionText: optionalTrimmedString(),
  pollIntervalMinutes: z.coerce.number().int().min(5).max(10080).optional().default(360),
  maxPagesPerRun: z.coerce.number().int().min(1).max(1000).optional().default(20),
  rateLimitPerMinute: z.coerce.number().int().min(1).max(600).optional().default(30),
  trustTier: z.coerce.number().int().min(0).max(100).optional().default(50),
  enabled: z.boolean().optional().default(false),
  nextRunAt: optionalTrimmedString(),
  config: z.record(z.unknown()).optional().default({}),
  notes: optionalTrimmedString(),
});

export const updateAggregationSourceSchema = createAggregationSourceSchema.partial();

export type CreateAggregationSourceInput = z.infer<typeof createAggregationSourceSchema>;
export type UpdateAggregationSourceInput = z.infer<typeof updateAggregationSourceSchema>;
