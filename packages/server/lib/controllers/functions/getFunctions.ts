import tracer from 'dd-trace';
import { z } from 'zod';

import db from '@nangohq/database';
import { functionConfigService } from '@nangohq/shared';
import { zodErrorToHTTP } from '@nangohq/utils';

import { providerConfigKeySchema, providerNameSchema } from '../../helpers/validation.js';
import { asyncWrapperWithEnvironment } from '../../utils/asyncWrapper.js';
import { toGetFunctionResponse } from './helpers.js';

import type { GetFunctions } from '@nangohq/types';

function encodeCursor(id: number): string {
    return Buffer.from(String(id), 'utf8').toString('base64url');
}

function decodeCursor(cursor: string): number | undefined {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    return /^\d+$/.test(decoded) ? Number.parseInt(decoded, 10) : undefined;
}

const queryValidation = z
    .object({
        integration: providerConfigKeySchema.optional(),
        provider: providerNameSchema.optional(),
        state: z.enum(['enabled', 'disabled']).optional(),
        'trigger.kind': z.enum(['none', 'schedule', 'http', 'event']).optional(),
        cursor: z
            .string()
            .min(1)
            .max(255)
            .check((payload) => {
                if (decodeCursor(payload.value) === undefined) {
                    payload.issues.push({ code: 'custom', message: 'invalid cursor', input: payload.value });
                }
            })
            .optional(),
        limit: z.coerce.number().int().min(1).max(250).optional().default(50)
    })
    .strict();

export const getFunctions = asyncWrapperWithEnvironment<GetFunctions>(async (req, res) => {
    const query = queryValidation.safeParse(req.query);
    if (!query.success) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(query.error) } });
        return;
    }

    const { environment } = res.locals;
    const { integration, provider, state, 'trigger.kind': triggerKind, cursor, limit } = query.data;

    // One extra row tells us a next page exists without a count query.
    const result = await functionConfigService.search(
        db.knex,
        {
            environmentId: environment.id,
            filter: {
                integrationKey: integration,
                provider,
                enabled: state === undefined ? undefined : state === 'enabled',
                ...(triggerKind ? { trigger: { kind: triggerKind } } : {})
            }
        },
        { afterId: cursor === undefined ? undefined : decodeCursor(cursor), limit: limit + 1 }
    );

    if (result.isErr()) {
        tracer.scope().active()?.setTag('error', result.error);
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to list functions' } });
        return;
    }

    const page = result.value.slice(0, limit);
    const last = page.at(-1);
    res.status(200).send({
        data: page.map(toGetFunctionResponse),
        next_cursor: result.value.length > limit && last ? encodeCursor(last.config.id) : null
    });
});
