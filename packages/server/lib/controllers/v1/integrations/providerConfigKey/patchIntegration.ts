import * as z from 'zod';

import { configService, connectionService, getProvider } from '@nangohq/shared';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { validationParams } from './getIntegration.js';
import {
    integrationDisplayNameSchema,
    integrationForwardWebhooksSchema,
    privateKeySchema,
    providerConfigKeySchema,
    publicKeySchema
} from '../../../../helpers/validation.js';
import { asyncWrapper } from '../../../../utils/asyncWrapper.js';

import type { PatchIntegration } from '@nangohq/types';

const validationBody = z
    .object({
        integrationId: providerConfigKeySchema.optional(),
        webhookSecret: z.union([z.string().min(0).max(255), publicKeySchema]).optional(),
        displayName: integrationDisplayNameSchema.optional(),
        forward_webhooks: integrationForwardWebhooksSchema
    })
    .strict()
    .or(
        z.discriminatedUnion(
            'authType',
            [
                z
                    .object({
                        authType: z.enum(['OAUTH1', 'OAUTH2', 'TBA']),
                        clientId: z.string().min(1).max(255).optional(),
                        clientSecret: z.string().min(1).optional(),
                        scopes: z.union([z.string().regex(/^[0-9a-zA-Z:/_. -]+(,[0-9a-zA-Z:/_. -]+)*$/), z.string().max(0)]).optional()
                    })
                    .strict(),
                z
                    .object({
                        authType: z.enum(['APP']),
                        appId: z.string().min(1).max(255).optional(),
                        appLink: z.string().min(1).optional(),
                        privateKey: privateKeySchema.optional()
                    })
                    .strict(),
                z
                    .object({
                        authType: z.enum(['CUSTOM']),
                        clientId: z.string().min(1).max(255).optional(),
                        clientSecret: z.string().min(1).optional(),
                        appId: z.string().min(1).max(255).optional(),
                        appLink: z.string().min(1).optional(),
                        privateKey: privateKeySchema.optional()
                    })
                    .strict(),
                z
                    .object({
                        authType: z.enum(['MCP_OAUTH2']),
                        scopes: z.union([z.string().regex(/^[0-9a-zA-Z:/_. -]+(,[0-9a-zA-Z:/_. -]+)*$/), z.string().max(0)]).optional()
                    })
                    .strict(),
                z
                    .object({
                        authType: z.enum(['MCP_OAUTH2_GENERIC']),
                        clientName: z.string().min(1).max(255).optional(),
                        clientUri: z.url().max(255).optional(),
                        clientLogoUri: z.url().max(255).optional()
                    })
                    .strict(),
                z
                    .object({
                        authType: z.enum(['INSTALL_PLUGIN']),
                        appLink: z.url().max(255).optional(),
                        username: z.string().min(1).max(255).optional(),
                        password: z.string().min(1).max(255).optional()
                    })
                    .strict()
            ],
            { error: () => ({ message: 'invalid credentials object' }) }
        )
    );

