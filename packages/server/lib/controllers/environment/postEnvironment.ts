import * as z from 'zod';

import db from '@nangohq/database';
import { environmentService, getGlobalOAuthCallbackUrl, getPlan, PROD_ENVIRONMENT_NAME } from '@nangohq/shared';
import { flagHasPlan, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { principalCan } from '../../authz/principal.js';
import { envSchema, webhookUrlSchema } from '../../helpers/validation.js';
import { asyncWrapper } from '../../utils/asyncWrapper.js';
import { sendPostEnvironmentError } from '../shared/environments/postEnvironmentErrors.js';

import type { CreateEnvironmentSettings } from '@nangohq/shared';
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
            .optional(),
        webhooks: z
            .object({
                primary_url: webhookUrlSchema,
                secondary_url: webhookUrlSchema,
                on_sync_completion_always: z.boolean().optional(),
                on_auth_creation: z.boolean().optional(),
                on_auth_refresh_error: z.boolean().optional(),
                on_sync_error: z.boolean().optional(),
                on_async_action_completion: z.boolean().optional(),
                on_connection_deletion: z.boolean().optional(),
                signing_key: z.uuid().optional()
            })
            .strict()
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

    const createsProductionEnvironment = body.is_production === true || (body.name === PROD_ENVIRONMENT_NAME && body.is_production !== false);
    if (createsProductionEnvironment && !principalCan(res.locals, 'account:environments:set_production')) {
        res.status(403).json({
            error: { code: 'forbidden', message: 'Insufficient scope. Required: account:environments:set_production' }
        });
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

    const settings = makeCreateEnvironmentSettings(account.id, body, plan);

    if (settings.otlpSettings && flagHasPlan && !plan?.has_otel) {
        res.status(403).send({
            error: {
                code: 'forbidden',
                message: 'OpenTelemetry export is not available for your account. Check if your Nango plan includes access to this feature.'
            }
        });
        return;
    }

    const created = await environmentService.createEnvironment(db.knex, settings);
    if (created.isErr()) {
        sendPostEnvironmentError(res, created.error);
        return;
    }

    const { environment, webhooks: webhookSettings, webhookSigningKey } = created.value;
    res.status(200).send({
        data: {
            id: environment.id,
            uuid: environment.uuid,
            name: environment.name,
            is_production: environment.is_production,
            callback_url: environment.callback_url || getGlobalOAuthCallbackUrl(),
            slack_notifications: environment.slack_notifications,
            otlp_endpoint: environment.otlp_settings?.endpoint ?? null,
            otlp_headers: Object.entries(environment.otlp_settings?.headers ?? {}).map(([name, value]) => ({ name, value })),
            webhooks: {
                primary_url: webhookSettings.primary_url,
                secondary_url: webhookSettings.secondary_url,
                on_sync_completion_always: webhookSettings.on_sync_completion_always,
                on_auth_creation: webhookSettings.on_auth_creation,
                on_auth_refresh_error: webhookSettings.on_auth_refresh_error,
                on_sync_error: webhookSettings.on_sync_error,
                on_async_action_completion: webhookSettings.on_async_action_completion,
                on_connection_deletion: webhookSettings.on_connection_deletion,
                signing_key: webhookSigningKey
            }
        }
    });
});

function makeCreateEnvironmentSettings(accountId: number, body: PostPublicEnvironment['Body'], plan?: DBPlan): CreateEnvironmentSettings {
    let otlpSettings: CreateEnvironmentSettings['otlpSettings'];
    if (body.otlp_endpoint !== undefined || body.otlp_headers !== undefined) {
        const headers: Record<string, string> = {};
        for (const header of body.otlp_headers ?? []) {
            headers[header.name] = header.value;
        }
        otlpSettings = { endpoint: body.otlp_endpoint ?? '', headers };
    }

    const { signing_key, ...webhookSettings } = body.webhooks ?? {};
    const webhooks = Object.fromEntries(Object.entries(webhookSettings).filter(([, value]) => value !== undefined));
    return {
        accountId,
        name: body.name,
        ...(plan && { plan }),
        ...(body.is_production !== undefined && { isProduction: body.is_production }),
        ...(body.callback_url !== undefined && { callbackUrl: body.callback_url }),
        ...(body.hmac_key !== undefined && { hmacKey: body.hmac_key }),
        ...(body.hmac_enabled !== undefined && { hmacEnabled: body.hmac_enabled }),
        ...(body.slack_notifications !== undefined && { slackNotifications: body.slack_notifications }),
        ...(otlpSettings !== undefined && { otlpSettings }),
        ...(signing_key !== undefined && { webhookSigningKey: signing_key }),
        webhooks
    };
}
