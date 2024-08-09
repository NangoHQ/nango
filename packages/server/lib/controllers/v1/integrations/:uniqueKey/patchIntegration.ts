import { asyncWrapper } from '../../../../utils/asyncWrapper.js';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';
import type { PatchIntegration } from '@nangohq/types';
import { configService } from '@nangohq/shared';
import { z } from 'zod';

import { validationParams } from './getIntegration.js';

const validationBody = z
    .object({
        integrationId: validationParams.shape.integrationId.optional()
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
                        privateKey: z.string().startsWith('-----BEGIN RSA PRIVATE KEY----')
                    })
                    .strict(),
                z
                    .object({
                        authType: z.enum(['CUSTOM']),
                        clientId: z.string().min(1).max(255),
                        clientSecret: z.string().min(1),
                        appId: z.string().min(1).max(255),
                        appLink: z.string().min(1),
                        privateKey: z.string().startsWith('-----BEGIN RSA PRIVATE KEY----')
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

    const integration = await configService.getProviderConfig(params.integrationId, environment.id);
    if (!integration) {
        res.status(404).send({ error: { code: 'not_found', message: 'Integration does not exist' } });
        return;
    }

    const body: PatchIntegration['Body'] = valBody.data;

    const copy = { ...integration };
    // Rename
    if ('integrationId' in body && body.integrationId) {
        const exists = await configService.getIdByProviderConfigKey(environment.id, body.integrationId);
        if (exists && exists !== integration.id) {
            res.status(400).send({ error: { code: 'invalid_body', message: 'integrationId is already used by another integration' } });
            return;
        }

        copy.unique_key = body.integrationId;
    }

    // Credentials
    if ('authType' in body) {
        if (body.authType === 'OAUTH1' || body.authType === 'OAUTH2' || body.authType === 'TBA') {
            copy.oauth_client_id = body.clientId;
            copy.oauth_client_secret = body.clientSecret;
            copy.oauth_scopes = body.scopes || '';
        } else if (body.authType === 'APP') {
            copy.oauth_client_id = body.appId;
            copy.oauth_client_secret = body.privateKey;
            copy.app_link = body.appLink;
        } else if (body.authType === 'CUSTOM') {
            copy.oauth_client_id = body.clientId;
            copy.oauth_client_secret = body.clientSecret;
            copy.oauth_client_id = body.appId;
            copy.app_link = body.appLink;
            copy.custom = { private_key: body.privateKey };
        }
    }

    const update = await configService.editProviderConfig(copy);

    res.status(200).send({
        data: {
            success: update > 0
        }
    });
});
