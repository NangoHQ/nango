import * as z from 'zod';

import { EndUserMapper } from '@nangohq/shared';
import { getLogger, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { connectionTagsSchema, endUserSchema, providerConfigKeySchema, webhookUrlSchema } from '../../helpers/validation.js';
import * as connectSessionService from '../../services/connectSession.service.js';
import { asyncWrapperWithEnvironment } from '../../utils/asyncWrapper.js';
import { mapDeprecatedConnectionConfigWebhookUrl } from './mapDeprecatedConnectionConfigWebhookUrl.js';

import type { RequestLocalsWithEnvironment } from '../../utils/express.js';
import type { ConnectSessionInput, ConnectSessionIntegrationConfigDefaults, DBPlan, PostConnectSessions } from '@nangohq/types';
import type { Response } from 'express';

const logger = getLogger('Server.Connect.PostSessions');

export const bodySchema = z
    .object({
        end_user: endUserSchema,
        organization: z
            .object({
                id: z.string().max(255).min(0),
                display_name: z.string().max(255).optional()
            })
            .strict()
            .optional(),
        allowed_integrations: z.array(providerConfigKeySchema).optional(),
        integrations_config_defaults: z
            .record(
                providerConfigKeySchema,
                z
                    .object({
                        user_scopes: z.string().optional(),
                        authorization_params: z.record(z.string(), z.string()).optional(),
                        connection_config: z
                            .looseObject({
                                oauth_scopes_override: z.string().optional()
                            })
                            .optional()
                    })
                    .strict()
            )
            .optional(),
        overrides: z
            .record(
                providerConfigKeySchema,
                z.object({
                    docs_connect: z.string().optional()
                })
            )
            .optional(),
        webhook_url_override: webhookUrlSchema,
        tags: connectionTagsSchema.optional()
    })
    .strict();

const bodySchemaWithTagsNoEndUser = bodySchema
    .extend({
        end_user: endUserSchema.optional(),
        tags: connectionTagsSchema
    })
    .strict();

interface Reply {
    status: number;
    response: PostConnectSessions['Reply'];
}

export const postConnectSessions = asyncWrapperWithEnvironment<PostConnectSessions>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const { plan } = res.locals;

    const val = bodySchema.safeParse(req.body);
    if (val.success) {
        const body: PostConnectSessions['Body'] = val.data;
        await generateSession(res, body, plan);
        return;
    }

    const bodyIsObject = req.body && typeof req.body === 'object' && !Array.isArray(req.body);
    const hasTopLevelTags = bodyIsObject && 'tags' in req.body;
    const hasEndUser = bodyIsObject && 'end_user' in req.body;
    if (hasTopLevelTags && !hasEndUser) {
        const valWithTagsNoEndUser = bodySchemaWithTagsNoEndUser.safeParse(req.body);
        if (!valWithTagsNoEndUser.success) {
            res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(valWithTagsNoEndUser.error) } });
            return;
        }

        const body: PostConnectSessions['Body'] = valWithTagsNoEndUser.data;
        await generateSession(res, body, plan);
        return;
    }

    res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(val.error) } });
    return;
});

export async function generateSession(
    res: Response<any, RequestLocalsWithEnvironment>,
    body: PostConnectSessions['Body'],
    plan?: DBPlan | null,
    isPreview = false
) {
    const mapped = mapDeprecatedConnectionConfigWebhookUrl(body);
    if (!mapped.ok) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP({ issues: mapped.issues }) } });
        return;
    }
    body = mapped.body;

    const { account, environment } = res.locals;
    const endUser = body.end_user ? EndUserMapper.apiToEndUser(body.end_user, body.organization) : null;

    const result = await connectSessionService.createConnectSession({
        account,
        environment,
        plan: plan ?? null,
        isPreview,
        endUser,
        tags: body.tags,
        allowedIntegrations: body.allowed_integrations,
        integrationsConfigDefaults: toIntegrationsConfigDefaults(body.integrations_config_defaults),
        overrides: body.overrides,
        webhookUrlOverride: body.webhook_url_override
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
}

export function toIntegrationsConfigDefaults(
    defaults: ConnectSessionInput['integrations_config_defaults']
): Record<string, ConnectSessionIntegrationConfigDefaults> | undefined {
    if (!defaults) {
        return undefined;
    }

    return Object.fromEntries(
        Object.entries(defaults).map(([key, value]) => [
            key,
            { user_scopes: value.user_scopes, authorization_params: value.authorization_params, connectionConfig: value.connection_config }
        ])
    );
}

export function createConnectSessionErrorToHttp(error: connectSessionService.CreateConnectSessionError): Reply {
    switch (error.code) {
        case 'connection_not_found':
            return { status: 400, response: { error: { code: 'invalid_body', message: error.message } } };
        case 'resource_capped':
            return { status: 400, response: { error: { code: 'resource_capped', message: error.message } } };
        case 'integration_not_found': {
            const issues: z.core.$ZodIssue[] = (error.missingIntegrations || []).map(({ integrationId, source, index }) => ({
                code: 'custom',
                message: 'Integration does not exist',
                input: integrationId,
                path:
                    source === 'allowedIntegrations'
                        ? ['allowed_integrations', index ?? 0]
                        : [source === 'integrationsConfigDefaults' ? 'integrations_config_defaults' : 'overrides', integrationId]
            }));
            return { status: 400, response: { error: { code: 'invalid_body', errors: zodErrorToHTTP({ issues }) } } };
        }
        case 'invalid_connection_config':
            return { status: 400, response: { error: { code: 'invalid_body', errors: zodErrorToHTTP({ issues: error.issues || [] }) } } };
        case 'docs_connect_override_forbidden':
            return { status: 403, response: { error: { code: 'forbidden', message: error.message } } };
        case 'token_creation_failed':
            return { status: 500, response: { error: { code: 'server_error', message: 'Failed to create session token' } } };
        case 'session_creation_failed':
            return { status: 500, response: { error: { code: 'server_error', message: 'Failed to create connect session' } } };
        default: {
            logger.error('Failed to create connect session', {
                code: error.code,
                message: error.message,
                cause: error.cause
            });
            return { status: 500, response: { error: { code: 'server_error', message: 'Failed to create connect session' } } };
        }
    }
}
