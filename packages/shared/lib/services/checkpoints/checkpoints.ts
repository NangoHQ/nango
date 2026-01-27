import { z } from 'zod';

import { Err, Ok } from '@nangohq/utils';

import type { Checkpoint, DBCheckpoint } from '@nangohq/types';
import type { Result } from '@nangohq/utils';
import type { Knex } from 'knex';

const TABLE = 'checkpoints';

const MAX_KEY_LENGTH = 255;
const MAX_STRING_VALUE_LENGTH = 255;
const MAX_FIELDS = 16;

/**
 * Zod schema for checkpoint validation.
 * - Keys: max 255 characters
 * - String values: max 255 characters
 * - Date values: converted to ISO string
 * - Max 16 fields
 */
const checkpointValueSchema = z.union([z.string().max(MAX_STRING_VALUE_LENGTH), z.number(), z.boolean(), z.date().transform((d) => d.toISOString())]);

const checkpointSchema = z.record(z.string().max(MAX_KEY_LENGTH), checkpointValueSchema).refine((data) => Object.keys(data).length <= MAX_FIELDS, {
    message: `Checkpoint cannot have more than ${MAX_FIELDS} fields`
});

/**
 * Validates that a checkpoint object only contains flat key-value pairs
 * with string, number, or boolean values.
 */
export function validateCheckpoint(data: unknown): Result<Checkpoint> {
    const result = checkpointSchema.safeParse(data);
    if (result.success) {
        return Ok(result.data);
    }
    return Err(new Error('invalid_checkpoint_format'));
}

/**
 * Get a checkpoint by environment ID and key.
 * Only returns non-deleted checkpoints.
 * @param environmentId - The environment ID the checkpoint belongs to.
 * @param key - The key of the checkpoint.
 * @returns The checkpoint if found, or null if not found.
 */
export async function getCheckpoint(db: Knex, { environmentId, key }: { environmentId: number; key: string }): Promise<Result<DBCheckpoint | null>> {
    try {
        const result = await db.from<DBCheckpoint>(TABLE).where({ environment_id: environmentId, key }).whereNull('deleted_at').first();
        return Ok(result ?? null);
    } catch (err) {
        return Err(new Error('failed_to_get_checkpoint', { cause: err }));
    }
}

/**
 * Upsert a checkpoint with optimistic locking.
 *
 * @param environmentId - The environment ID the checkpoint belongs to.
 * @param key - The key of the checkpoint.
 * @param checkpoint - The checkpoint data to save.
 * @param expectedVersion - Required for updates. Must match the current version.
 *                          Without expectedVersion, only new checkpoints can be created.
 *                          With correct expectedVersion, can update or resurrect deleted checkpoints.
 * @returns The checkpoint, or an error if there's a conflict.
 */
export async function upsertCheckpoint(
    db: Knex,
    { environmentId, key, checkpoint, expectedVersion }: { environmentId: number; key: string; checkpoint: Checkpoint; expectedVersion?: number }
): Promise<Result<DBCheckpoint>> {
    if (key.length > MAX_KEY_LENGTH) {
        return Err(new Error('checkpoint_key_too_long'));
    }

    const validation = validateCheckpoint(checkpoint);
    if (validation.isErr()) {
        return Err(validation.error);
    }

    const validatedCheckpoint = validation.unwrap();

    try {
        const result = await db.raw<{ rows: DBCheckpoint[] }>(
            `
            INSERT INTO ${TABLE} (environment_id, key, checkpoint, version, created_at, updated_at)
            VALUES (?, ?, ?::jsonb, 1, NOW(), NOW())
            ON CONFLICT (environment_id, key)
            DO UPDATE SET
                checkpoint = EXCLUDED.checkpoint,
                version = ${TABLE}.version + 1,
                deleted_at = NULL,
                updated_at = NOW()
            WHERE
                ${TABLE}.version = ?
            RETURNING *
            `,
            [environmentId, key, JSON.stringify(validatedCheckpoint), expectedVersion ?? null]
        );

        const row = result.rows[0];
        if (!row) {
            return Err(new Error('checkpoint_conflict'));
        }
        return Ok(row);
    } catch (err) {
        return Err(new Error('failed_to_save_checkpoint', { cause: err }));
    }
}

/**
 * Soft delete checkpoint with optimistic locking
 *
 * @param environmentId - The environment ID the checkpoint belongs to.
 * @param key - The key of the checkpoint to delete.
 * @param expectedVersion - The expected version of the checkpoint. Delete will fail if version doesn't match.
 */
export async function deleteCheckpoint(
    db: Knex,
    { environmentId, key, expectedVersion }: { environmentId: number; key: string; expectedVersion: number }
): Promise<Result<void>> {
    try {
        const count = await db
            .from<DBCheckpoint>(TABLE)
            .where({ environment_id: environmentId, key, version: expectedVersion })
            .whereNull('deleted_at')
            .update({
                deleted_at: db.fn.now(),
                version: db.raw('version + 1')
            });

        if (count === 0) {
            return Err(new Error('checkpoint_conflict'));
        }
        return Ok(undefined);
    } catch (err) {
        return Err(new Error('failed_to_delete_checkpoint', { cause: err }));
    }
}

/**
 * Hard delete all checkpoints matching a key prefix (e.g., all checkpoints for a connection).
 * This does not use optimistic locking as it's typically used for cleanup operations.
 *
 * @param environmentId - The environment ID the checkpoints belong to.
 * @param keyPrefix - The prefix of the keys to delete.
 * @example
 * deleteCheckpointsByPrefix(db, { environmentId: 1, keyPrefix: "connection:123:" })
 */
export async function hardDeleteCheckpointsByPrefix(
    db: Knex,
    { environmentId, keyPrefix }: { environmentId: number; keyPrefix: string }
): Promise<Result<number>> {
    try {
        // Escape special characters for SQL LIKE query
        // % and _ are wildcards, \ is the escape character
        const escapedPrefix = keyPrefix.replace(/[%_\\]/g, '\\$&');

        const count = await db
            .from<DBCheckpoint>(TABLE)
            .where('environment_id', environmentId)
            .whereRaw("key LIKE ? ESCAPE '\\'", [`${escapedPrefix}%`])
            .delete();
        return Ok(count);
    } catch (err) {
        return Err(new Error('failed_to_delete_checkpoints_by_prefix', { cause: err }));
    }
}