export const patchIntegration = asyncWrapper<PatchIntegration>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req, { withEnv: true });
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const valParams = validationParams.safeParse(req.params);
    if (!valParams.success) {
        res.status(400).send({
            error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(valParams.error) }
        });
        return;
    }

    const valBody = validationBody.safeParse(req.body);
    if (!valBody.success) {
        res.status(400).send({
            error: { code: 'invalid_body', errors: zodErrorToHTTP(valBody.error) }
        });
        return;
    }

    const { environment } = res.locals;
    const params: PatchIntegration['Params'] = valParams.data;

    const integration = await configService.getProviderConfig(params.providerConfigKey, environment.id);
    if (!integration) {
        res.status(404).send({ error: { code: 'not_found', message: 'Integration does not exist' } });
        return;
    }

    const provider = getProvider(integration.provider);
    if (!provider) {
        res.status(404).send({ error: { code: 'not_found', message: `Unknown provider ${integration.provider}` } });
        return;
    }

    const body: PatchIntegration['Body'] = valBody.data;

    // Integration ID
    if ('integrationId' in body && body.integrationId) {
        const exists = await configService.getIdByProviderConfigKey(environment.id, body.integrationId);
        if (exists && exists !== integration.id) {
            res.status(400).send({ error: { code: 'invalid_body', message: 'integrationId is already used by another integration' } });
            return;
        }

        const count = await connectionService.countConnections({ environmentId: environment.id, providerConfigKey: params.providerConfigKey });
        if (count > 0) {
            res.status(400).send({ error: { code: 'invalid_body', message: "Can't rename an integration with active connections" } });
            return;
        }

        integration.unique_key = body.integrationId;
    }

    // Custom display name
    if ('displayName' in body && body.displayName) {
        integration.display_name = body.displayName;
    }

    // Forward webhooks
    if ('forward_webhooks' in body && body.forward_webhooks !== undefined) {
        integration.forward_webhooks = body.forward_webhooks;
    }

    // Credentials
    if ('authType' in body) {
        if (body.authType !== provider.auth_mode) {
            res.status(400).send({ error: { code: 'invalid_body', message: 'incompatible credentials auth type and provider auth' } });
            return;
        }

        if (body.authType === 'OAUTH1' || body.authType === 'OAUTH2' || body.authType === 'TBA') {
            if (body.clientId !== undefined) {
                integration.oauth_client_id = body.clientId;
            }
            if (body.clientSecret !== undefined) {
                integration.oauth_client_secret = body.clientSecret;
            }
            if (body.scopes !== undefined) {
                integration.oauth_scopes = body.scopes || '';
            }
        } else if (body.authType === 'APP') {
            if (body.appId !== undefined) {
                integration.oauth_client_id = body.appId;
            }
            if (body.privateKey !== undefined) {
                // This is a legacy thing
                integration.oauth_client_secret = Buffer.from(body.privateKey).toString('base64');
            }
            if (body.appLink !== undefined) {
                integration.app_link = body.appLink;
            }
        } else if (body.authType === 'CUSTOM') {
            if (body.clientId !== undefined) {
                integration.oauth_client_id = body.clientId;
            }
            if (body.clientSecret !== undefined) {
                integration.oauth_client_secret = body.clientSecret;
            }
            if (body.appLink !== undefined) {
                integration.app_link = body.appLink;
            }
            // This is a legacy thing
            integration.custom = {
                ...integration.custom,
                ...(body.appId !== undefined && { app_id: body.appId }),
                ...(body.privateKey !== undefined && { private_key: Buffer.from(body.privateKey).toString('base64') })
            };
        } else if (body.authType === 'MCP_OAUTH2') {
            if (body.scopes !== undefined) {
                integration.oauth_scopes = body.scopes || '';
            }
        } else if (body.authType === 'MCP_OAUTH2_GENERIC') {
            const { clientName, clientUri, clientLogoUri } = body;
            if (clientName || clientUri || clientLogoUri) {
                integration.custom = {
                    ...integration.custom,
                    ...(clientName && { oauth_client_name: clientName }),
                    ...(clientUri && { oauth_client_uri: clientUri }),
                    ...(clientLogoUri && { oauth_client_logo_uri: clientLogoUri })
                };
            }
        } else if (body.authType === 'INSTALL_PLUGIN') {
            const { username, password, appLink } = body;
            if (appLink) {
                integration.app_link = appLink;
            }
            if (username || password) {
                integration.custom = {
                    ...integration.custom,
                    ...(username && { username: username }),
                    ...(password && { password: password })
                };
            }
        }
    }

    // webhook secrets
    if ('webhookSecret' in body) {
        if (!integration.custom) {
            integration.custom = {};
        }
        if (!body.webhookSecret) {
            delete integration.custom['webhookSecret'];
        } else {
            integration.custom['webhookSecret'] = body.webhookSecret;
        }
    }

    await configService.editProviderConfig(integration, provider);
    res.status(200).send({
        data: {
            success: true
        }
    });
});
