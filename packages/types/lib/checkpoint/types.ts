/**
 * Allowed types for checkpoint values.
 * Only flat key-value structures are supported (no nested objects or arrays).
 * Date values are automatically converted to ISO strings when stored.
 */
export type CheckpointValue = string | number | boolean | Date;

/**
 * A checkpoint is a flat key-value object that can be used to store
 * progress or state during function execution.
 * Date values are automatically converted to ISO strings when stored.
 *
 * @example
 * ```typescript
 * const checkpoint: Checkpoint = {
 *     lastProcessedPage: 5,
 *     lastCursor: "abc123",
 *     lastRunAt: new Date(), // stored as ISO string
 * };
 * ```
 */
export type Checkpoint = Record<string, CheckpointValue>;
