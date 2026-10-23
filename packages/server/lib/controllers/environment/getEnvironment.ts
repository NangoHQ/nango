import tracer from 'dd-trace';
import { omit } from 'lodash-es';
import * as z from 'zod';

import db from '@nangohq/database';
import { customerKeyService, environmentService, externalWebhookService, getGlobalOAuthCallbackUrl } from '@nangohq/shared';
import { zodErrorToHTTP } from '@nangohq/utils';

import { principalCan } from '../../authz/principal.js';
import { asyncWrapper } from '../../utils/asyncWrapper.js';

import type { GetPublicEnvironment } from '@nangohq/types';

const validationParams = z.object({ environmentUuid: z.uuid() }).strict();
const validationQuery = z.object({ with_secrets: z.enum(['true', 'false']).optional() }).strict();

export const getPublicEnvironment = asyncWrapper<GetPublicEnvironment>(async (req, res) => {
    const query = validationQuery.safeParse(req.query);
    if (!query.success) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(query.error) } });
        return;
    }
    const params = validationParams.safeParse(req.params);
    if (!params.success) {
        res.status(400).send({ error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(params.error) } });
        return;
    }

    const withSecrets = query.data.with_secrets === 'true';
    if (withSecrets && !principalCan(res.locals, 'account:environments:read_secret')) {
        res.status(403).send({ error: { code: 'forbidden', message: 'Insufficient scope. Required: account:environments:read_secret' } });
        return;
    }

    const account = res.locals.account;
    if (!account) {
        res.status(500).send({ error: { code: 'server_error', message: 'Account context is required' } });
        return;
    }
    const environment = await environmentService.getByUuidWithoutSecrets(params.data.environmentUuid, account.id);
    if (!environment) {
        res.status(404).send({ error: { code: 'not_found', message: 'Environment not found' } });
        return;
    }

    const span = tracer.scope().active();
    span?.setTag('nango.accountId', account.id).setTag('nango.environmentId', environment.id);

    const webhooks = await externalWebhookService.get(environment.id);
    if (!webhooks) {
        span?.setTag('error', new Error('Missing environment webhook configuration'));
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to retrieve webhook configuration' } });
        return;
    }

    const data: GetPublicEnvironment['Success']['data'] = {
        id: environment.id,
        uuid: environment.uuid,
        name: environment.name,
        is_production: environment.is_production,
        callback_url: environment.callback_url || getGlobalOAuthCallbackUrl(),
        slack_notifications: environment.slack_notifications,
        otlp_endpoint: environment.otlp_settings?.endpoint ?? null,
        webhooks: omit(webhooks, ['id', 'environment_id', 'created_at', 'updated_at'])
    };

    if (withSecrets) {
        const signingKey = await customerKeyService.getUncachedWebhookSigningKeyForEnv(db.knex, environment.id);
        if (signingKey.isErr()) {
            span?.setTag('error', signingKey.error);
            res.status(500).send({ error: { code: 'server_error', message: 'Failed to retrieve webhook signing key' } });
            return;
        }
        data.webhooks.signing_key = signingKey.value;
        data.otlp_headers = Object.entries(environment.otlp_settings?.headers ?? {}).map(([name, value]) => ({ name, value }));
    }

    res.status(200).send({ data });
});
