import * as z from 'zod';

import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { envSchema } from '../../helpers/validation.js';
import { asyncWrapper } from '../../utils/asyncWrapper.js';
import { handlePostEnvironment } from '../shared/environments/postEnvironment.js';

import type { PostPublicEnvironment } from '@nangohq/types';

const validationBody = z
    .object({
        name: envSchema,
        is_production: z.boolean().optional(),
        callback_url: z.string().url().optional(),
        hmac_key: z.string().min(0).max(1000).optional(),
        hmac_enabled: z.boolean().optional(),
        slack_notifications: z.boolean().optional(),
        otlp_endpoint: z.string().url().or(z.literal('')).optional(),
        otlp_headers: z
            .array(z.object({ name: z.string().min(1).max(256), value: z.string().min(1).max(4000) }))
            .max(100)
            .optional()
    })
    .strict();

export const postPublicEnvironment = asyncWrapper<PostPublicEnvironment>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const valBody = validationBody.safeParse(req.body);
    if (!valBody.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(valBody.error) } });
        return;
    }

    const body: PostPublicEnvironment['Body'] = valBody.data;
    const account = res.locals.account;
    if (!account) {
        res.status(500).send({ error: { code: 'server_error', message: 'Account context is required' } });
        return;
    }

    let otlpSettings: { endpoint: string; headers: Record<string, string> } | undefined;
    if (body.otlp_endpoint !== undefined || body.otlp_headers !== undefined) {
        const headers: Record<string, string> = {};
        for (const header of body.otlp_headers ?? []) {
            headers[header.name] = header.value;
        }
        otlpSettings = { endpoint: body.otlp_endpoint ?? '', headers };
    }

    await handlePostEnvironment({
        res,
        accountId: account.id,
        name: body.name,
        ...(body.is_production !== undefined && { isProduction: body.is_production }),
        ...(body.callback_url !== undefined && { callbackUrl: body.callback_url }),
        ...(body.hmac_key !== undefined && { hmacKey: body.hmac_key }),
        ...(body.hmac_enabled !== undefined && { hmacEnabled: body.hmac_enabled }),
        ...(body.slack_notifications !== undefined && { slackNotifications: body.slack_notifications }),
        ...(otlpSettings !== undefined && { otlpSettings })
    });
});
