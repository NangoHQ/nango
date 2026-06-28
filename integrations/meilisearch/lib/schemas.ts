import * as z from 'zod';

/** A single Meilisearch document — arbitrary JSON object. */
export const meiliDocumentSchema = z.record(z.string(), z.unknown());

/** searchRules value for one index: object (optionally with filter), boolean, or array. */
const searchRuleValueSchema = z.union([z.object({ filter: z.string().optional() }).catchall(z.unknown()), z.boolean(), z.array(z.unknown())]);

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
