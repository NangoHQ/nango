import * as z from 'zod';

import { environmentService } from '@nangohq/shared';
import { flagHasPlan, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { environmentToApi } from '../../../formatters/environment.js';
import { envSchema } from '../../../helpers/validation.js';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';

import type { DBEnvironment, PatchEnvironment } from '@nangohq/types';

const validationBody = z
    .object({
        name: envSchema.optional(),
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

export const patchEnvironment = asyncWrapper<PatchEnvironment>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req, { withEnv: true });
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const valBody = validationBody.safeParse(req.body);
    if (!valBody.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(valBody.error) } });
        return;
    }

    const body: PatchEnvironment['Body'] = valBody.data;
    const { account, environment, plan } = res.locals;

    const data: Partial<DBEnvironment> = {};
    if (body.name) {
        const existingEnvironment = await environmentService.getByEnvironmentName(account.id, body.name);
        if (existingEnvironment && existingEnvironment.id !== environment.id) {
            res.status(409).send({ error: { code: 'conflict', message: 'An environment with this name already exists' } });
            return;
        }

        data.name = body.name;
    }
    if (typeof body.callback_url !== 'undefined') {
        data.callback_url = body.callback_url;
    }
    if (typeof body.hmac_key !== 'undefined') {
        data.hmac_key = body.hmac_key;
    }
    if (typeof body.hmac_enabled !== 'undefined') {
        data.hmac_enabled = body.hmac_enabled;
    }
    if (typeof body.slack_notifications !== 'undefined') {
        data.slack_notifications = body.slack_notifications;
    }
    if (typeof body.otlp_endpoint !== 'undefined') {
        data.otlp_settings = { headers: {}, ...environment.otlp_settings, endpoint: body.otlp_endpoint };
    }
    if (body.otlp_headers) {
        const headers: Record<string, string> = {};
        for (const header of body.otlp_headers) {
            headers[header.name] = header.value;
        }
        data.otlp_settings = { endpoint: '', ...environment.otlp_settings, headers };
    }

    if (data.otlp_settings && flagHasPlan) {
        if (!plan!.has_otel) {
            res.status(403).send({ error: { code: 'forbidden', message: 'OpenTelemetry export is not enabled for this account' } });
            return;
        }
    }

    if (Object.keys(data).length <= 0) {
        res.status(400).send({ error: { code: 'invalid_body', message: 'Nothing to update' } });
        return;
    }

    const updated = await environmentService.update({ accountId: environment.account_id, environmentId: environment.id, data });
    if (!updated) {
        res.status(500).send({ error: { code: 'server_error', message: 'failed to update environment' } });
        return;
    }

    res.status(200).send({ data: environmentToApi(updated) });
});
