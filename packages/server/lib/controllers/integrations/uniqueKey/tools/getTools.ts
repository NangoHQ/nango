import tracer from 'dd-trace';
import * as z from 'zod';

import db from '@nangohq/database';
import { functionConfigService, legacyFunctionService } from '@nangohq/shared';
import { zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapperWithEnvironment } from '../../../../utils/asyncWrapper.js';
import { listedActionToGetToolResponse, toGetToolResponse } from '../../../functions/formatter.js';
import { functionIntegrationIdSchema } from '../../../functions/validation.js';

import type { GetTools } from '@nangohq/types';

const paramsSchema = z.object({ uniqueKey: functionIntegrationIdSchema }).strict();

function encodeCursor(name: string): string {
    return Buffer.from(name, 'utf8').toString('base64url');
}

const querySchema = z
    .object({
        cursor: z
            .string()
            .min(1)
            .max(1024)
            .transform((cursor, ctx) => {
                const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
                if (!decoded || encodeCursor(decoded) !== cursor) {
                    ctx.addIssue({ code: 'custom', message: 'invalid cursor' });
                    return z.NEVER;
                }
                return decoded;
            })
            .optional(),
        limit: z.coerce.number().int().min(1).max(250).optional().default(250)
    })
    .strict();

export const getTools = asyncWrapperWithEnvironment<GetTools>(async (req, res) => {
    const query = querySchema.safeParse(req.query);
    if (!query.success) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(query.error) } });
        return;
    }

    const params = paramsSchema.safeParse(req.params);
    if (!params.success) {
        res.status(400).send({ error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(params.error) } });
        return;
    }

    const { environment } = res.locals;
    const { uniqueKey } = params.data;
    const { cursor: afterName, limit } = query.data;

    try {
        const [result, actionsResult] = await Promise.all([
            functionConfigService.search(db.knex, {
                environmentId: environment.id,
                filter: { integrationKey: uniqueKey, enabled: true, trigger: { kind: 'http' } }
            }),
            legacyFunctionService.listActions({ environmentId: environment.id, providerConfigKey: uniqueKey })
        ]);
        if (actionsResult.isErr()) {
            if (actionsResult.error.code === 'integration_not_found') {
                res.status(404).send({ error: { code: 'not_found', message: `Integration ${uniqueKey} was not found` } });
                return;
            }
            throw actionsResult.error;
        }
        if (result.isErr()) {
            throw result.error;
        }
        const { actions, provider } = actionsResult.value;
        const integration = { unique_key: uniqueKey, provider };

        // Build a map of tools containing, by order of priority:
        // 1. tool functions
        // 2. deployed actions
        // 3. and catalog tools.
        const tools = new Map(result.value.map((fn) => [fn.config.name, toGetToolResponse(fn)]));
        for (const action of actions) {
            if (action.enabled && !tools.has(action.name)) {
                tools.set(action.name, listedActionToGetToolResponse(action, integration));
            }
        }

        const sorted = [...tools.values()]
            .filter((tool) => afterName === undefined || tool.name > afterName)
            .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
        const page = sorted.slice(0, limit);
        const last = page.at(-1);
        res.status(200).send({ data: page, next_cursor: sorted.length > limit && last ? encodeCursor(last.name) : null });
    } catch (err) {
        tracer.scope().active()?.setTag('error', err);
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to list tools' } });
    }
});
