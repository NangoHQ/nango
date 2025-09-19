import * as z from 'zod';

import { configService, getProvider, mcpClient, sharedCredentialsService } from '@nangohq/shared';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { integrationToApi } from '../../../formatters/integration.js';
import { providerSchema } from '../../../helpers/validation.js';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';

import type { IntegrationConfig, PostIntegration } from '@nangohq/types';

const validationBody = z
    .object({
        provider: providerSchema,
        useSharedCredentials: z.boolean()
    })
    .strict();

export const postIntegration = asyncWrapper<PostIntegration>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req, { withEnv: true });
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const valBody = validationBody.safeParse(req.body);
    if (!valBody.success) {
        res.status(400).send({
            error: { code: 'invalid_body', errors: zodErrorToHTTP(valBody.error) }
        });
        return;
    }

    const body: PostIntegration['Body'] = valBody.data;
    const provider = getProvider(body.provider);
    if (!provider) {
        res.status(400).send({
            error: { code: 'invalid_body', message: 'invalid provider' }
        });
        return;
    }

    const { environment, account } = res.locals;

    let integration: IntegrationConfig;
    if (body.useSharedCredentials) {
        const result = await sharedCredentialsService.createPreprovisionedProvider({ providerName: body.provider, environment_id: environment.id, provider });
        if (result.isErr()) {
            res.status(400).send({
                error: { code: 'invalid_body', message: result.error.message }
            });
            return;
        }
        integration = result.value;
    } else if (provider.auth_mode === 'MCP_OAUTH2') {
        const client_id = await mcpClient.registerClientId({ provider, environment, team: account });
        integration = await configService.createEmptyProviderConfigWithCreds(body.provider, environment.id, provider, client_id, '');
    } else {
        integration = await configService.createEmptyProviderConfig(body.provider, environment.id, provider);
    }

    res.status(200).send({
        data: integrationToApi(integration)
    });
});
