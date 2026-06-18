import * as z from 'zod';

export const environmentIdParamsSchema = z
    .object({
        environmentId: z.coerce.number().int().positive()
    })
    .strict();

export const taskAbortParamsSchema = z
    .object({
        environmentId: z.coerce.number().int().positive(),
        taskId: z.string().min(1)
    })
    .strict();

export const syncConflictBodySchema = z
    .object({
        scriptType: z.string().min(1),
        syncId: z.string().min(1),
        refresh: z.boolean().optional().default(false)
    })
    .strict();

export const lockOwnerKeyBodySchema = z
    .object({
        owner: z.string().min(1).max(255),
        key: z.string().min(1).max(255)
    })
    .strict();

export const tryAcquireLockBodySchema = lockOwnerKeyBodySchema.extend({
    ttlMs: z.coerce.number().int().positive()
});

export const releaseAllLocksBodySchema = z
    .object({
        owner: z.string().min(1).max(255)
    })
    .strict();

export const hasLockQuerySchema = z
    .object({
        owner: z.string().min(1).max(255),
        key: z.string().min(1).max(255)
    })
    .strict();
