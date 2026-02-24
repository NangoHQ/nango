/**
 * Allowed types for checkpoint values.
 * Only flat key-value structures are supported (no nested objects or arrays).
 */
export type CheckpointValue = string | number | boolean;

/**
 * A checkpoint is a flat key-value object that can be used to store
 * progress or state during function execution.
 *
 * @example
 * ```typescript
 * const checkpoint: Checkpoint = {
 *     lastProcessedPage: 5,
 *     lastCursor: "abc123",
 *     lastRunAt: "2024-01-15T00:00:00Z",
 * };
 * ```
 */
export type Checkpoint = Record<string, CheckpointValue>;
