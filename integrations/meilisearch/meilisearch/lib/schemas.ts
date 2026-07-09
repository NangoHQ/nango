import * as z from 'zod';

/** A single Meilisearch document — arbitrary JSON object. */
export const meiliDocumentSchema = z.record(z.string(), z.unknown());

/**
 * A Meilisearch filter expression: a string, or an array mixing strings and
 * string arrays (inner arrays are OR'd, outer entries are AND'd).
 * e.g. [["genres = horror", "genres = comedy"], "release_date > 795484800"]
 */
export const filterSchema = z.union([z.string(), z.array(z.union([z.string(), z.array(z.string())]))]);

/**
 * searchRules value for one index: an object (optionally with a filter) or null (no restriction).
 * Strict: Meilisearch ignores unknown rule keys, so a typo like "filters" would silently
 * remove the restriction from a signed token. Fail closed instead.
 */
const searchRuleValueSchema = z.union([z.strictObject({ filter: filterSchema.optional() }), z.null()]);

/** Per-index search rules keyed by index uid or the "*" wildcard. */
export const searchRulesSchema = z.record(z.string(), searchRuleValueSchema);

/** The async task Meilisearch returns from a write operation. */
export const enqueuedTaskSchema = z
    .object({
        taskUid: z.number(),
        indexUid: z.string().nullable(),
        status: z.string(),
        type: z.string(),
        enqueuedAt: z.string()
    })
    .catchall(z.unknown());
