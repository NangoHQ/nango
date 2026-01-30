import { z } from 'zod';

import { Err, Ok } from '@nangohq/utils';

import type { Checkpoint, DBCheckpoint } from '@nangohq/types';
import type { Result } from '@nangohq/utils';
import type { Knex } from 'knex';

const TABLE = 'checkpoints';

export const CHECKPOINT_KEY_MAX_LENGTH = 255;
export const CHECKPOINT_STRING_VALUE_MAX_LENGTH = 255;
export const CHECKPOINT_MAX_FIELDS = 16;

/**
 * Zod schema for checkpoint validation.
 * - Keys: max 255 characters
 * - String values: max 255 characters
 * - Date values: converted to ISO string
 * - Max 16 fields
 */
const checkpointValueSchema = z.union([
    z.string().max(CHECKPOINT_STRING_VALUE_MAX_LENGTH),
    z.number(),
    z.boolean(),
    z.date().transform((d) => d.toISOString())
]);

export const checkpointSchema = z
    .record(z.string().max(CHECKPOINT_KEY_MAX_LENGTH), checkpointValueSchema)
    .refine((data) => Object.keys(data).length <= CHECKPOINT_MAX_FIELDS, {
        message: `Checkpoint cannot have more than ${CHECKPOINT_MAX_FIELDS} fields`
    });

export function validateCheckpoint(data: unknown): Result<Checkpoint> {
    const result = checkpointSchema.safeParse(data);
    if (result.success) {
        return Ok(result.data);
    }
    return Err(new Error('invalid_checkpoint_format'));
}

/**
 * Get a checkpoint by environment ID, connection ID, and key.
 * @param environmentId - The environment ID the checkpoint belongs to.
 * @param connectionId - The connection ID the checkpoint belongs to.
 * @param key - The key of the checkpoint.
 * @returns The checkpoint if found, or null if not found.
 */
export async function getCheckpoint(
    db: Knex,
    { environmentId, connectionId, key }: { environmentId: number; connectionId: number; key: string }
): Promise<Result<DBCheckpoint | null>> {
    try {
        const result = await db.from<DBCheckpoint>(TABLE).where({ environment_id: environmentId, connection_id: connectionId, key }).first();
        return Ok(result ?? null);
    } catch (err) {
        return Err(new Error('failed_to_get_checkpoint', { cause: err }));
    }
}

/**
 * Upsert a checkpoint with optimistic locking.
 *
 * @param environmentId - The environment ID the checkpoint belongs to.
 * @param connectionId - The connection ID the checkpoint belongs to.
 * @param key - The key of the checkpoint.
 * @param checkpoint - The checkpoint data to save.
 * @param expectedVersion - Required for updates. Must match the current version.
 *                          Without expectedVersion, only new checkpoints can be created.
 *                          With correct expectedVersion, can update or resurrect deleted checkpoints.
 * @returns The checkpoint, or an error if there's a conflict.
 */
export async function upsertCheckpoint(
    db: Knex,
    {
        environmentId,
        connectionId,
        key,
        checkpoint,
        expectedVersion
    }: { environmentId: number; connectionId: number; key: string; checkpoint: Checkpoint; expectedVersion?: number }
): Promise<Result<DBCheckpoint>> {
    if (key.length > CHECKPOINT_KEY_MAX_LENGTH) {
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
            INSERT INTO ${TABLE} (environment_id, connection_id, key, checkpoint, version, created_at, updated_at)
            VALUES (?, ?, ?, ?::jsonb, 1, NOW(), NOW())
            ON CONFLICT (environment_id, connection_id, key)
            DO UPDATE SET
                checkpoint = EXCLUDED.checkpoint,
                version = ${TABLE}.version + 1,
                deleted_at = NULL,
                updated_at = NOW()
            WHERE
                ${TABLE}.version = ?
            RETURNING *
            `,
            [environmentId, connectionId, key, JSON.stringify(validatedCheckpoint), expectedVersion ?? null]
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
 * @param connectionId - The connection ID the checkpoint belongs to.
 * @param key - The key of the checkpoint to delete.
 * @param expectedVersion - The expected version of the checkpoint. Delete will fail if version doesn't match.
 */
export async function deleteCheckpoint(
    db: Knex,
    { environmentId, connectionId, key, expectedVersion }: { environmentId: number; connectionId: number; key: string; expectedVersion: number }
): Promise<Result<void>> {
    try {
        const count = await db
            .from<DBCheckpoint>(TABLE)
            .where({ environment_id: environmentId, connection_id: connectionId, key, version: expectedVersion })
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
 * Hard delete all checkpoints for a connection, optionally filtered by key prefix.
 * This does not use optimistic locking as it's typically used for cleanup operations.
 *
 * @param environmentId - The environment ID the checkpoints belong to.
 * @param connectionId - The connection ID the checkpoints belong to.
 * @param keyPrefix - Optional prefix to filter keys. If not provided, all checkpoints for the connection are deleted.
 * @example
 * hardDeleteCheckpoints(db, { environmentId: 1, connectionId: 123 }) // deletes all
 * hardDeleteCheckpoints(db, { environmentId: 1, connectionId: 123, keyPrefix: "sync:" }) // deletes by prefix
 */
export async function hardDeleteCheckpoints(
    db: Knex,
    { environmentId, connectionId, keyPrefix }: { environmentId: number; connectionId: number; keyPrefix?: string }
): Promise<Result<number>> {
    try {
        let query = db.from<DBCheckpoint>(TABLE).where('environment_id', environmentId).where('connection_id', connectionId);

        if (keyPrefix) {
            // Escape special characters for SQL LIKE query
            // % and _ are wildcards, \ is the escape character
            const escapedPrefix = keyPrefix.replace(/[%_\\]/g, '\\$&');
            query = query.whereRaw("key LIKE ? ESCAPE '\\'", [`${escapedPrefix}%`]);
        }

        const count = await query.delete();
        return Ok(count);
    } catch (err) {
        return Err(new Error('failed_to_hard_delete_checkpoints', { cause: err }));
    }
}
