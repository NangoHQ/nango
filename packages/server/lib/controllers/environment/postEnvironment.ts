import * as z from 'zod';

import db from '@nangohq/database';
import { environmentService, externalWebhookService, getPlan } from '@nangohq/shared';
import { flagHasPlan, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { envSchema } from '../../helpers/validation.js';
import { asyncWrapper } from '../../utils/asyncWrapper.js';
import { sendCreateEnvironmentError } from './sendCreateEnvironmentError.js';

import type { DBPlan, PostPublicEnvironment } from '@nangohq/types';

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

    let plan: DBPlan | undefined;
    if (flagHasPlan) {
        const planRes = await getPlan(db.knex, { accountId: account.id });
        if (planRes.isErr()) {
            res.status(500).send({ error: { code: 'server_error', message: 'Unable to get plan' } });
            return;
        }
        plan = planRes.value;
    }

    let otlp_settings: { endpoint: string; headers: Record<string, string> } | undefined;
    if (body.otlp_endpoint !== undefined || body.otlp_headers !== undefined) {
        const headers: Record<string, string> = {};
        for (const header of body.otlp_headers ?? []) {
            headers[header.name] = header.value;
        }
        otlp_settings = { endpoint: body.otlp_endpoint ?? '', headers };
    }

    if (otlp_settings && flagHasPlan && !plan?.has_otel) {
        res.status(403).send({
            error: {
                code: 'forbidden',
                message: 'OpenTelemetry export is not available for your account. Check if your Nango plan includes access to this feature.'
            }
        });
        return;
    }

    const created = await environmentService.createEnvironment(db.knex, {
        accountId: account.id,
        name: body.name,
        ...(body.is_production !== undefined && { isProduction: body.is_production }),
        ...(body.callback_url !== undefined && { callbackUrl: body.callback_url }),
        ...(body.hmac_key !== undefined && { hmacKey: body.hmac_key }),
        ...(body.hmac_enabled !== undefined && { hmacEnabled: body.hmac_enabled }),
        ...(body.slack_notifications !== undefined && { slackNotifications: body.slack_notifications }),
        ...(otlp_settings !== undefined && { otlpSettings: otlp_settings }),
        ...(plan && { plan })
    });
    if (created.isErr()) {
        sendCreateEnvironmentError(res, created.error);
        return;
    }

    const environment = created.value;

    await externalWebhookService.update(db.knex, {
        environment_id: environment.id,
        data: {
            on_auth_creation: true,
            on_auth_refresh_error: true,
            on_sync_completion_always: true,
            on_sync_error: true
        }
    });

    res.status(200).send({ data: { id: environment.id, name: environment.name } });
});
