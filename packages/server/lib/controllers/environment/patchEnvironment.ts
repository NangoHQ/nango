import tracer from 'dd-trace';
import * as z from 'zod';

import db from '@nangohq/database';
import { environmentService, externalWebhookService, getPlan, UpdateEnvironmentError } from '@nangohq/shared';
import { flagHasPlan, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { principalCan } from '../../authz/principal.js';
import { envSchema, webhookUrlSchema } from '../../helpers/validation.js';
import { asyncWrapper } from '../../utils/asyncWrapper.js';
import { sendUpdateEnvironmentError as sendError } from '../shared/environments/updateEnvironmentErrors.js';

import type { UpdateEnvironmentSettings } from '@nangohq/shared';
import type { PatchPublicEnvironment } from '@nangohq/types';

const validationParams = z.object({ environmentUuid: z.uuid() }).strict();
const validationBody = z
    .object({
        name: envSchema.optional(),
        is_production: z.boolean().optional(),
        callback_url: z.string().url().optional(),
        slack_notifications: z.boolean().optional(),
        otlp_endpoint: z.string().url().or(z.literal('')).optional(),
        otlp_headers: z
            .array(z.object({ name: z.string().min(1).max(256), value: z.string().min(1).max(4000) }))
            .max(100)
            .optional(),
        webhooks: z
            .object({
                primary_url: webhookUrlSchema.nullable(),
                secondary_url: webhookUrlSchema.nullable(),
                on_sync_completion_always: z.boolean().optional(),
                on_auth_creation: z.boolean().optional(),
                on_auth_refresh_error: z.boolean().optional(),
                on_sync_error: z.boolean().optional(),
                on_async_action_completion: z.boolean().optional(),
                on_connection_deletion: z.boolean().optional()
            })
            .strict()
            .optional()
    })
    .strict();

export const patchPublicEnvironment = asyncWrapper<PatchPublicEnvironment>(async (req, res) => {
    const account = res.locals.account;
    const span = tracer.scope().active();
    span?.setTag('nango.accountId', account.id);

    const query = requireEmptyQuery(req);
    if (query) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(query.error) } });
        return;
    }

    const params = validationParams.safeParse(req.params);
    if (!params.success) {
        res.status(400).send({ error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(params.error) } });
        return;
    }

    span?.setTag('nango.environmentUuid', params.data.environmentUuid);

    const valBody = validationBody.safeParse(req.body);
    if (!valBody.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(valBody.error) } });
        return;
    }

    const body = valBody.data;

    const { webhooks, otlp_endpoint, otlp_headers, ...settings } = body;
    const hasOtlpSettings = otlp_endpoint !== undefined || otlp_headers !== undefined;
    if (Object.keys(settings).length === 0 && !hasOtlpSettings && !Object.keys(webhooks ?? {}).length) {
        res.status(400).send({ error: { code: 'invalid_body', message: 'Nothing to update' } });
        return;
    }

    if (hasOtlpSettings && flagHasPlan) {
        const plan = await getPlan(db.knex, { accountId: account.id });
        if (plan.isErr()) {
            span?.setTag('error', plan.error);
            res.status(500).send({ error: { code: 'server_error', message: 'Unable to get plan' } });
            return;
        }
        if (!plan.value.has_otel) {
            res.status(403).send({
                error: {
                    code: 'forbidden',
                    message: 'OpenTelemetry export is not available for your account. Check if your Nango plan includes access to this feature.'
                }
            });
            return;
        }
    }

    if (settings.is_production !== undefined && !principalCan(res.locals, 'account:environments:set_production')) {
        res.status(403).json({ error: { code: 'forbidden', message: 'Insufficient scope. Required: account:environments:set_production' } });
        return;
    }

    try {
        await db.knex.transaction(async (trx) => {
            const updated = await environmentService.updateEnvironment(trx, makeUpdateEnvironmentSettings(account.id, params.data.environmentUuid, body));
            if (updated.isErr()) {
                throw updated.error;
            }

            const webhookSettings = Object.fromEntries(Object.entries(webhooks ?? {}).filter(([, value]) => value !== undefined));
            if (Object.keys(webhookSettings).length > 0) {
                const updatedWebhooks = await externalWebhookService.upsert(trx, { environment_id: updated.value.id, data: webhookSettings });
                if (updatedWebhooks.isErr()) {
                    throw updatedWebhooks.error;
                }
            }
        });
    } catch (err) {
        const error = err instanceof UpdateEnvironmentError ? err : new UpdateEnvironmentError('update_failed', { cause: err });
        sendError(res, error);
        return;
    }
    res.status(200).send({ success: true });
});

function makeUpdateEnvironmentSettings(accountId: number, environmentUuid: string, body: z.infer<typeof validationBody>): UpdateEnvironmentSettings {
    const { otlp_endpoint, otlp_headers, ...settings } = body;
    const hasOtlpSettings = otlp_endpoint !== undefined || otlp_headers !== undefined;
    return {
        accountId,
        environmentUuid,
        ...(settings.name !== undefined && { name: settings.name }),
        ...(settings.is_production !== undefined && { isProduction: settings.is_production }),
        ...(settings.callback_url !== undefined && { callbackUrl: settings.callback_url }),
        ...(settings.slack_notifications !== undefined && { slackNotifications: settings.slack_notifications }),
        ...(hasOtlpSettings && {
            otlpSettings: {
                ...(otlp_endpoint !== undefined && { endpoint: otlp_endpoint }),
                ...(otlp_headers !== undefined && { headers: Object.fromEntries(otlp_headers.map(({ name, value }) => [name, value])) })
            }
        })
    };
}
