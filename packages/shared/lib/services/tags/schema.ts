import { z } from 'zod';

export const TAG_MAX_COUNT = 10;
export const TAG_KEY_MAX_LENGTH = 64;
export const TAG_VALUE_MAX_LENGTH = 255;

const connectionTagsKeySchema = z
    .string()
    .regex(/^[a-zA-Z][a-zA-Z0-9_\-./]*$/, {
        message: 'Tag keys must start with a letter and contain only alphanumerics, underscores, hyphens, periods, or slashes'
    })
    .max(TAG_KEY_MAX_LENGTH, { message: `Tag keys must be at most ${TAG_KEY_MAX_LENGTH} characters` });

const connectionTagsValueSchema = z
    .string()
    .min(1)
    .max(TAG_VALUE_MAX_LENGTH, { message: `Tag values must be at most ${TAG_VALUE_MAX_LENGTH} characters` });

/**
 * Zod schema for connection tags.
 * Validates tag format and normalizes keys to lowercase.
 * Values are preserved as-is (they could be case-sensitive IDs).
 */
export const connectionTagsSchema = z
    .record(connectionTagsKeySchema, connectionTagsValueSchema)
    .superRefine((tags, ctx) => {
        const entries = Object.entries(tags);

        if (entries.length > TAG_MAX_COUNT) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: `Tags cannot contain more than ${TAG_MAX_COUNT} keys`
            });
            return;
        }

        // Check for duplicate keys after normalization
        const seen = new Set<string>();
        for (const [key, value] of entries) {
            const normalized = key.toLowerCase();
            if (seen.has(normalized)) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: `Duplicate tag key after case normalization: "${normalized}"`
                });
            }
            seen.add(normalized);
            if (normalized === 'end_user_email') {
                const emailResult = z.string().email().min(5).safeParse(value);
                if (!emailResult.success) {
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        message: 'Tag "end_user_email" must be a valid email'
                    });
                }
            }
        }
    })
    .transform((tags) => {
        const normalized: Record<string, string> = {};
        for (const [key, value] of Object.entries(tags)) {
            normalized[key.toLowerCase()] = value;
        }
        return normalized;
    });
