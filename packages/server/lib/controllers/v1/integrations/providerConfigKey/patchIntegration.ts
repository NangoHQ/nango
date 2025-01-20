import { asyncWrapper } from '../../../../utils/asyncWrapper.js';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';
import type { PatchIntegration } from '@nangohq/types';
import { configService, connectionService } from '@nangohq/shared';
import { z } from 'zod';

import { providerConfigKeySchema } from '../../../../helpers/validation.js';
import { validationParams } from './getIntegration.js';

const privateKey = z.string().startsWith('-----BEGIN RSA PRIVATE KEY----').endsWith('-----END RSA PRIVATE KEY-----');
const validationBody = z
    .object({
        integrationId: providerConfigKeySchema.optional(),
        webhookSecret: z.string().min(0).max(255).optional()
    })
    .strict()
    .or(
        z.discriminatedUnion(
            'authType',
            [
                z
                    .object({
                        authType: z.enum(['OAUTH1', 'OAUTH2', 'TBA']),
                        clientId: z.string().min(1).max(255),
                        clientSecret: z.string().min(1),
                        scopes: z.string().optional()
                    })
                    .strict(),
                z
                    .object({
                        authType: z.enum(['APP']),
                        appId: z.string().min(1).max(255),
                        appLink: z.string().min(1),
                        privateKey
                    })
                    .strict(),
                z
                    .object({
                        authType: z.enum(['CUSTOM']),
                        clientId: z.string().min(1).max(255),
                        clientSecret: z.string().min(1),
                        appId: z.string().min(1).max(255),
                        appLink: z.string().min(1),
                        privateKey
                    })
                    .strict()
            ],
            { errorMap: () => ({ message: 'invalid credentials object' }) }
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

    const body: PatchIntegration['Body'] = valBody.data;

    // Rename
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

    // Credentials
    if ('authType' in body) {
        if (body.authType === 'OAUTH1' || body.authType === 'OAUTH2' || body.authType === 'TBA') {
            integration.oauth_client_id = body.clientId;
            integration.oauth_client_secret = body.clientSecret;
            integration.oauth_scopes = body.scopes || '';
        } else if (body.authType === 'APP') {
            integration.oauth_client_id = body.appId;
            // This is a legacy thing
            integration.oauth_client_secret = Buffer.from(body.privateKey).toString('base64');
            integration.app_link = body.appLink;
        } else if (body.authType === 'CUSTOM') {
            integration.oauth_client_id = body.clientId;
            integration.oauth_client_secret = body.clientSecret;
            integration.app_link = body.appLink;
            // This is a legacy thing
            integration.custom = { app_id: body.appId, private_key: Buffer.from(body.privateKey).toString('base64') };
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

    const update = await configService.editProviderConfig(integration);

    res.status(200).send({
        data: {
            success: update > 0
        }
    });
});
