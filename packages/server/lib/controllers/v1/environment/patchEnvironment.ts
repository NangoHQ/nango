import tracer from 'dd-trace';
import * as z from 'zod';

import db from '@nangohq/database';
import { environmentService, productTracking } from '@nangohq/shared';
import { flagHasPlan, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { principalCan } from '../../../authz/principal.js';
import { environmentToApi } from '../../../formatters/environment.js';
import { envSchema } from '../../../helpers/validation.js';
import { asyncWrapperWithEnvironment } from '../../../utils/asyncWrapper.js';
import { sendUpdateEnvironmentError as sendError } from '../../shared/environments/updateEnvironmentErrors.js';

import type { UpdateEnvironmentSettings } from '@nangohq/shared';
import type { PatchEnvironment } from '@nangohq/types';

const validationBody = z
    .object({
        name: envSchema.optional(),
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

export const patchEnvironment = asyncWrapperWithEnvironment<PatchEnvironment>(async (req, res) => {
    const { account, environment, plan } = res.locals;
    tracer.scope().active()?.setTag('nango.accountId', account.id).setTag('nango.environmentUuid', environment.uuid);

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

    if (Object.keys(body).length === 0) {
        res.status(400).send({ error: { code: 'invalid_body', message: 'Nothing to update' } });
        return;
    }
    if (body.is_production !== undefined && !principalCan(res.locals, 'account:environments:set_production')) {
        res.status(403).json({ error: { code: 'forbidden', message: 'You do not have permission to toggle the production flag' } });
        return;
    }
    const hasOtlpSettings = body.otlp_endpoint !== undefined || body.otlp_headers !== undefined;
    if (hasOtlpSettings && flagHasPlan && !plan!.has_otel) {
        res.status(403).send({
            error: {
                code: 'forbidden',
                message: 'OpenTelemetry export is not available for your account. Check if your Nango plan includes access to this feature.'
            }
        });
        return;
    }
    const updated = await environmentService.updateEnvironment(db.knex, makeUpdateEnvironmentSettings(account.id, environment.uuid, body));
    if (updated.isErr()) {
        sendError(res, updated.error);
        return;
    }

    productTracking.track({ name: 'environments:environment_update', eventProperties: { section: 'settings' } });
    res.status(200).send({ data: environmentToApi(updated.value) });
});

function makeUpdateEnvironmentSettings(accountId: number, environmentUuid: string, body: PatchEnvironment['Body']): UpdateEnvironmentSettings {
    return {
        accountId,
        environmentUuid,
        ...(body.name !== undefined && { name: body.name }),
        ...(body.is_production !== undefined && { isProduction: body.is_production }),
        ...(body.callback_url !== undefined && { callbackUrl: body.callback_url }),
        ...(body.hmac_key !== undefined && { hmacKey: body.hmac_key }),
        ...(body.hmac_enabled !== undefined && { hmacEnabled: body.hmac_enabled }),
        ...(body.slack_notifications !== undefined && { slackNotifications: body.slack_notifications }),
        ...((body.otlp_endpoint !== undefined || body.otlp_headers !== undefined) && {
            otlpSettings: {
                ...(body.otlp_endpoint !== undefined && { endpoint: body.otlp_endpoint }),
                ...(body.otlp_headers !== undefined && { headers: Object.fromEntries(body.otlp_headers.map(({ name, value }) => [name, value])) })
            }
        })
    };
}
