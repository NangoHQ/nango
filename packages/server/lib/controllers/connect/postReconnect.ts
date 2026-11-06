import * as z from 'zod';

import { EndUserMapper } from '@nangohq/shared';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { connectionIdSchema, providerConfigKeySchema } from '../../helpers/validation.js';
import * as connectSessionService from '../../services/connectSession.service.js';
import { asyncWrapperWithEnvironment } from '../../utils/asyncWrapper.js';
import { mapDeprecatedConnectionConfigWebhookUrl } from './mapDeprecatedConnectionConfigWebhookUrl.js';
import { createConnectSessionErrorToHttp, bodySchema as originalBodySchema, toIntegrationsConfigDefaults } from './postSessions.js';

import type { PostPublicConnectSessionsReconnect } from '@nangohq/types';

const bodySchema = z
    .object({
        connection_id: connectionIdSchema,
        integration_id: providerConfigKeySchema,
        end_user: originalBodySchema.shape.end_user.optional(),
        organization: originalBodySchema.shape.organization,
        integrations_config_defaults: originalBodySchema.shape.integrations_config_defaults,
        overrides: originalBodySchema.shape.overrides.optional(),
        webhook_url_override: originalBodySchema.shape.webhook_url_override,
        tags: originalBodySchema.shape.tags
    })
    .strict();

export const postConnectSessionsReconnect = asyncWrapperWithEnvironment<PostPublicConnectSessionsReconnect>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const val = bodySchema.safeParse(req.body);
    if (!val.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(val.error) } });
        return;
    }

    const { account, environment, plan } = res.locals;
    const mapped = mapDeprecatedConnectionConfigWebhookUrl(val.data);
    if (!mapped.ok) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP({ issues: mapped.issues }) } });
        return;
    }
    const body: PostPublicConnectSessionsReconnect['Body'] = mapped.body;

    const result = await connectSessionService.createConnectSession({
        account,
        environment,
        plan,
        endUser: body.end_user ? EndUserMapper.apiToEndUser(body.end_user, body.organization) : null,
        tags: body.tags,
        integrationsConfigDefaults: toIntegrationsConfigDefaults(body.integrations_config_defaults),
        overrides: body.overrides,
        webhookUrlOverride: body.webhook_url_override,
        reconnect: { connectionId: body.connection_id, integrationId: body.integration_id }
    });
    if (result.isErr()) {
        const { status, response } = createConnectSessionErrorToHttp(result.error);
        res.status(status).send(response);
        return;
    }

    res.status(201).send({
        data: {
            token: result.value.token,
            connect_link: result.value.connectLink,
            expires_at: result.value.expiresAt.toISOString()
        }
    });
});
