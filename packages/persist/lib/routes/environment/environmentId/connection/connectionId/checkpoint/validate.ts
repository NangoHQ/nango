import * as z from 'zod';

import { CHECKPOINT_KEY_MAX_LENGTH, checkpointSchema } from '@nangohq/shared';

const checkpointParamsSchema = z
    .object({
        environmentId: z.coerce.number().int().positive(),
        nangoConnectionId: z.coerce.number().int().positive()
    })
    .strict();

// GET checkpoint?key=KEY
const getCheckpointQuerySchema = z
    .object({
        key: z.string().min(1).max(CHECKPOINT_KEY_MAX_LENGTH)
    })
    .strict();

export const getCheckpointRequestParser = {
    parseParams: (data: unknown) => checkpointParamsSchema.parse(data),
    parseQuery: (data: unknown) => getCheckpointQuerySchema.parse(data)
};

// PUT checkpoint
const putCheckpointBodySchema = z
    .object({
        key: z.string().min(1).max(CHECKPOINT_KEY_MAX_LENGTH),
        checkpoint: checkpointSchema,
        expectedVersion: z.number().int().positive()
    })
    .strict();

export const putCheckpointRequestParser = {
    parseParams: (data: unknown) => checkpointParamsSchema.parse(data),
    parseBody: (data: unknown) => putCheckpointBodySchema.parse(data)
};

// DELETE checkpoint
const deleteCheckpointBodySchema = z
    .object({
        key: z.string().min(1).max(CHECKPOINT_KEY_MAX_LENGTH),
        expectedVersion: z.number().int().positive()
    })
    .strict();

export const deleteCheckpointRequestParser = {
    parseParams: (data: unknown) => checkpointParamsSchema.parse(data),
    parseBody: (data: unknown) => deleteCheckpointBodySchema.parse(data)
};
