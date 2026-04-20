import tracer from 'dd-trace';
import * as z from 'zod';

import { getHeaders, metrics, redactHeaders, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { runAction } from './runAction.js';
import { connectionIdSchema, providerConfigKeySchema, syncNameSchema } from '../../helpers/validation.js';
import { asyncWrapper } from '../../utils/asyncWrapper.js';

import type { PostPublicTriggerAction } from '@nangohq/types';

const schemaHeaders = z.object({
    'provider-config-key': providerConfigKeySchema,
    'connection-id': connectionIdSchema,
    'x-async': z.stringbool().optional().default(false),
    'x-max-retries': z.coerce.number().min(0).max(5).optional().default(0)
});

const schemaBody = z.object({
    action_name: syncNameSchema,
    input: z.unknown()
});

export const postPublicTriggerAction = asyncWrapper<PostPublicTriggerAction>(async (req, res) => {
    const valHeaders = schemaHeaders.safeParse(req.headers);
    if (!valHeaders.success) {
        res.status(400).send({ error: { code: 'invalid_headers', errors: zodErrorToHTTP(valHeaders.error) } });
        return;
    }

    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const valBody = schemaBody.safeParse(req.body);
    if (!valBody.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(valBody.error) } });
        return;
    }

    const { account, environment } = res.locals;
    metrics.increment(metrics.Types.ACTION_INCOMING_PAYLOAD_SIZE_BYTES, req.rawBody ? Buffer.byteLength(req.rawBody) : 0, { accountId: account.id });

    await tracer.trace<Promise<void>>('server.sync.triggerAction', async (span) => {
        const { input, action_name }: PostPublicTriggerAction['Body'] = valBody.data;
        const headers: PostPublicTriggerAction['Headers'] = valHeaders.data;

        const logCtx = await runAction({
            account: account,
            environment: environment,
            connectionId: headers['connection-id'],
            providerConfigKey: headers['provider-config-key'],
            actionName: action_name,
            input,
            isAsync: headers['x-async']!,
            retryMax: headers['x-max-retries']!,
            res,
            span
        });

        const reqHeaders = getHeaders(req.headers);
        const responseHeaders = getHeaders(res.getHeaders());
        await logCtx?.enrichOperation({
            request: {
                url: `${req.protocol}://${req.get('host')}${req.originalUrl}`,
                method: req.method,
                headers: redactHeaders({ headers: reqHeaders })
            },
            response: {
                code: res.statusCode,
                headers: redactHeaders({ headers: responseHeaders })
            }
        });
    });
});
